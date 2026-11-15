/**
 * Database client. Picks the driver from the environment:
 *
 *   DATABASE_URL set   -> Neon serverless (production, Vercel)
 *   DATABASE_URL unset -> embedded PGlite at PGLITE_DIR (default .data/pglite)
 *
 * Both return a Drizzle instance over the same schema, so queries are written
 * once. The instance is cached on globalThis so Next's dev HMR does not open a
 * second PGlite handle on the same data directory.
 */
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * The common Postgres base of both drivers. A union of the two concrete
 * driver types breaks generic call signatures like `.returning({...})`.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

type Cache = { db?: Database; pglite?: import("@electric-sql/pglite").PGlite };
const g = globalThis as unknown as { __slateDb?: Cache };
const cache: Cache = (g.__slateDb ??= {});

export function isPglite(): boolean {
  return !process.env.DATABASE_URL;
}

/** Returns the shared database handle, creating it on first use. */
export async function getDb(): Promise<Database> {
  if (cache.db) return cache.db;

  const url = process.env.DATABASE_URL;
  if (url) {
    cache.db = drizzleNeon(neon(url), { schema });
    return cache.db;
  }

  // Dynamic import keeps PGlite's wasm out of the production bundle entirely.
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  // ":memory:" is used by unit tests for a throwaway database.
  const memory = dir === ":memory:";
  if (!memory) {
    // PGlite expects the parent directory to exist.
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
  }
  const pglite = await PGlite.create(memory ? undefined : dir, {
    extensions: { pg_trgm },
  });
  cache.pglite = pglite;
  const db = drizzlePglite(pglite, { schema });
  if (!memory && process.env.PGLITE_AUTO_SETUP !== "0") {
    // Fresh clone or e2e run: bring the embedded database up by itself.
    await ensureLocalSchema(db);
  }
  cache.db = db;
  return cache.db;
}

async function ensureLocalSchema(db: Database): Promise<void> {
  const { sql } = await import("drizzle-orm");
  const { runMigrations } = await import("./migrate");
  await runMigrations(db);
  const res = await db.execute(sql`select count(*)::int as n from profiles`);
  const rows = (res as unknown as { rows: { n: number }[] }).rows;
  if ((rows[0]?.n ?? 0) === 0) {
    const { seed, seedTestFoods, seedTestProfiles } = await import("./seed");
    await seed(db);
    if (process.env.E2E === "1") {
      await seedTestFoods(db);
      await seedTestProfiles(db);
    }
  }
}

/** Close the embedded database (tests). No-op for Neon. */
export async function closeDb(): Promise<void> {
  if (cache.pglite) {
    await cache.pglite.close();
  }
  cache.db = undefined;
  cache.pglite = undefined;
}
