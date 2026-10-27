import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
  const total = active.filter((a) => a.currency === user.baseCurrency).reduce((sum, a) => sum + a.balance, 0n);

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

      <Card>
        <Disclosure summary={t.accounts.add} defaultOpen={accounts.length === 0}>
          <ActionForm action={createAccountAction} submit={t.common.save} success={t.common.saved} resetOnSuccess className="mt-4">
            <AccountFields t={t} today={todayIn(timezone)} />
          </ActionForm>
        </Disclosure>
      </Card>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted">{t.accounts.empty}</p>
      ) : (
        <div className="space-y-4">
          {ACCOUNT_TYPES.filter((type) => accounts.some((a) => a.type === type)).map((type) => (
            <Card key={type} className="p-0">
              <h2 className="border-b border-border px-4 py-2.5 text-xs font-semibold text-muted">{t.accountType[type]}</h2>
              <ul className="divide-y divide-border">
                {accounts
                  .filter((a) => a.type === type)
                  .map((a) => (
                    <li key={a.id}>
                      <Link href={`/accounts/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-border/30">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {a.name}
                            {a.archivedAt && <span className="ml-2 text-xs text-muted">({t.common.archived})</span>}
                          </p>
                          <p className="text-xs text-muted">
                            {[a.institution, fmt(t.accounts.transactions, { n: a.transactionCount })].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <Amount value={money(a.balance, a.currency)} sign={a.balance < 0n ? -1 : 0} muted={Boolean(a.archivedAt)} />
                        <ChevronRight size={16} className="text-muted" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
          <p className="flex justify-between px-1 text-sm">
            <span className="text-muted">{t.accounts.total}</span>
            <span className="num font-bold">{money(total)}</span>
          </p>
        </div>
      )}
    </div>
  );
}
