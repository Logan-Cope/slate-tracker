import type { Config } from "drizzle-kit";

// Used only for `drizzle-kit generate` (SQL migration files from schema.ts).
// Migrations are applied by scripts/migrate.ts, which picks PGlite or Neon
// from DATABASE_URL, so no connection is needed here.
export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  strict: true,
  verbose: true,
} satisfies Config;
