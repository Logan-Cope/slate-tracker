/**
 * getDiaryScreen loads everything Today shows (the day, its foods with their
 * servings, and which meals had entries yesterday) in one wave of queries, and
 * must return exactly what getDiary + getFoods return.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AVERY, setupTestDb } from "./helpers/db";
import { measure } from "./helpers/query-trace";
import type { Database } from "@/lib/db/client";
import { foodLog, foods, profiles } from "@/lib/db/schema";
import { createCustomFood, getFoods } from "@/lib/db/queries/foods";
import { getDiary, getDiaryScreen, logFood, quickAdd } from "@/lib/db/queries/nutrition";
import { setTarget } from "@/lib/db/queries/targets";

let db: Database;
let close: () => Promise<void>;
const DAY = "2026-05-20";
const YESTERDAY = "2026-05-19";
let hiddenFoodId: number;

beforeAll(async () => {
  ({ db, close } = await setupTestDb({ foods: true }));
  const catalogue = await db.select({ id: foods.id }).from(foods).limit(3);
  const [other] = await db.insert(profiles).values({ name: "Other" }).returning();
  const hidden = await createCustomFood(other!.id, {
    name: "Other's cookie",
    servingLabel: "1 cookie",
    kcal: 90,
    proteinG: 1,
    altServings: [{ label: "half", grams: 10 }],
  });
  hiddenFoodId = hidden.id;
  const mine = await createCustomFood(AVERY, { name: "My oats", servingLabel: "1 cup", servingGrams: 80, kcal: 300, proteinG: 10, altServings: [{ label: "bowl", grams: 120 }] });

  await setTarget(AVERY, { kcal: 1500, proteinG: 110, effectiveFrom: "2026-05-01" });
  await logFood(AVERY, { id: randomUUID(), date: DAY, meal: "breakfast", foodId: mine.id, qty: 1, unit: "serving" });
  await logFood(AVERY, { id: randomUUID(), date: DAY, meal: "lunch", foodId: catalogue[0]!.id, qty: 1.5, unit: "serving" });
  await logFood(AVERY, { id: randomUUID(), date: DAY, meal: "dinner", foodId: catalogue[1]!.id, qty: 1, unit: "serving" });
  await quickAdd(AVERY, { id: randomUUID(), date: DAY, meal: "snacks", name: "Quick", kcal: 200, proteinG: 10 });
  // An entry that points at a food this profile cannot see: its food stays out of the map.
  await db.insert(foodLog).values({ id: randomUUID(), profileId: AVERY, date: DAY, meal: "snacks", foodId: hiddenFoodId, name: "Other's cookie", qty: 1, unit: "serving", kcal: 90, proteinG: 1 });
  // Yesterday: breakfast and snacks only.
  await logFood(AVERY, { id: randomUUID(), date: YESTERDAY, meal: "breakfast", foodId: catalogue[2]!.id, qty: 1, unit: "serving" });
  await quickAdd(AVERY, { id: randomUUID(), date: YESTERDAY, meal: "snacks", name: "Late", kcal: 150 });
});
afterAll(() => close());

async function expected(profileId: number, date: string) {
  const diary = await getDiary(profileId, date);
  const ids = [...new Set(diary.entries.flatMap((e) => (e.foodId === null ? [] : [e.foodId])))];
  return { diary, foods: await getFoods(profileId, ids) };
}

const plain = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (x instanceof Map ? [...x].sort(([a], [b]) => a - b) : x instanceof Set ? [...x].sort() : x)));

describe("getDiaryScreen", () => {
  it("returns the same day and foods as getDiary + getFoods, and never another profile's food", async () => {
    const screen = await getDiaryScreen(AVERY, DAY);
    const want = await expected(AVERY, DAY);
    expect(plain(screen.diary)).toEqual(plain(want.diary));
    expect(plain(screen.foods)).toEqual(plain(want.foods));
    expect(screen.foods.has(hiddenFoodId)).toBe(false);
    expect(screen.diary.entries.some((e) => e.foodId === hiddenFoodId)).toBe(true);
    expect([...screen.foods.values()].find((f) => f.name === "My oats")?.servings.map((s) => s.label)).toEqual(["bowl"]);
  });

  it("names the meals that had entries yesterday", async () => {
    const screen = await getDiaryScreen(AVERY, DAY);
    expect([...screen.yesterdayMeals].sort()).toEqual(["breakfast", "snacks"]);
  });

  it("handles an empty day", async () => {
    const screen = await getDiaryScreen(AVERY, "2026-01-02");
    const want = await expected(AVERY, "2026-01-02");
    expect(plain(screen.diary)).toEqual(plain(want.diary));
    expect(screen.foods.size).toBe(0);
    expect(screen.yesterdayMeals.size).toBe(0);
  });

  it("sends five queries together", async () => {
    const t = await measure(() => getDiaryScreen(AVERY, DAY));
    expect(t.queries).toBe(5);
    expect(t.depth).toBe(1);
  });
});
