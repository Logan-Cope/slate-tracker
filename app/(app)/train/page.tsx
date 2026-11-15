import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Play } from "lucide-react";
import { getActiveProfileId } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { readAll } from "@/lib/db/batch";
import { activeProgramRead, inProgressWorkoutRead, workoutsRead, type RoutineFull } from "@/lib/db/queries/training";
import { fromServerDraft, pickUpNext, summarize, toSummaryDTO } from "@/lib/training/workout-store";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LocalTime } from "@/components/training/local-time";
import { ResumeDiscard } from "@/components/training/resume-discard";
import { StartButton } from "@/components/training/start-button";
import { WorkoutRow } from "@/components/training/workout-row";
import { startWorkoutFromForm } from "./actions";

export const metadata: Metadata = { title: "Train" };

const RECENT = 8;

export default async function TrainPage() {
  const [profileId, db] = await Promise.all([getActiveProfileId(), getDb()]);
  const { inProgress, active, recent } = await readAll(db, {
    inProgress: inProgressWorkoutRead(db, profileId),
    active: activeProgramRead(db, profileId),
    recent: workoutsRead(db, profileId, { limit: RECENT + 1 }),
  });

  const recentRows = recent.filter((w) => w.id !== inProgress?.id).slice(0, RECENT).map(toSummaryDTO);
  const lastRoutineId = recent[0]?.routineId ?? null;
  const upNext = active && !inProgress ? pickUpNext(active.routines, lastRoutineId) : null;
  const progress = inProgress ? summarize(fromServerDraft(inProgress)) : null;

  return (
    <div className="pb-8">
      <PageHeader title="Train" subtitle={active ? active.program.name : "No active program"} />

      {inProgress && progress ? (
        <div className="px-4">
          <div className="card overflow-hidden" style={{ borderColor: "var(--accent)" }}>
            <Link href={`/train/workout/${inProgress.id}`} className="tap flex items-center gap-3 p-4 focus-visible:-outline-offset-2" data-testid="resume-workout">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                <Play size={22} fill="currentColor" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold uppercase tracking-wide text-accent-ink">Resume</span>
                <span className="block text-pretty text-lg font-bold leading-tight">{inProgress.title}</span>
                <span className="tnum block text-sm text-muted">
                  Started <LocalTime iso={inProgress.startedAt.toISOString()} mode="relative" /> · {progress.setsDone} of {progress.setsTotal} sets done
                </span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden />
            </Link>
            <div className="flex justify-end border-t border-line px-2">
              <ResumeDiscard workoutId={inProgress.id} setsDone={progress.setsDone} />
            </div>
          </div>
        </div>
      ) : null}

      {!active ? (
        <EmptyState
          title="No program yet"
          body="Your coach sets up routines in the Coach tab. Once a program is active it shows up here."
          action={
            <Link href="/coach" className="btn-secondary">
              Open Coach
            </Link>
          }
        />
      ) : (
        <>
          {upNext ? <UpNextCard routine={upNext} /> : null}

          <Section title="Routines">
            <div className="card divide-y divide-line overflow-hidden">
              {active.routines.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-pretty break-words font-semibold">{r.name}</div>
                    <div className="text-sm text-muted">{exerciseCount(r)}</div>
                  </div>
                  <form action={startWorkoutFromForm}>
                    <input type="hidden" name="routineId" value={r.id} />
                    <StartButton routineId={r.id} variant="secondary" />
                  </form>
                </div>
              ))}
            </div>
          </Section>

          {active.program.notes ? (
            <div className="mt-3 px-4">
              <details className="card px-4 py-3">
                <summary className="tap cursor-pointer font-semibold">Program notes</summary>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{active.program.notes}</p>
              </details>
            </div>
          ) : null}
        </>
      )}

      <Section
        title="Recent"
        right={
          <Link href="/train/history" className="tap text-sm font-semibold text-accent-ink">
            All history
          </Link>
        }
      >
        {recentRows.length > 0 ? (
          <div className="card divide-y divide-line overflow-hidden" data-testid="recent-workouts">
            {recentRows.map((w) => (
              <WorkoutRow key={w.id} w={w} />
            ))}
          </div>
        ) : (
          <p className="px-1 text-sm text-muted" data-testid="recent-workouts">
            No workouts yet. Your first one lands here.
          </p>
        )}
      </Section>
    </div>
  );
}

function exerciseCount(r: RoutineFull): string {
  return `${r.exercises.length} ${r.exercises.length === 1 ? "exercise" : "exercises"}`;
}

function UpNextCard({ routine }: { routine: RoutineFull }) {
  return (
    <div className="px-4">
      <div className="card p-4" data-testid="up-next">
        <div className="text-xs font-bold uppercase tracking-wide text-accent-ink">Up next</div>
        <h2 className="mt-0.5 text-2xl font-black tracking-tight">{routine.name}</h2>
        <p className="text-sm text-muted">{exerciseCount(routine)}</p>
        <ol className="mt-3 flex flex-col gap-1 text-sm">
          {routine.exercises.map((e, i) => (
            <li key={e.id} className="flex items-baseline gap-2">
              <span className="tnum w-4 shrink-0 text-right text-xs font-semibold text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 text-pretty">{e.exercise.name}</span>
              <span className="tnum shrink-0 text-xs text-muted">{e.startWeightLb !== null ? `${e.startWeightLb} lb` : ""}</span>
            </li>
          ))}
        </ol>
        <form action={startWorkoutFromForm} className="mt-4">
          <input type="hidden" name="routineId" value={routine.id} />
          <StartButton routineId={routine.id} />
        </form>
      </div>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5 px-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
