import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AVERY, setupTestDb } from "./helpers/db";
import type { Database } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import {
  addRoutineExercise,
  createExercise,
  createProgram,
  createRoutine,
  deleteWorkout,
  exerciseHistory,
  finishWorkout,
  getActiveProgram,
  getInProgressWorkout,
  getRoutine,
  getWorkout,
  historyForRoutine,
  listExercises,
  listWorkouts,
  removeRoutineExercise,
  setActiveProgram,
  updateRoutineExercise,
  upsertWorkout,
  type WorkoutDraft,
} from "@/lib/db/queries/training";

let close: () => Promise<void>;
let db: Database;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(() => close());

const W1 = "aaaaaaaa-0000-4000-8000-000000000001";
const W2 = "aaaaaaaa-0000-4000-8000-000000000002";
const WE = (n: number) => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
const S = (n: number) => `cccccccc-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

describe("seeded program", () => {
  it("returns Total Body with routines A and B and their exercises in order", async () => {
    const active = await getActiveProgram(AVERY);
    expect(active?.program.name).toBe("Total Body");
    expect(active?.routines.map((r) => r.name)).toEqual(["Total Body A", "Total Body B"]);
    const a = active!.routines[0]!;
    expect(a.exercises[0]!.exercise.name).toBe("Hip Thrust Machine");
    expect(a.exercises[0]!.startWeightLb).toBe(95);
    expect(a.exercises).toHaveLength(5);
  });

  it("getRoutine includes the program and ordered exercises, and is profile-scoped", async () => {
    const active = await getActiveProgram(AVERY);
    const r = await getRoutine(AVERY, active!.routines[1]!.id);
    expect(r?.program.name).toBe("Total Body");
    expect(r?.exercises.map((e) => e.position)).toEqual([0, 1, 2, 3, 4]);
    expect(await getRoutine(2, active!.routines[1]!.id)).toBeNull();
  });
});

describe("workouts", () => {
  let routineId: number;
  let hipThrustId: number;
  let inclineId: number;

  beforeAll(async () => {
    const active = await getActiveProgram(AVERY);
    const a = active!.routines[0]!;
    routineId = a.id;
    hipThrustId = a.exercises[0]!.exerciseId;
    inclineId = a.exercises[1]!.exerciseId;
  });

  const draft = (overrides: Partial<WorkoutDraft> = {}): WorkoutDraft => ({
    id: W1,
    profileId: AVERY,
    routineId,
    title: "Total Body A",
    startedAt: new Date("2026-10-10T17:00:00Z"),
    finishedAt: null,
    notes: null,
    exercises: [
      {
        id: WE(1),
        exerciseId: hipThrustId,
        position: 0,
        supersetGroup: null,
        notes: null,
        sets: [
          { id: S(1), position: 0, setType: "normal", weightLb: 105, reps: 12, rpe: null, completedAt: new Date("2026-10-10T17:05:00Z"), isPr: false },
          { id: S(2), position: 1, setType: "failure", weightLb: 105, reps: 9, rpe: null, completedAt: new Date("2026-10-10T17:07:00Z"), isPr: false },
        ],
      },
      {
        id: WE(2),
        exerciseId: inclineId,
        position: 1,
        supersetGroup: null,
        notes: null,
        sets: [{ id: S(3), position: 0, setType: "normal", weightLb: 25, reps: null, rpe: null, completedAt: null, isPr: false }],
      },
    ],
    ...overrides,
  });

  it("upserts a workout and reads it back with exercises and sets", async () => {
    await upsertWorkout(draft());
    const w = await getWorkout(AVERY, W1);
    expect(w?.title).toBe("Total Body A");
    expect(w?.exercises).toHaveLength(2);
    expect(w?.exercises[0]!.sets).toHaveLength(2);
    expect(w?.exercises[0]!.sets[1]!.setType).toBe("failure");
  });

  it("is idempotent and applies edits: changed reps, removed set, added exercise note", async () => {
    const d = draft();
    d.exercises[0]!.sets[0]!.reps = 13;
    d.exercises[1]!.sets = [];
    d.exercises[1]!.notes = "shoulder felt fine";
    await upsertWorkout(d);
    await upsertWorkout(d);
    const w = await getWorkout(AVERY, W1);
    expect(w?.exercises[0]!.sets[0]!.reps).toBe(13);
    expect(w?.exercises[1]!.sets).toHaveLength(0);
    expect(w?.exercises[1]!.notes).toBe("shoulder felt fine");
  });

  it("removing an exercise from the draft deletes it and its sets", async () => {
    const d = draft();
    d.exercises = [d.exercises[0]!];
    await upsertWorkout(d);
    const w = await getWorkout(AVERY, W1);
    expect(w?.exercises).toHaveLength(1);
  });

  it("reports the unfinished workout as in progress, then finishes it", async () => {
    const open = await getInProgressWorkout(AVERY);
    expect(open?.id).toBe(W1);
    await finishWorkout(AVERY, W1, new Date("2026-10-10T17:40:00Z"));
    expect(await getInProgressWorkout(AVERY)).toBeNull();
    const w = await getWorkout(AVERY, W1);
    expect(w?.finishedAt?.toISOString()).toBe("2026-10-10T17:40:00.000Z");
  });

  it("exercise history returns completed performances newest first with their sets", async () => {
    const d = draft({ id: W2, startedAt: new Date("2026-10-12T17:00:00Z"), finishedAt: new Date("2026-10-12T17:30:00Z") });
    d.exercises = [d.exercises[0]!];
    d.exercises[0]!.id = WE(3);
    d.exercises[0]!.sets = [
      { id: S(4), position: 0, setType: "normal", weightLb: 110, reps: 11, rpe: null, completedAt: new Date("2026-10-12T17:05:00Z"), isPr: true },
    ];
    await upsertWorkout(d);
    const history = await exerciseHistory(AVERY, hipThrustId);
    expect(history.map((h) => h.workoutId)).toEqual([W2, W1]);
    expect(history[0]!.sets[0]!.weightLb).toBe(110);
    expect(history[0]!.routineId).toBe(routineId);
  });

  it("historyForRoutine groups history by exercise id", async () => {
    const map = await historyForRoutine(AVERY, routineId);
    expect(map.get(hipThrustId)?.length).toBe(2);
    expect(map.get(inclineId) ?? []).toHaveLength(0);
  });

  it("lists workouts newest first with summary counts", async () => {
    const list = await listWorkouts(AVERY, { limit: 10 });
    expect(list.map((w) => w.id)).toEqual([W2, W1]);
    expect(list[1]!.setCount).toBe(2);
    // The last upsert of W1 came from a fresh draft (12 and 9 reps).
    expect(list[1]!.volumeLb).toBe(105 * 12 + 105 * 9);
    expect(list[0]!.prCount).toBe(1);
  });

  it("does not expose another profile's workout", async () => {
    expect(await getWorkout(2, W1)).toBeNull();
    expect(await deleteWorkout(2, W1)).toBe(false);
  });

  it("refuses another profile's custom exercise in a draft", async () => {
    const [otherProfile] = await db.insert(profiles).values({ name: "Other" }).returning();
    const other = await createExercise(otherProfile!.id, { name: "Someone Else's Curl" });
    const d = draft({ id: "aaaaaaaa-0000-4000-8000-000000000010", startedAt: new Date("2026-10-15T17:00:00Z") });
    d.exercises = [{ ...d.exercises[0]!, id: WE(8), exerciseId: other.id, sets: [] }];
    await expect(upsertWorkout(d)).rejects.toThrow(/not available/);
    expect(await getWorkout(AVERY, d.id)).toBeNull();
  });

  it("refuses to re-parent exercises or sets that belong to another workout", async () => {
    const hijack = draft({ id: "aaaaaaaa-0000-4000-8000-000000000009", startedAt: new Date("2026-10-14T17:00:00Z") });
    // WE(1) and S(1) already belong to W1.
    await expect(upsertWorkout(hijack)).rejects.toThrow(/another workout/);
    hijack.exercises = [{ ...hijack.exercises[0]!, id: WE(9), sets: [{ ...hijack.exercises[0]!.sets[0]!, id: S(1) }] }];
    await expect(upsertWorkout(hijack)).rejects.toThrow(/another workout/);
    expect((await getWorkout(AVERY, W1))?.exercises[0]!.sets).toHaveLength(2);
  });

  it("deletes a workout", async () => {
    expect(await deleteWorkout(AVERY, W2)).toBe(true);
    expect(await listWorkouts(AVERY, { limit: 10 })).toHaveLength(1);
  });
});

describe("program builder", () => {
  it("creates a program, routine and exercises, edits and removes them", async () => {
    const program = await createProgram(AVERY, { name: "Upper Lower", notes: "test" });
    const routine = await createRoutine(AVERY, program.id, "Upper");
    const custom = await createExercise(AVERY, { name: "Cable Pullover", kind: "weight_reps", primaryMuscle: "back", equipment: "cable" });
    const re = await addRoutineExercise(AVERY, routine.id, { exerciseId: custom.id, targetSets: 3, repScheme: "8-12", restSeconds: 90 });
    expect(re.position).toBe(0);
    const updated = await updateRoutineExercise(AVERY, re.id, { coachNote: "slow eccentric", startWeightLb: 35 });
    expect(updated.coachNote).toBe("slow eccentric");
    // Another profile cannot touch this program's routines.
    await expect(createRoutine(2, program.id, "Hijack")).rejects.toThrow();
    await expect(updateRoutineExercise(2, re.id, { coachNote: "nope" })).rejects.toThrow();
    await expect(removeRoutineExercise(2, re.id)).rejects.toThrow();

    const all = await listExercises(AVERY);
    expect(all.some((e) => e.name === "Cable Pullover")).toBe(true);
    expect(await listExercises(2)).not.toContainEqual(expect.objectContaining({ name: "Cable Pullover" }));

    await setActiveProgram(AVERY, program.id);
    const active = await getActiveProgram(AVERY);
    expect(active?.program.name).toBe("Upper Lower");
    expect(active?.routines[0]!.exercises[0]!.exercise.name).toBe("Cable Pullover");

    await removeRoutineExercise(AVERY, re.id);
    expect((await getRoutine(AVERY, routine.id))?.exercises).toHaveLength(0);
  });
});
