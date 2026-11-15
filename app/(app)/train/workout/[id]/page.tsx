import { notFound } from "next/navigation";
import { getActiveProfileId } from "@/lib/auth/session";
import { getRoutine, getWorkout, historyForExercises, listExercises } from "@/lib/db/queries/training";
import { fromServerDraft, serializeHistory } from "@/lib/training/workout-store";
import { ActiveWorkout } from "@/components/training/active-workout";
import type { RoutineInfo } from "@/components/training/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const profileId = await getActiveProfileId();
  const draft = await getWorkout(profileId, id);
  if (!draft) notFound();

  const [routineRow, exercises] = await Promise.all([
    draft.routineId !== null ? getRoutine(profileId, draft.routineId) : Promise.resolve(null),
    listExercises(profileId),
  ]);
  const exerciseIds = [...new Set([...draft.exercises.map((e) => e.exerciseId), ...(routineRow?.exercises.map((e) => e.exerciseId) ?? [])])];
  const history = await historyForExercises(profileId, exerciseIds, { excludeWorkoutId: id });

  const routine: RoutineInfo | null = routineRow
    ? {
        id: routineRow.id,
        name: routineRow.name,
        exercises: routineRow.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          targetSets: e.targetSets,
          repScheme: e.repScheme,
          tempo: e.tempo,
          restSeconds: e.restSeconds,
          coachNote: e.coachNote,
          startWeightLb: e.startWeightLb,
        })),
      }
    : null;

  return (
    <ActiveWorkout
      key={id}
      serverDraft={fromServerDraft(draft)}
      routine={routine}
      history={serializeHistory(history)}
      exercises={exercises.map((e) => ({ id: e.id, name: e.name, kind: e.kind, primaryMuscle: e.primaryMuscle, equipment: e.equipment }))}
    />
  );
}
