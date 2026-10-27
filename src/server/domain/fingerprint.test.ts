import { describe, expect, it } from "vitest";
import { fingerprint, normaliseDescription } from "./fingerprint";

const day = new Date("2026-10-15T00:00:00Z");

describe("fingerprint", () => {
  it("ignores case, punctuation, and spacing in descriptions", () => {
    expect(normaliseDescription("TRSF E-BANKING  CR/123")).toBe("trsf ebanking cr123");
    expect(fingerprint("a", day, -1000n, "Kopi Kenangan")).toBe(fingerprint("a", day, -1000n, "kopi  kenangan."));
  });

  it("differs when account, day, or amount differ", () => {
    const base = fingerprint("a", day, -1000n, "x");
    expect(fingerprint("b", day, -1000n, "x")).not.toBe(base);
    expect(fingerprint("a", new Date("2026-10-16T00:00:00Z"), -1000n, "x")).not.toBe(base);
    expect(fingerprint("a", day, 1000n, "x")).not.toBe(base);
  });
});
