import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { BudgetMeter } from "@/components/budget-meter";
import { DEBT_TONE } from "@/components/plan-tones";
import { GoalCard } from "@/components/goal-card";
import { StatusLabel } from "@/components/status-meter";
import { CashflowChart } from "@/components/cashflow-chart";
import { TransactionList } from "@/components/transaction-list";
import { Card } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { budgetStatus } from "@/server/domain/budgets";
import { debtsDue } from "@/server/domain/debts";
import { listGoals } from "@/server/domain/goals";
import { todayIn } from "@/server/domain/dates";
import { monthlyCashflow } from "@/server/domain/insights";
import { formatMoney } from "@/server/domain/money";
import { getOverview } from "@/server/domain/overview";
import { findTransactions } from "@/server/domain/transaction-queries";
import { getDictionary } from "@/i18n/server";
import { fmt, formatDay, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Dashboard" };

interface StatProps {
  label: string;
  value: string;
  tone?: "income" | "expense";
  className?: string;
}

function Stat({ label, value, tone, className = "" }: StatProps) {
  const color = tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : "";
  return (
    <div className={`min-w-0 rounded-sm border border-border bg-surface p-3 sm:p-4 ${className}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`num mt-1 truncate text-lg font-bold tracking-tight sm:text-2xl ${color}`}>{value}</p>
    </div>
  );
}

function SectionHead({ title, href, more }: { title: string; href: string; more: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
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
  const today = todayIn(timezone);
  const month = today.slice(0, 7);
  const il = intlLocale(locale);
  const [o, recent, budgets, points, due, goals] = await Promise.all([
    getOverview(user.id, timezone),
    findTransactions(user.id, { pageSize: 8 }),
    budgetStatus(user.id, month, today),
    monthlyCashflow(user.id, month, 6, il, user.baseCurrency),
    debtsDue(user.id, today),
    listGoals(user.id, today),
  ]);
  const date = (d: string) => formatDay(d, il);
  const openGoals = goals.filter((g) => g.progress.state !== "achieved").slice(0, 3);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const hasHistory = points.some((p) => p.income > 0 || p.expense > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{fmt(t.dashboard.greeting, { name: user.name })}</h1>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t.dashboard.netWorth} value={money(o.netWorth)} className="col-span-2 sm:col-span-1" />
        <Stat label={t.dashboard.incomeThisMonth} value={money(o.incomeThisMonth)} tone="income" />
        <Stat label={t.dashboard.expenseThisMonth} value={money(o.expenseThisMonth)} tone="expense" />
      </section>

      {o.accountCount === 0 && (
        <section className="flex flex-col items-start gap-3 rounded-sm border border-dashed border-border bg-surface p-6">
          <Wallet className="text-accent" aria-hidden="true" />
          <h2 className="font-semibold">{t.dashboard.emptyTitle}</h2>
          <p className="max-w-prose text-sm text-muted">{t.dashboard.emptyBody}</p>
          <Link href="/accounts" className="rounded-sm bg-accent px-3 py-2 text-sm font-semibold text-accent-text">
            {t.nav.accounts}
          </Link>
        </section>
      )}

      {(hasHistory || budgets.lines.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-5">
          {hasHistory && (
            <Card className="lg:col-span-3">
              <SectionHead title={t.reports.cashflowShort} href="/reports" more={t.reports.title} />
              <CashflowChart
                points={points}
                locale={il}
                height={180}
                labels={{ income: t.reports.income, spending: t.reports.spending, net: t.reports.net, month: t.reports.month, showTable: t.reports.showTable }}
              />
            </Card>
          )}
          {budgets.lines.length > 0 && (
            <Card className={hasHistory ? "lg:col-span-2" : "lg:col-span-5"}>
              <SectionHead title={t.budgets.title} href="/budgets" more={t.dashboard.seeAll} />
              <ul className="space-y-3">
                {budgets.lines.slice(0, 4).map((l) => (
                  <li key={l.categoryId}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="truncate">{l.name}</span>
                      <span className="num whitespace-nowrap text-muted">{fmt(t.budgets.spentOf, { spent: money(l.spent), budget: money(l.amount) })}</span>
                    </div>
                    <BudgetMeter used={l.used} projected={l.amount === 0n ? 0 : Number(l.projected) / Number(l.amount)} state={l.state} label={t.budgets.state[l.state]} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {(due.length > 0 || openGoals.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
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
            <Card className={due.length > 0 ? "" : "lg:col-span-2"}>
              <SectionHead title={t.plansDashboard.goals} href="/goals" more={t.dashboard.seeAll} />
              <ul className="space-y-2 [&>li]:border-0 [&>li]:p-0">
                {openGoals.map((g) => (
                  <GoalCard key={g.id} goal={g} t={t} money={money} date={date} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {recent.items.length > 0 && (
        <section>
          <SectionHead title={t.dashboard.recent} href="/transactions" more={t.dashboard.seeAll} />
          <TransactionList items={recent.items} t={t} locale={locale} />
        </section>
      )}
    </div>
  );
}
