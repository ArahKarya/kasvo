import { describe, expect, it } from "vitest";
import { goalProgress, monthsUntil } from "./goal-math";

const base = { target: 12_000_000n, saved: 3_000_000n, targetDate: "2027-06-30", startedOn: "2026-01-01", today: "2026-10-27", monthlyRate: 1_000_000n };

describe("monthsUntil", () => {
  it("counts a month once its day is reached", () => {
    expect(monthsUntil("2026-10-27", "2026-12-31")).toBe(2);
    expect(monthsUntil("2026-10-27", "2026-11-10")).toBe(0);
    expect(monthsUntil("2026-10-27", "2027-10-27")).toBe(12);
  });
});

describe("goalProgress", () => {
  it("computes what is needed per month and judges the pace", () => {
    const p = goalProgress(base);
    expect(p).toMatchObject({ remaining: 9_000_000n, monthsLeft: 8, neededPerMonth: 1_125_000n, state: "behind" });
    expect(p.reached).toBeCloseTo(0.25);
    expect(p.projectedOn).toBe("2027-07-27");
    expect(goalProgress({ ...base, monthlyRate: 1_200_000n }).state).toBe("on_track");
  });

  it("does not judge a goal younger than 30 days", () => {
    expect(goalProgress({ ...base, startedOn: "2026-10-10", monthlyRate: 0n }).state).toBe("open");
  });

  it("handles achieved, open-ended, overdue, and negative balances", () => {
    expect(goalProgress({ ...base, saved: 12_500_000n })).toMatchObject({ state: "achieved", remaining: 0n });
    expect(goalProgress({ ...base, targetDate: null })).toMatchObject({ state: "open", neededPerMonth: null });
    expect(goalProgress({ ...base, targetDate: "2026-09-30" })).toMatchObject({ state: "overdue", neededPerMonth: 9_000_000n });
    expect(goalProgress({ ...base, saved: -50_000n, monthlyRate: -10n })).toMatchObject({ saved: 0n, remaining: 12_000_000n, projectedOn: null });
  });

  it("asks for the full remainder when the date is under a month away", () => {
    expect(goalProgress({ ...base, targetDate: "2026-11-05" })).toMatchObject({ monthsLeft: 1, neededPerMonth: 9_000_000n });
  });
});
