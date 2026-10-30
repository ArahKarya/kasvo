import Link from "next/link";
import { AssetSparkline } from "@/components/asset-sparkline";
import { ASSET_ICONS } from "@/components/asset-icons";
import { Card } from "@/components/ui";
import type { Monitor } from "@/server/domain/assets";
import { fmt, type Dictionary } from "@/i18n/dictionaries";

interface AssetMonitorProps {
  monitor: Monitor;
  t: Dictionary;
  money: (v: bigint) => string;
  monthLabel: (month: string) => string;
}

const sign = (v: bigint) => (v > 0n ? "+" : "");
const pctText = (pct: number | null) => (pct === null ? "" : ` (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)`);
const tone = (v: bigint | undefined) => (v === undefined || v === 0n ? "flat" : v > 0n ? "up" : "down");
const toneClass = { up: "text-income", down: "text-expense", flat: "text-muted" } as const;

/** Gold, stocks, funds, and crypto: their trend, last move, and which ones need a fresh price. */
export function AssetMonitor({ monitor, t, money, monthLabel }: AssetMonitorProps) {
  const a = t.assets;
  if (monitor.rows.length === 0) return null;
  const totalPoints = monitor.months.map((m) => ({ label: monthLabel(m.month), value: m.value === null ? null : Number(m.value), text: m.value === null ? "" : money(m.value) }));
  const first = monitor.months.find((m) => m.value !== null);
  const trend = first && monitor.months[monitor.months.length - 1].value !== null ? monitor.months[monitor.months.length - 1].value! - first.value! : undefined;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{a.monitorTitle}</h2>
        {monitor.staleCount > 0 && <p className="rounded-full bg-gold-soft px-2.5 py-0.5 text-xs font-medium text-gold-text">{fmt(a.monitorStale, { n: String(monitor.staleCount) })}</p>}
      </div>
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">{a.monitorTotal}</p>
            <p className="num text-2xl font-bold">{money(monitor.total)}</p>
            {monitor.cost > 0n && (
              <p className={`num text-sm ${toneClass[tone(monitor.gain)]}`}>
                {sign(monitor.gain)}
                {money(monitor.gain)} {fmt(a.monitorVsCost, { cost: money(monitor.cost) })}
              </p>
            )}
          </div>
          <div className="w-full sm:w-56">
            <AssetSparkline points={totalPoints} tone={tone(trend)} summary={fmt(a.monitorChartTotal, { months: String(monitor.months.length) })} />
            <p className="mt-1 flex justify-between text-[10px] text-muted">
              <span>{totalPoints[0]?.label}</span>
              <span>{totalPoints[totalPoints.length - 1]?.label}</span>
            </p>
          </div>
        </div>
      </Card>
      <ul className="grid gap-3 sm:grid-cols-2">
        {monitor.rows.map((r) => {
          const Icon = ASSET_ICONS[r.asset.kind];
          const points = r.months.map((m) => ({ label: monthLabel(m.month), value: m.value === null ? null : Number(m.value), text: m.value === null ? "" : money(m.value) }));
          const c = r.change;
          return (
            <li key={r.asset.id}>
              <Link href={`/assets/${r.asset.id}`} className="block min-w-0 space-y-2 rounded-xl border border-border bg-surface p-4 hover:border-accent/50">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-text">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.asset.name}</span>
                    <span className="block truncate text-xs text-muted">{[a.kinds[r.asset.kind], r.asset.units ? `${r.asset.units} unit` : null, r.asset.unitPrice !== null ? `${money(r.asset.unitPrice)} / unit` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="num shrink-0 font-semibold whitespace-nowrap">{money(r.asset.value)}</span>
                </div>
                <AssetSparkline points={points} tone={tone(c?.delta)} summary={fmt(a.monitorChartAsset, { name: r.asset.name, months: String(points.length) })} />
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  {c ? (
                    <span className={`num ${toneClass[tone(c.delta)]}`}>
                      {sign(c.delta)}
                      {money(c.delta)}
                      {pctText(c.pct)}
                    </span>
                  ) : (
                    <span className="text-muted">{a.monitorNoChange}</span>
                  )}
                  <span className={r.stale ? "font-medium text-gold-text" : "text-muted"}>{r.age === null ? a.monitorNever : r.stale ? fmt(a.monitorOld, { n: String(r.age) }) : r.age === 0 ? a.monitorToday : fmt(a.monitorDaysAgo, { n: String(r.age) })}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
