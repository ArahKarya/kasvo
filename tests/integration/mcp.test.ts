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
