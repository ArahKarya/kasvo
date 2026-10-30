import { describe, expect, it } from "vitest";
import { buildSeries, isStale, isTracked, lastChange, monthEndValues, recentMonths, sumMonths } from "./asset-trend";

const series = buildSeries({ day: "2026-07-10", value: 1_000_000n }, [
  { day: "2026-08-31", value: 1_100_000n },
  { day: "2026-10-05", value: 990_000n },
]);

describe("asset trend", () => {
  it("starts the series at the purchase and keeps it sorted", () => {
    expect(series.map((p) => p.day)).toEqual(["2026-07-10", "2026-08-31", "2026-10-05"]);
  });

  it("lets a valuation on the purchase day replace the purchase point", () => {
    const s = buildSeries({ day: "2026-10-30", value: 502_500n }, [{ day: "2026-10-30", value: 500_000n }]);
    expect(s).toEqual([{ day: "2026-10-30", value: 500_000n }]);
  });

  it("reports the move against the previous point", () => {
    const c = lastChange(series)!;
    expect(c.delta).toBe(-110_000n);
    expect(c.pct).toBeCloseTo(-10, 5);
    expect(c.since).toBe("2026-08-31");
  });

  it("has no change with a single point", () => {
    expect(lastChange(buildSeries({ day: "2026-10-30", value: 5n }, []))).toBeNull();
  });

  it("flags values older than a month, or never valued", () => {
    expect(isStale("2026-10-05", "2026-10-30")).toBe(false);
    expect(isStale("2026-09-30", "2026-10-30")).toBe(true);
    expect(isStale(null, "2026-10-30")).toBe(true);
  });

  it("lists months oldest first across a year boundary", () => {
    expect(recentMonths("2027-02-14", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("carries the last value forward and is null before the asset existed", () => {
    const rows = monthEndValues(series, "2026-10-30", 6);
    expect(rows.map((r) => r.month)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(rows.map((r) => r.value)).toEqual([null, null, 1_000_000n, 1_100_000n, 1_100_000n, 990_000n]);
  });

  it("sums assets and ignores the ones that did not exist yet", () => {
    const a = monthEndValues(series, "2026-10-30", 3);
    const b = monthEndValues(buildSeries({ day: "2026-10-30", value: 500_000n }, []), "2026-10-30", 3);
    expect(sumMonths([a, b]).map((r) => r.value)).toEqual([1_100_000n, 1_100_000n, 1_490_000n]);
  });

  it("tracks only market-priced kinds", () => {
    expect(isTracked("GOLD")).toBe(true);
    expect(isTracked("VEHICLE")).toBe(false);
  });
});
