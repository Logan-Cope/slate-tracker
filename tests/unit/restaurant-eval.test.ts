import { describe, expect, it } from "vitest";
import { kcalTolerance, scoreMenu, type GoldenItem } from "@/lib/restaurants/eval";

function golden(items: Array<[string, number]>): { items: GoldenItem[] } {
  return { items: items.map(([name, kcal]) => ({ name, kcal, protein_g: 10 })) };
}

function extracted(items: Array<[string, number]>) {
  return items.map(([name, kcal]) => ({ name, kcal, proteinG: 10 }));
}

describe("scoreMenu matching", () => {
  it("matches an item whose normalized name is identical", () => {
    const score = scoreMenu(golden([["Grilled Chicken Sandwich", 390]]), extracted([["grilled chicken sandwich", 390]]));
    expect(score.matches[0]?.matched).toBe("grilled chicken sandwich");
    expect(score.found).toBe(1);
  });

  it("matches when the extracted name contains the whole golden name, never the reverse", () => {
    const longer = scoreMenu(golden([["Grilled Nuggets", 130]]), extracted([["Grilled Nuggets, 8 ct", 130]]));
    expect(longer.matches[0]?.matched).toBe("Grilled Nuggets, 8 ct");
    // a truncated extracted name must not claim the golden item
    const truncated = scoreMenu(golden([["Waffle Potato Fries (Medium)", 420]]), extracted([["Waffle", 380]]));
    expect(truncated.matches[0]?.matched).toBeNull();
  });

  it("picks the size whose calories are nearest when several sized items contain the golden name", () => {
    // real extractor output for Chick-fil-A on 2026-10-19
    const score = scoreMenu(
      golden([["Grilled Nuggets", 130], ["Waffle Potato Fries", 420]]),
      extracted([["30 ct Grilled Nuggets", 510], ["8 ct Grilled Nuggets", 130], ["Small Chick-fil-A Waffle Potato Fries", 320], ["Medium Chick-fil-A Waffle Potato Fries", 420], ["Large Chick-fil-A Waffle Potato Fries", 530]]),
      { restaurantName: "Chick-fil-A" },
    );
    expect(score.matches[0]?.matched).toBe("8 ct Grilled Nuggets");
    expect(score.matches[1]?.matched).toBe("Medium Chick-fil-A Waffle Potato Fries");
    expect(score.kcalWithinTolerance).toBe(2);
  });

  it("ignores the chain's own name at the front of either side", () => {
    const stripped = scoreMenu(golden([["Chick-fil-A Chicken Sandwich", 420]]), extracted([["Chicken Sandwich", 420]]), { restaurantName: "Chick-fil-A" });
    expect(stripped.matches[0]?.matched).toBe("Chicken Sandwich");
    const kept = scoreMenu(golden([["Chicken Sandwich", 420]]), extracted([["Chick-fil-A Chicken Sandwich", 420]]), { restaurantName: "Chick-fil-A" });
    expect(kept.matches[0]?.matched).toBe("Chick-fil-A Chicken Sandwich");
  });

  it("prefers an exact normalized match over an earlier containment match", () => {
    const score = scoreMenu(
      golden([["Spicy Chicken Sandwich", 450]]),
      extracted([
        ["Chicken Sandwich", 420],
        ["Spicy Chicken Sandwich", 450],
      ]),
    );
    expect(score.matches[0]?.matched).toBe("Spicy Chicken Sandwich");
    expect(score.matches[0]?.kcalFound).toBe(450);
  });

  it("takes the first containment match when there is no exact one", () => {
    const score = scoreMenu(golden([["Guacamole", 230]]), extracted([["Side of Guacamole", 230], ["Guacamole (Large)", 460]]));
    expect(score.matches[0]?.matched).toBe("Side of Guacamole");
  });

  it("reports null for an item nothing matches", () => {
    const score = scoreMenu(golden([["Black Beans", 130]]), extracted([["Pinto Beans", 130]]));
    expect(score.matches[0]).toEqual({
      golden: "Black Beans",
      matched: null,
      kcalGolden: 130,
      kcalFound: null,
      withinTolerance: false,
    });
    expect(score.found).toBe(0);
  });
});

describe("kcal tolerance", () => {
  it("is 5% of the golden kcal when that is above 10", () => {
    expect(kcalTolerance(420)).toBe(21);
    expect(kcalTolerance(200)).toBe(10);
  });

  it("has a 10 kcal floor for small items", () => {
    expect(kcalTolerance(130)).toBe(10);
    expect(kcalTolerance(0)).toBe(10);
  });

  it("accepts a 5% difference and rejects one kcal past it", () => {
    const inside = scoreMenu(golden([["Fries", 420]]), extracted([["Fries", 441]]));
    expect(inside.matches[0]?.withinTolerance).toBe(true);
    const outside = scoreMenu(golden([["Fries", 420]]), extracted([["Fries", 442]]));
    expect(outside.matches[0]?.withinTolerance).toBe(false);
  });

  it("accepts a 10 kcal difference on a small item and rejects 11", () => {
    const inside = scoreMenu(golden([["Nuggets", 130]]), extracted([["Nuggets", 120]]));
    expect(inside.matches[0]?.withinTolerance).toBe(true);
    const outside = scoreMenu(golden([["Nuggets", 130]]), extracted([["Nuggets", 141]]));
    expect(outside.matches[0]?.withinTolerance).toBe(false);
  });
});

describe("scoreMenu counts", () => {
  it("counts total, found and found-within-tolerance separately", () => {
    const score = scoreMenu(
      golden([
        ["Chicken", 180],
        ["Steak", 150],
        ["White Rice", 210],
        ["Black Beans", 130],
      ]),
      extracted([
        ["Chicken", 180],
        ["Steak", 175],
        ["Cilantro-Lime White Rice", 210],
      ]),
    );
    expect(score.total).toBe(4);
    expect(score.found).toBe(3);
    expect(score.kcalWithinTolerance).toBe(2);
    expect(score.matches.map((m) => m.matched)).toEqual(["Chicken", "Steak", "Cilantro-Lime White Rice", null]);
  });

  it("scores an empty extraction as nothing found", () => {
    const score = scoreMenu(golden([["Chicken", 180]]), []);
    expect(score).toMatchObject({ found: 0, total: 1, kcalWithinTolerance: 0 });
  });
});
