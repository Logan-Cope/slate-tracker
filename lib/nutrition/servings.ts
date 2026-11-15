/**
 * Serving-size conversions. Food nutrients are stored per label serving, so a
 * logged quantity in some unit becomes a factor applied to the per-serving values.
 */

export type FoodLike = {
  servingLabel: string;
  servingGrams: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
};

export type AltServing = { label: string; grams: number };

export const OZ_IN_GRAMS = 28.3495;

export type ComputedEntry = {
  qty: number;
  /** "serving" | "g" | "oz" | an AltServing.label */
  unit: string;
  /** Null only when unit is "serving" and servingGrams is unknown. */
  grams: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
};

export class UnitNotAvailableError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "UnitNotAvailableError";
  }
}

function scale(value: number | null, factor: number): number | null {
  return value === null ? null : value * factor;
}

function build(
  food: FoodLike,
  qty: number,
  unit: string,
  grams: number | null,
  factor: number,
): ComputedEntry {
  return {
    qty,
    unit,
    grams,
    kcal: food.kcal * factor,
    proteinG: food.proteinG * factor,
    carbsG: scale(food.carbsG, factor),
    fatG: scale(food.fatG, factor),
  };
}

/** Entry for a known gram amount; needs servingGrams to turn grams into a serving factor. */
function fromGrams(food: FoodLike, qty: number, unit: string, grams: number): ComputedEntry {
  if (food.servingGrams === null) {
    throw new UnitNotAvailableError(
      `Unit "${unit}" needs a gram weight, but "${food.servingLabel}" has none`,
    );
  }
  return build(food, qty, unit, grams, grams / food.servingGrams);
}

export function computeEntry(
  food: FoodLike,
  qty: number,
  unit: string,
  alts: AltServing[] = [],
): ComputedEntry {
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new RangeError(`qty must be a finite number greater than 0, got ${qty}`);
  }
  if (unit === "serving") return build(food, qty, unit, scale(food.servingGrams, qty), qty);
  if (unit === "g") return fromGrams(food, qty, unit, qty);
  if (unit === "oz") return fromGrams(food, qty, unit, qty * OZ_IN_GRAMS);

  const wanted = unit.toLowerCase();
  const alt = alts.find((a) => a.label.toLowerCase() === wanted);
  if (!alt) {
    throw new UnitNotAvailableError(`Unit "${unit}" is not available for "${food.servingLabel}"`);
  }
  return fromGrams(food, qty, unit, qty * alt.grams);
}

export type UnitOption = { unit: string; label: string; grams: number | null };

/** Units the UI can offer for this food, label serving first. */
export function availableUnits(food: FoodLike, alts: AltServing[] = []): UnitOption[] {
  const units: UnitOption[] = [
    { unit: "serving", label: food.servingLabel, grams: food.servingGrams },
  ];
  if (food.servingGrams !== null) {
    units.push(
      { unit: "g", label: "g", grams: 1 },
      { unit: "oz", label: "oz", grams: OZ_IN_GRAMS },
    );
  }
  const servingLabel = food.servingLabel.toLowerCase();
  for (const alt of alts) {
    if (alt.label.toLowerCase() === servingLabel) continue;
    units.push({ unit: alt.label, label: alt.label, grams: alt.grams });
  }
  return units;
}

const GRAM_WORDS = new Set(["g", "gram", "grams"]);
const OUNCE_WORDS = new Set(["oz", "ounce", "ounces"]);
const SERVING_WORDS = new Set(["serving", "servings", "x"]);

/** "cups" and "cup" compare equal; a bare "s" is left alone. */
function singular(word: string): string {
  return word.length > 1 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/** True when `label` contains `word` as a whole word (letters only, so "28g" yields "g"). */
function labelHasWord(label: string, word: string): boolean {
  const wanted = singular(word);
  const tokens = label.toLowerCase().match(/[a-z]+/g) ?? [];
  return tokens.some((token) => singular(token) === wanted);
}

/**
 * Maps a unit word from a search query (e.g. "cup", "grams") to a unit this
 * food accepts in computeEntry, or null when the food has no such unit.
 */
export function resolveUnitWord(
  word: string,
  food: FoodLike,
  alts: AltServing[] = [],
): string | null {
  const w = word.trim().toLowerCase();
  if (GRAM_WORDS.has(w)) return food.servingGrams === null ? null : "g";
  if (OUNCE_WORDS.has(w)) return food.servingGrams === null ? null : "oz";
  if (SERVING_WORDS.has(w)) return "serving";
  // The label serving wins over alternates: "2 cups" of a "1 cup" food is two servings,
  // not two half-cup alternates.
  if (labelHasWord(food.servingLabel, w)) return "serving";
  const alt = alts.find((a) => labelHasWord(a.label, w));
  return alt ? alt.label : null;
}
