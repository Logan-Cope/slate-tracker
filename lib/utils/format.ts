/** Whole calories. */
export function fmtKcal(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Grams to one decimal when under 10, otherwise whole. */
export function fmtG(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.round(n).toString();
}

/** Quantities: trims trailing zeros, max two decimals. */
export function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return (Math.round(n * 100) / 100).toString();
}

/** Parses decimal text typed on a phone keypad; accepts "," as the separator. */
export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function fmtWeight(lb: number): string {
  return (Math.round(lb * 10) / 10).toString();
}
