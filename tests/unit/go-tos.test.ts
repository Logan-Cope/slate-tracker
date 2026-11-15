import { describe, expect, it } from "vitest";

import { goToScore, hourAffinity, rankGoTos, type FoodStat } from "@/lib/nutrition/go-tos";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 24 zero buckets with the given hour -> count entries filled in. */
function hist(counts: Record<number, number>): number[] {
  const h = new Array<number>(24).fill(0);
  for (const [hour, count] of Object.entries(counts)) h[Number(hour)] = count;
  return h;
}

describe("hourAffinity", () => {
  // 10 logs: 4 at 7am, 3 at 8am, 2 at noon, 1 at 8pm.
  const breakfastish = hist({ 7: 4, 8: 3, 12: 2, 20: 1 });

  it("returns the share of logs within +/- 2 hours by default", () => {
    expect(hourAffinity(breakfastish, 8)).toBeCloseTo(0.7, 10); // hours 6..10
    expect(hourAffinity(breakfastish, 12)).toBeCloseTo(0.2, 10); // hours 10..14
    expect(hourAffinity(breakfastish, 16)).toBe(0); // hours 14..18
  });

  it("returns 0 when the histogram is empty", () => {
    expect(hourAffinity(hist({}), 8)).toBe(0);
  });

  it("wraps around midnight", () => {
    const lateNight = hist({ 21: 1, 22: 1, 23: 1, 0: 1, 1: 1 });
    expect(hourAffinity(lateNight, 23)).toBe(1); // hours 21..1 cover all five
    expect(hourAffinity(lateNight, 1)).toBeCloseTo(0.6, 10); // hours 23, 0, 1 (2 and 3 are empty)
    expect(hourAffinity(lateNight, 0, 1)).toBeCloseTo(0.6, 10); // hours 23, 0, 1
  });

  it("honours a custom window", () => {
    expect(hourAffinity(breakfastish, 8, 0)).toBeCloseTo(0.3, 10);
    expect(hourAffinity(breakfastish, 8, 1)).toBeCloseTo(0.7, 10);
    expect(hourAffinity(breakfastish, 8, 4)).toBeCloseTo(0.9, 10); // hours 4..12 pick up noon
  });

  it("never exceeds 1 even when the window covers the whole day", () => {
    expect(hourAffinity(breakfastish, 8, 12)).toBe(1);
    expect(hourAffinity(breakfastish, 8, 30)).toBe(1);
  });
});

describe("goToScore", () => {
  // Local 8:00 so the hour-affinity cases are independent of the machine's timezone.
  // 8am in the app's zone (America/New_York, EDT in October), whatever zone the test runs in.
  const now = new Date("2026-10-13T08:00:00-04:00");

  function stat(overrides: Partial<FoodStat> = {}): FoodStat {
    return { foodId: 1, timesLogged: 10, lastLoggedAt: now, hourHist: hist({}), ...overrides };
  }

  it("equals timesLogged when logged just now with no hour pattern", () => {
    expect(goToScore(stat(), now)).toBe(10);
  });

  it("halves exactly after one half-life (14 days by default)", () => {
    const fresh = goToScore(stat(), now);
    const stale = goToScore(stat({ lastLoggedAt: new Date(now.getTime() - 14 * DAY_MS) }), now);
    expect(stale).toBe(fresh / 2);
  });

  it("uses fractional days and a custom half-life", () => {
    const halfDay = stat({ lastLoggedAt: new Date(now.getTime() - 0.5 * DAY_MS) });
    expect(goToScore(halfDay, now, { halfLifeDays: 1 })).toBeCloseTo(10 * Math.SQRT1_2, 10);
    const week = stat({ lastLoggedAt: new Date(now.getTime() - 7 * DAY_MS) });
    expect(goToScore(week, now, { halfLifeDays: 7 })).toBe(5);
    expect(goToScore(week, now)).toBeCloseTo(10 * 2 ** (-7 / 14), 10);
  });

  it("clamps a future lastLoggedAt to zero days since", () => {
    const future = stat({ lastLoggedAt: new Date(now.getTime() + 3 * DAY_MS) });
    expect(goToScore(future, now)).toBe(10);
  });

  it("multiplies by 1 + hour affinity at the local hour of now", () => {
    expect(goToScore(stat({ hourHist: hist({ 8: 5 }) }), now)).toBe(20);
    expect(goToScore(stat({ hourHist: hist({ 8: 5, 19: 5 }) }), now)).toBe(15);
    expect(goToScore(stat({ hourHist: hist({ 19: 5 }) }), now)).toBe(10);
  });
});

describe("rankGoTos", () => {
  // Instants in the app's zone (America/New_York, EDT in October): goToScore reads the hour there, not in the machine's zone.
  const eightAm = new Date("2026-10-13T08:00:00-04:00");
  const sevenPm = new Date("2026-10-13T19:00:00-04:00");

  type NamedStat = FoodStat & { name: string };

  function named(name: string, foodId: number, overrides: Partial<FoodStat> = {}): NamedStat {
    return {
      name,
      foodId,
      timesLogged: 5,
      lastLoggedAt: eightAm,
      hourHist: hist({}),
      ...overrides,
    };
  }

  it("orders by score descending and returns the original objects", () => {
    const low = named("low", 1, { timesLogged: 2 });
    const high = named("high", 2, { timesLogged: 9 });
    const mid = named("mid", 3, { timesLogged: 5 });
    const ranked = rankGoTos([low, high, mid], eightAm);
    expect(ranked.map((s) => s.name)).toEqual(["high", "mid", "low"]);
    expect(ranked[0]).toBe(high);
  });

  it("is stable: equal scores keep their input order", () => {
    const stats = [named("a", 1), named("b", 2), named("c", 3)];
    expect(rankGoTos(stats, eightAm).map((s) => s.name)).toEqual(["a", "b", "c"]);
  });

  it("excludes foods never logged", () => {
    const stats = [named("never", 1, { timesLogged: 0 }), named("once", 2, { timesLogged: 1 })];
    expect(rankGoTos(stats, eightAm).map((s) => s.name)).toEqual(["once"]);
    expect(rankGoTos([named("negative", 3, { timesLogged: -1 })], eightAm)).toEqual([]);
  });

  it("limits to 12 by default and honours a custom limit", () => {
    const stats = Array.from({ length: 20 }, (_, i) => named(`f${i}`, i, { timesLogged: 20 - i }));
    expect(rankGoTos(stats, eightAm)).toHaveLength(12);
    expect(rankGoTos(stats, eightAm, 3).map((s) => s.name)).toEqual(["f0", "f1", "f2"]);
    expect(rankGoTos(stats, eightAm, 0)).toEqual([]);
  });

  it("ranks a breakfast food above a dinner food at 8am despite fewer logs", () => {
    const oats = named("oats", 1, { timesLogged: 10, hourHist: hist({ 7: 5, 8: 5 }) });
    const salmon = named("salmon", 2, { timesLogged: 12, hourHist: hist({ 18: 6, 19: 6 }) });
    expect(rankGoTos([salmon, oats], eightAm).map((s) => s.name)).toEqual(["oats", "salmon"]);
    expect(rankGoTos([salmon, oats], sevenPm).map((s) => s.name)).toEqual(["salmon", "oats"]);
  });

  it("lets recency beat a slightly higher count", () => {
    const recent = named("recent", 1, { timesLogged: 8 });
    const stale = named("stale", 2, {
      timesLogged: 10,
      lastLoggedAt: new Date(eightAm.getTime() - 28 * DAY_MS),
    });
    expect(rankGoTos([stale, recent], eightAm).map((s) => s.name)).toEqual(["recent", "stale"]);
  });
});
