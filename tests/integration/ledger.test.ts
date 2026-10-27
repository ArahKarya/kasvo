import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createAccount, getAccount, listAccounts, setAccountArchived, updateAccount } from "@/server/domain/accounts";
import { createCategory, listCategories } from "@/server/domain/categories";
import {
  deleteTransactions,
  editTransaction,
  recordTransaction,
  recordTransfer,
  restoreTransactions,
} from "@/server/domain/transactions";
import { findTransactions, getTransaction } from "@/server/domain/transaction-queries";
import { getOverview } from "@/server/domain/overview";
import { DomainError } from "@/server/domain/errors";
import { categoryId, makeUser } from "./helpers";

const DAY = "2026-10-15";

async function setup() {
  const actor = await makeUser();
  const bca = await createAccount(actor, { name: "BCA", type: "BANK", openingBalance: "1jt", openingDate: "2026-10-01" });
  const gopay = await createAccount(actor, { name: "GoPay", type: "EWALLET", openingDate: "2026-10-01" });
  return { actor, bca: bca.id, gopay: gopay.id };
}

describe("accounts", () => {
  it("derives balance from opening balance and live transactions", async () => {
    const { actor, bca } = await setup();
    await recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: "25rb", bookedOn: DAY, description: "Kopi" });
    await recordTransaction(actor, { accountId: bca, kind: "INCOME", amount: 5_000_000, bookedOn: DAY, description: "Gaji" });
    expect((await getAccount(actor.userId, bca)).balance).toBe(1_000_000n - 25_000n + 5_000_000n);
  });

  it("rejects duplicate names case-insensitively", async () => {
    const { actor } = await setup();
    await expect(createAccount(actor, { name: "bca", type: "BANK", openingDate: DAY })).rejects.toBeInstanceOf(DomainError);
  });

  it("hides archived accounts and blocks new transactions on them", async () => {
    const { actor, gopay } = await setup();
    await setAccountArchived(actor, gopay, true);
    expect((await listAccounts(actor.userId)).map((a) => a.name)).toEqual(["BCA"]);
    await expect(
      recordTransaction(actor, { accountId: gopay, kind: "EXPENSE", amount: 1000, bookedOn: DAY, description: "x" }),
    ).rejects.toThrow(/archived/);
  });

  it("does not let one user touch another user's account", async () => {
    const { bca } = await setup();
    const stranger = await makeUser();
    await expect(updateAccount(stranger, bca, { name: "Mine" })).rejects.toThrow(/not found/);
  });
});

describe("transactions", () => {
  it("stores expenses as negative amounts and checks the category kind", async () => {
    const { actor, bca } = await setup();
    const food = await categoryId(actor, "Makan & minum");
    const salary = await categoryId(actor, "Gaji", "INCOME");
    const { id } = await recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: "Rp45.000", bookedOn: DAY, description: "Makan siang", categoryId: food });
    expect((await getTransaction(actor.userId, id))?.amount).toBe(-45_000n);
    await expect(
      recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: 1000, bookedOn: DAY, description: "x", categoryId: salary }),
    ).rejects.toThrow(/income category/);
  });

  it("rejects zero, negative, and unparseable amounts", async () => {
    const { actor, bca } = await setup();
    for (const amount of [0, -5, "abc"]) {
      await expect(recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount, bookedOn: DAY, description: "x" })).rejects.toThrow();
    }
  });

  it("edits kind, amount, and clears a category that no longer fits", async () => {
    const { actor, bca } = await setup();
    const food = await categoryId(actor, "Makan & minum");
    const { id } = await recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: 10_000, bookedOn: DAY, description: "Refund?", categoryId: food });
    await expect(editTransaction(actor, id, { kind: "INCOME" })).rejects.toThrow(/expense category/);
    await editTransaction(actor, id, { kind: "INCOME", categoryId: null, amount: "12rb" });
    const row = await getTransaction(actor.userId, id);
    expect(row?.amount).toBe(12_000n);
    expect(row?.category).toBeNull();
  });

  it("soft-deletes and restores, and writes an audit row per change", async () => {
    const { actor, bca } = await setup();
    const { id } = await recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: 1000, bookedOn: DAY, description: "x" });
    expect(await deleteTransactions(actor, [id])).toBe(1);
    expect(await getTransaction(actor.userId, id)).toBeNull();
    expect(await restoreTransactions(actor, [id])).toBe(1);
    expect(await getTransaction(actor.userId, id)).not.toBeNull();
    const actions = (await db.auditLog.findMany({ where: { userId: actor.userId }, orderBy: { at: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["account.create", "account.create", "transaction.create", "transaction.delete", "transaction.restore"]);
  });

  it("marks rows recorded by an agent", async () => {
    const { actor, bca } = await setup();
    const agent = { ...actor, kind: "AGENT" as const, clientName: "claude-code" };
    const { id } = await recordTransaction(agent, { accountId: bca, kind: "EXPENSE", amount: 1000, bookedOn: DAY, description: "x" });
    const row = await getTransaction(actor.userId, id);
    expect(row?.source).toBe("AGENT");
    expect(row?.createdBy).toBe("claude-code");
  });
});

describe("transfers", () => {
  it("moves money without counting as income or spending, and charges the fee as an expense", async () => {
    const { actor, bca, gopay } = await setup();
    const fees = await categoryId(actor, "Biaya admin bank");
    const { ids } = await recordTransfer(actor, { fromAccountId: bca, toAccountId: gopay, amount: "200rb", fee: 1000, feeCategoryId: fees, bookedOn: DAY });
    expect(ids).toHaveLength(3);
    expect((await getAccount(actor.userId, bca)).balance).toBe(1_000_000n - 200_000n - 1_000n);
    expect((await getAccount(actor.userId, gopay)).balance).toBe(200_000n);

    const page = await findTransactions(actor.userId, { from: DAY, to: DAY });
    expect(page.income).toBe(0n);
    expect(page.expense).toBe(1_000n);
    const outLeg = page.items.find((t) => t.amount === -200_000n);
    expect(outLeg?.counterparty?.name).toBe("GoPay");

    const overview = await getOverview(actor.userId, "Asia/Jakarta");
    expect(overview.netWorth).toBe(1_000_000n - 1_000n);
  });

  it("deletes both legs together and refuses to edit the amount", async () => {
    const { actor, bca, gopay } = await setup();
    const { ids } = await recordTransfer(actor, { fromAccountId: bca, toAccountId: gopay, amount: 50_000, bookedOn: DAY });
    await expect(editTransaction(actor, ids[0], { amount: 1 })).rejects.toThrow(/cannot be edited/);
    await editTransaction(actor, ids[0], { description: "Top up GoPay" });
    expect((await getTransaction(actor.userId, ids[1]))?.description).toBe("Top up GoPay");
    expect(await deleteTransactions(actor, [ids[0]])).toBe(2);
    expect((await getAccount(actor.userId, gopay)).balance).toBe(0n);
  });

  it("rejects a transfer to the same account", async () => {
    const { actor, bca } = await setup();
    await expect(recordTransfer(actor, { fromAccountId: bca, toAccountId: bca, amount: 1, bookedOn: DAY })).rejects.toThrow();
  });
});

describe("queries", () => {
  it("filters by kind, uncategorized, text, and paginates", async () => {
    const { actor, bca } = await setup();
    const food = await categoryId(actor, "Makan & minum");
    for (let i = 0; i < 5; i++) {
      await recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: 1000 * (i + 1), bookedOn: DAY, description: `Kopi ${i}`, categoryId: i < 2 ? food : undefined });
    }
    await recordTransaction(actor, { accountId: bca, kind: "INCOME", amount: 9000, bookedOn: DAY, description: "Gaji", payee: "PT Maju" });

    expect((await findTransactions(actor.userId, { kind: "EXPENSE" })).total).toBe(5);
    expect((await findTransactions(actor.userId, { categoryId: "none", kind: "EXPENSE" })).total).toBe(3);
    expect((await findTransactions(actor.userId, { q: "maju" })).items[0].description).toBe("Gaji");
    const page2 = await findTransactions(actor.userId, { pageSize: 4, page: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.expense).toBe(15_000n);
  });
});

describe("categories", () => {
  it("creates one-level subcategories of the same kind only", async () => {
    const actor = await makeUser();
    const food = await categoryId(actor, "Makan & minum");
    const { id } = await createCategory(actor, { name: "Kopi", kind: "EXPENSE", parentId: food });
    await expect(createCategory(actor, { name: "Espresso", kind: "EXPENSE", parentId: id })).rejects.toThrow(/one level/);
    await expect(createCategory(actor, { name: "Bonus kopi", kind: "INCOME", parentId: food })).rejects.toThrow(/same kind/);
    expect((await listCategories(actor.userId)).some((c) => c.name === "Kopi" && c.parentId === food)).toBe(true);
  });
});
