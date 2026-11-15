import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db/client";
import { defineRead, runRead, type Read } from "@/lib/db/batch";
import { targets, type Target } from "@/lib/db/schema";

/**
 * The target row in force on a given date: the latest effective_from on or before
 * it (newest row on a tie). When none is in force yet (a target set for a future
 * date), the earliest one. One query either way.
 */
export async function getTargetFor(profileId: number, date: string): Promise<Target | null> {
  const db = await getDb();
  return runRead(db, targetRead(db, profileId, date));
}

export function targetRead(db: Database, profileId: number, date: string): Read<Target | null> {
  const inForce = sql`${targets.effectiveFrom} <= ${date}`;
  const query = db
    .select()
    .from(targets)
    .where(eq(targets.profileId, profileId))
    .orderBy(sql`(${inForce}) desc`, sql`case when ${inForce} then ${targets.effectiveFrom} end desc nulls last`, asc(targets.effectiveFrom), desc(targets.id))
    .limit(1);
  return defineRead([query], ([rows]) => rows[0] ?? null);
}

export async function setTarget(
  profileId: number,
  values: { kcal: number; proteinG: number; carbsG?: number | null; fatG?: number | null; effectiveFrom: string },
): Promise<Target> {
  const db = await getDb();
  const [row] = await db
    .insert(targets)
    .values({
      profileId,
      kcal: values.kcal,
      proteinG: values.proteinG,
      carbsG: values.carbsG ?? null,
      fatG: values.fatG ?? null,
      effectiveFrom: values.effectiveFrom,
    })
    .returning();
  return row!;
}
