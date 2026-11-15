/**
 * Selection for the diary's edit mode. Pure: no React, no DB. Every helper
 * returns a new Set so a state setter sees the change.
 */

export type GroupState = "none" | "some" | "all";

/** Flips one id in or out of the selection. */
export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** A meal's circle: selects every id while any is missing, clears them all once every one is in. */
export function toggleGroup(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(selected);
  if (groupState(selected, ids) === "all") {
    for (const id of ids) next.delete(id);
  } else {
    for (const id of ids) next.add(id);
  }
  return next;
}

/** How much of a group is selected; an empty group is "none". */
export function groupState(selected: ReadonlySet<string>, ids: readonly string[]): GroupState {
  if (ids.length === 0) return "none";
  let count = 0;
  for (const id of ids) if (selected.has(id)) count++;
  if (count === 0) return "none";
  return count === ids.length ? "all" : "some";
}

export function selectAll(ids: readonly string[]): Set<string> {
  return new Set(ids);
}
