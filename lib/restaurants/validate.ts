/**
 * Gate between the menu extractor's JSON and the database. The extractor is a
 * model call, so its output is treated as untrusted: shape is checked with
 * zod, then each item is cleaned or dropped with a plain-sentence warning.
 * Pure logic: no React, no DB, no network.
 */
import { z } from "zod";

const MAX_ITEMS = 1000;
/** Chains publish 60 to 400 items; fewer than this means a page was missed. */
const MIN_PLAUSIBLE_ITEMS = 30;
const MAX_KCAL = 5000;
const MAX_DUPLICATE_LINES = 5;
/** Protein is 4 kcal per gram; the slack absorbs label rounding. */
const PROTEIN_SLACK_G = 5;

export const ExtractedMenuSchema = z
  .object({
    restaurant: z.string(),
    source_url: z.string(),
    items: z.array(
      z
        .object({
          name: z.string(),
          category: z.string().nullable().optional(),
          serving: z.string().nullable().optional(),
          kcal: z.number(),
          protein_g: z.number(),
          carbs_g: z.number().nullable().optional(),
          fat_g: z.number().nullable().optional(),
          fiber_g: z.number().nullable().optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type ExtractedMenu = z.infer<typeof ExtractedMenuSchema>;
type ExtractedItem = ExtractedMenu["items"][number];

/** Structurally identical to the queries module's MenuItemInput, kept here so this file stays DB-free. */
export type ValidatedItem = {
  name: string;
  servingLabel?: string | null;
  kcal: number;
  proteinG: number;
  carbsG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
};

export type ValidateResult =
  | { ok: true; items: ValidatedItem[]; warnings: string[] }
  | { ok: false; error: string };

export function toJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ExtractedMenuSchema) as Record<string, unknown>;
}

export function validateMenu(raw: unknown, opts: { restaurantName: string }): ValidateResult {
  const parsed = ExtractedMenuSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: describeIssue(parsed.error.issues[0]) };

  const warnings: string[] = [];
  const prefix = prefixPattern(opts.restaurantName);

  let items = parsed.data.items.map((it) => ({ ...it, name: cleanName(it.name, prefix) }));

  items = dropWith(items, (it) => it.name === "", (n) => `${plural(n, "item")} without a name ${were(n)} left out`, warnings);
  items = dropWith(items, hasImpossibleKcal, (n) => `${plural(n, "item")} with impossible calories ${were(n)} left out`, warnings);
  items = dropWith(
    items,
    hasNegativeMacro,
    (n) => `${plural(n, "item")} with ${n === 1 ? "a negative macro" : "negative macros"} ${were(n)} left out`,
    warnings,
  );

  const firstTooMuchProtein = items.find(hasTooMuchProtein);
  if (firstTooMuchProtein) {
    warnings.push(`"${firstTooMuchProtein.name}" has more protein than its calories allow; left out`);
    items = items.filter((it) => !hasTooMuchProtein(it));
  }

  items = dedupe(items, warnings);

  if (items.length > MAX_ITEMS) {
    items = items.slice(0, MAX_ITEMS);
    warnings.push(`Only the first ${MAX_ITEMS} items were kept`);
  }

  if (items.length > 0 && items.length < MIN_PLAUSIBLE_ITEMS) {
    warnings.push(`Only ${items.length} items found; the menu is probably incomplete. Try again, or give the nutrition page's address.`);
  }
  return { ok: true, items: items.map(toValidated), warnings };
}

function describeIssue(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return "The menu did not match the expected shape";
  const field = issue.path.length === 0 ? "The menu" : formatPath(issue.path);
  if (issue.code === "invalid_type") return `${field} is not ${withArticle(issue.expected)}`;
  return `${field}: ${issue.message}`;
}

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((acc, key) => {
    if (typeof key === "number") return `${acc}[${key}]`;
    return acc === "" ? String(key) : `${acc}.${String(key)}`;
  }, "");
}

function withArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

function prefixPattern(restaurantName: string): RegExp | null {
  const name = restaurantName.trim();
  if (name === "") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Restaurant name, then at least one space or punctuation mark, then the real name.
  return new RegExp(`^${escaped}[\\s\\p{P}]+`, "iu");
}

function cleanName(name: string, prefix: RegExp | null): string {
  const trimmed = name.trim();
  if (!prefix) return trimmed;
  return trimmed.replace(prefix, "").trim();
}

function hasImpossibleKcal(it: ExtractedItem): boolean {
  return !Number.isFinite(it.kcal) || it.kcal < 0 || it.kcal > MAX_KCAL;
}

function hasNegativeMacro(it: ExtractedItem): boolean {
  return [it.protein_g, it.carbs_g, it.fat_g, it.fiber_g].some((v) => typeof v === "number" && v < 0);
}

function hasTooMuchProtein(it: ExtractedItem): boolean {
  return it.protein_g > it.kcal / 4 + PROTEIN_SLACK_G;
}

function dropWith(
  items: ExtractedItem[],
  shouldDrop: (it: ExtractedItem) => boolean,
  warning: (count: number) => string,
  warnings: string[],
): ExtractedItem[] {
  const kept = items.filter((it) => !shouldDrop(it));
  const dropped = items.length - kept.length;
  if (dropped > 0) warnings.push(warning(dropped));
  return kept;
}

function dedupe(items: ExtractedItem[], warnings: string[]): ExtractedItem[] {
  const firstByKey = new Map<string, ExtractedItem>();
  const countByKey = new Map<string, number>();
  for (const it of items) {
    const key = it.name.toLowerCase();
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
    if (!firstByKey.has(key)) firstByKey.set(key, it);
  }
  const duplicated = [...firstByKey.values()].filter((it) => (countByKey.get(it.name.toLowerCase()) ?? 0) > 1);
  for (const it of duplicated.slice(0, MAX_DUPLICATE_LINES)) {
    warnings.push(`"${it.name}" appeared ${countByKey.get(it.name.toLowerCase())} times; kept the first`);
  }
  if (duplicated.length > MAX_DUPLICATE_LINES) warnings.push(`and ${duplicated.length - MAX_DUPLICATE_LINES} more`);
  return [...firstByKey.values()];
}

function toValidated(it: ExtractedItem): ValidatedItem {
  const serving = it.serving?.trim();
  return {
    name: it.name,
    servingLabel: serving ? serving : null,
    kcal: it.kcal,
    proteinG: it.protein_g,
    carbsG: it.carbs_g ?? null,
    fatG: it.fat_g ?? null,
    fiberG: it.fiber_g ?? null,
  };
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function were(n: number): string {
  return n === 1 ? "was" : "were";
}
