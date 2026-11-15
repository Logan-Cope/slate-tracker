"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActiveProfileId, requireCoach, requireUser, setActiveProfileCookie } from "@/lib/auth/session";
import { setTarget } from "@/lib/db/queries/targets";
import {
  addRoutineExercise,
  createExercise,
  createProgram,
  createRoutine,
  deleteProgram,
  deleteRoutine,
  getRoutine,
  listExercises,
  removeRoutineExercise,
  renameRoutine,
  reorderRoutineExercises,
  setActiveProgram,
  updateProgram,
  updateRoutineExercise,
} from "@/lib/db/queries/training";
import { todayLocal } from "@/lib/utils/date";

function num(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = v === null ? "" : String(v).trim();
  return s === "" ? null : s;
}

function revalidateAll() {
  revalidatePath("/coach");
  revalidatePath("/coach/programs");
  revalidatePath("/train");
  revalidatePath("/today");
}

// ---------------------------------------------------------------------------
// Profile and session
// ---------------------------------------------------------------------------

export async function switchProfile(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "coach") return;
  const id = Number(formData.get("profileId"));
  if (!Number.isInteger(id) || id <= 0) return;
  await setActiveProfileCookie(id);
  redirect("/today");
}


// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

const targetSchema = z.object({
  kcal: z.number().int().min(500).max(10000),
  proteinG: z.number().int().min(0).max(1000),
  carbsG: z.number().int().min(0).max(2000).nullable(),
  fatG: z.number().int().min(0).max(1000).nullable(),
});

export type TargetFormState = { error: string | null; saved: boolean };

export async function saveTargets(_prev: TargetFormState, formData: FormData): Promise<TargetFormState> {
  await requireCoach();
  const parsed = targetSchema.safeParse({
    kcal: Math.round(num(formData.get("kcal")) ?? NaN),
    proteinG: Math.round(num(formData.get("proteinG")) ?? NaN),
    carbsG: num(formData.get("carbsG")) === null ? null : Math.round(num(formData.get("carbsG"))!),
    fatG: num(formData.get("fatG")) === null ? null : Math.round(num(formData.get("fatG"))!),
  });
  if (!parsed.success) return { error: "Enter calories from 500 to 10,000 and protein from 0 to 1,000 g.", saved: false };
  const profileId = await getActiveProfileId();
  await setTarget(profileId, { ...parsed.data, effectiveFrom: todayLocal() });
  revalidateAll();
  return { error: null, saved: true };
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export async function createProgramAction(formData: FormData): Promise<void> {
  await requireCoach();
  const name = str(formData.get("name"));
  if (!name) return;
  const profileId = await getActiveProfileId();
  const program = await createProgram(profileId, { name, notes: str(formData.get("notes")) });
  revalidateAll();
  redirect(`/coach/programs/${program.id}`);
}

export async function updateProgramAction(programId: number, formData: FormData): Promise<void> {
  await requireCoach();
  const profileId = await getActiveProfileId();
  const name = str(formData.get("name"));
  await updateProgram(profileId, programId, { ...(name ? { name } : {}), notes: str(formData.get("notes")) });
  revalidateAll();
}

export async function activateProgramAction(programId: number): Promise<void> {
  await requireCoach();
  const profileId = await getActiveProfileId();
  await setActiveProgram(profileId, programId);
  revalidateAll();
}

export async function deleteProgramAction(programId: number): Promise<void> {
  await requireCoach();
  const profileId = await getActiveProfileId();
  await deleteProgram(profileId, programId);
  revalidateAll();
  redirect("/coach/programs");
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

export async function createRoutineAction(programId: number, formData: FormData): Promise<void> {
  await requireCoach();
  const name = str(formData.get("name"));
  if (!name) return;
  const profileId = await getActiveProfileId();
  await createRoutine(profileId, programId, name);
  revalidateAll();
}

export async function renameRoutineAction(routineId: number, formData: FormData): Promise<void> {
  await requireCoach();
  const name = str(formData.get("name"));
  if (!name) return;
  const profileId = await getActiveProfileId();
  await renameRoutine(profileId, routineId, name);
  revalidateAll();
}

export async function deleteRoutineAction(routineId: number): Promise<void> {
  await requireCoach();
  const profileId = await getActiveProfileId();
  await deleteRoutine(profileId, routineId);
  revalidateAll();
}

// ---------------------------------------------------------------------------
// Routine exercises
// ---------------------------------------------------------------------------

function exerciseFields(formData: FormData) {
  return {
    targetSets: Math.min(10, Math.max(1, Math.round(num(formData.get("targetSets")) ?? 2))),
    repScheme: str(formData.get("repScheme")),
    tempo: str(formData.get("tempo")),
    restSeconds: Math.min(600, Math.max(0, Math.round(num(formData.get("restSeconds")) ?? 60))),
    coachNote: str(formData.get("coachNote")),
    startWeightLb: num(formData.get("startWeightLb")),
  };
}

/** Picks an existing exercise by name (case-insensitive) or creates a custom one. */
async function resolveExercise(profileId: number, name: string): Promise<number> {
  const all = await listExercises(profileId);
  const hit = all.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (hit) return hit.id;
  const created = await createExercise(profileId, { name });
  return created.id;
}

export async function addRoutineExerciseAction(routineId: number, formData: FormData): Promise<void> {
  await requireCoach();
  const name = str(formData.get("exerciseName"));
  if (!name) return;
  const profileId = await getActiveProfileId();
  const exerciseId = await resolveExercise(profileId, name);
  await addRoutineExercise(profileId, routineId, { exerciseId, ...exerciseFields(formData) });
  revalidateAll();
}

export async function updateRoutineExerciseAction(routineExerciseId: number, formData: FormData): Promise<void> {
  await requireCoach();
  const profileId = await getActiveProfileId();
  const name = str(formData.get("exerciseName"));
  const patch: Parameters<typeof updateRoutineExercise>[2] = exerciseFields(formData);
  if (name) patch.exerciseId = await resolveExercise(profileId, name);
  await updateRoutineExercise(profileId, routineExerciseId, patch);
  revalidateAll();
}

export async function removeRoutineExerciseAction(routineExerciseId: number): Promise<void> {
  await requireCoach();
  const profileId = await getActiveProfileId();
  await removeRoutineExercise(profileId, routineExerciseId);
  revalidateAll();
}

export async function moveRoutineExerciseAction(routineId: number, routineExerciseId: number, direction: "up" | "down"): Promise<void> {
  await requireCoach();
  const profileId = await getActiveProfileId();
  const routine = await getRoutine(profileId, routineId);
  if (!routine) return;
  const ids = routine.exercises.map((e) => e.id);
  const i = ids.indexOf(routineExerciseId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await reorderRoutineExercises(profileId, routineId, ids);
  revalidateAll();
}
