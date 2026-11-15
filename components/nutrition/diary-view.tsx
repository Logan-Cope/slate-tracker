"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Copy, MoreHorizontal } from "lucide-react";
import {
  copyDayAction,
  copyEntriesAction,
  copyMealAction,
  deleteEntriesAction,
  deleteEntryAction,
  explodeEntryAction,
  logFoodAction,
  quickAddAction,
  updateEntryAction,
} from "@/app/(app)/today/actions";
import { humanDate, shiftDate } from "@/lib/utils/date";
import { newId } from "@/lib/utils/uuid";
import { safeCompute, sumDtos } from "./amounts";
import { CopySheet } from "./copy-sheet";
import { DateStrip } from "./date-strip";
import { applyPatch, restoreInput, type Patch } from "./diary-patch";
import { EditBar } from "./edit-bar";
import { EntrySheet, type EntryPatch } from "./entry-sheet";
import { useTodayLocal } from "./hooks";
import { MealSection } from "./meal-section";
import { MenuSheet, type MenuItem } from "./menu-sheet";
import { groupState, selectAll, toggleGroup, toggleOne } from "./selection";
import { SummaryCard } from "./summary-card";
import { Toast, useToast, type ToastAction } from "./toast";
import { MEAL_LABELS, MEAL_SLOTS, type DiaryDto, type EntryDto, type FoodSummary, type MealSlot } from "./types";

type Props = {
  diary: DiaryDto;
  /** Foods behind the entries that still link to one, for unit chips and live math. */
  foods: Record<number, FoodSummary>;
  yesterdayHas: Record<MealSlot, boolean>;
  serverToday: string;
  /** False when the URL carried no date, so the phone's clock may override the server's. */
  dateFromUrl: boolean;
};

type Target = { kind: "day" } | { kind: "meal"; meal: MealSlot };
/** What a copy sheet is copying: the day, a meal, or the rows picked in edit mode. */
type CopyTarget = Target | { kind: "entries"; ids: string[] };

const EMPTY: ReadonlySet<string> = new Set();

const HEADER_TEXT_BUTTON = "tap min-h-11 rounded-full px-3 text-sm font-semibold text-accent-ink active:bg-surface-2";

export function DiaryView({ diary, foods, yesterdayHas, serverToday, dateFromUrl }: Props) {
  const router = useRouter();
  const today = useTodayLocal(serverToday);
  const date = diary.date;
  const [entries, patchEntries] = useOptimistic(diary.entries, applyPatch);
  const [pending, startTransition] = useTransition();
  const { toast, show, dismiss } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [menu, setMenu] = useState<Target | null>(null);
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const [copyingMeal, setCopyingMeal] = useState<MealSlot | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY);
  /** The Edit / Done button: one node in both modes, so focus survives the switch. */
  const editButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dateFromUrl && today !== date) router.replace(`/today?date=${today}`);
  }, [dateFromUrl, today, date, router]);

  // Edit mode ends on its own once the diary is empty. The set runs during
  // render, as React allows for state that follows the data it describes.
  if (editing && entries.length === 0) {
    setEditing(false);
    setSelected(EMPTY);
  }

  const openEntry = openId ? (entries.find((e) => e.id === openId) ?? null) : null;
  const openFood = openEntry && openEntry.foodId !== null ? (foods[openEntry.foodId] ?? null) : null;
  const allIds = entries.map((e) => e.id);
  const selectedEntries = entries.filter((e) => selected.has(e.id));
  const allSelected = groupState(selected, allIds) === "all";

  function exitEditing() {
    setEditing(false);
    setSelected(EMPTY);
  }

  /** The bar that had focus is gone with edit mode; land on Edit, or on the page when the diary emptied. */
  function focusAfterBar() {
    requestAnimationFrame(() => (editButtonRef.current ?? document.getElementById("main"))?.focus());
  }

  /** One optimistic mutation: patch the list, run the action, then confirm or say what failed and what to do. */
  function run(patch: Patch | Patch[] | null, work: () => Promise<unknown>, done?: () => void, fail?: { text: string; action?: ToastAction }) {
    startTransition(async () => {
      if (patch) for (const p of Array.isArray(patch) ? patch : [patch]) patchEntries(p);
      try {
        await work();
        done?.();
      } catch {
        show(fail?.text ?? "That did not save. Try again.", "danger", fail?.action);
      }
    });
  }

  function saveEntry(patch: EntryPatch) {
    if (!openEntry) return;
    const id = openEntry.id;
    setOpenId(null);
    if (patch.kind === "amount") {
      const c = openFood ? safeCompute(openFood, patch.qty, patch.unit) : null;
      const changes: Partial<EntryDto> = c
        ? { qty: c.qty, unit: c.unit, grams: c.grams, kcal: c.kcal, proteinG: c.proteinG, carbsG: c.carbsG, fatG: c.fatG }
        : { qty: patch.qty, unit: patch.unit };
      run({ type: "update", id, changes }, () => updateEntryAction({ id, qty: patch.qty, unit: patch.unit }));
    } else {
      const name = patch.name || openEntry.name;
      run({ type: "update", id, changes: { kcal: patch.kcal, proteinG: patch.proteinG, name } }, () =>
        updateEntryAction({ id, kcal: patch.kcal, proteinG: patch.proteinG, name }),
      );
    }
  }

  function moveEntry(meal: MealSlot) {
    if (!openEntry) return;
    const id = openEntry.id;
    setOpenId(null);
    run({ type: "update", id, changes: { meal } }, () => updateEntryAction({ id, meal }), () => show(`Moved to ${MEAL_LABELS[meal]}`));
  }

  function deleteEntry() {
    if (!openEntry) return;
    const entry = openEntry;
    setOpenId(null);
    run(
      { type: "delete", id: entry.id },
      async () => {
        const res = await deleteEntryAction({ id: entry.id });
        if (!res.ok) throw new Error("Entry not found");
      },
      () => show("Deleted.", "default", { label: "Undo", onClick: () => restoreEntry(entry) }),
      { text: "Could not delete that. Try again." },
    );
  }

  /** The action that puts one deleted entry back under its own id, so the server sees the same row it had. */
  function restoreWork(entry: EntryDto) {
    const restore = restoreInput(entry);
    return restore.kind === "food" ? logFoodAction(restore.input) : quickAddAction(restore.input);
  }

  function restoreEntry(entry: EntryDto) {
    run({ type: "insert", entry }, () => restoreWork(entry), undefined, {
      text: `Could not put ${entry.name} back.`,
      action: { label: "Retry", onClick: () => restoreEntry(entry) },
    });
  }

  /** Edit mode's Delete: every chosen row goes at once, and one Undo puts them all back. */
  function deleteSelected() {
    const victims = selectedEntries;
    if (victims.length === 0) return;
    const ids = victims.map((e) => e.id);
    const n = victims.length;
    exitEditing();
    focusAfterBar();
    let deleted = n;
    run(
      { type: "deleteMany", ids },
      async () => {
        deleted = (await deleteEntriesAction({ ids })).deleted;
      },
      () => {
        if (deleted === 0) {
          show("Those were already gone. Reload to update the list.", "danger");
          return;
        }
        show(`Deleted ${deleted} ${deleted === 1 ? "item" : "items"}.`, "default", { label: "Undo", onClick: () => restoreEntries(victims) });
      },
      { text: "Could not delete those. Try again." },
    );
  }

  function restoreEntries(list: EntryDto[]) {
    const n = list.length;
    run(
      list.map((entry): Patch => ({ type: "insert", entry })),
      () => Promise.all(list.map(restoreWork)),
      undefined,
      { text: `Could not put ${n} ${n === 1 ? "item" : "items"} back.`, action: { label: "Retry", onClick: () => restoreEntries(list) } },
    );
  }

  function copySelected() {
    const ids = selectedEntries.map((e) => e.id);
    if (ids.length > 0) setCopyTarget({ kind: "entries", ids });
  }

  function copyTomorrow() {
    if (!openEntry) return;
    const id = openEntry.id;
    const toDate = shiftDate(date, 1);
    setOpenId(null);
    run(null, () => copyEntriesAction({ ids: [id], toDate, newIds: [newId()] }), () => show(`Copied to ${humanDate(toDate, today)}`));
  }

  function splitEntry() {
    if (!openEntry) return;
    const id = openEntry.id;
    setOpenId(null);
    run(null, () => explodeEntryAction({ id }), () => show("Split into items"));
  }

  function copyYesterday(meal: MealSlot) {
    setCopyingMeal(meal);
    startTransition(async () => {
      try {
        const rows = await copyMealAction({ fromDate: shiftDate(date, -1), meal, toDate: date });
        if (rows.length === 0) show(`Nothing to copy. Yesterday's ${MEAL_LABELS[meal].toLowerCase()} is empty.`, "default", undefined, { sticky: true });
        else show(`Copied ${rows.length} ${rows.length === 1 ? "item" : "items"}`);
      } catch {
        show("That did not save. Try again.", "danger");
      } finally {
        setCopyingMeal(null);
      }
    });
  }

  function confirmCopy(toDate: string) {
    const target = copyTarget;
    setCopyTarget(null);
    if (!target) return;
    if (target.kind === "entries") {
      exitEditing();
      focusAfterBar();
    }
    const work =
      target.kind === "day"
        ? () => copyDayAction({ fromDate: date, toDate })
        : target.kind === "meal"
          ? () => copyMealAction({ fromDate: date, meal: target.meal, toDate })
          : () => copyEntriesAction({ ids: target.ids, toDate, newIds: target.ids.map(() => newId()) });
    run(null, work, () => show(`Copied to ${humanDate(toDate, today)}`));
  }

  const menuItems: MenuItem[] = !menu
    ? []
    : menu.kind === "day"
      ? [
          {
            label: "Copy day to another day",
            icon: <Copy size={20} aria-hidden />,
            testId: "copy-day",
            onSelect: () => {
              setMenu(null);
              setCopyTarget({ kind: "day" });
            },
          },
          ...(date !== today
            ? [
                {
                  label: "Go to today",
                  icon: <CalendarDays size={20} aria-hidden />,
                  testId: "go-today",
                  onSelect: () => {
                    setMenu(null);
                    router.push(`/today?date=${today}`);
                  },
                },
              ]
            : []),
        ]
      : [
          {
            label: `Copy ${MEAL_LABELS[menu.meal].toLowerCase()} to another day`,
            icon: <Copy size={20} aria-hidden />,
            testId: "copy-meal",
            onSelect: () => {
              setMenu(null);
              setCopyTarget({ kind: "meal", meal: menu.meal });
            },
          },
          ...(yesterdayHas[menu.meal]
            ? [
                {
                  label: `Copy yesterday's ${MEAL_LABELS[menu.meal].toLowerCase()} here`,
                  icon: <CalendarDays size={20} aria-hidden />,
                  testId: "menu-copy-yesterday",
                  onSelect: () => {
                    const meal = menu.meal;
                    setMenu(null);
                    copyYesterday(meal);
                  },
                },
              ]
            : []),
        ];

  return (
    <div className={editing ? "pb-28" : "pb-6"} data-testid="diary" data-date={date}>
      {pending ? <div className="fixed inset-x-0 top-0 z-50 h-0.5 motion-safe:animate-pulse bg-accent" aria-hidden /> : null}

      {/* The first child is the same button in both modes (Edit, then Done), so the switch keeps focus. */}
      <div className="flex items-center gap-1 px-2 pb-3 pt-2">
        {editing || entries.length > 0 ? (
          <button
            ref={editButtonRef}
            type="button"
            data-testid={editing ? "diary-done" : "diary-edit"}
            onClick={() => (editing ? exitEditing() : setEditing(true))}
            className={HEADER_TEXT_BUTTON}
          >
            {editing ? "Done" : "Edit"}
          </button>
        ) : null}
        {editing ? (
          <span className="min-w-0 flex-1 truncate text-center text-lg font-bold" data-testid="edit-date">
            {humanDate(date, today)}
          </span>
        ) : (
          <div className="min-w-0 flex-1">
            <DateStrip date={date} today={today} onChange={(d) => router.push(`/today?date=${d}`)} />
          </div>
        )}
        {editing ? (
          <button type="button" data-testid="select-all" onClick={() => setSelected(allSelected ? EMPTY : selectAll(allIds))} className={HEADER_TEXT_BUTTON}>
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        ) : (
          <button
            type="button"
            aria-label="Day options"
            data-testid="day-menu"
            onClick={() => setMenu({ kind: "day" })}
            className="tap grid h-11 w-11 place-items-center rounded-full text-muted active:bg-surface-2"
          >
            <MoreHorizontal size={24} />
          </button>
        )}
      </div>

      <SummaryCard totals={sumDtos(entries)} target={diary.target} />

      <div className="mt-4 flex flex-col gap-4">
        {MEAL_SLOTS.map((meal) => {
          const mealEntries = entries.filter((e) => e.meal === meal);
          return (
            <MealSection
              key={meal}
              meal={meal}
              date={date}
              entries={mealEntries}
              foods={foods}
              canCopyYesterday={yesterdayHas[meal]}
              copying={copyingMeal === meal}
              editing={editing}
              selected={selected}
              onOpenEntry={setOpenId}
              onToggleEntry={(id) => setSelected((s) => toggleOne(s, id))}
              onToggleMeal={() =>
                setSelected((s) =>
                  toggleGroup(
                    s,
                    mealEntries.map((e) => e.id),
                  ),
                )
              }
              onCopyYesterday={() => copyYesterday(meal)}
              onMenu={() => setMenu({ kind: "meal", meal })}
            />
          );
        })}
      </div>

      {editing ? <EditBar count={selectedEntries.length} onCopy={copySelected} onDelete={deleteSelected} /> : null}

      <EntrySheet
        entry={openEntry}
        food={openFood}
        onClose={() => setOpenId(null)}
        onSave={saveEntry}
        onMove={moveEntry}
        onCopyTomorrow={copyTomorrow}
        onSplit={splitEntry}
        onDelete={deleteEntry}
      />
      <MenuSheet
        open={menu !== null}
        title={menu?.kind === "meal" ? MEAL_LABELS[menu.meal] : humanDate(date, today)}
        items={menuItems}
        onClose={() => setMenu(null)}
      />
      <CopySheet
        open={copyTarget !== null}
        title={
          copyTarget?.kind === "meal"
            ? `Copy ${MEAL_LABELS[copyTarget.meal].toLowerCase()} to`
            : copyTarget?.kind === "entries"
              ? `Copy ${copyTarget.ids.length} ${copyTarget.ids.length === 1 ? "item" : "items"} to`
              : "Copy day to"
        }
        fromDate={date}
        today={today}
        onClose={() => setCopyTarget(null)}
        onConfirm={confirmCopy}
      />
      <Toast toast={toast} onDismiss={dismiss} raised={editing} />
    </div>
  );
}
