import { describe, expect, it } from "vitest";
import {
  brandedServing,
  normalizeUpc,
  nutrientsPerServing,
  portionLabel,
  stripEchoedSuffix,
  titleCaseIfShouting,
} from "@/lib/nutrition/fdc-transform";

describe("stripEchoedSuffix", () => {
  it("drops a trailing segment that repeats words already in the name", () => {
    expect(stripEchoedSuffix("Spinach Egg White Frittata, Spinach Egg White")).toBe("Spinach Egg White Frittata");
    expect(stripEchoedSuffix("Diced Tomatoes For Chili, Chili")).toBe("Diced Tomatoes For Chili");
    expect(stripEchoedSuffix("Honey Creme Syrup, Honey Creme, Honey Creme")).toBe("Honey Creme Syrup");
    expect(stripEchoedSuffix("CRANBERRY CEREAL, cranberry")).toBe("CRANBERRY CEREAL");
  });

  it("keeps segments that add information, even when they are substrings", () => {
    expect(stripEchoedSuffix("Strawberries, raw")).toBe("Strawberries, raw");
    expect(stripEchoedSuffix("Yogurt, Greek, plain, nonfat")).toBe("Yogurt, Greek, plain, nonfat");
    expect(stripEchoedSuffix("Goya Maria Cookies, 3 Pack, 21.16 OZ")).toBe("Goya Maria Cookies, 3 Pack, 21.16 OZ");
    expect(stripEchoedSuffix("Honey")).toBe("Honey");
  });
});

describe("normalizeUpc", () => {
  it("keeps digits only and strips leading zeros", () => {
    expect(normalizeUpc("00027000612323")).toBe("27000612323");
    expect(normalizeUpc("0 41570 05468 1")).toBe("41570054681");
    expect(normalizeUpc("4-1-2-3-4-5-6")).toBe("4123456");
  });

  it("returns null for empty, missing, or too-short codes", () => {
    expect(normalizeUpc("")).toBeNull();
    expect(normalizeUpc(null)).toBeNull();
    expect(normalizeUpc(undefined)).toBeNull();
    expect(normalizeUpc("12345")).toBeNull();
    expect(normalizeUpc("000000")).toBeNull();
    expect(normalizeUpc("abc")).toBeNull();
  });
});

describe("titleCaseIfShouting", () => {
  it("title-cases strings that are mostly uppercase", () => {
    expect(titleCaseIfShouting("SWANSON BROTH BEEF")).toBe("Swanson Broth Beef");
    expect(titleCaseIfShouting("QUEST PROTEIN BAR, COOKIES & CREAM")).toBe("Quest Protein Bar, Cookies & Cream");
    expect(titleCaseIfShouting("FAIRLIFE 2% MILK")).toBe("Fairlife 2% Milk");
    expect(titleCaseIfShouting("MCDONALD'S HAMBURGER")).toBe("Mcdonald's Hamburger");
  });

  it("keeps vowel-less or well-known short acronyms as-is", () => {
    expect(titleCaseIfShouting("KANSAS CITY BBQ SAUCE")).toBe("Kansas City BBQ Sauce");
    expect(titleCaseIfShouting("USDA CHOICE BEEF")).toBe("USDA Choice Beef");
    expect(titleCaseIfShouting("PB&J SANDWICH")).toBe("PB&J Sandwich");
    expect(titleCaseIfShouting("WHOLE WHEAT BREAD, 12 OZ")).toBe("Whole Wheat Bread, 12 OZ");
  });

  it("leaves mixed-case strings alone apart from whitespace", () => {
    expect(titleCaseIfShouting("WESSON Vegetable Oil 1 GAL")).toBe("WESSON Vegetable Oil 1 GAL");
    expect(titleCaseIfShouting("  Chobani   Greek  Yogurt ")).toBe("Chobani Greek Yogurt");
    expect(titleCaseIfShouting("")).toBe("");
  });
});

describe("brandedServing", () => {
  it("uses the household text when it already carries a g/ml figure", () => {
    expect(brandedServing({ serving_size: "15.0", serving_size_unit: "ml", household_serving_fulltext: "1 Tbsp (15 ml)" })).toEqual({
      label: "1 Tbsp (15 ml)",
      grams: 15,
      perServingFactor: 0.15,
    });
  });

  it("appends the measured amount when the household text lacks one", () => {
    expect(brandedServing({ serving_size: "31.0", serving_size_unit: "g", household_serving_fulltext: "1 scoop" })).toEqual({
      label: "1 scoop (31 g)",
      grams: 31,
      perServingFactor: 0.31,
    });
    expect(brandedServing({ serving_size: "240.0", serving_size_unit: "ml", household_serving_fulltext: "1 cup" })).toEqual({
      label: "1 cup (240 ml)",
      grams: 240,
      perServingFactor: 2.4,
    });
  });

  it("rewrites GDSN unit codes in the household text", () => {
    expect(brandedServing({ serving_size: "28.0", serving_size_unit: "g", household_serving_fulltext: "1 ONZ" })).toEqual({
      label: "1 oz (28 g)",
      grams: 28,
      perServingFactor: 0.28,
    });
    expect(brandedServing({ serving_size: "240.0", serving_size_unit: "ml", household_serving_fulltext: "8 OZA" })).toEqual({
      label: "8 fl oz (240 ml)",
      grams: 240,
      perServingFactor: 2.4,
    });
  });

  it("falls back to size + unit when the household text is a placeholder", () => {
    expect(brandedServing({ serving_size: "240.0", serving_size_unit: "ml", household_serving_fulltext: "Amount per serving" })).toEqual({
      label: "240 ml",
      grams: 240,
      perServingFactor: 2.4,
    });
    expect(brandedServing({ serving_size: "30.0", serving_size_unit: "g", household_serving_fulltext: "-" })).toEqual({
      label: "30 g",
      grams: 30,
      perServingFactor: 0.3,
    });
    expect(brandedServing({ serving_size: "2.0", serving_size_unit: "g", household_serving_fulltext: "Per Serving" })).toEqual({
      label: "2 g",
      grams: 2,
      perServingFactor: 0.02,
    });
    expect(brandedServing({ serving_size: "1.9", serving_size_unit: "g", household_serving_fulltext: "false" })).toEqual({
      label: "1.9 g",
      grams: 1.9,
      perServingFactor: 0.019,
    });
  });

  it("accepts GRM/MLT unit spellings", () => {
    expect(brandedServing({ serving_size: "100.0", serving_size_unit: "GRM", household_serving_fulltext: "1 cup" })).toEqual({
      label: "1 cup (100 g)",
      grams: 100,
      perServingFactor: 1,
    });
  });

  it("keeps a household label without grams when no size is given", () => {
    expect(brandedServing({ serving_size: "", serving_size_unit: "", household_serving_fulltext: "1 cup" })).toEqual({
      label: "1 cup",
      grams: null,
      perServingFactor: null,
    });
  });

  it("defaults to 100 g when nothing usable is present", () => {
    expect(brandedServing({ serving_size: "", serving_size_unit: "", household_serving_fulltext: "" })).toEqual({
      label: "100 g",
      grams: 100,
      perServingFactor: 1,
    });
    expect(brandedServing({ serving_size: "0.0", serving_size_unit: "g", household_serving_fulltext: "1 serving" })).toEqual({
      label: "100 g",
      grams: 100,
      perServingFactor: 1,
    });
  });
});

describe("portionLabel", () => {
  it("joins amount and measure unit", () => {
    expect(portionLabel({ amount: "2.0", measure_unit_name: "tablespoon", portion_description: "", modifier: "" })).toBe("2 tablespoon");
    expect(portionLabel({ amount: "0.5", measure_unit_name: "cup", portion_description: "", modifier: "" })).toBe("0.5 cup");
  });

  it("appends description and modifier after a comma", () => {
    expect(portionLabel({ amount: "1.0", measure_unit_name: "cup", portion_description: "", modifier: "chopped" })).toBe("1 cup, chopped");
    expect(portionLabel({ amount: "1.0", measure_unit_name: "cup", portion_description: "shredded", modifier: "" })).toBe("1 cup, shredded");
    expect(portionLabel({ amount: "1.0", measure_unit_name: "drumstick", portion_description: "", modifier: "without skin" })).toBe(
      "1 drumstick, without skin",
    );
  });

  it("uses the free text when the unit is undetermined", () => {
    expect(portionLabel({ amount: "1", measure_unit_name: null, portion_description: "", modifier: "serving 1 roll with icing" })).toBe(
      "1 serving 1 roll with icing",
    );
    expect(portionLabel({ amount: "4", measure_unit_name: null, portion_description: "", modifier: "oz" })).toBe("4 oz");
    expect(portionLabel({ amount: "1.0", measure_unit_name: "undetermined", portion_description: "", modifier: "piece" })).toBe("1 piece");
  });

  it("returns null when nothing is usable", () => {
    expect(portionLabel({ amount: "1.0", measure_unit_name: "undetermined", portion_description: "", modifier: "" })).toBeNull();
    expect(portionLabel({ amount: "", measure_unit_name: null, portion_description: "", modifier: "" })).toBeNull();
  });
});

describe("nutrientsPerServing", () => {
  const per100 = { kcal: 59, protein: 10.2, carbs: 3.6, fat: 0.4, fiber: 0 };

  it("scales every nutrient by the factor and rounds to 2 decimals", () => {
    expect(nutrientsPerServing(per100, 1.5)).toEqual({ kcal: 88.5, proteinG: 15.3, carbsG: 5.4, fatG: 0.6, fiberG: 0 });
  });

  it("returns null when kcal is missing", () => {
    expect(nutrientsPerServing({ ...per100, kcal: null }, 1)).toBeNull();
  });

  it("treats missing protein as 0 and keeps other missing nutrients null", () => {
    expect(nutrientsPerServing({ kcal: 100, protein: null, carbs: null, fat: null, fiber: null }, 0.5)).toEqual({
      kcal: 50,
      proteinG: 0,
      carbsG: null,
      fatG: null,
      fiberG: null,
    });
  });

  it("uses per-100 values unchanged when the factor is unknown", () => {
    expect(nutrientsPerServing(per100, null)).toEqual({ kcal: 59, proteinG: 10.2, carbsG: 3.6, fatG: 0.4, fiberG: 0 });
  });
});
