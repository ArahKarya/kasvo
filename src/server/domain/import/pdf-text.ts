import { getDocumentProxy } from "unpdf";

/** A piece of text and where it starts on the page. */
export interface PdfTextCell {
  x: number;
  /** Right edge, so right-aligned amounts can be matched to their column. */
  end: number;
  text: string;
}

/** Text that shares one baseline, left to right. */
export interface PdfTextLine {
  page: number;
  cells: PdfTextCell[];
}

export type PdfFailure = "password_needed" | "password_wrong" | "invalid" | "no_text";

export class PdfReadError extends Error {
  constructor(readonly failure: PdfFailure) {
    super(`PDF could not be read: ${failure}`);
    this.name = "PdfReadError";
  }
}

/** Items closer than this vertically belong to the same line. */
const SAME_LINE = 2.5;

interface TextItem {
  str: string;
  transform: number[];
  width: number;
}

const isTextItem = (item: unknown): item is TextItem =>
  typeof item === "object" && item !== null && "str" in item && "transform" in item && "width" in item;

function passwordFailure(error: unknown): PdfFailure | null {
  if (typeof error !== "object" || error === null || (error as { name?: string }).name !== "PasswordException") return null;
  return (error as { code?: number }).code === 2 ? "password_wrong" : "password_needed";
}

/**
 * Reads the text of a text-based PDF as lines of positioned cells. The password, when given,
 * is only handed to the PDF reader for this call; it is never stored or logged.
 * Scanned PDFs have no text and fail with `no_text`.
 */
export async function extractPdfLines(bytes: Uint8Array, password?: string): Promise<PdfTextLine[]> {
  let doc;
  try {
    // pdf.js takes ownership of the buffer, so give it a copy.
    doc = await getDocumentProxy(new Uint8Array(bytes), { password: password || undefined });
  } catch (error: unknown) {
    throw new PdfReadError(passwordFailure(error) ?? "invalid");
  }
  try {
    const lines: PdfTextLine[] = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      const items = content.items.flatMap((i: unknown) => (isTextItem(i) && i.str.trim() !== "" ? [i] : []));
      const rows: { y: number; cells: PdfTextCell[] }[] = [];
      for (const item of items) {
        const [x, y] = [item.transform[4], item.transform[5]];
        const cell = { x, end: x + item.width, text: item.str.trim() };
        const row = rows.find((r) => Math.abs(r.y - y) <= SAME_LINE);
        if (row) row.cells.push(cell);
        else rows.push({ y, cells: [cell] });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const row of rows) lines.push({ page, cells: [...row.cells].sort((a, b) => a.x - b.x) });
    }
    if (lines.length === 0) throw new PdfReadError("no_text");
    return lines;
  } finally {
    await doc.loadingTask.destroy();
  }
}

/** Plain text of the lines, cells separated by tabs; stored with the import for reference. */
export const linesToText = (lines: PdfTextLine[]): string => lines.map((l) => l.cells.map((c) => c.text).join("\t")).join("\n");
