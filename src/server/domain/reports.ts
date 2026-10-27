import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { daySchema, idSchema } from "./schemas";
import { normaliseDescription } from "./fingerprint";

/** Inclusive day range. */
export const periodSchema = z.object({ from: daySchema, to: daySchema }).refine((p) => p.from <= p.to, "`from` must be on or before `to`.");

export type PeriodInput = z.input<typeof periodSchema>;
type Period = z.output<typeof periodSchema>;

const live = (userId: string, p: Period) => ({
  userId,
  deletedAt: null,
  transferId: null,
  bookedOn: { gte: p.from, lte: p.to },
});

export interface BreakdownRow {
  key: string | null;
  label: string;
  total: bigint;
  count: number;
  /** Share of the period total, 0–1. */
  share: number;
}

export const breakdownSchema = z.object({
  period: periodSchema,
  by: z.enum(["category", "payee", "account"]).default("category"),
  kind: z.enum(["EXPENSE", "INCOME"]).default("EXPENSE"),
  accountId: idSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

/** Totals per category, payee, or account; expenses are returned as positive numbers. */
export async function spendingBreakdown(userId: string, input: z.input<typeof breakdownSchema>): Promise<{ total: bigint; rows: BreakdownRow[] }> {
  const f = breakdownSchema.parse(input);
  const where = {
    ...live(userId, f.period),
    ...(f.accountId ? { accountId: f.accountId } : {}),
    amount: f.kind === "EXPENSE" ? { lt: 0n } : { gt: 0n },
  };
  const field = f.by === "category" ? "categoryId" : f.by === "payee" ? "payee" : "accountId";
  const groups = await db.transaction.groupBy({ by: [field], where, _sum: { amount: true }, _count: { _all: true } });

  const names = await labelsFor(userId, f.by, groups.map((g) => g[field]));
  const sign = f.kind === "EXPENSE" ? -1n : 1n;
  const rows = groups.map((g) => ({
    key: g[field],
    label: g[field] === null ? "(none)" : (names.get(g[field]) ?? g[field]),
    total: (g._sum.amount ?? 0n) * sign,
    count: g._count._all,
  }));
  const total = rows.reduce((s, r) => s + r.total, 0n);
  return {
    total,
    rows: rows
      .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0))
      .slice(0, f.limit)
      .map((r) => ({ ...r, share: total === 0n ? 0 : Number((r.total * 10_000n) / total) / 10_000 })),
  };
}

async function labelsFor(userId: string, by: "category" | "payee" | "account", keys: (string | null)[]): Promise<Map<string, string>> {
  const ids = keys.filter((k): k is string => k !== null);
  if (by === "payee") return new Map(ids.map((k) => [k, k]));
  const rows =
    by === "category"
      ? await db.category.findMany({ where: { userId, id: { in: ids } }, select: { id: true, name: true } })
      : await db.account.findMany({ where: { userId, id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

export interface PeriodComparison {
  a: { total: bigint };
  b: { total: bigint };
  rows: { key: string | null; label: string; a: bigint; b: bigint; change: bigint; changePct: number | null }[];
}

/** Category spending in period A vs period B, biggest absolute movers first. */
export async function comparePeriods(userId: string, a: PeriodInput, b: PeriodInput, kind: "EXPENSE" | "INCOME" = "EXPENSE"): Promise<PeriodComparison> {
  const [ra, rb] = await Promise.all([
    spendingBreakdown(userId, { period: a, kind, limit: 100 }),
    spendingBreakdown(userId, { period: b, kind, limit: 100 }),
  ]);
  const keys = new Map<string | null, string>();
  for (const r of [...ra.rows, ...rb.rows]) keys.set(r.key, r.label);
  const rows = [...keys].map(([key, label]) => {
    const va = ra.rows.find((r) => r.key === key)?.total ?? 0n;
    const vb = rb.rows.find((r) => r.key === key)?.total ?? 0n;
    const change = vb - va;
    return { key, label, a: va, b: vb, change, changePct: va === 0n ? null : Math.round((Number(change) / Number(va)) * 1000) / 10 };
  });
  rows.sort((x, y) => {
    const ax = x.change < 0n ? -x.change : x.change;
    const ay = y.change < 0n ? -y.change : y.change;
    return ay > ax ? 1 : ay < ax ? -1 : 0;
  });
  return { a: { total: ra.total }, b: { total: rb.total }, rows };
}

export const cashflowSchema = z.object({
  period: periodSchema,
  interval: z.enum(["day", "week", "month"]).default("month"),
  accountId: idSchema.optional(),
});

export interface CashflowBucket {
  start: string;
  income: bigint;
  expense: bigint;
  net: bigint;
}

/** Income, spending, and net per day/week/month. Transfers are excluded. */
export async function cashflow(userId: string, input: z.input<typeof cashflowSchema>): Promise<CashflowBucket[]> {
  const f = cashflowSchema.parse(input);
  const account = f.accountId ? Prisma.sql`AND "accountId" = ${f.accountId}` : Prisma.empty;
  const rows = await db.$queryRaw<{ bucket: Date; income: bigint | null; expense: bigint | null }[]>`
    SELECT date_trunc(${f.interval}, "bookedOn")::date AS bucket,
           SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)::bigint AS income,
           SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END)::bigint AS expense
    FROM transactions
    WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "transferId" IS NULL
      AND "bookedOn" BETWEEN ${f.period.from} AND ${f.period.to} ${account}
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => {
    const income = r.income ?? 0n;
    const expense = r.expense ?? 0n;
    return { start: r.bucket.toISOString().slice(0, 10), income, expense, net: income - expense };
  });
}

export interface Anomalies {
  large: { id: string; bookedOn: string; description: string; amount: bigint; reason: string }[];
  newPayees: { name: string; firstSeen: string; total: bigint }[];
  possibleDuplicates: { ids: string[]; bookedOn: string; description: string; amount: bigint }[];
}

/**
 * Things worth a second look in a period: unusually large expenses (against the previous
 * 90 days), payees never seen in the previous 180 days, and same-day identical charges.
 */
export async function findAnomalies(userId: string, input: PeriodInput): Promise<Anomalies> {
  const p = periodSchema.parse(input);
  const day = 86_400_000;
  const [inPeriod, history] = await Promise.all([
    db.transaction.findMany({ where: { ...live(userId, p), amount: { lt: 0n } }, orderBy: { bookedOn: "asc" } }),
    db.transaction.findMany({
      where: { userId, deletedAt: null, transferId: null, amount: { lt: 0n }, bookedOn: { gte: new Date(p.from.getTime() - 180 * day), lt: p.from } },
      select: { amount: true, bookedOn: true, payee: true, description: true },
    }),
  ]);

  const recent = history.filter((h) => h.bookedOn.getTime() >= p.from.getTime() - 90 * day).map((h) => Number(-h.amount));
  const threshold = recent.length >= 10 ? mean(recent) + 3 * stddev(recent) : null;
  const large = inPeriod
    .filter((t) => (threshold === null ? false : Number(-t.amount) > threshold))
    .map((t) => ({ id: t.id, bookedOn: day10(t.bookedOn), description: t.description, amount: -t.amount, reason: "more than 3 standard deviations above the last 90 days" }));

  const seen = new Set(history.map((h) => payeeKey(h.payee, h.description)));
  const newPayees = new Map<string, { name: string; firstSeen: string; total: bigint }>();
  for (const t of inPeriod) {
    const key = payeeKey(t.payee, t.description);
    if (seen.has(key)) continue;
    const entry = newPayees.get(key) ?? { name: t.payee ?? t.description, firstSeen: day10(t.bookedOn), total: 0n };
    newPayees.set(key, { ...entry, total: entry.total - t.amount });
  }

  const byFingerprint = new Map<string, typeof inPeriod>();
  for (const t of inPeriod) byFingerprint.set(t.fingerprint, [...(byFingerprint.get(t.fingerprint) ?? []), t]);
  const possibleDuplicates = [...byFingerprint.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ ids: group.map((g) => g.id), bookedOn: day10(group[0].bookedOn), description: group[0].description, amount: -group[0].amount }));

  return { large, newPayees: [...newPayees.values()], possibleDuplicates };
}

const day10 = (d: Date): string => d.toISOString().slice(0, 10);
const payeeKey = (payee: string | null, description: string): string => normaliseDescription(payee ?? description);
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const stddev = (xs: number[]): number => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};
