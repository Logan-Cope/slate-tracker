import { addDays, format, isValid, parseISO } from "date-fns";
import { dateInZone } from "./tz";

/** Calendar date as YYYY-MM-DD in the app timezone (lib/utils/tz.ts), on server and client alike. */
export function todayLocal(now: Date = new Date()): string {
  return dateInZone(now);
}

export function isDateString(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parseISO(s));
}

export function shiftDate(date: string, days: number): string {
  return format(addDays(parseISO(date), days), "yyyy-MM-dd");
}

/** "Today", "Yesterday", "Tomorrow" or "Mon, Oct 13". */
export function humanDate(date: string, today: string = todayLocal()): string {
  if (date === today) return "Today";
  if (date === shiftDate(today, -1)) return "Yesterday";
  if (date === shiftDate(today, 1)) return "Tomorrow";
  return format(parseISO(date), "EEE, MMM d");
}
