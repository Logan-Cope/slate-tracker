import type { Exercise } from "@/lib/db/schema";

/** What the client needs to know about an exercise: enough to search and name it. */
export type ExerciseLite = Pick<Exercise, "id" | "name" | "kind" | "primaryMuscle" | "equipment">;

export type RoutineExerciseInfo = {
  exerciseId: number;
  targetSets: number;
  repScheme: string | null;
  tempo: string | null;
  restSeconds: number;
  coachNote: string | null;
  startWeightLb: number | null;
};

export type RoutineInfo = {
  id: number;
  name: string;
  exercises: RoutineExerciseInfo[];
};
