import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { BudgetMeter } from "@/components/budget-meter";
import { CashflowChart } from "@/components/cashflow-chart";
import { TransactionList } from "@/components/transaction-list";
import { Card } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { budgetStatus } from "@/server/domain/budgets";
import { todayIn } from "@/server/domain/dates";
import { monthlyCashflow } from "@/server/domain/insights";
import { formatMoney } from "@/server/domain/money";
import { getOverview } from "@/server/domain/overview";
import { findTransactions } from "@/server/domain/transaction-queries";
import { getDictionary } from "@/i18n/server";
import { fmt, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Dashboard" };

interface StatProps {
  label: string;
  value: string;
  tone?: "income" | "expense";
}

function Stat({ label, value, tone }: StatProps) {
  const color = tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : "";
  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`num mt-1 text-2xl font-bold tracking-tight ${color}`}>{value}</p>
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
  const [o, recent, budgets, points] = await Promise.all([
    getOverview(user.id, timezone),
    findTransactions(user.id, { pageSize: 8 }),
    budgetStatus(user.id, month, today),
    monthlyCashflow(user.id, month, 6, il, user.baseCurrency),
  ]);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const hasHistory = points.some((p) => p.income > 0 || p.expense > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{fmt(t.dashboard.greeting, { name: user.name })}</h1>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label={t.dashboard.netWorth} value={money(o.netWorth)} />
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

      {recent.items.length > 0 && (
        <section>
          <SectionHead title={t.dashboard.recent} href="/transactions" more={t.dashboard.seeAll} />
          <TransactionList items={recent.items} t={t} locale={locale} />
        </section>
      )}
    </div>
  );
}
