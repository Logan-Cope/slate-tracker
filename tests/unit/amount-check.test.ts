import { describe, expect, it } from "vitest";
import { AMOUNT_ERROR, quickAddCheck } from "@/lib/nutrition/amount-check";

// Review row 10: Save stays enabled and the form says what is wrong, under the
// field that is wrong. This is the rule the quick-add pair (calories, protein)
// is checked against; single amount fields reuse the same copy.

describe("quickAddCheck", () => {
  it("accepts calories alone, protein alone, or both", () => {
    expect(quickAddCheck("200", "")).toEqual({ kcal: null, protein: null, values: { kcal: 200, proteinG: 0 } });
    expect(quickAddCheck("0", "25")).toEqual({ kcal: null, protein: null, values: { kcal: 0, proteinG: 25 } });
    expect(quickAddCheck("200", "10")).toEqual({ kcal: null, protein: null, values: { kcal: 200, proteinG: 10 } });
  });

  it("reads a comma as the decimal separator, like the phone keypad types it", () => {
    expect(quickAddCheck("12,5", "1,5").values).toEqual({ kcal: 12.5, proteinG: 1.5 });
  });

  it("flags empty calories under the calories field", () => {
    expect(quickAddCheck("", "")).toEqual({ kcal: AMOUNT_ERROR, protein: null, values: null });
  });

  it("flags a pair that adds up to nothing under the calories field", () => {
    expect(quickAddCheck("0", "")).toEqual({ kcal: AMOUNT_ERROR, protein: null, values: null });
    expect(quickAddCheck("0", "0").kcal).toBe(AMOUNT_ERROR);
  });

  it("flags text that is not a number under the field that holds it", () => {
    expect(quickAddCheck("1.2.3", "10")).toEqual({ kcal: AMOUNT_ERROR, protein: null, values: null });
    expect(quickAddCheck("200", "ten")).toEqual({ kcal: null, protein: AMOUNT_ERROR, values: null });
    expect(quickAddCheck(".", ".")).toEqual({ kcal: AMOUNT_ERROR, protein: AMOUNT_ERROR, values: null });
  });

  it("uses the one sentence the review asked for", () => {
    expect(AMOUNT_ERROR).toBe("Enter an amount above 0");
  });
});
