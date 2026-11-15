import { eq } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db/client";
import { defineRead, runRead, type Read } from "@/lib/db/batch";
import { profiles, users, type Profile, type User } from "@/lib/db/schema";

export async function findUserByHandle(handle: string): Promise<User | null> {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.handle, handle.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: number): Promise<User | null> {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Users selectable on the passphrase login screen. */
export async function listUsers(): Promise<Pick<User, "id" | "handle" | "name" | "role">[]> {
  const db = await getDb();
  return db
    .select({ id: users.id, handle: users.handle, name: users.name, role: users.role })
    .from(users)
    .orderBy(users.id);
}

/**
 * First Google sign-in from an allow-listed email that has no row yet: create
 * a client user attached to the first profile.
 */
export async function createUserFromGoogle(email: string, name: string): Promise<User> {
  const db = await getDb();
  const [firstProfile] = await db.select().from(profiles).orderBy(profiles.id).limit(1);
  if (!firstProfile) throw new Error("No profiles exist; run the seed first.");
  const handle = email.toLowerCase().split("@")[0]!.replace(/[^a-z0-9]/g, "") || `user${Date.now()}`;
  const [row] = await db
    .insert(users)
    .values({
      handle,
      email: email.toLowerCase(),
      name,
      role: "client",
      defaultProfileId: firstProfile.id,
    })
    .returning();
  return row!;
}

export async function listProfiles(): Promise<Profile[]> {
  const db = await getDb();
  return runRead(db, profilesRead(db));
}

export function profilesRead(db: Database): Read<Profile[]> {
  return defineRead([db.select().from(profiles).orderBy(profiles.id)], ([rows]) => rows);
}

export async function getProfile(id: number): Promise<Profile | null> {
  const db = await getDb();
  const rows = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return rows[0] ?? null;
}
