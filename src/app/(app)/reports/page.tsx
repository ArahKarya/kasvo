import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BudgetMeter } from "@/components/budget-meter";
import { CashflowChart } from "@/components/cashflow-chart";
import { CategoryIcon } from "@/components/category-icons";
import { AllocationCard } from "@/components/dashboard/allocation-card";
import { GoalCard } from "@/components/goal-card";
import { buttonClass, Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { budgetStatus, monthSchema, nextMonth, previousMonth } from "@/server/domain/budgets";
import { parseDay, todayIn } from "@/server/domain/dates";
import { listGoals } from "@/server/domain/goals";
import { monthlyCashflow } from "@/server/domain/insights";
import { formatMoney } from "@/server/domain/money";
import { comparePeriods, spendingBreakdown } from "@/server/domain/reports";
import { allocationBetween } from "@/server/domain/wealth";
import { isReportRange, previousPeriod, reportPeriod, type ReportRange } from "@/lib/report-range";
import { getDictionary } from "@/i18n/server";
import { fmt, formatDay, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const today = todayIn(timezone);
  const thisMonth = today.slice(0, 7);
  const range: ReportRange = isReportRange(sp.range) ? sp.range : "month";
  const month = typeof sp.month === "string" && monthSchema.safeParse(sp.month).success ? sp.month : thisMonth;
  const view = sp.view === "plans" ? "plans" : "cashflow";
  const il = intlLocale(locale);
  const r = t.reports;

  const period = reportPeriod(range, month, today);
  const before = previousPeriod(range, month, today);
  const end = new Date(parseDay(period.to)!.getTime() + 86_400_000);
  const budgetMonth = range === "month" ? month : thisMonth;

  const [points, categories, payees, comparison, split, budgets, goals] = await Promise.all([
    monthlyCashflow(user.id, period.endMonth, 12, il, user.baseCurrency),
    spendingBreakdown(user.id, { period: { from: period.from, to: period.to }, by: "category", limit: 12 }),
    spendingBreakdown(user.id, { period: { from: period.from, to: period.to }, by: "payee", limit: 8 }),
    comparePeriods(user.id, before, { from: period.from, to: period.to }),
    allocationBetween(user.id, parseDay(period.from)!, end),
    budgetStatus(user.id, budgetMonth, today),
    listGoals(user.id, today),
  ]);
  const styles = new Map(
    (await db.category.findMany({ where: { userId: user.id, id: { in: categories.rows.flatMap((c) => (c.key ? [c.key] : [])) } }, select: { id: true, icon: true, color: true } })).map((c) => [c.id, c]),
  );

  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const monthName = (m: string) => new Intl.DateTimeFormat(il, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
  const spending = categories.total;
  const net = split.income - spending;
  const rate = split.income > 0n ? Math.round((Number(net) / Number(split.income)) * 100) : null;
  const top = categories.rows[0]?.total ?? 0n;
  const periodText = range === "month" ? monthName(month) : `${formatDay(period.from, il)} – ${formatDay(period.to, il)}`;

  const href = (changes: Record<string, string>) => {
    const params = new URLSearchParams({ range, month, view, ...changes });
    if (params.get("range") !== "month") params.delete("month");
    if (params.get("view") === "cashflow") params.delete("view");
    return `/reports?${params}`;
  };
  const chips: { label: string; href: string; active: boolean }[] = [
    { label: r.ranges.month, href: href({ range: "month", month: thisMonth }), active: range === "month" && month === thisMonth },
    { label: r.ranges.lastMonth, href: href({ range: "month", month: previousMonth(thisMonth) }), active: range === "month" && month === previousMonth(thisMonth) },
    { label: r.ranges["3m"], href: href({ range: "3m" }), active: range === "3m" },
    { label: r.ranges["6m"], href: href({ range: "6m" }), active: range === "6m" },
    { label: r.ranges.ytd, href: href({ range: "ytd" }), active: range === "ytd" },
  ];
  const tab = "rounded-[4px] py-2 text-center text-sm text-muted aria-[current=true]:bg-accent aria-[current=true]:font-semibold aria-[current=true]:text-accent-text";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-sm text-muted">{r.overline}</p>
        <PageTitle>{r.title}</PageTitle>
      </div>

      <nav aria-label={r.period} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {chips.map((c) => (
          <Link key={c.label} href={c.href} aria-current={c.active} className="shrink-0 rounded-sm border border-border bg-surface px-3 py-1.5 text-sm text-muted aria-[current=true]:border-accent aria-[current=true]:bg-accent-soft aria-[current=true]:font-semibold aria-[current=true]:text-accent">
            {c.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-2">
        {range === "month" ? (
          <Link href={href({ month: previousMonth(month) })} className={buttonClass.ghost} aria-label={t.common.prev}>
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
        ) : (
          <span />
        )}
        <span className="font-semibold">{periodText}</span>
        {range === "month" && month < thisMonth ? (
          <Link href={href({ month: nextMonth(month) })} className={buttonClass.ghost} aria-label={t.common.next}>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        ) : (
          <span className="w-9" />
        )}
      </div>

      <nav className="grid grid-cols-2 rounded-sm border border-border bg-surface p-0.5" aria-label={r.title}>
        <Link href={href({ view: "cashflow" })} aria-current={view === "cashflow"} className={tab}>
          {r.tabs.cashflow}
        </Link>
        <Link href={href({ view: "plans" })} aria-current={view === "plans"} className={tab}>
          {r.tabs.plans}
        </Link>
      </nav>

      {view === "cashflow" ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [r.income, money(split.income), "text-income"],
              [r.spending, money(spending), "text-expense"],
              [r.net, money(net), net < 0n ? "text-expense" : ""],
              [r.savingsRate, rate === null ? "—" : `${rate}%`, ""],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-3 sm:p-4">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className={`num mt-1 truncate text-lg font-bold ${tone}`}>{value}</dd>
              </div>
            ))}
          </dl>

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
                <ul className="space-y-3">
                  {categories.rows.map((row) => {
                    const style = row.key ? styles.get(row.key) : undefined;
                    return (
                      <li key={row.key ?? "none"}>
                        <Link href={`/transactions?period=${range === "month" ? "month" : "all"}&date=${period.from}&kind=EXPENSE&category=${row.key ?? "none"}`} className="group flex items-center gap-3">
                          <CategoryIcon icon={style?.icon} color={style?.color} size={34} />
                          <span className="min-w-0 flex-1">
                            <span className="flex justify-between gap-3 text-sm">
                              <span className="truncate group-hover:underline">{row.key ? row.label : t.tx.uncategorized}</span>
                              <span className="num whitespace-nowrap">
                                {money(row.total)} <span className="text-xs text-muted">{Math.round(row.share * 100)}%</span>
                              </span>
                            </span>
                            <span className="mt-1.5 block h-1.5 rounded-sm bg-surface-2">
                              <span className="block h-full rounded-sm bg-chart-bar" style={{ width: `${top === 0n ? 0 : (Number(row.total) / Number(top)) * 100}%` }} />
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <div className="space-y-4">
              <Card className="p-0">
                <h2 className="px-4 pt-4 font-semibold">{r.comparedWith}</h2>
                {comparison.rows.length === 0 ? (
                  <p className="px-4 pb-4 text-sm text-muted">{r.noData}</p>
                ) : (
                  <>
                  <ul className="mt-2 divide-y divide-border text-sm sm:hidden">
                    {comparison.rows.slice(0, 8).map((row) => (
                      <li key={row.key ?? "none"} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate">{row.key ? row.label : t.tx.uncategorized}</span>
                          <span className="num block text-xs text-muted">
                            {money(row.a)} → {money(row.b)}
                          </span>
                        </span>
                        <span className={`num shrink-0 font-medium ${row.change > 0n ? "text-expense" : row.change < 0n ? "text-income" : "text-muted"}`}>
                          {row.change > 0n ? "+" : ""}
                          {row.changePct === null ? r.newCategory : `${row.changePct}%`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="hidden sm:block">
                  <table className="mt-2 w-full text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th className="px-4 py-1.5 font-medium">{t.tx.category}</th>
                        <th className="px-2 py-1.5 text-right font-medium">{r.previous}</th>
                        <th className="px-2 py-1.5 text-right font-medium">{r.current}</th>
                        <th className="px-4 py-1.5 text-right font-medium">{r.change}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {comparison.rows.slice(0, 8).map((row) => (
                        <tr key={row.key ?? "none"}>
                          <td className="max-w-40 truncate px-4 py-2">{row.key ? row.label : t.tx.uncategorized}</td>
                          <td className="num px-2 py-2 text-right text-muted">{money(row.a)}</td>
                          <td className="num px-2 py-2 text-right">{money(row.b)}</td>
                          <td className={`num px-4 py-2 text-right font-medium ${row.change > 0n ? "text-expense" : row.change < 0n ? "text-income" : "text-muted"}`}>
                            {row.change > 0n ? "+" : ""}
                            {row.changePct === null ? r.newCategory : `${row.changePct}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  </>
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
                        <li key={p.key} className="flex justify-between gap-3 px-4 py-2">
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
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{fmt(r.budgetsFor, { month: monthName(budgetMonth) })}</h2>
              <Link href={`/budgets?month=${budgetMonth}`} className="text-sm text-accent hover:underline">
                {t.budgets.title}
              </Link>
            </div>
            {budgets.lines.length === 0 ? (
              <p className="text-sm text-muted">{r.noBudgets}</p>
            ) : (
              <>
                <div className="mb-4 rounded-lg bg-surface-2 p-3">
                  <div className="mb-1.5 flex justify-between gap-2 text-sm">
                    <span>{fmt(r.budgetUsed, { pct: budgets.budgeted > 0n ? Math.round((Number(budgets.spentInBudgets) / Number(budgets.budgeted)) * 100) : 0 })}</span>
                    <span className="num font-medium">
                      {budgets.budgeted >= budgets.spentInBudgets ? fmt(r.budgetLeft, { amount: money(budgets.budgeted - budgets.spentInBudgets) }) : fmt(r.budgetOver, { amount: money(budgets.spentInBudgets - budgets.budgeted) })}
                    </span>
                  </div>
                  <div className="h-2 rounded-sm bg-border/60">
                    <div className="h-full rounded-sm bg-accent" style={{ width: `${Math.min(budgets.budgeted > 0n ? (Number(budgets.spentInBudgets) / Number(budgets.budgeted)) * 100 : 0, 100)}%` }} />
                  </div>
                </div>
                <ul className="space-y-3">
                  {budgets.lines.map((l) => (
                    <li key={l.categoryId}>
                      <div className="mb-1 flex justify-between gap-2 text-sm">
                        <span className="truncate">{l.name}</span>
                        <span className="num whitespace-nowrap text-muted">{fmt(t.budgets.spentOf, { spent: money(l.spent), budget: money(l.amount) })}</span>
                      </div>
                      <BudgetMeter used={l.used} projected={l.amount === 0n ? 0 : Number(l.projected) / Number(l.amount)} state={l.state} label={t.budgets.state[l.state]} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          <div className="space-y-4">
            <AllocationCard
              data={split}
              money={money}
              labels={{ title: t.home.allocation, intro: r.allocationIntro, needs: t.home.needs, wants: t.home.wants, savings: t.home.savings, target: t.home.target, unclassified: t.home.unclassified, markCategories: t.home.markCategories, noIncome: t.home.noIncome }}
            />
            <Card>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">{r.goals}</h2>
                <Link href="/goals" className="text-sm text-accent hover:underline">
                  {t.dashboard.seeAll}
                </Link>
              </div>
              {goals.length === 0 ? (
                <p className="text-sm text-muted">{r.noGoals}</p>
              ) : (
                <ul className="space-y-3 [&>li]:border-0 [&>li]:p-0">
                  {goals.map((g) => (
                    <GoalCard key={g.id} goal={g} t={t} money={money} date={(d) => formatDay(d, il)} />
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
