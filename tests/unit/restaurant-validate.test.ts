import { describe, expect, it } from "vitest";
import {
  ExtractedMenuSchema,
  toJsonSchema,
  validateMenu,
  type ExtractedMenu,
} from "@/lib/restaurants/validate";

type RawItem = ExtractedMenu["items"][number];

function item(overrides: Partial<RawItem> & { name: string }): RawItem {
  return { kcal: 400, protein_g: 20, ...overrides };
}

function menu(items: RawItem[], restaurant = "Chipotle"): ExtractedMenu {
  return { restaurant, source_url: "https://example.com/menu", items };
}

const OPTS = { restaurantName: "Chipotle" };

function okOrThrow(raw: unknown) {
  const result = validateMenu(raw, OPTS);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
}

describe("ExtractedMenuSchema", () => {
  it("rejects a non-object with a readable error", () => {
    const result = validateMenu("not a menu", OPTS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/object/i);
    expect(result.error).not.toContain("\n");
  });

  it("rejects a missing items array and names the field", () => {
    const result = validateMenu({ restaurant: "Chipotle", source_url: "x" }, OPTS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("items");
    expect(result.error).not.toContain("\n");
  });

  it("names the nested field when an item has a bad kcal", () => {
    const raw = menu([item({ name: "A" }), item({ name: "B" }), item({ name: "C" }), item({ name: "D" })]);
    (raw.items[3] as unknown as { kcal: unknown }).kcal = "lots";
    const result = validateMenu(raw, OPTS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("items[3].kcal");
  });

  it("is strict: extra keys fail parsing", () => {
    const raw = { ...menu([item({ name: "Bowl" })]), extra: true };
    expect(ExtractedMenuSchema.safeParse(raw).success).toBe(false);
    const rawItem = { ...menu([{ ...item({ name: "Bowl" }), bonus: 1 } as RawItem]) };
    expect(ExtractedMenuSchema.safeParse(rawItem).success).toBe(false);
  });
});

describe("validateMenu", () => {
  it("maps fields on the happy path", () => {
    const result = okOrThrow(
      menu([
        item({
          name: "  Chicken Bowl ",
          category: "Bowls",
          serving: " 1 bowl ",
          kcal: 650,
          protein_g: 45,
          carbs_g: 60,
          fat_g: 20,
          fiber_g: 8,
        }),
      ]),
    );
    expect(result.items).toEqual([
      {
        name: "Chicken Bowl",
        servingLabel: "1 bowl",
        kcal: 650,
        proteinG: 45,
        carbsG: 60,
        fatG: 20,
        fiberG: 8,
      },
    ]);
    expect(result.warnings.filter((w) => !w.includes("probably incomplete"))).toEqual([]);
  });

  it("sets servingLabel null when serving is absent and macros null when missing", () => {
    const result = okOrThrow(menu([item({ name: "Chips" })]));
    expect(result.items[0]).toEqual({
      name: "Chips",
      servingLabel: null,
      kcal: 400,
      proteinG: 20,
      carbsG: null,
      fatG: null,
      fiberG: null,
    });
  });

  it("strips the restaurant name prefix case-insensitively", () => {
    const result = okOrThrow(
      menu([
        item({ name: "Chipotle Guacamole" }),
        item({ name: "CHIPOTLE: Queso" }),
        item({ name: "Chipotlebowl" }),
      ]),
    );
    expect(result.items.map((i) => i.name)).toEqual(["Guacamole", "Queso", "Chipotlebowl"]);
  });

  it("drops items with an empty name and counts them in one warning", () => {
    const result = okOrThrow(menu([item({ name: "" }), item({ name: "   " }), item({ name: "Bowl" })]));
    expect(result.items.map((i) => i.name)).toEqual(["Bowl"]);
    expect(result.warnings).toContain("2 items without a name were left out");
  });

  it("drops items with kcal above 5000 or negative", () => {
    const result = okOrThrow(
      menu([item({ name: "Mega", kcal: 5001, protein_g: 10 }), item({ name: "Neg", kcal: -1, protein_g: 0 }), item({ name: "Fine" })]),
    );
    expect(result.items.map((i) => i.name)).toEqual(["Fine"]);
    expect(result.warnings).toContain("2 items with impossible calories were left out");
  });

  it("drops items with a negative macro", () => {
    const result = okOrThrow(menu([item({ name: "Odd", fat_g: -3 }), item({ name: "Fine" })]));
    expect(result.items.map((i) => i.name)).toEqual(["Fine"]);
    expect(result.warnings).toContain("1 item with a negative macro was left out");
  });

  it("drops items whose protein exceeds what the calories allow and names the first", () => {
    const result = okOrThrow(
      menu([
        item({ name: "Grilled Nuggets", kcal: 100, protein_g: 40 }),
        item({ name: "Also Off", kcal: 100, protein_g: 50 }),
        item({ name: "Egg", kcal: 70, protein_g: 6 }),
      ]),
    );
    expect(result.items.map((i) => i.name)).toEqual(["Egg"]);
    expect(result.warnings).toContain('"Grilled Nuggets" has more protein than its calories allow; left out');
    expect(result.warnings.filter((w) => w.includes("more protein"))).toHaveLength(1);
  });

  it("allows protein exactly at the kcal / 4 + 5 boundary", () => {
    const result = okOrThrow(menu([item({ name: "Edge", kcal: 100, protein_g: 30 })]));
    expect(result.items).toHaveLength(1);
  });

  it("dedupes by lowercased trimmed name, keeps the first, and warns", () => {
    const result = okOrThrow(
      menu([
        item({ name: "Guacamole", kcal: 230, protein_g: 2 }),
        item({ name: " guacamole ", kcal: 999, protein_g: 2 }),
        item({ name: "Chipotle Guacamole", kcal: 500, protein_g: 2 }),
      ]),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ name: "Guacamole", kcal: 230 });
    expect(result.warnings).toContain('"Guacamole" appeared 3 times; kept the first');
  });

  it("caps duplicate warnings at 5 lines then summarises the rest", () => {
    const items: RawItem[] = [];
    for (let n = 0; n < 7; n++) {
      items.push(item({ name: `Dup ${n}` }), item({ name: `Dup ${n}` }));
    }
    const result = okOrThrow(menu(items));
    const dupLines = result.warnings.filter((w) => w.includes("appeared"));
    expect(dupLines).toHaveLength(5);
    expect(result.warnings).toContain("and 2 more");
    expect(result.items).toHaveLength(7);
  });

  it("caps at 1000 items with a warning", () => {
    const items: RawItem[] = [];
    for (let n = 0; n < 1001; n++) items.push(item({ name: `Item ${n}` }));
    const result = okOrThrow(menu(items));
    expect(result.items).toHaveLength(1000);
    expect(result.items[999]?.name).toBe("Item 999");
    expect(result.warnings).toContain("Only the first 1000 items were kept");
  });

  it("writes warnings as plain sentences: no 'we ', no exclamation marks", () => {
    const items: RawItem[] = [
      item({ name: "" }),
      item({ name: "Big", kcal: 9000 }),
      item({ name: "Neg", fat_g: -1 }),
      item({ name: "Nuggets", kcal: 50, protein_g: 90 }),
      item({ name: "Twin" }),
      item({ name: "twin" }),
    ];
    for (let n = 0; n < 1001; n++) items.push(item({ name: `Row ${n}` }));
    const result = okOrThrow(menu(items));
    expect(result.warnings.length).toBeGreaterThanOrEqual(5);
    for (const w of result.warnings) {
      expect(w.toLowerCase()).not.toMatch(/\bwe\b/);
      expect(w).not.toContain("!");
    }
  });
});

describe("low item count", () => {
  it("warns when a chain comes back with suspiciously few items", () => {
    const raw = { restaurant: "Chick-fil-A", source_url: "https://www.chick-fil-a.com/menu", items: [{ name: "Spicy Sandwich", kcal: 450, protein_g: 29 }] };
    const r = validateMenu(raw, { restaurantName: "Chick-fil-A" });
    expect(r.ok && r.warnings.some((w) => w.includes("probably incomplete"))).toBe(true);
  });
  it("does not warn for a full menu", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ name: `Item ${i}`, kcal: 100 + i, protein_g: 5 }));
    const r = validateMenu({ restaurant: "X", source_url: "https://x.com", items }, { restaurantName: "X" });
    expect(r.ok && r.warnings.length).toBe(0);
  });
});

describe("toJsonSchema", () => {
  it("produces a strict object schema that requires items", () => {
    const schema = toJsonSchema() as {
      type?: string;
      additionalProperties?: boolean;
      required?: string[];
      properties?: Record<string, { type?: string }>;
    };
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain("items");
    expect(schema.properties?.items?.type).toBe("array");
  });
});
