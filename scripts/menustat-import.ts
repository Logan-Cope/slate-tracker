/**
 * MenuStat (2018) restaurant menu import.
 *
 *   npm run menustat:import -- [--dry-run] [--only <chain substring>] [--file <path>]
 *
 * Reads the cached NYC Open Data export (dataset qgc5-ecnb, year 2018) from
 * data/menustat-2018.json, transforms it with lib/restaurants/menustat.ts and
 * upserts one restaurant plus its menu per chain. A chain whose current
 * source is "web" is left alone: a seed never overwrites fresher data.
 *
 * The script never fetches. If the file is missing it prints the curl command
 * and exits 1.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { closeDb, getDb, isPglite } from "../lib/db/client";
import { getRestaurantBySlug, upsertMenu, upsertRestaurant } from "../lib/db/queries/restaurants";
import { restaurantSlug } from "../lib/restaurants/aliases";
import { transformMenuStat, type MenuStatChain, type MenuStatRow } from "../lib/restaurants/menustat";

const DEFAULT_FILE = path.join("data", "menustat-2018.json");
const SOURCE_URL = "https://www.menustat.org/";
const MENU_AS_OF = "2018-01-01";
const CURL = `curl -o data/menustat-2018.json "https://data.cityofnewyork.us/resource/qgc5-ecnb.json?year=2018&$limit=50000"`;

const started = Date.now();
function elapsed(): string {
  return ((Date.now() - started) / 1000).toFixed(1);
}
function log(msg: string): void {
  console.log(`[${elapsed().padStart(7)}s] ${msg}`);
}

function loadRows(file: string): MenuStatRow[] {
  if (!existsSync(file)) {
    console.error(`Missing ${file}. Fetch it first:\n\n  ${CURL}\n`);
    process.exit(1);
  }
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${file} is not a JSON array`);
  return parsed as MenuStatRow[];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      only: { type: "string" },
      file: { type: "string", default: DEFAULT_FILE },
    },
  });
  const dryRun = values["dry-run"];
  const only = values.only?.trim().toLowerCase() || undefined;
  const file = values.file;

  log(`Reading ${file}`);
  const rows = loadRows(file);
  const { chains: allChains, report } = transformMenuStat(rows);
  const chains = only ? allChains.filter((c) => c.name.toLowerCase().includes(only)) : allChains;
  log(
    `${report.rows.toLocaleString()} rows: ${report.keptRows.toLocaleString()} kept, ` +
      `${report.droppedNoCalories} without calories, ${report.droppedNoProtein} without protein, ` +
      `${report.droppedNoName} without a name, ${report.duplicates} duplicates; ` +
      `${allChains.length} chains${only ? ` (${chains.length} match --only "${values.only}")` : ""}`,
  );
  if (only && chains.length === 0) throw new Error(`No chain matches --only "${values.only}"`);

  if (dryRun) {
    log("Dry run: no DB writes");
    for (const c of chains) console.log(`  ${c.name}: ${c.items.length} items`);
    printSummary(report, { written: 0, skipped: 0, items: chains.reduce((n, c) => n + c.items.length, 0), dryRun: true });
    return;
  }

  await getDb();
  log(`Importing into ${isPglite() ? `PGlite (${process.env.PGLITE_DIR ?? ".data/pglite"})` : "Neon"}`);

  let written = 0;
  let skipped = 0;
  let items = 0;
  for (const chain of chains) {
    const r = await importChain(chain);
    if (r === null) skipped += 1;
    else {
      written += 1;
      items += chain.items.length;
    }
  }
  printSummary(report, { written, skipped, items, dryRun: false });
  await closeDb();
}

/** Returns null when the chain was skipped because a web import already owns it. */
async function importChain(chain: MenuStatChain): Promise<Awaited<ReturnType<typeof upsertMenu>> | null> {
  const existing = await getRestaurantBySlug(restaurantSlug(chain.name));
  if (existing?.source === "web") {
    log(`${chain.name}: kept web menu (${existing.itemCount} items as of ${existing.menuAsOf})`);
    return null;
  }
  const { id } = await upsertRestaurant({ name: chain.name, source: "menustat", sourceUrl: SOURCE_URL, menuAsOf: MENU_AS_OF });
  const r = await upsertMenu(id, chain.items, { retireMissing: true });
  log(`${chain.name}: ${chain.items.length} items (${r.inserted} inserted, ${r.updated} updated, ${r.retired} retired${r.revived ? `, ${r.revived} revived` : ""})`);
  return r;
}

function printSummary(
  report: ReturnType<typeof transformMenuStat>["report"],
  totals: { written: number; skipped: number; items: number; dryRun: boolean },
): void {
  console.log(`\nSummary${totals.dryRun ? " (dry run)" : ""}`);
  console.log(
    `  transform: ${report.rows.toLocaleString()} rows, ${report.keptRows.toLocaleString()} kept, ` +
      `${report.droppedNoCalories} no calories, ${report.droppedNoProtein} no protein, ${report.droppedNoName} no name, ${report.duplicates} duplicates`,
  );
  console.log(`  chains written: ${totals.written}, chains skipped (web): ${totals.skipped}, items: ${totals.items.toLocaleString()}`);
  console.log(`  total: ${elapsed()}s`);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
