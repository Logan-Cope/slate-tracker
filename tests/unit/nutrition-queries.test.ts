import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { AVERY, setupTestDb } from "./helpers/db";
import { foods, profiles } from "@/lib/db/schema";
import type { Database } from "@/lib/db/client";
import {
  copyDay,
  copyMeal,
  deleteLogEntries,
  deleteLogEntry,
  explodeMealEntry,
  getDailyTotals,
  getDiary,
  getGoTos,
  getRecents,
  lastUsed,
  logFood,
  quickAdd,
  updateLogEntry,
} from "@/lib/db/queries/nutrition";
import { cacheOffFood, createCustomFood, createSavedMeal, deleteCustomFood, findFoodByUpc, getFood, listCustomFoods, listSavedMeals } from "@/lib/db/queries/foods";

let close: () => Promise<void>;
let db: Database;
let chicken: number;
let chobani: number;
let quest: number;

const ID = (n: number) => `dddddddd-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

beforeAll(async () => {
  ({ db, close } = await setupTestDb({ foods: true }));
  const byName = async (name: string) => (await db.select({ id: foods.id }).from(foods).where(eq(foods.name, name)))[0]!.id;
  chicken = await byName("Chicken breast, cooked, roasted");
  chobani = await byName("Greek Yogurt, Plain, Nonfat");
  quest = await byName("Protein Bar, Cookies and Cream");
});
afterAll(() => close());

describe("logging", () => {
  it("logs grams of a generic food and does the math", async () => {
    const e = await logFood(AVERY, { id: ID(1), date: "2026-10-13", meal: "lunch", foodId: chicken, qty: 150, unit: "g", loggedAt: new Date("2026-10-13T12:30:00") });
    expect(e.grams).toBe(150);
    expect(e.kcal).toBeCloseTo(247.5, 3);
    expect(e.proteinG).toBeCloseTo(46.5, 3);
    expect(e.name).toBe("Chicken breast, cooked, roasted");
  });

  it("logs servings of a branded food", async () => {
    const e = await logFood(AVERY, { id: ID(2), date: "2026-10-13", meal: "breakfast", foodId: chobani, qty: 1, unit: "serving", loggedAt: new Date("2026-10-13T07:45:00") });
    expect(e.kcal).toBe(80);
    expect(e.grams).toBe(150);
  });

  it("retrying the same id does not double log or double count stats", async () => {
    await logFood(AVERY, { id: ID(2), date: "2026-10-13", meal: "breakfast", foodId: chobani, qty: 1, unit: "serving", loggedAt: new Date("2026-10-13T07:45:00") });
    const diary = await getDiary(AVERY, "2026-10-13");
    expect(diary.entries).toHaveLength(2);
    const recents = await getRecents(AVERY);
    expect(recents.find((r) => r.food.id === chobani)?.timesLogged).toBe(1);
  });

  it("diary groups by meal, totals, and carries the target", async () => {
    const diary = await getDiary(AVERY, "2026-10-13");
    expect(diary.byMeal.lunch).toHaveLength(1);
    expect(diary.byMeal.breakfast).toHaveLength(1);
    expect(diary.totals.kcal).toBeCloseTo(327.5, 3);
    expect(diary.totals.proteinG).toBeCloseTo(61.5, 3);
    expect(diary.target?.kcal).toBe(1500);
  });

  it("quick add stores calories and protein with no food link", async () => {
    const e = await quickAdd(AVERY, { id: ID(3), date: "2026-10-13", meal: "snacks", kcal: 200, proteinG: 10 });
    expect(e.foodId).toBeNull();
    expect(e.name).toBe("Quick add");
    expect((await getDiary(AVERY, "2026-10-13")).totals.kcal).toBeCloseTo(527.5, 3);
  });

  it("updating quantity recomputes nutrients; moving meals works", async () => {
    const e = await updateLogEntry(AVERY, ID(1), { qty: 100, unit: "g", meal: "dinner" });
    expect(e.kcal).toBe(165);
    expect(e.meal).toBe("dinner");
    const e2 = await updateLogEntry(AVERY, ID(1), { qty: 4, unit: "oz" });
    expect(e2.grams).toBeCloseTo(113.4, 1);
  });

  it("refuses gram units for a food without gram info", async () => {
    const f = await createCustomFood(AVERY, { name: "Mystery Cookie", servingLabel: "1 cookie", kcal: 120, proteinG: 2 });
    await expect(logFood(AVERY, { id: ID(4), date: "2026-10-13", meal: "snacks", foodId: f.id, qty: 30, unit: "g" })).rejects.toThrow();
    // explicit loggedAt: a wall-clock default would land in whatever hour the suite runs and skew the go-to test below
    const ok = await logFood(AVERY, { id: ID(4), date: "2026-10-13", meal: "snacks", foodId: f.id, qty: 2, unit: "serving", loggedAt: new Date("2026-10-13T15:00:00") });
    expect(ok.kcal).toBe(240);
    expect(ok.grams).toBeNull();
  });
});

describe("go-tos and recents", () => {
  it("ranks a breakfast food first at breakfast time and remembers the last amount", async () => {
    // Chicken logged twice as often, but at lunch; chobani logged once at 7:45.
    await logFood(AVERY, { id: ID(5), date: "2026-10-12", meal: "lunch", foodId: chicken, qty: 150, unit: "g", loggedAt: new Date("2026-10-12T12:30:00") });
    const morning = await getGoTos(AVERY, new Date("2026-10-13T08:00:00"));
    expect(morning[0]!.food.id).toBe(chobani);
    const noon = await getGoTos(AVERY, new Date("2026-10-13T12:15:00"));
    expect(noon[0]!.food.id).toBe(chicken);
    expect(noon[0]!.lastQty).toBe(150);
    expect(noon[0]!.lastUnit).toBe("g");
    expect(noon[0]!.kcal).toBeCloseTo(247.5, 3);
  });

  it("lastUsed returns the remembered amount for search tiles", async () => {
    const m = await lastUsed(AVERY, [chicken, quest]);
    expect(m.get(chicken)).toEqual({ qty: 150, unit: "g" });
    expect(m.get(quest)).toBeUndefined();
  });
});

describe("copying", () => {
  it("copies a meal to another day and a whole day", async () => {
    const copied = await copyMeal(AVERY, { fromDate: "2026-10-13", meal: "breakfast", toDate: "2026-10-14" });
    expect(copied).toHaveLength(1);
    expect(copied[0]!.date).toBe("2026-10-14");
    expect(copied[0]!.id).not.toBe(ID(2));
    const day = await copyDay(AVERY, { fromDate: "2026-10-13", toDate: "2026-10-15" });
    expect(day.length).toBe((await getDiary(AVERY, "2026-10-13")).entries.length);
    const totals = await getDailyTotals(AVERY, "2026-10-13", "2026-10-15");
    expect(totals.get("2026-10-15")?.kcal).toBeCloseTo(totals.get("2026-10-13")!.kcal, 3);
    expect(totals.get("2026-10-14")?.kcal).toBe(80);
  });
});

describe("saved meals", () => {
  it("creates a meal with summed nutrients, logs it as one line, and explodes it", async () => {
    const meal = await createSavedMeal(AVERY, "Protein breakfast", [
      { foodId: chobani, qty: 1, unit: "serving" },
      { foodId: quest, qty: 1, unit: "serving" },
    ]);
    expect(meal.isMeal).toBe(true);
    expect(meal.kcal).toBe(270);
    expect(meal.proteinG).toBe(36);
    expect(meal.servingGrams).toBe(210);
    expect(meal.items).toHaveLength(2);
    expect((await listSavedMeals(AVERY)).map((m) => m.name)).toEqual(["Protein breakfast"]);

    const entry = await logFood(AVERY, { id: ID(20), date: "2026-10-16", meal: "breakfast", foodId: meal.id, qty: 1, unit: "serving", loggedAt: new Date("2026-10-16T08:00:00") });
    expect(entry.kcal).toBe(270);
    const exploded = await explodeMealEntry(AVERY, ID(20));
    expect(exploded).toHaveLength(2);
    const diary = await getDiary(AVERY, "2026-10-16");
    expect(diary.entries).toHaveLength(2);
    expect(diary.totals.kcal).toBe(270);
  });
});

describe("custom foods and visibility", () => {
  it("lists own custom foods only and hides them from other profiles", async () => {
    const mine = await listCustomFoods(AVERY);
    expect(mine.map((f) => f.name)).toContain("Mystery Cookie");
    const cookie = mine.find((f) => f.name === "Mystery Cookie")!;
    expect(await getFood(2, cookie.id)).toBeNull();
    expect(await getFood(AVERY, chicken)).not.toBeNull();
  });

  it("deleting a custom food keeps the diary snapshot", async () => {
    const cookie = (await listCustomFoods(AVERY)).find((f) => f.name === "Mystery Cookie")!;
    expect(await deleteCustomFood(AVERY, cookie.id)).toBe(true);
    const diary = await getDiary(AVERY, "2026-10-13");
    const snap = diary.entries.find((e) => e.name === "Mystery Cookie");
    expect(snap?.foodId).toBeNull();
    expect(snap?.kcal).toBe(240);
  });

  it("deletes an entry", async () => {
    expect(await deleteLogEntry(AVERY, ID(3))).toBe(true);
    expect(await deleteLogEntry(AVERY, ID(3))).toBe(false);
  });

  it("a deleted entry can be logged again under the same id and time (undo)", async () => {
    const when = new Date("2026-10-20T12:30:00.000Z");
    const first = await logFood(AVERY, { id: ID(9), date: "2026-10-20", meal: "lunch", foodId: chicken, qty: 100, unit: "g", loggedAt: when });
    expect(await deleteLogEntry(AVERY, ID(9))).toBe(true);
    const again = await logFood(AVERY, { id: ID(9), date: "2026-10-20", meal: "lunch", foodId: chicken, qty: 100, unit: "g", loggedAt: when });
    expect(again.id).toBe(ID(9));
    expect(again.kcal).toBe(first.kcal);
    expect(again.loggedAt.toISOString()).toBe(when.toISOString());
    expect((await getDiary(AVERY, "2026-10-20")).entries.map((e) => e.id)).toEqual([ID(9)]);

    const quick = await quickAdd(AVERY, { id: ID(3), date: "2026-10-20", meal: "snacks", kcal: 200, proteinG: 10, name: "Late snack", loggedAt: when });
    expect(quick.id).toBe(ID(3));
    expect(quick.name).toBe("Late snack");
    expect(quick.loggedAt.toISOString()).toBe(when.toISOString());
  });

  it("an undo flagged as a restore does not count as a fresh log in her go-tos", async () => {
    const before = (await getRecents(AVERY)).find((r) => r.food.id === chicken)?.timesLogged ?? 0;
    await logFood(AVERY, { id: ID(10), date: "2026-10-21", meal: "lunch", foodId: chicken, qty: 100, unit: "g" });
    expect((await getRecents(AVERY)).find((r) => r.food.id === chicken)?.timesLogged).toBe(before + 1);
    expect(await deleteLogEntry(AVERY, ID(10))).toBe(true);
    await logFood(AVERY, { id: ID(10), date: "2026-10-21", meal: "lunch", foodId: chicken, qty: 100, unit: "g", restore: true });
    expect((await getRecents(AVERY)).find((r) => r.food.id === chicken)?.timesLogged).toBe(before + 1);
  });

  it("a quick add keeps the brand, amount, grams, carbs and fat of a snapshot it is given", async () => {
    const e = await quickAdd(AVERY, {
      id: ID(11),
      date: "2026-10-21",
      meal: "dinner",
      name: "Protein pancakes",
      brand: "Kodiak",
      qty: 2,
      unit: "pancakes",
      grams: 120,
      kcal: 320,
      proteinG: 28,
      carbsG: 40,
      fatG: 6,
    });
    expect(e).toMatchObject({ foodId: null, name: "Protein pancakes", brand: "Kodiak", qty: 2, unit: "pancakes", grams: 120, kcal: 320, proteinG: 28, carbsG: 40, fatG: 6 });
  });
});

describe("bulk delete", () => {
  const date = "2026-10-25";

  it("deletes only the listed rows of that profile, returns the count, and ignores unknown ids and another profile's rows", async () => {
    const [other] = await db.insert(profiles).values({ name: "Other" }).returning();
    const when = new Date("2026-10-25T12:00:00.000Z");
    await logFood(AVERY, { id: ID(30), date, meal: "lunch", foodId: chicken, qty: 100, unit: "g", loggedAt: when });
    await logFood(AVERY, { id: ID(31), date, meal: "lunch", foodId: chobani, qty: 1, unit: "serving", loggedAt: when });
    await logFood(AVERY, { id: ID(32), date, meal: "lunch", foodId: quest, qty: 1, unit: "serving", loggedAt: when });
    await quickAdd(other!.id, { id: ID(33), date, meal: "lunch", kcal: 300, loggedAt: when });

    const n = await deleteLogEntries(AVERY, [ID(30), ID(31), ID(33), ID(99)]);
    expect(n).toBe(2);
    expect((await getDiary(AVERY, date)).entries.map((e) => e.id)).toEqual([ID(32)]);
    expect((await getDiary(other!.id, date)).entries.map((e) => e.id)).toEqual([ID(33)]);
  });

  it("an empty list returns 0 and leaves the diary alone", async () => {
    expect(await deleteLogEntries(AVERY, [])).toBe(0);
    expect((await getDiary(AVERY, date)).entries.map((e) => e.id)).toEqual([ID(32)]);
  });
});

describe("barcodes", () => {
  it("finds a USDA food by UPC regardless of leading zeros, and caches OFF results", async () => {
    const hit = await findFoodByUpc(AVERY, "0888849000012");
    expect(hit?.brand).toBe("Quest");
    expect(await findFoodByUpc(AVERY, "000000")).toBeNull();
    const cached = await cacheOffFood({ upc: "49000050103", name: "Coca Cola", brand: "Coca-Cola", servingLabel: "355 ml", servingGrams: 355, kcal: 138.45, proteinG: 0, carbsG: 37.6, fatG: 0, fiberG: null });
    expect(cached.source).toBe("off");
    expect((await findFoodByUpc(AVERY, "049000050103"))?.id).toBe(cached.id);
  });
});
