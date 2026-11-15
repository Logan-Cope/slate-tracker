/**
 * Diary: log, edit, copy, totals, go-tos and recents. Nutrients are computed
 * server-side from the food row so the log is always consistent with the
 * catalogue at the time of logging.
 */
import { hourInZone } from "@/lib/utils/tz";
import { shiftDate } from "@/lib/utils/date";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db/client";
import { combineReads, defineRead, runRead, type Read } from "@/lib/db/batch";
import { foodLog, foodServings, foods, profileFoodStats, type FoodLogEntry, type MealSlot, type Target } from "@/lib/db/schema";
import { computeEntry } from "@/lib/nutrition/servings";
import { rankGoTos, type FoodStat } from "@/lib/nutrition/go-tos";
import { getTargetFor, targetRead } from "./targets";
import { getFood, getFoods, listSavedMeals, visibleTo, type FoodWithServings } from "./foods";

export const MEALS: MealSlot[] = ["breakfast", "lunch", "dinner", "snacks"];

export type Totals = { kcal: number; proteinG: number; carbsG: number; fatG: number };
export type DiaryDay = {
  date: string;
  entries: FoodLogEntry[];
  byMeal: Record<MealSlot, FoodLogEntry[]>;
  totals: Totals;
  target: Target | null;
};

type Macros = { kcal: number; proteinG: number; carbsG: number | null; fatG: number | null };

export function sumEntries(entries: Macros[]): Totals {
  const totals: Totals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const e of entries) {
    totals.kcal += e.kcal;
    totals.proteinG += e.proteinG;
    totals.carbsG += e.carbsG ?? 0;
    totals.fatG += e.fatG ?? 0;
  }
  return totals;
}

export async function getDiary(profileId: number, date: string): Promise<DiaryDay> {
  const db = await getDb();
  const [entries, target] = await Promise.all([
    db
      .select()
      .from(foodLog)
      .where(and(eq(foodLog.profileId, profileId), eq(foodLog.date, date)))
      .orderBy(asc(foodLog.loggedAt)),
    getTargetFor(profileId, date),
  ]);
  return diaryDay(date, entries, target);
}

function diaryDay(date: string, entries: FoodLogEntry[], target: Target | null): DiaryDay {
  const byMeal = { breakfast: [], lunch: [], dinner: [], snacks: [] } as Record<MealSlot, FoodLogEntry[]>;
  for (const e of entries) byMeal[e.meal].push(e);
  return { date, entries, byMeal, totals: sumEntries(entries), target };
}

export type DiaryScreen = { diary: DiaryDay; foods: Map<number, FoodWithServings>; yesterdayMeals: Set<MealSlot> };

/**
 * Everything the Today screen shows: the day, the foods its entries came from
 * (with their servings) and which meals had entries the day before. The five
 * queries go out together; the foods are found by a subquery on the day's
 * entries rather than by waiting for them.
 */
export async function getDiaryScreen(profileId: number, date: string): Promise<DiaryScreen> {
  const db = await getDb();
  return runRead(db, diaryScreenRead(db, profileId, date));
}

export function diaryScreenRead(db: Database, profileId: number, date: string): Read<DiaryScreen> {
  const day = and(eq(foodLog.profileId, profileId), eq(foodLog.date, date));
  const loggedFoodIds = db.select({ id: foodLog.foodId }).from(foodLog).where(day);
  const screen = defineRead(
    [
      db.select().from(foodLog).where(day).orderBy(asc(foodLog.loggedAt)),
      db
        .select()
        .from(foods)
        .where(and(inArray(foods.id, loggedFoodIds), visibleTo(profileId))),
      db.select().from(foodServings).where(inArray(foodServings.foodId, loggedFoodIds)).orderBy(asc(foodServings.id)),
      db
        .selectDistinct({ meal: foodLog.meal })
        .from(foodLog)
        .where(and(eq(foodLog.profileId, profileId), eq(foodLog.date, shiftDate(date, -1)))),
    ],
    ([entries, foodRows, servings, yesterday]) => ({ entries, foodRows, servings, yesterday }),
  );
  return combineReads({ screen, target: targetRead(db, profileId, date) }, ({ screen: { entries, foodRows, servings, yesterday }, target }) => {
    const byFood = new Map<number, FoodWithServings>();
    for (const f of foodRows) byFood.set(f.id, { ...f, servings: servings.filter((s) => s.foodId === f.id) });
    return { diary: diaryDay(date, entries, target), foods: byFood, yesterdayMeals: new Set(yesterday.map((r) => r.meal)) };
  });
}

/** Totals per day for a date range (coach dashboard). */
export async function getDailyTotals(profileId: number, from: string, to: string): Promise<Map<string, Totals>> {
  const db = await getDb();
  return runRead(db, dailyTotalsRead(db, profileId, from, to));
}

export function dailyTotalsRead(db: Database, profileId: number, from: string, to: string): Read<Map<string, Totals>> {
  const query = db
    .select()
    .from(foodLog)
    .where(and(eq(foodLog.profileId, profileId), inArray(foodLog.date, dateRange(from, to))));
  return defineRead([query], ([rows]) => {
    const out = new Map<string, Totals>();
    for (const date of dateRange(from, to)) out.set(date, sumEntries(rows.filter((r) => r.date === date)));
    return out;
  });
}

function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export type LogFoodInput = {
  id: string;
  date: string;
  meal: MealSlot;
  foodId: number;
  qty: number;
  unit: string;
  loggedAt?: Date;
  /** Putting a deleted row back: her go-to stats already counted it, so they are left alone. */
  restore?: boolean;
};

export type QuickAddInput = {
  id: string;
  date: string;
  meal: MealSlot;
  name?: string;
  kcal: number;
  proteinG?: number;
  carbsG?: number | null;
  fatG?: number | null;
  loggedAt?: Date;
  /** Snapshot fields, kept when an entry whose food is gone is put back after a delete. */
  brand?: string | null;
  qty?: number;
  unit?: string;
  grams?: number | null;
};

async function bumpStats(profileId: number, foodId: number, qty: number, unit: string, meal: MealSlot, loggedAt: Date) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(profileFoodStats)
    .where(and(eq(profileFoodStats.profileId, profileId), eq(profileFoodStats.foodId, foodId)))
    .limit(1);
  const hour = hourInZone(loggedAt);
  const hist = [...(existing[0]?.hourHist ?? new Array<number>(24).fill(0))];
  while (hist.length < 24) hist.push(0);
  hist[hour] = (hist[hour] ?? 0) + 1;
  if (existing[0]) {
    await db
      .update(profileFoodStats)
      .set({ timesLogged: existing[0].timesLogged + 1, lastLoggedAt: loggedAt, lastQty: qty, lastUnit: unit, lastMeal: meal, hourHist: hist })
      .where(and(eq(profileFoodStats.profileId, profileId), eq(profileFoodStats.foodId, foodId)));
  } else {
    await db
      .insert(profileFoodStats)
      .values({ profileId, foodId, timesLogged: 1, lastLoggedAt: loggedAt, lastQty: qty, lastUnit: unit, lastMeal: meal, hourHist: hist })
      .onConflictDoNothing();
  }
}

/** Logs a catalogue food. Retrying with the same id is a no-op. */
export async function logFood(profileId: number, input: LogFoodInput): Promise<FoodLogEntry> {
  const food = await getFood(profileId, input.foodId);
  if (!food) throw new Error("Food not found");
  const computed = computeEntry(food, input.qty, input.unit, food.servings);
  const loggedAt = input.loggedAt ?? new Date();
  const db = await getDb();
  const [row] = await db
    .insert(foodLog)
    .values({
      id: input.id,
      profileId,
      date: input.date,
      meal: input.meal,
      foodId: food.id,
      name: food.name,
      brand: food.brand,
      qty: computed.qty,
      unit: computed.unit,
      grams: computed.grams,
      kcal: computed.kcal,
      proteinG: computed.proteinG,
      carbsG: computed.carbsG,
      fatG: computed.fatG,
      loggedAt,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    const existing = await db
      .select()
      .from(foodLog)
      .where(and(eq(foodLog.id, input.id), eq(foodLog.profileId, profileId)))
      .limit(1);
    if (!existing[0]) throw new Error("That id belongs to another profile");
    return existing[0];
  }
  if (!input.restore) await bumpStats(profileId, food.id, computed.qty, computed.unit, input.meal, loggedAt);
  return row;
}

export async function quickAdd(profileId: number, input: QuickAddInput): Promise<FoodLogEntry> {
  if (!Number.isFinite(input.kcal) || input.kcal < 0) throw new RangeError("Calories must be 0 or more");
  const db = await getDb();
  const [row] = await db
    .insert(foodLog)
    .values({
      id: input.id,
      profileId,
      date: input.date,
      meal: input.meal,
      foodId: null,
      name: input.name?.trim() || "Quick add",
      brand: input.brand ?? null,
      qty: input.qty ?? 1,
      unit: input.unit ?? "serving",
      grams: input.grams ?? null,
      kcal: input.kcal,
      proteinG: input.proteinG ?? 0,
      carbsG: input.carbsG ?? null,
      fatG: input.fatG ?? null,
      loggedAt: input.loggedAt ?? new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const existing = await db
    .select()
    .from(foodLog)
    .where(and(eq(foodLog.id, input.id), eq(foodLog.profileId, profileId)))
    .limit(1);
  if (!existing[0]) throw new Error("That id belongs to another profile");
  return existing[0];
}

export type UpdateEntryPatch = {
  qty?: number;
  unit?: string;
  meal?: MealSlot;
  date?: string;
  /** Quick-add entries only. */
  kcal?: number;
  proteinG?: number;
  name?: string;
};

export async function updateLogEntry(profileId: number, id: string, patch: UpdateEntryPatch): Promise<FoodLogEntry> {
  const db = await getDb();
  const existing = (await db.select().from(foodLog).where(and(eq(foodLog.id, id), eq(foodLog.profileId, profileId))).limit(1))[0];
  if (!existing) throw new Error("Entry not found");
  const set: Partial<typeof foodLog.$inferInsert> = {};
  if (patch.meal) set.meal = patch.meal;
  if (patch.date) set.date = patch.date;
  if (existing.foodId && (patch.qty !== undefined || patch.unit !== undefined)) {
    const food = await getFood(profileId, existing.foodId);
    if (food) {
      const c = computeEntry(food, patch.qty ?? existing.qty, patch.unit ?? existing.unit, food.servings);
      Object.assign(set, { qty: c.qty, unit: c.unit, grams: c.grams, kcal: c.kcal, proteinG: c.proteinG, carbsG: c.carbsG, fatG: c.fatG });
    }
  } else if (!existing.foodId) {
    if (patch.kcal !== undefined) set.kcal = patch.kcal;
    if (patch.proteinG !== undefined) set.proteinG = patch.proteinG;
    if (patch.name !== undefined) set.name = patch.name.trim() || existing.name;
  }
  if (Object.keys(set).length === 0) return existing;
  const [row] = await db
    .update(foodLog)
    .set(set)
    .where(and(eq(foodLog.id, id), eq(foodLog.profileId, profileId)))
    .returning();
  return row!;
}

export async function deleteLogEntry(profileId: number, id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(foodLog)
    .where(and(eq(foodLog.id, id), eq(foodLog.profileId, profileId)))
    .returning();
  return rows.length > 0;
}

/** Edit mode's Delete: one statement for every selected row of this profile. Returns how many went. */
export async function deleteLogEntries(profileId: number, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const rows = await db
    .delete(foodLog)
    .where(and(eq(foodLog.profileId, profileId), inArray(foodLog.id, [...ids])))
    .returning({ id: foodLog.id });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Copying
// ---------------------------------------------------------------------------

export async function copyEntries(
  profileId: number,
  input: { ids: string[]; toDate: string; toMeal?: MealSlot; newIds?: string[] },
): Promise<FoodLogEntry[]> {
  if (input.ids.length === 0) return [];
  const db = await getDb();
  const sources = await db
    .select()
    .from(foodLog)
    .where(and(eq(foodLog.profileId, profileId), inArray(foodLog.id, input.ids)))
    .orderBy(asc(foodLog.loggedAt));
  if (sources.length === 0) return [];
  const now = new Date();
  const rows = sources.map((s, i) => ({
    ...s,
    id: input.newIds?.[i] ?? crypto.randomUUID(),
    date: input.toDate,
    meal: input.toMeal ?? s.meal,
    loggedAt: new Date(now.getTime() + i),
  }));
  const inserted = await db.insert(foodLog).values(rows).onConflictDoNothing().returning();
  for (const r of inserted) {
    if (r.foodId) await bumpStats(profileId, r.foodId, r.qty, r.unit, r.meal, r.loggedAt);
  }
  return inserted;
}

export async function copyMeal(profileId: number, input: { fromDate: string; meal: MealSlot; toDate: string; toMeal?: MealSlot }): Promise<FoodLogEntry[]> {
  const db = await getDb();
  const ids = await db
    .select({ id: foodLog.id })
    .from(foodLog)
    .where(and(eq(foodLog.profileId, profileId), eq(foodLog.date, input.fromDate), eq(foodLog.meal, input.meal)));
  return copyEntries(profileId, { ids: ids.map((r) => r.id), toDate: input.toDate, toMeal: input.toMeal ?? input.meal });
}

export async function copyDay(profileId: number, input: { fromDate: string; toDate: string }): Promise<FoodLogEntry[]> {
  const db = await getDb();
  const ids = await db
    .select({ id: foodLog.id })
    .from(foodLog)
    .where(and(eq(foodLog.profileId, profileId), eq(foodLog.date, input.fromDate)));
  return copyEntries(profileId, { ids: ids.map((r) => r.id), toDate: input.toDate });
}

/** Replaces a saved-meal entry with one entry per item. */
export async function explodeMealEntry(profileId: number, entryId: string): Promise<FoodLogEntry[]> {
  const db = await getDb();
  const entry = (await db.select().from(foodLog).where(and(eq(foodLog.id, entryId), eq(foodLog.profileId, profileId))).limit(1))[0];
  if (!entry?.foodId) throw new Error("Entry is not a saved meal");
  const meals = await listSavedMeals(profileId, entry.foodId);
  const meal = meals[0];
  if (!meal) throw new Error("Entry is not a saved meal");
  const out: FoodLogEntry[] = [];
  for (const item of meal.items) {
    out.push(
      await logFood(profileId, {
        id: crypto.randomUUID(),
        date: entry.date,
        meal: entry.meal,
        foodId: item.foodId,
        qty: item.qty * entry.qty,
        unit: item.unit,
      }),
    );
  }
  await deleteLogEntry(profileId, entryId);
  return out;
}

// ---------------------------------------------------------------------------
// Go-tos and recents
// ---------------------------------------------------------------------------

export type GoToFood = {
  food: FoodWithServings;
  lastQty: number;
  lastUnit: string;
  lastMeal: MealSlot | null;
  timesLogged: number;
  lastLoggedAt: Date;
  /** What logging the last-used amount again would add. */
  kcal: number;
  proteinG: number;
};

async function statsWithFoods(profileId: number, limit: number): Promise<{ stats: (FoodStat & { row: typeof profileFoodStats.$inferSelect })[]; foods: Map<number, FoodWithServings> }> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(profileFoodStats)
    .where(eq(profileFoodStats.profileId, profileId))
    .orderBy(desc(profileFoodStats.lastLoggedAt))
    .limit(limit);
  const foodsById = await getFoods(profileId, rows.map((r) => r.foodId));
  return {
    stats: rows.map((row) => ({ row, foodId: row.foodId, timesLogged: row.timesLogged, lastLoggedAt: row.lastLoggedAt, hourHist: row.hourHist })),
    foods: foodsById,
  };
}

function toGoTo(row: typeof profileFoodStats.$inferSelect, food: FoodWithServings): GoToFood {
  let kcal = food.kcal;
  let proteinG = food.proteinG;
  try {
    const c = computeEntry(food, row.lastQty, row.lastUnit, food.servings);
    kcal = c.kcal;
    proteinG = c.proteinG;
  } catch {
    // Unit no longer valid (food edited); fall back to one serving.
  }
  return { food, lastQty: row.lastQty, lastUnit: row.lastUnit, lastMeal: row.lastMeal, timesLogged: row.timesLogged, lastLoggedAt: row.lastLoggedAt, kcal, proteinG };
}

export async function getGoTos(profileId: number, now: Date = new Date(), limit = 12): Promise<GoToFood[]> {
  const { stats, foods: foodsById } = await statsWithFoods(profileId, 300);
  return rankGoTos(stats, now, limit)
    .flatMap((s) => {
      const food = foodsById.get(s.foodId);
      return food ? [toGoTo(s.row, food)] : [];
    });
}

export async function getRecents(profileId: number, limit = 20): Promise<GoToFood[]> {
  const { stats, foods: foodsById } = await statsWithFoods(profileId, limit);
  return stats.flatMap((s) => {
    const food = foodsById.get(s.foodId);
    return food ? [toGoTo(s.row, food)] : [];
  });
}

/** Last-used amount for a set of foods (search results show it on the tile). */
export async function lastUsed(profileId: number, foodIds: number[]): Promise<Map<number, { qty: number; unit: string }>> {
  const db = await getDb();
  const out = new Map<number, { qty: number; unit: string }>();
  if (foodIds.length === 0) return out;
  const rows = await db
    .select({ foodId: profileFoodStats.foodId, qty: profileFoodStats.lastQty, unit: profileFoodStats.lastUnit })
    .from(profileFoodStats)
    .where(and(eq(profileFoodStats.profileId, profileId), inArray(profileFoodStats.foodId, foodIds)));
  for (const r of rows) out.set(r.foodId, { qty: r.qty, unit: r.unit });
  return out;
}

export { foods };
