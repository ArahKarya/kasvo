/**
 * Amounts as banks print them: "1,000,000.00", "1.000.000,00", "50,000.00 DB", "(25.000)",
 * "Rp 1.500.000", "-15000". Returns whole rupiah (cents are rounded) or null.
 *
 * The decimal mark is the last "." or "," when exactly one or two digits follow it;
 * every other separator is grouping.
 */
export function parseStatementAmount(input: string): bigint | null {
  let text = input.trim().toUpperCase().replace(/^'/, "").replace(/RP\.?/g, "").replace(/\s+/g, "");
  if (!text) return null;

  let negative = false;
  const suffix = /(DB|DR|D|CR|K|C)$/.exec(text);
  if (suffix) {
    negative = suffix[1] === "DB" || suffix[1] === "DR" || suffix[1] === "D";
    text = text.slice(0, -suffix[1].length);
  }
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null;

  const decimal = /[.,](\d{1,2})$/.exec(text);
  const whole = (decimal ? text.slice(0, -decimal[0].length) : text).replace(/[.,]/g, "");
  if (!/^\d+$/.test(whole)) return null;
  let value = BigInt(whole);
  if (decimal && Number(decimal[1].padEnd(2, "0")) >= 50) value += 1n;
  return negative ? -value : value;
}

/** Debit/credit marker in its own column: "D", "DB", "Debit", "K", "CR", "Kredit". */
export function directionOf(marker: string): -1 | 1 | null {
  const m = marker.trim().toUpperCase();
  if (/^(D|DB|DR|DEBIT|DEBET)$/.test(m)) return -1;
  if (/^(K|C|CR|KREDIT|CREDIT)$/.test(m)) return 1;
  return null;
}
