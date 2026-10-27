import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getOverview } from "@/server/domain/overview";
import { formatMoney } from "@/server/domain/money";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/dictionaries";
import { db } from "@/server/db";
import { findTransactions } from "@/server/domain/transaction-queries";
import { TransactionList } from "@/components/transaction-list";
import { intlLocale } from "@/i18n/dictionaries";

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

export default async function DashboardPage() {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const [o, recent] = await Promise.all([getOverview(user.id, timezone), findTransactions(user.id, { pageSize: 8 })]);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, intlLocale(locale));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{fmt(t.dashboard.greeting, { name: user.name })}</h1>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label={t.dashboard.netWorth} value={money(o.netWorth)} />
        <Stat label={t.dashboard.incomeThisMonth} value={money(o.incomeThisMonth)} tone="income" />
        <Stat label={t.dashboard.expenseThisMonth} value={money(o.expenseThisMonth)} tone="expense" />
      </section>

      <p className="text-sm text-muted">
        {t.dashboard.accounts}: <span className="num">{o.accountCount}</span> · {t.nav.categories}:{" "}
        <span className="num">{o.categoryCount}</span>
      </p>

      {recent.items.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t.dashboard.recent}</h2>
            <Link href="/transactions" className="text-sm text-accent hover:underline">
              {t.dashboard.seeAll}
            </Link>
          </div>
          <TransactionList items={recent.items} t={t} locale={locale} />
        </section>
      )}

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
    </div>
  );
}
