import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { getActiveProfileId, profileContextRead, requireCoachPage } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { constRead, readAll } from "@/lib/db/batch";
import { coachSummaryRead } from "@/lib/db/queries/coach";
import { restaurantsRead } from "@/lib/db/queries/restaurants";
import type { Restaurant } from "@/lib/db/schema";
import { humanDate, todayLocal } from "@/lib/utils/date";
import { dateInZone } from "@/lib/utils/tz";
import { fmtG, fmtKcal, fmtWeight } from "@/lib/utils/format";
import { isOverTarget, kcalCellText } from "@/lib/nutrition/coach-table";
import { PageHeader } from "@/components/ui/page-header";
import { TargetsForm } from "@/components/coach/targets-form";
import { AddRestaurantForm } from "@/components/coach/add-restaurant-form";
import { SignOutButton } from "@/components/sign-out-button";
import { TrendHeadline } from "@/components/metrics/trend-headline";

export const metadata: Metadata = { title: "Coach" };

export const dynamic = "force-dynamic";
/** The find-menu action runs a long model call; it is submitted from this page. */
export const maxDuration = 300;

const SHOWN_RESTAURANTS = 8;

export default async function CoachPage() {
  const user = await requireCoachPage();
  const [profileId, db] = await Promise.all([getActiveProfileId(), getDb()]);
  const today = todayLocal();
  const first = await readAll(db, {
    ctx: profileContextRead(db, user, profileId),
    summary: coachSummaryRead(db, profileId, today),
    restaurants: restaurantsRead(db),
  });
  const { ctx, restaurants } = first;
  // A second round trip only when a stale cookie named a deleted profile (the default is on screen).
  const { summary } = await readAll(db, {
    summary: ctx.profile.id === profileId ? constRead(first.summary) : coachSummaryRead(db, ctx.profile.id, today),
  });
  // Chains refreshed from the web first (newest first), then the seeded ones by name,
  // so the list opens on what the coach actually touched rather than on 7-Eleven.
  const shownRestaurants = [...restaurants].sort((a, b) => {
    if (a.source !== b.source) return a.source === "web" ? -1 : 1;
    if (a.source === "web") return b.importedAt.getTime() - a.importedAt.getTime();
    return a.name.localeCompare(b.name);
  });
  const t = summary.target;

  return (
    <div className="pb-8">
      <PageHeader title="Coach" subtitle={`${ctx.profile.name}, last 7 days`} right={<SignOutButton />} />

      <section className="px-5">
        <div className="card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold">Food</h2>
            <span className="text-xs text-muted">
              {summary.daysLogged}/7 days logged
              {t ? ` · protein hit ${summary.proteinHitDays}/${summary.daysLogged}` : ""}
            </span>
          </div>
          <table className="w-full mt-3 text-sm tnum">
            <thead>
              <tr className="text-xs text-muted">
                <th className="text-left font-medium pb-1">Day</th>
                <th className="text-right font-medium pb-1">cal{t ? ` / ${fmtKcal(t.kcal)}` : ""}</th>
                <th className="text-right font-medium pb-1">protein{t ? ` / ${t.proteinG} g` : ""}</th>
              </tr>
            </thead>
            <tbody>
              {summary.days.map((d) => (
                <tr key={d.date} className="border-t border-line" data-testid={`coach-day-${d.date}`}>
                  <td className="py-1.5">
                    <Link href={`/today?date=${d.date}`} className="underline-offset-2 hover:underline">
                      {humanDate(d.date, summary.today)}
                    </Link>
                  </td>
                  <td className={`py-1.5 text-right ${!d.logged ? "text-muted" : t && isOverTarget(d.kcal, t.kcal) ? "text-danger" : ""}`}>
                    {kcalCellText(d, t)}
                  </td>
                  <td className={`py-1.5 text-right ${!d.logged ? "text-muted" : t && d.proteinG >= t.proteinG ? "text-protein-ink font-semibold" : ""}`}>
                    {d.logged ? `${fmtG(d.proteinG)} g` : "·"}
                  </td>
                </tr>
              ))}
            </tbody>
            {summary.avgKcal !== null ? (
              <tfoot>
                <tr className="border-t border-line font-semibold">
                  <td className="pt-2">Average</td>
                  <td className="pt-2 text-right">{fmtKcal(summary.avgKcal)}</td>
                  <td className="pt-2 text-right">{fmtG(summary.avgProteinG ?? 0)} g</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      <section className="px-5 mt-4">
        <div className="card p-4">
          <h2 className="font-bold mb-3">Weight</h2>
          {summary.weight.count > 0 ? (
            <TrendHeadline trend={summary.weight.trend} rate={summary.weight.rate} latest={summary.weight.latest} count={summary.weight.count} />
          ) : (
            <p className="text-sm text-muted">No weigh-ins yet.</p>
          )}
        </div>
      </section>

      <section className="px-5 mt-4">
        <div className="card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold">Training</h2>
            <Link href="/coach/programs" className="text-sm font-semibold text-accent-ink inline-flex items-center gap-0.5">
              Programs <ChevronRight size={16} />
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="last 7 days" value={String(summary.training.last7)} />
            <Stat label="last 30 days" value={String(summary.training.last30)} />
            <Stat
              label="last workout"
              value={summary.training.lastWorkout ? humanDate(summary.training.lastWorkout.startedAt.toISOString().slice(0, 10), summary.today) : "none"}
              small
            />
          </div>
          {summary.training.recent.length > 0 ? (
            <ul className="mt-3 divide-y divide-line text-sm">
              {summary.training.recent.map((w) => (
                <li key={w.id} className="py-2 flex items-center justify-between gap-3">
                  <Link href={`/train/workout/${w.id}`} className="font-medium truncate">
                    {w.title}
                  </Link>
                  <span className="text-muted tnum shrink-0">
                    {w.setCount} sets · {fmtWeight(w.volumeLb)} lb{w.prCount ? ` · ${w.prCount} PR` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="px-5 mt-4">
        <div className="card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold">Restaurants</h2>
            {restaurants.length > 0 ? (
              <span className="text-xs text-muted">{restaurants.length === 1 ? "1 chain" : `${restaurants.length} chains`}</span>
            ) : null}
          </div>
          {restaurants.length > 0 ? (
            <ul className="mt-3 divide-y divide-line text-sm">
              {shownRestaurants.slice(0, SHOWN_RESTAURANTS).map((r) => (
                <li key={r.id} className="py-2" data-testid="restaurant-row">
                  {restaurantRow(r)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No restaurants yet.</p>
          )}
          {restaurants.length > SHOWN_RESTAURANTS ? (
            <p className="mt-2 text-sm text-muted">and {restaurants.length - SHOWN_RESTAURANTS} more</p>
          ) : null}
          <AddRestaurantForm />
        </div>
      </section>

      <section className="px-5 mt-4">
        <div className="card p-4">
          <h2 className="font-bold">Targets</h2>
          <p className="text-xs text-muted mt-0.5">Applies from today. Earlier days keep the targets they had.</p>
          <TargetsForm
            initial={{ kcal: t?.kcal ?? 1500, proteinG: t?.proteinG ?? 100, carbsG: t?.carbsG ?? null, fatG: t?.fatG ?? null }}
          />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 py-2 px-1">
      <div className={`tnum font-black ${small ? "text-base" : "text-2xl"}`}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

/** "Chipotle · 118 items · Jan 2018" (MenuStat) or "· Oct 19" (web import). */
function restaurantRow(r: Restaurant): string {
  const date = r.source === "menustat" ? format(parseISO(r.menuAsOf), "MMM yyyy") : format(parseISO(dateInZone(r.importedAt)), "MMM d");
  return `${r.name} · ${r.itemCount} ${r.itemCount === 1 ? "item" : "items"} · ${date}`;
}
