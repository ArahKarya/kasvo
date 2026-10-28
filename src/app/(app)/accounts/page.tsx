import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";
import { ACCOUNT_ICONS } from "@/components/account-icons";
import { createAccountAction } from "@/app/actions/ledger";
import { AccountFields } from "@/components/account-fields";
import { ActionForm } from "@/components/action-form";
import { Disclosure } from "@/components/disclosure";
import { Amount, Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { ACCOUNT_TYPES, listAccounts } from "@/server/domain/accounts";
import { todayIn } from "@/server/domain/dates";
import { formatMoney } from "@/server/domain/money";
import { getDictionary } from "@/i18n/server";
import { fmt, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const showArchived = (await searchParams).archived === "1";
  const [accounts, { timezone }] = await Promise.all([
    listAccounts(user.id, { includeArchived: showArchived }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } }),
  ]);
  const money = (v: bigint, currency = user.baseCurrency) => formatMoney(v, currency, intlLocale(locale));
  const active = accounts.filter((a) => !a.archivedAt);
  const base = active.filter((a) => a.currency === user.baseCurrency);
  const total = base.reduce((sum, a) => sum + a.balance, 0n);
  const positive = base.filter((a) => a.balance > 0n).reduce((sum, a) => sum + a.balance, 0n);
  const owed = base.filter((a) => a.balance < 0n).reduce((sum, a) => sum - a.balance, 0n);
  const addForm = (
    <Card>
      <Disclosure summary={t.accounts.add} defaultOpen={accounts.length === 0}>
        <ActionForm action={createAccountAction} submit={t.common.save} success={t.common.saved} resetOnSuccess className="mt-4">
          <AccountFields t={t} today={todayIn(timezone)} />
        </ActionForm>
      </Disclosure>
    </Card>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageTitle
        actions={
          <Link href={showArchived ? "/accounts" : "/accounts?archived=1"} className="text-sm text-muted hover:text-text">
            {showArchived ? t.accounts.title : t.common.showArchived}
          </Link>
        }
      >
        {t.accounts.title}
      </PageTitle>

      {active.length > 0 && (
        <section className="rounded-2xl bg-[linear-gradient(135deg,#1d7a57_0%,#145c42_55%,#0f4a35_100%)] p-5 text-white">
          <span className="rounded-sm bg-white/15 px-2 py-1 text-xs font-medium">{fmt(t.home.accounts, { n: active.length })}</span>
          <p className="mt-4 text-sm text-white/75">{t.accounts.total}</p>
          <p className="num text-3xl font-bold tracking-tight">{money(total)}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3">
            <div>
              <dt className="text-xs text-white/70">↗ {t.home.assets}</dt>
              <dd className="num font-semibold">{money(positive)}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/70">↘ {t.home.liabilities}</dt>
              <dd className="num font-semibold">{money(owed)}</dd>
            </div>
          </dl>
        </section>
      )}

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <Wallet size={28} className="text-accent" aria-hidden="true" />
          <p className="text-sm text-muted">{t.accounts.empty}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ACCOUNT_TYPES.filter((type) => accounts.some((a) => a.type === type)).map((type) => {
            const Icon = ACCOUNT_ICONS[type];
            const group = accounts.filter((a) => a.type === type);
            const subtotal = group.filter((a) => !a.archivedAt && a.currency === user.baseCurrency).reduce((sum, a) => sum + a.balance, 0n);
            return (
              <Card key={type} className="overflow-hidden p-0">
                <h2 className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    <Icon size={16} className="text-accent" aria-hidden="true" />
                    {t.accountType[type]}
                  </span>
                  <span className={`num font-medium ${subtotal < 0n ? "text-expense" : "text-muted"}`}>{money(subtotal)}</span>
                </h2>
                <ul className="divide-y divide-border">
                  {group.map((a) => (
                    <li key={a.id}>
                      <Link href={`/accounts/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                        <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                          <Icon size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {a.name}
                            {a.archivedAt && <span className="ml-2 text-xs text-muted">({t.common.archived})</span>}
                          </p>
                          <p className="text-xs text-muted">{[a.institution, fmt(t.accounts.transactions, { n: a.transactionCount })].filter(Boolean).join(" · ")}</p>
                        </div>
                        <Amount value={money(a.balance, a.currency)} sign={a.balance < 0n ? -1 : 0} muted={Boolean(a.archivedAt)} />
                        <ChevronRight size={16} className="text-muted" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      {addForm}
    </div>
  );
}
