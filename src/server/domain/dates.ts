/**
 * Booking dates are calendar days with no time zone; Prisma maps a `@db.Date` column to a
 * Date at UTC midnight, so everything here works in UTC.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-27" → Date at UTC midnight, or null when not a real calendar day. */
export function parseDay(value: string): Date | null {
  const m = ISO_DAY.exec(value);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return toDay(date) === value ? date : null;
}

export const toDay = (date: Date): string => date.toISOString().slice(0, 10);

/** Today's calendar day in the given time zone, e.g. "2026-10-27". */
export const todayIn = (timeZone: string, now = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** "2026-10" → [first day, first day of next month). */
export function monthRange(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const index = Number(m[2]) - 1;
  if (index < 0 || index > 11) return null;
  return { start: new Date(Date.UTC(year, index, 1)), end: new Date(Date.UTC(year, index + 1, 1)) };
}

/**
 * Same day-of-month `n` months later, clamped to the month's length, so a 31st instalment
 * falls on 28/29 Feb and returns to the 31st in March. `anchor` is the original day-of-month.
 */
export function addMonths(day: string, n: number, anchor = Number(day.slice(8, 10))): string {
  const [y, m] = day.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(anchor, last));
  return toDay(first);
}

/** Whole days from `a` to `b` (both "YYYY-MM-DD"); negative when `b` is earlier. */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** The calendar day `n` days after `day`. */
export const addDays = (day: string, n: number): string => toDay(new Date(Date.parse(day) + n * 86_400_000));
