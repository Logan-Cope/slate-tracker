import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { runMigrations } from "../lib/db/migrate";
import { closeDb, isPglite } from "../lib/db/client";

async function main() {
  console.log(`Migrating ${isPglite() ? `PGlite (${process.env.PGLITE_DIR ?? ".data/pglite"})` : "Neon"}...`);
  await runMigrations();
  console.log("Migrations applied.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
