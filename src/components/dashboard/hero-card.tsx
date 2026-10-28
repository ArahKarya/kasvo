import { Gem, Wallet } from "lucide-react";
import type { NetWorthPoint, Wealth } from "@/server/domain/wealth";
import { AmountsToggle } from "../amounts-toggle";

interface HeroCardProps {
  wealth: Wealth;
  trend: NetWorthPoint[];
  assetCount: number;
  hidden: boolean;
  money: (v: bigint) => string;
  labels: { netWorth: string; assets: string; liabilities: string; accounts: string; assetCount: string; trend: string; hide: string; show: string };
}

const W = 160;
const H = 56;

/** A soft area sparkline of month-end net worth, drawn in white on the green card. */
function Sparkline({ points, label }: { points: NetWorthPoint[]; label: string }) {
  if (points.length < 2) return null;
  const values = points.map((p) => Number(p.netWorth));
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const xy = values.map((v, i) => [(i / (values.length - 1)) * (W - 6) + 3, H - 4 - ((v - min) / span) * (H - 10)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-40" role="img" aria-label={label}>
      <path d={`${line}L${lx},${H}L3,${H}Z`} fill="rgba(255,255,255,0.12)" />
      <path d={line} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3.5} fill="#fff" stroke="rgba(255,255,255,0.4)" strokeWidth={4} />
    </svg>
  );
}

/** The green card at the top of the dashboard: net worth, what it is made of, and its trend. */
export function HeroCard({ wealth, trend, assetCount, hidden, money, labels }: HeroCardProps) {
  const chip = "inline-flex items-center gap-1.5 rounded-sm bg-white/15 px-2 py-1 text-xs font-medium";
  return (
    <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1d7a57_0%,#145c42_55%,#0f4a35_100%)] p-5 text-white shadow-sm">
      <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-[#f4ae2a]/15 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className={chip}>
            <Wallet size={13} aria-hidden="true" />
            {labels.accounts}
          </span>
          {assetCount > 0 && (
            <span className={chip}>
              <Gem size={13} aria-hidden="true" />
              {labels.assetCount}
            </span>
          )}
        </div>
        <AmountsToggle hidden={hidden} labels={{ hide: labels.hide, show: labels.show }} className="rounded-sm p-1.5 text-white/90 hover:bg-white/15" />
      </div>
      <p className="mt-4 text-sm text-white/75">{labels.netWorth}</p>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="num text-3xl font-bold tracking-tight sm:text-4xl">{money(wealth.netWorth)}</p>
        <Sparkline points={trend} label={labels.trend} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3">
        <div>
          <dt className="text-xs text-white/70">↗ {labels.assets}</dt>
          <dd className="num font-semibold">{money(wealth.totalAssets)}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/70">↘ {labels.liabilities}</dt>
          <dd className="num font-semibold">{money(wealth.totalLiabilities)}</dd>
        </div>
      </dl>
    </section>
  );
}
