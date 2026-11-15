/**
 * Scale and path math for the weight chart: no React, no DOM. The chart draws in
 * its own coordinates; these only decide the axis range, which days get a label
 * and the smoothed trend line.
 */

export type YScale = { min: number; max: number; ticks: number[] };

/**
 * The value axis: the data's range padded 15% each side (at least 1 lb), widened
 * so `tickCount` whole-number ticks sit at equal steps from bottom to top.
 */
export function yScale(values: number[], tickCount = 4): YScale {
  const finite = values.filter(Number.isFinite);
  const lo = finite.length ? Math.min(...finite) : 0;
  const hi = finite.length ? Math.max(...finite) : 0;
  const pad = Math.max(1, (hi - lo) * 0.15);
  const min = Math.floor(lo - pad);
  const step = Math.max(1, Math.ceil((Math.ceil(hi + pad) - min) / (tickCount - 1)));
  const ticks = Array.from({ length: tickCount }, (_, i) => min + i * step);
  return { min, max: ticks[ticks.length - 1]!, ticks };
}

/** Indexes of the days that get a date label: every round(n / count)th day from the first, at most `count`. */
export function xLabelIndexes(n: number, count = 4): number[] {
  if (n <= 0) return [];
  const every = Math.max(1, Math.round(n / count));
  const out: number[] = [];
  for (let i = 0; i < n && out.length < count; i += every) out.push(i);
  return out;
}

export type Pt = { x: number; y: number };

const num = (v: number) => String(Math.round(v * 100) / 100);

/**
 * SVG path through the points as a monotone cubic (Fritsch-Carlson, the same
 * curve as d3's curveMonotoneX): it passes through every point and never bulges
 * past a neighbour, so the trend line shows no turn the data does not have.
 * Points must be ordered by strictly increasing x.
 */
export function monotonePath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return "";
  const first = `M${num(pts[0]!.x)},${num(pts[0]!.y)}`;
  if (n === 1) return first;
  if (n === 2) return `${first}L${num(pts[1]!.x)},${num(pts[1]!.y)}`;

  const slope = (i: number) => (pts[i + 1]!.y - pts[i]!.y) / (pts[i + 1]!.x - pts[i]!.x);
  const tangent: number[] = new Array(n);
  for (let i = 1; i < n - 1; i++) {
    const h0 = pts[i]!.x - pts[i - 1]!.x;
    const h1 = pts[i + 1]!.x - pts[i]!.x;
    const s0 = slope(i - 1);
    const s1 = slope(i);
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    tangent[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  // Ends: one-sided, from the end segment's slope and the neighbouring tangent.
  tangent[0] = (3 * slope(0) - tangent[1]!) / 2;
  tangent[n - 1] = (3 * slope(n - 2) - tangent[n - 2]!) / 2;

  let d = first;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = (b.x - a.x) / 3;
    d += `C${num(a.x + dx)},${num(a.y + dx * tangent[i]!)},${num(b.x - dx)},${num(b.y - dx * tangent[i + 1]!)},${num(b.x)},${num(b.y)}`;
  }
  return d;
}
