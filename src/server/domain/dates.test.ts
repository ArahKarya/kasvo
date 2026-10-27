import { describe, expect, it } from "vitest";
import { monthRange, parseDay, todayIn, toDay } from "./dates";

describe("dates", () => {
  it("parses real calendar days only", () => {
    expect(toDay(parseDay("2026-02-28")!)).toBe("2026-02-28");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("27/10/2026")).toBeNull();
  });

  it("uses the user's time zone for today", () => {
    // 18:00 UTC on the 27th is already the 28th in Jakarta (UTC+7).
    expect(todayIn("Asia/Jakarta", new Date("2026-10-27T18:00:00Z"))).toBe("2026-10-28");
  });

  it("builds a half-open month range, rolling over the year", () => {
    const r = monthRange("2026-12")!;
    expect(toDay(r.start)).toBe("2026-12-01");
    expect(toDay(r.end)).toBe("2027-01-01");
    expect(monthRange("2026-13")).toBeNull();
  });
});
