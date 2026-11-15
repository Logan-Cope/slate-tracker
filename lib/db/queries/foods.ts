/**
 * Food catalogue access: visibility rules, custom foods, saved meals, barcodes.
 * Diary logging lives in ./nutrition.ts.
 */
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { foodLog, foodServings, foods, profileFoodStats, savedMealItems, type Food, type FoodServing } from "@/lib/db/schema";
import { computeEntry } from "@/lib/nutrition/servings";
import type { OffFood } from "@/lib/nutrition/off";

export type FoodWithServings = Food & { servings: FoodServing[] };

export function visibleTo(profileId: number) {
  return or(isNull(foods.profileId), eq(foods.profileId, profileId));
}

export async function getFood(profileId: number, foodId: number): Promise<FoodWithServings | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(foods)
    .where(and(eq(foods.id, foodId), visibleTo(profileId)))
    .limit(1);
  const food = rows[0];
  if (!food) return null;
  const servings = await db.select().from(foodServings).where(eq(foodServings.foodId, foodId)).orderBy(asc(foodServings.id));
  return { ...food, servings };
}

export async function getFoods(profileId: number, ids: number[]): Promise<Map<number, FoodWithServings>> {
  const db = await getDb();
  const out = new Map<number, FoodWithServings>();
  if (ids.length === 0) return out;
  const rows = await db
    .select()
    .from(foods)
    .where(and(inArray(foods.id, ids), visibleTo(profileId)));
  const servings = await db.select().from(foodServings).where(inArray(foodServings.foodId, ids)).orderBy(asc(foodServings.id));
  for (const f of rows) out.set(f.id, { ...f, servings: servings.filter((s) => s.foodId === f.id) });
  return out;
}

// ---------------------------------------------------------------------------
// Custom foods
// ---------------------------------------------------------------------------

export type CustomFoodInput = {
  name: string;
  brand?: string | null;
  servingLabel: string;
  servingGrams?: number | null;
  kcal: number;
  proteinG: number;
  carbsG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
  upc?: string | null;
  altServings?: { label: string; grams: number }[];
};

function validateFoodInput(input: CustomFoodInput) {
  if (!input.name.trim()) throw new RangeError("Name is required");
  if (!input.servingLabel.trim()) throw new RangeError("Serving is required");
  if (!Number.isFinite(input.kcal) || input.kcal < 0) throw new RangeError("Calories must be 0 or more");
  if (!Number.isFinite(input.proteinG) || input.proteinG < 0) throw new RangeError("Protein must be 0 or more");
  if (input.servingGrams != null && !(input.servingGrams > 0)) throw new RangeError("Serving grams must be positive");
}

export async function createCustomFood(profileId: number, input: CustomFoodInput): Promise<FoodWithServings> {
  validateFoodInput(input);
  const db = await getDb();
  const [row] = await db
    .insert(foods)
    .values({
      source: "custom",
      profileId,
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      servingLabel: input.servingLabel.trim(),
      servingGrams: input.servingGrams ?? null,
      kcal: input.kcal,
      proteinG: input.proteinG,
      carbsG: input.carbsG ?? null,
      fatG: input.fatG ?? null,
      fiberG: input.fiberG ?? null,
      upc: input.upc ? input.upc.replace(/\D/g, "").replace(/^0+/, "") || null : null,
    })
    .returning();
  if (!row) throw new Error("insert failed");
  if (input.altServings?.length) {
    await db.insert(foodServings).values(input.altServings.map((s) => ({ foodId: row.id, label: s.label, grams: s.grams })));
  }
  return (await getFood(profileId, row.id))!;
}

export async function updateCustomFood(profileId: number, foodId: number, input: CustomFoodInput): Promise<FoodWithServings> {
  validateFoodInput(input);
  const db = await getDb();
  const [row] = await db
    .update(foods)
    .set({
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      servingLabel: input.servingLabel.trim(),
      servingGrams: input.servingGrams ?? null,
      kcal: input.kcal,
      proteinG: input.proteinG,
      carbsG: input.carbsG ?? null,
      fatG: input.fatG ?? null,
      fiberG: input.fiberG ?? null,
      upc: input.upc ? input.upc.replace(/\D/g, "").replace(/^0+/, "") || null : null,
    })
    .where(and(eq(foods.id, foodId), eq(foods.profileId, profileId), eq(foods.source, "custom")))
    .returning();
  if (!row) throw new Error("food not found");
  if (input.altServings) {
    await db.delete(foodServings).where(eq(foodServings.foodId, foodId));
    if (input.altServings.length) {
      await db.insert(foodServings).values(input.altServings.map((s) => ({ foodId, label: s.label, grams: s.grams })));
    }
  }
  return (await getFood(profileId, foodId))!;
}

/** Deletes an own custom food. Diary entries keep their snapshot and lose the link. */
export async function deleteCustomFood(profileId: number, foodId: number): Promise<boolean> {
  const db = await getDb();
  const owned = await db
    .select({ id: foods.id })
    .from(foods)
    .where(and(eq(foods.id, foodId), eq(foods.profileId, profileId)))
    .limit(1);
  if (owned.length === 0) return false;
  await db.update(foodLog).set({ foodId: null }).where(eq(foodLog.foodId, foodId));
  await db.delete(savedMealItems).where(eq(savedMealItems.foodId, foodId));
  await db.delete(profileFoodStats).where(eq(profileFoodStats.foodId, foodId));
  await db.delete(foods).where(eq(foods.id, foodId));
  return true;
}

export async function listCustomFoods(profileId: number): Promise<Food[]> {
  const db = await getDb();
  return db
    .select()
    .from(foods)
    .where(and(eq(foods.profileId, profileId), eq(foods.source, "custom"), eq(foods.isMeal, false)))
    .orderBy(asc(foods.name));
}

// ---------------------------------------------------------------------------
// Saved meals (a meal is a food row with isMeal = true plus its items)
// ---------------------------------------------------------------------------

export type SavedMealItemInput = { foodId: number; qty: number; unit: string };
export type SavedMeal = FoodWithServings & { items: { id: number; foodId: number; qty: number; unit: string; position: number; food: FoodWithServings; kcal: number; proteinG: number }[] };

async function mealTotals(profileId: number, items: SavedMealItemInput[]) {
  const foodsById = await getFoods(profileId, items.map((i) => i.foodId));
  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  let grams = 0;
  let gramsKnown = true;
  const computed = items.map((item) => {
    const food = foodsById.get(item.foodId);
    if (!food) throw new Error(`Food ${item.foodId} not found`);
    const entry = computeEntry(food, item.qty, item.unit, food.servings);
    kcal += entry.kcal;
    proteinG += entry.proteinG;
    carbsG += entry.carbsG ?? 0;
    fatG += entry.fatG ?? 0;
    if (entry.grams === null) gramsKnown = false;
    else grams += entry.grams;
    return { item, food, entry };
  });
  return { kcal, proteinG, carbsG, fatG, grams: gramsKnown ? grams : null, computed };
}

export async function createSavedMeal(profileId: number, name: string, items: SavedMealItemInput[]): Promise<SavedMeal> {
  if (!name.trim()) throw new RangeError("Name is required");
  if (items.length === 0) throw new RangeError("A meal needs at least one food");
  const totals = await mealTotals(profileId, items);
  const db = await getDb();
  const [row] = await db
    .insert(foods)
    .values({
      source: "custom",
      profileId,
      isMeal: true,
      name: name.trim(),
      servingLabel: "1 meal",
      servingGrams: totals.grams,
      kcal: totals.kcal,
      proteinG: totals.proteinG,
      carbsG: totals.carbsG,
      fatG: totals.fatG,
    })
    .returning();
  if (!row) throw new Error("insert failed");
  await db.insert(savedMealItems).values(items.map((i, position) => ({ mealFoodId: row.id, foodId: i.foodId, qty: i.qty, unit: i.unit, position })));
  return (await getSavedMeal(profileId, row.id))!;
}

export async function updateSavedMeal(profileId: number, mealId: number, name: string, items: SavedMealItemInput[]): Promise<SavedMeal> {
  if (items.length === 0) throw new RangeError("A meal needs at least one food");
  const totals = await mealTotals(profileId, items);
  const db = await getDb();
  const [row] = await db
    .update(foods)
    .set({ name: name.trim(), servingGrams: totals.grams, kcal: totals.kcal, proteinG: totals.proteinG, carbsG: totals.carbsG, fatG: totals.fatG })
    .where(and(eq(foods.id, mealId), eq(foods.profileId, profileId), eq(foods.isMeal, true)))
    .returning();
  if (!row) throw new Error("meal not found");
  await db.delete(savedMealItems).where(eq(savedMealItems.mealFoodId, mealId));
  await db.insert(savedMealItems).values(items.map((i, position) => ({ mealFoodId: mealId, foodId: i.foodId, qty: i.qty, unit: i.unit, position })));
  return (await getSavedMeal(profileId, mealId))!;
}

export async function deleteSavedMeal(profileId: number, mealId: number): Promise<boolean> {
  return deleteCustomFood(profileId, mealId);
}

export async function getSavedMeal(profileId: number, mealId: number): Promise<SavedMeal | null> {
  const list = await listSavedMeals(profileId, mealId);
  return list[0] ?? null;
}

export async function listSavedMeals(profileId: number, onlyId?: number): Promise<SavedMeal[]> {
  const db = await getDb();
  const conds = [eq(foods.profileId, profileId), eq(foods.isMeal, true)];
  if (onlyId !== undefined) conds.push(eq(foods.id, onlyId));
  const meals = await db
    .select()
    .from(foods)
    .where(and(...conds))
    .orderBy(asc(foods.name));
  if (meals.length === 0) return [];
  const items = await db
    .select()
    .from(savedMealItems)
    .where(inArray(savedMealItems.mealFoodId, meals.map((m) => m.id)))
    .orderBy(asc(savedMealItems.position));
  const foodsById = await getFoods(profileId, [...new Set(items.map((i) => i.foodId))]);
  return meals.map((m) => ({
    ...m,
    servings: [],
    items: items
      .filter((i) => i.mealFoodId === m.id)
      .flatMap((i) => {
        const food = foodsById.get(i.foodId);
        if (!food) return [];
        const entry = computeEntry(food, i.qty, i.unit, food.servings);
        return [{ id: i.id, foodId: i.foodId, qty: i.qty, unit: i.unit, position: i.position, food, kcal: entry.kcal, proteinG: entry.proteinG }];
      }),
  }));
}

// ---------------------------------------------------------------------------
// Barcodes
// ---------------------------------------------------------------------------

export function normalizeUpc(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "");
}

export async function findFoodByUpc(profileId: number, raw: string): Promise<FoodWithServings | null> {
  const upc = normalizeUpc(raw);
  if (upc.length < 6) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: foods.id })
    .from(foods)
    .where(and(eq(foods.upc, upc), visibleTo(profileId)))
    // Own custom foods first, then USDA, then OFF cache.
    .orderBy(sql`case when ${foods.source} = 'custom' then 0 when ${foods.source} = 'fdc_branded' then 1 else 2 end`, desc(foods.id))
    .limit(1);
  return rows[0] ? getFood(profileId, rows[0].id) : null;
}

/**
 * Open Food Facts is crowd-sourced, so the cached row is bounded: text is
 * trimmed and nutrients clamped to plausible per-serving ranges.
 */
export async function cacheOffFood(off: OffFood): Promise<FoodWithServings> {
  const text = (s: string | null, max: number) => (s ? s.replace(/\s+/g, " ").trim().slice(0, max) || null : null);
  const clamp = (n: number | null, max: number) => (n === null || !Number.isFinite(n) ? null : Math.min(Math.max(n, 0), max));
  const name = text(off.name, 120);
  if (!name) throw new RangeError("Product has no name");
  const kcal = clamp(off.kcal, 5000);
  if (kcal === null) throw new RangeError("Product has no calories");
  const db = await getDb();
  const [row] = await db
    .insert(foods)
    .values({
      source: "off",
      upc: (() => {
        const u = normalizeUpc(off.upc ?? "");
        return u.length >= 6 && u.length <= 14 ? u : null;
      })(),
      name,
      brand: text(off.brand, 80),
      servingLabel: text(off.servingLabel, 60) ?? "1 serving",
      servingGrams: clamp(off.servingGrams, 5000),
      kcal,
      proteinG: clamp(off.proteinG, 1000) ?? 0,
      carbsG: clamp(off.carbsG, 1000),
      fatG: clamp(off.fatG, 1000),
      fiberG: clamp(off.fiberG, 500),
    })
    .returning();
  return { ...row!, servings: [] };
}
