import { describe, expect, it } from "vitest";
import { monotonePath, xLabelIndexes, yScale } from "@/lib/metrics/chart-scale";

describe("yScale", () => {
  it("pads the range by 15% and gives four evenly spaced whole-number ticks that cover it", () => {
    const s = yScale([140, 150, 145.3]);
    expect(s.ticks).toHaveLength(4);
    expect(s.min).toBeLessThanOrEqual(140 - 1.5);
    expect(s.max).toBeGreaterThanOrEqual(150 + 1.5);
    expect(s.ticks[0]).toBe(s.min);
    expect(s.ticks[3]).toBe(s.max);
    const steps = s.ticks.slice(1).map((t, i) => t - s.ticks[i]!);
    expect(new Set(steps).size).toBe(1);
    for (const t of s.ticks) expect(Number.isInteger(t)).toBe(true);
  });

  it("pads at least 1 lb when every value is the same", () => {
    const s = yScale([150, 150]);
    expect(s.min).toBeLessThanOrEqual(149);
    expect(s.max).toBeGreaterThanOrEqual(151);
    expect(s.max).toBeGreaterThan(s.min);
  });

  it("stays usable with no values", () => {
    const s = yScale([]);
    expect(s.ticks).toHaveLength(4);
    expect(s.max).toBeGreaterThan(s.min);
  });
});

describe("xLabelIndexes", () => {
  it("labels about four evenly spaced days, the first one included", () => {
    expect(xLabelIndexes(90)).toEqual([0, 23, 46, 69]);
    expect(xLabelIndexes(30)).toEqual([0, 8, 16, 24]);
    expect(xLabelIndexes(365)).toEqual([0, 91, 182, 273]);
  });

  it("handles short series", () => {
    expect(xLabelIndexes(0)).toEqual([]);
    expect(xLabelIndexes(1)).toEqual([0]);
    expect(xLabelIndexes(2)).toEqual([0, 1]);
  });
});

/** Every on-curve point of the path: the move-to, then each segment's end. */
function knots(d: string): [number, number][] {
  const nums = (s: string) => s.trim().split(/[ ,]+/).map(Number);
  const out: [number, number][] = [];
  for (const m of d.matchAll(/([MLC])([^MLC]*)/g)) {
    const n = nums(m[2]!);
    out.push([n[n.length - 2]!, n[n.length - 1]!]);
  }
  return out;
}

describe("monotonePath", () => {
  it("passes through every point", () => {
    const pts = [
      { x: 0, y: 10 },
      { x: 100, y: 30 },
      { x: 200, y: 25 },
      { x: 300, y: 60 },
    ];
    expect(knots(monotonePath(pts))).toEqual(pts.map((p) => [p.x, p.y]));
  });

  it("never overshoots: on rising data every control point stays between its segment's ends", () => {
    const pts = [0, 1, 1.2, 5, 5.1, 9].map((y, i) => ({ x: i * 10, y }));
    const d = monotonePath(pts);
    let i = 0;
    for (const m of d.matchAll(/C([^MLC]*)/g)) {
      const n = m[1]!.trim().split(/[ ,]+/).map(Number);
      const [y0, y1] = [pts[i]!.y, pts[i + 1]!.y];
      for (const cy of [n[1]!, n[3]!]) {
        expect(cy).toBeGreaterThanOrEqual(y0 - 1e-9);
        expect(cy).toBeLessThanOrEqual(y1 + 1e-9);
      }
      i++;
    }
    expect(i).toBe(pts.length - 1);
  });

  it("keeps flat data flat", () => {
    const d = monotonePath([0, 1, 2, 3].map((x) => ({ x, y: 7 })));
    for (const m of d.matchAll(/C([^MLC]*)/g)) {
      const n = m[1]!.trim().split(/[ ,]+/).map(Number);
      expect([n[1], n[3], n[5]]).toEqual([7, 7, 7]);
    }
  });

  it("draws a straight line for two points and a lone move for one", () => {
    expect(monotonePath([{ x: 0, y: 1 }, { x: 10, y: 3 }])).toBe("M0,1L10,3");
    expect(monotonePath([{ x: 5, y: 2 }])).toBe("M5,2");
    expect(monotonePath([])).toBe("");
  });
});
