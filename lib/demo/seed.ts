/**
 * Demo data: the USDA food list, a few invented packaged foods with barcodes,
 * and 60 days of history for the athlete (meals, weigh-ins, workouts) ending
 * today. Deterministic for a given day, invented end to end. Runs once on an
 * empty demo database, through the same query functions the app uses, so the
 * go-to stats and personal records are built the way real use builds them.
 */
import { asc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { foodServings, foods, profiles, targets, type MealSlot } from "@/lib/db/schema";
import { logFood } from "@/lib/db/queries/nutrition";
import { upsertWeighIn } from "@/lib/db/queries/metrics";
import { setTarget } from "@/lib/db/queries/targets";
import { getActiveProgram, upsertWorkout, type WorkoutDraft } from "@/lib/db/queries/training";
import { shiftDate, todayLocal } from "@/lib/utils/date";
import { zonedHourToDate } from "./time";
import type { DemoFood } from "./foods";
import FOOD_LIST from "./foods.json";

export const DEMO_DAYS = 60;

/** Invented packaged foods, so a typed barcode finds something offline. */
export const DEMO_PACKAGED = [
  { upc: "850000000017", name: "High Protein Greek Yogurt, Vanilla", brand: "Northfield Dairy", servingLabel: "1 container (170 g)", servingGrams: 170, kcal: 140, proteinG: 18, carbsG: 12, fatG: 2, fiberG: 0 },
  { upc: "850000000024", name: "Peanut Butter Protein Bar", brand: "Trailhead", servingLabel: "1 bar (60 g)", servingGrams: 60, kcal: 230, proteinG: 20, carbsG: 22, fatG: 9, fiberG: 6 },
  { upc: "850000000031", name: "Chocolate Protein Shake", brand: "Trailhead", servingLabel: "1 bottle (330 ml)", servingGrams: 330, kcal: 160, proteinG: 30, carbsG: 5, fatG: 3, fiberG: 1 },
  { upc: "850000000048", name: "Sprouted Grain Bread", brand: "Millbrook", servingLabel: "1 slice (34 g)", servingGrams: 34, kcal: 80, proteinG: 5, carbsG: 15, fatG: 0.5, fiberG: 3 },
  { upc: "850000000055", name: "Honey Almond Granola", brand: "Millbrook", servingLabel: "1/2 cup (55 g)", servingGrams: 55, kcal: 250, proteinG: 6, carbsG: 34, fatG: 10, fiberG: 4 },
] as const;

/** Mulberry32: a tiny seeded generator, so the same day always gets the same history. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [food name prefix, unit (a household portion, "g" or "serving"), quantity] */
type Item = [string, string, number];

const MEALS: Record<MealSlot, Item[][]> = {
  breakfast: [
    [["Cereals, oats, regular and quick", "1 cup", 0.5], ["Bananas, raw", "1 cup, sliced", 0.75], ["Peanut butter, smooth style", "2 tablespoon", 0.5]],
    [["High Protein Greek Yogurt", "serving", 1], ["Blueberries, raw", "1 cup", 0.5], ["Honey Almond Granola", "serving", 0.5]],
    [["Egg, whole, cooked, fried", "1 large", 2], ["Sprouted Grain Bread", "serving", 2], ["Avocados, raw, California", "1 NLEA serving", 1]],
    [["Chocolate Protein Shake", "serving", 1], ["Bananas, raw", "1 cup, sliced", 1]],
  ],
  lunch: [
    [["Chicken, broilers or fryers, breast, meat only, cooked, roasted", "g", 140], ["Rice, white, long-grain, regular, enriched, cooked", "1 cup", 1], ["Broccoli, cooked, boiled, drained, without salt", "0.5 cup, chopped", 2]],
    [["Turkey, ground, 93% lean", "4 oz", 1], ["Tortillas, ready-to-bake or -fry, corn", "1 tortilla", 3], ["Beans, black, mature seeds, cooked, boiled, without salt", "1 cup", 0.5], ["Avocados, raw, California", "1 NLEA serving", 1]],
    [["Fish, tuna salad", "3 oz", 1.5], ["Sprouted Grain Bread", "serving", 2], ["Carrots, raw", "1 cup strips or slices", 0.5]],
    [["Quinoa, cooked", "1 cup", 1], ["Chicken, broilers or fryers, breast, meat only, cooked, roasted", "g", 110], ["Spinach, raw", "1 cup", 2], ["Hummus, commercial", "2 tablespoon", 1]],
  ],
  dinner: [
    [["Fish, salmon, Atlantic, farmed, cooked, dry heat", "3 oz", 1.5], ["Potatoes, baked, flesh, with salt", "1 potato (2-1/3\" x 4-3/4\")", 1], ["Spinach, raw", "1 cup", 2], ["Oil, olive, salad or cooking", "1 tablespoon", 0.5]],
    [["Pasta, cooked, enriched, without added salt", "1 cup spaghetti not packed", 1.5], ["Turkey, ground, 93% lean", "4 oz", 1], ["Tomatoes, red, ripe, raw, year round average", "1 cup, chopped or sliced", 0.5]],
    [["Chicken, broilers or fryers, breast, meat only, cooked, roasted", "g", 150], ["Rice, white, long-grain, regular, enriched, cooked", "1 cup", 0.75], ["Broccoli, cooked, boiled, drained, without salt", "0.5 cup, chopped", 2]],
  ],
  snacks: [
    [["Nuts, almonds", "g", 28]],
    [["Apples, raw, without skin", "1 medium (3\" dia)", 1], ["Peanut butter, smooth style", "2 tablespoon", 1]],
    [["Peanut Butter Protein Bar", "serving", 1]],
    [["Cheese, cottage, creamed, large or small curd", "4 oz", 1], ["Strawberries, raw", "1 cup, halves", 0.5]],
  ],
};

const MEAL_HOURS: Record<MealSlot, number> = { breakfast: 8, lunch: 12.5, dinner: 19, snacks: 15.5 };

export async function seedDemo(db: Database): Promise<void> {
  const profile = (await db.select().from(profiles).orderBy(asc(profiles.id)).limit(1))[0];
  if (!profile) throw new Error("Run the base seed first");
  const profileId = profile.id;
  const today = todayLocal();
  const start = shiftDate(today, -(DEMO_DAYS - 1));
  const rand = rng(Number(today.replaceAll("-", "")));

  await insertFoods(db);
  const resolve = await foodResolver(db);

  // The base seed's placeholder target starts today; the demo's runs the whole history.
  await db.delete(targets).where(eq(targets.profileId, profileId));
  await setTarget(profileId, { kcal: 1700, proteinG: 110, effectiveFrom: start });

  // Meals: most days fully logged, a few with a gap, the way a real diary looks.
  for (let i = 0; i < DEMO_DAYS; i++) {
    const date = shiftDate(start, i);
    const isToday = date === today;
    for (const meal of ["breakfast", "lunch", "snacks", "dinner"] as const) {
      if (isToday && meal !== "breakfast") continue;
      if (rand() < 0.06) continue;
      const options = MEALS[meal];
      const items = options[Math.floor(rand() * options.length)]!;
      for (const [k, [prefix, unit, qty]] of items.entries()) {
        const food = resolve(prefix);
        await logFood(profileId, {
          id: demoUuid(i, meal, k),
          date,
          meal,
          foodId: food.id,
          qty,
          unit: food.units.has(unit) || unit === "serving" || unit === "g" ? unit : "serving",
          loggedAt: new Date(Math.min(zonedHourToDate(date, MEAL_HOURS[meal] + rand() * 0.6).getTime(), Date.now())),
        });
      }
    }
  }

  // Weigh-ins: about 0.6 lb a week down, with the day-to-day water noise the trend line ignores.
  for (let i = 0; i < DEMO_DAYS; i++) {
    if (rand() < 0.15 && i !== DEMO_DAYS - 1) continue;
    const date = shiftDate(start, i);
    const value = Math.round((171.8 - i * 0.085 + (rand() - 0.5) * 1.8) * 10) / 10;
    await upsertWeighIn(profileId, { id: demoUuid(i, "weight", 0), date, value });
  }

  // Workouts: three a week, A and B in turn, adding weight every other week.
  const program = await getActiveProgram(profileId);
  if (!program) return;
  let next = 0;
  for (let i = 0; i < DEMO_DAYS - 1; i++) {
    const date = shiftDate(start, i);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (![1, 3, 5].includes(weekday)) continue;
    const routine = program.routines[next % program.routines.length]!;
    next++;
    const step = Math.floor(i / 14);
    const startedAt = zonedHourToDate(date, 17.5 + rand() * 0.5);
    const draft: WorkoutDraft = {
      id: demoUuid(i, "workout", 0),
      profileId,
      routineId: routine.id,
      title: routine.name,
      startedAt,
      finishedAt: new Date(startedAt.getTime() + (48 + Math.floor(rand() * 12)) * 60_000),
      notes: null,
      exercises: routine.exercises.map((re, position) => {
        const base = re.startWeightLb;
        const weightLb = base == null ? null : base + step * (base >= 60 ? 5 : 2.5);
        return {
          id: demoUuid(i, "we", position),
          exerciseId: re.exercise.id,
          position,
          supersetGroup: null,
          notes: null,
          sets: Array.from({ length: re.targetSets ?? 2 }, (_, k) => ({
            id: demoUuid(i, `set${position}`, k),
            position: k,
            setType: k === (re.targetSets ?? 2) - 1 ? ("failure" as const) : ("normal" as const),
            weightLb,
            reps: k === 0 ? 9 + Math.floor(rand() * 4) : 6 + Math.floor(rand() * 4),
            rpe: null,
            completedAt: new Date(startedAt.getTime() + (position * 2 + k + 1) * 3 * 60_000),
            isPr: false,
          })),
        };
      }),
    };
    await upsertWorkout(draft);
  }
}

async function insertFoods(db: Database): Promise<void> {
  const list = FOOD_LIST as DemoFood[];
  for (let i = 0; i < list.length; i += 300) {
    const chunk = list.slice(i, i + 300);
    const rows = await db
      .insert(foods)
      .values(chunk.map((f) => ({ source: f.source, fdcId: f.fdcId, name: f.name, servingLabel: f.servingLabel, servingGrams: f.servingGrams, kcal: f.kcal, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG, fiberG: f.fiberG })))
      .returning({ id: foods.id });
    const servings = chunk.flatMap((f, j) => f.servings.map(([label, grams]) => ({ foodId: rows[j]!.id, label, grams })));
    if (servings.length > 0) await db.insert(foodServings).values(servings);
  }
  await db.insert(foods).values(DEMO_PACKAGED.map((f) => ({ source: "fdc_branded" as const, ...f, popularity: 1 })));
}

async function foodResolver(db: Database) {
  const rows = await db.select({ id: foods.id, name: foods.name }).from(foods);
  const servingRows = await db.select({ foodId: foodServings.foodId, label: foodServings.label }).from(foodServings);
  const units = new Map<number, Set<string>>();
  for (const s of servingRows) (units.get(s.foodId) ?? units.set(s.foodId, new Set()).get(s.foodId)!).add(s.label);
  return (prefix: string) => {
    const match = rows.filter((r) => r.name.startsWith(prefix)).sort((a, b) => a.name.length - b.name.length)[0];
    if (!match) throw new Error(`Demo food missing: ${prefix}`);
    return { id: match.id, units: units.get(match.id) ?? new Set<string>() };
  };
}

/** Stable ids, so a reseed on the same day writes the same rows. */
function demoUuid(day: number, kind: string, n: number): string {
  let h = 2166136261;
  for (const c of `${day}:${kind}:${n}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  const tail = `${day.toString(16).padStart(4, "0")}${n.toString(16).padStart(4, "0")}${hex}`.slice(0, 12);
  return `${hex}-0000-4000-8000-${tail}`;
}
