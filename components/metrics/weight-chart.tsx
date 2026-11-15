"use client";

import { useMemo, useState, type PointerEvent } from "react";
import { format, parseISO } from "date-fns";
import { Segmented } from "@/components/ui/segmented";
import { monotonePath, xLabelIndexes, yScale } from "@/lib/metrics/chart-scale";
import type { TrendPoint } from "@/lib/metrics/trend";
import { fmtWeight } from "@/lib/utils/format";

type Range = "30" | "90" | "365";

/** The path is drawn in this square and stretched to the plot; its stroke does not stretch. */
const SPACE = 1000;

/** Keys a range input moves on. */
const SLIDER_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/**
 * One series, two encodings: raw weigh-ins as small muted markers, the EWMA
 * trend as a 2 px accent line. Interpolated days have no marker. Pointing at or
 * tapping the plot, or the arrow keys, show one day's numbers under a dashed
 * cursor; the keys drive a native range input that screen readers read out.
 */
export function WeightChart({ points }: { points: TrendPoint[] }) {
  const [range, setRange] = useState<Range>("90");
  const [active, setActive] = useState<number | null>(null);
  const data = useMemo(() => points.slice(-Number(range)), [points, range]);
  const n = data.length;

  const y = useMemo(() => yScale(data.flatMap((d) => (d.raw !== null ? [d.trend, d.raw] : [d.trend]))), [data]);
  const xPct = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yPct = (v: number) => ((y.max - v) / (y.max - y.min)) * 100;
  const trendPath = useMemo(
    () => monotonePath(data.map((d, i) => ({ x: (n === 1 ? 0.5 : i / (n - 1)) * SPACE, y: ((y.max - d.trend) / (y.max - y.min)) * SPACE }))),
    [data, n, y],
  );

  const shown = active !== null && active < n ? data[active]! : null;
  const keyIndex = active !== null && active < n ? active : n - 1;

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setActive(Math.round(frac * (n - 1)));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--accent)" }} /> trend
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--muted)" }} /> scale
          </span>
        </div>
        <Segmented<Range>
          ariaLabel="Range"
          value={range}
          onChange={(r) => {
            setRange(r);
            setActive(null);
          }}
          options={[
            { value: "30", label: "30d" },
            { value: "90", label: "90d" },
            { value: "365", label: "1y" },
          ]}
        />
      </div>

      <div
        className="relative h-56 -ml-2 rounded-lg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
        data-testid="weight-chart"
      >
        <input
          type="range"
          className="sr-only"
          aria-label="Weight trend"
          min={0}
          max={Math.max(0, n - 1)}
          step={1}
          value={keyIndex}
          aria-valuetext={n > 0 ? spoken(data[keyIndex]!) : undefined}
          onChange={(e) => setActive(Number(e.target.value))}
          onFocus={(e) => {
            if (e.currentTarget.matches(":focus-visible")) setActive(keyIndex);
          }}
          onKeyDown={(e) => {
            // A key that leaves the value where it is (End on the newest day) fires no change, so show that day here.
            if (e.key === "Escape") setActive(null);
            else if (active === null && SLIDER_KEYS.has(e.key)) setActive(keyIndex);
          }}
        />

        {/* Value axis */}
        <div className="absolute left-0 top-2 bottom-7 w-9" aria-hidden>
          {y.ticks.map((t) => (
            <span key={t} className="tnum absolute right-1.5 -translate-y-1/2 text-xs text-muted" style={{ top: `${yPct(t)}%` }}>
              {t}
            </span>
          ))}
        </div>

        {/* Date axis */}
        <div className="absolute left-9 right-2 bottom-0 h-7" aria-hidden>
          {xLabelIndexes(n).map((i) => (
            <span key={i} className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap text-xs text-muted" style={{ left: `${xPct(i)}%` }}>
              {format(parseISO(data[i]!.date), "MMM d")}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div
          className="absolute left-9 right-2 top-2 bottom-7 touch-pan-y"
          onPointerDown={pick}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse" || e.buttons > 0) pick(e);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setActive(null);
          }}
        >
          <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden focusable="false">
            {y.ticks.map((t) => (
              <line key={t} x1="0" x2="100%" y1={`${yPct(t)}%`} y2={`${yPct(t)}%`} stroke="var(--line)" />
            ))}
            {shown ? (
              <line x1={`${xPct(active!)}%`} x2={`${xPct(active!)}%`} y1="0" y2="100%" stroke="var(--muted)" strokeDasharray="3 3" />
            ) : null}
            {data.map((d, i) =>
              d.raw !== null ? (
                <circle key={d.date} cx={`${xPct(i)}%`} cy={`${yPct(d.raw)}%`} r={3.5} fill="var(--muted)" stroke="var(--surface)" strokeWidth={2} />
              ) : null,
            )}
            <svg viewBox={`0 0 ${SPACE} ${SPACE}`} preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
              <path
                d={trendPath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {shown ? (
              <>
                {shown.raw !== null ? (
                  <circle cx={`${xPct(active!)}%`} cy={`${yPct(shown.raw)}%`} r={5} fill="var(--muted)" stroke="var(--surface)" strokeWidth={2} />
                ) : null}
                <circle cx={`${xPct(active!)}%`} cy={`${yPct(shown.trend)}%`} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
              </>
            ) : null}
          </svg>

          {shown ? (
            <div
              className="card pointer-events-none absolute top-0 px-3 py-2 text-xs shadow-lg"
              style={{ left: `${xPct(active!)}%`, transform: `translateX(-${xPct(active!)}%)` }}
              data-testid="weight-chart-readout"
              aria-hidden
            >
              <div className="whitespace-nowrap font-semibold">{format(parseISO(shown.date), "EEE, MMM d")}</div>
              <div className="tnum mt-1 whitespace-nowrap">
                trend <span className="font-semibold">{fmtWeight(shown.trend)}</span>
                {shown.raw !== null ? (
                  <>
                    <span className="text-muted"> · scale </span>
                    <span className="font-semibold">{fmtWeight(shown.raw)}</span>
                  </>
                ) : (
                  <span className="text-muted"> · no weigh-in</span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The readout as one sentence, for the range input's value. */
function spoken(p: TrendPoint): string {
  const day = format(parseISO(p.date), "EEEE, MMMM d");
  const scale = p.raw !== null ? `scale ${fmtWeight(p.raw)} lb` : "no weigh-in";
  return `${day}: trend ${fmtWeight(p.trend)} lb, ${scale}`;
}
