import { ALIASES, isFailedStatus, norm, statementYear, type ParsedRow } from "./csv";
import { parseStatementDate, type DateOrder } from "./dates";
import { directionOf, hasOwnSign, parseStatementAmount } from "./numbers";
import { linesToText, type PdfTextCell, type PdfTextLine } from "./pdf-text";

type Role = keyof typeof ALIASES | "other";

interface Column {
  role: Role;
  x: number;
  end: number;
}

export type PdfParseResult =
  | { ok: true; format: string; rows: ParsedRow[]; skipped: number; /** Rows whose direction had to be assumed (money out). */ unsigned: number }
  | { ok: false; preview: string[] };

const NUMERIC: readonly Role[] = ["amount", "debit", "credit", "balance"];
const ROLES = Object.keys(ALIASES) as (keyof typeof ALIASES)[];
/** A description continues on at most this many following lines. */
const MAX_CONTINUATION = 3;
/** Lines that summarise the statement rather than record a transaction. */
const SUMMARY = /^(saldo awal|saldo akhir|opening balance|closing balance|beginning balance|ending balance|mutasi (cr|db|kredit|debet|debit)|total|jumlah|bersambung|halaman|page \d)/i;

const roleOf = (text: string): Role => ROLES.find((r) => (ALIASES[r] as readonly string[]).includes(norm(text))) ?? "other";
const center = (c: { x: number; end: number }): number => (c.x + c.end) / 2;

/** Amount-looking text: digit grouping, a currency prefix, or a sign/DB/CR marker around digits. */
const looksLikeAmount = (text: string): boolean => /\d[.,]\d{3}|^\d+[.,]\d{2}$|^[-+(]?\s*rp\.?\s*\d/i.test(text) || (/\d/.test(text) && hasOwnSign(text) && /^[-+(\d\s.,rp]/i.test(text));

function headerColumns(line: PdfTextLine): Column[] | null {
  const cols = line.cells.map((c) => ({ role: roleOf(c.text), x: c.x, end: c.end }));
  const has = (r: Role) => cols.some((c) => c.role === r);
  const usable = has("date") && has("description") && (has("amount") || (has("debit") && has("credit")));
  return usable ? cols : null;
}

/**
 * Text cells belong to the column whose left edge is the closest one at or before them
 * (columns are left-aligned); amounts to the numeric column whose centre is nearest (they are often right-aligned).
 */
function assign(cells: PdfTextCell[], columns: Column[]): Map<Role, string[]> {
  const byRole = new Map<Role, string[]>();
  const numeric = columns.filter((c) => NUMERIC.includes(c.role));
  const textual = columns.filter((c) => !NUMERIC.includes(c.role));
  for (const cell of cells) {
    let column: Column | undefined;
    if (numeric.length && looksLikeAmount(cell.text)) {
      column = numeric.reduce((best, c) => (Math.abs(center(c) - center(cell)) < Math.abs(center(best) - center(cell)) ? c : best));
    } else {
      const before = textual.filter((c) => c.x <= cell.x + 3);
      column = before.length ? before.reduce((a, b) => (b.x > a.x ? b : a)) : textual[0];
    }
    if (!column) continue;
    byRole.set(column.role, [...(byRole.get(column.role) ?? []), cell.text]);
  }
  return byRole;
}

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

function guessFormat(text: string): string {
  if (/klikbca|tahapan|bank central asia/i.test(text.slice(0, 3000))) return "bca pdf";
  const name = /\b(bca|mandiri|bri|bni|gopay|ovo|dana|shopeepay|linkaja|jago|jenius|seabank)\b/i.exec(text.slice(0, 3000));
  return name ? `${name[1].toLowerCase()} pdf` : "pdf";
}

function dateOrderOf(lines: PdfTextLine[]): DateOrder {
  return lines.some((l) => /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(l.cells[0]?.text ?? "")) ? "YMD" : "DMY";
}

interface Draft {
  line: number;
  bookedOn: Date;
  description: string;
  amount: bigint;
  continued: number;
}

/** Turns the lines of a text-based statement PDF into rows, using its column header. */
export function parsePdfStatement(lines: PdfTextLine[]): PdfParseResult {
  const text = linesToText(lines);
  const year = statementYear(text) ?? Number(/\b(20\d{2})\b/.exec(text)?.[1] ?? new Date().getUTCFullYear());
  const order = dateOrderOf(lines);
  const rows: ParsedRow[] = [];
  let columns: Column[] | null = null;
  let current: Draft | null = null;
  let balance: bigint | null = null;
  let skipped = 0;
  let unsigned = 0;

  const flush = () => {
    if (current) rows.push({ line: current.line, bookedOn: current.bookedOn, amount: current.amount, description: current.description.replace(/\s+/g, " ").trim() });
    current = null;
  };

  lines.forEach((line, index) => {
    const header = headerColumns(line);
    if (header) {
      flush();
      columns = header;
      return;
    }
    if (!columns) return;

    const cells = assign(line.cells, columns);
    const joined = (role: Role) => (cells.get(role) ?? []).join(" ").trim();
    const description = joined("description");
    const bookedOn = parseStatementDate(joined("date"), order, year);
    const printedBalance = cells.has("balance") ? parseStatementAmount(joined("balance")) : null;

    if (!bookedOn) {
      const onlyText = [...cells.keys()].every((r) => r === "description" || r === "other");
      const draft = current as Draft | null;
      if (draft && onlyText && description && !SUMMARY.test(description) && draft.continued < MAX_CONTINUATION) {
        draft.description += ` ${description}`;
        draft.continued++;
      } else {
        flush();
        if (SUMMARY.test(description) && printedBalance !== null) balance = printedBalance;
      }
      return;
    }

    flush();
    if (SUMMARY.test(description)) {
      if (printedBalance !== null) balance = printedBalance;
      return;
    }
    if (cells.has("status") && isFailedStatus(joined("status"))) {
      skipped++;
      return;
    }

    let amount: bigint | null;
    if (cells.has("debit") || cells.has("credit")) {
      const out = parseStatementAmount(joined("debit")) ?? 0n;
      const into = parseStatementAmount(joined("credit")) ?? 0n;
      amount = abs(into) - abs(out);
    } else {
      const printed = joined("amount");
      amount = parseStatementAmount(printed);
      const dir = cells.has("direction") ? directionOf(joined("direction")) : null;
      if (amount !== null && dir !== null) amount = abs(amount) * BigInt(dir);
      else if (amount !== null && !hasOwnSign(printed)) {
        if (printedBalance !== null && balance !== null && printedBalance !== balance) amount = printedBalance > balance ? abs(amount) : -abs(amount);
        else {
          amount = -abs(amount);
          unsigned++;
        }
      }
    }
    if (printedBalance !== null) balance = printedBalance;
    if (amount === null || amount === 0n || !description) {
      skipped++;
      return;
    }
    current = { line: index + 1, bookedOn, description, amount, continued: 0 };
  });
  flush();

  if (rows.length === 0) return { ok: false, preview: lines.slice(0, 15).map((l) => l.cells.map((c) => c.text).join("  ")) };
  return { ok: true, format: guessFormat(text), rows, skipped, unsigned };
}
