/**
 * Server-side mappers from DB rows to the client DTOs in ./types.ts. Dates
 * become ISO strings so payloads are plain JSON.
 */
import type { FoodLogEntry, Target } from "@/lib/db/schema";
import type { FoodWithServings, SavedMeal } from "@/lib/db/queries/foods";
import type { DiaryDay, GoToFood } from "@/lib/db/queries/nutrition";
import type { DiaryDto, EntryDto, FoodSummary, GoToDto, SavedMealDto, TargetDto } from "./types";

export function toFoodSummary(food: FoodWithServings, profileId: number, last?: { qty: number; unit: string } | null): FoodSummary {
  return {
    id: food.id,
    source: food.source,
    name: food.name,
    brand: food.brand,
    servingLabel: food.servingLabel,
    servingGrams: food.servingGrams,
    kcal: food.kcal,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
    fiberG: food.fiberG,
    upc: food.upc,
    isMeal: food.isMeal,
    isCustom: food.source === "custom" && food.profileId === profileId,
    servings: food.servings.map((s) => ({ label: s.label, grams: s.grams })),
    lastQty: last?.qty ?? null,
    lastUnit: last?.unit ?? null,
  };
}

export function toEntryDto(e: FoodLogEntry): EntryDto {
  return {
    id: e.id,
    date: e.date,
    meal: e.meal,
    foodId: e.foodId,
    name: e.name,
    brand: e.brand,
    qty: e.qty,
    unit: e.unit,
    grams: e.grams,
    kcal: e.kcal,
    proteinG: e.proteinG,
    carbsG: e.carbsG,
    fatG: e.fatG,
    loggedAt: e.loggedAt.toISOString(),
  };
}

export function toTargetDto(t: Target | null): TargetDto | null {
  return t ? { kcal: t.kcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG } : null;
}

export function toDiaryDto(d: DiaryDay): DiaryDto {
  return { date: d.date, entries: d.entries.map(toEntryDto), target: toTargetDto(d.target) };
}

export function toGoToDto(g: GoToFood, profileId: number): GoToDto {
  return {
    food: toFoodSummary(g.food, profileId, { qty: g.lastQty, unit: g.lastUnit }),
    lastQty: g.lastQty,
    lastUnit: g.lastUnit,
    lastMeal: g.lastMeal,
    timesLogged: g.timesLogged,
    lastLoggedAt: g.lastLoggedAt.toISOString(),
    kcal: g.kcal,
    proteinG: g.proteinG,
  };
}

export function toSavedMealDto(m: SavedMeal, profileId: number): SavedMealDto {
  return {
    id: m.id,
    name: m.name,
    items: m.items.map((i) => ({ foodId: i.foodId, qty: i.qty, unit: i.unit, food: toFoodSummary(i.food, profileId) })),
  };
}
