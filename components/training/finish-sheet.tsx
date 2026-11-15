"use client";

import { Trophy } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import type { PrKind } from "@/lib/training/prs";
import type { WorkoutSummaryStats } from "@/lib/training/workout-store";
import { fmtVolume, prLineText } from "./format";

export type PrLine = { setId: string; name: string; weightLb: number | null; reps: number | null; kinds: PrKind[] };

type Props = {
  open: boolean;
  stats: WorkoutSummaryStats;
  prs: PrLine[];
  notes: string;
  pending: boolean;
  error: string | null;
  onNotesChange: (text: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function FinishSheet({ open, stats, prs, notes, pending, error, onNotesChange, onClose, onConfirm }: Props) {
  const skipped = stats.setsTotal - stats.setsDone;
  return (
    <Sheet open={open} onClose={onClose} title="Finish workout">
      <div className="grid grid-cols-3 divide-x divide-line rounded-2xl bg-surface-2 py-3 text-center">
        <Stat value={String(stats.setsDone)} label={stats.setsDone === 1 ? "set" : "sets"} />
        <Stat value={fmtVolume(stats.volumeLb)} label="lb moved" />
        <Stat value={String(stats.prCount)} label={stats.prCount === 1 ? "PR" : "PRs"} accent={stats.prCount > 0} />
      </div>
      {skipped > 0 ? (
        <p className="mt-3 text-sm text-muted">
          {skipped} {skipped === 1 ? "set was" : "sets were"} not logged. That is fine; they stay empty.
        </p>
      ) : null}
      {prs.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {prs.map((pr) => (
            <li key={pr.setId} className="flex items-start gap-2 text-sm">
              <Trophy size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <span>
                <span className="font-semibold">{pr.name}</span> <span className="tnum">{prLineText(pr)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="mt-4 block">
        <span className="text-sm font-medium text-muted">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
          placeholder="How did it go?"
          className="input mt-1.5 resize-none"
          data-testid="finish-notes"
        />
      </label>
      <p role="alert" className={error ? "mt-3 text-sm text-danger" : ""}>
        {error}
      </p>
      <button type="button" onClick={onConfirm} disabled={pending} className="btn-primary mt-4 w-full" data-testid="confirm-finish">
        {pending ? "Finishing…" : "Finish workout"}
      </button>
    </Sheet>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="px-2">
      <div className={`tnum text-2xl font-black leading-tight ${accent ? "text-accent" : ""}`}>{value}</div>
      <div className="text-xs font-medium text-muted">{label}</div>
    </div>
  );
}
