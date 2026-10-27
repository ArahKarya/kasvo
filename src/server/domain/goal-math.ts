import { addMonths, daysBetween } from "./dates";

export type GoalState = "achieved" | "on_track" | "behind" | "overdue" | "open";

/** A goal younger than this has too little history to judge its pace. */
const MIN_HISTORY_DAYS = 30;

export interface GoalInput {
  target: bigint;
  saved: bigint;
  /** "YYYY-MM-DD" or null for an open-ended goal. */
  targetDate: string | null;
  /** Day the goal was created. */
  startedOn: string;
  today: string;
  /** Average net amount added per month recently; negative when money was taken out. */
  monthlyRate: bigint;
}

export interface GoalProgress {
  saved: bigint;
  remaining: bigint;
  /** 0–1+, share of the target reached. */
  reached: number;
  /** Months left until the target date, at least 1 while the date is in the future. */
  monthsLeft: number | null;
  /** What has to be added per month from now to make the date. */
  neededPerMonth: bigint | null;
  /** When the target is reached at the recent pace. */
  projectedOn: string | null;
  state: GoalState;
}

/** Calendar months from `today` until `date`, counting a month only once its day-of-month is reached. */
export function monthsUntil(today: string, date: string): number {
  const [y, m, d] = today.split("-").map(Number);
  const [ty, tm, td] = date.split("-").map(Number);
  const months = (ty - y) * 12 + (tm - m) - (td < d ? 1 : 0);
  return Math.max(months, 0);
}

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

export function goalProgress(g: GoalInput): GoalProgress {
  const saved = g.saved > 0n ? g.saved : 0n;
  const remaining = g.target > saved ? g.target - saved : 0n;
  const reached = g.target === 0n ? 1 : Number(saved) / Number(g.target);
  const projectedOn = remaining > 0n && g.monthlyRate > 0n ? addMonths(g.today, Number(ceilDiv(remaining, g.monthlyRate))) : null;

  if (remaining === 0n) return { saved, remaining, reached, monthsLeft: null, neededPerMonth: null, projectedOn: null, state: "achieved" };
  if (!g.targetDate) return { saved, remaining, reached, monthsLeft: null, neededPerMonth: null, projectedOn, state: "open" };
  if (g.targetDate < g.today) return { saved, remaining, reached, monthsLeft: 0, neededPerMonth: remaining, projectedOn, state: "overdue" };

  const monthsLeft = Math.max(monthsUntil(g.today, g.targetDate), 1);
  const neededPerMonth = ceilDiv(remaining, BigInt(monthsLeft));
  const judged = daysBetween(g.startedOn, g.today) >= MIN_HISTORY_DAYS;
  const state: GoalState = !judged ? "open" : g.monthlyRate >= neededPerMonth ? "on_track" : "behind";
  return { saved, remaining, reached, monthsLeft, neededPerMonth, projectedOn, state };
}
