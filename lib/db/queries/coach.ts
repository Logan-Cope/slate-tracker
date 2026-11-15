/**
 * Coach dashboard: the week at a glance for one profile. Composes the
 * nutrition, metrics and training queries; no new tables.
 */
import type { Target } from "@/lib/db/schema";
import { getDb, type Database } from "@/lib/db/client";
import { combineReads, runRead, type Read, type ReadValues } from "@/lib/db/batch";
import { dailyTotalsRead } from "./nutrition";
import { targetRead } from "./targets";
import { measurementsRead } from "./metrics";
import { workoutsRead, type WorkoutSummary } from "./training";
import { ewmaTrend, latestTrend, weeklyRate } from "@/lib/metrics/trend";
import { shiftDate } from "@/lib/utils/date";

export type CoachDay = { date: string; kcal: number; proteinG: number; logged: boolean };

export type CoachSummary = {
  today: string;
  target: Target | null;
  days: CoachDay[];
  daysLogged: number;
  avgKcal: number | null;
  avgProteinG: number | null;
  proteinHitDays: number;
  weight: { trend: number | null; rate: number | null; latest: { date: string; value: number } | null; count: number };
  training: { last7: number; last30: number; lastWorkout: WorkoutSummary | null; recent: WorkoutSummary[] };
};

export async function getCoachSummary(profileId: number, today: string): Promise<CoachSummary> {
  const db = await getDb();
  return runRead(db, coachSummaryRead(db, profileId, today));
}

/** Four queries: the target, the week's diary, 120 days of weigh-ins and the last 60 workouts. */
export function coachSummaryRead(db: Database, profileId: number, today: string): Read<CoachSummary> {
  return combineReads(summaryReads(db, profileId, today), (values) => summarize(today, values));
}

function summaryReads(db: Database, profileId: number, today: string) {
  return {
    target: targetRead(db, profileId, today),
    totals: dailyTotalsRead(db, profileId, shiftDate(today, -6), today),
    weights: measurementsRead(db, profileId, "weight", { from: shiftDate(today, -120) }),
    workouts: workoutsRead(db, profileId, { limit: 60 }),
  };
}

function summarize(today: string, { target, totals, weights, workouts }: ReadValues<ReturnType<typeof summaryReads>>): CoachSummary {
  const days: CoachDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = shiftDate(today, -i);
    const t = totals.get(date);
    days.push({ date, kcal: t?.kcal ?? 0, proteinG: t?.proteinG ?? 0, logged: Boolean(t && t.kcal > 0) });
  }
  const logged = days.filter((d) => d.logged);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const points = ewmaTrend(weights.map((w) => ({ date: w.date, value: w.value })));
  const latest = weights[weights.length - 1];

  const cutoff7 = new Date(`${shiftDate(today, -6)}T00:00:00`);
  const cutoff30 = new Date(`${shiftDate(today, -29)}T00:00:00`);
  const finished = workouts.filter((w) => w.finishedAt);

  return {
    today,
    target,
    days,
    daysLogged: logged.length,
    avgKcal: avg(logged.map((d) => d.kcal)),
    avgProteinG: avg(logged.map((d) => d.proteinG)),
    proteinHitDays: target ? logged.filter((d) => d.proteinG >= target.proteinG).length : 0,
    weight: {
      trend: latestTrend(points),
      rate: weeklyRate(points),
      latest: latest ? { date: latest.date, value: latest.value } : null,
      count: weights.length,
    },
    training: {
      last7: finished.filter((w) => w.startedAt >= cutoff7).length,
      last30: finished.filter((w) => w.startedAt >= cutoff30).length,
      lastWorkout: finished[0] ?? null,
      recent: finished.slice(0, 5),
    },
  };
}
