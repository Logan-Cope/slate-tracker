"use client";

import { format } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtWeight } from "@/lib/utils/format";

export type ChartPoint = { date: string; weightLb: number };

type Datum = { t: number; weight: number };

function Tip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  const d = active ? (payload?.[0]?.payload as Datum | undefined) : undefined;
  if (!d) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <div className="text-muted">{format(d.t, "EEE, MMM d")}</div>
      <div className="tnum font-bold">{fmtWeight(d.weight)} lb</div>
    </div>
  );
}

/** Best set weight per workout. One series, one axis, teal like a completed set. */
export function ExerciseChart({ points }: { points: ChartPoint[] }) {
  const data: Datum[] = points.map((p) => ({ t: new Date(p.date).getTime(), weight: p.weightLb }));
  const weights = data.map((d) => d.weight);
  const lo = Math.min(...weights);
  const hi = Math.max(...weights);
  const pad = Math.max(5, Math.round((hi - lo) * 0.2));
  return (
    <div className="h-48 w-full" role="img" aria-label="Best set weight per workout, in pounds">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => format(v, "MMM d")}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            dataKey="weight"
            width={40}
            domain={[Math.max(0, lo - pad), hi + pad]}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => fmtWeight(v)}
          />
          <Tooltip content={<Tip />} cursor={{ stroke: "var(--muted)", strokeWidth: 1 }} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="var(--protein)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--protein)", stroke: "var(--surface)", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "var(--protein)", stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
