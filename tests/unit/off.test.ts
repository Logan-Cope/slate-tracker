import { describe, expect, it } from "vitest";
import { parseOffProduct } from "@/lib/nutrition/off";

const sample = {
  status: 1,
  product: {
    code: "0049000050103",
    product_name: "Coca Cola",
    brands: "Coca-Cola, Coca-Cola Original Taste",
    serving_size: "355 ml",
    serving_quantity: "355",
    nutriments: {
      "energy-kcal_100g": 39,
      proteins_100g: 0,
      carbohydrates_100g: 10.6,
      fat_100g: 0,
    },
  },
};

describe("parseOffProduct", () => {
  it("converts per-100g nutriments to the label serving and strips the UPC's leading zeros", () => {
    const f = parseOffProduct(sample)!;
    expect(f.upc).toBe("49000050103");
    expect(f.brand).toBe("Coca-Cola");
    expect(f.servingLabel).toBe("355 ml");
    expect(f.servingGrams).toBe(355);
    expect(f.kcal).toBeCloseTo(138.45, 1);
    expect(f.carbsG).toBeCloseTo(37.63, 1);
    expect(f.proteinG).toBe(0);
    expect(f.fiberG).toBeNull();
  });

  it("falls back to a 100 g serving when the product has no serving size", () => {
    const f = parseOffProduct({ status: 1, product: { product_name: "Oats", nutriments: { "energy-kcal_100g": 379, proteins_100g: 13 } } })!;
    expect(f.servingLabel).toBe("100 g");
    expect(f.servingGrams).toBe(100);
    expect(f.kcal).toBe(379);
    expect(f.proteinG).toBe(13);
  });

  it("returns null for not-found, nameless or calorie-less products", () => {
    expect(parseOffProduct({ status: 0 })).toBeNull();
    expect(parseOffProduct({ status: 1, product: { nutriments: { "energy-kcal_100g": 10 } } })).toBeNull();
    expect(parseOffProduct({ status: 1, product: { product_name: "Mystery", nutriments: {} } })).toBeNull();
    expect(parseOffProduct(null)).toBeNull();
  });

  it("derives kcal from kJ when only energy_100g is present", () => {
    const f = parseOffProduct({ status: 1, product: { product_name: "Thing", nutriments: { energy_100g: 418.4 } } })!;
    expect(f.kcal).toBeCloseTo(100, 0);
  });
});
