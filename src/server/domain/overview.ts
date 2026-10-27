import "server-only";

import { db } from "@/server/db";

export interface Overview {
  netWorth: bigint;
  incomeThisMonth: bigint;
  expenseThisMonth: bigint;
  accountCount: number;
  categoryCount: number;
}

/** First day of the current month and of the next, as UTC dates for a DATE column. */
function monthBounds(now: Date, timeZone: string): { start: Date; end: Date } {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

/** Headline numbers for the dashboard. Transfers are excluded from income and spending. */
export async function getOverview(userId: string, timeZone: string): Promise<Overview> {
  const { start, end } = monthBounds(new Date(), timeZone);
  const live = { userId, deletedAt: null };
  const thisMonth = { ...live, transferId: null, bookedOn: { gte: start, lt: end } };

  const [opening, movement, income, expense, accountCount, categoryCount] = await Promise.all([
    db.account.aggregate({ where: { userId, archivedAt: null }, _sum: { openingBalance: true } }),
    db.transaction.aggregate({ where: { ...live, account: { archivedAt: null } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { ...thisMonth, amount: { gt: 0 } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { ...thisMonth, amount: { lt: 0 } }, _sum: { amount: true } }),
    db.account.count({ where: { userId, archivedAt: null } }),
    db.category.count({ where: { userId, archivedAt: null } }),
  ]);

  return {
    netWorth: (opening._sum.openingBalance ?? 0n) + (movement._sum.amount ?? 0n),
    incomeThisMonth: income._sum.amount ?? 0n,
    expenseThisMonth: -(expense._sum.amount ?? 0n),
    accountCount,
    categoryCount,
  };
}
