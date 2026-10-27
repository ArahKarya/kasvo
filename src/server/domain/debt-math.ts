import { addMonths, daysBetween } from "./dates";

export type InstalmentStatus = "paid" | "partial" | "overdue" | "due" | "upcoming";
export type DebtState = "active" | "due_soon" | "overdue" | "settled";

/** Instalments due within this many days count as "due soon". */
export const DUE_SOON_DAYS = 7;

export interface DebtTerms {
  instalmentAmount: bigint;
  instalmentCount: number;
  /** "YYYY-MM-DD" */
  firstDueOn: string;
}

export interface InstalmentLine {
  seq: number;
  dueOn: string;
  amount: bigint;
  /** Part of this instalment already covered by payments, applied oldest first. */
  paid: bigint;
  status: InstalmentStatus;
}

export interface DebtStatus {
  totalDue: bigint;
  paid: bigint;
  outstanding: bigint;
  /** Paid beyond the total; normally 0. */
  overpaid: bigint;
  paidCount: number;
  overdueCount: number;
  overdueAmount: bigint;
  /** The first instalment not fully paid. */
  next: InstalmentLine | null;
  endsOn: string;
  state: DebtState;
  lines: InstalmentLine[];
}

/** Monthly due dates from the first one, keeping its day-of-month. */
export function scheduleOf(terms: DebtTerms): { seq: number; dueOn: string; amount: bigint }[] {
  return Array.from({ length: terms.instalmentCount }, (_, i) => ({
    seq: i + 1,
    dueOn: addMonths(terms.firstDueOn, i),
    amount: terms.instalmentAmount,
  }));
}

function statusOf(amount: bigint, paid: bigint, dueOn: string, today: string): InstalmentStatus {
  if (paid >= amount) return "paid";
  const days = daysBetween(today, dueOn);
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_DAYS) return "due";
  return paid > 0n ? "partial" : "upcoming";
}

/** Applies total payments to the schedule oldest first and summarises where the debt stands on `today`. */
export function debtStatus(terms: DebtTerms, paid: bigint, today: string): DebtStatus {
  let left = paid;
  const lines = scheduleOf(terms).map((s) => {
    const covered = left >= s.amount ? s.amount : left > 0n ? left : 0n;
    left -= covered;
    return { ...s, paid: covered, status: statusOf(s.amount, covered, s.dueOn, today) };
  });
  const totalDue = terms.instalmentAmount * BigInt(terms.instalmentCount);
  const outstanding = totalDue > paid ? totalDue - paid : 0n;
  const overdue = lines.filter((l) => l.status === "overdue");
  const next = lines.find((l) => l.status !== "paid") ?? null;
  const state: DebtState = outstanding === 0n ? "settled" : overdue.length > 0 ? "overdue" : next?.status === "due" ? "due_soon" : "active";
  return {
    totalDue,
    paid,
    outstanding,
    overpaid: paid > totalDue ? paid - totalDue : 0n,
    paidCount: lines.filter((l) => l.status === "paid").length,
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((s, l) => s + l.amount - l.paid, 0n),
    next,
    endsOn: lines.at(-1)?.dueOn ?? terms.firstDueOn,
    state,
    lines,
  };
}

/** What a payment covers when the user gives no amount: the rest of the next instalment. */
export const suggestedPayment = (s: DebtStatus): bigint => (s.next ? s.next.amount - s.next.paid : 0n);
