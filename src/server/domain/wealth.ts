import "server-only";

import { db } from "@/server/db";
import type { Necessity } from "@/generated/prisma/client";
import { addDays, monthRange, parseDay } from "./dates";

/**
 * Net worth = what the user owns − what they owe.
 * Owned: positive account balances, assets at their latest value, and money lent out (receivables
 * without a linked account). Owed: negative balances (credit cards, loan accounts) and debts
 * without a linked account. A debt linked to a loan account is already in that account's balance.
 */
export interface Wealth {
  cash: bigint;
  assets: bigint;
  receivables: bigint;
  accountDebt: bigint;
  debts: bigint;
  totalAssets: bigint;
  totalLiabilities: bigint;
  netWorth: bigint;
}

export interface NetWorthPoint {
  /** "YYYY-MM" */
  month: string;
  netWorth: bigint;
}

interface Inputs {
  accounts: { id: string; openingBalance: bigint; openingDate: Date }[];
  /** Per account, transaction sums per day ("YYYY-MM-DD"). */
  movements: { accountId: string; day: string; total: bigint }[];
  assets: { purchaseValue: bigint | null; since: Date; valuations: { valuedOn: Date; value: bigint }[] }[];
  debts: { direction: "BORROWED" | "LENT"; totalDue: bigint; since: Date; payments: { paidOn: Date; amount: bigint }[] }[];
}

async function load(userId: string): Promise<Inputs> {
  const [accounts, movements, assets, debts] = await Promise.all([
    db.account.findMany({ where: { userId, archivedAt: null }, select: { id: true, openingBalance: true, openingDate: true } }),
    db.$queryRaw<{ accountId: string; day: string; total: bigint }[]>`
      SELECT t."accountId", to_char(t."bookedOn", 'YYYY-MM-DD') AS day, SUM(t.amount)::bigint AS total
      FROM transactions t JOIN accounts a ON a.id = t."accountId"
      WHERE t."userId" = ${userId} AND t."deletedAt" IS NULL AND a."archivedAt" IS NULL
      GROUP BY 1, 2`,
    db.asset.findMany({
      where: { userId, archivedAt: null },
      select: { purchaseValue: true, purchasedOn: true, createdAt: true, valuations: { select: { valuedOn: true, value: true } } },
    }),
    db.debt.findMany({
      where: { userId, archivedAt: null, accountId: null },
      select: {
        direction: true,
        instalmentAmount: true,
        instalmentCount: true,
        createdAt: true,
        payments: { where: { OR: [{ transactionId: null }, { transaction: { deletedAt: null } }] }, select: { paidOn: true, amount: true } },
      },
    }),
  ]);
  return {
    accounts,
    movements,
    assets: assets.map((a) => ({ purchaseValue: a.purchaseValue, since: a.purchasedOn ?? a.createdAt, valuations: a.valuations })),
    debts: debts.map((d) => ({
      direction: d.direction,
      totalDue: d.instalmentAmount * BigInt(d.instalmentCount),
      since: d.createdAt,
      payments: d.payments,
    })),
  };
}

/** The position just before `end` (exclusive). */
function positionAt(input: Inputs, end: Date): Wealth {
  const endDay = end.toISOString().slice(0, 10);
  let cash = 0n;
  let accountDebt = 0n;
  for (const a of input.accounts) {
    if (a.openingDate >= end) continue;
    const moved = input.movements.filter((m) => m.accountId === a.id && m.day < endDay).reduce((s, m) => s + m.total, 0n);
    const balance = a.openingBalance + moved;
    if (balance >= 0n) cash += balance;
    else accountDebt += -balance;
  }
  let assets = 0n;
  for (const a of input.assets) {
    const latest = a.valuations.filter((v) => v.valuedOn < end).sort((x, y) => y.valuedOn.getTime() - x.valuedOn.getTime())[0];
    if (latest) assets += latest.value;
    else if (a.since < end) assets += a.purchaseValue ?? 0n;
  }
  let receivables = 0n;
  let debts = 0n;
  for (const d of input.debts) {
    if (d.since >= end) continue;
    const paid = d.payments.filter((p) => p.paidOn < end).reduce((s, p) => s + p.amount, 0n);
    const outstanding = d.totalDue > paid ? d.totalDue - paid : 0n;
    if (d.direction === "LENT") receivables += outstanding;
    else debts += outstanding;
  }
  const totalAssets = cash + assets + receivables;
  const totalLiabilities = accountDebt + debts;
  return { cash, assets, receivables, accountDebt, debts, totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
}

/** Today's net worth and what it is made of. */
export async function wealthOf(userId: string, today: string): Promise<Wealth> {
  return positionAt(await load(userId), parseDay(addDays(today, 1))!);
}

/** Net worth at the end of each of the last `months` months; the current month ends today. */
export async function netWorthTrend(userId: string, today: string, months = 6): Promise<NetWorthPoint[]> {
  const input = await load(userId);
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: months }, (_, i) => {
    const month = new Date(Date.UTC(y, m - months + i, 1)).toISOString().slice(0, 7);
    const end = i === months - 1 ? parseDay(addDays(today, 1))! : monthRange(month)!.end;
    return { month, netWorth: positionAt(input, end).netWorth };
  });
}

export interface DaySpend {
  day: string;
  total: bigint;
}

/** Spending per day for the `days` days ending today; transfers excluded. */
export async function spendingByDay(userId: string, today: string, days = 7): Promise<DaySpend[]> {
  const from = addDays(today, -(days - 1));
  const rows = await db.$queryRaw<{ day: Date; total: bigint }[]>`
    SELECT "bookedOn" AS day, SUM(-amount)::bigint AS total
    FROM transactions
    WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "transferId" IS NULL AND amount < 0
      AND "bookedOn" BETWEEN ${parseDay(from)} AND ${parseDay(today)}
    GROUP BY 1`;
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r.total]));
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i);
    return { day, total: byDay.get(day) ?? 0n };
  });
}

export interface Allocation {
  income: bigint;
  needs: bigint;
  wants: bigint;
  /** Spending in categories without a need/want default and not tagged. */
  unclassified: bigint;
  /** Income minus all spending; negative when spending exceeded income. */
  savings: bigint;
}

/** The 50/30/20 view for a month: a transaction's own tag wins, then its category's, then the parent's. */
export async function allocation(userId: string, month: string): Promise<Allocation> {
  const range = monthRange(month)!;
  const [rows, income] = await Promise.all([
    db.$queryRaw<{ necessity: Necessity | null; total: bigint }[]>`
      SELECT COALESCE(t.necessity, c.necessity, p.necessity) AS necessity, SUM(-t.amount)::bigint AS total
      FROM transactions t
      LEFT JOIN categories c ON c.id = t."categoryId"
      LEFT JOIN categories p ON p.id = c."parentId"
      WHERE t."userId" = ${userId} AND t."deletedAt" IS NULL AND t."transferId" IS NULL AND t.amount < 0
        AND t."bookedOn" >= ${range.start} AND t."bookedOn" < ${range.end}
      GROUP BY 1`,
    db.transaction.aggregate({
      where: { userId, deletedAt: null, transferId: null, amount: { gt: 0n }, bookedOn: { gte: range.start, lt: range.end } },
      _sum: { amount: true },
    }),
  ]);
  const of = (n: Necessity | null) => rows.find((r) => r.necessity === n)?.total ?? 0n;
  const totalIncome = income._sum.amount ?? 0n;
  const spent = rows.reduce((s, r) => s + r.total, 0n);
  return { income: totalIncome, needs: of("NEED"), wants: of("WANT"), unclassified: of(null), savings: totalIncome - spent };
}
