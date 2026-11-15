/**
 * Active-workout state: a serialisable draft (ISO strings, never Date objects,
 * so it survives localStorage and server-action boundaries unchanged), the pure
 * reducers that edit it, and a zustand store that persists it per workout.
 *
 * Client-safe: no React, no DB. Server code converts with to/fromServerDraft.
 */
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { SetType } from "@/lib/db/schema";
import type { WorkoutDraft, WorkoutSummary } from "@/lib/db/queries/training";
import type { HistoricalPerformance } from "@/lib/training/ghost";
import { detectPrs, type PrKind, type PriorSet } from "@/lib/training/prs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClientSet = {
  id: string;
  position: number;
  setType: SetType;
  weightLb: number | null;
  reps: number | null;
  rpe: number | null;
  completedAt: string | null;
  isPr: boolean;
};

export type ClientWorkoutExercise = {
  id: string;
  exerciseId: number;
  position: number;
  supersetGroup: number | null;
  notes: string | null;
  sets: ClientSet[];
};

export type ClientWorkoutDraft = {
  id: string;
  profileId: number;
  routineId: number | null;
  title: string;
  startedAt: string;
  finishedAt: string | null;
  notes: string | null;
  exercises: ClientWorkoutExercise[];
};

export type HistoryDTO = Record<
  string,
  {
    workoutId: string;
    routineId: number | null;
    startedAt: string;
    sets: { position: number; setType: SetType; weightLb: number | null; reps: number | null; completedAt: string | null }[];
  }[]
>;

export type ExerciseHistory = Record<number, HistoricalPerformance[]>;

export type WorkoutSummaryStats = {
  exerciseCount: number;
  setsDone: number;
  setsTotal: number;
  volumeLb: number;
  prCount: number;
};

// ---------------------------------------------------------------------------
// Conversion between server (Date) and client (ISO) shapes
// ---------------------------------------------------------------------------

export function fromServerDraft(d: WorkoutDraft): ClientWorkoutDraft {
  return {
    id: d.id,
    profileId: d.profileId,
    routineId: d.routineId,
    title: d.title,
    startedAt: d.startedAt.toISOString(),
    finishedAt: d.finishedAt ? d.finishedAt.toISOString() : null,
    notes: d.notes,
    exercises: d.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      position: e.position,
      supersetGroup: e.supersetGroup,
      notes: e.notes,
      sets: e.sets.map((s) => ({
        id: s.id,
        position: s.position,
        setType: s.setType,
        weightLb: s.weightLb,
        reps: s.reps,
        rpe: s.rpe,
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
        isPr: s.isPr,
      })),
    })),
  };
}

/** The server decides the profile; the client's copy of it is never trusted. */
export function toServerDraft(d: ClientWorkoutDraft, profileId: number): WorkoutDraft {
  return {
    id: d.id,
    profileId,
    routineId: d.routineId,
    title: d.title,
    startedAt: new Date(d.startedAt),
    finishedAt: d.finishedAt ? new Date(d.finishedAt) : null,
    notes: d.notes,
    exercises: d.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      position: e.position,
      supersetGroup: e.supersetGroup,
      notes: e.notes,
      sets: e.sets.map((s) => ({
        id: s.id,
        position: s.position,
        setType: s.setType,
        weightLb: s.weightLb,
        reps: s.reps,
        rpe: s.rpe,
        completedAt: s.completedAt ? new Date(s.completedAt) : null,
        isPr: s.isPr,
      })),
    })),
  };
}

export type WorkoutSummaryDTO = Omit<WorkoutSummary, "startedAt" | "finishedAt"> & { startedAt: string; finishedAt: string | null };

export function toSummaryDTO(w: WorkoutSummary): WorkoutSummaryDTO {
  return { ...w, startedAt: w.startedAt.toISOString(), finishedAt: w.finishedAt ? w.finishedAt.toISOString() : null };
}

export function serializeHistory(map: Map<number, HistoricalPerformance[]>): HistoryDTO {
  const out: HistoryDTO = {};
  for (const [exerciseId, perfs] of map) {
    out[String(exerciseId)] = perfs.map((p) => ({
      workoutId: p.workoutId,
      routineId: p.routineId,
      startedAt: p.startedAt.toISOString(),
      sets: p.sets.map((s) => ({
        position: s.position,
        setType: s.setType,
        weightLb: s.weightLb,
        reps: s.reps,
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
      })),
    }));
  }
  return out;
}

export function revivePerformances(perfs: HistoryDTO[string]): HistoricalPerformance[] {
  return perfs.map((p) => ({
    workoutId: p.workoutId,
    routineId: p.routineId,
    startedAt: new Date(p.startedAt),
    sets: p.sets.map((s) => ({ ...s, completedAt: s.completedAt ? new Date(s.completedAt) : null })),
  }));
}

export function reviveHistory(dto: HistoryDTO): ExerciseHistory {
  const out: ExerciseHistory = {};
  for (const [key, perfs] of Object.entries(dto)) out[Number(key)] = revivePerformances(perfs);
  return out;
}

// ---------------------------------------------------------------------------
// Building a workout from a routine
// ---------------------------------------------------------------------------

type RoutineShape = {
  id: number;
  name: string;
  exercises: { exerciseId: number; position: number; targetSets: number; supersetGroup: number | null }[];
};

/** The last of several target sets is the failure set, matching the program's rule. */
export function setTypeForIndex(index: number, targetSets: number): SetType {
  return targetSets > 1 && index === targetSets - 1 ? "failure" : "normal";
}

export function emptyClientSets(targetSets: number, newId: () => string): ClientSet[] {
  const n = Math.max(1, targetSets);
  return Array.from({ length: n }, (_, i) => ({
    id: newId(),
    position: i,
    setType: setTypeForIndex(i, n),
    weightLb: null,
    reps: null,
    rpe: null,
    completedAt: null,
    isPr: false,
  }));
}

export function buildDraftFromRoutine(
  routine: RoutineShape,
  opts: { id: string; profileId: number; startedAt: Date; newId: () => string },
): WorkoutDraft {
  const ordered = [...routine.exercises].sort((a, b) => a.position - b.position);
  return {
    id: opts.id,
    profileId: opts.profileId,
    routineId: routine.id,
    title: routine.name,
    startedAt: opts.startedAt,
    finishedAt: null,
    notes: null,
    exercises: ordered.map((re, position) => ({
      id: opts.newId(),
      exerciseId: re.exerciseId,
      position,
      supersetGroup: re.supersetGroup,
      notes: null,
      sets: emptyClientSets(re.targetSets, opts.newId).map((s) => ({ ...s, completedAt: null })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const TYPE_CYCLE: SetType[] = ["normal", "failure", "drop", "warmup"];

export function cycleSetType(t: SetType): SetType {
  const i = TYPE_CYCLE.indexOf(t);
  return TYPE_CYCLE[(i + 1) % TYPE_CYCLE.length] ?? "normal";
}

/** The routine after the one used last, wrapping around; the first when there is no usable history. */
export function pickUpNext<T extends { id: number }>(routines: T[], lastRoutineId: number | null): T | null {
  if (routines.length === 0) return null;
  const idx = lastRoutineId === null ? -1 : routines.findIndex((r) => r.id === lastRoutineId);
  if (idx < 0) return routines[0] ?? null;
  return routines[(idx + 1) % routines.length] ?? null;
}

export function summarize(draft: ClientWorkoutDraft): WorkoutSummaryStats {
  const all = draft.exercises.flatMap((e) => e.sets);
  const done = all.filter((s) => s.completedAt !== null);
  return {
    exerciseCount: draft.exercises.length,
    setsDone: done.length,
    setsTotal: all.length,
    volumeLb: done.reduce((sum, s) => sum + (s.weightLb ?? 0) * (s.reps ?? 0), 0),
    prCount: done.filter((s) => s.isPr).length,
  };
}

function historyPrior(perfs: HistoricalPerformance[] | undefined): PriorSet[] {
  if (!perfs) return [];
  return perfs.flatMap((p) =>
    p.sets.filter((s) => s.completedAt !== null).map((s) => ({ weightLb: s.weightLb, reps: s.reps, setType: s.setType })),
  );
}

/**
 * PR kinds for every completed set in the workout. Sets are judged in the
 * order they were completed, each against the exercise's history plus the
 * sets completed before it in this workout.
 */
export function prKindsByWorkout(draft: ClientWorkoutDraft, history: ExerciseHistory): Map<string, PrKind[]> {
  const out = new Map<string, PrKind[]>();
  const byExercise = new Map<number, ClientSet[]>();
  for (const we of draft.exercises) {
    for (const s of we.sets) {
      if (s.completedAt === null) continue;
      const list = byExercise.get(we.exerciseId) ?? [];
      list.push(s);
      byExercise.set(we.exerciseId, list);
    }
  }
  for (const [exerciseId, sets] of byExercise) {
    const prior = historyPrior(history[exerciseId]);
    const ordered = [...sets].sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? "") || a.position - b.position);
    for (const s of ordered) {
      const candidate = { weightLb: s.weightLb, reps: s.reps, setType: s.setType };
      const kinds = detectPrs(prior, candidate);
      if (kinds.length > 0) out.set(s.id, kinds);
      prior.push(candidate);
    }
  }
  return out;
}

/** Re-derives every isPr flag. Returns the same object when nothing changed. */
export function recomputePrs(draft: ClientWorkoutDraft, history: ExerciseHistory): ClientWorkoutDraft {
  const kinds = prKindsByWorkout(draft, history);
  let changed = false;
  const exercises = draft.exercises.map((we) => {
    let weChanged = false;
    const sets = we.sets.map((s) => {
      const isPr = s.completedAt !== null && kinds.has(s.id);
      if (isPr === s.isPr) return s;
      weChanged = true;
      return { ...s, isPr };
    });
    if (!weChanged) return we;
    changed = true;
    return { ...we, sets };
  });
  return changed ? { ...draft, exercises } : draft;
}

function renumber<T extends { position: number }>(list: T[]): T[] {
  return list.map((item, i) => (item.position === i ? item : { ...item, position: i }));
}

/** Puts an item back at its own position (clamped to the list), then renumbers. Undo of a remove. */
function insertAt<T extends { position: number }>(list: T[], item: T): T[] {
  const at = Math.max(0, Math.min(item.position, list.length));
  return renumber([...list.slice(0, at), item, ...list.slice(at)]);
}

function mapExercise(
  draft: ClientWorkoutDraft,
  weId: string,
  fn: (we: ClientWorkoutExercise) => ClientWorkoutExercise,
): ClientWorkoutDraft {
  return { ...draft, exercises: draft.exercises.map((we) => (we.id === weId ? fn(we) : we)) };
}

function mapSet(draft: ClientWorkoutDraft, weId: string, setId: string, fn: (s: ClientSet) => ClientSet): ClientWorkoutDraft {
  return mapExercise(draft, weId, (we) => ({ ...we, sets: we.sets.map((s) => (s.id === setId ? fn(s) : s)) }));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type WorkoutState = {
  draft: ClientWorkoutDraft;
  /** Prior performances per exercise id; feeds ghosts and PR checks. Not persisted. */
  history: ExerciseHistory;
  /** Last local edit (ms). */
  updatedAt: number;
  /** Last edit the server acknowledged (ms). Dirty when updatedAt is later. */
  savedAt: number;
  /** Set once the user discards the workout: nothing is saved after this, whatever else changes. */
  discarded: boolean;

  setSetValue: (weId: string, setId: string, patch: { weightLb?: number | null; reps?: number | null }) => void;
  completeSet: (weId: string, setId: string, values: { weightLb: number | null; reps: number | null }) => void;
  uncompleteSet: (weId: string, setId: string) => void;
  cycleSetType: (weId: string, setId: string) => void;
  addSet: (weId: string, setId: string) => void;
  removeSet: (weId: string, setId: string) => void;
  /** Puts a removed set back at its old position, ids and values intact (undo). */
  addSetAt: (weId: string, set: ClientSet) => void;
  addExercise: (we: ClientWorkoutExercise) => void;
  removeExercise: (weId: string) => void;
  /** Puts a removed exercise back at its old position with all its sets (undo). */
  addExerciseAt: (we: ClientWorkoutExercise) => void;
  swapExercise: (weId: string, exerciseId: number) => void;
  setExerciseNotes: (weId: string, notes: string | null) => void;
  setNotes: (notes: string | null) => void;
  setFinished: (finishedAt: string | null) => void;
  setHistory: (exerciseId: number, perfs: HistoricalPerformance[]) => void;
  markSaved: (updatedAt: number) => void;
  discard: () => void;
};

type Persisted = Pick<WorkoutState, "draft" | "updatedAt" | "savedAt">;

export function isDirty(state: Pick<WorkoutState, "updatedAt" | "savedAt"> & { discarded?: boolean }): boolean {
  if (state.discarded) return false;
  return state.updatedAt > state.savedAt;
}

export function storageKey(workoutId: string): string {
  return `slate-workout-${workoutId}`;
}

function isPersisted(x: unknown): x is Persisted {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Partial<Persisted>;
  return typeof p.draft === "object" && p.draft !== null && typeof p.updatedAt === "number" && typeof p.savedAt === "number";
}

export function createWorkoutStore(init: {
  draft: ClientWorkoutDraft;
  history: ExerciseHistory;
  storage?: StateStorage;
  now?: () => number;
}) {
  const now = init.now ?? (() => Date.now());
  return createStore<WorkoutState>()(
    persist(
      (set, get) => {
        // Strictly increasing so two edits in one millisecond never share a stamp.
        const edit = (fn: (draft: ClientWorkoutDraft) => ClientWorkoutDraft) => {
          const state = get();
          set({ draft: recomputePrs(fn(state.draft), state.history), updatedAt: Math.max(now(), state.updatedAt + 1) });
        };
        return {
          draft: init.draft,
          history: init.history,
          updatedAt: 0,
          savedAt: 0,
          discarded: false,

          setSetValue: (weId, setId, patch) => edit((d) => mapSet(d, weId, setId, (s) => ({ ...s, ...patch }))),
          completeSet: (weId, setId, values) =>
            edit((d) =>
              mapSet(d, weId, setId, (s) => ({ ...s, weightLb: values.weightLb, reps: values.reps, completedAt: new Date(now()).toISOString() })),
            ),
          uncompleteSet: (weId, setId) => edit((d) => mapSet(d, weId, setId, (s) => ({ ...s, completedAt: null, isPr: false }))),
          cycleSetType: (weId, setId) => edit((d) => mapSet(d, weId, setId, (s) => ({ ...s, setType: cycleSetType(s.setType) }))),
          addSet: (weId, setId) =>
            edit((d) =>
              mapExercise(d, weId, (we) => ({
                ...we,
                sets: [
                  ...we.sets,
                  { id: setId, position: we.sets.length, setType: "normal", weightLb: null, reps: null, rpe: null, completedAt: null, isPr: false },
                ],
              })),
            ),
          removeSet: (weId, setId) => edit((d) => mapExercise(d, weId, (we) => ({ ...we, sets: renumber(we.sets.filter((s) => s.id !== setId)) }))),
          addSetAt: (weId, set) => edit((d) => mapExercise(d, weId, (we) => ({ ...we, sets: insertAt(we.sets, set) }))),
          addExercise: (we) => edit((d) => ({ ...d, exercises: renumber([...d.exercises, we]) })),
          removeExercise: (weId) => edit((d) => ({ ...d, exercises: renumber(d.exercises.filter((we) => we.id !== weId)) })),
          addExerciseAt: (we) => edit((d) => ({ ...d, exercises: insertAt(d.exercises, we) })),
          swapExercise: (weId, exerciseId) => edit((d) => mapExercise(d, weId, (we) => ({ ...we, exerciseId }))),
          setExerciseNotes: (weId, notes) => edit((d) => mapExercise(d, weId, (we) => ({ ...we, notes }))),
          setNotes: (notes) => edit((d) => ({ ...d, notes })),
          setFinished: (finishedAt) => edit((d) => ({ ...d, finishedAt })),
          setHistory: (exerciseId, perfs) => {
            const state = get();
            const history = { ...state.history, [exerciseId]: perfs };
            set({ history, draft: recomputePrs(state.draft, history) });
          },
          markSaved: (updatedAt) => set((s) => ({ savedAt: Math.max(s.savedAt, updatedAt) })),
          discard: () => set({ discarded: true }),
        };
      },
      {
        name: storageKey(init.draft.id),
        storage: createJSONStorage(() => init.storage ?? localStorage),
        partialize: (s): Persisted => ({ draft: s.draft, updatedAt: s.updatedAt, savedAt: s.savedAt }),
        // The page renders the server copy first; rehydrate() runs after mount.
        skipHydration: true,
        // A local copy only wins when it holds edits the server never received.
        merge: (persisted, current) => {
          if (!isPersisted(persisted)) return current;
          if (persisted.draft.id !== current.draft.id) return current;
          if (!isDirty(persisted)) return current;
          return { ...current, draft: recomputePrs(persisted.draft, current.history), updatedAt: persisted.updatedAt, savedAt: persisted.savedAt };
        },
      },
    ),
  );
}

export type WorkoutStore = ReturnType<typeof createWorkoutStore>;
