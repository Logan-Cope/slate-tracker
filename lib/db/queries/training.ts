import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db/client";
import { defineRead, runRead, type Read } from "@/lib/db/batch";
import {
  exercises,
  programs,
  routineExercises,
  routines,
  sets,
  workoutExercises,
  workouts,
  type Exercise,
  type Program,
  type Routine,
  type RoutineExercise,
  type SetType,
} from "@/lib/db/schema";
import type { HistoricalPerformance } from "@/lib/training/ghost";

// ---------------------------------------------------------------------------
// Programs and routines
// ---------------------------------------------------------------------------

export type RoutineExerciseFull = RoutineExercise & { exercise: Exercise };
export type RoutineFull = Routine & { exercises: RoutineExerciseFull[] };
export type ActiveProgram = { program: Program; routines: RoutineFull[] };

async function loadRoutines(programId: number): Promise<RoutineFull[]> {
  const db = await getDb();
  const rs = await db.select().from(routines).where(eq(routines.programId, programId)).orderBy(asc(routines.position), asc(routines.id));
  if (rs.length === 0) return [];
  const rows = await db
    .select({ re: routineExercises, exercise: exercises })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(inArray(routineExercises.routineId, rs.map((r) => r.id)))
    .orderBy(asc(routineExercises.position), asc(routineExercises.id));
  return rs.map((r) => ({
    ...r,
    exercises: rows.filter((x) => x.re.routineId === r.id).map((x) => ({ ...x.re, exercise: x.exercise })),
  }));
}

/** The active program with its routines and their exercises. Three queries, sent together. */
export async function getActiveProgram(profileId: number): Promise<ActiveProgram | null> {
  const db = await getDb();
  return runRead(db, activeProgramRead(db, profileId));
}

export function activeProgramRead(db: Database, profileId: number): Read<ActiveProgram | null> {
  const activeId = db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.profileId, profileId), eq(programs.isActive, true)))
    .orderBy(desc(programs.id))
    .limit(1);
  const routineIds = db.select({ id: routines.id }).from(routines).where(eq(routines.programId, activeId));
  const queries = [
    db.select().from(programs).where(eq(programs.id, activeId)),
    db.select().from(routines).where(eq(routines.programId, activeId)).orderBy(asc(routines.position), asc(routines.id)),
    db
      .select({ re: routineExercises, exercise: exercises })
      .from(routineExercises)
      .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
      .where(inArray(routineExercises.routineId, routineIds))
      .orderBy(asc(routineExercises.position), asc(routineExercises.id)),
  ] as const;
  return defineRead(queries, ([rows, rs, exerciseRows]) => {
    const program = rows[0];
    if (!program) return null;
    return {
      program,
      routines: rs.map((r) => ({
        ...r,
        exercises: exerciseRows.filter((x) => x.re.routineId === r.id).map((x) => ({ ...x.re, exercise: x.exercise })),
      })),
    };
  });
}

export async function listPrograms(profileId: number): Promise<Program[]> {
  const db = await getDb();
  return db.select().from(programs).where(eq(programs.profileId, profileId)).orderBy(desc(programs.isActive), asc(programs.name));
}

export async function getProgram(profileId: number, programId: number): Promise<ActiveProgram | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(programs)
    .where(and(eq(programs.id, programId), eq(programs.profileId, profileId)))
    .limit(1);
  const program = rows[0];
  if (!program) return null;
  return { program, routines: await loadRoutines(program.id) };
}

export async function getRoutine(profileId: number, routineId: number): Promise<(RoutineFull & { program: Program }) | null> {
  const db = await getDb();
  const rows = await db
    .select({ routine: routines, program: programs })
    .from(routines)
    .innerJoin(programs, eq(programs.id, routines.programId))
    .where(and(eq(routines.id, routineId), eq(programs.profileId, profileId)))
    .limit(1);
  const hit = rows[0];
  if (!hit) return null;
  const full = (await loadRoutines(hit.program.id)).find((r) => r.id === routineId);
  if (!full) return null;
  return { ...full, program: hit.program };
}

/** Throws unless the program belongs to the profile. Every routine-level write goes through here. */
async function assertOwnsProgram(profileId: number, programId: number): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.id, programId), eq(programs.profileId, profileId)))
    .limit(1);
  if (rows.length === 0) throw new Error("Program not found");
}

async function assertOwnsRoutine(profileId: number, routineId: number): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select({ id: routines.id })
    .from(routines)
    .innerJoin(programs, eq(programs.id, routines.programId))
    .where(and(eq(routines.id, routineId), eq(programs.profileId, profileId)))
    .limit(1);
  if (rows.length === 0) throw new Error("Routine not found");
}

async function assertOwnsRoutineExercise(profileId: number, routineExerciseId: number): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select({ id: routineExercises.id })
    .from(routineExercises)
    .innerJoin(routines, eq(routines.id, routineExercises.routineId))
    .innerJoin(programs, eq(programs.id, routines.programId))
    .where(and(eq(routineExercises.id, routineExerciseId), eq(programs.profileId, profileId)))
    .limit(1);
  if (rows.length === 0) throw new Error("Routine exercise not found");
}

export async function createProgram(profileId: number, input: { name: string; notes?: string | null }): Promise<Program> {
  const db = await getDb();
  const [row] = await db.insert(programs).values({ profileId, name: input.name.trim(), notes: input.notes ?? null }).returning();
  return row!;
}

export async function updateProgram(profileId: number, programId: number, patch: { name?: string; notes?: string | null }): Promise<void> {
  const db = await getDb();
  await db
    .update(programs)
    .set({ ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), ...(patch.notes !== undefined ? { notes: patch.notes } : {}) })
    .where(and(eq(programs.id, programId), eq(programs.profileId, profileId)));
}

export async function setActiveProgram(profileId: number, programId: number): Promise<void> {
  const db = await getDb();
  await db.update(programs).set({ isActive: false }).where(eq(programs.profileId, profileId));
  await db.update(programs).set({ isActive: true }).where(and(eq(programs.id, programId), eq(programs.profileId, profileId)));
}

export async function deleteProgram(profileId: number, programId: number): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(programs)
    .where(and(eq(programs.id, programId), eq(programs.profileId, profileId)))
    .returning();
  return rows.length > 0;
}

export async function createRoutine(profileId: number, programId: number, name: string): Promise<Routine> {
  await assertOwnsProgram(profileId, programId);
  const db = await getDb();
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(routines).where(eq(routines.programId, programId));
  const [row] = await db.insert(routines).values({ programId, name: name.trim(), position: n }).returning();
  return row!;
}

export async function renameRoutine(profileId: number, routineId: number, name: string): Promise<void> {
  await assertOwnsRoutine(profileId, routineId);
  const db = await getDb();
  await db.update(routines).set({ name: name.trim() }).where(eq(routines.id, routineId));
}

export async function deleteRoutine(profileId: number, routineId: number): Promise<void> {
  await assertOwnsRoutine(profileId, routineId);
  const db = await getDb();
  await db.delete(routines).where(eq(routines.id, routineId));
}

export async function reorderRoutines(profileId: number, programId: number, orderedIds: number[]): Promise<void> {
  await assertOwnsProgram(profileId, programId);
  const db = await getDb();
  for (const [position, id] of orderedIds.entries()) {
    await db.update(routines).set({ position }).where(and(eq(routines.id, id), eq(routines.programId, programId)));
  }
}

export type RoutineExerciseInput = {
  exerciseId: number;
  targetSets?: number;
  repScheme?: string | null;
  tempo?: string | null;
  restSeconds?: number;
  coachNote?: string | null;
  startWeightLb?: number | null;
  supersetGroup?: number | null;
};

export async function addRoutineExercise(profileId: number, routineId: number, input: RoutineExerciseInput): Promise<RoutineExercise> {
  await assertOwnsRoutine(profileId, routineId);
  const db = await getDb();
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(routineExercises)
    .where(eq(routineExercises.routineId, routineId));
  const [row] = await db
    .insert(routineExercises)
    .values({
      routineId,
      exerciseId: input.exerciseId,
      position: n,
      targetSets: input.targetSets ?? 2,
      repScheme: input.repScheme ?? null,
      tempo: input.tempo ?? null,
      restSeconds: input.restSeconds ?? 60,
      coachNote: input.coachNote ?? null,
      startWeightLb: input.startWeightLb ?? null,
      supersetGroup: input.supersetGroup ?? null,
    })
    .returning();
  return row!;
}

export async function updateRoutineExercise(
  profileId: number,
  id: number,
  patch: Partial<Omit<RoutineExerciseInput, "exerciseId"> & { exerciseId: number }>,
): Promise<RoutineExercise> {
  await assertOwnsRoutineExercise(profileId, id);
  const db = await getDb();
  const [row] = await db.update(routineExercises).set(patch).where(eq(routineExercises.id, id)).returning();
  if (!row) throw new Error("routine exercise not found");
  return row;
}

export async function removeRoutineExercise(profileId: number, id: number): Promise<void> {
  await assertOwnsRoutineExercise(profileId, id);
  const db = await getDb();
  await db.delete(routineExercises).where(eq(routineExercises.id, id));
}

export async function reorderRoutineExercises(profileId: number, routineId: number, orderedIds: number[]): Promise<void> {
  await assertOwnsRoutine(profileId, routineId);
  const db = await getDb();
  for (const [position, id] of orderedIds.entries()) {
    await db.update(routineExercises).set({ position }).where(and(eq(routineExercises.id, id), eq(routineExercises.routineId, routineId)));
  }
}

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export async function listExercises(profileId: number): Promise<Exercise[]> {
  const db = await getDb();
  return db
    .select()
    .from(exercises)
    .where(or(isNull(exercises.profileId), eq(exercises.profileId, profileId)))
    .orderBy(asc(exercises.name));
}

export async function createExercise(
  profileId: number,
  input: { name: string; kind?: Exercise["kind"]; primaryMuscle?: string | null; equipment?: string | null },
): Promise<Exercise> {
  const db = await getDb();
  const name = input.name.trim();
  const existing = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.name, name), or(isNull(exercises.profileId), eq(exercises.profileId, profileId))))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db
    .insert(exercises)
    .values({ name, kind: input.kind ?? "weight_reps", primaryMuscle: input.primaryMuscle ?? null, equipment: input.equipment ?? null, isCustom: true, profileId })
    .returning();
  return row!;
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export type SetDraft = {
  id: string;
  position: number;
  setType: SetType;
  weightLb: number | null;
  reps: number | null;
  rpe: number | null;
  completedAt: Date | null;
  isPr: boolean;
};

export type WorkoutExerciseDraft = {
  id: string;
  exerciseId: number;
  position: number;
  supersetGroup: number | null;
  notes: string | null;
  sets: SetDraft[];
};

export type WorkoutDraft = {
  id: string;
  profileId: number;
  routineId: number | null;
  title: string;
  startedAt: Date;
  finishedAt: Date | null;
  notes: string | null;
  exercises: WorkoutExerciseDraft[];
};

/**
 * Full-state upsert keyed by client ids: rows missing from the draft are
 * deleted, present rows are inserted or updated. Safe to retry.
 */
export async function upsertWorkout(draft: WorkoutDraft): Promise<void> {
  const db = await getDb();
  const exerciseIds = draft.exercises.map((e) => e.id);
  const allSetIds = draft.exercises.flatMap((e) => e.sets.map((s) => s.id));

  // Client ids must not re-parent rows that belong to another workout. Checked
  // before any write so a hijack attempt leaves nothing behind.
  if (exerciseIds.length > 0) {
    const foreign = await db
      .select({ id: workoutExercises.id })
      .from(workoutExercises)
      .where(and(inArray(workoutExercises.id, exerciseIds), ne(workoutExercises.workoutId, draft.id)))
      .limit(1);
    if (foreign.length > 0) throw new Error("Exercise id belongs to another workout");
  }
  if (allSetIds.length > 0) {
    const foreign = await db
      .select({ id: sets.id })
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      .where(and(inArray(sets.id, allSetIds), ne(workoutExercises.workoutId, draft.id)))
      .limit(1);
    if (foreign.length > 0) throw new Error("Set id belongs to another workout");
  }
  const existing = await db
    .select({ profileId: workouts.profileId })
    .from(workouts)
    .where(eq(workouts.id, draft.id))
    .limit(1);
  if (existing[0] && existing[0].profileId !== draft.profileId) throw new Error("Workout belongs to another profile");

  // Every exercise must be shared or the profile's own custom one.
  const wantedExercises = [...new Set(draft.exercises.map((e) => e.exerciseId))];
  if (wantedExercises.length > 0) {
    const visible = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(inArray(exercises.id, wantedExercises), or(isNull(exercises.profileId), eq(exercises.profileId, draft.profileId))));
    if (visible.length !== wantedExercises.length) throw new Error("Exercise not available to this profile");
  }

  await db
    .insert(workouts)
    .values({
      id: draft.id,
      profileId: draft.profileId,
      routineId: draft.routineId,
      title: draft.title,
      startedAt: draft.startedAt,
      finishedAt: draft.finishedAt,
      notes: draft.notes,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workouts.id,
      set: { title: draft.title, routineId: draft.routineId, finishedAt: draft.finishedAt, notes: draft.notes, updatedAt: new Date() },
      setWhere: eq(workouts.profileId, draft.profileId),
    });

  // Re-check after the upsert: a concurrent insert of the same id by another
  // profile would otherwise let the child writes below land under their row.
  const owner = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.id, draft.id), eq(workouts.profileId, draft.profileId)))
    .limit(1);
  if (owner.length === 0) throw new Error("Workout belongs to another profile");

  if (exerciseIds.length > 0) {
    await db.delete(workoutExercises).where(and(eq(workoutExercises.workoutId, draft.id), notInArray(workoutExercises.id, exerciseIds)));
  } else {
    await db.delete(workoutExercises).where(eq(workoutExercises.workoutId, draft.id));
  }

  for (const we of draft.exercises) {
    await db
      .insert(workoutExercises)
      .values({ id: we.id, workoutId: draft.id, exerciseId: we.exerciseId, position: we.position, supersetGroup: we.supersetGroup, notes: we.notes })
      .onConflictDoUpdate({
        target: workoutExercises.id,
        set: { exerciseId: we.exerciseId, position: we.position, supersetGroup: we.supersetGroup, notes: we.notes },
        setWhere: eq(workoutExercises.workoutId, draft.id),
      });
    const setIds = we.sets.map((s) => s.id);
    if (setIds.length > 0) {
      await db.delete(sets).where(and(eq(sets.workoutExerciseId, we.id), notInArray(sets.id, setIds)));
    } else {
      await db.delete(sets).where(eq(sets.workoutExerciseId, we.id));
    }
    for (const s of we.sets) {
      await db
        .insert(sets)
        .values({
          id: s.id,
          workoutExerciseId: we.id,
          position: s.position,
          setType: s.setType,
          weightLb: s.weightLb,
          reps: s.reps,
          rpe: s.rpe,
          completedAt: s.completedAt,
          isPr: s.isPr,
        })
        .onConflictDoUpdate({
          target: sets.id,
          set: { position: s.position, setType: s.setType, weightLb: s.weightLb, reps: s.reps, rpe: s.rpe, completedAt: s.completedAt, isPr: s.isPr },
          setWhere: eq(sets.workoutExerciseId, we.id),
        });
    }
  }
}

async function loadWorkoutDrafts(workoutIds: string[]): Promise<Map<string, WorkoutExerciseDraft[]>> {
  const db = await getDb();
  if (workoutIds.length === 0) return new Map();
  const wes = await db
    .select()
    .from(workoutExercises)
    .where(inArray(workoutExercises.workoutId, workoutIds))
    .orderBy(asc(workoutExercises.position));
  const weIds = wes.map((w) => w.id);
  const ss = weIds.length
    ? await db.select().from(sets).where(inArray(sets.workoutExerciseId, weIds)).orderBy(asc(sets.position))
    : [];
  return groupDrafts(wes, ss);
}

/** Exercises (ordered by position) with their sets (ordered by position), grouped by workout. */
function groupDrafts(wes: (typeof workoutExercises.$inferSelect)[], ss: (typeof sets.$inferSelect)[]): Map<string, WorkoutExerciseDraft[]> {
  const result = new Map<string, WorkoutExerciseDraft[]>();
  for (const we of wes) {
    const list = result.get(we.workoutId) ?? [];
    list.push({
      id: we.id,
      exerciseId: we.exerciseId,
      position: we.position,
      supersetGroup: we.supersetGroup,
      notes: we.notes,
      sets: ss
        .filter((s) => s.workoutExerciseId === we.id)
        .map((s) => ({ id: s.id, position: s.position, setType: s.setType, weightLb: s.weightLb, reps: s.reps, rpe: s.rpe, completedAt: s.completedAt, isPr: s.isPr })),
    });
    result.set(we.workoutId, list);
  }
  return result;
}

export async function getWorkout(profileId: number, id: string): Promise<WorkoutDraft | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, id), eq(workouts.profileId, profileId)))
    .limit(1);
  const w = rows[0];
  if (!w) return null;
  const ex = await loadWorkoutDrafts([id]);
  return { id: w.id, profileId: w.profileId, routineId: w.routineId, title: w.title, startedAt: w.startedAt, finishedAt: w.finishedAt, notes: w.notes, exercises: ex.get(id) ?? [] };
}

/** The newest unfinished workout, read the way getWorkout reads it. Three queries, sent together. */
export async function getInProgressWorkout(profileId: number): Promise<WorkoutDraft | null> {
  const db = await getDb();
  return runRead(db, inProgressWorkoutRead(db, profileId));
}

export function inProgressWorkoutRead(db: Database, profileId: number): Read<WorkoutDraft | null> {
  const openId = db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.profileId, profileId), isNull(workouts.finishedAt)))
    .orderBy(desc(workouts.startedAt))
    .limit(1);
  const openExerciseIds = db.select({ id: workoutExercises.id }).from(workoutExercises).where(eq(workoutExercises.workoutId, openId));
  const queries = [
    db.select().from(workouts).where(eq(workouts.id, openId)),
    db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, openId)).orderBy(asc(workoutExercises.position)),
    db.select().from(sets).where(inArray(sets.workoutExerciseId, openExerciseIds)).orderBy(asc(sets.position)),
  ] as const;
  return defineRead(queries, ([rows, wes, ss]) => {
    const w = rows[0];
    if (!w) return null;
    return {
      id: w.id,
      profileId: w.profileId,
      routineId: w.routineId,
      title: w.title,
      startedAt: w.startedAt,
      finishedAt: w.finishedAt,
      notes: w.notes,
      exercises: groupDrafts(wes, ss).get(w.id) ?? [],
    };
  });
}

export async function finishWorkout(profileId: number, id: string, finishedAt: Date, notes?: string | null): Promise<void> {
  const db = await getDb();
  await db
    .update(workouts)
    .set({ finishedAt, updatedAt: new Date(), ...(notes !== undefined ? { notes } : {}) })
    .where(and(eq(workouts.id, id), eq(workouts.profileId, profileId)));
}

export async function deleteWorkout(profileId: number, id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(workouts)
    .where(and(eq(workouts.id, id), eq(workouts.profileId, profileId)))
    .returning();
  return rows.length > 0;
}

export type WorkoutSummary = {
  id: string;
  title: string;
  routineId: number | null;
  startedAt: Date;
  finishedAt: Date | null;
  exerciseCount: number;
  setCount: number;
  volumeLb: number;
  prCount: number;
};

/**
 * Newest first, with each workout's counts summed in SQL: exercises, and the
 * completed sets' count, volume (weight x reps) and records. One query.
 */
export async function listWorkouts(profileId: number, opts: { limit?: number; before?: Date } = {}): Promise<WorkoutSummary[]> {
  const db = await getDb();
  return runRead(db, workoutsRead(db, profileId, opts));
}

export function workoutsRead(db: Database, profileId: number, opts: { limit?: number; before?: Date } = {}): Read<WorkoutSummary[]> {
  const conds = [eq(workouts.profileId, profileId)];
  if (opts.before) conds.push(sql`${workouts.startedAt} < ${opts.before}`);
  const pageIds = db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(...conds))
    .orderBy(desc(workouts.startedAt))
    .limit(opts.limit ?? 30);
  const done = sql`${sets.completedAt} is not null`;
  const query = db
    .select({
      w: workouts,
      exerciseCount: sql<number>`count(distinct ${workoutExercises.id})::int`,
      setCount: sql<number>`(count(${sets.id}) filter (where ${done}))::int`,
      // weight_lb is a 4-byte real: through numeric it reads as the decimal the app shows (17.3), through float8 as 17.2999992.
      volumeLb: sql<number>`coalesce(sum(coalesce(${sets.weightLb}, 0)::numeric * coalesce(${sets.reps}, 0)) filter (where ${done}), 0)::float8`,
      prCount: sql<number>`(count(${sets.id}) filter (where ${done} and ${sets.isPr}))::int`,
    })
    .from(workouts)
    .leftJoin(workoutExercises, eq(workoutExercises.workoutId, workouts.id))
    .leftJoin(sets, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(inArray(workouts.id, pageIds))
    .groupBy(workouts.id)
    .orderBy(desc(workouts.startedAt));
  return defineRead([query], ([rows]) =>
    rows.map(({ w, exerciseCount, setCount, volumeLb, prCount }) => ({
      id: w.id,
      title: w.title,
      routineId: w.routineId,
      startedAt: w.startedAt,
      finishedAt: w.finishedAt,
      exerciseCount,
      setCount,
      volumeLb,
      prCount,
    })),
  );
}

// ---------------------------------------------------------------------------
// History (ghost values, PRs, charts)
// ---------------------------------------------------------------------------

type HistoryRow = {
  workoutId: string;
  routineId: number | null;
  startedAt: Date;
  exerciseId: number;
  position: number;
  setType: SetType;
  weightLb: number | null;
  reps: number | null;
  completedAt: Date | null;
};

function groupHistory(rows: HistoryRow[]): Map<number, HistoricalPerformance[]> {
  const byExercise = new Map<number, Map<string, HistoricalPerformance>>();
  for (const r of rows) {
    const perWorkout = byExercise.get(r.exerciseId) ?? new Map<string, HistoricalPerformance>();
    const perf = perWorkout.get(r.workoutId) ?? { workoutId: r.workoutId, routineId: r.routineId, startedAt: r.startedAt, sets: [] };
    perf.sets.push({ position: r.position, setType: r.setType, weightLb: r.weightLb, reps: r.reps, completedAt: r.completedAt });
    perWorkout.set(r.workoutId, perf);
    byExercise.set(r.exerciseId, perWorkout);
  }
  const out = new Map<number, HistoricalPerformance[]>();
  for (const [exerciseId, perWorkout] of byExercise) {
    const list = [...perWorkout.values()].filter((p) => p.sets.some((s) => s.completedAt));
    list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    for (const p of list) p.sets.sort((a, b) => a.position - b.position);
    out.set(exerciseId, list);
  }
  return out;
}

async function historyRows(profileId: number, exerciseIds: number[], opts: { excludeWorkoutId?: string; limitWorkouts?: number }): Promise<HistoryRow[]> {
  const db = await getDb();
  if (exerciseIds.length === 0) return [];
  const conds = [eq(workouts.profileId, profileId), inArray(workoutExercises.exerciseId, exerciseIds), isNotNull(sets.completedAt)];
  if (opts.excludeWorkoutId) conds.push(sql`${workouts.id} <> ${opts.excludeWorkoutId}`);
  const rows = await db
    .select({
      workoutId: workouts.id,
      routineId: workouts.routineId,
      startedAt: workouts.startedAt,
      exerciseId: workoutExercises.exerciseId,
      position: sets.position,
      setType: sets.setType,
      weightLb: sets.weightLb,
      reps: sets.reps,
      completedAt: sets.completedAt,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(...conds))
    .orderBy(desc(workouts.startedAt), asc(sets.position))
    .limit(Math.max(200, (opts.limitWorkouts ?? 20) * exerciseIds.length * 8));
  return rows;
}

/** Completed performances of one exercise, newest first. */
export async function exerciseHistory(profileId: number, exerciseId: number, opts: { limit?: number; excludeWorkoutId?: string } = {}): Promise<HistoricalPerformance[]> {
  const rows = await historyRows(profileId, [exerciseId], { excludeWorkoutId: opts.excludeWorkoutId, limitWorkouts: opts.limit ?? 20 });
  return (groupHistory(rows).get(exerciseId) ?? []).slice(0, opts.limit ?? 20);
}

/** History for every exercise in a routine, for ghost values and PR checks at workout start. */
export async function historyForRoutine(profileId: number, routineId: number, opts: { excludeWorkoutId?: string } = {}): Promise<Map<number, HistoricalPerformance[]>> {
  const routine = await getRoutine(profileId, routineId);
  if (!routine) return new Map();
  return historyForExercises(profileId, routine.exercises.map((e) => e.exerciseId), opts);
}

export async function historyForExercises(profileId: number, exerciseIds: number[], opts: { excludeWorkoutId?: string } = {}): Promise<Map<number, HistoricalPerformance[]>> {
  const rows = await historyRows(profileId, exerciseIds, { excludeWorkoutId: opts.excludeWorkoutId, limitWorkouts: 10 });
  return groupHistory(rows);
}
