import Link from "next/link";
import type { DaySpend } from "@/server/domain/wealth";

interface SpendingActivityProps {
  days: DaySpend[];
  /** What is left in this month's budgets per remaining day, or null without budgets. */
  safePerDay: bigint | null;
  locale: string;
  money: (v: bigint) => string;
  compact: (v: bigint) => string;
  labels: { title: string; total: string; perDay: string; safePerDay: string; noBudget: string; today: string };
}

/** Seven day bars; today is highlighted. Each bar names its day and amount for screen readers and on hover. */
export function SpendingActivity({ days, safePerDay, locale, money, compact, labels }: SpendingActivityProps) {
  const total = days.reduce((s, d) => s + d.total, 0n);
  const max = days.reduce((m, d) => (d.total > m ? d.total : m), 0n);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const longDay = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="font-semibold">{labels.title}</h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted">{labels.total}</dt>
          <dd className="num font-semibold text-accent">{compact(total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{labels.perDay}</dt>
          <dd className="num font-semibold text-accent">{compact(total / BigInt(days.length))}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{labels.safePerDay}</dt>
          <dd className="font-semibold">
            {safePerDay === null ? (
              <Link href="/budgets" className="text-sm text-accent hover:underline">
                {labels.noBudget}
              </Link>
            ) : (
              <span className="num">{compact(safePerDay)}</span>
            )}
          </dd>
        </div>
      </dl>
      <ol className="mt-4 grid h-32 grid-cols-7 items-end gap-2">
        {days.map((d, i) => {
          const today = i === days.length - 1;
          const share = max === 0n ? 0 : Number(d.total) / Number(max);
          const date = new Date(`${d.day}T00:00:00Z`);
          return (
            <li key={d.day} className="flex h-full flex-col items-center justify-end gap-1.5" title={`${longDay.format(date)}: ${money(d.total)}`}>
              <span className="sr-only">{`${longDay.format(date)}: ${money(d.total)}`}</span>
              <div className="flex w-full flex-1 items-end rounded-md bg-surface-2">
                <div
                  aria-hidden="true"
                  className={`w-full rounded-md ${today ? "bg-accent" : "bg-chart-bar/45"}`}
                  style={{ height: `${Math.max(share * 100, d.total > 0n ? 6 : 0)}%` }}
                />
              </div>
              <span aria-hidden="true" className={`text-[11px] ${today ? "font-semibold text-text" : "text-muted"}`}>
                {today ? labels.today : weekday.format(date)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
