export type DateOrder = "DMY" | "MDY" | "YMD";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
  agu: 8, ags: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

function build(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 ? d : null;
}

const fullYear = (y: string): number => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * Statement dates: "01/10/2026", "1-10-26", "2026-10-01", "01 Okt 2026", "'01/10" (BCA
 * leaves the year out; `fallbackYear` fills it), with or without a trailing time.
 */
export function parseStatementDate(input: string, order: DateOrder = "DMY", fallbackYear?: number): Date | null {
  const text = input.trim().replace(/^'/, "").split(/\s+\d{1,2}:\d{2}/)[0].trim();

  const named = /^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{2,4})$/.exec(text);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    return month ? build(fullYear(named[3]), month, Number(named[1])) : null;
  }

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (iso) return build(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const three = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(text);
  if (three) {
    const [a, b, y] = [Number(three[1]), Number(three[2]), fullYear(three[3])];
    return order === "MDY" ? build(y, a, b) : build(y, b, a);
  }

  const two = /^(\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (two && fallbackYear) {
    const [a, b] = [Number(two[1]), Number(two[2])];
    return order === "MDY" ? build(fallbackYear, a, b) : build(fallbackYear, b, a);
  }
  return null;
}
