import type { SetType } from "@/lib/db/schema";

export type HistoricalSet = {
  position: number;
  setType: SetType;
  weightLb: number | null;
  reps: number | null;
  completedAt: Date | null;
};

export type HistoricalPerformance = {
  workoutId: string;
  routineId: number | null;
  startedAt: Date;
  sets: HistoricalSet[];
};

export type GhostSource = "same_routine" | "any_workout" | "start_weight" | "none";

export type Ghost = {
  weightLb: number | null;
  reps: number | null;
  source: GhostSource;
};

function isCompleted(s: HistoricalSet): boolean {
  return s.completedAt !== null;
}

// A performance only counts once at least one set was actually completed.
function counts(p: HistoricalPerformance): boolean {
  return p.sets.some(isCompleted);
}

// Counting performances, newest first. Copies so the caller's array is never reordered.
function countingNewestFirst(history: HistoricalPerformance[]): HistoricalPerformance[] {
  return history
    .filter(counts)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

export function lastPerformance(
  history: HistoricalPerformance[],
  routineId: number | null,
): { same: HistoricalPerformance | null; any: HistoricalPerformance | null } {
  const ordered = countingNewestFirst(history);
  // Ad-hoc workouts (routineId null) never count as "the same routine".
  const same =
    routineId === null ? null : (ordered.find((p) => p.routineId === routineId) ?? null);
  return { same, any: ordered[0] ?? null };
}

export function ghostForSet(
  history: HistoricalPerformance[],
  opts: { routineId: number | null; setIndex: number; startWeightLb: number | null },
): Ghost {
  const { same, any } = lastPerformance(history, opts.routineId);
  const chosen = same ?? any;
  if (chosen) {
    const completed = chosen.sets.filter(isCompleted).sort((a, b) => a.position - b.position);
    // A counting performance always has at least one completed set, so the fallback is defined.
    const hit =
      completed.find((s) => s.position === opts.setIndex) ?? completed[completed.length - 1];
    if (hit) {
      const source: GhostSource = same ? "same_routine" : "any_workout";
      return { weightLb: hit.weightLb, reps: hit.reps, source };
    }
  }
  if (opts.startWeightLb !== null) {
    return { weightLb: opts.startWeightLb, reps: null, source: "start_weight" };
  }
  return { weightLb: null, reps: null, source: "none" };
}

export function progressionHint(
  history: HistoricalPerformance[],
  opts: { routineId: number | null; repsThreshold?: number },
): "increase" | null {
  const threshold = opts.repsThreshold ?? 14;
  const { same, any } = lastPerformance(history, opts.routineId);
  const chosen = same ?? any;
  if (!chosen) return null;
  const hit = chosen.sets.some(
    (s) => isCompleted(s) && s.setType !== "warmup" && s.reps !== null && s.reps >= threshold,
  );
  return hit ? "increase" : null;
}
