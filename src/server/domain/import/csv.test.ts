import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

const fixture = (name: string) => readFileSync(new URL(`../../../../tests/fixtures/statements/${name}`, import.meta.url), "utf8");
const summary = (name: string) => {
  const r = parseCsv(fixture(name));
  if (!r.ok) throw new Error(`${name}: ${r.reason}`);
  return { format: r.format, skipped: r.skipped, rows: r.rows.map((x) => [x.bookedOn.toISOString().slice(0, 10), Number(x.amount), x.description]) };
};

describe("parseCsv", () => {
  it("reads a KlikBCA export: DB/CR suffix, year from the period line, footer and pending skipped", () => {
    const r = summary("bca.csv");
    expect(r.format).toBe("bca");
    expect(r.rows).toEqual([
      ["2026-10-01", 8_500_000, "TRSF E-BANKING CR 0110/FTSCY/WS95031 8500000.00 PT CONTOH MAJU"],
      ["2026-10-02", -500_000, "TARIKAN ATM 02/10"],
      ["2026-10-03", -125_400, "KARTU DEBIT INDOMARET CONTOH"],
      ["2026-10-03", -125_400, "KARTU DEBIT INDOMARET CONTOH"],
      ["2026-10-05", -10_000, "BIAYA ADM"],
    ]);
    expect(r.skipped).toBe(5);
  });

  it("reads separate debit/credit columns and joins split descriptions", () => {
    const r = summary("mandiri.csv");
    expect(r.format).toBe("mandiri");
    expect(r.rows[0]).toEqual(["2026-10-01", 7_250_000, "TRANSFER DARI PT CONTOH MAJU GAJI OKT"]);
    expect(r.rows[1][1]).toBe(-203_000);
  });

  it("reads semicolons, Indonesian decimals, two-digit years, and times", () => {
    expect(summary("bri.csv").rows).toEqual([
      ["2026-10-02", -150_000, "BRIVA SHOPEE 1234"],
      ["2026-10-03", 1_000_000, "TRF DARI CONTOH SAUDARA"],
    ]);
  });

  it("reads a D/K column next to an unsigned amount and month names", () => {
    expect(summary("bni.csv").rows).toEqual([
      ["2026-10-07", -250_000, "TRANSFER KE CONTOH TOKO"],
      ["2026-10-08", 1_250, "BUNGA TABUNGAN"],
    ]);
  });

  it("asks for a mapping when headers are unknown, then uses it", () => {
    const text = fixture("custom.csv");
    const first = parseCsv(text);
    expect(first.ok).toBe(false);
    const mapped = parseCsv(text, { headerRow: 0, date: 0, description: [1], amount: 2, dateOrder: "YMD" });
    expect(mapped.ok && mapped.rows.map((r) => Number(r.amount))).toEqual([-45_000, 20_000]);
  });
});
