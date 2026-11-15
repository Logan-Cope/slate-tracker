/**
 * Maps a raw food row from a JSON API (the barcode route returns
 * FoodWithServings as-is) into the client FoodSummary. Only the active
 * profile's custom foods are ever visible, so a non-null profileId means "mine".
 */
import type { FoodSummary } from "./types";

export type FoodJson = {
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
  profileId: number | null;
  servings: { label: string; grams: number }[];
};

export function foodSummaryFromJson(f: FoodJson): FoodSummary {
  return {
    id: f.id,
    source: f.source,
    name: f.name,
    brand: f.brand,
    servingLabel: f.servingLabel,
    servingGrams: f.servingGrams,
    kcal: f.kcal,
    proteinG: f.proteinG,
    carbsG: f.carbsG,
    fatG: f.fatG,
    fiberG: f.fiberG ?? null,
    upc: f.upc,
    isMeal: f.isMeal,
    isCustom: f.source === "custom" && f.profileId !== null,
    servings: (f.servings ?? []).map((s) => ({ label: s.label, grams: s.grams })),
    lastQty: null,
    lastUnit: null,
  };
}
