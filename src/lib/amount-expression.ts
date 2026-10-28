import { parseRupiah } from "@/server/domain/money";

/**
 * Evaluates what the quick-entry keypad builds: "150000+50000*2", "25rb + 1,5jt", "120rb÷3".
 * Numbers use Indonesian notation (parseRupiah); operators are + − × ÷ (and - * / x).
 * Multiplication and division bind tighter; the result is rounded to whole rupiah.
 * Returns null for anything that is not a complete, finite expression. Never uses eval.
 */
export function evaluateAmount(input: string): bigint | null {
  const text = input.toLowerCase().replace(/\s+/g, "").replace(/−/g, "-").replace(/[×x]/g, "*").replace(/÷/g, "/");
  if (!text) return null;
  const tokens = text.match(/[\d.,]+(?:rb|ribu|k|jt|juta|m)?|[+\-*/]|[^\d.,+\-*/]+/g);
  if (!tokens) return null;

  // Alternate number, operator, number…; a leading minus belongs to the first number.
  const numbers: number[] = [];
  const operators: string[] = [];
  let expectNumber = true;
  let negate = false;
  for (const token of tokens) {
    if (expectNumber) {
      if (token === "-" && numbers.length === 0 && !negate) {
        negate = true;
        continue;
      }
      const value = parseRupiah(token);
      if (value === null || /^[+\-*/]$/.test(token)) return null;
      numbers.push(Number(value) * (negate ? -1 : 1));
      negate = false;
      expectNumber = false;
    } else {
      if (!/^[+\-*/]$/.test(token)) return null;
      operators.push(token);
      expectNumber = true;
    }
  }
  if (expectNumber) return null;

  // First pass: * and /. Second pass: + and -.
  const terms = [numbers[0]];
  const additive: string[] = [];
  operators.forEach((op, i) => {
    const next = numbers[i + 1];
    if (op === "*") terms[terms.length - 1] *= next;
    else if (op === "/") terms[terms.length - 1] = next === 0 ? NaN : terms[terms.length - 1] / next;
    else {
      additive.push(op);
      terms.push(next);
    }
  });
  const total = terms.slice(1).reduce((sum, term, i) => (additive[i] === "+" ? sum + term : sum - term), terms[0]);
  const rounded = Math.round(total);
  return Number.isSafeInteger(rounded) ? BigInt(rounded) : null;
}

/** True when the text is more than a single number, so the UI can show "= result". */
export const isExpression = (input: string): boolean => /\d(?:rb|ribu|k|jt|juta)?\s*[+\-−*/×x÷]\s*\d/i.test(input);
