"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveWorkout } from "@/app/(app)/train/actions";
import { isDirty, type WorkoutStore } from "@/lib/training/workout-store";

/** "error" is a save that may work next time; "failed" is one the server refused and will refuse again. */
export type SyncStatus = "idle" | "saving" | "saved" | "offline" | "error" | "failed";

export type SyncState = {
  status: SyncStatus;
  /** The server's sentence when it refused the draft; null otherwise. */
  error: string | null;
  flush: () => Promise<void>;
};

/**
 * Pushes every store change to the server after a short debounce. Failures
 * leave the draft dirty; the next change, coming back online, or returning to
 * the tab retries. flush() saves immediately and resolves when nothing is
 * left to send (or the attempt failed).
 */
export function useWorkoutSync(store: WorkoutStore, debounceMs = 800): SyncState {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pumping: Promise<void> | null = null;

    const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;

    // One attempt. Resolves true when the server took it.
    const attempt = async (): Promise<boolean> => {
      const state = store.getState();
      if (!isDirty(state)) return true;
      const stamp = state.updatedAt;
      setStatus("saving");
      try {
        const res = await saveWorkout(state.draft);
        if (disposed) return true;
        if (!res.ok) {
          // The server read the request and said no: retrying the same draft changes nothing.
          setStatus("failed");
          setError(res.error);
          return false;
        }
        setError(null);
        store.getState().markSaved(stamp);
        if (!isDirty(store.getState())) setStatus("saved");
        return true;
      } catch {
        if (!disposed) setStatus(offline() ? "offline" : "error");
        return false;
      }
    };

    const flush = (): Promise<void> => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (pumping) return pumping;
      pumping = (async () => {
        try {
          // Edits that land during a save make the state dirty again; loop until clean or failing.
          while (!disposed && isDirty(store.getState())) {
            if (!(await attempt())) break;
          }
        } finally {
          pumping = null;
        }
      })();
      return pumping;
    };

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, ms);
    };

    flushRef.current = flush;
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.updatedAt !== prev.updatedAt) schedule(debounceMs);
    });
    const onOnline = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    if (isDirty(store.getState())) schedule(0);

    return () => {
      disposed = true;
      unsubscribe();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
      flushRef.current = () => Promise.resolve();
    };
  }, [store, debounceMs]);

  const flush = useCallback(() => flushRef.current(), []);
  return { status, error, flush };
}
