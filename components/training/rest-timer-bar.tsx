"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";

type Props = {
  endsAt: number;
  totalMs: number;
  bottomOffset: number;
  onExtend: () => void;
  onSkip: () => void;
  onDone: () => void;
  /** Reports the bar's rendered height so a toast can sit above it instead of on it. */
  onResize?: (height: number) => void;
};

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Sticky rest countdown above the tab bar. Flashes at zero, then dismisses itself. */
export function RestTimerBar({ endsAt, totalMs, bottomOffset, onExtend, onSkip, onDone, onResize }: Props) {
  const [remaining, setRemaining] = useState(totalMs);
  const [done, setDone] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !onResize) return;
    const ro = new ResizeObserver(() => onResize(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onResize]);

  useEffect(() => {
    let dismiss: ReturnType<typeof setTimeout> | null = null;
    const id = setInterval(() => {
      const left = endsAt - Date.now();
      if (left > 0) {
        setRemaining(left);
        setDone(false);
        return;
      }
      setRemaining(0);
      setDone(true);
      clearInterval(id);
      dismiss = setTimeout(onDone, 2500);
    }, 200);
    return () => {
      clearInterval(id);
      if (dismiss) clearTimeout(dismiss);
    };
  }, [endsAt, onDone]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-0 z-30 px-3 pb-2"
      style={{ bottom: bottomOffset }}
      role="timer"
      aria-live="off"
      aria-label="Rest timer"
      data-testid="rest-timer"
      data-done={done ? "true" : "false"}
      data-scroll-clearance="rest-timer"
    >
      <div
        className={`pop rounded-2xl border px-4 pt-2.5 pb-3 shadow-lg backdrop-blur ${
          done ? "motion-safe:animate-pulse border-accent bg-accent text-on-accent" : "border-line bg-surface/95"
        }`}
      >
        <div className="flex items-center gap-3">
          <Timer size={20} className={done ? "text-on-accent" : "text-muted"} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className={`text-sm font-semibold ${done ? "text-on-accent" : "text-muted"}`}>{done ? "Go" : "Rest"}</span>
              <span className="tnum text-2xl font-black leading-none">{clock(remaining)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onExtend}
            className={`tap min-h-11 rounded-xl px-3 text-sm font-bold ${done ? "bg-on-accent text-accent-ink focus-visible:outline-on-accent" : "bg-surface-2 text-fg"}`}
          >
            +30 s
          </button>
          <button
            type="button"
            onClick={onSkip}
            className={`tap min-h-11 rounded-xl px-3 text-sm font-bold ${done ? "bg-on-accent text-accent-ink focus-visible:outline-on-accent" : "bg-surface-2 text-fg"}`}
          >
            Skip
          </button>
        </div>
        {!done ? (
          <div className="mt-2">
            <ProgressBar value={totalMs > 0 ? 1 - remaining / totalMs : 1} height={4} color="var(--protein)" label="Rest progress" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
