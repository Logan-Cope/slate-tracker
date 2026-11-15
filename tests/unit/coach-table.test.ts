import { describe, expect, it } from "vitest";
import { isOverTarget, kcalCellText } from "@/lib/nutrition/coach-table";

// Review row 9: the coach table marked a day over target by color alone. The
// cell now carries the word as well, so the flag survives a screen reader and
// a colorblind reader.

describe("isOverTarget", () => {
  it("flags a day more than a tenth above the target, not one just over it", () => {
    expect(isOverTarget(1651, 1500)).toBe(true);
    expect(isOverTarget(1650, 1500)).toBe(false);
    expect(isOverTarget(1500, 1500)).toBe(false);
  });
});

describe("kcalCellText", () => {
  it("prints the day's calories", () => {
    expect(kcalCellText({ kcal: 1480, logged: true }, { kcal: 1500 })).toBe("1,480");
  });

  it("spells out over when the day is flagged", () => {
    expect(kcalCellText({ kcal: 1820, logged: true }, { kcal: 1500 })).toBe("1,820 over");
  });

  it("never flags without a target", () => {
    expect(kcalCellText({ kcal: 3000, logged: true }, null)).toBe("3,000");
  });

  it("shows a dot for a day with nothing logged", () => {
    expect(kcalCellText({ kcal: 0, logged: false }, { kcal: 1500 })).toBe("·");
  });
});
