import { describe, expect, it } from "vitest";
import { applyPatch, restoreInput } from "@/components/nutrition/diary-patch";
import type { EntryDto } from "@/components/nutrition/types";

// Review rows 2 and 5: undo after delete puts the same row back, in its old
// place, through the existing log actions, with nothing dropped on the way.

function entry(over: Partial<EntryDto> & { id: string; loggedAt: string }): EntryDto {
  return {
    date: "2026-03-06",
    meal: "lunch",
    foodId: 7,
    name: "Chicken breast, cooked, roasted",
    brand: null,
    qty: 100,
    unit: "g",
    grams: 100,
    kcal: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
    ...over,
  };
}

const a = entry({ id: "a", loggedAt: "2026-03-06T12:00:00.000Z" });
const b = entry({ id: "b", loggedAt: "2026-03-06T12:05:00.000Z" });
const c = entry({ id: "c", loggedAt: "2026-03-06T12:10:00.000Z" });

describe("applyPatch", () => {
  it("deletes and updates as before", () => {
    expect(applyPatch([a, b], { type: "delete", id: "a" })).toEqual([b]);
    expect(applyPatch([a, b], { type: "update", id: "b", changes: { meal: "dinner" } })[1]?.meal).toBe("dinner");
  });

  it("inserts a restored entry back where its loggedAt puts it", () => {
    const out = applyPatch([a, c], { type: "insert", entry: b });
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("does not duplicate an entry the server already sent back", () => {
    expect(applyPatch([a, b], { type: "insert", entry: b })).toEqual([a, b]);
  });

  it("deleteMany removes the listed ids, leaves the others and ignores ids it does not know", () => {
    expect(applyPatch([a, b, c], { type: "deleteMany", ids: ["a", "c", "nope"] })).toEqual([b]);
    expect(applyPatch([a, b], { type: "deleteMany", ids: [] })).toEqual([a, b]);
  });
});

describe("restoreInput", () => {
  it("sends a food entry back through logFood with the same id, amount, meal, date and time, flagged as a restore", () => {
    const r = restoreInput(a);
    expect(r.kind).toBe("food");
    expect(r.input).toEqual({
      id: "a",
      date: "2026-03-06",
      meal: "lunch",
      foodId: 7,
      qty: 100,
      unit: "g",
      loggedAt: "2026-03-06T12:00:00.000Z",
      restore: true,
    });
  });

  it("sends a quick add back through quickAdd with its calories, protein and name", () => {
    const q = entry({ id: "q", loggedAt: "2026-03-06T13:00:00.000Z", foodId: null, name: "Late snack", qty: 1, unit: "serving", grams: null, kcal: 200, proteinG: 10, carbsG: null, fatG: null });
    const r = restoreInput(q);
    expect(r.kind).toBe("quick");
    expect(r.input).toEqual({
      id: "q",
      date: "2026-03-06",
      meal: "lunch",
      kcal: 200,
      proteinG: 10,
      name: "Late snack",
      brand: null,
      qty: 1,
      unit: "serving",
      grams: null,
      carbsG: null,
      fatG: null,
      loggedAt: "2026-03-06T13:00:00.000Z",
    });
  });

  it("keeps the brand, amount, grams, carbs and fat of an entry whose food was deleted since", () => {
    const orphan = entry({ id: "o", loggedAt: "2026-03-06T14:00:00.000Z", foodId: null, brand: "Kodiak", qty: 2, unit: "pancakes", grams: 120, carbsG: 40, fatG: 6 });
    const r = restoreInput(orphan);
    expect(r.kind).toBe("quick");
    expect(r.input).toMatchObject({ brand: "Kodiak", qty: 2, unit: "pancakes", grams: 120, carbsG: 40, fatG: 6, kcal: 165, proteinG: 31 });
  });
});
