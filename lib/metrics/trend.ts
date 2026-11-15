import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export type Reading = {
  date: string; // YYYY-MM-DD
  value: number;
};

export type TrendPoint = {
  date: string;
  raw: number | null;
  trend: number;
};

const DAY = "yyyy-MM-dd";

// Several readings on one day collapse to the lowest (closest to a true fasted weight).
function lowestPerDay(readings: Reading[]): Reading[] {
  const byDate = new Map<string, number>();
  for (const r of readings) {
    const existing = byDate.get(r.date);
    byDate.set(r.date, existing === undefined ? r.value : Math.min(existing, r.value));
  }
  return [...byDate.entries()].map(([date, value]) => ({ date, value }));
}

// One point per calendar day from first to last reading. Days without a reading
// get a linearly interpolated `trend` and a null `raw`.
export function dailySeries(readings: Reading[]): TrendPoint[] {
  // ISO dates sort correctly as strings.
  const known = lowestPerDay(readings).sort((a, b) => a.date.localeCompare(b.date));
  const points: TrendPoint[] = [];
  for (const [i, current] of known.entries()) {
    points.push({ date: current.date, raw: current.value, trend: current.value });
    const next = known[i + 1];
    if (!next) break;
    const start = parseISO(current.date);
    const gap = differenceInCalendarDays(parseISO(next.date), start);
    for (let d = 1; d < gap; d++) {
      const trend = current.value + ((next.value - current.value) * d) / gap;
      points.push({ date: format(addDays(start, d), DAY), raw: null, trend });
    }
  }
  return points;
}

// Exponentially weighted moving average over the interpolated daily values.
// trend[0] = v0; trend[t] = trend[t-1] + alpha * (v_t - trend[t-1]).
export function ewmaTrend(readings: Reading[], alpha = 0.1): TrendPoint[] {
  const out: TrendPoint[] = [];
  let prev: number | null = null;
  for (const day of dailySeries(readings)) {
    const trend: number = prev === null ? day.trend : prev + alpha * (day.trend - prev);
    out.push({ ...day, trend });
    prev = trend;
  }
  return out;
}

// Change in trend over the last 7 days. Needs 8 points so the comparison day exists.
export function weeklyRate(points: TrendPoint[]): number | null {
  const last = points[points.length - 1];
  const weekAgo = points[points.length - 8];
  if (!last || !weekAgo) return null;
  return last.trend - weekAgo.trend;
}

export function latestTrend(points: TrendPoint[]): number | null {
  return points[points.length - 1]?.trend ?? null;
}
