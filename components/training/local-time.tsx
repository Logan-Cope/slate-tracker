"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { format } from "date-fns";

const noop = () => () => {};

/** False during server render and hydration, true after mount. */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** Wall clock that ticks on an interval; null until the first tick after mount. */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

export function relativeTime(then: number, now: number): string {
  const mins = Math.round((now - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

type Mode = "date" | "time" | "datetime" | "relative";

const FORMATS: Record<Exclude<Mode, "relative">, string> = {
  date: "EEE, MMM d",
  time: "h:mm a",
  datetime: "EEE, MMM d · h:mm a",
};

/**
 * Formats a timestamp in the phone's time zone. The server does not know that
 * zone, so nothing is rendered until the component has mounted.
 */
export function LocalTime({ iso, mode = "date", className }: { iso: string; mode?: Mode; className?: string }) {
  const mounted = useMounted();
  const now = useNow(mode === "relative" ? 30_000 : 3_600_000);
  const d = new Date(iso);
  let text = " ";
  if (mounted) {
    if (mode === "relative") text = now === null ? " " : relativeTime(d.getTime(), now);
    else text = format(d, FORMATS[mode]);
  }
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
