/**
 * Pure helpers shared by the tiles, sheets and diary: which amount a tile
 * should offer, what it adds up to, and how to print it.
 */
import { computeEntry, resolveUnitWord, type ComputedEntry } from "@/lib/nutrition/servings";
import { fmtQty } from "@/lib/utils/format";
import type { Amount, EntryDto, FoodSummary, Totals } from "./types";

export const ONE_SERVING: Amount = { qty: 1, unit: "serving" };

const WEIGHT_WORDS = new Set(["g", "oz"]);

/**
 * The amount a tile logs with one tap: a typed quantity when it fits the
 * food, else the last-used amount, else one label serving. A typed weight on
 * a food with no gram information is ignored rather than read as servings.
 */
export function pickAmount(food: FoodSummary, typed: { qty: number; unitWord: string } | null): Amount {
  if (typed) {
    const unit = resolveUnitWord(typed.unitWord, food, food.servings);
    if (unit) return { qty: typed.qty, unit };
    if (!WEIGHT_WORDS.has(typed.unitWord)) return { qty: typed.qty, unit: "serving" };
  }
  return lastUsedAmount(food) ?? ONE_SERVING;
}

export function lastUsedAmount(food: FoodSummary): Amount | null {
  if (food.lastQty === null || food.lastUnit === null) return null;
  if (!safeCompute(food, food.lastQty, food.lastUnit)) return null;
  return { qty: food.lastQty, unit: food.lastUnit };
}

/** computeEntry that returns null instead of throwing on a bad qty or unit. */
export function safeCompute(food: FoodSummary, qty: number, unit: string): ComputedEntry | null {
  try {
    return computeEntry(food, qty, unit, food.servings);
  } catch {
    return null;
  }
}

/** "150 g", "2 oz", "1 container (150 g)", "2 x 1 scoop". */
export function formatAmount(qty: number, unit: string, servingLabel: string): string {
  const q = fmtQty(qty);
  if (unit === "g" || unit === "oz") return `${q} ${unit}`;
  const label = unit === "serving" ? servingLabel : unit;
  return qty === 1 ? label : `${q} x ${label}`;
}

export const ZERO_TOTALS: Totals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

const NO_PLURAL = new Set(["g", "oz", "ml", "tbsp", "tsp"]);

/** A typed quantity as a phrase: "150 g", "2 scoops", "1 serving". */
export function formatTyped(qty: number, unitWord: string): string {
  const q = fmtQty(qty);
  if (NO_PLURAL.has(unitWord)) return `${q} ${unitWord}`;
  return `${q} ${unitWord}${qty === 1 ? "" : "s"}`;
}

export function sumDtos(entries: Pick<EntryDto, "kcal" | "proteinG" | "carbsG" | "fatG">[]): Totals {
  return entries.reduce<Totals>(
    (t, e) => ({ kcal: t.kcal + e.kcal, proteinG: t.proteinG + e.proteinG, carbsG: t.carbsG + (e.carbsG ?? 0), fatG: t.fatG + (e.fatG ?? 0) }),
    ZERO_TOTALS,
  );
}

export function addTotals(a: Totals, b: Pick<EntryDto, "kcal" | "proteinG" | "carbsG" | "fatG">, sign: 1 | -1 = 1): Totals {
  return {
    kcal: a.kcal + sign * b.kcal,
    proteinG: a.proteinG + sign * b.proteinG,
    carbsG: a.carbsG + sign * (b.carbsG ?? 0),
    fatG: a.fatG + sign * (b.fatG ?? 0),
  };
}

/** Dedupes a list of foods by id, keeping first occurrence. */
export function uniqueById<T extends { food: { id: number } }>(items: T[], exclude: Set<number> = new Set()): T[] {
  const seen = new Set(exclude);
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.food.id)) continue;
    seen.add(item.food.id);
    out.push(item);
  }
  return out;
}
