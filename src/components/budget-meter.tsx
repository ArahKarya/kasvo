import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import type { BudgetState } from "@/server/domain/budget-math";

const STYLE: Record<BudgetState, { color: string; Icon: typeof CircleCheck }> = {
  ok: { color: "var(--status-good)", Icon: CircleCheck },
  warning: { color: "var(--status-warning)", Icon: CircleAlert },
  over: { color: "var(--status-critical)", Icon: CircleX },
};

interface BudgetMeterProps {
  used: number;
  /** Projected end-of-month use, 0–∞. */
  projected: number;
  state: BudgetState;
  label: string;
}

/** A progress bar with a tick at the projected pace, plus an icon and label so state is never colour alone. */
export function BudgetMeter({ used, projected, state, label }: BudgetMeterProps) {
  const { color, Icon } = STYLE[state];
  const clamp = (v: number) => `${Math.min(Math.max(v, 0), 1) * 100}%`;
  return (
    <div className="space-y-1">
      <div className="relative h-2 overflow-hidden rounded-sm bg-border/60" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)} aria-label={label}>
        <div className="h-full rounded-sm" style={{ width: clamp(used), background: color }} />
        {projected > used && projected < 1.5 && <div className="absolute top-0 h-full w-0.5 bg-text/60" style={{ left: clamp(projected) }} aria-hidden="true" />}
      </div>
      <p className="flex items-center gap-1 text-xs font-medium">
        <Icon size={14} style={{ color }} aria-hidden="true" />
        {label}
      </p>
    </div>
  );
}
