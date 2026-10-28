import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { ACCOUNT_ICONS } from "@/components/account-icons";
import { HIDE_AMOUNTS_COOKIE } from "@/components/amounts-cookie";
import { BudgetMeter } from "@/components/budget-meter";
import { CashflowChart } from "@/components/cashflow-chart";
import { CategoryIcon } from "@/components/category-icons";
import { AllocationCard } from "@/components/dashboard/allocation-card";
import { HeroCard } from "@/components/dashboard/hero-card";
import { MonthCard } from "@/components/dashboard/month-card";
import { Shortcuts } from "@/components/dashboard/shortcuts";
import { SpendingActivity } from "@/components/dashboard/spending-activity";
import { GoalCard } from "@/components/goal-card";
import { DEBT_TONE } from "@/components/plan-tones";
import { StatusLabel } from "@/components/status-meter";
import { TransactionList } from "@/components/transaction-list";
import { Card } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { listAccounts } from "@/server/domain/accounts";
import { listAssets } from "@/server/domain/assets";
import { budgetStatus } from "@/server/domain/budgets";
import { todayIn } from "@/server/domain/dates";
import { debtsDue } from "@/server/domain/debts";
import { listGoals } from "@/server/domain/goals";
import { monthlyCashflow } from "@/server/domain/insights";
import { formatMoney } from "@/server/domain/money";
import { getOverview } from "@/server/domain/overview";
import { spendingBreakdown } from "@/server/domain/reports";
import { findTransactions } from "@/server/domain/transaction-queries";
import { allocation, netWorthTrend, spendingByDay } from "@/server/domain/wealth";
import { getDictionary } from "@/i18n/server";
import { fmt, formatDay, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Dashboard" };

function SectionHead({ title, href, more }: { title: string; href: string; more: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-semibold">{title}</h2>
      <Link href={href} className="text-sm text-accent hover:underline">
        {more}
      </Link>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const hidden = (await cookies()).get(HIDE_AMOUNTS_COOKIE)?.value === "1";
  const today = todayIn(timezone);
  const month = today.slice(0, 7);
  const il = intlLocale(locale);
  const [o, trend, recent, budgets, points, due, goals, days, split, top, accounts, assets] = await Promise.all([
    getOverview(user.id, timezone),
    netWorthTrend(user.id, today, 6),
    findTransactions(user.id, { pageSize: 6 }),
    budgetStatus(user.id, month, today),
    monthlyCashflow(user.id, month, 6, il, user.baseCurrency),
    debtsDue(user.id, today),
    listGoals(user.id, today),
    spendingByDay(user.id, today, 7),
    allocation(user.id, month),
    spendingBreakdown(user.id, { period: { from: `${month}-01`, to: today }, by: "category", limit: 5 }),
    listAccounts(user.id),
    listAssets(user.id),
  ]);
  const styles = new Map(
    (await db.category.findMany({ where: { userId: user.id, id: { in: top.rows.flatMap((r) => (r.key ? [r.key] : [])) } }, select: { id: true, icon: true, color: true } })).map((c) => [c.id, c]),
  );

  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const compactFmt = new Intl.NumberFormat(il, { style: "currency", currency: user.baseCurrency, notation: "compact", maximumFractionDigits: 1 });
  const compact = (v: bigint) => compactFmt.format(Number(v));
  const date = (d: string) => formatDay(d, il);
  const h = t.home;

  const hasHistory = points.some((p) => p.income > 0 || p.expense > 0);
  const lastMonth = points.at(-2);
  const expenseChange = lastMonth && lastMonth.expense > 0 ? Math.round(((Number(o.expenseThisMonth) - lastMonth.expense) / lastMonth.expense) * 100) : null;
  const { daysElapsed, daysInMonth } = budgets.progress;
  const left = budgets.budgeted - budgets.spentInBudgets;
  const safePerDay = budgets.budgeted > 0n ? (left > 0n ? left / BigInt(Math.max(daysInMonth - daysElapsed + 1, 1)) : 0n) : null;
  const openGoals = goals.filter((g) => g.progress.state !== "achieved").slice(0, 3);
  const topMax = top.rows[0]?.total ?? 0n;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <p className="text-sm text-muted">{fmt(t.dashboard.greeting, { name: user.name })}</p>
        <h1 className="text-2xl font-bold tracking-tight">{h.title}</h1>
      </header>

      {o.accountCount === 0 && (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-surface p-6">
          <Wallet className="text-accent" aria-hidden="true" />
          <h2 className="font-semibold">{t.dashboard.emptyTitle}</h2>
          <p className="max-w-prose text-sm text-muted">{t.dashboard.emptyBody}</p>
          <Link href="/accounts" className="rounded-sm bg-accent px-3 py-2 text-sm font-semibold text-accent-text">
            {t.nav.accounts}
          </Link>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <HeroCard
            wealth={o.wealth}
            trend={trend}
            assetCount={assets.length}
            hidden={hidden}
            money={money}
            labels={{
              netWorth: h.netWorth,
              assets: h.assets,
              liabilities: h.liabilities,
              accounts: fmt(h.accounts, { n: o.accountCount }),
              assetCount: fmt(h.assetCount, { n: assets.length }),
              trend: h.trend,
              hide: t.mobileNav.hideAmounts,
              show: t.mobileNav.showAmounts,
            }}
          />
          <Shortcuts labels={h.shortcuts} />
        </div>
        <MonthCard
          income={o.incomeThisMonth}
          expense={o.expenseThisMonth}
          expenseChange={expenseChange}
          money={money}
          labels={{ title: h.thisMonth, saved: h.saved, overspent: h.overspent, income: h.income, expense: h.expense, vsLastMonth: h.vsLastMonth, net: h.net }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SpendingActivity
          days={days}
          safePerDay={safePerDay}
          locale={il}
          money={money}
          compact={compact}
          labels={{ title: h.activity, total: h.total7, perDay: h.perDay, safePerDay: h.safePerDay, noBudget: h.noBudget, today: h.today }}
        />
        <AllocationCard
          data={split}
          money={money}
          labels={{ title: h.allocation, intro: h.allocationIntro, needs: h.needs, wants: h.wants, savings: h.savings, target: h.target, unclassified: h.unclassified, markCategories: h.markCategories, noIncome: h.noIncome }}
        />
        <Card>
          <SectionHead title={h.topCategories} href={`/reports?month=${month}`} more={t.reports.title} />
          {top.rows.length === 0 ? (
            <p className="text-sm text-muted">{t.reports.noData}</p>
          ) : (
            <ul className="space-y-3">
              {top.rows.map((row) => {
                const style = row.key ? styles.get(row.key) : undefined;
                return (
                  <li key={row.key ?? "none"}>
                    <Link href={`/transactions?month=${month}&kind=EXPENSE&category=${row.key ?? "none"}`} className="group flex items-center gap-3">
                      <CategoryIcon icon={style?.icon} color={style?.color} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between gap-2 text-sm">
                          <span className="truncate group-hover:underline">{row.key ? row.label : t.tx.uncategorized}</span>
                          <span className="num whitespace-nowrap font-medium">{money(row.total)}</span>
                        </span>
                        <span className="mt-1 block h-1.5 rounded-sm bg-surface-2">
                          <span className="block h-full rounded-sm bg-chart-bar" style={{ width: `${topMax === 0n ? 0 : (Number(row.total) / Number(topMax)) * 100}%` }} />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {(budgets.lines.length > 0 || due.length > 0 || openGoals.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {budgets.lines.length > 0 && (
            <Card>
              <SectionHead title={t.budgets.title} href="/budgets" more={t.dashboard.seeAll} />
              <ul className="space-y-3">
                {budgets.lines.slice(0, 4).map((l) => (
                  <li key={l.categoryId}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="truncate">{l.name}</span>
                      <span className="num whitespace-nowrap text-muted">{fmt(t.budgets.spentOf, { spent: compact(l.spent), budget: compact(l.amount) })}</span>
                    </div>
                    <BudgetMeter used={l.used} projected={l.amount === 0n ? 0 : Number(l.projected) / Number(l.amount)} state={l.state} label={t.budgets.state[l.state]} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {due.length > 0 && (
            <Card>
              <SectionHead title={t.plansDashboard.due} href="/debts" more={t.dashboard.seeAll} />
              <ul className="divide-y divide-border text-sm">
                {due.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <Link href={`/debts/${d.id}`} className="font-medium hover:underline">
                        {d.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {d.status.next ? date(d.status.next.dueOn) : ""} · {d.direction === "BORROWED" ? t.plansDashboard.owe : t.plansDashboard.owed}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="num block font-medium">{money(d.status.next ? d.status.next.amount - d.status.next.paid : 0n)}</span>
                      <StatusLabel tone={DEBT_TONE[d.status.state]} label={t.debts.state[d.status.state]} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {openGoals.length > 0 && (
            <Card>
              <SectionHead title={t.plansDashboard.goals} href="/goals" more={t.dashboard.seeAll} />
              <ul className="space-y-3 [&>li]:border-0 [&>li]:p-0">
                {openGoals.map((g) => (
                  <GoalCard key={g.id} goal={g} t={t} money={money} date={date} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {accounts.length > 0 && (
          <Card>
            <SectionHead title={h.myAccounts} href="/accounts" more={t.dashboard.seeAll} />
            <ul className="space-y-2.5">
              {accounts.slice(0, 6).map((a) => {
                const Icon = ACCOUNT_ICONS[a.type];
                return (
                  <li key={a.id}>
                    <Link href={`/accounts/${a.id}`} className="flex items-center gap-3 text-sm hover:underline">
                      <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <span className={`num whitespace-nowrap font-medium ${a.balance < 0n ? "text-expense" : ""}`}>{money(a.balance)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <Card>
          <SectionHead title={h.myAssets} href="/assets" more={assets.length ? t.dashboard.seeAll : t.assets.add} />
          {assets.length === 0 ? (
            <p className="text-sm text-muted">{t.assets.intro}</p>
          ) : (
            <ul className="space-y-2.5">
              {assets.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <Link href={`/assets/${a.id}`} className="flex items-center gap-3 text-sm hover:underline">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{a.name}</span>
                      <span className="block text-xs text-muted">{t.assets.kinds[a.kind]}</span>
                    </span>
                    <span className="text-right">
                      <span className="num block font-medium">{money(a.value)}</span>
                      {a.gain !== null && a.gain !== 0n && (
                        <span className={`num block text-xs ${a.gain > 0n ? "text-income" : "text-expense"}`}>
                          {a.gain > 0n ? "+" : ""}
                          {compact(a.gain)}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {hasHistory && (
          <Card className={accounts.length > 0 ? "" : "lg:col-span-2"}>
            <SectionHead title={t.reports.cashflowShort} href="/reports" more={t.reports.title} />
            <CashflowChart
              points={points}
              locale={il}
              height={160}
              labels={{ income: t.reports.income, spending: t.reports.spending, net: t.reports.net, month: t.reports.month, showTable: t.reports.showTable }}
            />
          </Card>
        )}
      </div>

      {recent.items.length > 0 && (
        <section>
          <SectionHead title={t.dashboard.recent} href="/transactions" more={t.dashboard.seeAll} />
          <TransactionList items={recent.items} t={t} locale={locale} />
        </section>
      )}
    </div>
  );
}
