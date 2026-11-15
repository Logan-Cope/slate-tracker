/**
 * Formatting shared by server pages and client components. No directive on
 * purpose: a "use client" module would turn these into client references.
 */
import type { PrKind } from "@/lib/training/prs";
import type { WorkoutSummaryDTO } from "@/lib/training/workout-store";
import { fmtWeight } from "@/lib/utils/format";

export function fmtVolume(lb: number): string {
  return Math.round(lb).toLocaleString("en-US");
}

export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "14 sets · 6,240 lb · 2 PR"; the PR part only when there is one. */
export function workoutStatsLine(w: Pick<WorkoutSummaryDTO, "setCount" | "volumeLb" | "prCount">): string {
  const parts = [`${w.setCount} ${w.setCount === 1 ? "set" : "sets"}`, `${fmtVolume(w.volumeLb)} lb`];
  if (w.prCount > 0) parts.push(`${w.prCount} PR`);
  return parts.join(" · ");
}

export const PR_LABEL: Record<PrKind, string> = {
  weight: "weight",
  e1rm: "estimated 1RM",
  volume: "set volume",
};

/** "weight, estimated 1RM and set volume" */
export function prText(kinds: PrKind[]): string {
  const labels = kinds.map((k) => PR_LABEL[k]);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** "110 × 11, new best weight" */
export function prLineText(pr: { weightLb: number | null; reps: number | null; kinds: PrKind[] }): string {
  const nums = [pr.weightLb !== null ? fmtWeight(pr.weightLb) : null, pr.reps !== null ? String(pr.reps) : null].filter((x) => x !== null);
  const what = pr.kinds.length > 0 ? `new best ${prText(pr.kinds)}` : "personal record";
  return `${nums.join(" × ")}, ${what}`;
}
