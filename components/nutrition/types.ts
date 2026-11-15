/**
 * Client-safe shapes for the nutrition UI. Server code maps DB rows into these
 * (see ./serialize.ts) so nothing here imports Drizzle or Node-only modules.
 */
import type { AltServing } from "@/lib/nutrition/servings";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snacks";

export const MEAL_SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "dinner", "snacks"];

export const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

export function isMealSlot(v: unknown): v is MealSlot {
  return typeof v === "string" && (MEAL_SLOTS as readonly string[]).includes(v);
}

/** A food as the UI needs it: label serving, nutrients per serving, alt servings, last-used amount. */
export type FoodSummary = {
  id: number;
  source: string;
  name: string;
  brand: string | null;
  servingLabel: string;
  servingGrams: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  upc: string | null;
  isMeal: boolean;
  /** Own custom food or saved meal, so it can be edited. */
  isCustom: boolean;
  servings: AltServing[];
  lastQty: number | null;
  lastUnit: string | null;
};

export type EntryDto = {
  id: string;
  date: string;
  meal: MealSlot;
  foodId: number | null;
  name: string;
  brand: string | null;
  qty: number;
  unit: string;
  grams: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
  loggedAt: string;
};

export type TargetDto = { kcal: number; proteinG: number; carbsG: number | null; fatG: number | null };

export type Totals = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export type DiaryDto = {
  date: string;
  entries: EntryDto[];
  target: TargetDto | null;
};

export type GoToDto = {
  food: FoodSummary;
  lastQty: number;
  lastUnit: string;
  lastMeal: MealSlot | null;
  timesLogged: number;
  lastLoggedAt: string;
  kcal: number;
  proteinG: number;
};

export type GoTosResponse = { goTos: GoToDto[]; recents: GoToDto[] };
export type SearchResponse = { hits: FoodSummary[] };

export type SavedMealItemDto = { foodId: number; qty: number; unit: string; food: FoodSummary };
export type SavedMealDto = { id: number; name: string; items: SavedMealItemDto[] };

/** A chosen amount for a food. */
export type Amount = { qty: number; unit: string };
