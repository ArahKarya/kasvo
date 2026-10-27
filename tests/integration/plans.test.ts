import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createAccount, getAccount } from "@/server/domain/accounts";
import { contributeToGoal, createGoal, getGoal, listGoals, removeContribution } from "@/server/domain/goals";
import { createDebt, debtsDue, getDebt, payDebt, removeDebtPayment } from "@/server/domain/debts";
import { recordTransaction, recordTransfer } from "@/server/domain/transactions";
import { categoryId, makeUser } from "./helpers";

const TODAY = "2026-10-27";

async function backdate(goalId: string, day: string) {
  await db.goal.update({ where: { id: goalId }, data: { createdAt: new Date(`${day}T00:00:00Z`) } });
}

describe("goals", () => {
  it("tracks a manual goal from contributions and judges its pace", async () => {
    const actor = await makeUser();
    const { id } = await createGoal(actor, { name: "Dana darurat", targetAmount: "12jt", targetDate: "2027-06-30" });
    await backdate(id, "2026-06-01");
    await contributeToGoal(actor, { goalId: id, amount: "2jt", bookedOn: "2026-06-10" });
    await contributeToGoal(actor, { goalId: id, amount: "3jt", bookedOn: "2026-09-10" });
    const { id: wd } = await contributeToGoal(actor, { goalId: id, amount: "-500rb", bookedOn: "2026-10-01" });

    const goal = await getGoal(actor.userId, id, TODAY);
    expect(goal.progress).toMatchObject({ saved: 4_500_000n, remaining: 7_500_000n, monthsLeft: 8, state: "behind" });
    expect(goal.contributions).toHaveLength(3);

    await removeContribution(actor, wd);
    expect((await getGoal(actor.userId, id, TODAY)).progress.saved).toBe(5_000_000n);
  });

  it("follows a linked account's balance and refuses manual contributions", async () => {
    const actor = await makeUser();
    const { id: bca } = await createAccount(actor, { name: "BCA", type: "BANK", openingBalance: "10jt", openingDate: "2026-01-01" });
    const { id: saving } = await createAccount(actor, { name: "Tabungan rumah", type: "BANK", openingBalance: "1jt", openingDate: "2026-01-01" });
    const { id } = await createGoal(actor, { name: "DP rumah", targetAmount: "5jt", accountId: saving });
    await recordTransfer(actor, { fromAccountId: bca, toAccountId: saving, amount: "4jt", bookedOn: "2026-10-01" });

    const [goal] = await listGoals(actor.userId, TODAY);
    expect(goal).toMatchObject({ accountName: "Tabungan rumah", progress: { saved: 5_000_000n, state: "achieved" } });
    await expect(contributeToGoal(actor, { goalId: id, amount: 1, bookedOn: TODAY })).rejects.toMatchObject({ reason: "goal_linked" });
    await expect(createGoal(actor, { name: "dp RUMAH", targetAmount: 1 })).rejects.toMatchObject({ reason: "name_taken" });
  });
});

describe("debts", () => {
  it("records instalments as expenses, tracks the schedule, and undoes a payment", async () => {
    const actor = await makeUser();
    const { id: bca } = await createAccount(actor, { name: "BCA", type: "BANK", openingBalance: "20jt", openingDate: "2026-01-01" });
    const { id } = await createDebt(actor, { name: "Kredit motor", direction: "BORROWED", principal: "12jt", instalmentCount: 12, firstDueOn: "2026-08-25", annualRate: "9,5" });

    const debt = await getDebt(actor.userId, id, TODAY);
    expect(debt).toMatchObject({ instalmentAmount: 1_000_000n, annualRate: 9.5 });
    expect(debt.status).toMatchObject({ state: "overdue", overdueCount: 3, totalDue: 12_000_000n });

    const first = await payDebt(actor, { debtId: id, paidOn: "2026-08-25", accountId: bca }, TODAY);
    expect(first.amount).toBe(1_000_000n);
    const tx = await db.transaction.findUniqueOrThrow({ where: { id: first.transactionId! } });
    expect(tx).toMatchObject({ amount: -1_000_000n, description: "Cicilan Kredit motor 1/12", categoryId: await categoryId(actor, "Cicilan") });

    await payDebt(actor, { debtId: id, paidOn: "2026-09-25", amount: "2jt", accountId: bca }, TODAY);
    expect((await getDebt(actor.userId, id, TODAY)).status).toMatchObject({ paidCount: 3, outstanding: 9_000_000n, state: "active" });
    expect((await getAccount(actor.userId, bca)).balance).toBe(17_000_000n);

    const undone = await removeDebtPayment(actor, first.id);
    expect(undone.transactionsDeleted).toBe(1);
    expect((await getDebt(actor.userId, id, TODAY)).status.paidCount).toBe(2);
    expect((await getAccount(actor.userId, bca)).balance).toBe(18_000_000n);
  });

  it("pays through a linked loan account as a transfer, so spending is not counted twice", async () => {
    const actor = await makeUser();
    const { id: bca } = await createAccount(actor, { name: "BCA", type: "BANK", openingBalance: "5jt", openingDate: "2026-01-01" });
    const { id: kpr } = await createAccount(actor, { name: "KPR BTN", type: "LOAN", openingBalance: "-300jt", openingDate: "2026-01-01" });
    const { id } = await createDebt(actor, { name: "KPR", direction: "BORROWED", principal: "300jt", instalmentAmount: "3,2jt", instalmentCount: 180, firstDueOn: "2026-11-05", accountId: kpr });

    const paid = await payDebt(actor, { debtId: id, paidOn: "2026-11-05", accountId: bca }, "2026-11-01");
    expect(paid.status).toMatchObject({ paidCount: 1, state: "active" });
    const legs = await db.transaction.findMany({ where: { userId: actor.userId }, orderBy: { amount: "asc" } });
    expect(legs.map((l) => [l.accountId, l.amount])).toEqual([[bca, -3_200_000n], [kpr, 3_200_000n]]);
    expect(legs[0].transferId).toBe(legs[1].transferId);

    const { id: bank } = await createAccount(actor, { name: "Mandiri", type: "BANK", openingDate: "2026-01-01" });
    await expect(createDebt(actor, { name: "X", direction: "BORROWED", principal: 1, firstDueOn: TODAY, accountId: bank })).rejects.toMatchObject({ reason: "account_type" });
  });

  it("links an imported transaction once, checks its direction, and stops counting it when deleted", async () => {
    const actor = await makeUser();
    const { id: bca } = await createAccount(actor, { name: "BCA", type: "BANK", openingBalance: "5jt", openingDate: "2026-01-01" });
    const { id } = await createDebt(actor, { name: "Pinjam Budi", direction: "LENT", counterparty: "Budi", principal: "2jt", firstDueOn: "2026-10-30" });
    expect((await debtsDue(actor.userId, TODAY)).map((d) => d.name)).toEqual(["Pinjam Budi"]);

    const { id: incoming } = await recordTransaction(actor, { accountId: bca, kind: "INCOME", amount: "500rb", bookedOn: "2026-10-20", description: "TRSF BUDI" });
    const { id: outgoing } = await recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: "50rb", bookedOn: "2026-10-20", description: "kopi" });
    await expect(payDebt(actor, { debtId: id, transactionId: outgoing }, TODAY)).rejects.toMatchObject({ reason: "payment_direction" });

    const linked = await payDebt(actor, { debtId: id, transactionId: incoming }, TODAY);
    expect(linked).toMatchObject({ amount: 500_000n, transactionId: incoming });
    await expect(payDebt(actor, { debtId: id, transactionId: incoming }, TODAY)).rejects.toMatchObject({ reason: "already_linked" });
    expect((await getDebt(actor.userId, id, TODAY)).status.outstanding).toBe(1_500_000n);

    await db.transaction.update({ where: { id: incoming }, data: { deletedAt: new Date() } });
    expect((await getDebt(actor.userId, id, TODAY)).status.outstanding).toBe(2_000_000n);

    await payDebt(actor, { debtId: id, paidOn: TODAY, amount: "2jt" }, TODAY);
    await expect(payDebt(actor, { debtId: id, paidOn: TODAY }, TODAY)).rejects.toMatchObject({ reason: "debt_settled" });
    expect(await debtsDue(actor.userId, TODAY)).toEqual([]);
  });
});
