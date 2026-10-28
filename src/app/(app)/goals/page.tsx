import type { Metadata } from "next";
import Link from "next/link";
import { createGoalAction } from "@/app/actions/plans";
import { ActionForm } from "@/components/action-form";
import { Disclosure } from "@/components/disclosure";
import { GoalFields } from "@/components/goal-fields";
import { GoalCard } from "@/components/goal-card";
import { Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { todayIn } from "@/server/domain/dates";
import { listGoals } from "@/server/domain/goals";
import { formatMoney } from "@/server/domain/money";
import { pickerOptions } from "@/server/domain/options";
import { getDictionary } from "@/i18n/server";
import { fmt, formatDay, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Goals" };

export default async function GoalsPage() {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const [goals, { accounts }] = await Promise.all([listGoals(user.id, todayIn(timezone), { includeArchived: true }), pickerOptions(user.id)]);
  const il = intlLocale(locale);
  const money = (v: bigint) => formatMoney(v, user.baseCurrency, il);
  const date = (d: string) => formatDay(d, il);
  const active = goals.filter((g) => !g.archived);
  const archived = goals.filter((g) => g.archived);
  const g = t.goals;
  const saved = active.reduce((sum, x) => sum + x.progress.saved, 0n);
  const target = active.reduce((sum, x) => sum + x.targetAmount, 0n);
  const overall = target > 0n ? Math.min(Number(saved) / Number(target), 1) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageTitle>{g.title}</PageTitle>
      <p className="-mt-3 text-sm text-muted">{g.intro}</p>

      {active.length > 0 && (
        <section className="rounded-2xl bg-[linear-gradient(135deg,#1d7a57_0%,#145c42_55%,#0f4a35_100%)] p-5 text-white">
          <span className="rounded-sm bg-white/15 px-2 py-1 text-xs font-medium">{active.length} target</span>
          <p className="mt-4 text-sm text-white/75">{g.collected}</p>
          <p className="num text-3xl font-bold tracking-tight">{money(saved)}</p>
          <p className="num mt-1 text-sm text-white/80">{fmt(g.ofTargets, { amount: money(target) })}</p>
          <div className="mt-4 h-2.5 rounded-sm bg-white/20" aria-hidden="true">
            <div className="h-full rounded-sm bg-[#f4ae2a]" style={{ width: `${overall * 100}%` }} />
          </div>
          <p className="mt-1.5 text-right text-xs text-white/80">{Math.round(overall * 100)}%</p>
        </section>
      )}

      {active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">{g.empty}</p>
      ) : (
        <ul className="space-y-3">
          {active.map((goal) => (
            <GoalCard key={goal.id} goal={goal} t={t} money={money} date={date} />
          ))}
        </ul>
      )}

      <Card>
        <Disclosure summary={g.add} defaultOpen={active.length === 0}>
          <div className="mt-4">
            <ActionForm action={createGoalAction} submit={t.common.save} success={t.common.saved} resetOnSuccess>
              <GoalFields t={t} accounts={accounts} />
            </ActionForm>
          </div>
        </Disclosure>
      </Card>

      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">{g.archivedList}</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {archived.map((a) => (
              <li key={a.id} className="flex justify-between px-4 py-2">
                <Link href={`/goals/${a.id}`} className="hover:underline">
                  {a.name}
                </Link>
                <span className="num text-muted">{money(a.progress.saved)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
