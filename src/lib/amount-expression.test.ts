import { describe, expect, it } from "vitest";
import { evaluateAmount, isExpression } from "./amount-expression";

describe("evaluateAmount", () => {
  it("reads plain Indonesian amounts", () => {
    expect(evaluateAmount("25000")).toBe(25_000n);
    expect(evaluateAmount("25rb")).toBe(25_000n);
    expect(evaluateAmount("1,5jt")).toBe(1_500_000n);
    expect(evaluateAmount("1.250.000")).toBe(1_250_000n);
  });

  it("evaluates keypad arithmetic with precedence", () => {
    expect(evaluateAmount("150000+50000*2")).toBe(250_000n);
    expect(evaluateAmount("150000+50000×2")).toBe(250_000n);
    expect(evaluateAmount("25rb + 1,5jt")).toBe(1_525_000n);
    expect(evaluateAmount("120rb÷3")).toBe(40_000n);
    expect(evaluateAmount("100rb − 15rb")).toBe(85_000n);
    expect(evaluateAmount("10000/3")).toBe(3_333n);
    expect(evaluateAmount("-5000+20000")).toBe(15_000n);
  });

  it("rejects incomplete or unsafe input", () => {
    for (const bad of ["", "+", "25rb+", "*3", "2++3", "1/0", "abc", "alert(1)", "2**3", "1e9"]) expect(evaluateAmount(bad)).toBeNull();
  });

  it("tells a formula from a single number", () => {
    expect(isExpression("25rb+10rb")).toBe(true);
    expect(isExpression("25rb")).toBe(false);
    expect(isExpression("-25000")).toBe(false);
  });
});
