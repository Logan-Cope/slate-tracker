/**
 * Restaurant naming helpers. MenuStat spells some chains oddly ("Mcdonald's",
 * "Chick-Fil-A", "Dominos"); the alias map fixes the display name while the
 * slug stays derived from whatever name we were given, so lookups never
 * depend on the alias table.
 */
import { normalizeBrandText } from "@/lib/utils/text";

/** MenuStat spelling -> the name people know. Keys are matched case-insensitively. */
export const ALIASES: Readonly<Record<string, string>> = {
  "Chick-Fil-A": "Chick-fil-A",
  "Mcdonald's": "McDonald's",
  "Dunkin' Donuts": "Dunkin'",
  Dominos: "Domino's",
  "Ci Ci's Pizza": "Cicis Pizza",
  "Checker's Drive-In/Rallys": "Checkers & Rally's",
  "Steak 'N Shake": "Steak 'n Shake",
  "Einstein Bros": "Einstein Bros. Bagels",
  "PF Chang's": "P.F. Chang's",
  "7 Eleven": "7-Eleven",
  "Jersey Mike's Subs": "Jersey Mike's",
  "Potbelly Sandwich Shop": "Potbelly",
  "Jamba Juice": "Jamba",
};

const ALIASES_BY_LOWER: ReadonlyMap<string, string> = new Map(
  Object.entries(ALIASES).map(([key, value]) => [key.toLowerCase(), value]),
);

/** URL and lookup key: "Chick-fil-A" -> "chickfila", "Ben & Jerry's" -> "benandjerrys". */
export function restaurantSlug(name: string): string {
  return normalizeBrandText(name);
}

/** Trimmed MenuStat name, with known misspellings swapped for the display name. */
export function displayName(menustatName: string): string {
  const trimmed = menustatName.trim();
  return ALIASES_BY_LOWER.get(trimmed.toLowerCase()) ?? trimmed;
}
