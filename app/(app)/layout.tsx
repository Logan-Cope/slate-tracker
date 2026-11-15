/**
 * Authenticated shell: bottom tab bar plus, for coaches, a banner naming the
 * profile being viewed. The auth check runs server-side on every request; only
 * a coach's banner reads the database.
 */
import { getProfileContext, requireUser } from "@/lib/auth/session";
import { BottomTabs } from "@/components/bottom-tabs";
import { ProfileBanner } from "@/components/profile-banner";
import { Providers } from "@/components/providers";
import { PendingTabProvider, TabMain } from "@/components/tab-pending";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const ctx = user.role === "coach" ? await getProfileContext() : null;

  return (
    <Providers>
      <PendingTabProvider>
        <div className="min-h-dvh flex flex-col">
          {ctx ? (
            <ProfileBanner
              profiles={ctx.profiles.map((p) => ({ id: p.id, name: p.name }))}
              activeId={ctx.profile.id}
              highlight={ctx.profile.id !== user.defaultProfileId}
            />
          ) : null}
          <TabMain switcher={(ctx?.profiles.length ?? 0) > 1} className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
            {children}
          </TabMain>
          <BottomTabs isCoach={ctx !== null} />
        </div>
      </PendingTabProvider>
    </Providers>
  );
}
