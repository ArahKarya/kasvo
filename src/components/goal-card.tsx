import Link from "next/link";
import type { GoalView } from "@/server/domain/goals";
import { fmt, type Dictionary } from "@/i18n/dictionaries";
import { GOAL_TONE } from "./plan-tones";
import { StatusMeter } from "./status-meter";

interface GoalCardProps {
  goal: GoalView;
  t: Dictionary;
  money: (v: bigint) => string;
  date: (day: string) => string;
  /** On the detail page the name is the page heading instead of a link. */
  asHeading?: boolean;
}

export function GoalCard({ goal, t, money, date, asHeading = false }: GoalCardProps) {
  const g = t.goals;
  const p = goal.progress;
  const notes = [
    p.neededPerMonth !== null && p.state !== "achieved" ? fmt(g.needed, { amount: money(p.neededPerMonth) }) : null,
    p.projectedOn ? fmt(g.projected, { date: date(p.projectedOn) }) : null,
  ].filter(Boolean);
  return (
    <li className="rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {asHeading ? (
          <h1 className="text-2xl font-bold tracking-tight">{goal.name}</h1>
        ) : (
          <Link href={`/goals/${goal.id}`} className="font-medium hover:underline">
            {goal.name}
          </Link>
        )}
        <p className="num text-sm">
          {fmt(g.savedOf, { saved: money(p.saved), target: money(goal.targetAmount) })}
          {p.remaining > 0n && <span className="ml-2 text-muted">{fmt(g.remaining, { amount: money(p.remaining) })}</span>}
        </p>
      </div>
      <div className="mt-2">
        <StatusMeter value={p.reached} tone={GOAL_TONE[p.state]} label={`${g.state[p.state]} · ${Math.round(p.reached * 100)}%`} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {[goal.targetDate ? date(goal.targetDate) : null, goal.accountName ? fmt(g.trackedBy, { account: goal.accountName }) : g.manual, ...notes].filter(Boolean).join(" · ")}
      </p>
    </li>
  );
}
