/**
 * Go-Tos ranking: foods the profile keeps logging, weighted toward recent use
 * and toward the time of day they are usually eaten.
 */
import { hourInZone } from "@/lib/utils/tz";

export type FoodStat = {
  foodId: number;
  timesLogged: number;
  lastLoggedAt: Date;
  /** 24 buckets: how many times the food was logged in each local hour. */
  hourHist: number[];
};

/**
 * Share of logs within +/- `window` hours of `hour`, wrapping around midnight.
 * 0 when there are no logs.
 */
export function hourAffinity(hourHist: number[], hour: number, window = 2): number {
  const centre = ((hour % 24) + 24) % 24;
  let total = 0;
  let near = 0;
  for (let h = 0; h < 24; h++) {
    const count = hourHist[h] ?? 0;
    total += count;
    const diff = Math.abs(h - centre);
    if (Math.min(diff, 24 - diff) <= window) near += count;
  }
  return total > 0 ? near / total : 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * timesLogged, halved for every `halfLifeDays` since the last log (a true
 * half-life: exp(-ln2 * days / halfLife)), boosted by how often the food is
 * eaten around the current local hour.
 */
export function goToScore(
  stat: FoodStat,
  now: Date,
  opts: { halfLifeDays?: number } = {},
): number {
  const halfLife = opts.halfLifeDays ?? 14;
  const daysSince = Math.max(0, now.getTime() - stat.lastLoggedAt.getTime()) / DAY_MS;
  const decay = 2 ** (-daysSince / halfLife);
  return stat.timesLogged * decay * (1 + hourAffinity(stat.hourHist, hourInZone(now)));
}

/** Top `limit` stats by goToScore, highest first; ties keep input order (sort is stable). */
export function rankGoTos<T extends FoodStat>(stats: T[], now: Date, limit = 12): T[] {
  return stats
    .filter((stat) => stat.timesLogged > 0)
    .map((stat) => ({ stat, score: goToScore(stat, now) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.stat);
}
