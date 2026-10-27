/**
 * Money helpers. Amounts are BigInt in the currency's minor unit; IDR has exponent 0, so
 * the stored value is whole rupiah.
 */

const EXPONENT: Record<string, number> = { IDR: 0, JPY: 0, USD: 2, EUR: 2, SGD: 2, MYR: 2 };

export const exponentOf = (currency: string): number => EXPONENT[currency] ?? 2;

/** "Rp1.250.000", "-Rp25.000", "US$12.50". */
export function formatMoney(amount: bigint, currency = "IDR", locale = "id-ID"): string {
  const exp = exponentOf(currency);
  const major = Number(amount) / 10 ** exp;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  })
    .format(major)
    .replace(/ /g, "");
}

const SUFFIX: Record<string, number> = {
  rb: 1_000,
  ribu: 1_000,
  k: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
  m: 1_000_000,
  mio: 1_000_000,
  miliar: 1_000_000_000,
  mlr: 1_000_000_000,
  b: 1_000_000_000,
};

/**
 * Parses how people actually type rupiah: "25rb", "1,5jt", "Rp 1.250.000", "250000",
 * "2.5 juta". Returns whole rupiah, or null when the text is not an amount.
 *
 * Indonesian notation uses "." for thousands and "," for decimals. A lone "." followed by
 * exactly three digits is read as a thousands separator; otherwise it is a decimal point.
 */
export function parseRupiah(input: string): bigint | null {
  const text = input.trim().toLowerCase().replace(/^rp\.?\s*/, "").replace(/\s+/g, "");
  const match = /^(-)?([\d.,]+)([a-z]*)$/.exec(text);
  if (!match) return null;

  const [, sign, digits, suffix] = match;
  const multiplier = suffix ? SUFFIX[suffix] : 1;
  if (multiplier === undefined) return null;

  const value = toNumber(digits);
  if (value === null) return null;

  const rupiah = Math.round(value * multiplier);
  if (!Number.isSafeInteger(rupiah)) return null;
  return BigInt(sign ? -rupiah : rupiah);
}

function toNumber(digits: string): number | null {
  let normalised: string;
  if (digits.includes(",")) {
    // "1.250,50" or "1,5": comma is the decimal mark, dots are grouping.
    if (digits.split(",").length > 2) return null;
    normalised = digits.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(digits)) {
    normalised = digits.replace(/\./g, "");
  } else {
    if (digits.split(".").length > 2) return null;
    normalised = digits;
  }
  if (!/^\d+(\.\d+)?$/.test(normalised)) return null;
  return Number(normalised);
}
