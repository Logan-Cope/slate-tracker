import type { Metadata } from "next";
import { getActiveProfileId, profileContextRead, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { constRead, readAll, runRead } from "@/lib/db/batch";
import { measurementsRead } from "@/lib/db/queries/metrics";
import { ewmaTrend, latestTrend, weeklyRate } from "@/lib/metrics/trend";
import { shiftDate, todayLocal } from "@/lib/utils/date";
import { PageHeader } from "@/components/ui/page-header";
import { WeighInForm } from "@/components/metrics/weigh-in-form";
import { WeightChart } from "@/components/metrics/weight-chart";
import { TrendHeadline } from "@/components/metrics/trend-headline";
import { WeighInList } from "@/components/metrics/weigh-in-list";

export const metadata: Metadata = { title: "Weight" };

export const dynamic = "force-dynamic";

export default async function WeightPage() {
  const user = await requireUser();
  const [profileId, db] = await Promise.all([getActiveProfileId(), getDb()]);
  const today = todayLocal();
  const weighIns = (id: number) => measurementsRead(db, id, "weight", { from: shiftDate(today, -400) });
  // A coach's subtitle names the profile on screen, read with the weigh-ins; a client's id needs no query.
  const loaded = await readAll(db, {
    ctx: user.role === "coach" ? profileContextRead(db, user, profileId) : constRead(null),
    readings: weighIns(profileId),
  });
  const viewing = loaded.ctx?.profile ?? null;
  // A stale cookie named a deleted profile: the default is on screen, so its weigh-ins are.
  const readings = viewing && viewing.id !== profileId ? await runRead(db, weighIns(viewing.id)) : loaded.readings;
  const points = ewmaTrend(readings.map((r) => ({ date: r.date, value: r.value })));
  const trend = latestTrend(points);
  const rate = weeklyRate(points);
  const latest = readings[readings.length - 1] ?? null;
  const todays = readings.find((r) => r.date === today) ?? null;

  return (
    <div className="pb-6">
      <PageHeader title="Weight" subtitle={viewing ? `${viewing.name}'s weigh-ins` : "Weigh in once a day, first thing"} />

      <section className="px-5">
        <WeighInForm
          loggedToday={Boolean(todays)}
          today={today}
        />
      </section>

      {points.length > 0 ? (
        <>
          <section className="px-5 mt-5">
            <TrendHeadline trend={trend} rate={rate} latest={latest ? { date: latest.date, value: latest.value } : null} count={readings.length} />
          </section>
          <section className="px-5 mt-4">
            <div className="card p-4">
              <WeightChart points={points} />
            </div>
          </section>
        </>
      ) : (
        <p className="px-5 mt-6 text-muted text-sm">
          Your first weigh-in starts the trend line. The trend smooths out day-to-day water swings so you can see what is
          really happening.
        </p>
      )}

      {/* Always mounted, even with no rows: the list owns the Undo toast, and deleting the last weigh-in must not unmount it. */}
      <WeighInList
        rows={[...readings]
          .reverse()
          .slice(0, 14)
          .map((r) => ({ id: r.id, date: r.date, value: r.value, trend: points.find((p) => p.date === r.date)?.trend ?? null }))}
      />
    </div>
  );
}
