import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CashflowChart } from "@/components/cashflow-chart";
import { buttonClass, Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { monthSchema, nextMonth, previousMonth } from "@/server/domain/budgets";
import { monthRange, todayIn, toDay } from "@/server/domain/dates";
import { monthlyCashflow } from "@/server/domain/insights";
import { formatMoney } from "@/server/domain/money";
import { comparePeriods, spendingBreakdown } from "@/server/domain/reports";
import { getDictionary } from "@/i18n/server";
import { fmt, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Reports" };

function periodOf(month: string) {
  const r = monthRange(month)!;
  return { from: toDay(r.start), to: toDay(new Date(r.end.getTime() - 86_400_000)) };
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const requested = (await searchParams).month;
  const month = typeof requested === "string" && monthSchema.safeParse(requested).success ? requested : todayIn(timezone).slice(0, 7);
  const il = intlLocale(locale);
  const period = periodOf(month);
  const prev = previousMonth(month);

  const [points, categories, payees, comparison] = await Promise.all([
    monthlyCashflow(user.id, month, 12, il, user.baseCurrency),
    spendingBreakdown(user.id, { period, by: "category", limit: 12 }),
    spendingBreakdown(user.id, { period, by: "payee", limit: 8 }),
    comparePeriods(user.id, periodOf(prev), period),
  ]);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const monthName = (m: string) => new Intl.DateTimeFormat(il, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
  const r = t.reports;
  const top = categories.rows[0]?.total ?? 0n;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageTitle
        actions={
          <nav className="flex items-center gap-1" aria-label={r.period}>
            <Link href={`/reports?month=${prev}`} className={buttonClass.ghost} aria-label={t.common.prev}>
              <ChevronLeft size={16} />
            </Link>
            <span className="min-w-36 text-center text-sm font-medium">{monthName(month)}</span>
            <Link href={`/reports?month=${nextMonth(month)}`} className={buttonClass.ghost} aria-label={t.common.next}>
              <ChevronRight size={16} />
            </Link>
          </nav>
        }
      >
        {r.title}
      </PageTitle>

      <Card>
        <h2 className="mb-3 font-semibold">{r.cashflow}</h2>
        <CashflowChart points={points} locale={il} labels={{ income: r.income, spending: r.spending, net: r.net, month: r.month, showTable: r.showTable }} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">{r.byCategory}</h2>
          {categories.rows.length === 0 ? (
            <p className="text-sm text-muted">{r.noData}</p>
          ) : (
            <ul className="space-y-2.5">
              {categories.rows.map((row) => (
                <li key={row.key ?? "none"}>
                  <Link href={`/transactions?month=${month}&kind=EXPENSE&category=${row.key ?? "none"}`} className="group block">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="truncate group-hover:underline">{row.key ? row.label : t.tx.uncategorized}</span>
                      <span className="num whitespace-nowrap">
                        {money(row.total)} <span className="text-xs text-muted">{Math.round(row.share * 100)}%</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-sm bg-border/50">
                      <div className="h-full rounded-sm bg-chart-bar" style={{ width: `${top === 0n ? 0 : (Number(row.total) / Number(top)) * 100}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>{r.spending}</span>
            <span className="num">{money(categories.total)}</span>
          </p>
        </Card>

        <div className="space-y-4">
          <Card className="p-0">
            <h2 className="px-4 pt-4 font-semibold">{fmt(r.compare, { month: monthName(prev) })}</h2>
            {comparison.rows.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted">{r.noData}</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-1.5 font-medium">{t.tx.category}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{monthName(prev).split(" ")[0]}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{monthName(month).split(" ")[0]}</th>
                    <th className="px-4 py-1.5 text-right font-medium">{r.change}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {comparison.rows.slice(0, 8).map((row) => (
                    <tr key={row.key ?? "none"}>
                      <td className="max-w-40 truncate px-4 py-1.5">{row.key ? row.label : t.tx.uncategorized}</td>
                      <td className="num px-2 py-1.5 text-right text-muted">{money(row.a)}</td>
                      <td className="num px-2 py-1.5 text-right">{money(row.b)}</td>
                      <td className={`num px-4 py-1.5 text-right font-medium ${row.change > 0n ? "text-expense" : row.change < 0n ? "text-income" : "text-muted"}`}>
                        {row.change > 0n ? "+" : ""}
                        {row.changePct === null ? r.newCategory : `${row.changePct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="p-0">
            <h2 className="px-4 pt-4 font-semibold">{r.byPayee}</h2>
            {payees.rows.filter((p) => p.key).length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted">{r.noData}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border text-sm">
                {payees.rows
                  .filter((p) => p.key)
                  .map((p) => (
                    <li key={p.key} className="flex justify-between gap-3 px-4 py-1.5">
                      <span className="truncate">{p.label}</span>
                      <span className="num whitespace-nowrap">
                        {money(p.total)} <span className="text-xs text-muted">×{p.count}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
