/**
 * The tab reads through the production driver (neon-http, answered by PGlite):
 * sent as one batch they cost one HTTPS request and return exactly what the
 * same queries return when each is its own request, which is how production
 * read them before. So batching changes the request count and nothing a page shows.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { AVERY, setupTestDb } from "./helpers/db";
import { neonOverPglite, withoutBatch, type NeonRequest } from "./helpers/neon-over-pglite";
import type { Database } from "@/lib/db/client";
import type { PGlite } from "@electric-sql/pglite";
import { foods, targets } from "@/lib/db/schema";
import { readAll, runRead, type Read } from "@/lib/db/batch";
import { logFood, quickAdd, diaryScreenRead, dailyTotalsRead } from "@/lib/db/queries/nutrition";
import { setTarget, targetRead } from "@/lib/db/queries/targets";
import { upsertWeighIn, measurementsRead } from "@/lib/db/queries/metrics";
import { activeProgramRead, deleteWorkout, getActiveProgram, inProgressWorkoutRead, upsertWorkout, workoutsRead } from "@/lib/db/queries/training";
import { coachSummaryRead } from "@/lib/db/queries/coach";
import { restaurantsRead, upsertRestaurant } from "@/lib/db/queries/restaurants";
import { profilesRead } from "@/lib/db/queries/users";
import { shiftDate, todayLocal } from "@/lib/utils/date";

let db: Database;
let close: () => Promise<void>;
let neonDb: Database;
let requests: NeonRequest[];
const today = todayLocal();

beforeAll(async () => {
  ({ db, close } = await setupTestDb({ foods: true }));
  const pglite = (globalThis as unknown as { __slateDb: { pglite: PGlite } }).__slateDb.pglite;
  ({ db: neonDb, requests } = neonOverPglite(pglite));

  const someFoods = await db.select({ id: foods.id }).from(foods).limit(3);
  for (const date of [today, shiftDate(today, -1)]) {
    for (const [i, f] of someFoods.entries()) {
      await logFood(AVERY, { id: randomUUID(), date, meal: (["breakfast", "lunch", "dinner"] as const)[i]!, foodId: f.id, qty: 1.5, unit: "serving" });
    }
    await quickAdd(AVERY, { id: randomUUID(), date, meal: "snacks", name: "Quick", kcal: 200, proteinG: 10, carbsG: null });
  }
  await db.delete(targets).where(eq(targets.profileId, AVERY));
  await setTarget(AVERY, { kcal: 1500, proteinG: 100, effectiveFrom: shiftDate(today, -30) });
  await setTarget(AVERY, { kcal: 1400, proteinG: 110, effectiveFrom: shiftDate(today, 5) });
  for (let i = 20; i >= 0; i--) await upsertWeighIn(AVERY, { id: randomUUID(), date: shiftDate(today, -i), value: 150.3 - i * 0.17 });
  await upsertWorkout(await workoutDraft(new Date(Date.now() - 2 * 86_400_000), true));
  await upsertWorkout(await workoutDraft(new Date(Date.now() - 4 * 86_400_000), true));
  await upsertRestaurant({ name: "Chipotle", source: "menustat", menuAsOf: "2018-01-01" });
});
afterAll(() => close());

async function workoutDraft(startedAt: Date, finished: boolean) {
  const routine = (await getActiveProgram(AVERY))!.routines[0]!;
  return {
    id: randomUUID(),
    profileId: AVERY,
    routineId: routine.id,
    title: routine.name,
    startedAt,
    finishedAt: finished ? new Date(startedAt.getTime() + 3_600_000) : null,
    notes: "Felt strong",
    exercises: routine.exercises.slice(0, 3).map((e, i) => ({
      id: randomUUID(),
      exerciseId: e.exercise.id,
      position: i,
      supersetGroup: null,
      notes: null,
      sets: [0, 1].map((k) => ({
        id: randomUUID(),
        position: k,
        setType: "normal" as const,
        weightLb: 47.3,
        reps: 10,
        rpe: k === 0 ? 7.5 : null,
        completedAt: finished || k === 0 ? startedAt : null,
        isPr: k === 1,
      })),
    })),
  };
}

/** Runs a read on one driver: its value, how many queries it held and the Neon requests it cost. */
async function run<T>(d: Database, build: (d: Database) => Read<T>) {
  const read = build(d);
  const n0 = requests.length;
  const value = await runRead(d, read);
  return { value, queries: read.queries.length, requests: requests.slice(n0) };
}

/** A read three ways: one Neon batch, one Neon request per query (production before batching), and PGlite. */
async function threeWays<T>(build: (d: Database) => Read<T>) {
  return { batched: await run(neonDb, build), single: await run(withoutBatch(neonDb), build), pglite: await run(db, build) };
}

const cases: [string, (d: Database) => Read<unknown>][] = [
  ["targetRead", (d) => targetRead(d, AVERY, today)],
  ["diaryScreenRead", (d) => diaryScreenRead(d, AVERY, today)],
  ["dailyTotalsRead", (d) => dailyTotalsRead(d, AVERY, shiftDate(today, -6), today)],
  ["activeProgramRead", (d) => activeProgramRead(d, AVERY)],
  ["inProgressWorkoutRead (none open)", (d) => inProgressWorkoutRead(d, AVERY)],
  ["workoutsRead", (d) => workoutsRead(d, AVERY, { limit: 9 })],
  ["measurementsRead", (d) => measurementsRead(d, AVERY, "weight", { from: shiftDate(today, -400) })],
  ["coachSummaryRead", (d) => coachSummaryRead(d, AVERY, today)],
  ["restaurantsRead", (d) => restaurantsRead(d)],
  ["profilesRead", (d) => profilesRead(d)],
];

describe("neon-http batch", () => {
  it.each(cases)("%s: one request, same value as one request per query and as PGlite", async (_name, build) => {
    const { batched, single, pglite } = await threeWays(build);
    expect(batched.value).toEqual(single.value);
    expect(batched.value).toEqual(pglite.value);
    expect(batched.requests).toHaveLength(Math.min(1, batched.queries));
    expect(single.requests).toHaveLength(single.queries);
    expect(pglite.requests).toHaveLength(0);
  });

  it("an open workout reads the same through a batch", async () => {
    const draft = await workoutDraft(new Date(), false);
    await upsertWorkout(draft);
    try {
      const { batched, single, pglite } = await threeWays((d) => inProgressWorkoutRead(d, AVERY));
      expect(batched.value).toEqual(single.value);
      expect(batched.value).toEqual(pglite.value);
      expect(batched.value?.id).toBe(draft.id);
      expect(batched.value?.exercises.map((e) => e.sets.length)).toEqual([2, 2, 2]);
      expect(batched.requests).toEqual([{ statements: 3, batch: true }]);
      expect(single.requests).toHaveLength(3);
    } finally {
      await deleteWorkout(AVERY, draft.id);
    }
  });

  it("the Train tab's reads go out as one request of seven statements", async () => {
    const reads = (d: Database) => ({
      inProgress: inProgressWorkoutRead(d, AVERY),
      active: activeProgramRead(d, AVERY),
      recent: workoutsRead(d, AVERY, { limit: 9 }),
    });
    const n0 = requests.length;
    const batched = await readAll(neonDb, reads(neonDb));
    expect(requests.slice(n0)).toEqual([{ statements: 7, batch: true }]);
    expect(batched).toEqual(await readAll(withoutBatch(neonDb), reads(withoutBatch(neonDb))));
  });

  it("a failing statement fails the whole batch", async () => {
    const bad = (d: Database) => ({ ok: profilesRead(d), bad: { queries: [d.execute(sql`select * from no_such_table`)], assemble: () => null } });
    await expect(readAll(neonDb, bad(neonDb))).rejects.toThrow(/no_such_table/);
  });

  it("a failing batch names its statements in the error and keeps the driver's error as the cause", async () => {
    const bad = (d: Database) => ({ ok: profilesRead(d), bad: { queries: [d.execute(sql`select * from no_such_table where 1 = ${1}`)], assemble: () => null } });
    const err = await readAll(neonDb, bad(neonDb)).then(() => null, (e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toMatch(/^Failed batch of 2 statements: /);
    expect(err!.message).toContain("select * from no_such_table where 1 = $1");
    expect(err!.message).toMatch(/from "profiles"/);
    expect(err!.message).not.toContain("params");
    expect((err!.cause as Error).message).toMatch(/no_such_table/);
  });

});
