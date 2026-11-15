-- Typo-tolerant food search: trigram similarity on name + brand.
-- drizzle-kit cannot express gin_trgm_ops, so this migration is hand-written.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foods_name_trgm_idx" ON "foods" USING gin (("name" || ' ' || coalesce("brand", '')) gin_trgm_ops);
