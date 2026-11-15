/**
 * Restaurant import drafts: an extracted menu waits in `restaurant_imports`
 * until the coach reviews and applies it. Drafts expire after 7 days and
 * apply exactly once.
 *
 * No db.transaction here: the Neon HTTP driver used in production throws on
 * transactions. Apply is a sequence of idempotent upserts followed by the
 * applied_at stamp, so a retry after an interruption completes the same
 * result rather than duplicating it.
 */
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { restaurantImports, restaurants, type RestaurantImport, type RestaurantSource } from "@/lib/db/schema";
import { getRestaurantBySlug, upsertMenu, upsertRestaurant, type UpsertMenuResult } from "@/lib/db/queries/restaurants";
import { displayName, restaurantSlug } from "@/lib/restaurants/aliases";
import type { ValidatedItem } from "@/lib/restaurants/validate";
import { dateInZone } from "@/lib/utils/tz";

export type DraftItem = ValidatedItem;

export type RestaurantDraft = {
  id: string;
  restaurantName: string;
  sourceUrl: string | null;
  items: DraftItem[];
  warnings: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  createdBy: number;
  createdAt: Date;
  appliedAt: Date | null;
  /** The chain this draft would overwrite, when one already exists under the same slug. */
  existing: { id: number; name: string; itemCount: number; source: RestaurantSource; menuAsOf: string } | null;
};

export type CreateDraftInput = {
  id: string;
  restaurantName: string;
  sourceUrl: string | null;
  items: DraftItem[];
  warnings: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  createdBy: number;
};

export type ApplyDraftError = "not_found" | "expired" | "already_applied" | "empty";
export type ApplyDraftResult =
  | { ok: true; restaurantId: number; result: UpsertMenuResult; itemCount: number }
  | { ok: false; error: ApplyDraftError };

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_IN_FLIGHT_MINUTES = 5;

/** Inserts the draft; on an id collision the stored row wins, so client retries are idempotent. */
export async function createDraft(input: CreateDraftInput): Promise<RestaurantDraft> {
  const db = await getDb();
  const [inserted] = await db
    .insert(restaurantImports)
    .values({
      id: input.id,
      restaurantName: input.restaurantName,
      sourceUrl: input.sourceUrl,
      items: input.items,
      warnings: input.warnings,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      createdBy: input.createdBy,
    })
    .onConflictDoNothing({ target: restaurantImports.id })
    .returning();
  const row = inserted ?? (await loadRow(input.id));
  if (!row) throw new Error(`Draft ${input.id} vanished after insert`);
  return toDraft(row);
}

/** The draft, or null when it does not exist or is older than 7 days. */
export async function getDraft(id: string): Promise<RestaurantDraft | null> {
  const row = await loadRow(id);
  if (!row || isExpired(row, new Date())) return null;
  return toDraft(row);
}

/**
 * Writes the draft's menu into `restaurants` and `foods` as a web import
 * dated today and stamps applied_at. Refuses when the draft is missing,
 * expired, already applied, or has no items.
 */
export async function applyDraft(id: string, opts: { now?: Date } = {}): Promise<ApplyDraftResult> {
  const now = opts.now ?? new Date();
  const row = await loadRow(id);
  if (!row) return { ok: false, error: "not_found" };
  if (isExpired(row, now)) return { ok: false, error: "expired" };
  if (row.appliedAt !== null) return { ok: false, error: "already_applied" };
  const items = parseItems(row.items);
  if (items.length === 0) return { ok: false, error: "empty" };

  const name = displayName(row.restaurantName.trim());
  const { id: restaurantId } = await upsertRestaurant({
    name,
    source: "web",
    sourceUrl: row.sourceUrl,
    menuAsOf: dateInZone(now),
  });
  const result = await upsertMenu(restaurantId, items, { retireMissing: true });

  const db = await getDb();
  await db
    .update(restaurantImports)
    .set({ appliedAt: now })
    .where(and(eq(restaurantImports.id, id), isNull(restaurantImports.appliedAt)));

  const counted = await db
    .select({ itemCount: restaurants.itemCount })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  return { ok: true, restaurantId, result, itemCount: counted[0]?.itemCount ?? 0 };
}

/** True when this user has an unapplied draft created within the window (default 5 minutes). */
export async function hasDraftInFlight(
  createdBy: number,
  opts: { now?: Date; withinMinutes?: number } = {},
): Promise<boolean> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.withinMinutes ?? DEFAULT_IN_FLIGHT_MINUTES) * 60_000);
  const db = await getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(restaurantImports)
    .where(
      and(
        eq(restaurantImports.createdBy, createdBy),
        isNull(restaurantImports.appliedAt),
        gte(restaurantImports.createdAt, since),
      ),
    );
  return (rows[0]?.n ?? 0) > 0;
}

async function loadRow(id: string): Promise<RestaurantImport | null> {
  const db = await getDb();
  const rows = await db.select().from(restaurantImports).where(eq(restaurantImports.id, id)).limit(1);
  return rows[0] ?? null;
}

function isExpired(row: RestaurantImport, now: Date): boolean {
  return now.getTime() - row.createdAt.getTime() > DRAFT_TTL_MS;
}

async function toDraft(row: RestaurantImport): Promise<RestaurantDraft> {
  const existing = await getRestaurantBySlug(restaurantSlug(row.restaurantName));
  return {
    id: row.id,
    restaurantName: row.restaurantName,
    sourceUrl: row.sourceUrl,
    items: parseItems(row.items),
    warnings: parseWarnings(row.warnings),
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    appliedAt: row.appliedAt,
    existing: existing
      ? {
          id: existing.id,
          name: existing.name,
          itemCount: existing.itemCount,
          source: existing.source,
          menuAsOf: existing.menuAsOf,
        }
      : null,
  };
}

/** Items were validated before storage; the only guard needed is the jsonb shape. */
function parseItems(raw: unknown): DraftItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((it): it is DraftItem => typeof it === "object" && it !== null && typeof it.name === "string");
}

function parseWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((w): w is string => typeof w === "string");
}
