import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { closeDb, getDb } from "../lib/db/client";
import { seed, seedTestFoods } from "../lib/db/seed";

async function main() {
  const db = await getDb();
  await seed(db, console.log);
  if (process.env.E2E === "1") await seedTestFoods(db, console.log);
  console.log("Seed complete.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
