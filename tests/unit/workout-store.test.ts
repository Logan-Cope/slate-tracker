import { describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import type { HistoricalPerformance } from "@/lib/training/ghost";
import {
  buildDraftFromRoutine,
  createWorkoutStore,
  cycleSetType,
  fromServerDraft,
  isDirty,
  pickUpNext,
  prKindsByWorkout,
  recomputePrs,
  reviveHistory,
  serializeHistory,
  summarize,
  toServerDraft,
  type ClientSet,
  type ClientWorkoutDraft,
  type ClientWorkoutExercise,
} from "@/lib/training/workout-store";

const WID = "aaaaaaaa-0000-4000-8000-000000000001";
const WE = (n: number) => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
const S = (n: number) => `cccccccc-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

function set(overrides: Partial<ClientSet> = {}): ClientSet {
  return { id: S(1), position: 0, setType: "normal", weightLb: null, reps: null, rpe: null, completedAt: null, isPr: false, ...overrides };
}

function exercise(overrides: Partial<ClientWorkoutExercise> = {}): ClientWorkoutExercise {
  return {
    id: WE(1),
    exerciseId: 10,
    position: 0,
    supersetGroup: null,
    notes: null,
    sets: [set({ id: S(1), position: 0 }), set({ id: S(2), position: 1, setType: "failure" })],
    ...overrides,
  };
}

function draft(overrides: Partial<ClientWorkoutDraft> = {}): ClientWorkoutDraft {
  return {
    id: WID,
    profileId: 1,
    routineId: 7,
    title: "Total Body A",
    startedAt: "2026-10-13T17:00:00.000Z",
    finishedAt: null,
    notes: null,
    exercises: [exercise()],
    ...overrides,
  };
}

function perf(overrides: Partial<HistoricalPerformance> = {}): HistoricalPerformance {
  return {
    workoutId: "w-old",
    routineId: 7,
    startedAt: new Date("2026-10-01T09:00:00Z"),
    sets: [{ position: 0, setType: "normal", weightLb: 100, reps: 10, completedAt: new Date("2026-10-01T09:05:00Z") }],
    ...overrides,
  };
}

function memoryStorage(): StateStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("buildDraftFromRoutine", () => {
  const routine = {
    id: 7,
    name: "Total Body A",
    exercises: [
      { exerciseId: 10, position: 0, targetSets: 2, supersetGroup: null },
      { exerciseId: 11, position: 1, targetSets: 1, supersetGroup: null },
      { exerciseId: 12, position: 2, targetSets: 3, supersetGroup: 1 },
    ],
  };

  it("creates one exercise per routine exercise with empty sets and the last set marked failure", () => {
    let n = 0;
    const d = buildDraftFromRoutine(routine, { id: WID, profileId: 1, startedAt: new Date("2026-10-13T17:00:00Z"), newId: () => `id-${++n}` });
    expect(d.id).toBe(WID);
    expect(d.title).toBe("Total Body A");
    expect(d.routineId).toBe(7);
    expect(d.finishedAt).toBeNull();
    expect(d.exercises.map((e) => e.sets.length)).toEqual([2, 1, 3]);
    expect(d.exercises[0]!.sets.map((s) => s.setType)).toEqual(["normal", "failure"]);
    // A single target set is never a failure set.
    expect(d.exercises[1]!.sets.map((s) => s.setType)).toEqual(["normal"]);
    expect(d.exercises[2]!.sets.map((s) => s.setType)).toEqual(["normal", "normal", "failure"]);
    expect(d.exercises[2]!.supersetGroup).toBe(1);
    const s0 = d.exercises[0]!.sets[0]!;
    expect(s0).toMatchObject({ position: 0, weightLb: null, reps: null, completedAt: null, isPr: false });
    const ids = d.exercises.flatMap((e) => [e.id, ...e.sets.map((s) => s.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("draft conversion", () => {
  it("round-trips server dates as ISO strings and forces the server's profile id", () => {
    const server = toServerDraft(
      draft({ exercises: [exercise({ sets: [set({ completedAt: "2026-10-13T17:05:00.000Z", weightLb: 105, reps: 12 })] })] }),
      42,
    );
    expect(server.profileId).toBe(42);
    expect(server.startedAt).toBeInstanceOf(Date);
    expect(server.exercises[0]!.sets[0]!.completedAt?.toISOString()).toBe("2026-10-13T17:05:00.000Z");
    const back = fromServerDraft(server);
    expect(back.startedAt).toBe("2026-10-13T17:00:00.000Z");
    expect(back.exercises[0]!.sets[0]!.completedAt).toBe("2026-10-13T17:05:00.000Z");
    expect(back.finishedAt).toBeNull();
  });

  it("serialises and revives history maps", () => {
    const map = new Map<number, HistoricalPerformance[]>([[10, [perf()]]]);
    const dto = serializeHistory(map);
    expect(dto["10"]![0]!.startedAt).toBe("2026-10-01T09:00:00.000Z");
    const revived = reviveHistory(dto);
    expect(revived[10]![0]!.startedAt.getTime()).toBe(new Date("2026-10-01T09:00:00Z").getTime());
    expect(revived[10]![0]!.sets[0]!.completedAt).toBeInstanceOf(Date);
  });
});

describe("cycleSetType", () => {
  it("cycles normal, failure, drop, warmup", () => {
    expect(cycleSetType("normal")).toBe("failure");
    expect(cycleSetType("failure")).toBe("drop");
    expect(cycleSetType("drop")).toBe("warmup");
    expect(cycleSetType("warmup")).toBe("normal");
  });
});

describe("pickUpNext", () => {
  const routines = [{ id: 1 }, { id: 2 }];
  it("starts with the first routine when there is no history", () => {
    expect(pickUpNext(routines, null)?.id).toBe(1);
  });
  it("alternates after the last routine used and wraps around", () => {
    expect(pickUpNext(routines, 1)?.id).toBe(2);
    expect(pickUpNext(routines, 2)?.id).toBe(1);
  });
  it("falls back to the first routine when the last one is not in the program", () => {
    expect(pickUpNext(routines, 99)?.id).toBe(1);
    expect(pickUpNext([], 1)).toBeNull();
  });
});

describe("summarize", () => {
  it("counts completed sets, volume and PRs", () => {
    const d = draft({
      exercises: [
        exercise({
          sets: [
            set({ id: S(1), position: 0, weightLb: 105, reps: 12, completedAt: "2026-10-13T17:05:00.000Z", isPr: true }),
            set({ id: S(2), position: 1, weightLb: 105, reps: 9, completedAt: "2026-10-13T17:07:00.000Z" }),
            set({ id: S(3), position: 2, weightLb: 110, reps: 8 }),
          ],
        }),
        exercise({ id: WE(2), exerciseId: 11, position: 1 }),
      ],
    });
    expect(summarize(d)).toEqual({ exerciseCount: 2, setsDone: 2, setsTotal: 5, volumeLb: 105 * 12 + 105 * 9, prCount: 1 });
  });
});

describe("PR detection across a workout", () => {
  it("gives the first completed set every kind when there is no history, then compares later sets to it", () => {
    const d = draft({
      exercises: [
        exercise({
          sets: [
            set({ id: S(1), position: 0, weightLb: 105, reps: 12, completedAt: "2026-10-13T17:05:00.000Z" }),
            set({ id: S(2), position: 1, weightLb: 110, reps: 8, completedAt: "2026-10-13T17:07:00.000Z" }),
          ],
        }),
      ],
    });
    const kinds = prKindsByWorkout(d, {});
    expect(kinds.get(S(1))).toEqual(["weight", "e1rm", "volume"]);
    // 110 beats 105 on weight, but e1rm 139 < 147 and volume 880 < 1260.
    expect(kinds.get(S(2))).toEqual(["weight"]);
  });

  it("orders by completion time, not row position", () => {
    const d = draft({
      exercises: [
        exercise({
          sets: [
            set({ id: S(1), position: 0, weightLb: 105, reps: 12, completedAt: "2026-10-13T17:09:00.000Z" }),
            set({ id: S(2), position: 1, weightLb: 110, reps: 12, completedAt: "2026-10-13T17:07:00.000Z" }),
          ],
        }),
      ],
    });
    const kinds = prKindsByWorkout(d, {});
    expect(kinds.get(S(2))).toEqual(["weight", "e1rm", "volume"]);
    expect(kinds.has(S(1))).toBe(false);
  });

  it("uses history as the bar to beat and ignores warmups and incomplete sets", () => {
    const history = { 10: [perf({ sets: [{ position: 0, setType: "normal", weightLb: 105, reps: 12, completedAt: new Date("2026-10-01T09:05:00Z") }] })] };
    const d = draft({
      exercises: [
        exercise({
          sets: [
            set({ id: S(1), position: 0, setType: "warmup", weightLb: 200, reps: 20, completedAt: "2026-10-13T17:01:00.000Z" }),
            set({ id: S(2), position: 1, weightLb: 105, reps: 12, completedAt: "2026-10-13T17:05:00.000Z" }),
            set({ id: S(3), position: 2, weightLb: 105, reps: 14, completedAt: "2026-10-13T17:07:00.000Z" }),
            set({ id: S(4), position: 3, weightLb: 300, reps: 30 }),
          ],
        }),
      ],
    });
    const kinds = prKindsByWorkout(d, history);
    expect(kinds.has(S(1))).toBe(false);
    expect(kinds.has(S(2))).toBe(false);
    expect(kinds.get(S(3))).toEqual(["e1rm", "volume"]);
    expect(kinds.has(S(4))).toBe(false);
  });

  it("recomputePrs flips isPr flags and keeps untouched references", () => {
    const d = draft({
      exercises: [
        exercise({
          sets: [
            set({ id: S(1), position: 0, weightLb: 105, reps: 12, completedAt: "2026-10-13T17:05:00.000Z" }),
            set({ id: S(2), position: 1, weightLb: 100, reps: 10, completedAt: "2026-10-13T17:07:00.000Z", isPr: true }),
          ],
        }),
        exercise({ id: WE(2), exerciseId: 11, position: 1 }),
      ],
    });
    const out = recomputePrs(d, {});
    expect(out.exercises[0]!.sets[0]!.isPr).toBe(true);
    expect(out.exercises[0]!.sets[1]!.isPr).toBe(false);
    expect(out.exercises[1]).toBe(d.exercises[1]);
    expect(recomputePrs(out, {})).toBe(out);
  });
});

describe("workout store", () => {
  const make = (d = draft(), storage = memoryStorage()) => ({ store: createWorkoutStore({ draft: d, history: {}, storage }), storage });

  it("completes a set with the given values, stamps completedAt, flags PRs and marks the draft dirty", () => {
    const { store } = make();
    expect(isDirty(store.getState())).toBe(false);
    store.getState().completeSet(WE(1), S(1), { weightLb: 105, reps: 12 });
    const s = store.getState().draft.exercises[0]!.sets[0]!;
    expect(s.weightLb).toBe(105);
    expect(s.reps).toBe(12);
    expect(s.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.isPr).toBe(true);
    expect(isDirty(store.getState())).toBe(true);
  });

  it("a discarded workout is never dirty again, so the sync hook stops saving it", () => {
    const { store } = make();
    store.getState().completeSet(WE(1), S(1), { weightLb: 105, reps: 12 });
    expect(isDirty(store.getState())).toBe(true);
    store.getState().discard();
    expect(store.getState().discarded).toBe(true);
    expect(isDirty(store.getState())).toBe(false);
    // a stray edit after discard (a debounced keystroke) must not revive it
    store.getState().setNotes("late note");
    expect(isDirty(store.getState())).toBe(false);
  });

  it("uncompletes a set and clears its PR flag but keeps the numbers", () => {
    const { store } = make();
    store.getState().completeSet(WE(1), S(1), { weightLb: 105, reps: 12 });
    store.getState().uncompleteSet(WE(1), S(1));
    const s = store.getState().draft.exercises[0]!.sets[0]!;
    expect(s.completedAt).toBeNull();
    expect(s.isPr).toBe(false);
    expect(s.weightLb).toBe(105);
  });

  it("edits values of a completed set and re-evaluates PRs", () => {
    const { store } = make();
    store.getState().completeSet(WE(1), S(1), { weightLb: 105, reps: null });
    expect(store.getState().draft.exercises[0]!.sets[0]!.isPr).toBe(false);
    store.getState().setSetValue(WE(1), S(1), { reps: 12 });
    expect(store.getState().draft.exercises[0]!.sets[0]!.isPr).toBe(true);
  });

  it("adds, cycles and removes sets with positions renumbered", () => {
    const { store } = make();
    store.getState().addSet(WE(1), S(9));
    expect(store.getState().draft.exercises[0]!.sets.map((s) => [s.id, s.position, s.setType])).toEqual([
      [S(1), 0, "normal"],
      [S(2), 1, "failure"],
      [S(9), 2, "normal"],
    ]);
    store.getState().cycleSetType(WE(1), S(9));
    expect(store.getState().draft.exercises[0]!.sets[2]!.setType).toBe("failure");
    store.getState().removeSet(WE(1), S(1));
    expect(store.getState().draft.exercises[0]!.sets.map((s) => [s.id, s.position])).toEqual([
      [S(2), 0],
      [S(9), 1],
    ]);
  });

  it("adds, swaps and removes exercises and edits notes", () => {
    const { store } = make();
    store.getState().addExercise(exercise({ id: WE(2), exerciseId: 11, position: 99 }));
    expect(store.getState().draft.exercises.map((e) => [e.id, e.position])).toEqual([
      [WE(1), 0],
      [WE(2), 1],
    ]);
    store.getState().swapExercise(WE(2), 12);
    expect(store.getState().draft.exercises[1]!.exerciseId).toBe(12);
    store.getState().setExerciseNotes(WE(2), "felt good");
    expect(store.getState().draft.exercises[1]!.notes).toBe("felt good");
    store.getState().removeExercise(WE(1));
    expect(store.getState().draft.exercises.map((e) => [e.id, e.position])).toEqual([[WE(2), 0]]);
    store.getState().setNotes("great session");
    store.getState().setFinished("2026-10-13T18:00:00.000Z");
    expect(store.getState().draft.notes).toBe("great session");
    expect(store.getState().draft.finishedAt).toBe("2026-10-13T18:00:00.000Z");
  });

  it("removeSet then addSetAt restores the identical draft, ids and positions included, and marks it dirty", () => {
    const { store } = make(
      draft({
        exercises: [
          exercise({ sets: [set({ id: S(1), position: 0 }), set({ id: S(2), position: 1 }), set({ id: S(3), position: 2, setType: "failure" })] }),
        ],
      }),
    );
    store.getState().completeSet(WE(1), S(2), { weightLb: 105, reps: 12 });
    store.getState().markSaved(store.getState().updatedAt);
    const before = store.getState().draft;
    const removed = before.exercises[0]!.sets[1]!;

    store.getState().removeSet(WE(1), S(2));
    expect(store.getState().draft.exercises[0]!.sets.map((s) => [s.id, s.position])).toEqual([
      [S(1), 0],
      [S(3), 1],
    ]);
    store.getState().markSaved(store.getState().updatedAt);
    expect(isDirty(store.getState())).toBe(false);

    store.getState().addSetAt(WE(1), removed);
    expect(store.getState().draft).toEqual(before);
    expect(isDirty(store.getState())).toBe(true);
  });

  it("addSetAt past the end appends, so an undo still lands after other sets went away", () => {
    const { store } = make();
    store.getState().addSetAt(WE(1), set({ id: S(9), position: 7 }));
    expect(store.getState().draft.exercises[0]!.sets.map((s) => [s.id, s.position])).toEqual([
      [S(1), 0],
      [S(2), 1],
      [S(9), 2],
    ]);
  });

  it("removeExercise then addExerciseAt restores the identical draft, ids and positions included, and marks it dirty", () => {
    const { store } = make(
      draft({
        exercises: [
          exercise(),
          exercise({ id: WE(2), exerciseId: 11, position: 1, sets: [set({ id: S(3), position: 0 }), set({ id: S(4), position: 1, setType: "failure" })] }),
          exercise({ id: WE(3), exerciseId: 12, position: 2, sets: [set({ id: S(5), position: 0 }), set({ id: S(6), position: 1, setType: "failure" })] }),
        ],
      }),
    );
    store.getState().completeSet(WE(2), S(3), { weightLb: 60, reps: 10 });
    store.getState().markSaved(store.getState().updatedAt);
    const before = store.getState().draft;
    const removed = before.exercises[1]!;

    store.getState().removeExercise(WE(2));
    expect(store.getState().draft.exercises.map((e) => [e.id, e.position])).toEqual([
      [WE(1), 0],
      [WE(3), 1],
    ]);
    store.getState().markSaved(store.getState().updatedAt);
    expect(isDirty(store.getState())).toBe(false);

    store.getState().addExerciseAt(removed);
    expect(store.getState().draft).toEqual(before);
    expect(isDirty(store.getState())).toBe(true);
  });

  it("markSaved clears dirty only when nothing changed since the save started", () => {
    const { store } = make();
    store.getState().completeSet(WE(1), S(1), { weightLb: 105, reps: 12 });
    const at = store.getState().updatedAt;
    store.getState().setSetValue(WE(1), S(2), { weightLb: 110 });
    store.getState().markSaved(at);
    expect(isDirty(store.getState())).toBe(true);
    store.getState().markSaved(store.getState().updatedAt);
    expect(isDirty(store.getState())).toBe(false);
  });

  it("history added later feeds PR detection", () => {
    const { store } = make();
    store.getState().completeSet(WE(1), S(1), { weightLb: 105, reps: 12 });
    expect(store.getState().draft.exercises[0]!.sets[0]!.isPr).toBe(true);
    store.getState().setHistory(10, [perf({ sets: [{ position: 0, setType: "normal", weightLb: 120, reps: 12, completedAt: new Date("2026-10-01T09:05:00Z") }] })]);
    expect(store.getState().draft.exercises[0]!.sets[0]!.isPr).toBe(false);
  });

  it("persists a dirty draft and, on rehydrate, a dirty local copy beats the server copy", async () => {
    const storage = memoryStorage();
    const first = createWorkoutStore({ draft: draft(), history: {}, storage });
    first.getState().completeSet(WE(1), S(1), { weightLb: 105, reps: 12 });
    expect(storage.map.has(`slate-workout-${WID}`)).toBe(true);

    // A fresh page load: the server still has the empty draft.
    const second = createWorkoutStore({ draft: draft(), history: {}, storage });
    expect(second.getState().draft.exercises[0]!.sets[0]!.completedAt).toBeNull();
    await second.persist.rehydrate();
    expect(second.getState().draft.exercises[0]!.sets[0]!.completedAt).not.toBeNull();
    expect(isDirty(second.getState())).toBe(true);
  });

  it("on rehydrate, a clean local copy yields to the server copy", async () => {
    const storage = memoryStorage();
    const first = createWorkoutStore({ draft: draft(), history: {}, storage });
    first.getState().completeSet(WE(1), S(1), { weightLb: 105, reps: 12 });
    first.getState().markSaved(first.getState().updatedAt);

    const fromServer = draft({ title: "Edited elsewhere" });
    const second = createWorkoutStore({ draft: fromServer, history: {}, storage });
    await second.persist.rehydrate();
    expect(second.getState().draft.title).toBe("Edited elsewhere");
    expect(second.getState().draft.exercises[0]!.sets[0]!.completedAt).toBeNull();
    expect(isDirty(second.getState())).toBe(false);
  });
});
