import type { Metadata } from "next";
import Link from "next/link";
import { recordAction } from "@/app/actions/ledger";
import { TransactionForm } from "@/components/transaction-form";
import { TransactionList } from "@/components/transaction-list";
import { buttonClass, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { monthRange, toDay, todayIn } from "@/server/domain/dates";
import { formatMoney } from "@/server/domain/money";
import { pickerOptions } from "@/server/domain/options";
import { findTransactions } from "@/server/domain/transaction-queries";
import { getDictionary } from "@/i18n/server";
import { fmt, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Transactions" };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const today = todayIn(timezone);

  const month = one(sp.month) ?? today.slice(0, 7);
  const range = month === "all" ? null : monthRange(month);
  const filter = {
    accountId: one(sp.account),
    categoryId: one(sp.category),
    kind: one(sp.kind) as "INCOME" | "EXPENSE" | "TRANSFER" | undefined,
    q: one(sp.q),
    page: Number(one(sp.page) ?? 1) || 1,
  };
  const [{ accounts, categories }, page] = await Promise.all([
    pickerOptions(user.id),
    findTransactions(user.id, {
      ...filter,
      from: range ? toDay(range.start) : undefined,
      to: range ? toDay(new Date(range.end.getTime() - 86_400_000)) : undefined,
    }),
  ]);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, intlLocale(locale));
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const pageHref = (n: number) => {
    const params = new URLSearchParams(Object.entries({ ...sp, page: String(n) }).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    return `/transactions?${params}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageTitle>{t.tx.title}</PageTitle>

      {accounts.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t.tx.needAccount}</p>
          <Link href="/accounts" className={`${buttonClass.primary} mt-3 inline-block`}>
            {t.accounts.add}
          </Link>
        </Card>
      ) : (
        <Card>
          <h2 className="mb-3 font-semibold">{t.tx.record}</h2>
          <TransactionForm
            mode="create"
            action={recordAction}
            labels={{ tx: t.tx, common: t.common }}
            accounts={accounts}
            categories={categories}
            defaults={{ kind: "EXPENSE", accountId: filter.accountId ?? accounts[0].id, amount: "", bookedOn: today, description: "", payee: "", note: "", categoryId: "" }}
          />
        </Card>
      )}

      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label={t.common.filter}>
        <Field label={t.tx.month}>
          <Input type="month" name="month" defaultValue={month === "all" ? "" : month} />
        </Field>
        <Field label={t.tx.account}>
          <Select name="account" defaultValue={filter.accountId ?? ""}>
            <option value="">{t.common.all}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.tx.category}>
          <Select name="category" defaultValue={filter.categoryId ?? ""}>
            <option value="">{t.common.all}</option>
            <option value="none">{t.tx.uncategorized}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.tx.kind}>
          <Select name="kind" defaultValue={filter.kind ?? ""}>
            <option value="">{t.common.all}</option>
            <option value="EXPENSE">{t.tx.expense}</option>
            <option value="INCOME">{t.tx.income}</option>
            <option value="TRANSFER">{t.tx.transfer}</option>
          </Select>
        </Field>
        <Field label={t.tx.search}>
          <Input type="search" name="q" defaultValue={filter.q} placeholder={t.tx.searchPlaceholder} />
        </Field>
        <div className="flex items-end gap-2">
          <button className={buttonClass.secondary}>{t.common.filter}</button>
          <Link href="/transactions" className={buttonClass.ghost}>
            {t.common.reset}
          </Link>
        </div>
      </form>

      <dl className="grid grid-cols-3 gap-3 text-sm">
        {[
          [t.tx.totalIncome, money(page.income), "text-income"],
          [t.tx.totalExpense, money(page.expense), "text-expense"],
          [t.tx.net, money(page.income - page.expense), ""],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-sm border border-border bg-surface px-3 py-2">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={`num font-bold ${color}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {page.items.length === 0 ? (
        <p className="text-sm text-muted">{t.tx.empty}</p>
      ) : (
        <TransactionList items={page.items} t={t} locale={locale} />
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page.page > 1 ? <Link href={pageHref(page.page - 1)} className={buttonClass.secondary}>{t.common.prev}</Link> : <span />}
          <span className="text-muted">{fmt(t.common.pageOf, { page: page.page, pages })}</span>
          {page.page < pages ? <Link href={pageHref(page.page + 1)} className={buttonClass.secondary}>{t.common.next}</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
