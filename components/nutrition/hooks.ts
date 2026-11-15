"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { todayLocal } from "@/lib/utils/date";

/** Trails `value` by `ms`; used for search-as-you-type. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const noSubscribe = () => () => {};

/**
 * The phone's calendar date. Hydrates with the server's guess so markup
 * matches, then the client clock wins.
 */
export function useTodayLocal(serverToday: string): string {
  return useSyncExternalStore(noSubscribe, todayLocal, () => serverToday);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}
