import { notFound } from "next/navigation";
import { getActiveProfileId } from "@/lib/auth/session";
import { exerciseHistory, listExercises } from "@/lib/db/queries/training";
import type { HistoricalPerformance, HistoricalSet } from "@/lib/training/ghost";
import { fmtWeight } from "@/lib/utils/format";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { BackLink } from "@/components/training/back-link";
import { ExerciseChart, type ChartPoint } from "@/components/training/exercise-chart";
import { LocalTime } from "@/components/training/local-time";

function completedSets(p: HistoricalPerformance): HistoricalSet[] {
  return p.sets.filter((s) => s.completedAt !== null).sort((a, b) => a.position - b.position);
}

/** "105×12, 105×9"; bodyweight sets read "12 reps". */
function setsText(sets: HistoricalSet[]): string {
  return sets
    .map((s) => {
      if (s.weightLb !== null && s.reps !== null) return `${fmtWeight(s.weightLb)}×${s.reps}`;
      if (s.weightLb !== null) return `${fmtWeight(s.weightLb)} lb`;
      if (s.reps !== null) return `${s.reps} reps`;
      return "done";
    })
    .join(", ");
}

function bestSet(perfs: HistoricalPerformance[]): HistoricalSet | null {
  let best: HistoricalSet | null = null;
  for (const p of perfs) {
    for (const s of completedSets(p)) {
      if (s.setType === "warmup" || s.weightLb === null) continue;
      if (!best || s.weightLb > (best.weightLb ?? 0) || (s.weightLb === best.weightLb && (s.reps ?? 0) > (best.reps ?? 0))) best = s;
    }
  }
  return best;
}

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exerciseId = Number(id);
  if (!Number.isInteger(exerciseId) || exerciseId <= 0) notFound();
  const profileId = await getActiveProfileId();
  const [exercises, perfs] = await Promise.all([listExercises(profileId), exerciseHistory(profileId, exerciseId, { limit: 60 })]);
  const exercise = exercises.find((e) => e.id === exerciseId);
  if (!exercise) notFound();

  const best = bestSet(perfs);
  const points: ChartPoint[] = [...perfs]
    .reverse()
    .flatMap((p) => {
      const weights = completedSets(p)
        .filter((s) => s.setType !== "warmup" && s.weightLb !== null)
        .map((s) => s.weightLb as number);
      return weights.length > 0 ? [{ date: p.startedAt.toISOString(), weightLb: Math.max(...weights) }] : [];
    });

  return (
    <div className="pb-8">
      <PageHeader
        title={exercise.name}
        subtitle={[exercise.primaryMuscle, exercise.equipment].filter(Boolean).join(" · ") || undefined}
        left={<BackLink href="/train" label="Back to Train" />}
      />

      {perfs.length === 0 ? (
        <EmptyState title="Nothing logged yet" body="Finish a workout with this exercise and your progress shows up here." />
      ) : (
        <div className="flex flex-col gap-4 px-4">
          <div className="card flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Best set</div>
              <div className="tnum text-2xl font-black">
                {best ? (
                  <>
                    {fmtWeight(best.weightLb ?? 0)} <span className="text-base font-semibold text-muted">lb</span>
                    {best.reps !== null ? (
                      <>
                        {" × "}
                        {best.reps}
                      </>
                    ) : null}
                  </>
                ) : (
                  "Bodyweight"
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Workouts</div>
              <div className="tnum text-2xl font-black">{perfs.length}</div>
            </div>
          </div>

          {points.length > 0 ? (
            <section className="card px-2 pt-3 pb-1">
              <h2 className="px-2 text-xs font-bold uppercase tracking-wide text-muted">Best set weight, lb</h2>
              <ExerciseChart points={points} />
            </section>
          ) : null}

          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Performances</h2>
            <ul className="card divide-y divide-line overflow-hidden">
              {perfs.map((p) => (
                <li key={p.workoutId} className="flex items-start justify-between gap-3 px-4 py-3">
                  <LocalTime iso={p.startedAt.toISOString()} mode="date" className="shrink-0 text-sm font-semibold" />
                  <span className="tnum text-right text-sm text-muted">{setsText(completedSets(p))}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
