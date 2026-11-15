import { describe, expect, it } from "vitest";
import { labelDraft, parseAmount, parseServing, type LabelRead } from "@/lib/nutrition/label-fields";

describe("parseAmount", () => {
  it.each([
    ["14g", 14],
    ["14 g", 14],
    ["3.5g", 3.5],
    ["0,8", 0.8],
    ["1,4 g", 1.4],
    ["0g", 0],
    ["0", 0],
    ["60", 60],
    ["185 kcal", 185],
    ["<1g", 0],
    ["< 1 g", 0],
    ["less than 1g", 0],
    ["<0.5g", 0],
    ["1,170", 1170],
  ])("reads %j as %d", (text, n) => {
    expect(parseAmount(text)).toBe(n);
  });

  it("converts milligrams to grams", () => {
    expect(parseAmount("500mg")).toBe(0.5);
  });

  it.each([null, "", "  ", "-", "n/a", "†"])("reads %j as missing", (text) => {
    expect(parseAmount(text)).toBeNull();
  });
});

describe("parseServing", () => {
  it.each([
    ["1 pouch", "1 pouch", null],
    ["1 Piece (37g)", "1 Piece", 37],
    ["1/4 cup (40g)", "1/4 cup", 40],
    ["1 bottle (355ml)", "1 bottle", null],
    ["1 cup (240mL)", "1 cup", null],
    ["1 Tbsp (14g)", "1 Tbsp", 14],
    ["1tbsp (15g)", "1 tbsp", 15],
    ["2/3 cup (65g)", "2/3 cup", 65],
    ["28g aproximadamente (2 unidades)", "2 unidades", 28],
    ["11 g (1 Line-Fill Scoop)", "1 Line-Fill Scoop", 11],
    ["30g", "30g", 30],
    ["Per 35 g", "35g", 35],
    ["par 35 g / Per 35 g", "35g", 35],
    ["2.5 oz (70g/about 1/5 package) (makes about 1 cup)", "2.5 oz", 70],
    ["2 Tbsp. (32 g)", "2 Tbsp.", 32],
    ["1 bar (1.4 oz / 40 g)", "1 bar", 40],
    ["1 can (12 fl oz)", "1 can", null],
  ])("splits %j into %j and %j grams", (text, label, grams) => {
    expect(parseServing(text)).toEqual({ servingLabel: label, servingGrams: grams });
  });

  it("falls back to 1 serving when the label has no serving line", () => {
    expect(parseServing(null)).toEqual({ servingLabel: "1 serving", servingGrams: null });
    expect(parseServing("  ")).toEqual({ servingLabel: "1 serving", servingGrams: null });
  });

  it("does not read milligrams or kilograms as the serving weight", () => {
    expect(parseServing("1 tablet (500mg)").servingGrams).toBeNull();
    expect(parseServing("1 bag (1kg)").servingGrams).toBeNull();
  });

  it("keeps the label short enough for the form", () => {
    expect(parseServing(`1 ${"very ".repeat(40)}big scoop`).servingLabel.length).toBeLessThanOrEqual(60);
  });
});

const READ: LabelRead = {
  readable: true,
  name: "Mango",
  brand: "Gerber",
  serving_size: "1 pouch",
  calories: "60",
  protein: "<1g",
  total_carbohydrate: "14g",
  total_fat: "0g",
  dietary_fiber: "1g",
};

describe("labelDraft", () => {
  it("turns a readable label into form values per serving", () => {
    expect(labelDraft(READ)).toEqual({
      ok: true,
      draft: { name: "Mango", brand: "Gerber", servingLabel: "1 pouch", servingGrams: null, kcal: 60, proteinG: 0, carbsG: 14, fatG: 0, fiberG: 1 },
    });
  });

  it("refuses a photo the model could not read", () => {
    expect(labelDraft({ ...READ, readable: false })).toEqual({ ok: false });
  });

  it("refuses a label without calories, the one number it must not guess", () => {
    expect(labelDraft({ ...READ, calories: null })).toEqual({ ok: false });
    expect(labelDraft({ ...READ, calories: "?" })).toEqual({ ok: false });
  });

  it("refuses a label without protein or carbs, fat or fiber at all, which is not a facts panel", () => {
    expect(labelDraft({ ...READ, protein: null, total_carbohydrate: null, total_fat: null, dietary_fiber: null })).toEqual({ ok: false });
  });

  it("keeps a missing line empty instead of zero", () => {
    const r = labelDraft({ ...READ, dietary_fiber: null, total_fat: null });
    expect(r.ok && r.draft.fiberG).toBeNull();
    expect(r.ok && r.draft.fatG).toBeNull();
  });

  it("trims names and drops empty ones", () => {
    const r = labelDraft({ ...READ, name: "  ", brand: " Kodiak " });
    expect(r.ok && r.draft.name).toBeNull();
    expect(r.ok && r.draft.brand).toBe("Kodiak");
  });

  it("refuses calories past what one serving of food can hold", () => {
    expect(labelDraft({ ...READ, calories: "60000" })).toEqual({ ok: false });
  });
});
