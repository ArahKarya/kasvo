import { describe, expect, it } from "vitest";
import { matchRule, type MatchableRule } from "./rule-match";

const rule = (over: Partial<MatchableRule>): MatchableRule => ({
  id: "r",
  contains: "",
  kind: null,
  accountId: null,
  minAmount: null,
  maxAmount: null,
  categoryId: "c",
  setPayee: null,
  ...over,
});

describe("matchRule", () => {
  it("matches normalised text in description or payee, first rule wins", () => {
    const rules = [rule({ id: "a", contains: "indomaret" }), rule({ id: "b", contains: "kartu debit" })];
    expect(matchRule(rules, { description: "KARTU DEBIT INDOMARET", amount: -1n, accountId: "x" })?.id).toBe("a");
    // Punctuation is ignored, so "Indo-Maret" still matches "indomaret".
    expect(matchRule(rules, { description: "QRIS", payee: "Indo-Maret", amount: -1n, accountId: "x" })?.id).toBe("a");
    expect(matchRule(rules, { description: "QRIS", payee: "Alfamart", amount: -1n, accountId: "x" })).toBeNull();
    expect(matchRule([rule({ contains: "gopay" })], { description: "QRIS", payee: "GoPay", amount: -1n, accountId: "x" })).not.toBeNull();
  });

  it("respects kind, account, and amount bounds", () => {
    const r = [rule({ contains: "trsf", kind: "INCOME", accountId: "bca", minAmount: 5_000_000n, maxAmount: 10_000_000n })];
    const base = { description: "TRSF E-BANKING CR", accountId: "bca" };
    expect(matchRule(r, { ...base, amount: 8_500_000n })).not.toBeNull();
    expect(matchRule(r, { ...base, amount: -8_500_000n })).toBeNull();
    expect(matchRule(r, { ...base, amount: 1_000n })).toBeNull();
    expect(matchRule(r, { ...base, accountId: "other", amount: 8_500_000n })).toBeNull();
  });
});
