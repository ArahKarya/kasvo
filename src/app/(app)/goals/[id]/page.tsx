import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveGoalAction, contributeAction, removeContributionAction, updateGoalAction } from "@/app/actions/plans";
import { ActionForm } from "@/components/action-form";
import { Disclosure } from "@/components/disclosure";
import { GoalCard } from "@/components/goal-card";
import { GoalFields } from "@/components/goal-fields";
import { Amount, buttonClass, Card, Field, Input } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { todayIn } from "@/server/domain/dates";
import { DomainError } from "@/server/domain/errors";
import { getGoal } from "@/server/domain/goals";
import { formatMoney } from "@/server/domain/money";
import { pickerOptions } from "@/server/domain/options";
import { getDictionary } from "@/i18n/server";
import { fmt, formatDay, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Goal" };

export default async function GoalPage({ params }: PageProps<"/goals/[id]">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { id } = await params;
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const today = todayIn(timezone);
  const [goal, { accounts }] = await Promise.all([
    getGoal(user.id, id, today).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
      throw error;
    }),
    pickerOptions(user.id),
  ]);
  const il = intlLocale(locale);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const date = (d: string) => formatDay(d, il);
  const g = t.goals;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/goals" className="text-sm text-muted hover:text-text">
        ← {t.common.back}
      </Link>
      <ul>
        <GoalCard goal={goal} t={t} money={money} date={date} asHeading />
      </ul>
      {goal.note && <p className="text-sm text-muted">{goal.note}</p>}

      {goal.accountId ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm">
          {fmt(g.linkedHint, { account: goal.accountName ?? "" })}{" "}
          <Link href={`/accounts/${goal.accountId}`} className="text-accent hover:underline">
            {goal.accountName}
          </Link>
        </p>
      ) : (
        <>
          <Card>
            <h2 className="mb-4 font-semibold">{g.contribute}</h2>
            <ActionForm action={contributeAction.bind(null, goal.id)} submit={t.common.save} success={t.common.saved} resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={g.amount} hint={g.amountHint}>
                  <Input name="amount" required inputMode="decimal" placeholder="500rb" />
                </Field>
                <Field label={g.date}>
                  <Input name="bookedOn" type="date" required defaultValue={today} />
                </Field>
                <Field label={`${g.note} (${t.common.optional})`}>
                  <Input name="note" maxLength={200} />
                </Field>
              </div>
            </ActionForm>
          </Card>

          <section className="space-y-2">
            <h2 className="font-semibold">{g.contributions}</h2>
            {goal.contributions.length === 0 ? (
              <p className="text-sm text-muted">{g.noContributions}</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
                {goal.contributions.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="text-muted">{date(c.bookedOn)}</span>
                    <span className="min-w-0 flex-1 truncate">{c.note}</span>
                    <Amount value={money(c.amount)} sign={c.amount > 0n ? 1 : -1} />
                    <form action={removeContributionAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className={buttonClass.ghost}>{g.remove}</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Card>
        <Disclosure summary={g.editTitle}>
          <div className="mt-4">
            <ActionForm action={updateGoalAction.bind(null, goal.id)} submit={t.common.save} success={t.common.saved}>
              <GoalFields t={t} accounts={accounts} goal={goal} />
            </ActionForm>
          </div>
        </Disclosure>
      </Card>

      <form action={archiveGoalAction}>
        <input type="hidden" name="id" value={goal.id} />
        <input type="hidden" name="archived" value={goal.archived ? "0" : "1"} />
        <button className={goal.archived ? buttonClass.secondary : buttonClass.danger}>{goal.archived ? t.common.unarchive : t.common.archive}</button>
      </form>
    </div>
  );
}
