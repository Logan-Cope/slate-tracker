/**
 * Submit-time checks for the amount sheets. Save stays enabled; when the
 * amount does not parse, the sheet marks the field and says this under it.
 */
import { parseDecimal } from "@/lib/utils/format";

export const AMOUNT_ERROR = "Enter an amount above 0";

export type QuickAddCheck = {
  kcal: string | null;
  protein: string | null;
  /** Parsed values once both fields pass, else null. */
  values: { kcal: number; proteinG: number } | null;
};

/**
 * Calories and protein for a quick add: each must parse (blank protein is 0)
 * and at least one must be above 0. An empty pair is reported under Calories.
 */
export function quickAddCheck(kcalText: string, proteinText: string): QuickAddCheck {
  const kcal = parseDecimal(kcalText);
  const proteinG = proteinText.trim() === "" ? 0 : parseDecimal(proteinText);
  const kcalError = kcal === null || (proteinG !== null && kcal <= 0 && proteinG <= 0) ? AMOUNT_ERROR : null;
  const proteinError = proteinG === null ? AMOUNT_ERROR : null;
  if (kcalError || proteinError || kcal === null || proteinG === null) return { kcal: kcalError, protein: proteinError, values: null };
  return { kcal: null, protein: null, values: { kcal, proteinG } };
}
