"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { discardWorkoutAction } from "@/app/(app)/train/actions";
import { storageKey } from "@/lib/training/workout-store";
import { DiscardSheet } from "./discard-sheet";

/** Discards the open workout from the Train tab without opening it first. */
export function ResumeDiscard({ workoutId, setsDone }: { workoutId: string; setsDone: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await discardWorkoutAction(workoutId);
      if (!res.ok) {
        setError(res.error);
        setPending(false);
        return;
      }
      try {
        localStorage.removeItem(storageKey(workoutId));
      } catch {
        // storage unavailable: nothing to clear
      }
      // The refreshed page has no open workout, so this card and its sheet unmount.
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
      setPending(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="tap min-h-11 px-3 text-sm font-semibold text-muted" data-testid="resume-discard">
        Discard
      </button>
      <DiscardSheet
        open={open}
        setsDone={setsDone}
        pending={pending}
        error={error}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        onConfirm={confirm}
      />
    </>
  );
}
