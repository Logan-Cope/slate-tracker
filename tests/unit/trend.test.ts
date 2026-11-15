import { describe, expect, it } from "vitest";
import { dailySeries, ewmaTrend, latestTrend, weeklyRate, type Reading } from "@/lib/metrics/trend";

function constantDays(from: number, count: number, value: number): Reading[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-10-${String(from + i).padStart(2, "0")}`,
    value,
  }));
}

describe("dailySeries", () => {
  it("returns an empty series for no readings", () => {
    expect(dailySeries([])).toEqual([]);
  });

  it("maps a single reading to a single point whose trend equals the raw value", () => {
    expect(dailySeries([{ date: "2026-10-01", value: 150 }])).toEqual([
      { date: "2026-10-01", raw: 150, trend: 150 },
    ]);
  });

  it("fills the gap between two readings three days apart with two linearly interpolated days", () => {
    const series = dailySeries([
      { date: "2026-10-01", value: 150 },
      { date: "2026-10-04", value: 153 },
    ]);

    expect(series).toEqual([
      { date: "2026-10-01", raw: 150, trend: 150 },
      { date: "2026-10-02", raw: null, trend: 151 },
      { date: "2026-10-03", raw: null, trend: 152 },
      { date: "2026-10-04", raw: 153, trend: 153 },
    ]);
  });

  it("sorts unsorted readings and keeps the lowest reading when a day has several", () => {
    const series = dailySeries([
      { date: "2026-10-02", value: 152.4 },
      { date: "2026-10-01", value: 151 },
      { date: "2026-10-02", value: 151.8 },
      { date: "2026-10-01", value: 150 },
      { date: "2026-10-02", value: 153 },
    ]);

    expect(series).toEqual([
      { date: "2026-10-01", raw: 150, trend: 150 },
      { date: "2026-10-02", raw: 151.8, trend: 151.8 },
    ]);
  });
});

describe("ewmaTrend", () => {
  it("moves one tenth of the way toward a step change on the first day of the step", () => {
    const readings = [...constantDays(1, 5, 150), { date: "2026-10-06", value: 160 }];

    const trend = ewmaTrend(readings, 0.1);

    expect(trend).toHaveLength(6);
    expect(trend[0]).toEqual({ date: "2026-10-01", raw: 150, trend: 150 });
    expect(trend[4]).toEqual({ date: "2026-10-05", raw: 150, trend: 150 });
    expect(trend[5]?.raw).toBe(160);
    expect(trend[5]?.trend).toBeCloseTo(151, 10);
  });

  it("smooths over interpolated days while keeping their raw value null", () => {
    const trend = ewmaTrend(
      [
        { date: "2026-10-01", value: 150 },
        { date: "2026-10-03", value: 160 },
      ],
      0.1,
    );

    // Daily inputs are 150, 155 (interpolated), 160.
    expect(trend.map((p) => p.raw)).toEqual([150, null, 160]);
    expect(trend.map((p) => p.trend)).toEqual([150, 150.5, 151.45]);
  });

  it("defaults alpha to 0.1", () => {
    const readings = [...constantDays(1, 2, 150), { date: "2026-10-03", value: 160 }];

    expect(ewmaTrend(readings)).toEqual(ewmaTrend(readings, 0.1));
    expect(ewmaTrend(readings)).not.toEqual(ewmaTrend(readings, 0.5));
  });
});

describe("weeklyRate", () => {
  it("is null with fewer than 8 points", () => {
    expect(weeklyRate([])).toBeNull();
    expect(weeklyRate(ewmaTrend(constantDays(1, 7, 150)))).toBeNull();
  });

  it("is the 7-day change in trend, negative for a downward trend", () => {
    // Trend drops exactly 0.2 lb per day, so the weekly rate is -1.4.
    const points = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      raw: null,
      trend: 160 - 0.2 * i,
    }));

    expect(weeklyRate(points)).toBeCloseTo(-1.4, 10);
  });
});

describe("latestTrend", () => {
  it("returns the final smoothed value, or null when there are no points", () => {
    expect(latestTrend([])).toBeNull();

    const readings = [...constantDays(1, 5, 150), { date: "2026-10-06", value: 160 }];
    expect(latestTrend(ewmaTrend(readings))).toBeCloseTo(151, 10);
  });
});
