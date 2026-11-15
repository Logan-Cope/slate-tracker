"use client";

import Link from "next/link";
import { ChevronRight, Ellipsis, Plus, TrendingUp } from "lucide-react";
import { ghostForSet, progressionHint, type HistoricalPerformance } from "@/lib/training/ghost";
import type { PrKind } from "@/lib/training/prs";
import type { ClientSet, ClientWorkoutExercise } from "@/lib/training/workout-store";
import { SetRow } from "./set-row";
import type { RoutineExerciseInfo } from "./types";

type Props = {
  we: ClientWorkoutExercise;
  name: string;
  routineId: number | null;
  info: RoutineExerciseInfo | undefined;
  history: HistoricalPerformance[];
  prKinds: Map<string, PrKind[]>;
  readOnly: boolean;
  onToggleSet: (set: ClientSet) => void;
  onChangeSet: (set: ClientSet, patch: { weightLb?: number | null; reps?: number | null }) => void;
  onCycleType: (set: ClientSet) => void;
  onRemoveSet: (set: ClientSet) => void;
  onAddSet: () => void;
  onNotesChange: (notes: string) => void;
  onMenu: () => void;
};

function schemeLine(info: RoutineExerciseInfo | undefined): string | null {
  if (!info) return null;
  const parts: string[] = [];
  if (info.repScheme) parts.push(info.repScheme);
  if (info.tempo) parts.push(`tempo ${info.tempo}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function ExerciseCard({
  we,
  name,
  routineId,
  info,
  history,
  prKinds,
  readOnly,
  onToggleSet,
  onChangeSet,
  onCycleType,
  onRemoveSet,
  onAddSet,
  onNotesChange,
  onMenu,
}: Props) {
  const scheme = schemeLine(info);
  const hint = progressionHint(history, { routineId });
  const done = we.sets.filter((s) => s.completedAt !== null).length;

  return (
    <section className="card overflow-hidden" data-testid={`exercise-${we.id}`} aria-label={name}>
      <div className="flex items-start gap-2 px-4 pt-3">
        <Link href={`/train/exercise/${we.exerciseId}`} className="tap min-w-0 flex-1">
          <h2 className="flex items-center gap-1 text-lg font-bold leading-tight">
            <span className="min-w-0 text-pretty">{name}</span>
            <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
          </h2>
        </Link>
        <span className="tnum mt-0.5 shrink-0 text-xs font-semibold text-muted">
          {done}/{we.sets.length}
        </span>
        <button type="button" onClick={onMenu} aria-label={`${name} options`} className="tap -mr-2 -mt-1.5 grid h-10 w-10 place-items-center rounded-full text-muted">
          <Ellipsis size={22} aria-hidden />
        </button>
      </div>
      {scheme ? <p className="px-4 pt-0.5 text-xs text-muted">{scheme}</p> : null}
      {hint === "increase" ? (
        <div className="px-4 pt-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-ink">
            <TrendingUp size={14} aria-hidden /> Go up in weight
          </span>
        </div>
      ) : null}
      {info?.coachNote ? <div className="mx-4 mt-2 rounded-xl bg-accent-soft px-3 py-2 text-sm leading-snug text-accent-ink">{info.coachNote}</div> : null}
      {we.notes !== null ? (
        <div className="px-4 pt-2">
          <textarea
            value={we.notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Notes for this exercise"
            rows={2}
            readOnly={readOnly}
            aria-label={`${name} notes`}
            className="input resize-none"
          />
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-[2.5rem_1fr_1fr_3rem] gap-2 px-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span>Set</span>
        <span>lb</span>
        <span>Reps</span>
        <span aria-hidden />
      </div>
      <div className="mt-1 divide-y divide-line border-t border-line">
        {we.sets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            ghost={ghostForSet(history, { routineId, setIndex: set.position, startWeightLb: info?.startWeightLb ?? null })}
            prKinds={prKinds.get(set.id)}
            readOnly={readOnly}
            onToggle={() => onToggleSet(set)}
            onChange={(patch) => onChangeSet(set, patch)}
            onCycleType={() => onCycleType(set)}
            onRemove={() => onRemoveSet(set)}
          />
        ))}
      </div>
      {!readOnly ? (
        <button type="button" onClick={onAddSet} className="tap flex w-full items-center justify-center gap-1 border-t border-line py-3 text-sm font-bold text-accent-ink focus-visible:-outline-offset-2">
          <Plus size={16} aria-hidden /> Add set
        </button>
      ) : null}
    </section>
  );
}
