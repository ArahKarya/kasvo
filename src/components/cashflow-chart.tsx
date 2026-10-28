"use client";

import { useState } from "react";

export interface CashflowPoint {
  /** Short axis label, e.g. "Okt". */
  label: string;
  /** Long label for the tooltip and table, e.g. "Oktober 2026". */
  title: string;
  income: number;
  expense: number;
  incomeText: string;
  expenseText: string;
  netText: string;
}

interface CashflowChartProps {
  points: CashflowPoint[];
  locale: string;
  labels: { income: string; spending: string; net: string; month: string; showTable: string };
  height?: number;
}

const W = 720;
const PAD = { top: 12, right: 8, bottom: 24, left: 52 };

/** Rounded top corners, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}

/** Grouped income/spending bars per month, with a hover/focus tooltip and a table view. */
export function CashflowChart({ points, locale, labels, height = 220 }: CashflowChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.income, p.expense)), 0));
  const plotH = height - PAD.top - PAD.bottom;
  const plotW = W - PAD.left - PAD.right;
  const slot = plotW / Math.max(points.length, 1);
  const barW = Math.min(18, (slot - 10) / 2);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const ticks = [0, max / 2, max];
  const shown = active === null ? null : points[active];

  return (
    <figure className="space-y-2">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-chart-income" />
          {labels.income}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-chart-expense" />
          {labels.spending}
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={`${labels.income} / ${labels.spending}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)">
                {compact.format(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const incomeX = cx - barW - 1;
            const expenseX = cx + 1;
            const dim = active !== null && active !== i;
            return (
              <g
                key={p.title}
                tabIndex={0}
                role="button"
                aria-label={`${p.title}: ${labels.income} ${p.incomeText}, ${labels.spending} ${p.expenseText}, ${labels.net} ${p.netText}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none"
              >
                <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotH} fill={active === i ? "var(--border)" : "transparent"} opacity={0.35} />
                <path d={barPath(incomeX, y(p.income), barW, y(0) - y(p.income))} fill="var(--chart-income)" opacity={dim ? 0.45 : 1} />
                <path d={barPath(expenseX, y(p.expense), barW, y(0) - y(p.expense))} fill="var(--chart-expense)" opacity={dim ? 0.45 : 1} />
                <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>

        {shown && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-sm"
            style={{ left: `clamp(0px, calc(${((PAD.left + slot * active + slot / 2) / W) * 100}% - 88px), calc(100% - 180px))` }}
          >
            <p className="mb-1 text-muted">{shown.title}</p>
            {[
              [labels.income, shown.incomeText, "var(--chart-income)"],
              [labels.spending, shown.expenseText, "var(--chart-expense)"],
              [labels.net, shown.netText, "transparent"],
            ].map(([name, value, color]) => (
              <p key={name} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3" style={{ background: color }} />
                <span className="num font-semibold">{value}</span>
                <span className="text-muted">{name}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted">{labels.showTable}</summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 font-medium">{labels.month}</th>
              <th className="py-1 text-right font-medium">{labels.income}</th>
              <th className="py-1 text-right font-medium">{labels.spending}</th>
              <th className="py-1 text-right font-medium">{labels.net}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {points.map((p) => (
              <tr key={p.title}>
                <td className="py-1">{p.title}</td>
                <td className="num py-1 text-right">{p.incomeText}</td>
                <td className="num py-1 text-right">{p.expenseText}</td>
                <td className="num py-1 text-right">{p.netText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
