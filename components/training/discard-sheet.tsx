"use client";

import { Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  setsDone: number;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

/** Confirms throwing away an unfinished workout. Shared by the workout header menu and the Resume card on Train. */
export function DiscardSheet({ open, setsDone, pending, error, onClose, onConfirm }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Discard this workout?" compact>
      <p className="text-sm text-muted">
        {setsDone > 0
          ? `${setsDone} logged ${setsDone === 1 ? "set" : "sets"} will be removed. Nothing from this workout is kept.`
          : "Nothing from this workout is kept."}
      </p>
      <p role="alert" className={error ? "mt-3 text-sm text-danger" : ""}>
        {error}
      </p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onClose} aria-disabled={pending} className="btn-secondary flex-1">
          Keep going
        </button>
        <button
          type="button"
          onClick={() => {
            if (!pending) onConfirm();
          }}
          aria-disabled={pending}
          className="btn-primary flex-1 bg-danger text-on-danger"
          data-testid="confirm-discard"
        >
          {pending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
          Discard workout
        </button>
      </div>
    </Sheet>
  );
}
