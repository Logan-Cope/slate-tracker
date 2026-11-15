/**
 * Scores an extracted restaurant menu against a golden list of items with
 * published calories. Pure logic: no React, no DB, no network. Used by
 * scripts/eval-restaurants.ts and its unit tests.
 */
import { normalizeBrandText } from "@/lib/utils/text";

export type GoldenItem = { name: string; kcal: number; protein_g: number };

export type ScoredExtractedItem = { name: string; kcal: number; proteinG: number };

export type ScoreMatch = {
  golden: string;
  matched: string | null;
  kcalGolden: number;
  kcalFound: number | null;
  withinTolerance: boolean;
};

export type MenuScore = {
  found: number;
  total: number;
  matches: ScoreMatch[];
  /** Found items whose kcal is within tolerance of the golden value. */
  kcalWithinTolerance: number;
};

const TOLERANCE_RATE = 0.05;
const TOLERANCE_FLOOR_KCAL = 10;

/** Allowed absolute kcal difference: 5% of the golden value, never under 10 kcal. */
export function kcalTolerance(kcalGolden: number): number {
  return Math.max(TOLERANCE_FLOOR_KCAL, kcalGolden * TOLERANCE_RATE);
}

/** "chickfilachickensandwich" with brand "chickfila" becomes "chickensandwich"; a bare brand name stays as is. */
function stripBrand(key: string, brand: string): string {
  return brand !== "" && key.length > brand.length && key.startsWith(brand) ? key.slice(brand.length) : key;
}

/**
 * Names are compared after normalizeBrandText on both sides, with the chain's
 * own name removed from the front (the validator strips it from extracted
 * names; official item names sometimes carry it). An exact match wins;
 * otherwise the first extracted item whose name contains the whole golden name.
 */
function findMatch(goldenName: string, goldenKcal: number, extracted: ScoredExtractedItem[], brand: string): ScoredExtractedItem | null {
  const target = stripBrand(normalizeBrandText(goldenName), brand);
  if (target === "") return null;
  const normalized = extracted.map((it) => ({ it, key: stripBrand(normalizeBrandText(it.name), brand) }));
  const exact = normalized.find((e) => e.key === target);
  if (exact) return exact.it;
  // One direction only: the extracted name must contain the whole golden name, so a truncated
  // "Waffle" cannot claim "Waffle Potato Fries". Several sizes may contain it ("30 ct Grilled
  // Nuggets", "8 ct Grilled Nuggets"); the golden number names a size, so take the nearest.
  const candidates = normalized.filter((e) => e.key !== "" && e.key.includes(target));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, e) => (Math.abs(e.it.kcal - goldenKcal) < Math.abs(best.it.kcal - goldenKcal) ? e : best)).it;
}

export function scoreMenu(golden: { items: GoldenItem[] }, extracted: ScoredExtractedItem[], opts: { restaurantName?: string } = {}): MenuScore {
  const brand = opts.restaurantName ? normalizeBrandText(opts.restaurantName) : "";
  const matches: ScoreMatch[] = golden.items.map((g) => {
    const hit = findMatch(g.name, g.kcal, extracted, brand);
    if (!hit) return { golden: g.name, matched: null, kcalGolden: g.kcal, kcalFound: null, withinTolerance: false };
    return {
      golden: g.name,
      matched: hit.name,
      kcalGolden: g.kcal,
      kcalFound: hit.kcal,
      withinTolerance: Math.abs(hit.kcal - g.kcal) <= kcalTolerance(g.kcal),
    };
  });
  return {
    found: matches.filter((m) => m.matched !== null).length,
    total: matches.length,
    matches,
    kcalWithinTolerance: matches.filter((m) => m.withinTolerance).length,
  };
}
