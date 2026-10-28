import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma, TransactionSource } from "@/generated/prisma/client";
import { daySchema, idSchema } from "./schemas";

export const findTransactionsSchema = z.object({
  from: daySchema.optional(),
  to: daySchema.optional(),
  accountId: idSchema.optional(),
  /** A category id, or "none" for uncategorized rows. */
  categoryId: z.union([idSchema, z.literal("none")]).optional(),
  kind: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type FindTransactionsInput = z.input<typeof findTransactionsSchema>;

export interface TransactionRow {
  id: string;
  bookedOn: Date;
  amount: bigint;
  description: string;
  payee: string | null;
  note: string | null;
  account: { id: string; name: string; currency: string };
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
  transferId: string | null;
  /** The other account of a transfer. */
  counterparty: { id: string; name: string } | null;
  source: TransactionSource;
  createdBy: string | null;
}

export interface TransactionPage {
  items: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Totals over every matching row, not just this page. Transfers are excluded. */
  income: bigint;
  expense: bigint;
}

function whereFor(userId: string, f: z.output<typeof findTransactionsSchema>): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId, deletedAt: null };
  if (f.from || f.to) where.bookedOn = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  if (f.accountId) where.accountId = f.accountId;
  if (f.categoryId) where.categoryId = f.categoryId === "none" ? null : f.categoryId;
  if (f.kind === "TRANSFER") where.transferId = { not: null };
  if (f.kind === "INCOME") Object.assign(where, { transferId: null, amount: { gt: 0 } });
  if (f.kind === "EXPENSE") Object.assign(where, { transferId: null, amount: { lt: 0 } });
  if (f.q) {
    where.OR = [
      { description: { contains: f.q, mode: "insensitive" } },
      { payee: { contains: f.q, mode: "insensitive" } },
      { note: { contains: f.q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function findTransactions(userId: string, input: FindTransactionsInput = {}): Promise<TransactionPage> {
  const f = findTransactionsSchema.parse(input);
  const where = whereFor(userId, f);
  const notTransfer = { AND: [where, { transferId: null }] };

  const [rows, total, income, expense] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: [{ bookedOn: "desc" }, { createdAt: "desc" }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: INCLUDE,
    }),
    db.transaction.count({ where }),
    db.transaction.aggregate({ where: { AND: [notTransfer, { amount: { gt: 0 } }] }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { AND: [notTransfer, { amount: { lt: 0 } }] }, _sum: { amount: true } }),
  ]);

  return {
    items: await withCounterparties(userId, rows),
    total,
    page: f.page,
    pageSize: f.pageSize,
    income: income._sum.amount ?? 0n,
    expense: -(expense._sum.amount ?? 0n),
  };
}

const INCLUDE = {
  account: { select: { id: true, name: true, currency: true } },
  category: { select: { id: true, name: true, icon: true, color: true } },
} as const;

type RowWithRelations = Prisma.TransactionGetPayload<{ include: typeof INCLUDE }>;

/** Adds the other account of each transfer leg. */
async function withCounterparties(userId: string, rows: RowWithRelations[]): Promise<TransactionRow[]> {
  const transferIds = rows.flatMap((r) => (r.transferId ? [r.transferId] : []));
  const legs = transferIds.length
    ? await db.transaction.findMany({
        where: { transferId: { in: transferIds }, userId },
        select: { id: true, transferId: true, account: { select: { id: true, name: true } } },
      })
    : [];
  return rows.map((r) => ({
    id: r.id,
    bookedOn: r.bookedOn,
    amount: r.amount,
    description: r.description,
    payee: r.payee,
    note: r.note,
    account: r.account,
    category: r.category,
    transferId: r.transferId,
    counterparty: legs.find((l) => l.transferId === r.transferId && l.id !== r.id)?.account ?? null,
    source: r.source,
    createdBy: r.createdBy,
  }));
}

export async function getTransaction(userId: string, id: string): Promise<TransactionRow | null> {
  const row = await db.transaction.findFirst({ where: { id, userId, deletedAt: null }, include: INCLUDE });
  return row ? (await withCounterparties(userId, [row]))[0] : null;
}
