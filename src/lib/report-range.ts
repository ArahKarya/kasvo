/**
 * Report periods: one calendar month (browsable), the last 3 or 6 months up to today, or the
 * year to date. Each has a "previous" period of the same shape to compare against.
 */

export type ReportRange = "month" | "3m" | "6m" | "ytd";

export const REPORT_RANGES: readonly ReportRange[] = ["month", "3m", "6m", "ytd"];

export const isReportRange = (v: unknown): v is ReportRange => typeof v === "string" && (REPORT_RANGES as readonly string[]).includes(v);

export interface ReportPeriod {
  from: string;
  to: string;
  /** The month the 12-month chart ends at. */
  endMonth: string;
}

const day = (y: number, m: number, d: number): string => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** `month` is "YYYY-MM" and only matters for the single-month range. */
export function reportPeriod(range: ReportRange, month: string, today: string): ReportPeriod {
  const [ty, tm] = today.split("-").map(Number);
  if (range === "month") {
    const [y, m] = month.split("-").map(Number);
    return { from: day(y, m - 1, 1), to: day(y, m, 0), endMonth: month };
  }
  if (range === "ytd") return { from: `${ty}-01-01`, to: today, endMonth: today.slice(0, 7) };
  const months = range === "3m" ? 3 : 6;
  return { from: day(ty, tm - months, 1), to: today, endMonth: today.slice(0, 7) };
}

/** The period just before, of the same shape: last month, the 3/6 months before, or last year to the same day. */
export function previousPeriod(range: ReportRange, month: string, today: string): { from: string; to: string } {
  const p = reportPeriod(range, month, today);
  const [fy, fm] = p.from.split("-").map(Number);
  if (range === "month") return { from: day(fy, fm - 2, 1), to: day(fy, fm - 1, 0) };
  if (range === "ytd") {
    const [ty, tm, td] = today.split("-").map(Number);
    return { from: `${ty - 1}-01-01`, to: day(ty - 1, tm - 1, td) };
  }
  const months = range === "3m" ? 3 : 6;
  return { from: day(fy, fm - 1 - months, 1), to: day(fy, fm - 1, 0) };
}
