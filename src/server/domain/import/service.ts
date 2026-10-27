import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import type { ImportStatus, Prisma } from "@/generated/prisma/client";
import type { Actor } from "../actor";
import { audit } from "../audit";
import { DomainError, notFound } from "../errors";
import { fingerprint } from "../fingerprint";
import { matchRule } from "../rule-match";
import { activeRules } from "../rules";
import { amountSchema, daySchema, idSchema } from "../schemas";
import { mappingSchema, parseCsv, type ColumnMapping, type ParsedRow } from "./csv";

type Tx = Prisma.TransactionClient;

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;

export interface StageResult {
  batchId: string;
  status: ImportStatus;
  format: string;
  rowCount: number;
  duplicateCount: number;
  skippedLines: number;
  /** Set when the same file was already committed to this account. */
  alreadyImportedAs?: string;
  /** First lines of an unrecognised file, for mapping its columns. */
  preview?: string[][];
}

async function usableAccount(userId: string, accountId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw notFound("Account", accountId);
  if (account.archivedAt) throw new DomainError("INVALID", "archived", `Account "${account.name}" is archived.`);
  return account;
}

async function ownedBatch(userId: string, batchId: string) {
  const batch = await db.importBatch.findFirst({ where: { id: batchId, userId } });
  if (!batch) throw notFound("Import", batchId);
  return batch;
}

/**
 * Marks rows that already exist in the account. A file can legitimately hold two identical
 * coffees on one day, so the n-th copy is a duplicate only if the account already has n.
 */
async function withDedupAndRules(tx: Tx, userId: string, accountId: string, rows: (ParsedRow & { payee?: string })[]) {
  const prints = rows.map((r) => fingerprint(accountId, r.bookedOn, r.amount, r.description));
  const existing = await tx.transaction.groupBy({
    by: ["fingerprint"],
    where: { accountId, deletedAt: null, fingerprint: { in: [...new Set(prints)] } },
    _count: { _all: true },
  });
  const have = new Map(existing.map((e) => [e.fingerprint, e._count._all]));
  const seen = new Map<string, number>();
  const rules = await activeRules(userId);

  return rows.map((r, i) => {
    const occurrence = seen.get(prints[i]) ?? 0;
    seen.set(prints[i], occurrence + 1);
    const rule = matchRule(rules, { description: r.description, payee: r.payee, amount: r.amount, accountId });
    return {
      line: r.line,
      bookedOn: r.bookedOn,
      amount: r.amount,
      description: r.description,
      payee: r.payee ?? rule?.setPayee ?? null,
      fingerprint: prints[i],
      duplicate: occurrence < (have.get(prints[i]) ?? 0),
      categoryId: rule?.categoryId ?? null,
      ruleId: rule?.id ?? null,
    };
  });
}

async function fillBatch(tx: Tx, userId: string, batchId: string, accountId: string, rows: (ParsedRow & { payee?: string })[]) {
  if (rows.length > MAX_ROWS) throw new DomainError("INVALID", "too_large", `Too many rows (${rows.length}); the limit is ${MAX_ROWS}.`, "Split the file by month.");
  await tx.stagedRow.deleteMany({ where: { batchId } });
  const staged = await withDedupAndRules(tx, userId, accountId, rows);
  if (staged.length) await tx.stagedRow.createMany({ data: staged.map((s) => ({ ...s, batchId })) });
  const duplicateCount = staged.filter((s) => s.duplicate).length;
  await tx.importBatch.update({ where: { id: batchId }, data: { status: "STAGED", rowCount: staged.length, duplicateCount } });
  return { rowCount: staged.length, duplicateCount };
}

export const stageFileSchema = z.object({
  accountId: idSchema,
  fileName: z.string().max(200).optional(),
  text: z.string().min(1),
  mapping: mappingSchema.optional(),
});

/** Parses a CSV statement into a staged batch. Nothing touches the ledger until commit. */
export async function stageFile(actor: Actor, input: z.input<typeof stageFileSchema>): Promise<StageResult> {
  const data = stageFileSchema.parse(input);
  if (Buffer.byteLength(data.text) > MAX_FILE_BYTES) throw new DomainError("INVALID", "too_large", "File is larger than 2 MB.", "Export a shorter period.");
  await usableAccount(actor.userId, data.accountId);

  const fileHash = createHash("sha256").update(data.text).digest("hex");
  const previous = await db.importBatch.findFirst({
    where: { userId: actor.userId, accountId: data.accountId, fileHash, status: "COMMITTED" },
    select: { id: true },
  });
  const parsed = parseCsv(data.text, data.mapping as ColumnMapping | undefined);

  return db.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        userId: actor.userId,
        accountId: data.accountId,
        format: parsed.ok ? parsed.format : "csv",
        fileName: data.fileName,
        fileHash,
        rawContent: data.text,
        mapping: parsed.ok ? (parsed.mapping as unknown as Prisma.InputJsonValue) : undefined,
        status: parsed.ok ? "STAGED" : "NEEDS_MAPPING",
        createdBy: actor.clientName,
      },
    });
    const base = { batchId: batch.id, alreadyImportedAs: previous?.id };
    if (!parsed.ok) return { ...base, status: "NEEDS_MAPPING" as const, format: "csv", rowCount: 0, duplicateCount: 0, skippedLines: 0, preview: parsed.preview };
    const counts = await fillBatch(tx, actor.userId, batch.id, data.accountId, parsed.rows);
    await audit(tx, actor, { action: "import.stage", entity: "ImportBatch", entityId: batch.id, after: { format: parsed.format, ...counts } });
    return { ...base, status: "STAGED" as const, format: parsed.format, skippedLines: parsed.skipped, ...counts };
  });
}

/** Re-parses a stored file with a column mapping chosen by the user. */
export async function remapImport(actor: Actor, batchId: string, mapping: z.input<typeof mappingSchema>): Promise<StageResult> {
  const batch = await ownedBatch(actor.userId, batchId);
  if (batch.status !== "STAGED" && batch.status !== "NEEDS_MAPPING") throw new DomainError("INVALID", "import_state", `Import is ${batch.status.toLowerCase()}.`);
  if (!batch.rawContent) throw new DomainError("INVALID", "import_state", "The original file is no longer stored.", "Upload it again.");
  const m = mappingSchema.parse(mapping);
  const parsed = parseCsv(batch.rawContent, m);
  if (!parsed.ok) throw new DomainError("INVALID", "no_rows", "No transactions found with that mapping.", "Check which columns hold the date, description, and amount.");
  return db.$transaction(async (tx) => {
    await tx.importBatch.update({ where: { id: batchId }, data: { mapping: m as unknown as Prisma.InputJsonValue, format: "csv" } });
    const counts = await fillBatch(tx, actor.userId, batchId, batch.accountId, parsed.rows);
    return { batchId, status: "STAGED" as const, format: "csv", skippedLines: parsed.skipped, ...counts };
  });
}

export const stageRowsSchema = z.object({
  accountId: idSchema,
  label: z.string().max(200).optional(),
  rows: z
    .array(z.object({ date: daySchema, amount: amountSchema, description: z.string().trim().min(1).max(200), payee: z.string().trim().max(120).optional() }))
    .min(1)
    .max(MAX_ROWS),
});

/** Stages rows an agent read itself (for example from a PDF statement). Amounts are signed. */
export async function stageRows(actor: Actor, input: z.input<typeof stageRowsSchema>): Promise<StageResult> {
  const data = stageRowsSchema.parse(input);
  await usableAccount(actor.userId, data.accountId);
  const rows = data.rows.filter((r) => r.amount !== 0n).map((r, i) => ({ line: i + 1, bookedOn: r.date, amount: r.amount, description: r.description, payee: r.payee }));
  return db.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: { userId: actor.userId, accountId: data.accountId, format: "agent", fileName: data.label, createdBy: actor.clientName },
    });
    const counts = await fillBatch(tx, actor.userId, batch.id, data.accountId, rows);
    await audit(tx, actor, { action: "import.stage", entity: "ImportBatch", entityId: batch.id, after: { format: "agent", ...counts } });
    return { batchId: batch.id, status: "STAGED" as const, format: "agent", skippedLines: data.rows.length - rows.length, ...counts };
  });
}

export const commitSchema = z.object({
  /** Per-row changes made during review. */
  overrides: z.record(idSchema, z.object({ categoryId: idSchema.nullable().optional(), skip: z.boolean().optional() })).default({}),
  includeDuplicates: z.boolean().default(false),
});

/** Writes the reviewed rows into the ledger. Duplicates are left out unless asked for. */
export async function commitImport(actor: Actor, batchId: string, input: z.input<typeof commitSchema> = {}): Promise<{ committed: number; skipped: number }> {
  const opts = commitSchema.parse(input);
  const batch = await ownedBatch(actor.userId, batchId);
  if (batch.status !== "STAGED") throw new DomainError("INVALID", "import_state", `Import is ${batch.status.toLowerCase()}, not staged.`);
  const [rows, categories] = await Promise.all([
    db.stagedRow.findMany({ where: { batchId }, orderBy: { line: "asc" } }),
    db.category.findMany({ where: { userId: actor.userId }, select: { id: true, kind: true } }),
  ]);
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]));

  const chosen = rows.flatMap((r) => {
    const o = opts.overrides[r.id] ?? {};
    if (o.skip ?? r.skip) return [];
    if (r.duplicate && !opts.includeDuplicates) return [];
    const categoryId = o.categoryId === undefined ? r.categoryId : o.categoryId;
    const kind = r.amount < 0n ? "EXPENSE" : "INCOME";
    // A category of the wrong kind or another user's id is dropped rather than failing the batch.
    return [{ ...r, categoryId: categoryId && kindOf.get(categoryId) === kind ? categoryId : null }];
  });

  return db.$transaction(async (tx) => {
    if (chosen.length) {
      await tx.transaction.createMany({
        data: chosen.map((r) => ({
          userId: actor.userId,
          accountId: batch.accountId,
          bookedOn: r.bookedOn,
          amount: r.amount,
          description: r.description,
          payee: r.payee,
          categoryId: r.categoryId,
          fingerprint: r.fingerprint,
          importBatchId: batchId,
          source: "IMPORT" as const,
          createdBy: actor.kind === "AGENT" ? (actor.clientName ?? "agent") : null,
        })),
      });
    }
    await tx.importBatch.update({ where: { id: batchId }, data: { status: "COMMITTED", committedAt: new Date(), committedCount: chosen.length, rawContent: null } });
    await tx.stagedRow.deleteMany({ where: { batchId } });
    await audit(tx, actor, { action: "import.commit", entity: "ImportBatch", entityId: batchId, after: { committed: chosen.length, skipped: rows.length - chosen.length } });
    return { committed: chosen.length, skipped: rows.length - chosen.length };
  });
}

/** Soft-deletes every transaction a committed import created. */
export async function revertImport(actor: Actor, batchId: string): Promise<number> {
  const batch = await ownedBatch(actor.userId, batchId);
  if (batch.status !== "COMMITTED") throw new DomainError("INVALID", "import_state", `Import is ${batch.status.toLowerCase()}, not committed.`);
  return db.$transaction(async (tx) => {
    const { count } = await tx.transaction.updateMany({ where: { importBatchId: batchId, userId: actor.userId, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.importBatch.update({ where: { id: batchId }, data: { status: "REVERTED" } });
    await audit(tx, actor, { action: "import.revert", entity: "ImportBatch", entityId: batchId, after: { deleted: count } });
    return count;
  });
}

/** Throws away a batch that was never committed. */
export async function discardImport(actor: Actor, batchId: string): Promise<void> {
  const batch = await ownedBatch(actor.userId, batchId);
  if (batch.status !== "STAGED" && batch.status !== "NEEDS_MAPPING") throw new DomainError("INVALID", "import_state", `Import is ${batch.status.toLowerCase()}.`);
  await db.$transaction(async (tx) => {
    await tx.stagedRow.deleteMany({ where: { batchId } });
    await tx.importBatch.update({ where: { id: batchId }, data: { status: "DISCARDED", rawContent: null } });
    await audit(tx, actor, { action: "import.discard", entity: "ImportBatch", entityId: batchId });
  });
}
