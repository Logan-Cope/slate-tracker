/**
 * The Train tab's loaders send their queries together: the active program, the
 * open workout and the recent list each cost one wave, and the recent list's
 * counts come from SQL aggregates instead of loading every set.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AVERY, setupTestDb } from "./helpers/db";
import { measure } from "./helpers/query-trace";
import type { Database } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { getActiveProgram, getInProgressWorkout, getWorkout, listWorkouts, upsertWorkout, type WorkoutDraft } from "@/lib/db/queries/training";
import { fromServerDraft, summarize } from "@/lib/training/workout-store";
import { fmtVolume } from "@/components/training/format";

let db: Database;
let close: () => Promise<void>;
let exerciseIds: number[];

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
  const program = await getActiveProgram(AVERY);
  exerciseIds = program!.routines[0]!.exercises.map((e) => e.exerciseId);
});
afterAll(() => close());

async function newProfile(): Promise<number> {
  const [p] = await db.insert(profiles).values({ name: "Wave test" }).returning();
  return p!.id;
}

type SetSpec = { weightLb: number | null; reps: number | null; done: boolean; isPr?: boolean };

async function workout(profileId: number, startedAt: string, exercises: SetSpec[][], finished = true): Promise<WorkoutDraft> {
  const start = new Date(startedAt);
  const draft: WorkoutDraft = {
    id: randomUUID(),
    profileId,
    routineId: null,
    title: `Workout ${startedAt}`,
    startedAt: start,
    finishedAt: finished ? new Date(start.getTime() + 3_600_000) : null,
    notes: null,
    exercises: exercises.map((sets, i) => ({
      id: randomUUID(),
      exerciseId: exerciseIds[i]!,
      position: i,
      supersetGroup: null,
      notes: null,
      sets: sets.map((s, k) => ({
        id: randomUUID(),
        position: k,
        setType: "normal" as const,
        weightLb: s.weightLb,
        reps: s.reps,
        rpe: null,
        completedAt: s.done ? start : null,
        isPr: s.isPr ?? false,
      })),
    })),
  };
  await upsertWorkout(draft);
  return draft;
}

describe("listWorkouts", () => {
  it("counts completed sets only, for sets, volume and records", async () => {
    const p = await newProfile();
    const w = await workout(p, "2026-04-01T17:00:00Z", [
      [
        { weightLb: 47.5, reps: 8, done: true, isPr: true },
        { weightLb: 200, reps: 10, done: false, isPr: true },
      ],
      [{ weightLb: null, reps: 12, done: true }],
    ]);
    const [row] = await listWorkouts(p);
    expect(row).toMatchObject({ id: w.id, title: w.title, routineId: null, exerciseCount: 2, setCount: 2, volumeLb: 380, prCount: 1 });
    expect(row!.startedAt).toEqual(w.startedAt);
    expect(row!.finishedAt).toEqual(w.finishedAt);
  });

  it("shows the same volume as the workout summary for weights a 4-byte float cannot hold", async () => {
    const p = await newProfile();
    for (const [i, [weightLb, reps]] of ([[17.3, 5], [10.7, 5], [22.7, 5], [42.3, 3]] as const).entries())
      await workout(p, `2026-04-0${i + 1}T17:00:00Z`, [[{ weightLb, reps, done: true }]]);
    const rows = await listWorkouts(p);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      const stats = summarize(fromServerDraft((await getWorkout(p, row.id))!));
      expect(fmtVolume(row.volumeLb), row.title).toBe(fmtVolume(stats.volumeLb));
    }
  });

  it("gives zeros for a workout with no exercises", async () => {
    const p = await newProfile();
    await workout(p, "2026-04-02T17:00:00Z", []);
    const [row] = await listWorkouts(p);
    expect(row).toMatchObject({ exerciseCount: 0, setCount: 0, volumeLb: 0, prCount: 0 });
  });

  it("pages newest first with limit and before", async () => {
    const p = await newProfile();
    const a = await workout(p, "2026-04-01T17:00:00Z", [[{ weightLb: 10, reps: 1, done: true }]]);
    const b = await workout(p, "2026-04-03T17:00:00Z", [[{ weightLb: 10, reps: 2, done: true }]]);
    const c = await workout(p, "2026-04-05T17:00:00Z", [[{ weightLb: 10, reps: 3, done: true }]]);
    expect((await listWorkouts(p, { limit: 2 })).map((w) => w.id)).toEqual([c.id, b.id]);
    expect((await listWorkouts(p, { before: b.startedAt })).map((w) => w.id)).toEqual([a.id]);
    expect((await listWorkouts(p, { limit: 1, before: c.startedAt })).map((w) => [w.id, w.volumeLb])).toEqual([[b.id, 20]]);
  });

  it("lists only the profile's own workouts", async () => {
    const p = await newProfile();
    const q = await newProfile();
    const mine = await workout(p, "2026-04-01T17:00:00Z", [[{ weightLb: 10, reps: 1, done: true }]]);
    await workout(q, "2026-04-02T17:00:00Z", [[{ weightLb: 10, reps: 1, done: true }]]);
    expect((await listWorkouts(p)).map((w) => w.id)).toEqual([mine.id]);
  });

  it("is one query", async () => {
    const p = await newProfile();
    await workout(p, "2026-04-01T17:00:00Z", [[{ weightLb: 10, reps: 1, done: true }]]);
    const t = await measure(() => listWorkouts(p, { limit: 9 }));
    expect(t.queries).toBe(1);
  });
});

describe("getInProgressWorkout", () => {
  it("returns the newest open workout exactly as getWorkout reads it, in one wave of three queries", async () => {
    const p = await newProfile();
    await workout(p, "2026-04-01T17:00:00Z", [[{ weightLb: 10, reps: 1, done: true }]], false);
    const newest = await workout(p, "2026-04-02T17:00:00Z", [
      [
        { weightLb: 50, reps: 10, done: true },
        { weightLb: 50, reps: null, done: false },
      ],
      [{ weightLb: 20, reps: 12, done: false }],
    ], false);
    await workout(p, "2026-04-03T17:00:00Z", [[{ weightLb: 10, reps: 1, done: true }]], true);

    const t = await measure(() => getInProgressWorkout(p));
    expect(t.value).toEqual(await getWorkout(p, newest.id));
    expect(t.value?.exercises.map((e) => e.sets.length)).toEqual([2, 1]);
    expect(t.queries).toBe(3);
    expect(t.depth).toBe(1);
  });

  it("is null when every workout is finished, and never another profile's", async () => {
    const p = await newProfile();
    const q = await newProfile();
    await workout(p, "2026-04-01T17:00:00Z", [[{ weightLb: 10, reps: 1, done: true }]], true);
    await workout(q, "2026-04-02T17:00:00Z", [[{ weightLb: 10, reps: 1, done: true }]], false);
    expect(await getInProgressWorkout(p)).toBeNull();
  });
});

describe("getActiveProgram", () => {
  it("loads the program, its routines and their exercises in one wave of three queries", async () => {
    const t = await measure(() => getActiveProgram(AVERY));
    expect(t.value?.routines.map((r) => r.exercises.length)).toEqual([5, 5]);
    expect(t.value?.routines[1]!.exercises.map((e) => e.position)).toEqual([0, 1, 2, 3, 4]);
    expect(t.queries).toBe(3);
    expect(t.depth).toBe(1);
  });

  it("is null for a profile with no active program", async () => {
    expect(await getActiveProgram(await newProfile())).toBeNull();
  });
});
