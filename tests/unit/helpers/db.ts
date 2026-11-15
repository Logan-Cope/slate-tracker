/**
 * Integration-test database: a throwaway in-memory PGlite with migrations and
 * the standard seed applied. Call `setupTestDb()` in beforeAll and the
 * returned `close` in afterAll.
 */
process.env.PGLITE_DIR = ":memory:";
delete process.env.DATABASE_URL;

import { closeDb, getDb, type Database } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { seed, seedTestFoods } from "@/lib/db/seed";

export async function setupTestDb(opts: { foods?: boolean } = {}): Promise<{ db: Database; close: () => Promise<void> }> {
  const db = await getDb();
  await runMigrations(db);
  await seed(db);
  if (opts.foods) await seedTestFoods(db);
  return { db, close: closeDb };
}

export const AVERY = 1;
