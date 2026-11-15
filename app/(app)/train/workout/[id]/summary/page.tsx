import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Trophy } from "lucide-react";
import { getActiveProfileId } from "@/lib/auth/session";
import { getWorkout, historyForExercises, listExercises } from "@/lib/db/queries/training";
import { fromServerDraft, prKindsByWorkout, summarize, type ExerciseHistory } from "@/lib/training/workout-store";
import { fmtDuration, fmtVolume, prLineText } from "@/components/training/format";
import { LocalTime } from "@/components/training/local-time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const profileId = await getActiveProfileId();
  const workout = await getWorkout(profileId, id);
  if (!workout) notFound();

  const draft = fromServerDraft(workout);
  const stats = summarize(draft);
  const exerciseIds = [...new Set(draft.exercises.map((e) => e.exerciseId))];
  const [exercises, historyMap] = await Promise.all([listExercises(profileId), historyForExercises(profileId, exerciseIds, { excludeWorkoutId: id })]);
  const nameOf = new Map(exercises.map((e) => [e.id, e.name]));

  // Only what came before this workout can be the bar it beat.
  const history: ExerciseHistory = {};
  for (const [exerciseId, perfs] of historyMap) {
    history[exerciseId] = perfs.filter((p) => p.startedAt.getTime() < workout.startedAt.getTime());
  }
  const kinds = prKindsByWorkout(draft, history);
  const prs = draft.exercises.flatMap((we) =>
    we.sets
      .filter((s) => s.isPr && s.completedAt !== null)
      .map((s) => ({ id: s.id, name: nameOf.get(we.exerciseId) ?? "Exercise", weightLb: s.weightLb, reps: s.reps, kinds: kinds.get(s.id) ?? [] })),
  );
  const duration = workout.finishedAt ? fmtDuration(workout.finishedAt.getTime() - workout.startedAt.getTime()) : null;

  return (
    <div className="px-4 pb-10">
      <div className="pt-10 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-protein-soft text-protein">
          <CircleCheck size={36} aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight">{workout.title}</h1>
        <p className="tnum mt-1 text-sm text-muted">
          <LocalTime iso={workout.startedAt.toISOString()} mode="datetime" />
          {duration ? ` · ${duration}` : " · In progress"}
        </p>
      </div>

      <div className="card mt-6 grid grid-cols-3 divide-x divide-line py-4 text-center">
        <div>
          <div className="tnum text-3xl font-black" data-testid="summary-sets">
            {stats.setsDone}
          </div>
          <div className="text-xs font-medium text-muted">{stats.setsDone === 1 ? "set" : "sets"}</div>
        </div>
        <div>
          <div className="tnum text-3xl font-black" data-testid="summary-volume">
            {fmtVolume(stats.volumeLb)}
          </div>
          <div className="text-xs font-medium text-muted">lb moved</div>
        </div>
        <div>
          <div className={`tnum text-3xl font-black ${stats.prCount > 0 ? "text-accent" : ""}`} data-testid="summary-prs">
            {stats.prCount}
          </div>
          <div className="text-xs font-medium text-muted">{stats.prCount === 1 ? "PR" : "PRs"}</div>
        </div>
      </div>

      {prs.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Personal records</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {prs.map((pr) => (
              <li key={pr.id} className="flex items-start gap-3 px-4 py-3">
                <Trophy size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span className="text-sm">
                  <span className="font-semibold">{pr.name}</span> <span className="tnum">{prLineText(pr)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {workout.notes ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Notes</h2>
          <p className="card whitespace-pre-line px-4 py-3 text-sm">{workout.notes}</p>
        </section>
      ) : null}

      <Link href="/train" className="btn-primary mt-8 w-full" data-testid="summary-done">
        Done
      </Link>
      <Link href={`/train/workout/${workout.id}`} className="btn-ghost mt-2 w-full">
        Review sets
      </Link>
    </div>
  );
}
