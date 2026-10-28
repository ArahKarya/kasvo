import { describe, expect, it } from "vitest";
import { previousPeriod, reportPeriod } from "./report-range";

const TODAY = "2026-10-28";

describe("report periods", () => {
  it("covers a month, the last 3 or 6 months, and the year to date", () => {
    expect(reportPeriod("month", "2026-02", TODAY)).toEqual({ from: "2026-02-01", to: "2026-02-28", endMonth: "2026-02" });
    expect(reportPeriod("3m", "2026-10", TODAY)).toEqual({ from: "2026-08-01", to: TODAY, endMonth: "2026-10" });
    expect(reportPeriod("6m", "2026-10", TODAY)).toEqual({ from: "2026-05-01", to: TODAY, endMonth: "2026-10" });
    expect(reportPeriod("ytd", "2026-10", TODAY)).toEqual({ from: "2026-01-01", to: TODAY, endMonth: "2026-10" });
  });

  it("compares with the period just before, of the same shape", () => {
    expect(previousPeriod("month", "2026-03", TODAY)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousPeriod("month", "2026-01", TODAY)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(previousPeriod("3m", "2026-10", TODAY)).toEqual({ from: "2026-05-01", to: "2026-07-31" });
    expect(previousPeriod("ytd", "2026-10", TODAY)).toEqual({ from: "2025-01-01", to: "2025-10-28" });
  });
});
