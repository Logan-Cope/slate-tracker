import { describe, expect, it } from "vitest";

import {
  availableUnits,
  computeEntry,
  OZ_IN_GRAMS,
  resolveUnitWord,
  UnitNotAvailableError,
  type AltServing,
  type FoodLike,
} from "@/lib/nutrition/servings";

/** Whey: "1 scoop (31 g)" per serving. */
const whey: FoodLike = {
  servingLabel: "1 scoop (31 g)",
  servingGrams: 31,
  kcal: 120,
  proteinG: 24,
  carbsG: 3,
  fatG: 1.5,
};

/** Servings-only food: grams unknown, carbs and fat unknown. */
const mysteryBar: FoodLike = {
  servingLabel: "1 bar",
  servingGrams: null,
  kcal: 200,
  proteinG: 20,
  carbsG: null,
  fatG: null,
};

describe("computeEntry", () => {
  describe('unit "serving"', () => {
    it("scales every macro by qty and reports grams from servingGrams", () => {
      expect(computeEntry(whey, 2, "serving")).toEqual({
        qty: 2,
        unit: "serving",
        grams: 62,
        kcal: 240,
        proteinG: 48,
        carbsG: 6,
        fatG: 3,
      });
    });

    it("keeps grams null for a servings-only food and leaves null macros null", () => {
      expect(computeEntry(mysteryBar, 1.5, "serving")).toEqual({
        qty: 1.5,
        unit: "serving",
        grams: null,
        kcal: 300,
        proteinG: 30,
        carbsG: null,
        fatG: null,
      });
    });
  });

  describe('unit "g"', () => {
    it("treats qty as grams and scales macros by qty / servingGrams", () => {
      // 62 g of whey is exactly two 31 g scoops.
      expect(computeEntry(whey, 62, "g")).toEqual({
        qty: 62,
        unit: "g",
        grams: 62,
        kcal: 240,
        proteinG: 48,
        carbsG: 6,
        fatG: 3,
      });
    });

    it("throws UnitNotAvailableError when servingGrams is unknown", () => {
      expect(() => computeEntry(mysteryBar, 100, "g")).toThrow(UnitNotAvailableError);
    });
  });

  describe('unit "oz"', () => {
    it("converts ounces to grams, then scales like grams, without rounding", () => {
      const entry = computeEntry(whey, 2, "oz");
      const grams = 2 * OZ_IN_GRAMS;
      const factor = grams / 31;
      expect(entry).toEqual({
        qty: 2,
        unit: "oz",
        grams,
        kcal: 120 * factor,
        proteinG: 24 * factor,
        carbsG: 3 * factor,
        fatG: 1.5 * factor,
      });
      expect(entry.grams).toBeCloseTo(56.699, 3);
    });

    it("throws UnitNotAvailableError when servingGrams is unknown", () => {
      expect(() => computeEntry(mysteryBar, 1, "oz")).toThrow(UnitNotAvailableError);
    });
  });

  describe("alternate serving units", () => {
    const alts: AltServing[] = [
      { label: "1 heaping scoop (45 g)", grams: 45 },
      { label: "1 cup (120 g)", grams: 120 },
    ];

    it("matches an alt label exactly (case-insensitive) and scales via its grams", () => {
      // 2 cups = 240 g = 240/31 scoops.
      const factor = 240 / 31;
      expect(computeEntry(whey, 2, "1 CUP (120 g)", alts)).toEqual({
        qty: 2,
        unit: "1 CUP (120 g)",
        grams: 240,
        kcal: 120 * factor,
        proteinG: 24 * factor,
        carbsG: 3 * factor,
        fatG: 1.5 * factor,
      });
    });

    it("throws UnitNotAvailableError for a unit that matches no alt", () => {
      expect(() => computeEntry(whey, 1, "cup", alts)).toThrow(UnitNotAvailableError);
      expect(() => computeEntry(whey, 1, "slice")).toThrow(UnitNotAvailableError);
    });

    it("throws UnitNotAvailableError for an alt on a food with unknown servingGrams", () => {
      expect(() => computeEntry(mysteryBar, 1, "1 cup (120 g)", alts)).toThrow(
        UnitNotAvailableError,
      );
    });
  });

  describe("qty validation", () => {
    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      "throws RangeError for qty %s",
      (qty) => {
        expect(() => computeEntry(whey, qty, "serving")).toThrow(RangeError);
        expect(() => computeEntry(whey, qty, "g")).toThrow(RangeError);
      },
    );

    it("accepts small fractional quantities", () => {
      expect(computeEntry(whey, 0.25, "serving").kcal).toBe(30);
    });
  });
});

describe("availableUnits", () => {
  it("offers serving, g, oz, then each alt when servingGrams is known", () => {
    const alts: AltServing[] = [{ label: "1 heaping scoop (45 g)", grams: 45 }];
    expect(availableUnits(whey, alts)).toEqual([
      { unit: "serving", label: "1 scoop (31 g)", grams: 31 },
      { unit: "g", label: "g", grams: 1 },
      { unit: "oz", label: "oz", grams: OZ_IN_GRAMS },
      { unit: "1 heaping scoop (45 g)", label: "1 heaping scoop (45 g)", grams: 45 },
    ]);
  });

  it("offers only the serving (grams null) when servingGrams is unknown", () => {
    expect(availableUnits(mysteryBar)).toEqual([{ unit: "serving", label: "1 bar", grams: null }]);
  });

  it("skips an alt whose label duplicates the serving label, ignoring case", () => {
    const alts: AltServing[] = [
      { label: "1 Scoop (31 G)", grams: 31 },
      { label: "1 cup (120 g)", grams: 120 },
    ];
    expect(availableUnits(whey, alts).map((u) => u.unit)).toEqual([
      "serving",
      "g",
      "oz",
      "1 cup (120 g)",
    ]);
  });
});

describe("resolveUnitWord", () => {
  it.each(["g", "gram", "grams", "G", "Grams"])('maps "%s" to g when servingGrams is known', (w) => {
    expect(resolveUnitWord(w, whey)).toBe("g");
  });

  it.each(["oz", "ounce", "ounces", "OZ"])('maps "%s" to oz when servingGrams is known', (w) => {
    expect(resolveUnitWord(w, whey)).toBe("oz");
  });

  it.each(["g", "grams", "oz", "ounces"])(
    'returns null for weight word "%s" when servingGrams is unknown',
    (w) => {
      expect(resolveUnitWord(w, mysteryBar)).toBeNull();
    },
  );

  it.each(["serving", "servings", "x", "X"])('maps "%s" to serving for any food', (w) => {
    expect(resolveUnitWord(w, whey)).toBe("serving");
    expect(resolveUnitWord(w, mysteryBar)).toBe("serving");
  });

  describe("other words against alt labels", () => {
    const alts: AltServing[] = [
      { label: "1 heaping scoop (45 g)", grams: 45 },
      { label: "1 cup, chopped (120 g)", grams: 120 },
      { label: "2 slices (56g)", grams: 56 },
    ];

    it("returns the first alt label containing the word as a whole word", () => {
      expect(resolveUnitWord("cup", whey, alts)).toBe("1 cup, chopped (120 g)");
      expect(resolveUnitWord("heaping", whey, alts)).toBe("1 heaping scoop (45 g)");
    });

    it("ignores case and treats singular and plural alike", () => {
      expect(resolveUnitWord("Cups", whey, alts)).toBe("1 cup, chopped (120 g)");
      expect(resolveUnitWord("slice", whey, alts)).toBe("2 slices (56g)");
      expect(resolveUnitWord("SLICES", whey, alts)).toBe("2 slices (56g)");
    });

    it("does not match partial words", () => {
      expect(resolveUnitWord("cu", whey, alts)).toBeNull();
      expect(resolveUnitWord("chop", whey, alts)).toBeNull();
    });
  });

  describe("other words against the serving label", () => {
    it("falls back to serving when the serving label contains the word", () => {
      expect(resolveUnitWord("scoop", whey)).toBe("serving");
      expect(resolveUnitWord("Scoops", whey)).toBe("serving");
      expect(resolveUnitWord("bar", mysteryBar)).toBe("serving");
      expect(resolveUnitWord("bars", mysteryBar)).toBe("serving");
    });

    it("prefers the serving label over a matching alt, and falls back to the alt", () => {
      const alts: AltServing[] = [{ label: "1 heaping scoop (45 g)", grams: 45 }];
      // whey's label serving is "1 scoop (31 g)", so "scoop" means the label serving.
      expect(resolveUnitWord("scoop", whey, alts)).toBe("serving");
      const cupFood = { ...whey, servingLabel: "1 cup (240 g)", servingGrams: 240 };
      const halfCup: AltServing[] = [{ label: "1/2 cup (120 g)", grams: 120 }];
      expect(resolveUnitWord("cups", cupFood, halfCup)).toBe("serving");
      expect(resolveUnitWord("tbsp", cupFood, [{ label: "1 tbsp (15 g)", grams: 15 }])).toBe("1 tbsp (15 g)");
    });

    it("returns null when neither alts nor the serving label contain the word", () => {
      expect(resolveUnitWord("slice", whey)).toBeNull();
      expect(resolveUnitWord("cup", mysteryBar)).toBeNull();
      expect(resolveUnitWord("", whey)).toBeNull();
    });
  });
});
