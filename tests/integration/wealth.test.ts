import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createAccount } from "@/server/domain/accounts";
import { createAsset, getAsset, listAssets, multiply, valueAsset } from "@/server/domain/assets";
import { createDebt, payDebt } from "@/server/domain/debts";
import { recordTransaction, recordTransfer } from "@/server/domain/transactions";
import { dayTotals } from "@/server/domain/transaction-queries";
import { allocation, netWorthTrend, spendingByDay, wealthOf } from "@/server/domain/wealth";
import { categoryId, makeUser } from "./helpers";

const TODAY = "2026-10-27";

describe("assets", () => {
  it("values unit-based assets from a unit price and reports the gain", async () => {
    const actor = await makeUser();
    const { id } = await createAsset(actor, { name: "Emas Antam", kind: "GOLD", units: "10,5", purchaseValue: "12jt", purchasedOn: "2026-01-10" }, TODAY);
    expect((await getAsset(actor.userId, id)).value).toBe(12_000_000n);

    await valueAsset(actor, { assetId: id, valuedOn: "2026-10-01", unitPrice: "1,4jt" });
    const gold = await getAsset(actor.userId, id);
    expect(gold).toMatchObject({ value: 14_700_000n, unitPrice: 1_400_000n, gain: 2_700_000n, valuedOn: "2026-10-01", units: "10.5" });

    const { id: car } = await createAsset(actor, { name: "Motor", kind: "VEHICLE", purchaseValue: "25jt", currentValue: "18jt" }, TODAY);
    await expect(valueAsset(actor, { assetId: car, valuedOn: TODAY, unitPrice: 1 })).rejects.toMatchObject({ reason: "asset_units" });
    expect((await listAssets(actor.userId)).map((a) => [a.name, a.value, a.gain])).toEqual([
      ["Motor", 18_000_000n, -7_000_000n],
      ["Emas Antam", 14_700_000n, 2_700_000n],
    ]);
    await expect(createAsset(actor, { name: "motor", kind: "OTHER" }, TODAY)).rejects.toMatchObject({ reason: "name_taken" });
  });

  it("multiplies decimal units exactly, rounding half up", () => {
    expect(multiply("10.5", 1_400_000n)).toBe(14_700_000n);
    expect(multiply("0.00012345", 1_000_000_000n)).toBe(123_450n);
    expect(multiply("3", 333n)).toBe(999n);
    expect(multiply("0.5", 3n)).toBe(2n);
  });
});

describe("net worth", () => {
  it("adds assets and receivables, subtracts credit balances and unlinked debts, and trends by month", async () => {
    const actor = await makeUser();
    const { id: bca } = await createAccount(actor, { name: "BCA", type: "BANK", openingBalance: "10jt", openingDate: "2026-05-01" });
    await createAccount(actor, { name: "Kartu kredit", type: "CREDIT_CARD", openingBalance: "-2jt", openingDate: "2026-05-01" });
    const { id: gold } = await createAsset(actor, { name: "Emas", kind: "GOLD", units: 5, purchaseValue: "6jt", purchasedOn: "2026-06-15" }, TODAY);
    await valueAsset(actor, { assetId: gold, valuedOn: "2026-09-30", value: "7jt" });
    const { id: loan } = await createDebt(actor, { name: "Pinjam ke Ani", direction: "BORROWED", principal: "3jt", firstDueOn: "2026-12-01" });
    await createDebt(actor, { name: "Dipinjam Budi", direction: "LENT", principal: "1jt", firstDueOn: "2026-12-01" });
    await db.debt.updateMany({ where: { userId: actor.userId }, data: { createdAt: new Date("2026-08-01") } });
    await recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: "500rb", bookedOn: "2026-10-05", description: "x" });
    await payDebt(actor, { debtId: loan, paidOn: "2026-10-20", amount: "1jt", accountId: bca }, TODAY);

    const w = await wealthOf(actor.userId, TODAY);
    expect(w).toMatchObject({ cash: 8_500_000n, assets: 7_000_000n, receivables: 1_000_000n, accountDebt: 2_000_000n, debts: 2_000_000n });
    expect(w.netWorth).toBe(8_500_000n + 7_000_000n + 1_000_000n - 2_000_000n - 2_000_000n);

    const trend = await netWorthTrend(actor.userId, TODAY, 6);
    expect(trend.map((p) => [p.month, p.netWorth])).toEqual([
      ["2026-05", 8_000_000n],
      ["2026-06", 14_000_000n],
      ["2026-07", 14_000_000n],
      ["2026-08", 12_000_000n],
      ["2026-09", 13_000_000n],
      ["2026-10", w.netWorth],
    ]);
  });
});

describe("dashboard figures", () => {
  it("splits spending into needs and wants, with tags overriding categories", async () => {
    const actor = await makeUser();
    const { id: bca } = await createAccount(actor, { name: "BCA", type: "BANK", openingDate: "2026-09-01" });
    const spend = (amount: string, name: string | null, bookedOn = "2026-10-10") =>
      recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount, bookedOn, description: "x", categoryId: name ? undefined : undefined }).then(async (r) => {
        if (name) await db.transaction.update({ where: { id: r.id }, data: { categoryId: await categoryId(actor, name) } });
        return r;
      });
    await recordTransaction(actor, { accountId: bca, kind: "INCOME", amount: "10jt", bookedOn: "2026-10-01", description: "Gaji" });
    await spend("3jt", "Rumah");
    await spend("1jt", "Hiburan");
    const { id: treat } = await spend("500rb", "Belanja harian");
    await db.transaction.update({ where: { id: treat }, data: { necessity: "WANT" } });
    await spend("200rb", "Lain-lain");
    await spend("100rb", null, "2026-10-26");

    expect(await allocation(actor.userId, "2026-10")).toEqual({ income: 10_000_000n, needs: 3_000_000n, wants: 1_500_000n, unclassified: 300_000n, savings: 5_200_000n });

    const days = await spendingByDay(actor.userId, TODAY, 7);
    expect(days.map((d) => d.day)).toEqual(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
    expect(days[5].total).toBe(100_000n);
  });
});

describe("need/want on record", () => {
  it("stores a tag given when recording and ignores it on income", async () => {
    const actor = await makeUser();
    const { id: bca } = await createAccount(actor, { name: "BCA", type: "BANK", openingDate: "2026-09-01" });
    await recordTransaction(actor, { accountId: bca, kind: "INCOME", amount: "5jt", bookedOn: "2026-10-01", description: "Gaji", necessity: "NEED" });
    const { id } = await recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: "45rb", bookedOn: "2026-10-10", description: "x", categoryId: await categoryId(actor, "Belanja harian"), necessity: "WANT" });
    expect((await db.transaction.findUniqueOrThrow({ where: { id } })).necessity).toBe("WANT");
    expect(await db.transaction.count({ where: { userId: actor.userId, necessity: { not: null } } })).toBe(1);
    expect(await allocation(actor.userId, "2026-10")).toMatchObject({ needs: 0n, wants: 45_000n });
  });
});

describe("day totals", () => {
  it("sums whole days under the list's filters and leaves transfers out", async () => {
    const actor = await makeUser();
    const { id: bca } = await createAccount(actor, { name: "BCA", type: "BANK", openingBalance: "1jt", openingDate: "2026-09-01" });
    const { id: gopay } = await createAccount(actor, { name: "GoPay", type: "EWALLET", openingDate: "2026-09-01" });
    const add = (kind: "INCOME" | "EXPENSE", amount: string, bookedOn: string, accountId = bca) => recordTransaction(actor, { accountId, kind, amount, bookedOn, description: "x" });
    await add("EXPENSE", "20rb", "2026-10-27");
    await add("EXPENSE", "30rb", "2026-10-27", gopay);
    await add("INCOME", "100rb", "2026-10-27");
    await add("EXPENSE", "5rb", "2026-10-26");
    await recordTransfer(actor, { fromAccountId: bca, toAccountId: gopay, amount: "200rb", bookedOn: "2026-10-27" });

    const all = await dayTotals(actor.userId, {}, ["2026-10-27", "2026-10-26", "2026-10-25"]);
    expect(Object.fromEntries(all)).toEqual({
      "2026-10-27": { income: 100_000n, expense: 50_000n },
      "2026-10-26": { income: 0n, expense: 5_000n },
      "2026-10-25": { income: 0n, expense: 0n },
    });
    const onlyBca = await dayTotals(actor.userId, { accountId: bca }, ["2026-10-27"]);
    expect(onlyBca.get("2026-10-27")).toEqual({ income: 100_000n, expense: 20_000n });
  });
});
