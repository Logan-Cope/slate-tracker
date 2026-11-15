import { APP_TZ } from "@/lib/utils/tz";

/** The instant a wall clock in `tz` shows `hour` (fractional) on `date` (YYYY-MM-DD). */
export function zonedHourToDate(date: string, hour: number, tz: string = APP_TZ): Date {
  const guess = Date.parse(`${date}T00:00:00Z`) + hour * 3_600_000;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return new Date(guess - (shown - guess));
}
