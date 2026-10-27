import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import type { DebtDirection, Prisma } from "@/generated/prisma/client";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { DomainError, notFound } from "./errors";
import { addDays, parseDay, toDay } from "./dates";
import { debtStatus, suggestedPayment, type DebtStatus } from "./debt-math";
import { daySchema, idSchema, optionalDaySchema, optionalIdSchema, optionalText, positiveAmountSchema } from "./schemas";
import { writeTransaction, writeTransfer } from "./transactions";

type Tx = Prisma.TransactionClient;

const LINKABLE_TYPES = ["LOAN", "CREDIT_CARD"] as const;

/** "12,5" or 12.5 (percent per year) → 1250 basis points. */
const rateSchema = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const n = typeof value === "number" ? value : Number(value.trim().replace("%", "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    ctx.addIssue({ code: "custom", message: `Not an interest rate: ${String(value)}. Use a yearly percentage such as 12.5.` });
    return z.NEVER;
  }
  return Math.round(n * 100);
});

const optionalRate = z.union([z.literal("").transform(() => undefined), rateSchema]).optional();

const termsShape = {
  name: z.string().trim().min(1).max(60),
  direction: z.enum(["BORROWED", "LENT"]),
  counterparty: optionalText(80),
  principal: positiveAmountSchema,
  /** Defaults to the principal split evenly over the instalments, rounded up. */
  instalmentAmount: z.union([z.literal("").transform(() => undefined), positiveAmountSchema]).optional(),
  instalmentCount: z.coerce.number().int().min(1).max(600).default(1),
  firstDueOn: daySchema,
  annualRate: optionalRate,
  accountId: optionalIdSchema,
  note: optionalText(500),
};

export const createDebtSchema = z.object(termsShape);

export const updateDebtSchema = z.object(termsShape).partial().extend({
  counterparty: z.string().trim().max(80).nullable().optional(),
  accountId: z.union([z.null(), z.literal("").transform(() => null), idSchema]).optional(),
  annualRate: z.union([z.null(), z.literal("").transform(() => null), rateSchema]).optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const payDebtSchema = z
  .object({
    debtId: idSchema,
    /** Defaults to what is left of the next instalment, or the linked transaction's amount. */
    amount: z.union([z.literal("").transform(() => undefined), positiveAmountSchema]).optional(),
    paidOn: optionalDaySchema,
    /** Records the payment in this account too. */
    accountId: optionalIdSchema,
    /** Links an existing transaction, such as an imported bank row, instead of creating one. */
    transactionId: optionalIdSchema,
    categoryId: optionalIdSchema,
    note: optionalText(200),
  })
  .refine((p) => !(p.accountId && p.transactionId), { message: "Give either an account or an existing transaction, not both.", path: ["transactionId"] })
  .refine((p) => p.transactionId || p.paidOn, { message: "Give the payment date.", path: ["paidOn"] });

export type CreateDebtInput = z.input<typeof createDebtSchema>;
export type PayDebtInput = z.input<typeof payDebtSchema>;

export interface DebtView {
  id: string;
  name: string;
  direction: DebtDirection;
  counterparty: string | null;
  principal: bigint;
  instalmentAmount: bigint;
  instalmentCount: number;
  firstDueOn: string;
  /** Percent per year, e.g. 12.5. */
  annualRate: number | null;
  accountId: string | null;
  accountName: string | null;
  note: string | null;
  archived: boolean;
  status: DebtStatus;
}

export interface DebtPaymentView {
  id: string;
  paidOn: string;
  amount: bigint;
  note: string | null;
  transactionId: string | null;
  ledgerCreated: boolean;
  accountName: string | null;
  description: string | null;
}

export interface DebtDetail extends DebtView {
  payments: DebtPaymentView[];
}

/** Payments whose linked transaction was deleted no longer count. */
const countedPayments = { OR: [{ transactionId: null }, { transaction: { deletedAt: null } }] } satisfies Prisma.DebtPaymentWhereInput;

async function checkLinkedAccount(tx: Tx, userId: string, id: string): Promise<void> {
  const account = await tx.account.findFirst({ where: { id, userId } });
  if (!account) throw notFound("Account", id);
  if (!(LINKABLE_TYPES as readonly string[]).includes(account.type)) {
    throw new DomainError("INVALID", "account_type", `"${account.name}" is a ${account.type.toLowerCase()} account.`, "Link a LOAN or CREDIT_CARD account, or none.");
  }
}

async function assertNameFree(tx: Tx, userId: string, name: string, exceptId?: string): Promise<void> {
  const clash = await tx.debt.findFirst({ where: { userId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
  if (clash) throw new DomainError("CONFLICT", "name_taken", `A debt named "${name}" already exists.`);
}

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

export async function listDebts(userId: string, today: string, opts: { includeArchived?: boolean; ids?: string[] } = {}): Promise<DebtView[]> {
  const debts = await db.debt.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { archivedAt: null }), ...(opts.ids ? { id: { in: opts.ids } } : {}) },
    include: { account: { select: { name: true } } },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { firstDueOn: "asc" }],
  });
  const paid = await db.debtPayment.groupBy({
    by: ["debtId"],
    where: { userId, debtId: { in: debts.map((d) => d.id) }, ...countedPayments },
    _sum: { amount: true },
  });
  const paidBy = new Map(paid.map((p) => [p.debtId, p._sum.amount ?? 0n]));
  return debts.map((d) => ({
    id: d.id,
    name: d.name,
    direction: d.direction,
    counterparty: d.counterparty,
    principal: d.principal,
    instalmentAmount: d.instalmentAmount,
    instalmentCount: d.instalmentCount,
    firstDueOn: toDay(d.firstDueOn),
    annualRate: d.annualRateBp === null ? null : d.annualRateBp / 100,
    accountId: d.accountId,
    accountName: d.account?.name ?? null,
    note: d.note,
    archived: d.archivedAt !== null,
    status: debtStatus(
      { instalmentAmount: d.instalmentAmount, instalmentCount: d.instalmentCount, firstDueOn: toDay(d.firstDueOn) },
      paidBy.get(d.id) ?? 0n,
      today,
    ),
  }));
}

export async function getDebt(userId: string, id: string, today: string): Promise<DebtDetail> {
  const [debt] = await listDebts(userId, today, { includeArchived: true, ids: [id] });
  if (!debt) throw notFound("Debt", id);
  const rows = await db.debtPayment.findMany({
    where: { debtId: id, userId, ...countedPayments },
    include: { transaction: { select: { description: true, account: { select: { name: true } } } } },
    orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
  });
  return {
    ...debt,
    payments: rows.map((p) => ({
      id: p.id,
      paidOn: toDay(p.paidOn),
      amount: p.amount,
      note: p.note,
      transactionId: p.transactionId,
      ledgerCreated: p.ledgerCreated,
      accountName: p.transaction?.account.name ?? null,
      description: p.transaction?.description ?? null,
    })),
  };
}

/** Unsettled debts with an instalment overdue or due within a week, soonest first. */
export async function debtsDue(userId: string, today: string): Promise<DebtView[]> {
  return (await listDebts(userId, today))
    .filter((d) => d.status.state === "overdue" || d.status.state === "due_soon")
    .sort((a, b) => (a.status.next?.dueOn ?? "").localeCompare(b.status.next?.dueOn ?? ""));
}

export async function createDebt(actor: Actor, input: CreateDebtInput): Promise<{ id: string }> {
  const data = createDebtSchema.parse(input);
  return db.$transaction(async (tx) => {
    await assertNameFree(tx, actor.userId, data.name);
    if (data.accountId) await checkLinkedAccount(tx, actor.userId, data.accountId);
    const { annualRate, instalmentAmount, ...rest } = data;
    const row = await tx.debt.create({
      data: {
        ...rest,
        userId: actor.userId,
        instalmentAmount: instalmentAmount ?? ceilDiv(data.principal, BigInt(data.instalmentCount)),
        annualRateBp: annualRate,
      },
    });
    await audit(tx, actor, { action: "debt.create", entity: "Debt", entityId: row.id, after: row });
    return { id: row.id };
  });
}

export async function updateDebt(actor: Actor, id: string, input: z.input<typeof updateDebtSchema>): Promise<void> {
  const patch = updateDebtSchema.parse(input);
  await db.$transaction(async (tx) => {
    const before = await tx.debt.findFirst({ where: { id, userId: actor.userId } });
    if (!before) throw notFound("Debt", id);
    if (patch.name) await assertNameFree(tx, actor.userId, patch.name, id);
    if (patch.accountId) await checkLinkedAccount(tx, actor.userId, patch.accountId);
    const { annualRate, ...rest } = patch;
    const after = await tx.debt.update({ where: { id }, data: { ...rest, ...(annualRate !== undefined ? { annualRateBp: annualRate } : {}) } });
    await audit(tx, actor, { action: "debt.update", entity: "Debt", entityId: id, before, after });
  });
}

export async function setDebtArchived(actor: Actor, id: string, archived: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.debt.findFirst({ where: { id, userId: actor.userId } });
    if (!before) throw notFound("Debt", id);
    await tx.debt.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await audit(tx, actor, { action: archived ? "debt.archive" : "debt.unarchive", entity: "Debt", entityId: id });
  });
}

function paymentDescription(debt: { name: string; direction: DebtDirection; instalmentCount: number }, seq: number | undefined): string {
  if (debt.direction === "LENT") return `Terima pembayaran ${debt.name}`;
  return debt.instalmentCount > 1 && seq ? `Cicilan ${debt.name} ${seq}/${debt.instalmentCount}` : `Bayar ${debt.name}`;
}

/** The default category for repayments of a debt the user owes, if they still have it. */
async function repaymentCategory(tx: Tx, userId: string): Promise<string | undefined> {
  const c = await tx.category.findFirst({ where: { userId, kind: "EXPENSE", archivedAt: null, name: { in: ["Cicilan", "Loan repayment"] } } });
  return c?.id;
}

/**
 * Records a repayment. With `accountId` it also books the money: a transfer when the debt has
 * a linked loan account, otherwise an expense (debts owed) or income (debts owed to the user).
 * With `transactionId` it links a row that already exists, so an imported bank line is not counted twice.
 */
export async function payDebt(actor: Actor, input: PayDebtInput, today: string): Promise<{ id: string; amount: bigint; transactionId: string | null; status: DebtStatus }> {
  const data = payDebtSchema.parse(input);
  return db.$transaction(async (tx) => {
    const debt = await tx.debt.findFirst({ where: { id: data.debtId, userId: actor.userId } });
    if (!debt) throw notFound("Debt", data.debtId);
    const terms = { instalmentAmount: debt.instalmentAmount, instalmentCount: debt.instalmentCount, firstDueOn: toDay(debt.firstDueOn) };
    const paidSoFar = await tx.debtPayment.aggregate({ where: { debtId: debt.id, ...countedPayments }, _sum: { amount: true } });
    const before = debtStatus(terms, paidSoFar._sum.amount ?? 0n, today);
    if (before.state === "settled") throw new DomainError("INVALID", "debt_settled", `"${debt.name}" is already paid off.`);

    let amount = data.amount ?? suggestedPayment(before);
    let paidOn = data.paidOn;
    let transactionId: string | null = null;
    let ledgerCreated = false;

    if (data.transactionId) {
      const row = await tx.transaction.findFirst({ where: { id: data.transactionId, userId: actor.userId, deletedAt: null }, include: { debtPayment: true } });
      if (!row) throw notFound("Transaction", data.transactionId);
      if (row.debtPayment) throw new DomainError("CONFLICT", "already_linked", "That transaction is already linked to a debt payment.");
      const outgoing = row.amount < 0n;
      if (outgoing !== (debt.direction === "BORROWED")) {
        throw new DomainError("INVALID", "payment_direction", debt.direction === "BORROWED" ? "Repaying a debt is money going out." : "Being repaid is money coming in.");
      }
      amount = data.amount ?? (outgoing ? -row.amount : row.amount);
      paidOn = row.bookedOn;
      transactionId = row.id;
    } else if (data.accountId) {
      const description = paymentDescription(debt, before.next?.seq);
      const base = { amount, bookedOn: paidOn!, description, note: data.note };
      if (debt.accountId) {
        const [from, to] = debt.direction === "BORROWED" ? [data.accountId, debt.accountId] : [debt.accountId, data.accountId];
        const { ids } = await writeTransfer(tx, actor, { ...base, fromAccountId: from, toAccountId: to });
        transactionId = debt.direction === "BORROWED" ? ids[0] : ids[1];
      } else {
        const kind = debt.direction === "BORROWED" ? "EXPENSE" : "INCOME";
        const categoryId = data.categoryId ?? (kind === "EXPENSE" ? await repaymentCategory(tx, actor.userId) : undefined);
        transactionId = (await writeTransaction(tx, actor, { ...base, accountId: data.accountId, kind, categoryId, payee: debt.counterparty ?? undefined })).id;
      }
      ledgerCreated = true;
    }

    const payment = await tx.debtPayment.create({
      data: { debtId: debt.id, userId: actor.userId, paidOn: paidOn!, amount, transactionId, ledgerCreated, note: data.note },
    });
    await audit(tx, actor, { action: "debt.pay", entity: "Debt", entityId: debt.id, after: payment });
    return { id: payment.id, amount, transactionId, status: debtStatus(terms, before.paid + amount, today) };
  });
}

/** Removes a payment. A transaction booked together with it is deleted too (restorable); a linked one is kept. */
export async function removeDebtPayment(actor: Actor, id: string): Promise<{ debtId: string; transactionsDeleted: number }> {
  return db.$transaction(async (tx) => {
    const payment = await tx.debtPayment.findFirst({ where: { id, userId: actor.userId }, include: { transaction: true } });
    if (!payment) throw notFound("Payment", id);
    let transactionsDeleted = 0;
    if (payment.ledgerCreated && payment.transaction && !payment.transaction.deletedAt) {
      const { transferId } = payment.transaction;
      const { count } = await tx.transaction.updateMany({
        where: { userId: actor.userId, deletedAt: null, ...(transferId ? { transferId } : { id: payment.transaction.id }) },
        data: { deletedAt: new Date() },
      });
      transactionsDeleted = count;
    }
    await tx.debtPayment.delete({ where: { id } });
    await audit(tx, actor, { action: "debt.payment.remove", entity: "Debt", entityId: payment.debtId, before: payment });
    return { debtId: payment.debtId, transactionsDeleted };
  });
}

export interface PaymentCandidate {
  id: string;
  bookedOn: string;
  amount: bigint;
  description: string;
  accountName: string;
}

/**
 * Recent transactions that could be this debt's payment: the right direction, not yet linked,
 * not a transfer, closest to the instalment amount first.
 */
export async function paymentCandidates(userId: string, debtId: string, today: string): Promise<PaymentCandidate[]> {
  const debt = await db.debt.findFirst({ where: { id: debtId, userId } });
  if (!debt) return [];
  const since = parseDay(addDays(today, -120))!;
  const rows = await db.transaction.findMany({
    where: { userId, deletedAt: null, transferId: null, debtPayment: null, bookedOn: { gte: since }, amount: debt.direction === "BORROWED" ? { lt: 0n } : { gt: 0n } },
    include: { account: { select: { name: true } } },
    orderBy: { bookedOn: "desc" },
    take: 300,
  });
  const gap = (amount: bigint) => {
    const d = (amount < 0n ? -amount : amount) - debt.instalmentAmount;
    return d < 0n ? -d : d;
  };
  return rows
    .map((r) => ({ id: r.id, bookedOn: toDay(r.bookedOn), amount: r.amount < 0n ? -r.amount : r.amount, description: r.description, accountName: r.account.name, gap: gap(r.amount) }))
    .sort((a, b) => (a.gap === b.gap ? b.bookedOn.localeCompare(a.bookedOn) : a.gap < b.gap ? -1 : 1))
    .slice(0, 15)
    .map((c) => ({ id: c.id, bookedOn: c.bookedOn, amount: c.amount, description: c.description, accountName: c.accountName }));
}
