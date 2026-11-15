"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActiveProfileId } from "@/lib/auth/session";
import {
  createExercise,
  deleteWorkout,
  exerciseHistory,
  finishWorkout,
  getRoutine,
  getWorkout,
  listWorkouts,
  upsertWorkout,
} from "@/lib/db/queries/training";
import {
  buildDraftFromRoutine,
  serializeHistory,
  toServerDraft,
  toSummaryDTO,
  type ClientWorkoutDraft,
  type HistoryDTO,
  type WorkoutSummaryDTO,
} from "@/lib/training/workout-store";
import { newId } from "@/lib/utils/uuid";
import type { ExerciseLite } from "@/components/training/types";

export type ActionResult<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

const setSchema = z.object({
  id: z.uuid(),
  position: z.number().int().min(0),
  setType: z.enum(["warmup", "normal", "failure", "drop"]),
  weightLb: z.number().min(0).max(5000).nullable(),
  reps: z.number().int().min(0).max(1000).nullable(),
  rpe: z.number().min(0).max(10).nullable(),
  completedAt: z.iso.datetime().nullable(),
  isPr: z.boolean(),
});

const exerciseSchema = z.object({
  id: z.uuid(),
  exerciseId: z.number().int().positive(),
  position: z.number().int().min(0),
  supersetGroup: z.number().int().nullable(),
  notes: z.string().max(2000).nullable(),
  sets: z.array(setSchema).max(50),
});

const draftSchema = z.object({
  id: z.uuid(),
  profileId: z.number().int(),
  routineId: z.number().int().nullable(),
  title: z.string().trim().min(1).max(120),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  notes: z.string().max(5000).nullable(),
  exercises: z.array(exerciseSchema).max(60),
});

const PAGE_SIZE = 20;

export async function startWorkout(routineId: number): Promise<never> {
  const profileId = await getActiveProfileId();
  const routine = await getRoutine(profileId, routineId);
  if (!routine) redirect("/train");
  const draft = buildDraftFromRoutine(routine, { id: newId(), profileId, startedAt: new Date(), newId });
  await upsertWorkout(draft);
  revalidatePath("/train");
  redirect(`/train/workout/${draft.id}`);
}

/** Form action variant for the Start buttons on server-rendered cards. */
export async function startWorkoutFromForm(formData: FormData): Promise<void> {
  const routineId = Number(formData.get("routineId"));
  if (!Number.isInteger(routineId) || routineId <= 0) redirect("/train");
  await startWorkout(routineId);
}

/**
 * Full-state save of an in-progress or finished workout. Only workouts that
 * already belong to the active profile can be written, so a client can never
 * create or touch rows under someone else's id.
 */
/** A draft the server cannot read will not read any better on retry; the fix is to reopen it. */
const INVALID_DRAFT = "This workout could not be saved as sent. Go back to Train and reopen it.";

export async function saveWorkout(input: ClientWorkoutDraft): Promise<ActionResult<{ savedAt: string }>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_DRAFT };
  const profileId = await getActiveProfileId();
  const existing = await getWorkout(profileId, parsed.data.id);
  if (!existing) return { ok: false, error: "Workout not found. Go back to Train." };
  await upsertWorkout(toServerDraft(parsed.data, profileId));
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function finishWorkoutAction(input: {
  draft: ClientWorkoutDraft;
  finishedAt: string;
  notes: string | null;
}): Promise<ActionResult> {
  const parsed = z
    .object({ draft: draftSchema, finishedAt: z.iso.datetime(), notes: z.string().max(5000).nullable() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_DRAFT };
  const profileId = await getActiveProfileId();
  const { draft, finishedAt, notes } = parsed.data;
  const existing = await getWorkout(profileId, draft.id);
  if (!existing) return { ok: false, error: "Workout not found. Go back to Train." };
  const finished = new Date(finishedAt);
  await upsertWorkout(toServerDraft({ ...draft, finishedAt, notes }, profileId));
  await finishWorkout(profileId, draft.id, finished, notes);
  revalidatePath("/train");
  revalidatePath("/train/history");
  return { ok: true };
}

export async function createExerciseAction(name: string): Promise<ActionResult<{ exercise: ExerciseLite }>> {
  const parsed = z.string().trim().min(1).max(80).safeParse(name);
  if (!parsed.success) return { ok: false, error: "Give the exercise a name" };
  const profileId = await getActiveProfileId();
  const row = await createExercise(profileId, { name: parsed.data });
  return { ok: true, exercise: { id: row.id, name: row.name, kind: row.kind, primaryMuscle: row.primaryMuscle, equipment: row.equipment } };
}

/** Prior performances of one exercise, for ghosts and PR checks after a swap or add. */
export async function loadExerciseHistoryAction(
  exerciseId: number,
  excludeWorkoutId: string,
): Promise<ActionResult<{ history: HistoryDTO[string] }>> {
  const parsed = z.object({ exerciseId: z.number().int().positive(), excludeWorkoutId: z.uuid() }).safeParse({ exerciseId, excludeWorkoutId });
  if (!parsed.success) return { ok: false, error: "Could not load this exercise's history. Reopen the workout to try again." };
  const profileId = await getActiveProfileId();
  const perfs = await exerciseHistory(profileId, parsed.data.exerciseId, { limit: 10, excludeWorkoutId: parsed.data.excludeWorkoutId });
  const dto = serializeHistory(new Map([[parsed.data.exerciseId, perfs]]));
  return { ok: true, history: dto[String(parsed.data.exerciseId)] ?? [] };
}

export async function loadMoreWorkoutsAction(beforeIso: string): Promise<ActionResult<{ workouts: WorkoutSummaryDTO[]; pageSize: number }>> {
  const parsed = z.iso.datetime().safeParse(beforeIso);
  if (!parsed.success) return { ok: false, error: "Could not load more. Go back to Train and open History again." };
  const profileId = await getActiveProfileId();
  const rows = await listWorkouts(profileId, { limit: PAGE_SIZE, before: new Date(parsed.data) });
  return { ok: true, workouts: rows.map(toSummaryDTO), pageSize: PAGE_SIZE };
}

/** Deletes an unfinished workout and everything logged in it. Finished workouts stay in history. */
export async function discardWorkoutAction(workoutId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(workoutId);
  if (!parsed.success) return { ok: false, error: "Not a workout. Go back to Train." };
  const profileId = await getActiveProfileId();
  const existing = await getWorkout(profileId, parsed.data);
  if (existing?.finishedAt) return { ok: false, error: "This workout is already finished. Go back to Train; it is in History." };
  if (existing) await deleteWorkout(profileId, parsed.data);
  revalidatePath("/train");
  return { ok: true };
}
