import { describe, expect, it } from "vitest";

import { parseQuantityQuery, UNIT_WORDS } from "@/lib/nutrition/quantity-parser";

describe("parseQuantityQuery", () => {
  describe("no quantity present", () => {
    it("returns the trimmed query with whitespace collapsed and no qty", () => {
      expect(parseQuantityQuery("quest bar")).toEqual({
        raw: "quest bar",
        query: "quest bar",
        qty: null,
        unitWord: null,
      });
      expect(parseQuantityQuery("  quest   bar  ")).toEqual({
        raw: "  quest   bar  ",
        query: "quest bar",
        qty: null,
        unitWord: null,
      });
    });

    it.each(["", "   "])("treats %j as an empty query", (input) => {
      expect(parseQuantityQuery(input)).toEqual({ raw: input, query: "", qty: null, unitWord: null });
    });
  });

  describe("leading quantity glued to a unit", () => {
    it('parses "150g chicken breast"', () => {
      expect(parseQuantityQuery("150g chicken breast")).toEqual({
        raw: "150g chicken breast",
        query: "chicken breast",
        qty: 150,
        unitWord: "g",
      });
    });

    it('parses "2x quest bar" as 2 servings', () => {
      expect(parseQuantityQuery("2x quest bar")).toMatchObject({
        query: "quest bar",
        qty: 2,
        unitWord: "serving",
      });
    });
  });

  describe("leading quantity with a separate unit word", () => {
    it('parses "3 oz salmon"', () => {
      expect(parseQuantityQuery("3 oz salmon")).toMatchObject({
        query: "salmon",
        qty: 3,
        unitWord: "oz",
      });
    });

    it('treats a bare leading number as servings: "2 eggs"', () => {
      expect(parseQuantityQuery("2 eggs")).toMatchObject({
        query: "eggs",
        qty: 2,
        unitWord: "serving",
      });
    });

    it('accepts a quantity with no food name: "100 g"', () => {
      expect(parseQuantityQuery("100 g")).toMatchObject({ query: "", qty: 100, unitWord: "g" });
      expect(parseQuantityQuery("2")).toMatchObject({ query: "", qty: 2, unitWord: "serving" });
    });
  });

  describe("unit word normalisation", () => {
    it.each<[string, string, string]>([
      ["150 grams chicken", "g", "chicken"],
      ["150 Gram chicken", "g", "chicken"],
      ["2 ounces almonds", "oz", "almonds"],
      ["1 ounce almonds", "oz", "almonds"],
      ["250 ml milk", "ml", "milk"],
      ["2 cups rice", "cup", "rice"],
      ["1 tablespoon peanut butter", "tbsp", "peanut butter"],
      ["2 tablespoons peanut butter", "tbsp", "peanut butter"],
      ["1 teaspoon sugar", "tsp", "sugar"],
      ["2 teaspoons sugar", "tsp", "sugar"],
      ["2 scoops whey", "scoop", "whey"],
      ["2 slices bread", "slice", "bread"],
      ["3 pieces sushi", "piece", "sushi"],
      ["4 pcs sushi", "piece", "sushi"],
      ["1 pc sushi", "piece", "sushi"],
      ["3 servings rice", "serving", "rice"],
      ["2 svg oats", "serving", "oats"],
      ["1 srv oats", "serving", "oats"],
      ["2 bars quest", "bar", "quest"],
    ])("%j -> unit %j, query %j", (input, unitWord, query) => {
      expect(parseQuantityQuery(input)).toMatchObject({ unitWord, query });
    });

    it("exports the full unit table mapping normalised words to canonical units", () => {
      const canonical = new Set(["g", "oz", "ml", "cup", "tbsp", "tsp", "scoop", "slice", "piece", "serving", "bar"]);
      const expectedKeys = [
        "g", "gram", "grams", "oz", "ounce", "ounces", "ml", "cup", "cups", "tbsp", "tablespoon",
        "tablespoons", "tsp", "teaspoon", "teaspoons", "scoop", "scoops", "slice", "slices", "piece",
        "pieces", "pc", "pcs", "serving", "servings", "svg", "srv", "x", "bar", "bars",
      ];
      expect(Object.keys(UNIT_WORDS).sort()).toEqual([...expectedKeys].sort());
      for (const value of Object.values(UNIT_WORDS)) expect(canonical).toContain(value);
      expect(UNIT_WORDS.x).toBe("serving");
      // "eggs" is a food, not a unit.
      expect(UNIT_WORDS.egg).toBeUndefined();
      expect(UNIT_WORDS.eggs).toBeUndefined();
    });
  });

  describe("number formats", () => {
    it.each<[string, number]>([
      ["1.5 cup rice", 1.5],
      ["1,5 cup rice", 1.5],
      ["0.5 cup rice", 0.5],
      [".5 cup rice", 0.5],
      ["1/2 cup rice", 0.5],
      ["3/4 cup rice", 0.75],
    ])("%j -> qty %d", (input, qty) => {
      expect(parseQuantityQuery(input)).toEqual({ raw: input, query: "rice", qty, unitWord: "cup" });
    });

    it('parses "1/2 cup oats"', () => {
      expect(parseQuantityQuery("1/2 cup oats")).toEqual({
        raw: "1/2 cup oats",
        query: "oats",
        qty: 0.5,
        unitWord: "cup",
      });
    });

    it("handles decimals and fractions when glued to the unit", () => {
      expect(parseQuantityQuery("1.5g salt")).toMatchObject({ qty: 1.5, unitWord: "g", query: "salt" });
      expect(parseQuantityQuery("1/2cup oats")).toMatchObject({ qty: 0.5, unitWord: "cup", query: "oats" });
    });
  });

  describe("trailing quantity", () => {
    it.each(["chicken breast 150g", "chicken breast 150 g", "chicken breast 150 grams"])(
      "%j -> 150 g of chicken breast",
      (input) => {
        expect(parseQuantityQuery(input)).toEqual({
          raw: input,
          query: "chicken breast",
          qty: 150,
          unitWord: "g",
        });
      },
    );

    it('treats a trailing bare number as servings: "protein bar 2"', () => {
      expect(parseQuantityQuery("protein bar 2")).toMatchObject({
        query: "protein bar",
        qty: 2,
        unitWord: "serving",
      });
    });

    it.each(["quest bar x2", "quest bar x 2", "quest bar 2x"])("%j -> 2 servings", (input) => {
      expect(parseQuantityQuery(input)).toMatchObject({
        query: "quest bar",
        qty: 2,
        unitWord: "serving",
      });
    });

    it("parses trailing decimals and fractions", () => {
      expect(parseQuantityQuery("rice 1.5 cups")).toMatchObject({ query: "rice", qty: 1.5, unitWord: "cup" });
      expect(parseQuantityQuery("oats 1/2 cup")).toMatchObject({ query: "oats", qty: 0.5, unitWord: "cup" });
    });
  });

  describe("things that are not quantities", () => {
    it.each(["7up", "diet 7up", "v8 juice", "juice v8"])(
      "%j keeps a number glued to a non-unit word in the name",
      (input) => {
        expect(parseQuantityQuery(input)).toEqual({ raw: input, query: input, qty: null, unitWord: null });
      },
    );

    it.each(["0 eggs", "0g chicken", "chicken 0 g", "0/2 cup oats"])(
      "%j: a zero quantity is treated as no quantity",
      (input) => {
        expect(parseQuantityQuery(input)).toEqual({ raw: input, query: input, qty: null, unitWord: null });
      },
    );

    it("treats a non-finite fraction as no quantity", () => {
      expect(parseQuantityQuery("1/0 cup oats")).toEqual({
        raw: "1/0 cup oats",
        query: "1/0 cup oats",
        qty: null,
        unitWord: null,
      });
    });
  });
});
