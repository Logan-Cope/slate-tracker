/**
 * Builds the demo's food list from a database that has the USDA generic import
 * (`npm run fdc:import -- --only generic`): everyday Foundation and SR Legacy
 * foods with at least one household portion, written to lib/demo/foods.json.
 * USDA FoodData Central is public domain.
 *
 *   PGLITE_DIR=<dir with the import> node --import tsx scripts/make-demo-foods.ts [--limit 1200]
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { and, eq, gt, inArray } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db/client";
import { foodServings, foods } from "../lib/db/schema";
import type { DemoFood } from "../lib/demo/foods";

const { values } = parseArgs({ options: { limit: { type: "string", default: "1200" } } });
const LIMIT = Number(values.limit);

// Single foods left out by id (rare fruits whose names trip this repo's publishing word filter).
const EXCLUDE_IDS = new Set([173952]);

// Categories a person tracking their own meals rarely logs.
const SKIP = /\b(babyfood|infant formula|game meat|beverages, .*powder|restaurant, |fast foods|school lunch|usda commodity|alcoholic|frozen novelties|lamb, new zealand|veal, variety|beef, variety|pork, fresh, variety|ns as to|leavening)\b/i;

// Brand and chain names are printed in capitals in SR Legacy ("SILK", "KFC"); the demo keeps to plain foods.
const BRAND = /\b[A-Z]{3,}\b/;

const STAPLES = [
  "Oats", "Cereals, oats", "Egg, whole", "Egg, white", "Chicken, broilers or fryers, breast", "Chicken, broiler or fryers, breast",
  "Chicken, broilers or fryers, thigh", "Rice, white", "Rice, brown", "Fish, salmon", "Fish, tuna", "Fish, cod", "Fish, tilapia",
  "Beef, ground", "Turkey, ground", "Pork, fresh, loin", "Crustaceans, shrimp", "Tofu", "Yogurt, Greek", "Yogurt, plain",
  "Milk, whole", "Milk, reduced fat", "Milk, lowfat", "Milk, nonfat", "Cheese, cheddar", "Cheese, cottage", "Cheese, mozzarella",
  "Nuts, almonds", "Nuts, walnuts", "Nuts, cashew", "Peanuts", "Peanut butter", "Bananas", "Apples", "Oranges", "Strawberries",
  "Blueberries", "Raspberries", "Grapes", "Avocados", "Broccoli", "Spinach", "Carrots", "Potatoes", "Sweet potato", "Lettuce",
  "Tomatoes", "Cucumber", "Onions", "Peppers, sweet", "Beans, black", "Lentils", "Chickpeas", "Pasta, cooked", "Spaghetti",
  "Bread, whole-wheat", "Bread, white", "Tortillas", "Oil, olive", "Butter", "Honey", "Quinoa", "Hummus", "Granola", "Bagels",
  "Egg, whole, cooked", "Rice, white, long-grain, regular, enriched, cooked", "Rice, brown, long-grain, cooked",
  "Fish, salmon, Atlantic, farmed, cooked", "Broccoli, cooked", "Tomatoes, red, ripe, raw", "Sweet potato, cooked",
  "Cream cheese", "Salsa", "Kale", "Zucchini", "Mushrooms, white", "Corn, sweet", "Peas, green", "Green beans", "Beans, snap",
];

const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

async function main() {
  const db = await getDb();
  const rows = await db
    .select()
    .from(foods)
    .where(and(inArray(foods.source, ["fdc_sr", "fdc_foundation"]), gt(foods.kcal, 0), eq(foods.isMeal, false)));
  const servings = await db.select().from(foodServings);
  const byFood = new Map<number, [string, number][]>();
  for (const s of servings) {
    const list = byFood.get(s.foodId) ?? [];
    list.push([s.label, r1(s.grams)!]);
    byFood.set(s.foodId, list);
  }
  const usable = rows.filter((f) => byFood.has(f.id) && !EXCLUDE_IDS.has(f.fdcId ?? 0) && !SKIP.test(f.name) && !BRAND.test(f.name));
  const seen = new Set<string>();
  const picked: typeof usable = [];
  const take = (f: (typeof usable)[number]) => {
    const key = f.name.toLowerCase();
    if (seen.has(key) || picked.length >= LIMIT) return;
    seen.add(key);
    picked.push(f);
  };
  const shortestFirst = (a: { name: string }, b: { name: string }) => a.name.length - b.name.length || a.name.localeCompare(b.name);
  // Staples first, a few variants each, so search answers what people actually type.
  for (const word of STAPLES) {
    const re = new RegExp(`^${word}\\b`, "i");
    usable.filter((f) => re.test(f.name)).sort(shortestFirst).slice(0, 6).forEach(take);
  }
  // Then plain, short names until the list is full.
  usable.filter((f) => f.name.split(",").length <= 3).sort(shortestFirst).forEach(take);
  picked.sort((a, b) => a.name.localeCompare(b.name));
  const out: DemoFood[] = picked.map((f) => ({
    fdcId: f.fdcId!,
    source: f.source as DemoFood["source"],
    name: f.name,
    servingLabel: f.servingLabel,
    servingGrams: f.servingGrams,
    kcal: r1(f.kcal)!,
    proteinG: r1(f.proteinG)!,
    carbsG: r1(f.carbsG),
    fatG: r1(f.fatG),
    fiberG: r1(f.fiberG),
    servings: byFood.get(f.id)!.slice(0, 4),
  }));
  writeFileSync("lib/demo/foods.json", JSON.stringify(out) + "\n");
  console.log(`Wrote ${out.length} foods to lib/demo/foods.json`);
  await closeDb();
}

void main();
