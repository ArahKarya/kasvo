import type { Metadata } from "next";
import Link from "next/link";
import { createDebtAction } from "@/app/actions/plans";
import { ActionForm } from "@/components/action-form";
import { DebtCard } from "@/components/debt-card";
import { DebtFields } from "@/components/debt-fields";
import { Disclosure } from "@/components/disclosure";
import { Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { listAccounts } from "@/server/domain/accounts";
import { todayIn } from "@/server/domain/dates";
import { listDebts, type DebtView } from "@/server/domain/debts";
import { formatMoney } from "@/server/domain/money";
import { getDictionary } from "@/i18n/server";
import { formatDay, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Debts" };

export default async function DebtsPage() {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const today = todayIn(timezone);
  const [debts, accounts] = await Promise.all([listDebts(user.id, today, { includeArchived: true }), listAccounts(user.id)]);
  const il = intlLocale(locale);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const date = (d: string) => formatDay(d, il);
  const loanAccounts = accounts.filter((a) => a.type === "LOAN" || a.type === "CREDIT_CARD");
  const open = debts.filter((d) => !d.archived && d.status.state !== "settled");
  const closed = debts.filter((d) => d.archived || d.status.state === "settled");
  const d = t.debts;

  const group = (title: string, rows: DebtView[]) =>
    rows.length > 0 && (
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{title}</h2>
          <span className="num text-sm text-muted">{money(rows.reduce((sum, r) => sum + r.status.outstanding, 0n))}</span>
        </div>
        <ul className="space-y-3">
          {rows.map((debt) => (
            <DebtCard key={debt.id} debt={debt} t={t} money={money} date={date} />
          ))}
        </ul>
      </section>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageTitle>{d.title}</PageTitle>
      <p className="-mt-3 text-sm text-muted">{d.intro}</p>

      {open.length === 0 && <p className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">{d.empty}</p>}
      {group(d.borrowed, open.filter((r) => r.direction === "BORROWED"))}
      {group(d.lent, open.filter((r) => r.direction === "LENT"))}

      <Card>
        <Disclosure summary={d.add} defaultOpen={debts.length === 0}>
          <div className="mt-4">
            <ActionForm action={createDebtAction} submit={t.common.save} success={t.common.saved} resetOnSuccess>
              <DebtFields t={t} loanAccounts={loanAccounts} today={today} />
            </ActionForm>
          </div>
        </Disclosure>
      </Card>

      {closed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">{d.settledList}</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {closed.map((c) => (
              <li key={c.id} className="flex justify-between px-4 py-2">
                <Link href={`/debts/${c.id}`} className="hover:underline">
                  {c.name}
                </Link>
                <span className="num text-muted">{money(c.status.paid)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
