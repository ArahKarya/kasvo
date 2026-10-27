import { describe, expect, it } from "vitest";
import { buildPdf, tablePage } from "../../../../tests/fixtures/pdf-builder";
import { extractPdfLines, PdfReadError } from "./pdf-text";

const page = tablePage([
  [[40, "TANGGAL"], [100, "KETERANGAN"], [400, "MUTASI"]],
  [[40, "01/10"], [100, "TRSF E-BANKING DB"], [400, "50,000.00 DB"]],
]);

describe("extractPdfLines", () => {
  it("groups text into lines of cells ordered by position", async () => {
    const lines = await extractPdfLines(buildPdf([page]));
    expect(lines.map((l) => l.cells.map((c) => c.text))).toEqual([
      ["TANGGAL", "KETERANGAN", "MUTASI"],
      ["01/10", "TRSF E-BANKING DB", "50,000.00 DB"],
    ]);
    expect(lines[1].cells[2].x).toBeCloseTo(400);
  });

  it("opens a password-protected PDF only with the right password", async () => {
    const pdf = buildPdf([page], { userPassword: "01011990" });
    await expect(extractPdfLines(pdf)).rejects.toMatchObject({ failure: "password_needed" });
    await expect(extractPdfLines(pdf, "salah")).rejects.toMatchObject({ failure: "password_wrong" });
    expect((await extractPdfLines(pdf, "01011990"))[1].cells[1].text).toBe("TRSF E-BANKING DB");
  });

  it("rejects files that are not PDFs and PDFs without text", async () => {
    await expect(extractPdfLines(new TextEncoder().encode("Tanggal,Keterangan\n"))).rejects.toBeInstanceOf(PdfReadError);
    await expect(extractPdfLines(buildPdf([[]]))).rejects.toMatchObject({ failure: "no_text" });
  });
});
