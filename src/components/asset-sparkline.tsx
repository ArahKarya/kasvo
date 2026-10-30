interface Point {
  /** Axis label, e.g. "Okt". */
  label: string;
  /** Plain number for scaling; null before the asset existed. */
  value: number | null;
  text: string;
}

interface AssetSparklineProps {
  points: Point[];
  /** Describes the chart for screen readers. */
  summary: string;
  tone: "up" | "down" | "flat";
  height?: number;
}

const W = 240;
const PAD = 4;

const TONES = { up: "var(--color-income)", down: "var(--color-expense)", flat: "var(--color-muted)" } as const;

/** Small line chart of month-end values; months before the asset existed are skipped. */
export function AssetSparkline({ points, summary, tone, height = 44 }: AssetSparklineProps) {
  const known = points.map((p, i) => ({ ...p, i })).filter((p): p is Point & { i: number; value: number } => p.value !== null);
  if (known.length === 0) return null;
  const min = Math.min(...known.map((p) => p.value));
  const max = Math.max(...known.map((p) => p.value));
  const span = max - min || 1;
  const step = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
  const x = (i: number) => PAD + i * step;
  const y = (v: number) => (max === min ? height / 2 : PAD + (height - PAD * 2) * (1 - (v - min) / span));
  const d = known.map((p, n) => `${n === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = known[known.length - 1];
  const color = TONES[tone];

  return (
    <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={summary} className="h-11 w-full" preserveAspectRatio="none">
      <title>{summary}</title>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {known.length > 1 && <circle cx={x(last.i)} cy={y(last.value)} r="3" fill={color} />}
    </svg>
  );
}
