"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import { ArrowLeft, CircleCheck, Ellipsis, Plus } from "lucide-react";
import { createExerciseAction, discardWorkoutAction, finishWorkoutAction, loadExerciseHistoryAction } from "@/app/(app)/train/actions";
import { ghostForSet } from "@/lib/training/ghost";
import { createWorkoutStore, emptyClientSets, prKindsByWorkout, revivePerformances, reviveHistory, summarize, type ClientSet, type ClientWorkoutDraft, type ClientWorkoutExercise, type HistoryDTO, type WorkoutStore, storageKey } from "@/lib/training/workout-store";
import { newId } from "@/lib/utils/uuid";
import { Toast, useToast } from "@/components/nutrition/toast";
import { Sheet } from "@/components/ui/sheet";
import { DiscardSheet } from "./discard-sheet";
import { ExerciseCard } from "./exercise-card";
import { ExercisePicker } from "./exercise-picker";
import { FinishSheet, type PrLine } from "./finish-sheet";
import { fmtDuration } from "./format";
import { useNow } from "./local-time";
import { RestTimerBar } from "./rest-timer-bar";
import { TYPE_BADGE } from "./set-row";
import type { ExerciseLite, RoutineInfo } from "./types";
import { useWorkoutSync, type SyncStatus } from "./use-workout-sync";

type Props = {
  serverDraft: ClientWorkoutDraft;
  routine: RoutineInfo | null;
  history: HistoryDTO;
  exercises: ExerciseLite[];
};

type Picker = { mode: "add" } | { mode: "swap"; weId: string } | null;
type Rest = { endsAt: number; totalMs: number };

const STATUS_TEXT: Record<SyncStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline, will sync",
  error: "Not saved yet, retrying",
  failed: "Not saved",
};

const DEFAULT_REST_SECONDS = 60;
const DEFAULT_TAB_BAR = 72;
const DEFAULT_REST_BAR = 96;

function restFor(seconds: number): Rest {
  return { endsAt: Date.now() + seconds * 1000, totalMs: seconds * 1000 };
}

type PersistApi = { rehydrate: () => Promise<void> | void; clearStorage: () => void } | undefined;
function persistOf(store: WorkoutStore): PersistApi {
  return (store as { persist?: PersistApi }).persist;
}

/** The row shows a letter instead of the number for typed sets, so the type is spelled out wherever a set is named. */
function setName(set: ClientSet): string {
  const type = TYPE_BADGE[set.setType];
  return `set ${set.position + 1}${type.short ? ` (${type.label.toLowerCase()})` : ""}`;
}

function removeSetLabel(set: ClientSet): string {
  return `Remove ${setName(set)}`;
}

/** "set 2 (to failure)" at the start of a sentence. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ActiveWorkout({ serverDraft, routine, history: historyDto, exercises: initialExercises }: Props) {
  const router = useRouter();
  const [store] = useState(() => createWorkoutStore({ draft: serverDraft, history: reviveHistory(historyDto) }));
  const draft = useStore(store, (s) => s.draft);
  const history = useStore(store, (s) => s.history);
  const dirty = useStore(store, (s) => s.updatedAt > s.savedAt);
  const sync = useWorkoutSync(store);

  const [exercises, setExercises] = useState(initialExercises);
  const [rest, setRest] = useState<Rest | null>(null);
  const [tabBarHeight, setTabBarHeight] = useState(DEFAULT_TAB_BAR);
  const [restBarHeight, setRestBarHeight] = useState(DEFAULT_REST_BAR);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishNotes, setFinishNotes] = useState(serverDraft.notes ?? "");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const { toast, show: showToast, dismiss: dismissToast } = useToast();

  const finished = draft.finishedAt !== null;
  const nameOf = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);
  const infoOf = useMemo(() => new Map((routine?.exercises ?? []).map((e) => [e.exerciseId, e])), [routine]);
  const prKinds = useMemo(() => prKindsByWorkout(draft, history), [draft, history]);
  const stats = useMemo(() => summarize(draft), [draft]);
  const prLines: PrLine[] = useMemo(
    () =>
      draft.exercises.flatMap((we) =>
        we.sets
          .filter((s) => s.isPr && s.completedAt !== null)
          .map((s) => ({ setId: s.id, name: nameOf.get(we.exerciseId) ?? "Exercise", weightLb: s.weightLb, reps: s.reps, kinds: prKinds.get(s.id) ?? [] })),
      ),
    [draft, nameOf, prKinds],
  );

  const now = useNow(30_000);
  const startedMs = new Date(draft.startedAt).getTime();
  const durationText = finished
    ? fmtDuration(new Date(draft.finishedAt ?? draft.startedAt).getTime() - startedMs)
    : now === null
      ? null
      : fmtDuration(now - startedMs);

  // Local copy first: a dirty draft in localStorage beats the server copy and syncs itself.
  useEffect(() => {
    void persistOf(store)?.rehydrate();
  }, [store]);

  // The rest timer sits flush above the tab bar, whatever its rendered height is.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Main"]');
    if (!nav) return;
    const ro = new ResizeObserver(() => setTabBarHeight(Math.round(nav.getBoundingClientRect().height)));
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  const ensureHistory = (exerciseId: number) => {
    if (store.getState().history[exerciseId]) return;
    loadExerciseHistoryAction(exerciseId, draft.id)
      .then((res) => {
        if (res.ok) store.getState().setHistory(exerciseId, revivePerformances(res.history));
      })
      .catch(() => undefined);
  };

  const toggleSet = (we: ClientWorkoutExercise, set: ClientSet) => {
    const api = store.getState();
    if (set.completedAt !== null) {
      api.uncompleteSet(we.id, set.id);
      return;
    }
    const info = infoOf.get(we.exerciseId);
    const ghost = ghostForSet(history[we.exerciseId] ?? [], { routineId: draft.routineId, setIndex: set.position, startWeightLb: info?.startWeightLb ?? null });
    api.completeSet(we.id, set.id, { weightLb: set.weightLb ?? ghost.weightLb, reps: set.reps ?? ghost.reps });
    if (finished) return;
    const next = we.sets.find((s) => s.position === set.position + 1);
    if (next?.setType === "drop") return;
    // An Undo toast that is up moves above the rest timer; it stays until she dismisses it.
    setRest(restFor(info?.restSeconds ?? DEFAULT_REST_SECONDS));
  };

  const restDone = useCallback(() => setRest(null), []);
  const restExtend = useCallback(() => setRest((r) => (r ? { endsAt: r.endsAt + 30_000, totalMs: r.totalMs + 30_000 } : r)), []);

  const addExercise = (ex: ExerciseLite) => {
    const we: ClientWorkoutExercise = {
      id: newId(),
      exerciseId: ex.id,
      position: draft.exercises.length,
      supersetGroup: null,
      notes: null,
      sets: emptyClientSets(2, newId),
    };
    store.getState().addExercise(we);
    ensureHistory(ex.id);
  };

  const pickExercise = (ex: ExerciseLite) => {
    if (picker?.mode === "swap") {
      store.getState().swapExercise(picker.weId, ex.id);
      ensureHistory(ex.id);
    } else {
      addExercise(ex);
    }
    setPicker(null);
  };

  const createExercise = async (name: string): Promise<ExerciseLite | null> => {
    try {
      const res = await createExerciseAction(name);
      if (!res.ok) return null;
      setExercises((list) => (list.some((e) => e.id === res.exercise.id) ? list : [...list, res.exercise].sort((a, b) => a.name.localeCompare(b.name))));
      return res.exercise;
    } catch {
      return null;
    }
  };

  const removeSet = (we: ClientWorkoutExercise, set: ClientSet) => {
    store.getState().removeSet(we.id, set.id);
    showToast(`${capitalize(setName(set))} removed.`, "default", { label: "Undo", onClick: () => store.getState().addSetAt(we.id, set) });
  };

  const removeExercise = (we: ClientWorkoutExercise) => {
    store.getState().removeExercise(we.id);
    showToast(`${nameOf.get(we.exerciseId) ?? "Exercise"} removed.`, "default", { label: "Undo", onClick: () => store.getState().addExerciseAt(we) });
  };

  const confirmDiscard = async () => {
    if (discarding) return;
    setDiscarding(true);
    setDiscardError(null);
    // Stop the sync first so a debounced save cannot recreate the row after the delete.
    store.getState().discard();
    try {
      const res = await discardWorkoutAction(draft.id);
      if (!res.ok) {
        setDiscardError(res.error);
        setDiscarding(false);
        return;
      }
      try {
        localStorage.removeItem(storageKey(draft.id));
      } catch {
        // storage unavailable: nothing to clear
      }
      router.replace("/train");
    } catch {
      setDiscardError("Could not reach the server. Try again.");
      setDiscarding(false);
    }
  };

  const confirmFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    setFinishError(null);
    try {
      await sync.flush();
      const notes = finishNotes.trim() || null;
      const finishedAt = new Date().toISOString();
      store.getState().setNotes(notes);
      store.getState().setFinished(finishedAt);
      const stamp = store.getState().updatedAt;
      let res: Awaited<ReturnType<typeof finishWorkoutAction>>;
      try {
        res = await finishWorkoutAction({ draft: store.getState().draft, finishedAt, notes });
      } catch {
        // The server answers with a whole sentence and its own next step; these two stand in when it does not answer.
        res = {
          ok: false,
          error: navigator.onLine
            ? "Could not finish. The server did not answer; your sets are safe on this phone. Try again in a moment."
            : "Could not finish while offline. Your sets are safe on this phone; try again when you are back online.",
        };
      }
      if (!res.ok) {
        store.getState().setFinished(null);
        setFinishError(res.error);
        return;
      }
      store.getState().markSaved(stamp);
      persistOf(store)?.clearStorage();
      router.push(`/train/workout/${draft.id}/summary`);
    } finally {
      setFinishing(false);
    }
  };

  const menuWe = menuFor === null ? undefined : draft.exercises.find((e) => e.id === menuFor);
  const menuName = menuWe ? (nameOf.get(menuWe.exerciseId) ?? "Exercise") : "";

  return (
    <div className="pb-36">
      <header className="sticky top-[env(safe-area-inset-top)] z-20 flex items-center gap-2 bg-bg/90 px-3 pt-3 pb-2 backdrop-blur" data-scroll-clearance="workout">
        <Link href="/train" aria-label="Back to Train" className="tap grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted">
          <ArrowLeft size={24} aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 text-pretty text-xl font-black leading-tight tracking-tight">{draft.title}</h1>
          <p className="tnum text-pretty text-xs text-muted">
            {stats.setsDone}/{stats.setsTotal} sets
            {durationText ? ` · ${durationText}` : ""}
            <span data-testid="save-status" data-dirty={dirty ? "true" : "false"} className="ml-1.5">
              {STATUS_TEXT[sync.status] ? `· ${STATUS_TEXT[sync.status]}` : ""}
            </span>
          </p>
        </div>
        {finished ? (
          <Link
            href={`/train/workout/${draft.id}/summary`}
            className="tap inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-protein-soft px-3 text-sm font-bold text-protein-ink"
          >
            <CircleCheck size={16} aria-hidden /> Summary
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setFinishOpen(true)}
            className="tap inline-flex min-h-10 shrink-0 items-center rounded-xl bg-accent px-4 text-sm font-bold text-on-accent"
            data-testid="finish-workout"
          >
            Finish
          </button>
        )}
        {!finished ? (
          <button
            type="button"
            onClick={() => setOptionsOpen(true)}
            aria-label="Workout options"
            className="tap -mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted"
            data-testid="workout-options"
          >
            <Ellipsis size={22} aria-hidden />
          </button>
        ) : null}
      </header>
      <p role="alert" className={sync.error ? "mx-3 mb-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-danger" : ""} data-testid="sync-error">
        {sync.error}
      </p>

      {finished ? (
        <div className="mx-3 mt-1 mb-3">
          <textarea
            value={draft.notes ?? ""}
            onChange={(e) => store.getState().setNotes(e.target.value || null)}
            rows={2}
            placeholder="Workout notes"
            aria-label="Workout notes"
            className="input resize-none"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 px-3">
        {draft.exercises.map((we) => (
          <ExerciseCard
            key={we.id}
            we={we}
            name={nameOf.get(we.exerciseId) ?? "Exercise"}
            routineId={draft.routineId}
            info={infoOf.get(we.exerciseId)}
            history={history[we.exerciseId] ?? []}
            prKinds={prKinds}
            readOnly={false}
            onToggleSet={(set) => toggleSet(we, set)}
            onChangeSet={(set, patch) => store.getState().setSetValue(we.id, set.id, patch)}
            onCycleType={(set) => store.getState().cycleSetType(we.id, set.id)}
            onRemoveSet={(set) => removeSet(we, set)}
            onAddSet={() => store.getState().addSet(we.id, newId())}
            onNotesChange={(text) => store.getState().setExerciseNotes(we.id, text)}
            onMenu={() => setMenuFor(we.id)}
          />
        ))}
        <button type="button" onClick={() => setPicker({ mode: "add" })} className="btn-secondary w-full" data-testid="add-exercise">
          <Plus size={18} aria-hidden /> Add exercise
        </button>
      </div>

      <Sheet open={optionsOpen} onClose={() => setOptionsOpen(false)} title={draft.title} compact>
        <ul className="divide-y divide-line">
          <MenuItem
            label="Discard workout"
            danger
            testId="discard-workout"
            onClick={() => {
              setOptionsOpen(false);
              setDiscardOpen(true);
            }}
          />
        </ul>
      </Sheet>

      <DiscardSheet
        open={discardOpen}
        setsDone={stats.setsDone}
        pending={discarding}
        error={discardError}
        onClose={() => {
          if (!discarding) setDiscardOpen(false);
        }}
        onConfirm={confirmDiscard}
      />

      {rest && !finished ? (
        <RestTimerBar
          endsAt={rest.endsAt}
          totalMs={rest.totalMs}
          bottomOffset={tabBarHeight}
          onExtend={restExtend}
          onSkip={restDone}
          onDone={restDone}
          onResize={setRestBarHeight}
        />
      ) : null}

      <Sheet open={menuWe !== undefined} onClose={() => setMenuFor(null)} title={menuName} compact>
        {menuWe ? (
          <ul className="divide-y divide-line">
            <MenuItem
              label="Swap exercise"
              onClick={() => {
                setPicker({ mode: "swap", weId: menuWe.id });
                setMenuFor(null);
              }}
            />
            {menuWe.notes === null ? (
              <MenuItem
                label="Add a note"
                onClick={() => {
                  store.getState().setExerciseNotes(menuWe.id, "");
                  setMenuFor(null);
                }}
              />
            ) : null}
            {menuWe.sets.map((set) => (
              <MenuItem
                key={set.id}
                label={removeSetLabel(set)}
                testId={`remove-set-${set.id}`}
                onClick={() => {
                  removeSet(menuWe, set);
                  setMenuFor(null);
                }}
              />
            ))}
            <MenuItem
              label="Remove exercise"
              danger
              onClick={() => {
                removeExercise(menuWe);
                setMenuFor(null);
              }}
            />
          </ul>
        ) : null}
      </Sheet>

      <ExercisePicker
        open={picker !== null}
        title={picker?.mode === "swap" ? "Swap exercise" : "Add exercise"}
        exercises={exercises}
        onClose={() => setPicker(null)}
        onPick={pickExercise}
        onCreate={createExercise}
      />

      <FinishSheet
        open={finishOpen}
        stats={stats}
        prs={prLines}
        notes={finishNotes}
        pending={finishing}
        error={finishError}
        onNotesChange={setFinishNotes}
        onClose={() => {
          if (!finishing) setFinishOpen(false);
        }}
        onConfirm={confirmFinish}
      />

      <Toast toast={toast} onDismiss={dismissToast} bottomOffset={rest && !finished ? tabBarHeight + restBarHeight + 4 : undefined} />
    </div>
  );
}

function MenuItem({ label, onClick, danger, testId }: { label: string; onClick: () => void; danger?: boolean; testId?: string }) {
  return (
    <li>
      <button type="button" onClick={onClick} data-testid={testId} className={`tap w-full py-3.5 text-left text-base font-semibold ${danger ? "text-danger" : ""}`}>
        {label}
      </button>
    </li>
  );
}
