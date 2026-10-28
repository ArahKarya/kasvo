import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { QuickEntryButton } from "@/components/quick-entry-button";
import { TransactionList } from "@/components/transaction-list";
import { buttonClass, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { UndoToast } from "@/components/undo-toast";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { todayIn } from "@/server/domain/dates";
import { formatMoney } from "@/server/domain/money";
import { pickerOptions } from "@/server/domain/options";
import { dayTotals, findTransactions } from "@/server/domain/transaction-queries";
import { isPeriodKind, PERIOD_KINDS, periodRange, reachesToday, shiftPeriod, type PeriodKind } from "@/lib/period";
import { getDictionary } from "@/i18n/server";
import { fmt, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Transactions" };

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * The period comes from `period` + `date`; the older `month=YYYY-MM` (and `month=all`) used by
 * links from reports, budgets, and the dashboard still works.
 */
function periodFrom(sp: Params, today: string): { kind: PeriodKind; anchor: string } {
  const month = one(sp.month);
  if (month === "all") return { kind: "all", anchor: today };
  if (month && /^\d{4}-\d{2}$/.test(month)) return { kind: "month", anchor: `${month}-01` };
  const kind = isPeriodKind(sp.period) ? sp.period : "month";
  const date = one(sp.date);
  return { kind, anchor: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today };
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const today = todayIn(timezone);
  const il = intlLocale(locale);
  const l = t.txList;

  const { kind: period, anchor } = periodFrom(sp, today);
  const range = periodRange(period, anchor);
  const filter = {
    accountId: one(sp.account),
    categoryId: one(sp.category),
    kind: one(sp.kind) as "INCOME" | "EXPENSE" | "TRANSFER" | undefined,
    q: one(sp.q),
  };
  const query = { ...filter, from: range?.from, to: range?.to };
  const [{ accounts, categories }, page] = await Promise.all([
    pickerOptions(user.id),
    findTransactions(user.id, { ...query, page: Number(one(sp.page) ?? 1) || 1 }),
  ]);
  const days = [...new Set(page.items.map((i) => i.bookedOn.toISOString().slice(0, 10)))];
  const totals = await dayTotals(user.id, query, days);

  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const net = page.income - page.expense;

  /** The current URL with some parameters replaced (undefined removes one); always drops page and deleted. */
  const href = (changes: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = { ...filter, period, date: anchor, ...changes };
    delete base.page;
    const params = new URLSearchParams(Object.entries({ account: base.accountId, category: base.categoryId, kind: base.kind, q: base.q, period: base.period, date: base.date, page: changes.page }).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return `/transactions?${params}`;
  };

  const dateFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(il, { ...opts, timeZone: "UTC" });
  const periodLabel = (() => {
    if (!range) return l.allTime;
    if (period === "day") return anchor === today ? l.today : anchor === shiftPeriod("day", today, -1) ? l.yesterday : dateFmt({ weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${anchor}T00:00:00Z`));
    if (period === "week") return `${dateFmt({ day: "numeric", month: "short" }).format(new Date(`${range.from}T00:00:00Z`))} – ${dateFmt({ day: "numeric", month: "short", year: "numeric" }).format(new Date(`${range.to}T00:00:00Z`))}`;
    return dateFmt({ month: "long", year: "numeric" }).format(new Date(`${range.from}T00:00:00Z`));
  })();

  const accountName = accounts.find((a) => a.id === filter.accountId)?.name;
  const categoryName = filter.categoryId === "none" ? l.uncategorized : categories.find((c) => c.id === filter.categoryId)?.name;
  const active = [
    accountName && { label: accountName, remove: { accountId: undefined } },
    categoryName && { label: categoryName, remove: { categoryId: undefined } },
    filter.kind && { label: l.activeKind[filter.kind], remove: { kind: undefined } },
    filter.q && { label: `“${filter.q}”`, remove: { q: undefined } },
  ].filter(Boolean) as { label: string; remove: Record<string, undefined> }[];

  const deleted = one(sp.deleted);
  const tab = "rounded-[4px] px-3 py-1.5 text-sm text-muted aria-[current=true]:bg-accent aria-[current=true]:font-semibold aria-[current=true]:text-accent-text";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {deleted && <UndoToast key={deleted} ids={[deleted]} href={href({})} labels={{ deleted: t.undo.deleted, undo: t.undo.undo }} />}
      <PageTitle actions={accounts.length > 0 ? <QuickEntryButton label={t.mobileNav.record} /> : undefined}>{t.tx.title}</PageTitle>

      {accounts.length === 0 && (
        <Card>
          <p className="text-sm text-muted">{t.tx.needAccount}</p>
          <Link href="/accounts" className={`${buttonClass.primary} mt-3 inline-block`}>
            {t.accounts.add}
          </Link>
        </Card>
      )}

      <section className="rounded-2xl bg-[linear-gradient(135deg,#1d7a57_0%,#145c42_55%,#0f4a35_100%)] p-5 text-white">
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-sm bg-white/15 px-2 py-1">{fmt(l.count, { n: page.total })}</span>
          <span className="rounded-sm bg-white/15 px-2 py-1">{periodLabel}</span>
        </div>
        <p className="mt-4 text-sm text-white/75">{l.net}</p>
        <p className="num text-3xl font-bold tracking-tight">
          {net > 0n ? "+" : ""}
          {money(net)}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3">
          <div>
            <dt className="text-xs text-white/70">↙ {t.tx.totalIncome}</dt>
            <dd className="num font-semibold">+{money(page.income)}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/70">↗ {t.tx.totalExpense}</dt>
            <dd className="num font-semibold">−{money(page.expense)}</dd>
          </div>
        </dl>
      </section>

      <div className="space-y-3">
        <nav aria-label={l.filters} className="grid grid-cols-4 rounded-sm border border-border bg-surface p-0.5">
          {PERIOD_KINDS.map((k) => (
            <Link key={k} href={href({ period: k, date: today })} aria-current={period === k} className={`${tab} text-center`}>
              {l.periods[k]}
            </Link>
          ))}
        </nav>
        {range && (
          <div className="flex items-center justify-between">
            <Link href={href({ date: shiftPeriod(period, anchor, -1) })} aria-label={t.common.prev} className={buttonClass.ghost}>
              <ChevronLeft size={18} aria-hidden="true" />
            </Link>
            <span className="font-semibold">{periodLabel}</span>
            {reachesToday(period, anchor, today) ? (
              <span className="w-9" />
            ) : (
              <Link href={href({ date: shiftPeriod(period, anchor, 1) })} aria-label={t.common.next} className={buttonClass.ghost}>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>

      <form className="flex gap-2" role="search">
        <input type="hidden" name="period" value={period} />
        <input type="hidden" name="date" value={anchor} />
        {filter.accountId && <input type="hidden" name="account" value={filter.accountId} />}
        {filter.categoryId && <input type="hidden" name="category" value={filter.categoryId} />}
        {filter.kind && <input type="hidden" name="kind" value={filter.kind} />}
        <label className="relative flex-1">
          <span className="sr-only">{t.tx.search}</span>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input type="search" name="q" defaultValue={filter.q} placeholder={l.searchHint} className="pl-9" />
        </label>
      </form>

      <details className="rounded-xl border border-border bg-surface">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
          <SlidersHorizontal size={16} aria-hidden="true" />
          {l.filters}
          {active.length > 0 && <span className="rounded-sm bg-accent-soft px-1.5 text-xs text-accent">{active.length}</span>}
        </summary>
        <form className="grid gap-3 border-t border-border px-4 py-4 sm:grid-cols-3">
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="date" value={anchor} />
          {filter.q && <input type="hidden" name="q" value={filter.q} />}
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
          <div className="flex gap-2 sm:col-span-3">
            <button className={buttonClass.primary}>{t.common.filter}</button>
            <Link href={href({ accountId: undefined, categoryId: undefined, kind: undefined, q: undefined })} className={buttonClass.ghost}>
              {t.common.reset}
            </Link>
          </div>
        </form>
      </details>

      {active.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={l.filters}>
          {active.map((a) => (
            <li key={a.label}>
              <Link href={href(a.remove)} className="inline-flex items-center gap-1 rounded-sm border border-accent/40 bg-accent-soft px-2 py-1 text-xs font-medium text-accent hover:border-accent">
                {a.label}
                <X size={12} aria-label={l.clear} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {page.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">{t.tx.empty}</p>
      ) : (
        <TransactionList items={page.items} t={t} locale={locale} totals={totals} currency={user.baseCurrency} />
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page.page > 1 ? <Link href={href({ page: String(page.page - 1) })} className={buttonClass.secondary}>{t.common.prev}</Link> : <span />}
          <span className="text-muted">{fmt(t.common.pageOf, { page: page.page, pages })}</span>
          {page.page < pages ? <Link href={href({ page: String(page.page + 1) })} className={buttonClass.secondary}>{t.common.next}</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
