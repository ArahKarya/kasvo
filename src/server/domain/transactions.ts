import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { DomainError, notFound } from "./errors";
import { fingerprint } from "./fingerprint";
import { daySchema, idSchema, optionalText, positiveAmountSchema } from "./schemas";

type Tx = Prisma.TransactionClient;

export const recordTransactionSchema = z.object({
  accountId: idSchema,
  kind: z.enum(["INCOME", "EXPENSE"]),
  /** Always positive; `kind` decides the sign. */
  amount: positiveAmountSchema,
  bookedOn: daySchema,
  description: z.string().trim().min(1).max(200),
  payee: optionalText(120),
  note: optionalText(500),
  categoryId: idSchema.optional().or(z.literal("").transform(() => undefined)),
});

export const editTransactionSchema = recordTransactionSchema.partial().extend({
  /** For these three, null clears the field and undefined leaves it alone. */
  categoryId: idSchema.nullable().optional(),
  payee: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const recordTransferSchema = z
  .object({
    fromAccountId: idSchema,
    toAccountId: idSchema,
    amount: positiveAmountSchema,
    bookedOn: daySchema,
    description: optionalText(200),
    note: optionalText(500),
    /** Admin fee charged on the sending account, recorded as a normal expense. */
    fee: positiveAmountSchema.optional(),
    feeCategoryId: idSchema.optional(),
  })
  .refine((t) => t.fromAccountId !== t.toAccountId, { message: "Choose two different accounts.", path: ["toAccountId"] });

export type RecordTransactionInput = z.input<typeof recordTransactionSchema>;
export type EditTransactionInput = z.input<typeof editTransactionSchema>;
export type RecordTransferInput = z.input<typeof recordTransferSchema>;

const sourceOf = (actor: Actor) =>
  actor.kind === "AGENT" ? { source: "AGENT" as const, createdBy: actor.clientName ?? "agent" } : { source: "MANUAL" as const };

async function usableAccount(tx: Tx, userId: string, id: string) {
  const account = await tx.account.findFirst({ where: { id, userId } });
  if (!account) throw notFound("Account", id);
  if (account.archivedAt) throw new DomainError("INVALID", "archived", `Account "${account.name}" is archived.`, "Unarchive it or pick another account.");
  return account;
}

async function checkCategory(tx: Tx, userId: string, id: string, kind: "INCOME" | "EXPENSE"): Promise<void> {
  const category = await tx.category.findFirst({ where: { id, userId } });
  if (!category) throw notFound("Category", id);
  if (category.kind !== kind) {
    throw new DomainError("INVALID", "category_kind", `"${category.name}" is an ${category.kind.toLowerCase()} category.`, `Pick a ${kind.toLowerCase()} category.`);
  }
}

export async function recordTransaction(actor: Actor, input: RecordTransactionInput): Promise<{ id: string }> {
  const data = recordTransactionSchema.parse(input);
  return db.$transaction((tx) => writeTransaction(tx, actor, data));
}

/** The body of recordTransaction, for callers that already hold a database transaction. */
export async function writeTransaction(tx: Tx, actor: Actor, data: z.output<typeof recordTransactionSchema>): Promise<{ id: string }> {
  await usableAccount(tx, actor.userId, data.accountId);
  if (data.categoryId) await checkCategory(tx, actor.userId, data.categoryId, data.kind);
  const amount = data.kind === "EXPENSE" ? -data.amount : data.amount;
  const row = await tx.transaction.create({
    data: {
      userId: actor.userId,
      accountId: data.accountId,
      bookedOn: data.bookedOn,
      amount,
      description: data.description,
      payee: data.payee,
      note: data.note,
      categoryId: data.categoryId,
      fingerprint: fingerprint(data.accountId, data.bookedOn, amount, data.description),
      ...sourceOf(actor),
    },
  });
  await audit(tx, actor, { action: "transaction.create", entity: "Transaction", entityId: row.id, after: row });
  return { id: row.id };
}

/**
 * Transfer legs share a `transferId`. Their amount and accounts are fixed: delete the
 * transfer and record it again to change those. Date, description, and note edit both legs.
 */
export async function editTransaction(actor: Actor, id: string, input: EditTransactionInput): Promise<void> {
  const patch = editTransactionSchema.parse(input);
  await db.$transaction(async (tx) => {
    const before = await tx.transaction.findFirst({ where: { id, userId: actor.userId, deletedAt: null } });
    if (!before) throw notFound("Transaction", id);

    if (before.transferId) {
      if (patch.amount !== undefined || patch.accountId || patch.kind || patch.categoryId !== undefined) {
        throw new DomainError("INVALID", "transfer_locked", "Amount, account, and category of a transfer cannot be edited.", "Delete the transfer and record it again.");
      }
      const shared = { bookedOn: patch.bookedOn, description: patch.description, note: patch.note };
      await tx.transaction.updateMany({ where: { transferId: before.transferId, userId: actor.userId }, data: shared });
      await audit(tx, actor, { action: "transfer.update", entity: "Transfer", entityId: before.transferId, before, after: shared });
      return;
    }

    const kind = patch.kind ?? (before.amount < 0n ? "EXPENSE" : "INCOME");
    const magnitude = patch.amount ?? (before.amount < 0n ? -before.amount : before.amount);
    const amount = kind === "EXPENSE" ? -magnitude : magnitude;
    const accountId = patch.accountId ?? before.accountId;
    if (patch.accountId && patch.accountId !== before.accountId) await usableAccount(tx, actor.userId, patch.accountId);

    // Switching income/expense invalidates a category of the old kind.
    const categoryId = patch.categoryId === undefined ? before.categoryId : patch.categoryId;
    if (categoryId) await checkCategory(tx, actor.userId, categoryId, kind);

    const bookedOn = patch.bookedOn ?? before.bookedOn;
    const description = patch.description ?? before.description;
    const after = await tx.transaction.update({
      where: { id },
      data: {
        accountId,
        amount,
        bookedOn,
        description,
        payee: patch.payee === undefined ? before.payee : patch.payee,
        note: patch.note === undefined ? before.note : patch.note,
        categoryId,
        fingerprint: fingerprint(accountId, bookedOn, amount, description),
      },
    });
    await audit(tx, actor, { action: "transaction.update", entity: "Transaction", entityId: id, before, after });
  });
}

export async function recordTransfer(actor: Actor, input: RecordTransferInput): Promise<{ transferId: string; ids: string[] }> {
  const data = recordTransferSchema.parse(input);
  return db.$transaction((tx) => writeTransfer(tx, actor, data));
}

/** The body of recordTransfer, for callers that already hold a database transaction. `ids[0]` is the sending leg. */
export async function writeTransfer(tx: Tx, actor: Actor, data: z.output<typeof recordTransferSchema>): Promise<{ transferId: string; ids: string[] }> {
  const from = await usableAccount(tx, actor.userId, data.fromAccountId);
  const to = await usableAccount(tx, actor.userId, data.toAccountId);
  if (from.currency !== to.currency) {
    throw new DomainError("INVALID", "currency_mismatch", "Transfers between currencies are not supported yet.");
  }
  const transferId = randomUUID();
  const description = data.description ?? `Transfer ${from.name} → ${to.name}`;
  const leg = (accountId: string, amount: bigint) => ({
    userId: actor.userId,
    accountId,
    bookedOn: data.bookedOn,
    amount,
    description,
    note: data.note,
    transferId,
    fingerprint: fingerprint(accountId, data.bookedOn, amount, description),
    ...sourceOf(actor),
  });
  const out = await tx.transaction.create({ data: leg(from.id, -data.amount) });
  const into = await tx.transaction.create({ data: leg(to.id, data.amount) });
  const ids = [out.id, into.id];

  if (data.fee) {
    if (data.feeCategoryId) await checkCategory(tx, actor.userId, data.feeCategoryId, "EXPENSE");
    const feeDescription = `Biaya transfer ke ${to.name}`;
    const fee = await tx.transaction.create({
      data: {
        userId: actor.userId,
        accountId: from.id,
        bookedOn: data.bookedOn,
        amount: -data.fee,
        description: feeDescription,
        categoryId: data.feeCategoryId,
        fingerprint: fingerprint(from.id, data.bookedOn, -data.fee, feeDescription),
        ...sourceOf(actor),
      },
    });
    ids.push(fee.id);
  }
  await audit(tx, actor, { action: "transfer.create", entity: "Transfer", entityId: transferId, after: { ...data, ids } });
  return { transferId, ids };
}

/** Soft delete. Deleting one leg of a transfer deletes both. Returns how many rows changed. */
export async function deleteTransactions(actor: Actor, ids: string[]): Promise<number> {
  z.array(idSchema).min(1).max(500).parse(ids);
  return db.$transaction(async (tx) => {
    const rows = await tx.transaction.findMany({ where: { id: { in: ids }, userId: actor.userId, deletedAt: null } });
    const transferIds = [...new Set(rows.flatMap((r) => (r.transferId ? [r.transferId] : [])))];
    const { count } = await tx.transaction.updateMany({
      where: { userId: actor.userId, deletedAt: null, OR: [{ id: { in: rows.map((r) => r.id) } }, { transferId: { in: transferIds } }] },
      data: { deletedAt: new Date() },
    });
    await audit(tx, actor, { action: "transaction.delete", entity: "Transaction", entityId: ids.join(","), before: rows });
    return count;
  });
}

export async function restoreTransactions(actor: Actor, ids: string[]): Promise<number> {
  z.array(idSchema).min(1).max(500).parse(ids);
  return db.$transaction(async (tx) => {
    const rows = await tx.transaction.findMany({ where: { id: { in: ids }, userId: actor.userId, deletedAt: { not: null } } });
    const transferIds = [...new Set(rows.flatMap((r) => (r.transferId ? [r.transferId] : [])))];
    const { count } = await tx.transaction.updateMany({
      where: { userId: actor.userId, OR: [{ id: { in: rows.map((r) => r.id) } }, { transferId: { in: transferIds } }] },
      data: { deletedAt: null },
    });
    await audit(tx, actor, { action: "transaction.restore", entity: "Transaction", entityId: ids.join(","), after: { ids } });
    return count;
  });
}
