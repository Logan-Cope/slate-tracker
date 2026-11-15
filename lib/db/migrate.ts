/**
 * Applies lib/db/migrations to whichever database getDb() resolves to.
 * Used by scripts/migrate.ts, the test harness and the e2e server bootstrap.
 */
import path from "node:path";
import { getDb, isPglite, type Database } from "./client";

const migrationsFolder = path.join(process.cwd(), "lib/db/migrations");

export async function runMigrations(db?: Database): Promise<void> {
  const database = db ?? (await getDb());
  if (isPglite()) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(database as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(database as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
  }
}
