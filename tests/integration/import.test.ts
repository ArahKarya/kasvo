import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createAccount, getAccount } from "@/server/domain/accounts";
import { commitImport, discardImport, remapImport, revertImport, stageFile, stageRows } from "@/server/domain/import/service";
import { getImport } from "@/server/domain/import/queries";
import { applyRules, createRule, listRules, setRuleEnabled } from "@/server/domain/rules";
import { recordTransaction } from "@/server/domain/transactions";
import { categoryId, makeUser } from "./helpers";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/statements/${name}`, import.meta.url), "utf8");

async function setup() {
  const actor = await makeUser();
  const { id: bca } = await createAccount(actor, { name: "BCA", type: "BANK", openingBalance: "2jt", openingDate: "2026-09-30" });
  return { actor, bca };
}

describe("statement import", () => {
  it("stages, applies rules, commits, and skips everything on a re-import", async () => {
    const { actor, bca } = await setup();
    const groceries = await categoryId(actor, "Belanja harian");
    await createRule(actor, { contains: "indomaret", categoryId: groceries, setPayee: "Indomaret" });

    const staged = await stageFile(actor, { accountId: bca, fileName: "bca.csv", text: fixture("bca.csv") });
    expect(staged).toMatchObject({ status: "STAGED", format: "bca", rowCount: 5, duplicateCount: 0 });

    const detail = await getImport(actor.userId, staged.batchId);
    const indomaret = detail!.rows.filter((r) => r.description.includes("INDOMARET"));
    expect(indomaret.map((r) => [r.categoryName, r.payee])).toEqual([["Belanja harian", "Indomaret"], ["Belanja harian", "Indomaret"]]);

    expect(await commitImport(actor, staged.batchId)).toEqual({ committed: 5, skipped: 0 });
    expect((await getAccount(actor.userId, bca)).balance).toBe(2_000_000n + 8_500_000n - 500_000n - 125_400n * 2n - 10_000n);

    const again = await stageFile(actor, { accountId: bca, fileName: "bca.csv", text: fixture("bca.csv") });
    expect(again).toMatchObject({ rowCount: 5, duplicateCount: 5, alreadyImportedAs: staged.batchId });
    expect(await commitImport(actor, again.batchId)).toEqual({ committed: 0, skipped: 5 });
  });

  it("keeps a genuine second identical charge when only one already exists", async () => {
    const { actor, bca } = await setup();
    await recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: 125_400, bookedOn: "2026-10-03", description: "KARTU DEBIT INDOMARET CONTOH" });
    const staged = await stageFile(actor, { accountId: bca, text: fixture("bca.csv") });
    expect(staged.duplicateCount).toBe(1);
    expect((await commitImport(actor, staged.batchId)).committed).toBe(4);
  });

  it("applies review overrides: skip a row, change or clear a category, drop a wrong-kind category", async () => {
    const { actor, bca } = await setup();
    const fees = await categoryId(actor, "Biaya admin bank");
    const salary = await categoryId(actor, "Gaji", "INCOME");
    const staged = await stageFile(actor, { accountId: bca, text: fixture("bca.csv") });
    const rows = (await getImport(actor.userId, staged.batchId))!.rows;
    const byText = (t: string) => rows.find((r) => r.description.includes(t))!.id;

    await commitImport(actor, staged.batchId, {
      overrides: {
        [byText("TARIKAN ATM")]: { skip: true },
        [byText("BIAYA ADM")]: { categoryId: fees },
        [byText("TRSF E-BANKING")]: { categoryId: salary },
        [rows.find((r) => r.description.includes("INDOMARET"))!.id]: { categoryId: salary },
      },
    });
    const txs = await db.transaction.findMany({ where: { accountId: bca }, include: { category: true } });
    expect(txs).toHaveLength(4);
    expect(txs.find((t) => t.description === "BIAYA ADM")?.category?.name).toBe("Biaya admin bank");
    expect(txs.find((t) => t.description.startsWith("TRSF"))?.category?.name).toBe("Gaji");
    expect(txs.filter((t) => t.description.includes("INDOMARET")).every((t) => t.categoryId === null)).toBe(true);
    expect(txs.every((t) => t.source === "IMPORT")).toBe(true);
  });

  it("asks for a mapping on unknown files and imports after remapping", async () => {
    const { actor, bca } = await setup();
    const staged = await stageFile(actor, { accountId: bca, text: fixture("custom.csv") });
    expect(staged.status).toBe("NEEDS_MAPPING");
    expect(staged.preview?.[0]).toEqual(["when", "what", "money"]);
    const remapped = await remapImport(actor, staged.batchId, { headerRow: 0, date: 0, description: [1], amount: 2, dateOrder: "YMD" });
    expect(remapped.rowCount).toBe(2);
    await expect(commitImport(actor, staged.batchId)).resolves.toEqual({ committed: 2, skipped: 0 });
  });

  it("reverts a committed import and discards a staged one", async () => {
    const { actor, bca } = await setup();
    const a = await stageFile(actor, { accountId: bca, text: fixture("bri.csv") });
    await commitImport(actor, a.batchId);
    expect(await revertImport(actor, a.batchId)).toBe(2);
    expect((await getAccount(actor.userId, bca)).balance).toBe(2_000_000n);
    await expect(revertImport(actor, a.batchId)).rejects.toThrow(/reverted/);

    const b = await stageFile(actor, { accountId: bca, text: fixture("bni.csv") });
    await discardImport(actor, b.batchId);
    await expect(commitImport(actor, b.batchId)).rejects.toThrow(/discarded/);
  });

  it("stages rows an agent parsed itself and refuses another user's batch", async () => {
    const { actor, bca } = await setup();
    const staged = await stageRows(actor, {
      accountId: bca,
      label: "PDF Oktober",
      rows: [
        { date: "2026-10-09", amount: "-75rb", description: "Bensin" },
        { date: "2026-10-09", amount: 0, description: "Nol" },
      ],
    });
    expect(staged).toMatchObject({ format: "agent", rowCount: 1, skippedLines: 1 });
    const stranger = await makeUser();
    await expect(commitImport(stranger, staged.batchId)).rejects.toThrow(/not found/);
  });
});

describe("rules", () => {
  it("counts existing matches on create, applies to uncategorized only, and can be disabled", async () => {
    const { actor, bca } = await setup();
    const transport = await categoryId(actor, "Transportasi");
    const food = await categoryId(actor, "Makan & minum");
    await recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: 20_000, bookedOn: "2026-10-01", description: "GRAB* RIDE" });
    await recordTransaction(actor, { accountId: bca, kind: "EXPENSE", amount: 35_000, bookedOn: "2026-10-01", description: "GRAB FOOD", categoryId: food });
    await recordTransaction(actor, { accountId: bca, kind: "INCOME", amount: 10_000, bookedOn: "2026-10-01", description: "GRAB refund" });

    const { id, matchesExisting } = await createRule(actor, { contains: "grab", categoryId: transport });
    expect(matchesExisting).toBe(1);
    expect(await applyRules(actor)).toBe(1);
    expect(await applyRules(actor)).toBe(0);

    await setRuleEnabled(actor, id, false);
    expect((await listRules(actor.userId))[0].enabled).toBe(false);
  });
});
