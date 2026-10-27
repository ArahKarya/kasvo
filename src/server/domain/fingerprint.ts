import { createHash } from "node:crypto";
import { toDay } from "./dates";

/** Lowercase, collapse whitespace, drop punctuation: "TRSF E-BANKING  CR/123" → "trsf ebanking cr123". */
export function normaliseDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identifies "the same transaction" across manual entry and statement imports. Two rows
 * with the same account, day, amount, and description share a fingerprint; imports compare
 * how many of each exist, so two genuine identical coffees on one day are both kept.
 */
export function fingerprint(accountId: string, bookedOn: Date, amount: bigint, description: string): string {
  return createHash("sha256")
    .update([accountId, toDay(bookedOn), amount.toString(), normaliseDescription(description)].join("|"))
    .digest("hex");
}
