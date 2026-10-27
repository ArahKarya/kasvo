import { normaliseDescription } from "./fingerprint";

export interface MatchableRule {
  id: string;
  contains: string;
  kind: "INCOME" | "EXPENSE" | null;
  accountId: string | null;
  minAmount: bigint | null;
  maxAmount: bigint | null;
  categoryId: string;
  setPayee: string | null;
}

export interface MatchableRow {
  description: string;
  payee?: string | null;
  /** Signed. */
  amount: bigint;
  accountId: string;
}

/** First rule that matches, in the order given (callers sort by priority). */
export function matchRule<R extends MatchableRule>(rules: readonly R[], row: MatchableRow): R | null {
  const haystack = normaliseDescription(`${row.description} ${row.payee ?? ""}`);
  const size = row.amount < 0n ? -row.amount : row.amount;
  const kind = row.amount < 0n ? "EXPENSE" : "INCOME";
  return (
    rules.find(
      (r) =>
        haystack.includes(normaliseDescription(r.contains)) &&
        (!r.kind || r.kind === kind) &&
        (!r.accountId || r.accountId === row.accountId) &&
        (r.minAmount === null || size >= r.minAmount) &&
        (r.maxAmount === null || size <= r.maxAmount),
    ) ?? null
  );
}
