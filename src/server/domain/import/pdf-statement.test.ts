import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bcaStatementPdf, gopayHistoryPdf, mandiriStatementPdf } from "../../../../tests/fixtures/statements/pdf-statements";
import { parseCsv, statementYear } from "./csv";
import { parsePdfStatement } from "./pdf-statement";
import { extractPdfLines } from "./pdf-text";

const day = (d: Date) => d.toISOString().slice(0, 10);
const summary = (rows: { bookedOn: Date; amount: bigint; description: string }[]) => rows.map((r) => [day(r.bookedOn), r.amount, r.description]);

describe("parsePdfStatement", () => {
  it("reads a password-protected BCA-style e-statement across pages", async () => {
    const result = parsePdfStatement(await extractPdfLines(bcaStatementPdf(), "01011990"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("bca pdf");
    expect(summary(result.rows)).toEqual([
      ["2026-10-02", -1_500_000n, "TRSF E-BANKING DB 0210/FTSCY/WS95051 KOST OKTOBER"],
      ["2026-10-05", -85_500n, "KARTU DEBIT INDOMARET"],
      ["2026-10-25", 12_000_000n, "TRSF E-BANKING CR GAJI OKTOBER PT MAJU"],
      ["2026-10-28", -15_000n, "BIAYA ADM"],
    ]);
    expect(result.unsigned).toBe(0);
  });

  it("reads separate debit and credit columns", async () => {
    const result = parsePdfStatement(await extractPdfLines(mandiriStatementPdf()));
    expect(result.ok && summary(result.rows)).toEqual([
      ["2026-10-03", -250_000n, "Pembayaran PLN Prabayar"],
      ["2026-10-10", 1_000_000n, "Transfer dari ANI"],
    ]);
  });

  it("reads an e-wallet history and skips failed transactions", async () => {
    const result = parsePdfStatement(await extractPdfLines(gopayHistoryPdf()));
    expect(result.ok && result.format).toBe("gopay pdf");
    expect(result.ok && summary(result.rows)).toEqual([
      ["2026-10-12", -45_000n, "GoFood - Warung Contoh"],
      ["2026-10-13", 200_000n, "Top Up dari BCA"],
      ["2026-10-15", -22_000n, "Bayar QRIS Kopi Contoh"],
    ]);
    expect(result.ok && result.skipped).toBe(1);
  });

  it("reports an unknown layout with a preview instead of guessing", () => {
    const result = parsePdfStatement([{ page: 1, cells: [{ x: 10, end: 90, text: "Surat Pemberitahuan" }] }]);
    expect(result).toEqual({ ok: false, preview: ["Surat Pemberitahuan"] });
  });
});

describe("e-wallet CSV", () => {
  it("uses the transaction type for direction and skips failed rows", () => {
    const result = parseCsv(readFileSync("tests/fixtures/statements/dana.csv", "utf8"));
    expect(result.ok && result.format).toBe("dana");
    expect(result.ok && summary(result.rows)).toEqual([
      ["2026-10-02", -35_500n, "Alfamart Contoh"],
      ["2026-10-03", 150_000n, "Kiriman dari Sari"],
      ["2026-10-05", 100_000n, "Isi saldo dari BRI"],
    ]);
  });
});

describe("statementYear", () => {
  it("reads slashed, named, and ranged periods", () => {
    expect(statementYear("Periode : 01/12/2025 - 31/01/2026")).toBe(2026);
    expect(statementYear("PERIODE : OKTOBER 2026")).toBe(2026);
    expect(statementYear("Periode 1 Des 2025 - 31 Jan 2026")).toBe(2026);
    expect(statementYear("no period here")).toBeUndefined();
  });
});
