import { describe, expect, it } from "vitest";
import { dateInZone, hourInZone, APP_TZ } from "@/lib/utils/tz";
import { todayLocal } from "@/lib/utils/date";

// Vercel runs functions in UTC and refuses a TZ env var, so calendar dates and
// hours must be computed in the app's own zone, never the process zone.
describe("app timezone", () => {
  it("defaults to Eastern", () => {
    expect(APP_TZ).toBe("America/New_York");
  });

  it("gives the Eastern calendar date late in the UTC evening", () => {
    // 03:30 UTC on the 13th is 23:30 EDT on the 12th
    expect(dateInZone(new Date("2026-10-13T03:30:00Z"), "America/New_York")).toBe("2026-10-12");
  });

  it("keeps the same date when both zones agree", () => {
    expect(dateInZone(new Date("2026-07-04T23:30:00Z"), "America/New_York")).toBe("2026-07-04");
  });

  it("returns the hour in the zone, 0 to 23, across DST", () => {
    expect(hourInZone(new Date("2026-10-13T03:30:00Z"), "America/New_York")).toBe(23); // EDT
    expect(hourInZone(new Date("2026-01-13T13:05:00Z"), "America/New_York")).toBe(8); // EST
    expect(hourInZone(new Date("2026-01-13T05:00:00Z"), "America/New_York")).toBe(0);
  });

  it("todayLocal uses the app zone, not the process zone", () => {
    expect(todayLocal(new Date("2026-10-13T03:30:00Z"))).toBe("2026-10-12");
  });

  it("respects an explicit zone argument", () => {
    expect(dateInZone(new Date("2026-10-13T03:30:00Z"), "Asia/Tokyo")).toBe("2026-10-13");
    expect(hourInZone(new Date("2026-10-13T03:30:00Z"), "Asia/Tokyo")).toBe(12);
  });
});
