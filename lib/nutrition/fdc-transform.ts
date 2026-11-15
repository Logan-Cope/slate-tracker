/**
 * Pure helpers for turning USDA FoodData Central CSV rows into `foods` rows.
 * No I/O, no DB; unit-tested in tests/unit/fdc-transform.test.ts.
 */

/** Digits only, leading zeros stripped. Null when empty or shorter than 6 digits. */
export function normalizeUpc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= 6 ? digits : null;
}

// Short all-caps tokens that read as acronyms even though they contain vowels.
const ACRONYMS = new Set([
  "USDA", "USA", "FDA", "OZ", "GMO", "DHA", "EPA", "IQF", "RTD", "RTE", "UHT", "ABV", "BCAA", "EAA", "IPA", "EVOO", "CBD",
]);

function isAcronym(token: string): boolean {
  const letters = token.replace(/[^\p{L}]/gu, "");
  if (letters.length === 0 || letters.length > 4) return false;
  if (letters !== letters.toUpperCase()) return false;
  return !/[AEIOUY]/.test(letters) || ACRONYMS.has(letters);
}

function titleCaseToken(token: string): string {
  return token.toLowerCase().replace(/(^|[^\p{L}'])(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

/** Title-cases ALL CAPS text (>= 80% uppercase letters); other text is only whitespace-collapsed. */
export function titleCaseIfShouting(s: string): string {
  const collapsed = s.replace(/\s+/g, " ").trim();
  const letters = collapsed.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return collapsed;
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  if (upper / letters.length < 0.8) return collapsed;
  return collapsed
    .split(" ")
    .map((token) => (isAcronym(token) ? token : titleCaseToken(token)))
    .join(" ");
}

/**
 * Branded descriptions in the 2026 FDC files echo the short description as a
 * trailing segment ("Diced Tomatoes For Chili, Chili"). Drop such segments when
 * every word in them already appears, as whole words, earlier in the name.
 */
export function stripEchoedSuffix(description: string): string {
  let text = description.trim();
  for (let i = 0; i < 4; i++) {
    const comma = text.lastIndexOf(",");
    if (comma <= 0) break;
    const head = text.slice(0, comma).trim();
    const tail = text.slice(comma + 1).trim();
    if (!tail) break;
    const escaped = tail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(head)) break;
    text = head;
  }
  return text;
}

const PLACEHOLDERS = new Set([
  "amount per serving", "per serving", "serving", "1 serving", "", "-", "none", "n/a", "false", "true", "null", "unknown",
]);
const GDSN_CODES: Record<string, string> = { ONZ: "oz", OZA: "fl oz", GRM: "g", MLT: "ml" };
const MEASURE_RE = /\d\s*(g|gr|grm|gram|grams|ml|mlt|milliliter|milliliters)\b/i;

function fmtNum(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function normalizeUnit(unit: string): "g" | "ml" | null {
  const u = unit.trim().toLowerCase();
  if (u === "g" || u === "grm" || u === "gram" || u === "grams") return "g";
  if (u === "ml" || u === "mlt" || u === "milliliter" || u === "milliliters") return "ml";
  return null;
}

export function brandedServing(row: {
  serving_size: string;
  serving_size_unit: string;
  household_serving_fulltext: string;
}): { label: string; grams: number | null; perServingFactor: number | null } {
  const size = Number.parseFloat(row.serving_size);
  const hasSize = Number.isFinite(size) && size > 0;
  const unit = normalizeUnit(row.serving_size_unit);
  const grams = hasSize && unit ? size : null;
  const factor = grams === null ? null : grams / 100;

  const household = row.household_serving_fulltext
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(ONZ|OZA|GRM|MLT)\b/g, (code) => GDSN_CODES[code] ?? code);

  if (!PLACEHOLDERS.has(household.toLowerCase())) {
    const suffix = grams !== null && !MEASURE_RE.test(household) ? ` (${fmtNum(grams)} ${unit})` : "";
    return { label: household + suffix, grams, perServingFactor: factor };
  }
  if (grams !== null) return { label: `${fmtNum(grams)} ${unit}`, grams, perServingFactor: factor };
  const rawUnit = row.serving_size_unit.trim();
  if (hasSize && rawUnit) return { label: `${fmtNum(size)} ${rawUnit}`, grams: null, perServingFactor: null };
  return { label: "100 g", grams: 100, perServingFactor: 1 };
}

export function portionLabel(row: {
  amount: string;
  measure_unit_name: string | null;
  portion_description: string;
  modifier: string;
}): string | null {
  const amount = Number.parseFloat(row.amount);
  const amountText = Number.isFinite(amount) && amount > 0 ? fmtNum(amount) : "";
  const unitName = row.measure_unit_name?.trim() ?? "";
  const unit = unitName && unitName.toLowerCase() !== "undetermined" ? unitName : "";
  const description = row.portion_description.replace(/\s+/g, " ").trim();
  const modifier = row.modifier.replace(/\s+/g, " ").trim();

  if (unit) {
    const extras = [description, modifier].filter(Boolean).join(", ");
    const head = [amountText, unit].filter(Boolean).join(" ");
    return extras ? `${head}, ${extras}` : head;
  }
  const text = [description, modifier].filter(Boolean).join(" ");
  if (!text) return null;
  return [amountText, text].filter(Boolean).join(" ");
}

export function nutrientsPerServing(
  per100: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null },
  factor: number | null,
): { kcal: number; proteinG: number; carbsG: number | null; fatG: number | null; fiberG: number | null } | null {
  if (per100.kcal === null || !Number.isFinite(per100.kcal)) return null;
  const f = factor ?? 1;
  const scale = (v: number | null): number | null => (v === null ? null : Math.round(v * f * 100) / 100);
  return {
    kcal: scale(per100.kcal) ?? 0,
    proteinG: scale(per100.protein) ?? 0,
    carbsG: scale(per100.carbs),
    fatG: scale(per100.fat),
    fiberG: scale(per100.fiber),
  };
}
