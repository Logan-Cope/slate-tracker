import type { Metadata } from "next";
import { getActiveProfileId, profileContextRead, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { constRead, readAll } from "@/lib/db/batch";
import { PageHeader } from "@/components/ui/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { APP_NAME } from "@/lib/app-name";
import { switchProfile } from "@/app/(app)/coach/actions";

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const isCoach = user.role === "coach";
  const [profileId, db] = await Promise.all([getActiveProfileId(), getDb()]);
  const { ctx } = await readAll(db, {
    ctx: isCoach ? profileContextRead(db, user, profileId) : constRead(null),
  });

  return (
    <div className="pb-8">
      <PageHeader title="Settings" />

      <section className="px-5">
        <div className="card p-4">
          <h2 className="font-bold mb-3">Appearance</h2>
          <ThemeToggle />
        </div>
      </section>

      <section className="px-5 mt-4">
        <div className="card p-4">
          <h2 className="font-bold">Account</h2>
          <p className="text-sm text-muted mt-1">
            Signed in as <span className="font-semibold text-fg">{user.name}</span>
            {isCoach ? " (coach)" : ""}.
          </p>
          {ctx && ctx.profiles.length > 1 ? (
            <form action={switchProfile} className="mt-3 flex items-center gap-2">
              <label className="text-sm font-medium text-muted" htmlFor="settings-profile">
                Viewing
              </label>
              <select id="settings-profile" name="profileId" defaultValue={ctx.profile.id} className="input py-2">
                {ctx.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-secondary py-2 min-h-0">
                Switch
              </button>
            </form>
          ) : null}
          <div className="mt-3">
            <SignOutButton variant="button" />
          </div>
        </div>
      </section>


      <p className="px-5 mt-6 text-xs text-muted">{APP_NAME}</p>
    </div>
  );
}
