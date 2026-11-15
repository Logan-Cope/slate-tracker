/**
 * Search-quality eval against the golden set in tests/fixtures/golden-queries.json.
 *
 *   npm run eval:search
 *
 * A query hits when any of the top 3 results matches every regex in `expect`.
 * Coverage misses (no food in the table matches at all) are reported apart
 * from ranking misses so missing data is not mistaken for bad ranking.
 * Always exits 0; prints PASS when the ranked hit rate (excluding coverage
 * misses) is at least 0.9.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db/client";
import { foods } from "../lib/db/schema";
import { naiveSearch, searchFoods, type FoodSearchHit } from "../lib/db/queries/food-search";

type Golden = { q: string; expect: { name?: string; brand?: string }; tier: "generic" | "branded" | "restaurant" };

const PROFILE_ID = 1;
const TOP_N = 3;
const PASS_RATE = 0.9;

// SR Legacy carries some brands inside the name with a null brand column
// ("Yogurt, Greek, Blueberry, CHOBANI"), so the brand regex also sees the name.
function matches(hit: FoodSearchHit, expect: Golden["expect"]): boolean {
  if (expect.name && !new RegExp(expect.name, "i").test(hit.name)) return false;
  // Brand must be the brand. SR Legacy rows carry it in the name ("McDONALD'S, french fries")
  // with brand null, so only then does the name count. A frozen "Chipotle Chicken Bowl" is not Chipotle.
  if (expect.brand) {
    const re = new RegExp(expect.brand, "i");
    const ok = hit.brand ? re.test(hit.brand) : re.test(hit.name);
    if (!ok) return false;
  }
  return true;
}

function describe(hit: FoodSearchHit | undefined): string {
  if (!hit) return "(no results)";
  return hit.brand ? `${hit.name} [${hit.brand}]` : hit.name;
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}% (${n}/${d})`;
}

async function main(): Promise<void> {
  const golden = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/golden-queries.json"), "utf8")) as Golden[];
  const db = await getDb();

  const visible = and(or(isNull(foods.profileId), eq(foods.profileId, PROFILE_ID)), isNull(foods.retiredAt));
  const results: { g: Golden; ranked: boolean; naive: boolean; covered: boolean; top: FoodSearchHit | undefined }[] = [];

  for (const g of golden) {
    const [ranked, naive] = await Promise.all([
      searchFoods(db, { q: g.q, profileId: PROFILE_ID, limit: TOP_N }),
      naiveSearch(db, { q: g.q, profileId: PROFILE_ID, limit: TOP_N }),
    ]);
    const conditions = [visible];
    if (g.expect.name) conditions.push(sql`${foods.name} ~* ${g.expect.name}`);
    // Mirrors matches(): the brand regex runs on the brand field, and on the name only when there is no brand (SR Legacy style).
    if (g.expect.brand) conditions.push(sql`(case when ${foods.brand} is not null and ${foods.brand} <> '' then ${foods.brand} ~* ${g.expect.brand} else ${foods.name} ~* ${g.expect.brand} end)`);
    const covered = (await db.select({ id: foods.id }).from(foods).where(and(...conditions)).limit(1)).length > 0;
    results.push({
      g,
      ranked: ranked.some((h) => matches(h, g.expect)),
      naive: naive.some((h) => matches(h, g.expect)),
      covered,
      top: ranked[0],
    });
  }

  const w = Math.max(...golden.map((g) => g.q.length), 5);
  console.log(`${"query".padEnd(w)}  ranked  naive  top result`);
  console.log(`${"-".repeat(w)}  ------  -----  ----------`);
  for (const r of results) {
    const mark = (hit: boolean) => (r.covered ? (hit ? "HIT " : "miss") : "n/a ");
    console.log(`${r.g.q.padEnd(w)}  ${mark(r.ranked).padEnd(6)}  ${mark(r.naive).padEnd(5)}  ${describe(r.top).slice(0, 70)}`);
  }

  const coverageMisses = results.filter((r) => !r.covered);
  const scored = results.filter((r) => r.covered);
  const rankedHits = scored.filter((r) => r.ranked).length;
  const naiveHits = scored.filter((r) => r.naive).length;
  const byTier = (tier: Golden["tier"]) => {
    const rows = scored.filter((r) => r.g.tier === tier);
    return pct(rows.filter((r) => r.ranked).length, rows.length);
  };

  console.log("");
  console.log(`Ranked top-${TOP_N} hit rate (excluding coverage misses): ${pct(rankedHits, scored.length)}`);
  console.log(`Naive  top-${TOP_N} hit rate (excluding coverage misses): ${pct(naiveHits, scored.length)}`);
  console.log(`Ranked by tier: generic ${byTier("generic")}, branded ${byTier("branded")}, restaurant ${byTier("restaurant")}`);
  console.log(`Ranked hit rate over all ${results.length} queries: ${pct(rankedHits, results.length)}`);
  console.log(`Coverage misses (${coverageMisses.length}): ${coverageMisses.map((r) => r.g.q).join(", ") || "none"}`);
  const rankingMisses = scored.filter((r) => !r.ranked);
  console.log(`Ranking misses (${rankingMisses.length}): ${rankingMisses.map((r) => r.g.q).join(", ") || "none"}`);
  console.log("");
  console.log(scored.length > 0 && rankedHits / scored.length >= PASS_RATE ? "PASS" : "FAIL");

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
});
