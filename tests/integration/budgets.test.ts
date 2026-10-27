import { describe, expect, it } from "vitest";
import { createAccount } from "@/server/domain/accounts";
import { budgetStatus, copyBudgets, setBudget } from "@/server/domain/budgets";
import { createCategory } from "@/server/domain/categories";
import { recordTransaction, recordTransfer } from "@/server/domain/transactions";
import { categoryId, makeUser } from "./helpers";

describe("budgets", () => {
  it("tracks spending against budgets, covers subcategories, and lists unbudgeted spending", async () => {
    const actor = await makeUser();
    const { id: bca } = await createAccount(actor, { name: "BCA", type: "BANK", openingBalance: "10jt", openingDate: "2026-07-01" });
    const { id: gopay } = await createAccount(actor, { name: "GoPay", type: "EWALLET", openingDate: "2026-07-01" });
    const food = await categoryId(actor, "Makan & minum");
    const { id: coffee } = await createCategory(actor, { name: "Kopi", kind: "EXPENSE", parentId: food });
    const fun = await categoryId(actor, "Hiburan");
    const spend = (amount: number, categoryId: string | undefined, bookedOn: string) =>
      recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount, bookedOn, description: "x", categoryId });

    await spend(600_000, food, "2026-10-03");
    await spend(150_000, coffee, "2026-10-05");
    await spend(300_000, fun, "2026-10-06");
    await spend(50_000, undefined, "2026-10-07");
    await spend(900_000, food, "2026-09-10");
    await recordTransfer(actor, { fromAccountId: bca, toAccountId: gopay, amount: 1_000_000, bookedOn: "2026-10-08" });

    await setBudget(actor, { categoryId: food, month: "2026-10", amount: "1jt" });
    const status = await budgetStatus(actor.userId, "2026-10", "2026-10-15");
    const [line] = status.lines;
    expect(line).toMatchObject({ name: "Makan & minum", spent: 750_000n, state: "warning", average: 300_000n });
    expect(status.totalSpending).toBe(1_100_000n);
    expect(status.spentInBudgets).toBe(750_000n);
    expect(status.unbudgeted.map((u) => [u.name, u.spent])).toEqual([["Hiburan", 300_000n], ["(uncategorized)", 50_000n]]);
  });

  it("removes a budget with 0, rejects income categories, and copies only missing months", async () => {
    const actor = await makeUser();
    const food = await categoryId(actor, "Makan & minum");
    const fun = await categoryId(actor, "Hiburan");
    await setBudget(actor, { categoryId: food, month: "2026-10", amount: 1_000_000 });
    await setBudget(actor, { categoryId: fun, month: "2026-10", amount: 300_000 });
    await setBudget(actor, { categoryId: fun, month: "2026-11", amount: 500_000 });
    await expect(setBudget(actor, { categoryId: await categoryId(actor, "Gaji", "INCOME"), month: "2026-10", amount: 1 })).rejects.toThrow(/expense/);

    expect(await copyBudgets(actor, "2026-10", "2026-11")).toBe(1);
    const nov = await budgetStatus(actor.userId, "2026-11", "2026-10-27");
    expect(nov.lines.map((l) => [l.name, l.amount])).toEqual(expect.arrayContaining([["Hiburan", 500_000n], ["Makan & minum", 1_000_000n]]));

    await setBudget(actor, { categoryId: food, month: "2026-11", amount: 0 });
    expect((await budgetStatus(actor.userId, "2026-11", "2026-10-27")).lines).toHaveLength(1);
  });
});
