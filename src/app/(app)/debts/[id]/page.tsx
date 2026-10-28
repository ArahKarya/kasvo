import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveDebtAction, payDebtAction, removePaymentAction, updateDebtAction } from "@/app/actions/plans";
import { ActionForm } from "@/components/action-form";
import { DebtCard } from "@/components/debt-card";
import { DebtFields } from "@/components/debt-fields";
import { Disclosure } from "@/components/disclosure";
import { LINE_TONE } from "@/components/plan-tones";
import { StatusLabel } from "@/components/status-meter";
import { buttonClass, Card, Field, Input, Select } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { listAccounts } from "@/server/domain/accounts";
import { todayIn } from "@/server/domain/dates";
import { suggestedPayment } from "@/server/domain/debt-math";
import { getDebt, paymentCandidates } from "@/server/domain/debts";
import { DomainError } from "@/server/domain/errors";
import { formatMoney } from "@/server/domain/money";
import { pickerOptions } from "@/server/domain/options";
import { getDictionary } from "@/i18n/server";
import { fmt, formatDay, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Debt" };

/** Long schedules (e.g. a 15-year mortgage) start collapsed. */
const OPEN_SCHEDULE_UP_TO = 24;

export default async function DebtPage({ params }: PageProps<"/debts/[id]">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { id } = await params;
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const today = todayIn(timezone);
  const [debt, accounts, { categories }, candidates] = await Promise.all([
    getDebt(user.id, id, today).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
      throw error;
    }),
    listAccounts(user.id),
    pickerOptions(user.id),
    paymentCandidates(user.id, id, today),
  ]);
  const il = intlLocale(locale);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const date = (d: string) => formatDay(d, il);
  const d = t.debts;
  const s = debt.status;
  const kind = debt.direction === "BORROWED" ? "EXPENSE" : "INCOME";
  const settled = s.state === "settled";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/debts" className="text-sm text-muted hover:text-text">
        ← {t.common.back}
      </Link>
      <ul>
        <DebtCard debt={debt} t={t} money={money} date={date} asHeading />
      </ul>
      <p className="text-xs text-muted">
        {[d.directionOption[debt.direction], debt.accountName, fmt(d.endsOn, { date: date(s.endsOn) }), debt.note].filter(Boolean).join(" · ")}
      </p>

      {!settled && (
        <Card>
          <h2 className="mb-4 font-semibold">{d.pay}</h2>
          <ActionForm action={payDebtAction.bind(null, debt.id)} submit={t.common.save} success={t.common.saved} resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`${d.amount} (${t.common.optional})`} hint={fmt(d.payAmountHint, { amount: money(suggestedPayment(s)) })}>
                <Input name="amount" inputMode="decimal" />
              </Field>
              <Field label={d.payDate}>
                <Input name="paidOn" type="date" defaultValue={today} />
              </Field>
              <Field label={d.payAccount} hint={d.payAccountHint}>
                <Select name="accountId" defaultValue="">
                  <option value="">{d.payAccountNone}</option>
                  {accounts
                    .filter((a) => a.id !== debt.accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </Select>
              </Field>
              {!debt.accountId && (
                <Field label={`${d.category} (${t.common.optional})`}>
                  <Select name="categoryId" defaultValue="">
                    <option value="">{t.common.none}</option>
                    {categories
                      .filter((c) => c.kind === kind)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              )}
              {candidates.length > 0 && (
                <Field label={d.linkExisting} hint={d.linkExistingHint} className="sm:col-span-2">
                  <Select name="transactionId" defaultValue="">
                    <option value="">{d.linkExistingNone}</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {`${date(c.bookedOn)} · ${c.accountName} · ${money(c.amount)} · ${c.description}`}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label={`${t.goals.note} (${t.common.optional})`} className="sm:col-span-2">
                <Input name="note" maxLength={200} />
              </Field>
            </div>
          </ActionForm>
        </Card>
      )}

      <Card className="p-0">
        <div className="p-4">
          <Disclosure summary={`${d.schedule} (${debt.instalmentCount})`} defaultOpen={debt.instalmentCount <= OPEN_SCHEDULE_UP_TO}>
            <div className="mt-3 max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">{d.seq}</th>
                    <th className="py-1.5 pr-2 font-medium">{d.dueOn}</th>
                    <th className="py-1.5 pr-2 text-right font-medium">{d.amount}</th>
                    <th className="py-1.5 pr-2 text-right font-medium">{d.paid}</th>
                    <th className="py-1.5 font-medium">{d.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {s.lines.map((l) => (
                    <tr key={l.seq}>
                      <td className="num py-1.5 pr-2 text-muted">{l.seq}</td>
                      <td className="py-1.5 pr-2">{date(l.dueOn)}</td>
                      <td className="num py-1.5 pr-2 text-right">{money(l.amount)}</td>
                      <td className="num py-1.5 pr-2 text-right text-muted">{l.paid > 0n ? money(l.paid) : t.common.none}</td>
                      <td className="py-1.5">
                        <StatusLabel tone={LINE_TONE[l.status]} label={d.line[l.status]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Disclosure>
        </div>
      </Card>

      <section className="space-y-2">
        <h2 className="font-semibold">{d.payments}</h2>
        {debt.payments.length === 0 ? (
          <p className="text-sm text-muted">{d.noPayments}</p>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
              {debt.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="text-muted">{date(p.paidOn)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {p.transactionId ? (
                      <Link href={`/transactions/${p.transactionId}`} className="hover:underline">
                        {[p.accountName, p.description].filter(Boolean).join(" · ")}
                      </Link>
                    ) : (
                      p.note
                    )}
                    {p.transactionId && !p.ledgerCreated && <span className="ml-2 text-xs text-muted">({d.linked})</span>}
                  </span>
                  <span className="num font-medium">{money(p.amount)}</span>
                  <form action={removePaymentAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className={buttonClass.ghost}>{d.removePayment}</button>
                  </form>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">{d.removePaymentHint}</p>
          </>
        )}
      </section>

      <Card>
        <Disclosure summary={d.editTitle}>
          <div className="mt-4">
            <ActionForm action={updateDebtAction.bind(null, debt.id)} submit={t.common.save} success={t.common.saved}>
              <DebtFields t={t} loanAccounts={accounts.filter((a) => a.type === "LOAN" || a.type === "CREDIT_CARD")} today={today} debt={debt} />
            </ActionForm>
          </div>
        </Disclosure>
      </Card>

      <form action={archiveDebtAction}>
        <input type="hidden" name="id" value={debt.id} />
        <input type="hidden" name="archived" value={debt.archived ? "0" : "1"} />
        <button className={debt.archived ? buttonClass.secondary : buttonClass.danger}>{debt.archived ? t.common.unarchive : t.common.archive}</button>
      </form>
    </div>
  );
}
