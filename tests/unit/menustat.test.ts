import { describe, expect, it } from "vitest";
import { transformMenuStat, type MenuStatRow } from "@/lib/restaurants/menustat";

function row(overrides: Partial<MenuStatRow> = {}): MenuStatRow {
  return {
    restaurant: "Sbarro",
    item_name: "Cheese Slice",
    calories: "410",
    protein: "18",
    carbohydrates: "44",
    total_fat: "17",
    dietary_fiber: "2",
    serving_size_household: "1 Slice",
    ...overrides,
  };
}

describe("transformMenuStat", () => {
  it("maps a happy row to a MenuItemInput with every field", () => {
    const { chains, report } = transformMenuStat([row()]);
    expect(chains).toEqual([
      {
        name: "Sbarro",
        items: [{ name: "Cheese Slice", servingLabel: "1 Slice", kcal: 410, proteinG: 18, carbsG: 44, fatG: 17, fiberG: 2 }],
      },
    ]);
    expect(report).toEqual({ rows: 1, keptRows: 1, droppedNoCalories: 0, droppedNoProtein: 0, droppedNoName: 0, duplicates: 0 });
  });

  it("drops rows with non-numeric calories and counts them", () => {
    const { chains, report } = transformMenuStat([row({ calories: "n/a" })]);
    expect(chains).toEqual([]);
    expect(report.droppedNoCalories).toBe(1);
    expect(report.keptRows).toBe(0);
  });

  it("drops rows with missing protein and counts them (calories checked first)", () => {
    const { chains, report } = transformMenuStat([row({ protein: undefined }), row({ calories: undefined, protein: undefined })]);
    expect(chains).toEqual([]);
    expect(report.droppedNoProtein).toBe(1);
    expect(report.droppedNoCalories).toBe(1);
  });

  it("drops rows whose trimmed item_name is empty", () => {
    const { chains, report } = transformMenuStat([row({ item_name: "   " })]);
    expect(chains).toEqual([]);
    expect(report.droppedNoName).toBe(1);
  });

  it("collapses duplicate names within a chain (case-insensitive, first wins) and counts them", () => {
    const { chains, report } = transformMenuStat([row({ calories: "410" }), row({ item_name: "cheese slice", calories: "999" })]);
    expect(chains[0]!.items).toHaveLength(1);
    expect(chains[0]!.items[0]!.kcal).toBe(410);
    expect(report.duplicates).toBe(1);
    expect(report.keptRows).toBe(1);
  });

  it("sets servingLabel to null when serving_size_household is absent", () => {
    const { chains } = transformMenuStat([row({ serving_size_household: undefined })]);
    expect(chains[0]!.items[0]!.servingLabel).toBeNull();
  });

  it("applies the alias map to the chain name", () => {
    const { chains } = transformMenuStat([row({ restaurant: "Chick-Fil-A" })]);
    expect(chains[0]!.name).toBe("Chick-fil-A");
  });

  it("turns a negative fat into null and non-numeric macros into null", () => {
    const { chains } = transformMenuStat([row({ total_fat: "-1", carbohydrates: "abc", dietary_fiber: undefined })]);
    expect(chains[0]!.items[0]).toMatchObject({ fatG: null, carbsG: null, fiberG: null });
  });

  it("keeps a zero-calorie, zero-protein row (a diet soda is a real menu item)", () => {
    const { chains, report } = transformMenuStat([row({ item_name: "Diet Mtn Dew", calories: "0", protein: "0" })]);
    expect(chains[0]!.items[0]).toMatchObject({ kcal: 0, proteinG: 0 });
    expect(report.keptRows).toBe(1);
  });

  it("sorts chains by name and keeps items in file order", () => {
    const { chains } = transformMenuStat([
      row({ restaurant: "Wendy's", item_name: "Frosty" }),
      row({ restaurant: "Arby's", item_name: "Roast Beef" }),
      row({ restaurant: "Wendy's", item_name: "Baconator" }),
    ]);
    expect(chains.map((c) => c.name)).toEqual(["Arby's", "Wendy's"]);
    expect(chains[1]!.items.map((i) => i.name)).toEqual(["Frosty", "Baconator"]);
  });
});
