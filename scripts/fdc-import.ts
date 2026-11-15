/**
 * USDA FoodData Central import.
 *
 *   npm run fdc:import -- [--only generic|branded|all] [--limit N] [--replace]
 *
 * Streams the CSVs straight out of the zips in data/ (unzip -p | csv-parse),
 * so nothing is extracted to disk. Generic (Foundation + SR Legacy) foods are
 * stored per 100 g with their household portions as food_servings; branded
 * foods are stored per label serving, one winner per UPC.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parse } from "csv-parse";
import { inArray, isNotNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { closeDb, getDb, isPglite } from "../lib/db/client";
import { foods, foodServings, type NewFood } from "../lib/db/schema";
import type * as schema from "../lib/db/schema";

// Both drivers extend this base; typing against it keeps every call driver-agnostic.
type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
import {
  brandedServing,
  normalizeUpc,
  nutrientsPerServing,
  portionLabel,
  stripEchoedSuffix,
  titleCaseIfShouting,
} from "../lib/nutrition/fdc-transform";

const BATCH = 500;
const PROGRESS_EVERY = 10_000;
const DATA_DIR = path.join(process.cwd(), "data");

// Nutrient ids we keep: energy (kcal, plus the two Atwater fallbacks), protein, carbs, fat, fiber.
const NUTRIENT_IDS = new Set(["1008", "2047", "2048", "1003", "1005", "1004", "1079"]);
type Nut = { kcal: number | null; atwG: number | null; atwS: number | null; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null };

const started = Date.now();
function log(msg: string): void {
  const s = ((Date.now() - started) / 1000).toFixed(1).padStart(7);
  console.log(`[${s}s] ${msg}`);
}

// ---------------------------------------------------------------------------
// CSV streaming
// ---------------------------------------------------------------------------

function findZip(kind: "branded" | "foundation" | "sr_legacy"): string {
  const re = new RegExp(`^FoodData_Central_${kind}_food_csv_.*\\.zip$`);
  const match = readdirSync(DATA_DIR).filter((f) => re.test(f)).sort().at(-1);
  if (!match) throw new Error(`No ${kind} zip found in ${DATA_DIR}`);
  return path.join(DATA_DIR, match);
}

function innerPath(zip: string, file: string): string {
  return `${path.basename(zip, ".zip")}/${file}`;
}

async function* csvRows<T>(zip: string, file: string, columns: boolean): AsyncGenerator<T> {
  const inner = innerPath(zip, file);
  const child = spawn("unzip", ["-p", zip, inner], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  child.stdout.on("error", () => undefined);
  let finished = false;
  const exit = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || finished) resolve();
      else reject(new Error(`unzip exited ${code} for ${inner}: ${stderr.trim()}`));
    });
  });
  // The rejection is observed by `await exit` below; this stops Node treating an early exit as unhandled.
  exit.catch(() => undefined);
  const parser = parse({ columns, bom: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true });
  child.stdout.pipe(parser);
  try {
    for await (const row of parser) yield row as T;
    await exit;
  } finally {
    // Early exit (limit reached): stop unzip instead of draining the rest of the file.
    finished = true;
    if (child.exitCode === null) child.kill();
  }
}

function num(s: string | undefined): number | null {
  if (s === undefined || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Streams food_nutrient.csv once and keeps the tracked nutrients for the wanted fdc_ids. */
async function loadNutrients(zip: string, wanted: ReadonlySet<number>): Promise<Map<number, Nut>> {
  const out = new Map<number, Nut>();
  let header: string[] | null = null;
  let iFdc = 1;
  let iNutrient = 2;
  let iAmount = 3;
  let rows = 0;
  for await (const row of csvRows<string[]>(zip, "food_nutrient.csv", false)) {
    if (!header) {
      header = row;
      iFdc = header.indexOf("fdc_id");
      iNutrient = header.indexOf("nutrient_id");
      iAmount = header.indexOf("amount");
      continue;
    }
    rows++;
    if (rows % 5_000_000 === 0) log(`  nutrients: ${rows.toLocaleString()} rows scanned`);
    const nutrientId = row[iNutrient] ?? "";
    if (!NUTRIENT_IDS.has(nutrientId)) continue;
    const fdcId = Number(row[iFdc]);
    if (!wanted.has(fdcId)) continue;
    const amount = num(row[iAmount]);
    if (amount === null) continue;
    let n = out.get(fdcId);
    if (!n) {
      n = { kcal: null, atwG: null, atwS: null, protein: null, carbs: null, fat: null, fiber: null };
      out.set(fdcId, n);
    }
    switch (nutrientId) {
      case "1008": n.kcal = amount; break;
      case "2047": n.atwG = amount; break;
      case "2048": n.atwS = amount; break;
      case "1003": n.protein = amount; break;
      case "1005": n.carbs = amount; break;
      case "1004": n.fat = amount; break;
      case "1079": n.fiber = amount; break;
    }
  }
  return out;
}

function per100(n: Nut | undefined) {
  return {
    kcal: n ? (n.kcal ?? n.atwG ?? n.atwS) : null,
    protein: n?.protein ?? null,
    carbs: n?.carbs ?? null,
    fat: n?.fat ?? null,
    fiber: n?.fiber ?? null,
  };
}

// ---------------------------------------------------------------------------
// Inserts
// ---------------------------------------------------------------------------

type PendingServing = { fdcId: number; label: string; grams: number };

class Inserter {
  inserted = 0;
  servingsInserted = 0;
  private batch: NewFood[] = [];
  private servings: PendingServing[] = [];

  constructor(
    private db: Database,
    private existing: Set<number>,
  ) {}

  async add(row: NewFood, servings: PendingServing[] = []): Promise<void> {
    this.batch.push(row);
    this.servings.push(...servings);
    if (this.batch.length >= BATCH) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.batch.length === 0) return;
    const returned = await this.db.insert(foods).values(this.batch).returning({ id: foods.id, fdcId: foods.fdcId });
    const idByFdc = new Map<number, number>();
    for (const r of returned) {
      if (r.fdcId !== null) {
        idByFdc.set(r.fdcId, r.id);
        this.existing.add(r.fdcId);
      }
    }
    const before = this.inserted;
    this.inserted += returned.length;
    if (Math.floor(before / PROGRESS_EVERY) !== Math.floor(this.inserted / PROGRESS_EVERY)) {
      log(`  inserted ${this.inserted.toLocaleString()} foods`);
    }
    const rows = this.servings.flatMap((s) => {
      const foodId = idByFdc.get(s.fdcId);
      return foodId === undefined ? [] : [{ foodId, label: s.label, grams: s.grams }];
    });
    for (let i = 0; i < rows.length; i += BATCH) {
      await this.db.insert(foodServings).values(rows.slice(i, i + BATCH));
    }
    this.servingsInserted += rows.length;
    this.batch = [];
    this.servings = [];
  }
}

// ---------------------------------------------------------------------------
// Generic pass (Foundation + SR Legacy)
// ---------------------------------------------------------------------------

type GenericSpec = { kind: "foundation" | "sr_legacy"; dataType: string; source: "fdc_foundation" | "fdc_sr" };
const GENERIC: GenericSpec[] = [
  { kind: "foundation", dataType: "foundation_food", source: "fdc_foundation" },
  { kind: "sr_legacy", dataType: "sr_legacy_food", source: "fdc_sr" },
];

async function importGeneric(db: Database, existing: Set<number>, spec: GenericSpec): Promise<{ inserted: number; servings: number; skippedExisting: number; noKcal: number }> {
  const zip = findZip(spec.kind);
  log(`${spec.source}: reading ${path.basename(zip)}`);

  const descriptions = new Map<number, string>();
  let skippedExisting = 0;
  for await (const row of csvRows<Record<string, string>>(zip, "food.csv", true)) {
    if (row.data_type !== spec.dataType) continue;
    const fdcId = Number(row.fdc_id);
    if (existing.has(fdcId)) {
      skippedExisting++;
      continue;
    }
    descriptions.set(fdcId, row.description ?? "");
  }
  log(`  ${descriptions.size.toLocaleString()} ${spec.dataType} rows to import (${skippedExisting} already present)`);
  if (descriptions.size === 0) return { inserted: 0, servings: 0, skippedExisting, noKcal: 0 };

  const wanted = new Set(descriptions.keys());
  const nutrients = await loadNutrients(zip, wanted);

  const units = new Map<string, string>();
  for await (const row of csvRows<Record<string, string>>(zip, "measure_unit.csv", true)) {
    if (row.id) units.set(row.id, row.name ?? "");
  }
  const portions = new Map<number, Map<string, number>>();
  for await (const row of csvRows<Record<string, string>>(zip, "food_portion.csv", true)) {
    const fdcId = Number(row.fdc_id);
    if (!wanted.has(fdcId)) continue;
    const grams = num(row.gram_weight);
    if (grams === null || grams <= 0) continue;
    const unitId = row.measure_unit_id ?? "";
    const label = portionLabel({
      amount: row.amount ?? "",
      measure_unit_name: unitId === "9999" ? null : (units.get(unitId) ?? null),
      portion_description: row.portion_description ?? "",
      modifier: row.modifier ?? "",
    });
    if (!label) continue;
    let byLabel = portions.get(fdcId);
    if (!byLabel) {
      byLabel = new Map();
      portions.set(fdcId, byLabel);
    }
    if (!byLabel.has(label)) byLabel.set(label, grams);
  }

  const inserter = new Inserter(db, existing);
  let noKcal = 0;
  for (const [fdcId, description] of descriptions) {
    const nut = nutrientsPerServing(per100(nutrients.get(fdcId)), 1);
    if (!nut) {
      noKcal++;
      continue;
    }
    const servings = [...(portions.get(fdcId) ?? [])].map(([label, grams]) => ({ fdcId, label, grams }));
    await inserter.add(
      {
        source: spec.source,
        fdcId,
        upc: null,
        name: titleCaseIfShouting(description),
        brand: null,
        servingLabel: "100 g",
        servingGrams: 100,
        kcal: nut.kcal,
        proteinG: nut.proteinG,
        carbsG: nut.carbsG,
        fatG: nut.fatG,
        fiberG: nut.fiberG,
        popularity: 0,
      },
      servings,
    );
  }
  await inserter.flush();
  log(`  ${spec.source}: inserted ${inserter.inserted.toLocaleString()} foods, ${inserter.servingsInserted.toLocaleString()} servings, ${noKcal} skipped (no kcal)`);
  return { inserted: inserter.inserted, servings: inserter.servingsInserted, skippedExisting, noKcal };
}

// ---------------------------------------------------------------------------
// Branded pass
// ---------------------------------------------------------------------------

type Winner = {
  fdcId: number;
  modified: string;
  upc: string | null;
  owner: string;
  brand: string;
  size: string;
  unit: string;
  household: string;
};

async function importBranded(db: Database, existing: Set<number>, limit: number | undefined) {
  const zip = findZip("branded");
  log(`fdc_branded: reading ${path.basename(zip)}`);

  // Pass 1: one winner per UPC (latest modified_date, then highest fdc_id). Map keeps first-seen order.
  const winners = new Map<string, Winner>();
  let rows = 0;
  let nonUs = 0;
  for await (const row of csvRows<Record<string, string>>(zip, "branded_food.csv", true)) {
    rows++;
    if (rows % 500_000 === 0) log(`  branded_food: ${rows.toLocaleString()} rows scanned`);
    if ((row.market_country ?? "") !== "United States") {
      nonUs++;
      continue;
    }
    const fdcId = Number(row.fdc_id);
    if (!Number.isFinite(fdcId)) continue;
    const upc = normalizeUpc(row.gtin_upc);
    const key = upc ?? `fdc:${fdcId}`;
    const modified = row.modified_date ?? "";
    const current = winners.get(key);
    if (current && (current.modified > modified || (current.modified === modified && current.fdcId >= fdcId))) continue;
    winners.set(key, {
      fdcId,
      modified,
      upc,
      owner: row.brand_owner ?? "",
      brand: row.brand_name ?? "",
      size: row.serving_size ?? "",
      unit: row.serving_size_unit ?? "",
      household: row.household_serving_fulltext ?? "",
    });
  }
  log(`  ${rows.toLocaleString()} rows, ${nonUs.toLocaleString()} non-US skipped, ${winners.size.toLocaleString()} UPC winners`);

  // Choose what to insert: first N winners in file order that are not already in the DB.
  const chosen = new Map<number, Winner>();
  let skippedExisting = 0;
  for (const w of winners.values()) {
    if (existing.has(w.fdcId)) {
      skippedExisting++;
      continue;
    }
    if (limit !== undefined && chosen.size >= limit) break;
    chosen.set(w.fdcId, w);
  }
  winners.clear();
  log(`  ${chosen.size.toLocaleString()} foods chosen (${skippedExisting.toLocaleString()} already present)`);
  if (chosen.size === 0) return { rows, nonUs, chosen: 0, inserted: 0, skippedExisting, noKcal: 0 };

  // Pass 2: nutrients for the chosen ids only.
  const nutrients = await loadNutrients(zip, new Set(chosen.keys()));
  log(`  nutrients loaded for ${nutrients.size.toLocaleString()} foods`);

  // Pass 3: descriptions, then insert as we go.
  const inserter = new Inserter(db, existing);
  let noKcal = 0;
  let seen = 0;
  for await (const row of csvRows<Record<string, string>>(zip, "food.csv", true)) {
    const fdcId = Number(row.fdc_id);
    const w = chosen.get(fdcId);
    if (!w) continue;
    seen++;
    const serving = brandedServing({ serving_size: w.size, serving_size_unit: w.unit, household_serving_fulltext: w.household });
    const nut = nutrientsPerServing(per100(nutrients.get(fdcId)), serving.perServingFactor);
    if (!nut) {
      noKcal++;
    } else {
      const unknownGrams = serving.perServingFactor === null;
      const brand = titleCaseIfShouting(w.brand || w.owner);
      await inserter.add({
        source: "fdc_branded",
        fdcId,
        upc: w.upc,
        name: titleCaseIfShouting(stripEchoedSuffix(row.description ?? "")),
        brand: brand || null,
        servingLabel: unknownGrams ? "100 g" : serving.label,
        servingGrams: unknownGrams ? 100 : serving.grams,
        kcal: nut.kcal,
        proteinG: nut.proteinG,
        carbsG: nut.carbsG,
        fatG: nut.fatG,
        fiberG: nut.fiberG,
        popularity: 0,
      });
    }
    if (seen === chosen.size) break;
  }
  await inserter.flush();
  log(`  fdc_branded: inserted ${inserter.inserted.toLocaleString()} foods, ${noKcal} skipped (no kcal)`);
  return { rows, nonUs, chosen: chosen.size, inserted: inserter.inserted, skippedExisting, noKcal };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      only: { type: "string", default: "all" },
      limit: { type: "string" },
      replace: { type: "boolean", default: false },
    },
  });
  const only = values.only;
  if (only !== "generic" && only !== "branded" && only !== "all") {
    throw new Error(`--only must be generic, branded or all (got "${only}")`);
  }
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) throw new Error(`--limit must be a non-negative integer`);

  const db = (await getDb()) as Database;
  log(`Importing into ${isPglite() ? `PGlite (${process.env.PGLITE_DIR ?? ".data/pglite"})` : "Neon"} (--only ${only}${limit !== undefined ? ` --limit ${limit}` : ""}${values.replace ? " --replace" : ""})`);

  if (values.replace) {
    await db.delete(foods).where(inArray(foods.source, ["fdc_branded", "fdc_foundation", "fdc_sr"]));
    log("Deleted existing FDC foods (--replace)");
  }

  const existingRows = await db.select({ fdcId: foods.fdcId }).from(foods).where(isNotNull(foods.fdcId));
  const existing = new Set<number>();
  for (const r of existingRows) if (r.fdcId !== null) existing.add(r.fdcId);
  log(`${existing.size.toLocaleString()} FDC foods already in the database`);

  const summary: string[] = [];
  if (only === "generic" || only === "all") {
    const t0 = Date.now();
    for (const spec of GENERIC) {
      const r = await importGeneric(db, existing, spec);
      summary.push(`${spec.source}: ${r.inserted} foods, ${r.servings} servings, ${r.skippedExisting} already present, ${r.noKcal} without kcal`);
    }
    summary.push(`generic pass: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  if (only === "branded" || only === "all") {
    const t0 = Date.now();
    const r = await importBranded(db, existing, limit);
    summary.push(
      `fdc_branded: ${r.inserted} foods inserted of ${r.chosen} chosen (${r.rows} rows read, ${r.nonUs} non-US, ${r.skippedExisting} already present, ${r.noKcal} without kcal)`,
    );
    summary.push(`branded pass: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  console.log("\nSummary");
  for (const line of summary) console.log(`  ${line}`);
  console.log(`  total: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
