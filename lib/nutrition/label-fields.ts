/**
 * Turns what the label reader transcribed from a Nutrition Facts photo into custom-food form values.
 * The model copies text exactly as printed ("<1g", "0,8", "2/3 cup (65g)"); every number is parsed
 * here, so the rules for "<1g", comma decimals and serving weights are code with tests, not prompt.
 */
import { z } from "zod";
import { fmtQty } from "@/lib/utils/format";

/** What the model returns: one serving's values, each as printed on the label, or null when the line is missing. */
export const LabelReadSchema = z.object({
  readable: z.boolean(),
  name: z.string().nullable(),
  brand: z.string().nullable(),
  serving_size: z.string().nullable(),
  calories: z.string().nullable(),
  protein: z.string().nullable(),
  total_carbohydrate: z.string().nullable(),
  total_fat: z.string().nullable(),
  dietary_fiber: z.string().nullable(),
});
export type LabelRead = z.infer<typeof LabelReadSchema>;

export type LabelDraft = {
  name: string | null;
  brand: string | null;
  servingLabel: string;
  servingGrams: number | null;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

const MAX_LABEL = 60;
const MAX_NAME = 120;
/** No single serving of food prints more than this; a bigger number is a misread. */
const MAX_KCAL = 5000;

/** "1,170" is a thousands separator; "0,8" and "1,4" are decimal commas. */
function normalizeNumber(text: string): string {
  return text.replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/(\d),(\d)/g, "$1.$2");
}

/**
 * One nutrient amount as printed, in grams (or kcal for calories). "<1g" and "less than 1g" read as 0,
 * milligrams convert to grams, and anything without a number is missing.
 */
export function parseAmount(text: string | null): number | null {
  if (text == null) return null;
  const t = normalizeNumber(text.trim().toLowerCase());
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  if (/^(<|less than)/.test(t)) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return /^\s*\d+(?:\.\d+)?\s*mg\b/.test(t) ? n / 1000 : n;
}

/** The gram amount in a piece of serving text ("37g", "40 g"), never mg or kg. */
function gramsIn(text: string): number | null {
  const m = normalizeNumber(text).match(/(\d+(?:\.\d+)?)\s*(?:g|grams?|gramas?)(?![a-z])/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanLabel(text: string): string {
  const spaced = text
    .replace(/(\d)([a-z])/gi, (_, d: string, l: string) => `${d} ${l}`)
    .replace(/\s+/g, " ")
    .trim();
  return spaced.length > MAX_LABEL ? spaced.slice(0, MAX_LABEL).trim() : spaced;
}

/**
 * Splits a printed serving size into the household measure and its gram weight:
 * "2/3 cup (65g)" is "2/3 cup" and 65; "28g aproximadamente (2 unidades)" is "2 unidades" and 28;
 * "1 bottle (355ml)" is "1 bottle" with no grams, since millilitres are not a weight.
 */
export function parseServing(text: string | null): { servingLabel: string; servingGrams: number | null } {
  const raw = (text ?? "").trim();
  if (raw === "") return { servingLabel: "1 serving", servingGrams: null };

  const paren = raw.match(/\(([^)]*)\)/);
  if (!paren) {
    const grams = gramsIn(raw);
    // A serving given only by weight ("30g", "Per 35 g") is labelled by that weight.
    const weightOnly = grams != null && !/\d/.test(normalizeNumber(raw).replace(/(\d+(?:\.\d+)?)\s*(?:g|grams?|gramas?)(?![a-z])/gi, ""));
    return { servingLabel: weightOnly ? `${grams}g` : cleanLabel(raw), servingGrams: grams };
  }

  const inner = paren[1] ?? "";
  const outer = raw.replace(paren[0], " ").trim();
  const innerGrams = gramsIn(inner);
  // Any later aside ("(makes about 1 cup)") is not part of the measure.
  if (innerGrams != null) return { servingLabel: cleanLabel(outer.replace(/\([^)]*\)/g, " ")), servingGrams: innerGrams };
  const outerGrams = gramsIn(outer);
  if (outerGrams != null && inner.trim() !== "") return { servingLabel: cleanLabel(inner), servingGrams: outerGrams };
  return { servingLabel: cleanLabel(outer || inner), servingGrams: outerGrams };
}

function cleanName(text: string | null): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? null : t.slice(0, MAX_NAME);
}

/**
 * Form values from one label read, or `{ ok: false }` when the photo is not a usable facts panel:
 * the model said so, calories are missing or impossible, or no macro line was read at all.
 */
export function labelDraft(read: LabelRead): { ok: true; draft: LabelDraft } | { ok: false } {
  if (!read.readable) return { ok: false };
  const kcal = parseAmount(read.calories);
  if (kcal == null || kcal > MAX_KCAL) return { ok: false };

  const proteinG = parseAmount(read.protein);
  const carbsG = parseAmount(read.total_carbohydrate);
  const fatG = parseAmount(read.total_fat);
  const fiberG = parseAmount(read.dietary_fiber);
  if (proteinG == null && carbsG == null && fatG == null && fiberG == null) return { ok: false };

  return {
    ok: true,
    draft: { name: cleanName(read.name), brand: cleanName(read.brand), ...parseServing(read.serving_size), kcal, proteinG, carbsG, fatG, fiberG },
  };
}

function text(n: number | null): string {
  return n == null ? "" : fmtQty(n);
}

/** The custom-food form's text fields for a draft; a missing line stays blank. */
export function draftFormValues(d: LabelDraft) {
  return {
    name: d.name ?? "",
    brand: d.brand ?? "",
    servingLabel: d.servingLabel,
    servingGrams: text(d.servingGrams),
    kcal: text(d.kcal),
    protein: text(d.proteinG),
    carbs: text(d.carbsG),
    fat: text(d.fatG),
    fiber: text(d.fiberG),
  };
}
