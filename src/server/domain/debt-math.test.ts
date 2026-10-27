import { describe, expect, it } from "vitest";
import { addMonths } from "./dates";
import { debtStatus, scheduleOf, suggestedPayment } from "./debt-math";

const motor = { instalmentAmount: 1_200_000n, instalmentCount: 12, firstDueOn: "2026-01-31" };

describe("addMonths", () => {
  it("clamps to short months and returns to the anchor day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("debt schedule", () => {
  it("builds monthly instalments that keep the first due day", () => {
    const s = scheduleOf(motor);
    expect(s).toHaveLength(12);
    expect(s.slice(0, 4).map((l) => l.dueOn)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(s.at(-1)?.dueOn).toBe("2026-12-31");
  });

  it("applies payments oldest first and flags overdue instalments", () => {
    const s = debtStatus(motor, 3_000_000n, "2026-04-10");
    expect(s.lines.slice(0, 4).map((l) => [l.status, l.paid])).toEqual([
      ["paid", 1_200_000n],
      ["paid", 1_200_000n],
      ["overdue", 600_000n],
      ["upcoming", 0n],
    ]);
    expect(s).toMatchObject({ paidCount: 2, overdueCount: 1, overdueAmount: 600_000n, outstanding: 11_400_000n, state: "overdue" });
    expect(s.next?.seq).toBe(3);
    expect(suggestedPayment(s)).toBe(600_000n);
  });

  it("marks an instalment due within 7 days, including today", () => {
    expect(debtStatus(motor, 0n, "2026-01-31").state).toBe("due_soon");
    expect(debtStatus(motor, 0n, "2026-01-24").state).toBe("due_soon");
    expect(debtStatus(motor, 0n, "2026-01-23").state).toBe("active");
  });

  it("settles when the total is paid and reports overpayment", () => {
    const s = debtStatus(motor, 15_000_000n, "2026-06-01");
    expect(s).toMatchObject({ state: "settled", outstanding: 0n, overpaid: 600_000n, paidCount: 12, next: null });
    expect(suggestedPayment(s)).toBe(0n);
  });

  it("treats a one-off debt as a single instalment", () => {
    const s = debtStatus({ instalmentAmount: 500_000n, instalmentCount: 1, firstDueOn: "2026-11-01" }, 200_000n, "2026-10-01");
    expect(s).toMatchObject({ state: "active", outstanding: 300_000n, endsOn: "2026-11-01" });
    expect(s.lines[0].status).toBe("partial");
  });
});
