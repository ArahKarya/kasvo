/**
 * Calendar periods for the transaction list. Days are "YYYY-MM-DD" strings in UTC; weeks start
 * on Monday, as Indonesian calendars do.
 */

export type PeriodKind = "day" | "week" | "month" | "all";

export const PERIOD_KINDS: readonly PeriodKind[] = ["day", "week", "month", "all"];

export const isPeriodKind = (v: unknown): v is PeriodKind => typeof v === "string" && (PERIOD_KINDS as readonly string[]).includes(v);

const toDay = (d: Date): string => d.toISOString().slice(0, 10);
const at = (day: string): Date => new Date(`${day}T00:00:00Z`);

/** First and last day (inclusive) of the period containing `anchor`; null for "all". */
export function periodRange(kind: PeriodKind, anchor: string): { from: string; to: string } | null {
  const d = at(anchor);
  if (kind === "all") return null;
  if (kind === "day") return { from: anchor, to: anchor };
  if (kind === "week") {
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: toDay(monday), to: toDay(sunday) };
  }
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { from: toDay(first), to: toDay(last) };
}

/** The anchor `by` periods later (or earlier when negative), kept on a valid day. */
export function shiftPeriod(kind: PeriodKind, anchor: string, by: number): string {
  const d = at(anchor);
  if (kind === "day") d.setUTCDate(d.getUTCDate() + by);
  else if (kind === "week") d.setUTCDate(d.getUTCDate() + 7 * by);
  else if (kind === "month") return toDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + by, 1)));
  return toDay(d);
}

/** Whether the period containing `anchor` also contains `today` or lies after it. */
export const reachesToday = (kind: PeriodKind, anchor: string, today: string): boolean => {
  const range = periodRange(kind, anchor);
  return range === null || range.to >= today;
};
