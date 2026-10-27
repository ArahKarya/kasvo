import { describe, expect, it } from "vitest";
import { directionOf, parseStatementAmount } from "./numbers";
import { parseStatementDate } from "./dates";

describe("parseStatementAmount", () => {
  it.each([
    ["1,000,000.00", 1_000_000n],
    ["1.000.000,00", 1_000_000n],
    ["50,000.00 DB", -50_000n],
    ["2,500,000.00 CR", 2_500_000n],
    ["(25.000)", -25_000n],
    ["Rp 1.500.000", 1_500_000n],
    ["-15000", -15_000n],
    ["15000", 15_000n],
    ["1.500", 1_500n],
    ["12.345,67", 12_346n],
    ["'0.00", 0n],
  ])("%s → %s", (input, expected) => {
    expect(parseStatementAmount(input)).toBe(expected);
  });

  it.each(["", "Saldo", "1-2", "abc DB"])("rejects %j", (input) => {
    expect(parseStatementAmount(input)).toBeNull();
  });

  it("reads debit/credit markers", () => {
    expect(directionOf("D")).toBe(-1);
    expect(directionOf("Kredit")).toBe(1);
    expect(directionOf("?")).toBeNull();
  });
});

describe("parseStatementDate", () => {
  const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
  it.each([
    ["01/10/2026", "2026-10-01"],
    ["1-10-26", "2026-10-01"],
    ["2026-10-01", "2026-10-01"],
    ["01 Okt 2026", "2026-10-01"],
    ["15 Agu 2026", "2026-08-15"],
    ["01/10/2026 13:45:10", "2026-10-01"],
  ])("%s → %s", (input, expected) => {
    expect(day(parseStatementDate(input))).toBe(expected);
  });

  it("fills a missing year and respects month-first order", () => {
    expect(day(parseStatementDate("'05/10", "DMY", 2026))).toBe("2026-10-05");
    expect(day(parseStatementDate("10/05/2026", "MDY"))).toBe("2026-10-05");
    expect(parseStatementDate("31/02/2026")).toBeNull();
    expect(parseStatementDate("SALDO AWAL")).toBeNull();
  });
});
