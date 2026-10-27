import { Circle, CircleAlert, CircleCheck, CircleX } from "lucide-react";

export type Tone = "good" | "warning" | "critical" | "neutral";

const STYLE: Record<Tone, { color: string; Icon: typeof CircleCheck }> = {
  good: { color: "var(--status-good)", Icon: CircleCheck },
  warning: { color: "var(--status-warning)", Icon: CircleAlert },
  critical: { color: "var(--status-critical)", Icon: CircleX },
  neutral: { color: "var(--chart-bar)", Icon: Circle },
};

/** A status as icon plus label, so it never relies on colour alone. */
export function StatusLabel({ tone, label }: { tone: Tone; label: string }) {
  const { color, Icon } = STYLE[tone];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <Icon size={14} style={{ color }} aria-hidden="true" />
      {label}
    </span>
  );
}

interface StatusMeterProps {
  /** 0–1+, share completed. */
  value: number;
  tone: Tone;
  label: string;
}

/** A progress bar coloured by status, with the status written underneath. */
export function StatusMeter({ value, tone, label }: StatusMeterProps) {
  const pct = Math.min(Math.max(value, 0), 1) * 100;
  return (
    <div className="space-y-1">
      <div className="h-2 overflow-hidden rounded-sm bg-border/60" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
        <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: STYLE[tone].color }} />
      </div>
      <StatusLabel tone={tone} label={label} />
    </div>
  );
}
