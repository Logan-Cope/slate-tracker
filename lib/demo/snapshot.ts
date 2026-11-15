/**
 * The hosted demo boots from a snapshot instead of seeding: `scripts/make-demo-snapshot.mts` runs the
 * migrations and the demo seed at build time and dumps PGlite's data directory. A cold start loads
 * that dump (no initdb, no seeding) and moves every date and time forward by the days since the
 * build, so the history still ends today.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";

export const SNAPSHOT_DIR = path.join(process.cwd(), ".data", "demo-snapshot");
export const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, "pgdata.tar.gz");
export const SNAPSHOT_META = path.join(SNAPSHOT_DIR, "meta.json");

export type SnapshotMeta = { today: string };

export function readSnapshot(): { data: Blob; meta: SnapshotMeta } | null {
  if (!existsSync(SNAPSHOT_FILE) || !existsSync(SNAPSHOT_META)) return null;
  const meta = JSON.parse(readFileSync(SNAPSHOT_META, "utf8")) as SnapshotMeta;
  return { data: new Blob([readFileSync(SNAPSHOT_FILE)]), meta };
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

type Column = { table_name: string; column_name: string; data_type: string };

/**
 * Moves every date and timestamp column in the public schema forward by `days`, so the snapshot
 * reads as if it were seeded today. Uniform, so every relation between rows (a workout and its
 * sets, an entry and its stats) is kept.
 */
export async function shiftAllDates(db: Database, days: number): Promise<void> {
  if (days === 0) return;
  const res = (await db.execute(sql`
    select table_name, column_name, data_type from information_schema.columns
    where table_schema = 'public' and data_type in ('date', 'timestamp with time zone', 'timestamp without time zone')
  `)) as unknown as { rows: Column[] };
  for (const c of res.rows) {
    const col = sql.identifier(c.column_name);
    const table = sql.identifier(c.table_name);
    const step = c.data_type === "date" ? sql`${col} + ${days}::int` : sql`${col} + make_interval(days => ${days}::int)`;
    await db.execute(sql`update ${table} set ${col} = ${step} where ${col} is not null`);
  }
}
