import { describe, expect, it } from "vitest";
import { normalizeCourt, courtsMatch } from "../src/utils/court.js";

describe("normalizeCourt", () => {
  it('treats "1", "Court 1" and "court-1" as equal', () => {
    expect(normalizeCourt("1")).toBe("1");
    expect(normalizeCourt("Court 1")).toBe("1");
    expect(normalizeCourt("court-1")).toBe("1");
    expect(courtsMatch("1", "Court 1")).toBe(true);
    expect(courtsMatch("Court 1", "court-1")).toBe(true);
    expect(courtsMatch("1", "court-1")).toBe(true);
  });

  it("trims, lowercases and collapses spaces/hyphens", () => {
    expect(normalizeCourt("  Court   2  ")).toBe("2");
    expect(normalizeCourt("COURT-2")).toBe("2");
    expect(normalizeCourt("court - 3")).toBe("3");
    expect(normalizeCourt("Main Hall")).toBe("mainhall");
    expect(normalizeCourt("main-hall")).toBe("mainhall");
  });

  it("handles empty-ish input", () => {
    expect(normalizeCourt("")).toBe("");
    expect(normalizeCourt("   ")).toBe("");
    expect(normalizeCourt(null)).toBe("");
    expect(normalizeCourt(undefined)).toBe("");
  });

  it("does not strip non-leading court words", () => {
    expect(normalizeCourt("Center Court")).toBe("centercourt");
  });
});
