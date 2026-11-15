/**
 * The app's calendar zone. Vercel runs functions in UTC and reserves the TZ
 * variable, so dates and hours are computed explicitly in this zone, on the
 * server and the client alike (NEXT_PUBLIC_ so both agree and hydration never
 * flickers). One zone per deployment; a per-profile zone can replace
 * the default later without touching callers.
 */
export const APP_TZ = process.env.NEXT_PUBLIC_APP_TZ ?? "America/New_York";

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(now: Date, tz: string): Record<string, string> {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(now)) out[p.type] = p.value;
  return out;
}

/** Calendar date as YYYY-MM-DD in `tz`. */
export function dateInZone(now: Date, tz: string = APP_TZ): string {
  const p = partsIn(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hour of day, 0 to 23, in `tz`. */
export function hourInZone(now: Date, tz: string = APP_TZ): number {
  return Number(partsIn(now, tz).hour) % 24;
}
