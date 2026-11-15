import { describe, expect, it } from "vitest";
import { ALIASES, displayName, restaurantSlug } from "@/lib/restaurants/aliases";

describe("restaurantSlug", () => {
  it("strips punctuation and spaces: Chick-fil-A -> chickfila", () => {
    expect(restaurantSlug("Chick-fil-A")).toBe("chickfila");
  });

  it("drops apostrophes and spaces: Dunkin' Donuts -> dunkindonuts", () => {
    expect(restaurantSlug("Dunkin' Donuts")).toBe("dunkindonuts");
  });

  it("spells & as and: Ben & Jerry's -> benandjerrys", () => {
    expect(restaurantSlug("Ben & Jerry's")).toBe("benandjerrys");
  });
});

describe("displayName", () => {
  it("fixes MenuStat casing: Chick-Fil-A -> Chick-fil-A", () => {
    expect(displayName("Chick-Fil-A")).toBe("Chick-fil-A");
  });

  it("fixes MenuStat casing: Mcdonald's -> McDonald's", () => {
    expect(displayName("Mcdonald's")).toBe("McDonald's");
  });

  it("uses the current brand name: Dunkin' Donuts -> Dunkin'", () => {
    expect(displayName("Dunkin' Donuts")).toBe("Dunkin'");
  });

  it("matches alias keys case-insensitively: mcdonald's -> McDonald's", () => {
    expect(displayName("mcdonald's")).toBe("McDonald's");
  });

  it("returns unknown names trimmed and otherwise unchanged", () => {
    expect(displayName("  Sweetgreen ")).toBe("Sweetgreen");
  });
});

describe("ALIASES", () => {
  it("has no no-op entries: every display value differs from its MenuStat key", () => {
    for (const [key, value] of Object.entries(ALIASES)) {
      expect(value, `alias for ${key}`).not.toBe(key);
    }
  });
});
