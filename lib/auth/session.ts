/**
 * Server-side session helpers. Every page and action reads the active
 * profile through here; nothing hardcodes a profile id.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getDb, type Database } from "@/lib/db/client";
import { combineReads, runRead, type Read } from "@/lib/db/batch";
import { profilesRead } from "@/lib/db/queries/users";
import type { Profile } from "@/lib/db/schema";

export const PROFILE_COOKIE = "slate_profile";

export type SessionUser = {
  id: number;
  name: string;
  role: "coach" | "client";
  defaultProfileId: number;
};

/** Once per request: the layout and the page share it. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  return {
    id: Number(u.id),
    name: u.name ?? "",
    role: u.role,
    defaultProfileId: u.defaultProfileId,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The profile whose data is being viewed and edited. Coaches may switch via
 * cookie; everyone else is pinned to their default profile.
 */
/** The signed-in coach, or throws. Not a server action: lives here so it is never an endpoint. */
export async function requireCoach(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "coach") throw new Error("Coach only");
  return user;
}

/**
 * For coach pages. The coach layout redirects too, but Next can skip a layout
 * it believes the client already has, so every coach page checks for itself.
 */
export async function requireCoachPage(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "coach") redirect("/today");
  return user;
}

export async function getActiveProfileId(): Promise<number> {
  const user = await requireUser();
  if (user.role === "coach") {
    const raw = (await cookies()).get(PROFILE_COOKIE)?.value;
    const n = raw ? Number(raw) : NaN;
    if (Number.isInteger(n) && n > 0) return n;
  }
  return user.defaultProfileId;
}

export type ProfileContext = {
  user: SessionUser;
  profile: Profile;
  profiles: Profile[];
  isCoach: boolean;
};

/**
 * The signed-in user, every profile and the one on screen, read from a single
 * query of the profile list. Pages that need only the id call getActiveProfileId,
 * which reads no database. Once per request.
 */
export const getProfileContext = cache(async (): Promise<ProfileContext> => {
  const user = await requireUser();
  const [profileId, db] = await Promise.all([getActiveProfileId(), getDb()]);
  return runRead(db, profileContextRead(db, user, profileId));
});

/**
 * getProfileContext as a Read, for a page that sends it with its own queries:
 * `profileId` (from getActiveProfileId) is on screen unless a stale cookie names
 * a deleted profile, when the user's default is.
 */
export function profileContextRead(db: Database, user: SessionUser, profileId: number): Read<ProfileContext> {
  return combineReads({ profiles: profilesRead(db) }, ({ profiles }) => {
    const profile = profiles.find((p) => p.id === profileId) ?? profiles.find((p) => p.id === user.defaultProfileId);
    if (!profile) throw new Error("No profile for user; run the seed.");
    return { user, profile, profiles, isCoach: user.role === "coach" };
  });
}

export async function setActiveProfileCookie(profileId: number): Promise<void> {
  (await cookies()).set(PROFILE_COOKIE, String(profileId), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}
