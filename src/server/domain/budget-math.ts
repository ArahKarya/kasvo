export type BudgetState = "ok" | "warning" | "over";

export interface BudgetLineInput {
  categoryId: string;
  name: string;
  amount: bigint;
  /** This category plus its subcategories. */
  covers: string[];
}

export interface BudgetLine extends BudgetLineInput {
  spent: bigint;
  remaining: bigint;
  /** 0–∞; 1 means the budget is fully used. */
  used: number;
  /** End-of-month spending at the current pace; equals `spent` for past months. */
  projected: bigint;
  state: BudgetState;
  /** Average monthly spending over the three months before. */
  average: bigint;
}

export interface MonthProgress {
  daysInMonth: number;
  /** Days of the month that have passed, including today; 0 for future months. */
  daysElapsed: number;
}

/** Warn at this share of the budget, or when the pace would overshoot it. */
export const WARN_AT = 0.8;

export function monthProgress(month: string, today: string): MonthProgress {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const current = today.slice(0, 7);
  if (month < current) return { daysInMonth, daysElapsed: daysInMonth };
  if (month > current) return { daysInMonth, daysElapsed: 0 };
  return { daysInMonth, daysElapsed: Number(today.slice(8, 10)) };
}

const sumOf = (ids: string[], by: Map<string, bigint>): bigint => ids.reduce((s, id) => s + (by.get(id) ?? 0n), 0n);

export function computeBudgetLines(
  lines: BudgetLineInput[],
  spentByCategory: Map<string, bigint>,
  averageByCategory: Map<string, bigint>,
  progress: MonthProgress,
): BudgetLine[] {
  return lines
    .map((line) => {
      const spent = sumOf(line.covers, spentByCategory);
      const projected =
        progress.daysElapsed > 0 && progress.daysElapsed < progress.daysInMonth
          ? (spent * BigInt(progress.daysInMonth)) / BigInt(progress.daysElapsed)
          : spent;
      const used = line.amount === 0n ? 0 : Number(spent) / Number(line.amount);
      const state: BudgetState = spent > line.amount ? "over" : used >= WARN_AT || projected > line.amount ? "warning" : "ok";
      return { ...line, spent, remaining: line.amount - spent, used, projected, state, average: sumOf(line.covers, averageByCategory) };
    })
    .sort((a, b) => b.used - a.used);
}
