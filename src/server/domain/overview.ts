import "server-only";

import { db } from "@/server/db";
import { todayIn } from "./dates";
import { wealthOf, type Wealth } from "./wealth";

export interface Overview {
  /** Assets − liabilities; see `Wealth`. */
  netWorth: bigint;
  wealth: Wealth;
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
  const thisMonth = { userId, deletedAt: null, transferId: null, bookedOn: { gte: start, lt: end } };

  const [wealth, income, expense, accountCount, categoryCount] = await Promise.all([
    wealthOf(userId, todayIn(timeZone)),
    db.transaction.aggregate({ where: { ...thisMonth, amount: { gt: 0 } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { ...thisMonth, amount: { lt: 0 } }, _sum: { amount: true } }),
    db.account.count({ where: { userId, archivedAt: null } }),
    db.category.count({ where: { userId, archivedAt: null } }),
  ]);

  return {
    netWorth: wealth.netWorth,
    wealth,
    incomeThisMonth: income._sum.amount ?? 0n,
    expenseThisMonth: -(expense._sum.amount ?? 0n),
    accountCount,
    categoryCount,
  };
}
