/**
 * Pulls an optional quantity and unit word off the front or back of a food
 * search string ("150g chicken breast", "quest bar x2"), leaving the food name.
 */

export type ParsedQuery = {
  raw: string;
  query: string;
  qty: number | null;
  unitWord: string | null;
};

/** Normalised (lowercase) unit word -> canonical unit word. */
export const UNIT_WORDS: Readonly<Record<string, string>> = {
  g: "g",
  gram: "g",
  grams: "g",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  ml: "ml",
  cup: "cup",
  cups: "cup",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  scoop: "scoop",
  scoops: "scoop",
  slice: "slice",
  slices: "slice",
  piece: "piece",
  pieces: "piece",
  pc: "piece",
  pcs: "piece",
  serving: "serving",
  servings: "serving",
  svg: "serving",
  srv: "serving",
  x: "serving",
  bar: "bar",
  bars: "bar",
};

function unitFor(word: string | undefined): string | undefined {
  return word === undefined ? undefined : UNIT_WORDS[word.toLowerCase()];
}

/** A number ("150", "1.5", "1,5", ".5", "1/2") optionally glued to letters ("150g", "2x", "7up"). */
const NUMBER_TOKEN = /^(\d+(?:[.,]\d+)?|[.,]\d+|\d+\/\d+)([a-z]+)?$/i;

type NumberMatch = { qty: number; glued: string | undefined };

function parseNumber(text: string): number {
  const [numerator, denominator] = text.split("/");
  if (denominator !== undefined) return Number(numerator) / Number(denominator);
  return Number(text.replace(",", "."));
}

/** Matches a positive, finite number; zero and "1/0" are not quantities. */
function matchNumber(token: string | undefined): NumberMatch | null {
  if (token === undefined) return null;
  const match = NUMBER_TOKEN.exec(token);
  if (!match) return null;
  const qty = parseNumber(match[1] ?? "");
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return { qty, glued: match[2] };
}

/** A quantity found at one end of the query, plus the tokens left over. */
type Amount = { qty: number; unitWord: string; rest: string[] };

function readLeading(tokens: string[]): Amount | null {
  const num = matchNumber(tokens[0]);
  if (!num) return null;
  if (num.glued !== undefined) {
    const unitWord = unitFor(num.glued);
    // "7up": a number glued to a non-unit word is part of the food name.
    if (unitWord === undefined) return null;
    return { qty: num.qty, unitWord, rest: tokens.slice(1) };
  }
  // Bare number: take a following unit word if there is one, else it counts servings.
  const next = unitFor(tokens[1]);
  if (next !== undefined) return { qty: num.qty, unitWord: next, rest: tokens.slice(2) };
  return { qty: num.qty, unitWord: "serving", rest: tokens.slice(1) };
}

function readTrailing(tokens: string[]): Amount | null {
  const last = tokens[tokens.length - 1];
  const prev = tokens[tokens.length - 2];
  if (last === undefined) return null;

  // "x2": multiplier written before the number.
  if (/^x/i.test(last)) {
    const times = matchNumber(last.slice(1));
    if (times && times.glued === undefined) {
      return { qty: times.qty, unitWord: "serving", rest: tokens.slice(0, -1) };
    }
  }

  const num = matchNumber(last);
  if (num) {
    if (num.glued !== undefined) {
      const unitWord = unitFor(num.glued);
      if (unitWord === undefined) return null;
      return { qty: num.qty, unitWord, rest: tokens.slice(0, -1) };
    }
    // "quest bar x 2" consumes the "x" too; "protein bar 2" is bare servings.
    const consumed = prev !== undefined && prev.toLowerCase() === "x" ? 2 : 1;
    return { qty: num.qty, unitWord: "serving", rest: tokens.slice(0, -consumed) };
  }

  // "chicken breast 150 g": unit word last, bare number before it.
  const unitWord = unitFor(last);
  const before = matchNumber(prev);
  if (unitWord !== undefined && before && before.glued === undefined) {
    return { qty: before.qty, unitWord, rest: tokens.slice(0, -2) };
  }
  return null;
}

export function parseQuantityQuery(input: string): ParsedQuery {
  const tokens = input.trim().split(/\s+/).filter((t) => t.length > 0);
  const amount = readLeading(tokens) ?? readTrailing(tokens);
  return {
    raw: input,
    query: (amount?.rest ?? tokens).join(" "),
    qty: amount?.qty ?? null,
    unitWord: amount?.unitWord ?? null,
  };
}
