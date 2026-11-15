/**
 * Optimistic edits to the diary list, and the payload that puts a deleted
 * entry back. Pure: no React, no DB.
 */
import type { EntryDto, MealSlot } from "./types";

export type Patch =
  | { type: "delete"; id: string }
  | { type: "deleteMany"; ids: readonly string[] }
  | { type: "update"; id: string; changes: Partial<EntryDto> }
  | { type: "insert"; entry: EntryDto };

/** Insert keeps the server's loggedAt order and never duplicates an id the server already sent back. */
export function applyPatch(entries: EntryDto[], patch: Patch): EntryDto[] {
  if (patch.type === "delete") return entries.filter((e) => e.id !== patch.id);
  if (patch.type === "deleteMany") {
    const gone = new Set(patch.ids);
    return entries.filter((e) => !gone.has(e.id));
  }
  if (patch.type === "update") return entries.map((e) => (e.id === patch.id ? { ...e, ...patch.changes } : e));
  if (entries.some((e) => e.id === patch.entry.id)) return entries;
  return [...entries, patch.entry].sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : a.loggedAt > b.loggedAt ? 1 : 0));
}

type RestoreBase = { id: string; date: string; meal: MealSlot; loggedAt: string };

export type RestoreInput =
  | { kind: "food"; input: RestoreBase & { foodId: number; qty: number; unit: string; restore: true } }
  | {
      kind: "quick";
      input: RestoreBase & {
        kcal: number;
        proteinG: number;
        name: string;
        brand: string | null;
        qty: number;
        unit: string;
        grams: number | null;
        carbsG: number | null;
        fatG: number | null;
      };
    };

/**
 * What to send back through the existing log actions after an undo. The same
 * client id makes the insert the idempotent upsert the actions already are,
 * and the original loggedAt puts the row back where it was. A food entry is
 * recomputed from its food and marked as a restore so it is not counted as a
 * fresh log in her go-tos; an entry with no food left (a quick add, or a food
 * she has since deleted) carries its whole snapshot so nothing is lost.
 */
export function restoreInput(entry: EntryDto): RestoreInput {
  const base: RestoreBase = { id: entry.id, date: entry.date, meal: entry.meal, loggedAt: entry.loggedAt };
  if (entry.foodId !== null) return { kind: "food", input: { ...base, foodId: entry.foodId, qty: entry.qty, unit: entry.unit, restore: true } };
  return {
    kind: "quick",
    input: {
      ...base,
      kcal: entry.kcal,
      proteinG: entry.proteinG,
      name: entry.name,
      brand: entry.brand,
      qty: entry.qty,
      unit: entry.unit,
      grams: entry.grams,
      carbsG: entry.carbsG,
      fatG: entry.fatG,
    },
  };
}
