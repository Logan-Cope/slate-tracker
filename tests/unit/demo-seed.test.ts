/**
 * The demo's synthetic history: built through the app's own query functions on
 * a fresh database, ending today, with nothing missing from the food list.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { AVERY, setupTestDb } from "./helpers/db";
import type { Database } from "@/lib/db/client";
import { DEMO_DAYS, DEMO_PACKAGED, seedDemo } from "@/lib/demo/seed";
import { getTargetFor } from "@/lib/db/queries/targets";
import { shiftDate, todayLocal } from "@/lib/utils/date";

let db: Database;
let close: () => Promise<void>;
let seedMs = 0;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
  const t0 = performance.now();
  await seedDemo(db);
  seedMs = performance.now() - t0;
}, 60_000);
afterAll(() => close());

async function count(query: ReturnType<typeof sql>): Promise<number> {
  const res = (await db.execute(query)) as unknown as { rows: { n: number }[] };
  return res.rows[0]!.n;
}

describe("seedDemo", () => {
  const today = todayLocal();
  const first = shiftDate(today, -(DEMO_DAYS - 1));

  it("logs food on nearly every day of the window and nothing outside it", async () => {
    const days = await count(sql`select count(distinct date)::int as n from food_log where profile_id = ${AVERY}`);
    expect(days).toBeGreaterThanOrEqual(DEMO_DAYS - 3);
    expect(await count(sql`select count(*)::int as n from food_log where date < ${first} or date > ${today}`)).toBe(0);
  });

  it("builds go-to stats the way logging does", async () => {
    expect(await count(sql`select count(*)::int as n from profile_food_stats where profile_id = ${AVERY}`)).toBeGreaterThan(10);
  });

  it("weighs in most days, including today, on a downward trend", async () => {
    const res = (await db.execute(sql`select date, value from measurements where profile_id = ${AVERY} order by date`)) as unknown as { rows: { date: string; value: number }[] };
    expect(res.rows.length).toBeGreaterThan(DEMO_DAYS * 0.7);
    expect(res.rows.at(-1)!.date).toBe(today);
    expect(res.rows.at(-1)!.value).toBeLessThan(res.rows[0]!.value);
  });

  it("logs three finished workouts a week, alternating routines", async () => {
    const n = await count(sql`select count(*)::int as n from workouts where profile_id = ${AVERY} and finished_at is not null`);
    expect(n).toBeGreaterThanOrEqual(24);
    expect(n).toBeLessThanOrEqual(27);
  });

  it("replaces the placeholder target with one that covers the whole window", async () => {
    expect(await getTargetFor(AVERY, first)).toMatchObject({ kcal: 1700, proteinG: 110 });
    expect(await getTargetFor(AVERY, today)).toMatchObject({ kcal: 1700, proteinG: 110 });
  });

  it("loads the food list and the invented barcodes", async () => {
    expect(await count(sql`select count(*)::int as n from foods where source in ('fdc_sr', 'fdc_foundation')`)).toBeGreaterThan(1000);
    for (const p of DEMO_PACKAGED) expect(await count(sql`select count(*)::int as n from foods where upc = ${p.upc}`)).toBe(1);
  });

  it("seeds fast enough for a cold start", () => {
    expect(seedMs).toBeLessThan(15_000);
  });
});
