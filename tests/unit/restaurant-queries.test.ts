import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { AVERY, setupTestDb } from "./helpers/db";
import type { Database } from "@/lib/db/client";
import { foodLog, foods } from "@/lib/db/schema";
import { searchFoods } from "@/lib/db/queries/food-search";
import { logFood } from "@/lib/db/queries/nutrition";
import {
  getRestaurantBySlug,
  listRestaurants,
  upsertMenu,
  upsertRestaurant,
  type MenuItemInput,
} from "@/lib/db/queries/restaurants";

let close: () => Promise<void>;
let db: Database;

const LOG_ID = "eeeeeeee-0000-4000-8000-000000000001";

const item = (name: string, kcal = 100, proteinG = 10): MenuItemInput => ({ name, kcal, proteinG });

async function foodsFor(restaurantId: number) {
  return db.select().from(foods).where(eq(foods.restaurantId, restaurantId));
}

async function liveFoodsFor(restaurantId: number) {
  return (await foodsFor(restaurantId)).filter((f) => f.retiredAt === null);
}

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(() => close());

describe("upsertRestaurant", () => {
  it("creates on first call, then updates and reports the previous source", async () => {
    const first = await upsertRestaurant({ name: "Chick-Fil-A", source: "menustat", menuAsOf: "2018-01-01" });
    expect(first.created).toBe(true);
    expect(first.previousSource).toBeNull();

    const second = await upsertRestaurant({
      name: "Chick-fil-A",
      source: "web",
      sourceUrl: "https://www.chick-fil-a.com/menu",
      menuAsOf: "2026-10-19",
    });
    expect(second.created).toBe(false);
    expect(second.previousSource).toBe("menustat");
    expect(second.id).toBe(first.id);

    const row = await getRestaurantBySlug("chickfila");
    expect(row).not.toBeNull();
    expect(row!.name).toBe("Chick-fil-A");
    expect(row!.source).toBe("web");
    expect(row!.sourceUrl).toBe("https://www.chick-fil-a.com/menu");
    expect(row!.menuAsOf).toBe("2026-10-19");
    expect(await getRestaurantBySlug("nope")).toBeNull();
  });

  it("lists restaurants ordered by name", async () => {
    await upsertRestaurant({ name: "Arby's", source: "menustat", menuAsOf: "2018-01-01" });
    const names = (await listRestaurants()).map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toContain("Arby's");
    expect(names).toContain("Chick-fil-A");
  });
});

describe("upsertMenu", () => {
  it("inserts items, is idempotent on repeat, and collapses case-different duplicates", async () => {
    const { id } = await upsertRestaurant({ name: "Wendy's", source: "menustat", menuAsOf: "2018-01-01" });
    const items: MenuItemInput[] = [
      { name: "Baconator", servingLabel: "1 sandwich", kcal: 960, proteinG: 58, carbsG: 40, fatG: 65 },
      item("Spicy Chicken Sandwich", 500, 32),
      item("  spicy chicken sandwich  ", 999, 1),
      item("   "),
    ];
    const first = await upsertMenu(id, items);
    expect(first).toEqual({ inserted: 2, updated: 0, retired: 0, revived: 0 });

    const rows = await foodsFor(id);
    expect(rows).toHaveLength(2);
    const spicy = rows.find((r) => r.name === "Spicy Chicken Sandwich")!;
    expect(spicy.kcal).toBe(500);
    expect(spicy.source).toBe("restaurant");
    expect(spicy.servingLabel).toBe("1 item");
    expect(spicy.servingGrams).toBeNull();
    expect(spicy.carbsG).toBeNull();
    expect(spicy.brand).toBe("Wendy's");
    const baconator = rows.find((r) => r.name === "Baconator")!;
    expect(baconator.servingLabel).toBe("1 sandwich");
    expect(baconator.fatG).toBe(65);
    expect(baconator.fiberG).toBeNull();

    const second = await upsertMenu(id, items);
    expect(second).toEqual({ inserted: 0, updated: 2, retired: 0, revived: 0 });
    expect(await foodsFor(id)).toHaveLength(2);
  });

  it("retireMissing hides an item from search and a later import revives it", async () => {
    const { id } = await upsertRestaurant({ name: "Taco Bell", source: "menustat", menuAsOf: "2018-01-01" });
    await upsertMenu(id, [item("Crunchy Taco"), item("Bean Burrito")]);
    expect((await searchFoods(db, { q: "bean burrito", profileId: AVERY })).map((h) => h.name)).toContain("Bean Burrito");

    const retiredRun = await upsertMenu(id, [item("Crunchy Taco")], { retireMissing: true });
    expect(retiredRun).toEqual({ inserted: 0, updated: 1, retired: 1, revived: 0 });
    const burrito = (await foodsFor(id)).find((r) => r.name === "Bean Burrito")!;
    expect(burrito.retiredAt).not.toBeNull();
    expect((await searchFoods(db, { q: "bean burrito", profileId: AVERY })).map((h) => h.name)).not.toContain("Bean Burrito");

    const revivedRun = await upsertMenu(id, [item("Crunchy Taco"), item("bean burrito")], { retireMissing: true });
    expect(revivedRun).toEqual({ inserted: 0, updated: 2, retired: 0, revived: 1 });
    const again = (await foodsFor(id)).find((r) => r.id === burrito.id)!;
    expect(again.retiredAt).toBeNull();
    expect((await searchFoods(db, { q: "bean burrito", profileId: AVERY })).map((h) => h.id)).toContain(burrito.id);
  });

  it("never deletes: a retired item Avery logged still joins from food_log", async () => {
    const { id } = await upsertRestaurant({ name: "Chipotle", source: "menustat", menuAsOf: "2018-01-01" });
    await upsertMenu(id, [item("Chicken Bowl", 650, 50)]);
    const bowl = (await foodsFor(id))[0]!;
    const entry = await logFood(AVERY, { id: LOG_ID, date: "2026-10-19", meal: "lunch", foodId: bowl.id, qty: 1, unit: "serving" });
    expect(entry.foodId).toBe(bowl.id);

    expect(await upsertMenu(id, [], { retireMissing: true })).toEqual({ inserted: 0, updated: 0, retired: 1, revived: 0 });

    const joined = await db
      .select({ logId: foodLog.id, foodId: foods.id, retiredAt: foods.retiredAt, kcal: foodLog.kcal })
      .from(foodLog)
      .innerJoin(foods, eq(foods.id, foodLog.foodId))
      .where(and(eq(foodLog.id, LOG_ID), eq(foodLog.profileId, AVERY)));
    expect(joined).toHaveLength(1);
    expect(joined[0]!.foodId).toBe(bowl.id);
    expect(joined[0]!.retiredAt).not.toBeNull();
    expect(joined[0]!.kcal).toBe(650);
  });

  it("itemCount tracks live items through inserts and retirements", async () => {
    const { id } = await upsertRestaurant({ name: "Panera Bread", source: "menustat", menuAsOf: "2018-01-01" });
    await upsertMenu(id, [item("Broccoli Cheddar Soup"), item("Turkey Sandwich")]);
    expect((await getRestaurantBySlug("panerabread"))!.itemCount).toBe(2);

    await upsertMenu(id, [item("Broccoli Cheddar Soup")], { retireMissing: true });
    expect((await getRestaurantBySlug("panerabread"))!.itemCount).toBe(1);
    expect(await liveFoodsFor(id)).toHaveLength(1);

    await upsertMenu(id, [item("Broccoli Cheddar Soup"), item("Turkey Sandwich"), item("Caesar Salad")]);
    expect((await getRestaurantBySlug("panerabread"))!.itemCount).toBe(3);
  });

  it("brand follows the restaurant display name at upsert time", async () => {
    const { id } = await upsertRestaurant({ name: "Mcdonald's", source: "menustat", menuAsOf: "2018-01-01" });
    await upsertMenu(id, [item("Big Mac", 590, 25)]);
    expect((await foodsFor(id))[0]!.brand).toBe("Mcdonald's");

    const renamed = await upsertRestaurant({ name: "McDonald's", source: "web", menuAsOf: "2026-10-19" });
    expect(renamed.id).toBe(id);
    await upsertMenu(id, [item("Big Mac", 590, 25)]);
    const rows = await foodsFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.brand).toBe("McDonald's");
  });
});
