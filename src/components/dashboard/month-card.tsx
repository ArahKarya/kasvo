import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface MonthCardProps {
  income: bigint;
  expense: bigint;
  /** Spending change versus last month in percent, or null without last month's data. */
  expenseChange: number | null;
  money: (v: bigint) => string;
  labels: { title: string; saved: string; overspent: string; income: string; expense: string; vsLastMonth: string; net: string };
}

/** This month's income and spending with the share of income kept, as a ring. */
export function MonthCard({ income, expense, expenseChange, money, labels }: MonthCardProps) {
  const rate = income > 0n ? Number(income - expense) / Number(income) : null;
  const shown = rate === null ? null : Math.max(rate, 0);
  const r = 34;
  const c = 2 * Math.PI * r;
  const net = income - expense;
  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="font-semibold">{labels.title}</h2>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r={r} fill="none" stroke="var(--accent-soft)" strokeWidth="9" />
            {shown !== null && (
              <circle cx="40" cy="40" r={r} fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${Math.min(shown, 1) * c} ${c}`} />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
            <span className="num text-lg font-bold">{rate === null ? "—" : `${Math.round(rate * 100)}%`}</span>
            <span className="text-[10px] text-muted">{rate !== null && rate < 0 ? labels.overspent : labels.saved}</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted">{labels.net}</p>
          <p className={`num truncate text-2xl font-bold tracking-tight ${net < 0n ? "text-expense" : ""}`}>{money(net)}</p>
          {expenseChange !== null && (
            <p className="mt-1 text-xs text-muted">{labels.vsLastMonth.replace("{change}", `${expenseChange > 0 ? "+" : ""}${expenseChange}%`)}</p>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1">
        <div className="rounded-lg bg-income-soft px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ArrowDownLeft size={14} className="text-income" aria-hidden="true" />
            {labels.income}
          </p>
          <p className="num mt-0.5 truncate font-semibold">{money(income)}</p>
        </div>
        <div className="rounded-lg bg-expense-soft px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ArrowUpRight size={14} className="text-expense" aria-hidden="true" />
            {labels.expense}
          </p>
          <p className="num mt-0.5 truncate font-semibold">{money(expense)}</p>
        </div>
      </div>
    </section>
  );
}
