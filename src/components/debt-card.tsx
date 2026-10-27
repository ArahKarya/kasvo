import Link from "next/link";
import type { DebtView } from "@/server/domain/debts";
import { fmt, type Dictionary } from "@/i18n/dictionaries";
import { DEBT_TONE } from "./plan-tones";
import { StatusMeter } from "./status-meter";

interface DebtCardProps {
  debt: DebtView;
  t: Dictionary;
  money: (v: bigint) => string;
  date: (day: string) => string;
  /** On the detail page the name is the page heading instead of a link. */
  asHeading?: boolean;
}

export function DebtCard({ debt, t, money, date, asHeading = false }: DebtCardProps) {
  const d = t.debts;
  const s = debt.status;
  const share = s.totalDue === 0n ? 1 : Number(s.paid) / Number(s.totalDue);
  const details = [
    debt.counterparty,
    debt.instalmentCount > 1 ? fmt(d.instalments, { paid: s.paidCount, count: debt.instalmentCount }) : null,
    s.next ? fmt(d.next, { date: date(s.next.dueOn), amount: money(s.next.amount - s.next.paid) }) : null,
    s.overdueCount ? fmt(d.overdue, { n: s.overdueCount, amount: money(s.overdueAmount) }) : null,
    debt.annualRate !== null ? `${debt.annualRate}%` : null,
  ].filter(Boolean);
  return (
    <li className="rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {asHeading ? (
          <h1 className="text-2xl font-bold tracking-tight">{debt.name}</h1>
        ) : (
          <Link href={`/debts/${debt.id}`} className="font-medium hover:underline">
            {debt.name}
          </Link>
        )}
        <p className="num text-sm">
          {fmt(d.outstanding, { amount: money(s.outstanding) })}
          <span className="ml-2 text-muted">{fmt(d.paidOf, { paid: money(s.paid), total: money(s.totalDue) })}</span>
        </p>
      </div>
      <div className="mt-2">
        <StatusMeter value={share} tone={DEBT_TONE[s.state]} label={d.state[s.state]} />
      </div>
      {details.length > 0 && <p className="mt-2 text-xs text-muted">{details.join(" · ")}</p>}
    </li>
  );
}
