import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { copyBudgetsAction, setBudgetAction } from "@/app/actions/budgets";
import { ActionForm } from "@/components/action-form";
import { BudgetMeter } from "@/components/budget-meter";
import { CategoryIcon } from "@/components/category-icons";
import { buttonClass, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { budgetStatus, monthSchema, nextMonth, previousMonth } from "@/server/domain/budgets";
import { todayIn } from "@/server/domain/dates";
import { formatMoney } from "@/server/domain/money";
import { pickerOptions } from "@/server/domain/options";
import { getDictionary } from "@/i18n/server";
import { fmt, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const today = todayIn(timezone);
  const requested = (await searchParams).month;
  const month = typeof requested === "string" && monthSchema.safeParse(requested).success ? requested : today.slice(0, 7);
  const [status, { categories }] = await Promise.all([budgetStatus(user.id, month, today), pickerOptions(user.id)]);

  const il = intlLocale(locale);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const monthName = (m: string) => new Intl.DateTimeFormat(il, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
  const b = t.budgets;
  const { daysElapsed, daysInMonth } = status.progress;
  const timeNote = daysElapsed === 0 ? b.notStarted : daysElapsed >= daysInMonth ? b.monthDone : fmt(b.daysLeft, { n: daysInMonth - daysElapsed });
  const budgetedIds = new Set(status.lines.map((l) => l.categoryId));
  const styles = new Map(
    (await db.category.findMany({ where: { userId: user.id, id: { in: [...budgetedIds] } }, select: { id: true, icon: true, color: true } })).map((c) => [c.id, c]),
  );
  const usedPct = status.budgeted > 0n ? Math.round((Number(status.spentInBudgets) / Number(status.budgeted)) * 100) : 0;
  const left = status.budgeted - status.spentInBudgets;
  const available = categories.filter((c) => c.kind === "EXPENSE" && !budgetedIds.has(c.id));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageTitle
        actions={
          <nav className="flex items-center gap-1" aria-label={t.reports.period}>
            <Link href={`/budgets?month=${previousMonth(month)}`} className={buttonClass.ghost} aria-label={t.common.prev}>
              <ChevronLeft size={16} />
            </Link>
            <span className="min-w-36 text-center text-sm font-medium">{monthName(month)}</span>
            <Link href={`/budgets?month=${nextMonth(month)}`} className={buttonClass.ghost} aria-label={t.common.next}>
              <ChevronRight size={16} />
            </Link>
          </nav>
        }
      >
        {b.title}
      </PageTitle>
      <p className="-mt-3 text-sm text-muted">{b.intro}</p>

      <section className="rounded-2xl bg-[linear-gradient(135deg,#1d7a57_0%,#145c42_55%,#0f4a35_100%)] p-5 text-white">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-white/75">{b.budgeted}</p>
            <p className="num text-3xl font-bold tracking-tight">{money(status.budgeted)}</p>
          </div>
          <p className="rounded-sm bg-white/15 px-2 py-1 text-xs font-medium">{timeNote}</p>
        </div>
        <div className="mt-4 h-2.5 rounded-sm bg-white/20" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(usedPct, 100)} aria-label={b.spentInBudgets}>
          <div className={`h-full rounded-sm ${left < 0n ? "bg-[#ff8f7a]" : "bg-[#f4ae2a]"}`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm [&>div]:flex [&>div]:flex-col [&>div]:justify-between">
          <div>
            <dt className="text-xs text-white/70">{b.spentInBudgets}</dt>
            <dd className="num font-semibold">{money(status.spentInBudgets)}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/70">{left >= 0n ? b.leftLabel : b.overLabel}</dt>
            <dd className="num font-semibold">{money(left >= 0n ? left : -left)}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/70">{b.totalSpending}</dt>
            <dd className="num font-semibold">{money(status.totalSpending)}</dd>
          </div>
        </dl>
      </section>

      {status.lines.length === 0 ? (
        <Card className="space-y-3">
          <p className="text-sm text-muted">{b.empty}</p>
          <ActionForm action={copyBudgetsAction.bind(null, previousMonth(month), month)} submit={fmt(b.copy, { month: monthName(previousMonth(month)) })}>
            <></>
          </ActionForm>
        </Card>
      ) : (
        <ul className="space-y-3">
          {status.lines.map((l) => (
            <li key={l.categoryId} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/transactions?category=${l.categoryId}&month=${month}`} className="flex items-center gap-2.5 font-medium hover:underline">
                  <CategoryIcon icon={styles.get(l.categoryId)?.icon} color={styles.get(l.categoryId)?.color} size={32} />
                  {l.name}
                </Link>
                <p className="num text-sm">
                  {fmt(b.spentOf, { spent: money(l.spent), budget: money(l.amount) })}
                  <span className="ml-2 text-muted">
                    {l.remaining >= 0n ? fmt(b.remaining, { amount: money(l.remaining) }) : fmt(b.overBy, { amount: money(-l.remaining) })}
                  </span>
                </p>
              </div>
              <div className="mt-2">
                <BudgetMeter used={l.used} projected={l.amount === 0n ? 0 : Number(l.projected) / Number(l.amount)} state={l.state} label={b.state[l.state]} />
              </div>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-3 text-xs text-muted">
                <p>
                  {[l.projected > l.spent ? fmt(b.projected, { amount: money(l.projected) }) : null, l.average > 0n ? fmt(b.average, { amount: money(l.average) }) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <ActionForm action={setBudgetAction.bind(null, month)} submit={t.common.save} className="flex w-full flex-wrap items-end gap-2 sm:w-auto [&>div]:mt-0">
                  <input type="hidden" name="categoryId" value={l.categoryId} />
                  <Input name="amount" defaultValue={l.amount.toString()} inputMode="decimal" aria-label={b.amount} className="min-w-0 flex-1 py-1 sm:w-32 sm:flex-none" />
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">{b.add}</h2>
          <ActionForm action={setBudgetAction.bind(null, month)} submit={t.common.save} resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={b.category}>
                <Select name="categoryId" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={b.amount} hint={t.tx.amountHint}>
                <Input name="amount" required inputMode="decimal" placeholder="1,5jt" />
              </Field>
            </div>
          </ActionForm>
        </Card>
      )}

      {status.unbudgeted.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">{b.unbudgeted}</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {status.unbudgeted.map((u) => (
              <li key={u.categoryId ?? "none"} className="flex justify-between px-4 py-2">
                <span>{u.categoryId ? u.name : t.tx.uncategorized}</span>
                <span className="num">{money(u.spent)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
