import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PgliteDatabase } from "drizzle-orm/pglite";

// Must be set before the client module is imported.
process.env.PGLITE_DIR = ":memory:";
delete process.env.DATABASE_URL;

const { getDb, closeDb } = await import("@/lib/db/client");
const { runMigrations } = await import("@/lib/db/migrate");
const schema = await import("@/lib/db/schema");
const { buildPrefixTsQuery, naiveSearch, normalizeBrandText, searchFoods } = await import("@/lib/db/queries/food-search");

const { foods, profiles, profileFoodStats, restaurants } = schema;
type Db = PgliteDatabase<typeof schema>;

let db: Db;
let avery = 0;
let morgan = 0;
const ids: Record<string, number> = {};

const generic = (name: string, source: "fdc_sr" | "fdc_foundation", kcal: number, proteinG: number) => ({
  source,
  name,
  servingLabel: "100 g",
  servingGrams: 100,
  kcal,
  proteinG,
});
const branded = (name: string, brand: string, servingLabel: string, servingGrams: number, kcal: number, proteinG: number, upc?: string) => ({
  source: "fdc_branded" as const,
  name,
  brand,
  upc: upc ?? null,
  servingLabel,
  servingGrams,
  kcal,
  proteinG,
});

beforeAll(async () => {
  db = (await getDb()) as Db;
  await runMigrations(db);

  const people = await db.insert(profiles).values([{ name: "Avery" }, { name: "Morgan" }]).returning({ id: profiles.id });
  avery = people[0]!.id;
  morgan = people[1]!.id;

  const rows = await db
    .insert(foods)
    .values([
      generic("Chicken Breast, Boneless, Skinless, Raw", "fdc_sr", 120, 22.5),
      generic("Yogurt, Greek, plain, nonfat", "fdc_sr", 59, 10.2),
      generic("Egg, whole, raw, fresh", "fdc_foundation", 143, 12.4),
      generic("Rice, white, long-grain, regular, cooked", "fdc_sr", 130, 2.7),
      branded("Greek Yogurt, Plain, Nonfat", "Chobani", "1 container (150 g)", 150, 80, 16, "894700010045"),
      branded("Greek Yogurt, Strawberry", "Chobani", "1 container (150 g)", 150, 110, 12),
      branded("Greek Yogurt, Triple Zero, Vanilla", "Oikos", "1 container (150 g)", 150, 90, 15),
      branded("Protein Bar, Cookies & Cream", "Quest Nutrition", "1 bar (60 g)", 60, 190, 21),
      branded("Ultra-Filtered Milk, 2% Reduced Fat", "Fairlife", "1 cup (240 ml)", 240, 120, 13),
      branded("Protein Shake, Chocolate", "Premier Protein", "1 bottle (325 ml)", 325, 160, 30),
      branded("Peanut Butter, Creamy", "Jif", "2 tbsp (33 g)", 33, 190, 7),
      generic("Peanut butter, smooth style, with salt", "fdc_sr", 598, 22.2),
      generic("Cheese, swiss", "fdc_sr", 393, 27),
      branded("String Cheese, Low Moisture Part Skim Mozzarella", "Galbani", "1 stick (28 g)", 28, 80, 7),
      branded("Chicken Breast Strips, Grilled", "Tyson", "3 oz (84 g)", 84, 100, 20),
      branded("Cottage Cheese, 2% Milkfat", "Good Culture", "0.5 cup (113 g)", 113, 90, 14),
      branded("Chocolate Chip Cookies", "Chips Ahoy", "3 cookies (33 g)", 33, 160, 2),
      // brand punctuation cases: the typed query rarely matches the brand string byte for byte
      branded("Sweet & Spicy Sriracha Sauce", "Chick-Fil-A", "2 tbsp (31 g)", 31, 160, 0),
      branded("Sweet & Spicy Sauce", "Pace", "2 tbsp (31 g)", 31, 40, 0),
      branded("Spicy Chicken Fillet Croissant", "Ampm", "1 sandwich (150 g)", 150, 420, 18),
      branded("Jerry's Brownie Bites", "Ben's Bakery", "3 pieces (40 g)", 40, 180, 2),
      branded("Chocolate Fudge Brownie Ice Cream", "Ben & Jerry's", "2/3 cup (140 g)", 140, 370, 5),
      branded("Chocolate Fudge Brownie Ice Cream", "Breyers", "2/3 cup (140 g)", 140, 280, 4),
      branded("Everything But The Bagel Seasoning", "Trader Joe's", "1/4 tsp (1 g)", 1, 5, 0),
      branded("Everything Bagel Seasoning", "McCormick", "1/4 tsp (1 g)", 1, 5, 0),
      { source: "custom" as const, name: "Avery Protein Smoothie", servingLabel: "1 smoothie", servingGrams: 400, kcal: 310, proteinG: 35, profileId: avery },
      { source: "custom" as const, name: "Morgan Mass Gainer Shake", servingLabel: "1 shake", servingGrams: 500, kcal: 800, proteinG: 50, profileId: morgan },
    ])
    .returning({ id: foods.id, name: foods.name, brand: foods.brand });
  for (const r of rows) ids[`${r.brand ?? ""}|${r.name}`] = r.id;

  await db.insert(profileFoodStats).values({
    profileId: avery,
    foodId: ids["Oikos|Greek Yogurt, Triple Zero, Vanilla"]!,
    timesLogged: 5,
    lastQty: 1,
    lastUnit: "serving",
  });
});

afterAll(async () => {
  await closeDb();
});

describe("buildPrefixTsQuery", () => {
  it("lowercases, strips punctuation and adds prefix markers", () => {
    expect(buildPrefixTsQuery("  Chobani  greek! ")).toBe("chobani:* & greek:*");
  });

  it("splits on punctuation so 90/10 still matches", () => {
    expect(buildPrefixTsQuery("beef 90/10")).toBe("beef:* & 90:* & 10:*");
  });

  it("returns null when nothing is left", () => {
    expect(buildPrefixTsQuery("  !!! ")).toBeNull();
    expect(buildPrefixTsQuery("")).toBeNull();
  });
});

describe("normalizeBrandText", () => {
  it("keeps only letters and digits, lowercased", () => {
    expect(normalizeBrandText("Chick-Fil-A")).toBe("chickfila");
    expect(normalizeBrandText("chick fil-a spicy")).toBe("chickfilaspicy");
    expect(normalizeBrandText("Trader Joe's")).toBe("traderjoes");
  });
  it("spells & as 'and' so both spellings meet in the middle", () => {
    expect(normalizeBrandText("Ben & Jerry's")).toBe("benandjerrys");
    expect(normalizeBrandText("ben and jerrys")).toBe("benandjerrys");
  });
  it("is empty for pure punctuation", () => {
    expect(normalizeBrandText(" - & ")).toBe("and");
    expect(normalizeBrandText("--")).toBe("");
  });
});

describe("searchFoods", () => {
  it("matches brand prefixes while typing", async () => {
    const hits = await searchFoods(db, { q: "chob", profileId: avery });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.brand).toBe("Chobani");
  });

  it("ranks foods in the profile's history first", async () => {
    const forAvery = await searchFoods(db, { q: "greek yogurt", profileId: avery });
    const oikos = forAvery.findIndex((h) => h.brand === "Oikos");
    const chobani = forAvery.findIndex((h) => h.brand === "Chobani");
    expect(oikos).toBe(0);
    expect(forAvery[oikos]!.inHistory).toBe(true);
    expect(chobani).toBeGreaterThan(oikos);

    const forMorgan = await searchFoods(db, { q: "greek yogurt", profileId: morgan });
    const oikos2 = forMorgan.findIndex((h) => h.brand === "Oikos");
    const chobani2 = forMorgan.findIndex((h) => h.brand === "Chobani");
    expect(chobani2).toBeGreaterThanOrEqual(0);
    expect(chobani2).toBeLessThan(oikos2);
    expect(forMorgan.every((h) => !h.inHistory)).toBe(true);
  });

  it("puts generic foods above branded ones when neither is in history", async () => {
    const hits = await searchFoods(db, { q: "chicken breast", profileId: morgan });
    expect(hits[0]!.source).toBe("fdc_sr");
    expect(hits.some((h) => h.brand === "Tyson")).toBe(true);
  });

  it("prefers generic for a plain food but the named brand when the query carries one", async () => {
    const plain = await searchFoods(db, { q: "peanut butter", profileId: morgan });
    expect(plain[0]!.source).toBe("fdc_sr");
    const withBrand = await searchFoods(db, { q: "jif peanut butter", profileId: morgan });
    expect(withBrand[0]!.brand).toBe("Jif");
  });

  it("applies the brand bonus however the user punctuates the brand", async () => {
    // "Spicy Chicken Fillet Croissant" matches chick:* and fil:* through other words and
    // out-ranks the Chick-Fil-A row on full text alone; only the brand bonus can fix the order.
    for (const q of ["chick fil a spicy", "chick fil-a spicy", "chickfila spicy"]) {
      const hits = await searchFoods(db, { q, profileId: morgan });
      expect(hits[0]!.brand, q).toBe("Chick-Fil-A");
    }
  });

  it("treats & and 'and' as the same word and ignores apostrophes in brands", async () => {
    const hits = await searchFoods(db, { q: "ben and jerrys brownie", profileId: morgan });
    expect(hits[0]!.brand).toBe("Ben & Jerry's");
  });

  it("does not let a fuzzy-only generic match outrank an exact branded match", async () => {
    const hits = await searchFoods(db, { q: "string cheese", profileId: morgan });
    expect(hits[0]!.name).toMatch(/string cheese/i);
  });

  it("survives typos through the trigram fallback", async () => {
    const hits = await searchFoods(db, { q: "chiken breast", profileId: avery });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.name).toMatch(/chicken breast/i);
  });

  it("keeps custom foods private to their profile", async () => {
    const averyId = ids["|Avery Protein Smoothie"]!;
    const own = await searchFoods(db, { q: "avery protein smoothie", profileId: avery });
    expect(own.some((h) => h.id === averyId)).toBe(true);
    const other = await searchFoods(db, { q: "avery protein smoothie", profileId: morgan });
    expect(other.some((h) => h.id === averyId)).toBe(false);
    expect(other.some((h) => h.name === "Morgan Mass Gainer Shake")).toBe(false);
  });

  it("hides retired restaurant items from search but keeps live ones", async () => {
    const [cfa] = await db
      .insert(restaurants)
      .values({ name: "Chick-fil-A", slug: "chickfila", source: "menustat", menuAsOf: "2018-01-01" })
      .returning({ id: restaurants.id });
    await db.insert(foods).values([
      { source: "restaurant", name: "Spicy Sandwich", brand: "Chick-fil-A", restaurantId: cfa!.id, servingLabel: "1 item", kcal: 450, proteinG: 29 },
      { source: "restaurant", name: "Spicy Sandwich, Retired Size", brand: "Chick-fil-A", restaurantId: cfa!.id, servingLabel: "1 item", kcal: 500, proteinG: 30, retiredAt: new Date() },
    ]);
    const ranked = await searchFoods(db, { q: "chick fil a spicy sandwich", profileId: morgan });
    expect(ranked.map((h) => h.name)).toContain("Spicy Sandwich");
    expect(ranked.map((h) => h.name)).not.toContain("Spicy Sandwich, Retired Size");
    const naive = await naiveSearch(db, { q: "Spicy Sandwich", profileId: morgan });
    expect(naive.map((h) => h.name)).not.toContain("Spicy Sandwich, Retired Size");
  });

  it("returns nothing for an empty query and respects the limit", async () => {
    expect(await searchFoods(db, { q: "   ", profileId: avery })).toEqual([]);
    const hits = await searchFoods(db, { q: "greek yogurt", profileId: avery, limit: 2 });
    expect(hits).toHaveLength(2);
  });

  it("maps every column with the right types", async () => {
    const [hit] = await searchFoods(db, { q: "chobani plain", profileId: avery });
    expect(hit).toMatchObject({
      source: "fdc_branded",
      name: "Greek Yogurt, Plain, Nonfat",
      brand: "Chobani",
      servingLabel: "1 container (150 g)",
      servingGrams: 150,
      kcal: 80,
      proteinG: 16,
      carbsG: null,
      fatG: null,
      upc: "894700010045",
      inHistory: false,
    });
    expect(typeof hit!.id).toBe("number");
    expect(typeof hit!.score).toBe("number");
  });
});

describe("naiveSearch", () => {
  it("does plain substring matching ordered by name", async () => {
    const hits = await naiveSearch(db, { q: "chobani", profileId: avery });
    expect(hits.map((h) => h.name)).toEqual(["Greek Yogurt, Plain, Nonfat", "Greek Yogurt, Strawberry"]);
    expect(hits.every((h) => h.inHistory === false && h.score === 0)).toBe(true);
  });

  it("is blind to typos", async () => {
    expect(await naiveSearch(db, { q: "chiken", profileId: avery })).toEqual([]);
  });
});
