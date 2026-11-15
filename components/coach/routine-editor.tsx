"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { RoutineFull, RoutineExerciseFull } from "@/lib/db/queries/training";
import {
  addRoutineExerciseAction,
  deleteRoutineAction,
  moveRoutineExerciseAction,
  removeRoutineExerciseAction,
  renameRoutineAction,
  updateRoutineExerciseAction,
} from "@/app/(app)/coach/actions";
import { Sheet } from "@/components/ui/sheet";
import { ConfirmButton } from "./confirm-button";

type Props = { routine: RoutineFull; libraryNames: string[] };

export function RoutineEditor({ routine, libraryNames }: Props) {
  const [editing, setEditing] = useState<RoutineExerciseFull | null>(null);
  const [adding, setAdding] = useState(false);
  const listId = `exercise-names-${routine.id}`;

  return (
    <section className="card mx-5 p-4" data-testid={`routine-${routine.id}`}>
      <form action={renameRoutineAction.bind(null, routine.id)} className="flex items-center gap-2">
        <input name="name" defaultValue={routine.name} className="input font-bold" aria-label="Routine name" />
        <button type="submit" className="btn-secondary shrink-0 px-3" aria-label="Save name">
          Save
        </button>
      </form>

      <ol className="mt-3 divide-y divide-line">
        {routine.exercises.map((re, i) => (
          <li key={re.id} className="py-2.5 flex items-start gap-2" data-testid={`routine-exercise-${re.id}`}>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-pretty break-words">{re.exercise.name}</div>
              <div className="text-xs text-muted mt-0.5">
                {re.targetSets} sets{re.repScheme ? ` · ${re.repScheme}` : ""}
                {re.tempo ? ` · tempo ${re.tempo}` : ""} · rest {re.restSeconds}s
                {re.startWeightLb !== null ? ` · start ${re.startWeightLb} lb` : ""}
              </div>
              {re.coachNote ? <div className="text-xs text-accent-ink bg-accent-soft rounded-md px-2 py-1 mt-1">{re.coachNote}</div> : null}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <form action={moveRoutineExerciseAction.bind(null, routine.id, re.id, "up")}>
                <MoveButton atEdge={i === 0} label="Move up">
                  <ArrowUp size={16} aria-hidden />
                </MoveButton>
              </form>
              <form action={moveRoutineExerciseAction.bind(null, routine.id, re.id, "down")}>
                <MoveButton atEdge={i === routine.exercises.length - 1} label="Move down">
                  <ArrowDown size={16} aria-hidden />
                </MoveButton>
              </form>
              <button type="button" className="tap p-1.5 text-accent" onClick={() => setEditing(re)} aria-label={`Edit ${re.exercise.name}`}>
                <Pencil size={16} />
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center justify-between">
        <button type="button" className="btn-secondary py-2 min-h-0 text-sm" onClick={() => setAdding(true)} data-testid={`routine-${routine.id}-add-exercise`}>
          <Plus size={16} /> Add exercise
        </button>
        <ConfirmButton
          action={deleteRoutineAction.bind(null, routine.id)}
          label="Delete routine"
          confirm={`Delete "${routine.name}"?`}
          body="Its exercises and their settings are removed. Finished workouts stay in history."
        />
      </div>

      <datalist id={listId}>
        {libraryNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add exercise">
        <ExerciseForm
          listId={listId}
          action={async (fd) => {
            await addRoutineExerciseAction(routine.id, fd);
            setAdding(false);
          }}
          submitLabel="Add to routine"
        />
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.exercise.name}` : undefined}>
        {editing ? (
          <ExerciseForm
            listId={listId}
            initial={editing}
            action={async (fd) => {
              await updateRoutineExerciseAction(editing.id, fd);
              setEditing(null);
            }}
            submitLabel="Save"
            onRemove={async () => {
              await removeRoutineExerciseAction(editing.id);
              setEditing(null);
            }}
          />
        ) : null}
      </Sheet>
    </section>
  );
}

function ExerciseForm({
  listId,
  initial,
  action,
  submitLabel,
  onRemove,
}: {
  listId: string;
  initial?: RoutineExerciseFull;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  onRemove?: () => Promise<void>;
}) {
  // Removing an exercise from the routine takes two taps, like deleting a food: the first arms, the second fires.
  const [armed, setArmed] = useState(false);
  return (
    <form action={action} className="space-y-3 pb-2">
      <label className="block">
        <span className="text-xs font-medium text-muted">Exercise (pick from the list or type a new one)</span>
        <input name="exerciseName" list={listId} defaultValue={initial?.exercise.name ?? ""} className="input mt-1" required={!initial} autoComplete="off" data-testid="exercise-name" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Small name="targetSets" label="Sets" defaultValue={initial?.targetSets ?? 2} />
        <Small name="restSeconds" label="Rest (s)" defaultValue={initial?.restSeconds ?? 60} />
        <Small name="startWeightLb" label="Start weight (lb)" defaultValue={initial?.startWeightLb ?? ""} decimal />
        <label className="block">
          <span className="text-xs font-medium text-muted">Tempo</span>
          <input name="tempo" defaultValue={initial?.tempo ?? "2-1-2-0"} className="input mt-1" />
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-muted">Rep scheme</span>
        <input name="repScheme" defaultValue={initial?.repScheme ?? "Set 1: 8-12 · Set 2: to failure"} className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted">Coach note</span>
        <textarea name="coachNote" defaultValue={initial?.coachNote ?? ""} className="input mt-1" rows={2} />
      </label>
      <div className="flex items-center justify-between gap-3 pt-1">
        <button type="submit" className="btn-primary" data-testid="exercise-save">
          {submitLabel}
        </button>
        {onRemove ? (
          <button
            type="button"
            className={`tap inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold ${armed ? "bg-danger text-on-danger" : "text-danger"}`}
            onClick={() => (armed ? void onRemove() : setArmed(true))}
          >
            <Trash2 size={16} aria-hidden /> {armed ? "Tap again to remove" : "Remove from routine"}
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** A reorder arrow. At the end of the list it stays focusable and visibly dimmed, and a tap does nothing. */
function MoveButton({ atEdge, label, children }: { atEdge: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="tap p-1.5 text-muted aria-disabled:opacity-30"
      aria-disabled={atEdge}
      onClick={(e) => {
        if (atEdge) e.preventDefault();
      }}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function Small({ name, label, defaultValue, decimal }: { name: string; label: string; defaultValue: number | string; decimal?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input name={name} type="text" inputMode={decimal ? "decimal" : "numeric"} defaultValue={defaultValue} className="input mt-1 tnum" />
    </label>
  );
}
