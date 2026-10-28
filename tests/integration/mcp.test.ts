import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { db } from "@/server/db";
import { createAccount } from "@/server/domain/accounts";
import { createToken, revokeToken, verifyToken, type Scope } from "@/server/domain/tokens";
import { contextFor } from "@/mcp/context";
import { createKasvoServer } from "@/mcp/server";
import type { Actor } from "@/server/domain/actor";
import { makeUser } from "./helpers";

async function connect(actor: Actor, scopes: Scope[]) {
  const { token } = await createToken(actor, { name: "test-agent", scopes });
  const identity = await verifyToken(token);
  if (!identity) throw new Error("token did not verify");
  const server = createKasvoServer(await contextFor(identity));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "vitest", version: "0" });
  await client.connect(clientSide);
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool results are free-form JSON
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { text: string }[])[0].text;
  const body = JSON.parse(text);
  return result.isError ? { error: body } : body;
}

async function setup(scopes: Scope[] = ["destructive"]) {
  const actor = await makeUser();
  await createAccount(actor, { name: "BCA Gaji", type: "BANK", openingBalance: "2jt", openingDate: "2026-09-01" });
  await createAccount(actor, { name: "GoPay", type: "EWALLET", openingDate: "2026-09-01" });
  return { actor, client: await connect(actor, scopes) };
}

describe("mcp tokens and scopes", () => {
  it("exposes only the tools a token's scopes allow", async () => {
    const { client } = await setup(["read"]);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("kasvo_overview");
    expect(names).not.toContain("kasvo_record_transaction");
    expect(names).not.toContain("kasvo_confirm");
  });

  it("implies read and write for a destructive token", async () => {
    const { client } = await setup(["destructive"]);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["kasvo_overview", "kasvo_record_transaction", "kasvo_confirm"]));
  });

  it("rejects revoked and expired tokens", async () => {
    const actor = await makeUser();
    const { id, token } = await createToken(actor, { name: "x", scopes: ["read"] });
    expect(await verifyToken(token)).not.toBeNull();
    await revokeToken(actor, id);
    expect(await verifyToken(token)).toBeNull();

    const expiring = await createToken(actor, { name: "y", scopes: ["read"], expiresInDays: 1 });
    await db.apiToken.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await verifyToken(expiring.token)).toBeNull();
    expect(await verifyToken("kv_not-a-real-token")).toBeNull();
  });
});

describe("mcp write and read tools", () => {
  it("records with names and rupiah shorthand, and tags the agent in the audit log", async () => {
    const { actor, client } = await setup();
    const r = await call(client, "kasvo_record_transaction", {
      kind: "EXPENSE",
      amount: "45rb",
      account: "bca gaji",
      description: "Makan siang",
      category: "Makan & minum",
      date: "2026-10-10",
    });
    expect(r.id).toBeTruthy();
    const row = await db.transaction.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.amount).toBe(-45_000n);
    expect(row.source).toBe("AGENT");
    expect(row.createdBy).toBe("test-agent");
    const log = await db.auditLog.findFirstOrThrow({ where: { userId: actor.userId, action: "transaction.create" } });
    expect(log.actorKind).toBe("AGENT");
  });

  it("returns actionable errors instead of throwing", async () => {
    const { client } = await setup();
    const bad = await call(client, "kasvo_record_transaction", { kind: "EXPENSE", amount: "banyak", account: "BCA Gaji", description: "x" });
    expect(bad.error.code).toBe("INVALID");
    const ambiguous = await call(client, "kasvo_record_transaction", { kind: "EXPENSE", amount: 1000, account: "a", description: "x" });
    expect(ambiguous.error.code).toBe("NOT_FOUND");
    expect(ambiguous.error.hint).toMatch(/kasvo_list_accounts/);
  });

  it("records a batch with per-item results", async () => {
    const { client } = await setup();
    const r = await call(client, "kasvo_record_transactions", {
      items: [
        { kind: "EXPENSE", amount: 15000, account: "GoPay", description: "Kopi", date: "2026-10-11" },
        { kind: "EXPENSE", amount: "x", account: "GoPay", description: "Rusak" },
        { kind: "INCOME", amount: "8,5jt", account: "BCA Gaji", description: "Gaji", category: "Gaji", date: "2026-10-01" },
      ],
    });
    expect(r.recorded).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.results[1].error).toBeTruthy();
  });

  it("answers overview, breakdown, comparison, cash flow, and anomalies", async () => {
    const { client } = await setup();
    const spend = (amount: number, description: string, category: string, date: string) =>
      call(client, "kasvo_record_transaction", { kind: "EXPENSE", amount, account: "BCA Gaji", description, category, date });
    await spend(100_000, "Belanja", "Belanja harian", "2026-09-05");
    await spend(300_000, "Belanja", "Belanja harian", "2026-10-05");
    await spend(50_000, "Grab", "Transportasi", "2026-10-06");
    await spend(50_000, "Grab", "Transportasi", "2026-10-06");
    await call(client, "kasvo_record_transfer", { from: "BCA Gaji", to: "GoPay", amount: "100rb", date: "2026-10-07" });

    const overview = await call(client, "kasvo_overview");
    expect(overview.netWorth.value).toBe(2_000_000 - 500_000);
    expect(overview.accounts).toHaveLength(2);

    const breakdown = await call(client, "kasvo_spending_breakdown", { from: "2026-10-01", to: "2026-10-31" });
    expect(breakdown.total.value).toBe(400_000);
    expect(breakdown.groups[0]).toMatchObject({ label: "Belanja harian", sharePct: 75 });

    const cmp = await call(client, "kasvo_compare_periods", { aFrom: "2026-09-01", aTo: "2026-09-30", bFrom: "2026-10-01", bTo: "2026-10-31" });
    expect(cmp.change.value).toBe(300_000);
    expect(cmp.categories[0]).toMatchObject({ label: "Belanja harian", changePct: 200 });

    const flow = await call(client, "kasvo_cashflow", { from: "2026-09-01", to: "2026-10-31", interval: "month" });
    expect(flow.buckets.map((b: { spending: { value: number } }) => b.spending.value)).toEqual([100_000, 400_000]);

    const anomalies = await call(client, "kasvo_find_anomalies", { from: "2026-10-01", to: "2026-10-31" });
    expect(anomalies.possibleDuplicates).toHaveLength(1);
    expect(anomalies.possibleDuplicates[0].ids).toHaveLength(2);
  });

  it("categorizes in bulk and skips transfers", async () => {
    const { client } = await setup();
    const a = await call(client, "kasvo_record_transaction", { kind: "EXPENSE", amount: 1000, account: "GoPay", description: "Parkir" });
    const t = await call(client, "kasvo_record_transfer", { from: "BCA Gaji", to: "GoPay", amount: 5000 });
    const r = await call(client, "kasvo_categorize", { ids: [a.id, t.ids[0]], category: "Transportasi" });
    expect(r.updated).toBe(1);
    expect(r.failed[0].error).toMatch(/transfer/);
  });
});

describe("mcp destructive tools", () => {
  it("deletes only after confirm, once, and can be undone", async () => {
    const { client } = await setup();
    const a = await call(client, "kasvo_record_transaction", { kind: "EXPENSE", amount: 1000, account: "GoPay", description: "Salah input" });

    const pending = await call(client, "kasvo_delete_transactions", { ids: [a.id] });
    expect(pending.summary).toMatch(/Salah input/);
    expect(await db.transaction.count({ where: { id: a.id, deletedAt: null } })).toBe(1);

    const done = await call(client, "kasvo_confirm", { pendingId: pending.pendingId });
    expect(done.deleted).toBe(1);
    expect(await db.transaction.count({ where: { id: a.id, deletedAt: null } })).toBe(0);

    const again = await call(client, "kasvo_confirm", { pendingId: pending.pendingId });
    expect(again.error.code).toBe("NOT_FOUND");

    await call(client, "kasvo_restore_transactions", { ids: done.ids });
    expect(await db.transaction.count({ where: { id: a.id, deletedAt: null } })).toBe(1);
  });

  it("does not let another user's agent confirm someone else's pending action", async () => {
    const { client } = await setup();
    const a = await call(client, "kasvo_record_transaction", { kind: "EXPENSE", amount: 1000, account: "GoPay", description: "x" });
    const pending = await call(client, "kasvo_delete_transactions", { ids: [a.id] });
    const other = await setup();
    const stolen = await call(other.client, "kasvo_confirm", { pendingId: pending.pendingId });
    expect(stolen.error.code).toBe("NOT_FOUND");
    expect(await db.transaction.count({ where: { id: a.id, deletedAt: null } })).toBe(1);
  });
});

describe("mcp import tools", () => {
  it("stages a CSV, reviews, commits with a change, and reverts in two steps", async () => {
    const { readFileSync } = await import("node:fs");
    const { client } = await setup();
    const csv = readFileSync(new URL("../fixtures/statements/bca.csv", import.meta.url), "utf8");

    const rule = await call(client, "kasvo_create_rule", { contains: "indomaret", category: "Belanja harian" });
    expect(rule.matchesExisting).toBe(0);

    const staged = await call(client, "kasvo_stage_import", { account: "BCA Gaji", csv, fileName: "bca.csv" });
    expect(staged).toMatchObject({ status: "STAGED", rowCount: 5 });

    const review = await call(client, "kasvo_get_import", { importId: staged.batchId });
    expect(review.rows.filter((r: { category: string | null }) => r.category === "Belanja harian")).toHaveLength(2);
    const atm = review.rows.find((r: { description: string }) => r.description.startsWith("TARIKAN"));
    const fee = review.rows.find((r: { description: string }) => r.description === "BIAYA ADM");

    const committed = await call(client, "kasvo_commit_import", {
      importId: staged.batchId,
      changes: [{ rowId: atm.rowId, skip: true }, { rowId: fee.rowId, category: "Biaya admin bank" }],
    });
    expect(committed).toEqual({ committed: 4, skipped: 1 });

    const pending = await call(client, "kasvo_revert_import", { importId: staged.batchId });
    expect(pending.summary).toMatch(/remove 4 transaction/);
    expect(await db.transaction.count({ where: { importBatchId: staged.batchId, deletedAt: null } })).toBe(4);
    const done = await call(client, "kasvo_confirm", { pendingId: pending.pendingId });
    expect(done.deleted).toBe(4);
  });

  it("stages rows the agent extracted itself", async () => {
    const { client } = await setup();
    const staged = await call(client, "kasvo_stage_import", {
      account: "GoPay",
      fileName: "gopay-oktober.pdf",
      rows: [{ date: "2026-10-12", amount: "-23rb", description: "GoFood" }],
    });
    expect(staged).toMatchObject({ format: "agent", rowCount: 1 });
    expect((await call(client, "kasvo_commit_import", { importId: staged.batchId })).committed).toBe(1);
  });
});

describe("mcp budget tools", () => {
  it("sets budgets by name and reports status", async () => {
    const { client } = await setup();
    await call(client, "kasvo_record_transaction", { kind: "EXPENSE", amount: "300rb", account: "BCA Gaji", description: "Belanja", category: "Belanja harian", date: "2026-10-03" });
    const set = await call(client, "kasvo_set_budget", { month: "2026-10", budgets: [{ category: "Belanja harian", amount: "1jt" }, { category: "Hiburan", amount: 200000 }] });
    expect(set.set).toBe(2);
    const status = await call(client, "kasvo_budget_status", { month: "2026-10" });
    expect(status.budgeted.value).toBe(1_200_000);
    expect(status.budgets.find((b: { category: string }) => b.category === "Belanja harian")).toMatchObject({ usedPct: 30 });
    const copied = await call(client, "kasvo_copy_budgets", { from: "2026-10", to: "2026-11" });
    expect(copied.copied).toBe(2);
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toContain("budget_plan");
  });
});

describe("mcp goals and debts", () => {
  it("creates a goal and a debt, pays an instalment, and removes the payment in two steps", async () => {
    const { client } = await setup(["destructive"]);
    const goal = await call(client, "kasvo_create_goal", { name: "Liburan", target: "6jt", targetDate: "2099-12-31" });
    expect(goal).toMatchObject({ name: "Liburan", trackedBy: "manual contributions", state: "open" });
    const after = await call(client, "kasvo_contribute_goal", { goal: "liburan", amount: "1,5jt" });
    expect(after.saved.value).toBe(1_500_000);

    const debt = await call(client, "kasvo_create_debt", { name: "Paylater", direction: "BORROWED", principal: "3jt", instalmentCount: 3, firstDueOn: "2099-01-10", annualRatePct: 24 });
    expect(debt).toMatchObject({ instalment: { value: 1_000_000 }, instalments: "0/3 paid", annualRatePct: 24 });

    const paid = await call(client, "kasvo_pay_debt", { debt: "Paylater", account: "BCA Gaji" });
    expect(paid).toMatchObject({ amount: { value: 1_000_000 }, outstanding: { value: 2_000_000 }, next: "2099-02-10" });
    // Paying a debt moves money, it does not change net worth: 1jt cash − 2jt still owed.
    expect((await call(client, "kasvo_overview")).netWorth.value).toBe(-1_000_000);

    const detail = await call(client, "kasvo_get_debt", { debt: "Paylater" });
    expect(detail.schedule.map((l: { status: string }) => l.status)).toEqual(["paid", "upcoming", "upcoming"]);
    const pending = await call(client, "kasvo_remove_debt_payment", { paymentId: detail.payments[0].id });
    expect(pending.summary).toContain("delete the transaction booked with it");
    expect((await call(client, "kasvo_list_debts")).debts[0].instalments).toBe("1/3 paid");
    const done = await call(client, "kasvo_confirm", { pendingId: pending.pendingId });
    expect(done).toMatchObject({ transactionsDeleted: 1 });
    expect((await call(client, "kasvo_list_debts")).debts[0].instalments).toBe("0/3 paid");
    expect((await call(client, "kasvo_overview")).netWorth.value).toBe(-1_000_000);
  });

  it("explains a missing debt instead of failing silently", async () => {
    const { client } = await setup(["write"]);
    const r = await call(client, "kasvo_pay_debt", { debt: "nope", account: "BCA Gaji" });
    expect(r.error).toMatchObject({ code: "NOT_FOUND", hint: "Call kasvo_list_debts for names and ids." });
  });
});

describe("mcp 50/30/20, net worth, and category styles", () => {
  it("records with formulas and need/want, restyles a category, and reports the split and net worth", async () => {
    const { client } = await setup(["write"]);
    await call(client, "kasvo_record_transaction", { kind: "INCOME", amount: "10jt", account: "BCA Gaji", description: "Gaji" });
    const coffee = await call(client, "kasvo_record_transaction", { kind: "EXPENSE", amount: "25rb+10rb×2", account: "BCA Gaji", description: "Kopi", category: "Makan & minum", necessity: "WANT" });
    expect(coffee.id).toBeTruthy();
    await call(client, "kasvo_record_transaction", { kind: "EXPENSE", amount: "1jt", account: "BCA Gaji", description: "Kos", category: "Rumah" });
    await call(client, "kasvo_record_transaction", { kind: "EXPENSE", amount: "200rb", account: "BCA Gaji", description: "Lain", category: "Lain-lain" });

    const styled = await call(client, "kasvo_update_category", { category: "Lain-lain", necessity: "WANT", icon: "sparkles", color: "purple" });
    expect(styled).toMatchObject({ name: "Lain-lain", kind: "EXPENSE", icon: "sparkles", necessity: "WANT" });

    const split = await call(client, "kasvo_allocation", {});
    expect(split.needs.amount.value).toBe(1_000_000);
    expect(split.wants.amount.value).toBe(45_000 + 200_000);
    expect(split.savings.amount.value).toBe(10_000_000 - 1_245_000);
    expect(split.unclassified.value).toBe(0);

    const edited = await call(client, "kasvo_edit_transaction", { id: coffee.id, necessity: null });
    expect(edited.updated).toBe(true);
    expect((await call(client, "kasvo_allocation", {})).needs.amount.value).toBe(1_045_000);

    const nw = await call(client, "kasvo_net_worth", { months: 3 });
    expect(nw.trend).toHaveLength(3);
    expect(nw.netWorth.value).toBe(2_000_000 + 10_000_000 - 1_245_000);
    const cats = await call(client, "kasvo_list_categories", { kind: "EXPENSE" });
    expect(cats.categories.find((c: { name: string }) => c.name === "Rumah")).toMatchObject({ necessity: "NEED", icon: "home" });
  });
});
