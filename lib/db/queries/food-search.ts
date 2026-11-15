/**
 * Ranked food search: Postgres full-text prefix matching plus a trigram typo
 * fallback, scored so the profile's own history comes first, then generic
 * (Foundation/SR/custom) foods, then branded. One SQL statement, raw rows
 * mapped by hand so it runs unchanged on PGlite and Neon.
 *
 * ts_rank_cd uses normalization 32 (rank / (rank + 1)) so repeated terms in
 * long branded names cannot outweigh the tier bonuses; unnormalized it grows
 * without bound (6.5 for "Peanut Butter Party Peanut Butter Ice Cream...").
 * The generic tier bonus only applies to rows matching the tsquery: the
 * trigram path is a typo fallback, and a fuzzy-only generic ("Cheese, swiss"
 * for "string cheese") must not outrank an exact branded match.
 *
 * The brand bonus compares brand and query with punctuation and spaces removed
 * (see normalizeBrandText): "chick fil-a spicy" never contained the literal
 * "chick-fil-a", so in production "Spicy Chicken Fillet Croissant" (chick:*
 * and fil:* through other words) outranked every Chick-Fil-A row.
 */
import { sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Database } from "@/lib/db/client";
import { normalizeBrandText } from "@/lib/utils/text";

// Re-exported so existing importers (and tests) keep working unchanged.
export { normalizeBrandText } from "@/lib/utils/text";

export type FoodSearchHit = {
  id: number;
  source: string;
  name: string;
  brand: string | null;
  servingLabel: string;
  servingGrams: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
  upc: string | null;
  inHistory: boolean;
  score: number;
};

type SearchOpts = { q: string; profileId: number; limit?: number };

/** "  Chobani  greek! " -> "chobani:* & greek:*". Null when no tokens survive. */
export function buildPrefixTsQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

export async function searchFoods(db: Database, opts: SearchOpts): Promise<FoodSearchHit[]> {
  const q = opts.q.trim();
  const prefix = buildPrefixTsQuery(q);
  if (!prefix) return [];
  const limit = opts.limit ?? 25;
  const doc = sql`(f.name || ' ' || coalesce(f.brand, ''))`;
  const tsq = sql`to_tsquery('english', ${prefix})`;
  // Same normalization as normalizeBrandText, applied to the stored brand in SQL.
  // Brands shorter than 3 characters once normalized are too likely to be substrings of anything.
  const normBrand = sql`regexp_replace(replace(lower(f.brand), '&', 'and'), '[^a-z0-9]', '', 'g')`;
  const normQ = normalizeBrandText(q);

  const rows = await execute(
    db,
    sql`
      select
        f.id, f.source, f.name, f.brand, f.serving_label, f.serving_grams,
        f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.upc,
        (s.food_id is not null) as in_history,
        (
          (case when s.food_id is not null then 3.0 else 0.0 end)
          + (case when f.source in ('fdc_foundation', 'fdc_sr', 'custom') and f.search @@ ${tsq} then 1.0 else 0.0 end)
          + ts_rank_cd(f.search, ${tsq}, 32)
          + similarity(${doc}, ${q})
          + (case when f.brand is not null and length(${normBrand}) >= 3 and position(${normBrand} in ${normQ}) > 0 then 0.5 else 0.0 end)
          + f.popularity
          - length(f.name) / 400.0
        )::float8 as score
      from foods f
      left join profile_food_stats s on s.food_id = f.id and s.profile_id = ${opts.profileId}
      where (f.profile_id is null or f.profile_id = ${opts.profileId})
        and f.retired_at is null
        and (f.search @@ ${tsq} or ${doc} % ${q})
      order by score desc, f.name asc
      limit ${limit}
    `,
  );
  return rows.map(toHit);
}

/** Baseline for the eval only: substring match on name or brand, alphabetical. */
export async function naiveSearch(db: Database, opts: SearchOpts): Promise<FoodSearchHit[]> {
  const q = opts.q.trim();
  if (!q) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await execute(
    db,
    sql`
      select
        f.id, f.source, f.name, f.brand, f.serving_label, f.serving_grams,
        f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.upc,
        false as in_history, 0::float8 as score
      from foods f
      where (f.profile_id is null or f.profile_id = ${opts.profileId})
        and f.retired_at is null
        and (f.name ilike ${pattern} or f.brand ilike ${pattern})
      order by f.name asc
      limit ${opts.limit ?? 25}
    `,
  );
  return rows.map(toHit);
}

type Row = Record<string, unknown>;

// Neon http and PGlite both answer { rows }, but tolerate a bare array too.
async function execute(db: Database, query: SQL): Promise<Row[]> {
  const result: unknown = await (db as PgDatabase<PgQueryResultHKT, Record<string, unknown>>).execute(query);
  if (Array.isArray(result)) return result as Row[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toHit(r: Row): FoodSearchHit {
  return {
    id: Number(r.id),
    source: String(r.source),
    name: String(r.name),
    brand: r.brand === null || r.brand === undefined ? null : String(r.brand),
    servingLabel: String(r.serving_label),
    servingGrams: numOrNull(r.serving_grams),
    kcal: numOrNull(r.kcal) ?? 0,
    proteinG: numOrNull(r.protein_g) ?? 0,
    carbsG: numOrNull(r.carbs_g),
    fatG: numOrNull(r.fat_g),
    upc: r.upc === null || r.upc === undefined ? null : String(r.upc),
    inHistory: r.in_history === true || r.in_history === "t" || r.in_history === "true",
    score: numOrNull(r.score) ?? 0,
  };
}
