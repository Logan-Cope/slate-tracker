import { fmtG, fmtKcal } from "@/lib/utils/format";

type Values = { kcal: number; proteinG: number; carbsG: number | null; fatG: number | null } | null;

/** Four big numbers: calories, protein, carbs, fat. Blank while the amount is invalid. */
export function MacroGrid({ values, testId }: { values: Values; testId?: string }) {
  const cell = (label: string, text: string, color: string) => (
    <div className="rounded-2xl bg-surface-2 px-3 py-2.5 text-center">
      <div className={`tnum text-xl font-bold leading-tight ${color}`}>{text}</div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
  const g = (v: number | null | undefined) => (v === null || v === undefined ? "0" : fmtG(v));
  return (
    <div className="grid grid-cols-4 gap-2" data-testid={testId}>
      {cell("cal", values ? fmtKcal(values.kcal) : "0", "text-accent-ink")}
      {cell("protein", values ? `${g(values.proteinG)}g` : "0", "text-protein-ink")}
      {cell("carbs", values ? `${g(values.carbsG)}g` : "0", "text-carbs")}
      {cell("fat", values ? `${g(values.fatG)}g` : "0", "text-fat")}
    </div>
  );
}
