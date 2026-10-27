import { z } from "zod";
import { parseDay } from "./dates";
import { parseRupiah } from "./money";

/** Whole rupiah from a bigint, an integer, or text such as "25rb" or "Rp1.250.000". */
export const amountSchema = z.union([z.bigint(), z.number().int(), z.string()]).transform((value, ctx) => {
  const parsed = typeof value === "string" ? parseRupiah(value) : BigInt(value);
  if (parsed === null) {
    ctx.addIssue({ code: "custom", message: `Not an amount: ${String(value)}. Try "25000", "25rb", or "1,5jt".` });
    return z.NEVER;
  }
  return parsed;
});

export const positiveAmountSchema = amountSchema.refine((v) => v > 0n, "Amount must be greater than zero.");

/** "YYYY-MM-DD" → Date at UTC midnight. */
export const daySchema = z.string().transform((value, ctx) => {
  const day = parseDay(value);
  if (!day) {
    ctx.addIssue({ code: "custom", message: `Not a date: ${value}. Use YYYY-MM-DD.` });
    return z.NEVER;
  }
  return day;
});

export const idSchema = z.string().min(1).max(64);

/** Empty strings from HTML forms become undefined. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** An optional day where an empty form field means "not set". */
export const optionalDaySchema = z.union([z.literal("").transform(() => undefined), daySchema]).optional();

/** An optional id where an empty form field means "not set". */
export const optionalIdSchema = z.union([z.literal("").transform(() => undefined), idSchema]).optional();
