/**
 * Builds the demo's database snapshot: migrations, the base seed and 60 days of demo history in a
 * throwaway PGlite, dumped to .data/demo-snapshot/. Runs before `next build` when DEMO_MODE=1, so a
 * cold start on the hosted demo loads a finished database instead of seeding one.
 *
 *   DEMO_MODE=1 node --import tsx scripts/make-demo-snapshot.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";

if (process.env.DEMO_MODE !== "1") {
  console.log("make-demo-snapshot: DEMO_MODE is not 1, skipping");
  process.exit(0);
}

process.env.PGLITE_DIR = ":memory:";
process.env.PGLITE_AUTO_SETUP = "0";

const started = performance.now();
const { getDb, closeDb } = await import("../lib/db/client");
const { runMigrations } = await import("../lib/db/migrate");
const { seed } = await import("../lib/db/seed");
const { seedDemo } = await import("../lib/demo/seed");
const { SNAPSHOT_DIR, SNAPSHOT_FILE, SNAPSHOT_META } = await import("../lib/demo/snapshot");
const { todayLocal } = await import("../lib/utils/date");

const db = await getDb();
await runMigrations(db);
await seed(db);
await seedDemo(db);

const pglite = (globalThis as unknown as { __slateDb: { pglite: import("@electric-sql/pglite").PGlite } }).__slateDb.pglite;
const dump = await pglite.dumpDataDir("gzip");
mkdirSync(SNAPSHOT_DIR, { recursive: true });
writeFileSync(SNAPSHOT_FILE, Buffer.from(await dump.arrayBuffer()));
writeFileSync(SNAPSHOT_META, JSON.stringify({ today: todayLocal() }) + "\n");
await closeDb();
console.log(`make-demo-snapshot: wrote ${SNAPSHOT_FILE} (${(dump.size / 1024).toFixed(0)} KB) in ${((performance.now() - started) / 1000).toFixed(1)} s`);
