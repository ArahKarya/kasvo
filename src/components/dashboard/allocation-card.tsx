import Link from "next/link";
import type { Allocation } from "@/server/domain/wealth";

interface AllocationCardProps {
  data: Allocation;
  money: (v: bigint) => string;
  labels: { title: string; intro: string; needs: string; wants: string; savings: string; target: string; unclassified: string; markCategories: string; noIncome: string };
}

/** Needs / wants / savings as shares of income, against the 50/30/20 rule. Every segment is labelled. */
export function AllocationCard({ data, money, labels }: AllocationCardProps) {
  const income = Number(data.income);
  const savings = data.savings > 0n ? data.savings : 0n;
  const rows = [
    { key: "needs", label: labels.needs, amount: data.needs, target: 50, color: "var(--alloc-needs)" },
    { key: "wants", label: labels.wants, amount: data.wants, target: 30, color: "var(--alloc-wants)" },
    { key: "savings", label: labels.savings, amount: savings, target: 20, color: "var(--alloc-savings)" },
  ];
  const pct = (v: bigint) => (income > 0 ? (Number(v) / income) * 100 : 0);
  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{labels.title}</h2>
        <span className="text-xs text-muted">{labels.intro}</span>
      </div>
      {income === 0 ? (
        <p className="mt-3 text-sm text-muted">{labels.noIncome}</p>
      ) : (
        <>
          <div className="mt-4 flex h-3.5 gap-0.5 overflow-hidden rounded-sm bg-surface-2" aria-hidden="true">
            {rows.map((r) => (
              <div key={r.key} style={{ width: `${Math.min(pct(r.amount), 100)}%`, background: r.color }} />
            ))}
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: r.color }} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate">{r.label}</span>
                  <span className="block text-[11px] text-muted">{labels.target.replace("{pct}", String(r.target))}</span>
                </span>
                <span className="num w-10 text-right text-muted">{Math.round(pct(r.amount))}%</span>
                <span className="num text-right font-medium">{money(r.amount)}</span>
              </li>
            ))}
          </ul>
          {data.unclassified > 0n && (
            <p className="mt-3 text-xs text-muted">
              {labels.unclassified.replace("{amount}", money(data.unclassified))}{" "}
              <Link href="/categories" className="text-accent hover:underline">
                {labels.markCategories}
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}
