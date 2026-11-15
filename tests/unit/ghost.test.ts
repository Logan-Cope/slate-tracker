import { describe, expect, it } from "vitest";
import {
  ghostForSet,
  lastPerformance,
  progressionHint,
  type HistoricalPerformance,
  type HistoricalSet,
} from "@/lib/training/ghost";

function set(overrides: Partial<HistoricalSet> = {}): HistoricalSet {
  return {
    position: 0,
    setType: "normal",
    weightLb: 100,
    reps: 10,
    completedAt: new Date("2026-10-01T10:00:00Z"),
    ...overrides,
  };
}

function perf(overrides: Partial<HistoricalPerformance> = {}): HistoricalPerformance {
  return {
    workoutId: "w1",
    routineId: 1,
    startedAt: new Date("2026-10-01T09:00:00Z"),
    sets: [set()],
    ...overrides,
  };
}

describe("lastPerformance", () => {
  it("returns nulls for empty history", () => {
    expect(lastPerformance([], 1)).toEqual({ same: null, any: null });
  });

  it("picks the most recent performance by startedAt as `any`, whatever the input order", () => {
    const older = perf({ workoutId: "old", startedAt: new Date("2026-09-01T09:00:00Z") });
    const newest = perf({ workoutId: "new", startedAt: new Date("2026-10-05T09:00:00Z") });
    const middle = perf({ workoutId: "mid", startedAt: new Date("2026-09-20T09:00:00Z") });

    expect(lastPerformance([older, newest, middle], null).any).toBe(newest);
    expect(lastPerformance([newest, older, middle], null).any).toBe(newest);
  });

  it("returns the most recent performance of the requested routine as `same`", () => {
    const routineAOld = perf({ workoutId: "a-old", routineId: 1, startedAt: new Date("2026-09-01T09:00:00Z") });
    const routineANew = perf({ workoutId: "a-new", routineId: 1, startedAt: new Date("2026-09-15T09:00:00Z") });
    const routineB = perf({ workoutId: "b", routineId: 2, startedAt: new Date("2026-10-05T09:00:00Z") });

    const result = lastPerformance([routineAOld, routineB, routineANew], 1);

    expect(result.same).toBe(routineANew);
    expect(result.any).toBe(routineB);
  });

  it("never reports `same` for a null routine, even when ad-hoc workouts exist", () => {
    const adHoc = perf({ workoutId: "adhoc", routineId: null });

    const result = lastPerformance([adHoc], null);

    expect(result.same).toBeNull();
    expect(result.any).toBe(adHoc);
  });

  it("skips performances with no completed sets", () => {
    const done = perf({ workoutId: "done", routineId: 1, startedAt: new Date("2026-09-01T09:00:00Z") });
    const abandoned = perf({
      workoutId: "abandoned",
      routineId: 1,
      startedAt: new Date("2026-10-05T09:00:00Z"),
      sets: [set({ completedAt: null }), set({ position: 1, completedAt: null })],
    });
    const emptySets = perf({ workoutId: "empty", routineId: 1, startedAt: new Date("2026-10-06T09:00:00Z"), sets: [] });

    expect(lastPerformance([done, abandoned, emptySets], 1)).toEqual({ same: done, any: done });
    expect(lastPerformance([abandoned, emptySets], 1)).toEqual({ same: null, any: null });
  });

  it("does not reorder the caller's history array", () => {
    const older = perf({ workoutId: "old", startedAt: new Date("2026-09-01T09:00:00Z") });
    const newer = perf({ workoutId: "new", startedAt: new Date("2026-10-05T09:00:00Z") });
    const history = [older, newer];

    lastPerformance(history, 1);

    expect(history).toEqual([older, newer]);
  });
});

describe("ghostForSet", () => {
  it("falls back to the routine's start weight when there is no history", () => {
    expect(ghostForSet([], { routineId: 1, setIndex: 0, startWeightLb: 45 })).toEqual({
      weightLb: 45,
      reps: null,
      source: "start_weight",
    });
  });

  it("reports `none` when there is neither history nor a start weight", () => {
    expect(ghostForSet([], { routineId: 1, setIndex: 0, startWeightLb: null })).toEqual({
      weightLb: null,
      reps: null,
      source: "none",
    });
  });

  it("uses the same-routine set at the requested position", () => {
    const sameRoutine = perf({
      routineId: 1,
      sets: [
        set({ position: 0, weightLb: 95, reps: 12 }),
        set({ position: 1, weightLb: 95, reps: 9, setType: "failure" }),
      ],
    });

    expect(ghostForSet([sameRoutine], { routineId: 1, setIndex: 1, startWeightLb: 45 })).toEqual({
      weightLb: 95,
      reps: 9,
      source: "same_routine",
    });
  });

  it("falls back to any workout when this routine has never been performed", () => {
    const otherRoutine = perf({
      routineId: 2,
      sets: [set({ position: 0, weightLb: 80, reps: 11 })],
    });

    expect(ghostForSet([otherRoutine], { routineId: 1, setIndex: 0, startWeightLb: 45 })).toEqual({
      weightLb: 80,
      reps: 11,
      source: "any_workout",
    });
  });

  it("falls back to the last completed set of the chosen performance when the position is missing", () => {
    const sameRoutine = perf({
      routineId: 1,
      startedAt: new Date("2026-09-01T09:00:00Z"),
      sets: [
        set({ position: 0, weightLb: 95, reps: 12 }),
        set({ position: 1, weightLb: 95, reps: 9 }),
        set({ position: 2, weightLb: 100, reps: null, completedAt: null }),
      ],
    });
    // More recent, and it does have a completed set at position 2, but it is a different routine.
    const otherRoutine = perf({
      routineId: 2,
      startedAt: new Date("2026-10-05T09:00:00Z"),
      sets: [set({ position: 0 }), set({ position: 1 }), set({ position: 2, weightLb: 70, reps: 8 })],
    });

    expect(
      ghostForSet([otherRoutine, sameRoutine], { routineId: 1, setIndex: 2, startWeightLb: 45 }),
    ).toEqual({ weightLb: 95, reps: 9, source: "same_routine" });
  });
});

describe("progressionHint", () => {
  it("returns null with no history", () => {
    expect(progressionHint([], { routineId: 1 })).toBeNull();
  });

  it("suggests an increase once any completed working set reaches 14 reps", () => {
    const hit14 = perf({ routineId: 1, sets: [set({ position: 0, reps: 14 }), set({ position: 1, reps: 8 })] });
    const only13 = perf({ routineId: 1, sets: [set({ position: 0, reps: 13 }), set({ position: 1, reps: 8 })] });

    expect(progressionHint([hit14], { routineId: 1 })).toBe("increase");
    expect(progressionHint([only13], { routineId: 1 })).toBeNull();
  });

  it("ignores warmup sets and sets that were never completed", () => {
    const warmupOnly = perf({
      routineId: 1,
      sets: [set({ position: 0, setType: "warmup", reps: 20 }), set({ position: 1, reps: 10 })],
    });
    const abandoned = perf({
      routineId: 1,
      sets: [set({ position: 0, reps: 10 }), set({ position: 1, reps: 15, completedAt: null })],
    });

    expect(progressionHint([warmupOnly], { routineId: 1 })).toBeNull();
    expect(progressionHint([abandoned], { routineId: 1 })).toBeNull();
  });

  it("honours a custom reps threshold", () => {
    const twelve = perf({ routineId: 1, sets: [set({ position: 0, reps: 12 })] });

    expect(progressionHint([twelve], { routineId: 1, repsThreshold: 12 })).toBe("increase");
    expect(progressionHint([twelve], { routineId: 1, repsThreshold: 13 })).toBeNull();
  });

  it("judges the same routine when available, otherwise the latest workout", () => {
    const sameRoutineLow = perf({
      routineId: 1,
      startedAt: new Date("2026-09-01T09:00:00Z"),
      sets: [set({ position: 0, reps: 10 })],
    });
    const otherRoutineHigh = perf({
      routineId: 2,
      startedAt: new Date("2026-10-05T09:00:00Z"),
      sets: [set({ position: 0, reps: 15 })],
    });

    expect(progressionHint([otherRoutineHigh, sameRoutineLow], { routineId: 1 })).toBeNull();
    expect(progressionHint([otherRoutineHigh], { routineId: 1 })).toBe("increase");
  });
});
