/** The coach's week table: what each calories cell says. */
import { fmtKcal } from "@/lib/utils/format";

/** A day more than a tenth above the target is the one the table flags. */
export function isOverTarget(kcal: number, targetKcal: number): boolean {
  return kcal > targetKcal * 1.1;
}

/** The number, with "over" spelled out when the day is flagged, so the red is never the only cue. */
export function kcalCellText(day: { kcal: number; logged: boolean }, target: { kcal: number } | null): string {
  if (!day.logged) return "·";
  const text = fmtKcal(day.kcal);
  return target && isOverTarget(day.kcal, target.kcal) ? `${text} over` : text;
}
