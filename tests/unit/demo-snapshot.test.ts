/**
 * The hosted demo's cold start: a dumped, seeded database loads without initdb or seeding, and
 * shifting it forward keeps every row's place in the history relative to today.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { setupTestDb } from "./helpers/db";
import * as schema from "@/lib/db/schema";
import type { Database } from "@/lib/db/client";
import { seedDemo } from "@/lib/demo/seed";
import { daysBetween, shiftAllDates } from "@/lib/demo/snapshot";

let dump: Blob;
let close: () => Promise<void>;

type Edges = { lastLog: string; lastWeigh: string; lastWorkout: string; target: string; sets: number };

async function edges(db: Database): Promise<Edges> {
  const res = (await db.execute(sql`
    select (select max(date)::text from food_log) as "lastLog",
           (select max(date)::text from measurements) as "lastWeigh",
           (select max(started_at)::text from workouts) as "lastWorkout",
           (select min(effective_from)::text from targets) as target,
           (select count(*)::int from sets where completed_at < (select started_at from workouts w where w.id = (select workout_id from workout_exercises we where we.id = sets.workout_exercise_id))) as sets
  `)) as unknown as { rows: Edges[] };
  return res.rows[0]!;
}

let before: Edges;

beforeAll(async () => {
  const t = await setupTestDb();
  close = t.close;
  await seedDemo(t.db);
  before = await edges(t.db);
  const pglite = (globalThis as unknown as { __slateDb: { pglite: PGlite } }).__slateDb.pglite;
  dump = await pglite.dumpDataDir("gzip");
}, 60_000);
afterAll(() => close());

describe("demo snapshot", () => {
  it("counts whole days between two dates", () => {
    expect(daysBetween("2026-11-15", "2026-11-18")).toBe(3);
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
    expect(daysBetween("2026-11-15", "2026-11-15")).toBe(0);
  });

  it("loads from the dump and moves every date forward by the same number of days", async () => {
    const t0 = performance.now();
    const pglite = await PGlite.create({ extensions: { pg_trgm }, loadDataDir: dump });
    const loadMs = performance.now() - t0;
    const db = drizzle(pglite, { schema }) as unknown as Database;
    await shiftAllDates(db, 3);
    const after = await edges(db);
    expect(daysBetween(before.lastLog, after.lastLog)).toBe(3);
    expect(daysBetween(before.lastWeigh, after.lastWeigh)).toBe(3);
    expect(daysBetween(before.target, after.target)).toBe(3);
    expect(Date.parse(after.lastWorkout) - Date.parse(before.lastWorkout)).toBe(3 * 86_400_000);
    // Sets stay inside their workouts.
    expect(after.sets).toBe(0);
    expect(loadMs).toBeLessThan(5_000);
    await pglite.close();
  });
});
