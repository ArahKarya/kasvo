import { addDays, daysBetween, toDay } from "./dates";

/** Kinds whose value moves on its own, so they are re-priced on a schedule. */
export const TRACKED_KINDS = ["GOLD", "STOCK", "FUND", "CRYPTO"] as const;
export type TrackedKind = (typeof TRACKED_KINDS)[number];

/** A value that is older than this many days is due for a fresh price. */
export const STALE_AFTER_DAYS = 30;

export const isTracked = (kind: string): kind is TrackedKind => (TRACKED_KINDS as readonly string[]).includes(kind);

export interface TrendPoint {
  day: string;
  value: bigint;
}

/** Oldest first: the purchase (when known) followed by every valuation, one point per day. */
export function buildSeries(purchase: { day: string | null; value: bigint | null }, valuations: TrendPoint[]): TrendPoint[] {
  const byDay = new Map<string, bigint>();
  if (purchase.day && purchase.value !== null) byDay.set(purchase.day, purchase.value);
  for (const v of valuations) byDay.set(v.day, v.value);
  return [...byDay.entries()].map(([day, value]) => ({ day, value })).sort((a, b) => a.day.localeCompare(b.day));
}

export interface Change {
  delta: bigint;
  /** Percent versus the previous point, or null when that was zero. */
  pct: number | null;
  /** Day of the previous point. */
  since: string;
}

/** How the latest point moved against the one before it. Null with fewer than two points. */
export function lastChange(series: TrendPoint[]): Change | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  return { delta: last.value - prev.value, pct: prev.value === 0n ? null : (Number(last.value - prev.value) / Number(prev.value)) * 100, since: prev.day };
}

/** Days since the latest valuation, or null when the asset was never valued. */
export function daysSinceValued(valuedOn: string | null, today: string): number | null {
  return valuedOn === null ? null : Math.max(0, daysBetween(valuedOn, today));
}

export function isStale(valuedOn: string | null, today: string): boolean {
  const days = daysSinceValued(valuedOn, today);
  return days === null || days >= STALE_AFTER_DAYS;
}

export interface MonthValue {
  /** "2026-10" */
  month: string;
  /** Value at the end of that month (today for the current one); null before the asset existed. */
  value: bigint | null;
}

/** The last `count` calendar months ending with today's, oldest first. */
export function recentMonths(today: string, count: number): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return toDay(d).slice(0, 7);
  });
}

/** Month-end values for one asset, carrying the last known value forward. */
export function monthEndValues(series: TrendPoint[], today: string, count = 6): MonthValue[] {
  return recentMonths(today, count).map((month) => {
    const [y, m] = month.split("-").map(Number);
    const monthEnd = toDay(new Date(Date.UTC(y, m, 0)));
    const cutoff = monthEnd < today ? monthEnd : today;
    let value: bigint | null = null;
    for (const p of series) {
      if (p.day <= cutoff) value = p.value;
      else break;
    }
    return { month, value };
  });
}

/** Sum of several assets' month-end values; a month is null when none of them existed yet. */
export function sumMonths(all: MonthValue[][]): MonthValue[] {
  if (all.length === 0) return [];
  return all[0].map((row, i) => {
    let total: bigint | null = null;
    for (const asset of all) {
      const v = asset[i].value;
      if (v !== null) total = (total ?? 0n) + v;
    }
    return { month: row.month, value: total };
  });
}

export { addDays };
