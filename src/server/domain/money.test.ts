import { describe, expect, it } from "vitest";
import { formatMoney, parseRupiah } from "./money";

describe("parseRupiah", () => {
  it.each([
    ["25rb", 25_000n],
    ["25 ribu", 25_000n],
    ["1,5jt", 1_500_000n],
    ["2.5 juta", 2_500_000n],
    ["Rp 1.250.000", 1_250_000n],
    ["Rp1.250.000,00", 1_250_000n],
    ["250000", 250_000n],
    ["15k", 15_000n],
    ["1,2 miliar", 1_200_000_000n],
    ["-50rb", -50_000n],
    ["1.000", 1_000n],
  ])("%s → %s", (input, expected) => {
    expect(parseRupiah(input)).toBe(expected);
  });

  it.each(["", "abc", "12xyz", "1,2,3", "1.2.3,4,5", "rb"])("rejects %j", (input) => {
    expect(parseRupiah(input)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats IDR without decimals", () => {
    expect(formatMoney(1_250_000n)).toBe("Rp1.250.000");
    expect(formatMoney(-25_000n)).toBe("-Rp25.000");
  });

  it("formats two-decimal currencies from minor units", () => {
    expect(formatMoney(1250n, "USD", "en-US")).toBe("$12.50");
  });
});
