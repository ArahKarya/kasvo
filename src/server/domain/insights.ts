import "server-only";

import { nextMonth } from "./budgets";
import { formatMoney } from "./money";
import { cashflow } from "./reports";
import type { CashflowPoint } from "@/components/cashflow-chart";

/** The `n` months ending with `endMonth`, gaps filled with zeros, ready for the chart. */
export async function monthlyCashflow(userId: string, endMonth: string, n: number, locale: string, currency: string): Promise<CashflowPoint[]> {
  const [y, m] = endMonth.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - n, 1)).toISOString().slice(0, 7);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const buckets = await cashflow(userId, { period: { from: `${first}-01`, to: last }, interval: "month" });
  const byMonth = new Map(buckets.map((b) => [b.start.slice(0, 7), b]));
  const short = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const money = (v: bigint) => formatMoney(v, currency, locale);

  const points: CashflowPoint[] = [];
  for (let month = first, i = 0; i < n; month = nextMonth(month), i++) {
    const b = byMonth.get(month);
    const date = new Date(`${month}-01T00:00:00Z`);
    const income = b?.income ?? 0n;
    const expense = b?.expense ?? 0n;
    points.push({
      label: short.format(date),
      title: long.format(date),
      income: Number(income),
      expense: Number(expense),
      incomeText: money(income),
      expenseText: money(expense),
      netText: money(income - expense),
    });
  }
  return points;
}
