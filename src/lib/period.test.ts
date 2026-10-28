import { describe, expect, it } from "vitest";
import { periodRange, reachesToday, shiftPeriod } from "./period";

describe("periods", () => {
  it("finds the day, Monday-based week, and month around an anchor", () => {
    expect(periodRange("day", "2026-10-28")).toEqual({ from: "2026-10-28", to: "2026-10-28" });
    expect(periodRange("week", "2026-10-28")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(periodRange("week", "2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(periodRange("month", "2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("all", "2026-10-28")).toBeNull();
  });

  it("steps backwards and forwards", () => {
    expect(shiftPeriod("day", "2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftPeriod("week", "2026-10-28", -1)).toBe("2026-10-21");
    expect(shiftPeriod("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftPeriod("month", "2026-01-15", -1)).toBe("2025-12-01");
  });

  it("knows when a period reaches today", () => {
    expect(reachesToday("month", "2026-10-01", "2026-10-28")).toBe(true);
    expect(reachesToday("month", "2026-09-01", "2026-10-28")).toBe(false);
    expect(reachesToday("week", "2026-10-26", "2026-10-28")).toBe(true);
  });
});
