import { describe, expect, it } from "vitest";
import { computeBudgetLines, monthProgress } from "./budget-math";

describe("monthProgress", () => {
  it("knows past, current, and future months", () => {
    expect(monthProgress("2026-09", "2026-10-15")).toEqual({ daysInMonth: 30, daysElapsed: 30 });
    expect(monthProgress("2026-10", "2026-10-15")).toEqual({ daysInMonth: 31, daysElapsed: 15 });
    expect(monthProgress("2026-11", "2026-10-15")).toEqual({ daysInMonth: 30, daysElapsed: 0 });
    expect(monthProgress("2028-02", "2028-02-01").daysInMonth).toBe(29);
  });
});

describe("computeBudgetLines", () => {
  const spent = new Map([
    ["food", 600_000n],
    ["coffee", 150_000n],
    ["transport", 100_000n],
    ["fun", 450_000n],
  ]);
  const average = new Map([["food", 700_000n]]);
  const half = { daysInMonth: 30, daysElapsed: 15 };

  it("covers subcategories, projects the pace, and sorts by use", () => {
    const lines = computeBudgetLines(
      [
        { categoryId: "transport", name: "Transport", amount: 500_000n, covers: ["transport"] },
        { categoryId: "food", name: "Food", amount: 1_000_000n, covers: ["food", "coffee"] },
        { categoryId: "fun", name: "Fun", amount: 400_000n, covers: ["fun"] },
      ],
      spent,
      average,
      half,
    );
    expect(lines.map((l) => [l.categoryId, l.state])).toEqual([
      ["fun", "over"],
      ["food", "warning"], // 75% used, but on pace for 1.5 million
      ["transport", "ok"],
    ]);
    const food = lines[1];
    expect(food.spent).toBe(750_000n);
    expect(food.projected).toBe(1_500_000n);
    expect(food.remaining).toBe(250_000n);
    expect(food.average).toBe(700_000n);
  });

  it("does not project past months", () => {
    const [line] = computeBudgetLines([{ categoryId: "food", name: "Food", amount: 1_000_000n, covers: ["food"] }], spent, average, { daysInMonth: 30, daysElapsed: 30 });
    expect(line.projected).toBe(600_000n);
    expect(line.state).toBe("ok");
  });
});
