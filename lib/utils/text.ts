/**
 * Brand text as people type it: lowercase letters and digits only, with "&"
 * spelled "and" so "Ben & Jerry's" and "ben and jerrys" meet in the middle.
 * "Chick-Fil-A", "chick fil a" and "chickfila" all become "chickfila".
 */
export function normalizeBrandText(s: string): string {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^\p{L}\p{N}]+/gu, "");
}
