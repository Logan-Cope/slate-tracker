import { Ring } from "@/components/ui/ring";
import { ProgressBar } from "@/components/ui/progress-bar";
import { fmtG, fmtKcal } from "@/lib/utils/format";
import type { TargetDto, Totals } from "./types";

type Props = { totals: Totals; target: TargetDto | null };

/** Calories ring (remaining) beside the protein bar and small carbs / fat totals. */
export function SummaryCard({ totals, target }: Props) {
  const left = target ? target.kcal - totals.kcal : null;
  const over = left !== null && left < 0;
  const headline = left === null ? fmtKcal(totals.kcal) : over ? `+${fmtKcal(-left)}` : fmtKcal(left);
  const caption = left === null ? "eaten" : over ? "over" : "left";

  return (
    <section className="card mx-5 flex items-center gap-5 p-5" aria-label="Day summary">
      <Ring value={target ? totals.kcal / target.kcal : 0} size={136} stroke={12} label="Calories">
        <div>
          <div data-testid="kcal-left" className={`tnum text-[1.9rem] font-black leading-none tracking-tight ${over ? "text-danger" : ""}`}>
            {headline}
          </div>
          <div className="mt-1 text-xs font-semibold text-muted">{caption}</div>
        </div>
      </Ring>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-protein-ink">Protein</span>
          <span data-testid="protein-total" className="tnum text-sm font-semibold">
            {fmtG(totals.proteinG)}
            {target ? ` / ${target.proteinG} g` : " g"}
          </span>
        </div>
        <div className="mt-1.5">
          <ProgressBar value={target ? totals.proteinG / target.proteinG : 0} label="Protein" />
        </div>

        <div className="tnum mt-4 flex items-center gap-4 text-xs text-muted">
          <span>
            <span className="font-bold text-carbs">C</span> {fmtG(totals.carbsG)} g
          </span>
          <span>
            <span className="font-bold text-fat">F</span> {fmtG(totals.fatG)} g
          </span>
          {target ? (
            <span className="ml-auto" data-testid="kcal-eaten">
              {fmtKcal(totals.kcal)} / {fmtKcal(target.kcal)}
            </span>
          ) : null}
        </div>
        {!target ? <p className="mt-2 text-xs text-muted">Set targets in Coach</p> : null}
      </div>
    </section>
  );
}
