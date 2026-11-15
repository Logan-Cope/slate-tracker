/**
 * Restaurant chains and their menu items. Items live in `foods` with
 * `source = 'restaurant'`, keyed by the partial unique index
 * foods_restaurant_name_uniq on (restaurant_id, lower(name)).
 *
 * Items are never deleted: food_log rows point at them, so an item that
 * leaves the menu is retired (retired_at set), which hides it from search
 * while history keeps joining. A retired item that reappears is revived.
 *
 * The menu upsert is a raw SQL statement because drizzle's onConflictDoUpdate
 * only accepts plain columns as the conflict target and the index is on
 * lower(name). Counts are derived from a pre-select of the restaurant's rows.
 *
 * No db.transaction here: the Neon HTTP driver used in production throws on
 * transactions, and no other query module uses them. Every step is an
 * idempotent upsert, so re-running an interrupted import repairs it.
 */
import { and, asc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db/client";
import { defineRead, runRead, type Read } from "@/lib/db/batch";
import { foods, restaurants, type Restaurant, type RestaurantSource } from "@/lib/db/schema";
import { restaurantSlug } from "@/lib/restaurants/aliases";

export type MenuItemInput = {
  name: string;
  servingLabel?: string | null;
  kcal: number;
  proteinG: number;
  carbsG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
};

export type UpsertRestaurantInput = {
  name: string;
  source: RestaurantSource;
  sourceUrl?: string | null;
  /** YYYY-MM-DD */
  menuAsOf: string;
};

export type UpsertRestaurantResult = { id: number; created: boolean; previousSource: RestaurantSource | null };
export type UpsertMenuResult = { inserted: number; updated: number; retired: number; revived: number };

const DEFAULT_SERVING_LABEL = "1 item";
/** Rows per insert statement; 11 params each stays far under Postgres's 65535 limit. */
const INSERT_CHUNK = 500;

/** Creates the restaurant for `name`, or refreshes it when the slug already exists. */
export async function upsertRestaurant(input: UpsertRestaurantInput): Promise<UpsertRestaurantResult> {
  const db = await getDb();
  const name = input.name.trim();
  const slug = restaurantSlug(name);
  const values = { name, source: input.source, sourceUrl: input.sourceUrl ?? null, menuAsOf: input.menuAsOf };

  const existing = await db
    .select({ id: restaurants.id, source: restaurants.source })
    .from(restaurants)
    .where(eq(restaurants.slug, slug))
    .limit(1);
  if (existing[0]) {
    await db
      .update(restaurants)
      .set({ ...values, importedAt: new Date() })
      .where(eq(restaurants.id, existing[0].id));
    return { id: existing[0].id, created: false, previousSource: existing[0].source };
  }

  const [row] = await db
    .insert(restaurants)
    .values({ ...values, slug })
    .returning({ id: restaurants.id });
  return { id: row!.id, created: true, previousSource: null };
}

/**
 * Upserts `items` as this restaurant's foods, matching on lower(name).
 * Names are trimmed; blank names are skipped; duplicates within the call
 * collapse to the first occurrence. With `retireMissing`, live items not in
 * the call are retired. Always recomputes restaurants.item_count.
 */
export async function upsertMenu(
  restaurantId: number,
  items: MenuItemInput[],
  opts: { retireMissing?: boolean } = {},
): Promise<UpsertMenuResult> {
  const db = await getDb();
  const restaurant = (
    await db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1)
  )[0];
  if (!restaurant) throw new Error(`Restaurant ${restaurantId} not found`);

  const unique = dedupeItems(items);
  const keys = [...unique.keys()];

  const existing = await db
    .select({ name: foods.name, retiredAt: foods.retiredAt })
    .from(foods)
    .where(eq(foods.restaurantId, restaurantId));
  const existingByKey = new Map(existing.map((f) => [f.name.toLowerCase(), f]));

  let inserted = 0;
  let updated = 0;
  let revived = 0;
  for (const key of keys) {
    const prior = existingByKey.get(key);
    if (!prior) inserted += 1;
    else {
      updated += 1;
      if (prior.retiredAt !== null) revived += 1;
    }
  }

  const rows = [...unique.values()];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await upsertChunk(db, restaurantId, restaurant.name, rows.slice(i, i + INSERT_CHUNK));
  }

  let retired = 0;
  if (opts.retireMissing) {
    const stale = and(eq(foods.restaurantId, restaurantId), isNull(foods.retiredAt));
    const result = await db
      .update(foods)
      .set({ retiredAt: new Date() })
      .where(keys.length > 0 ? and(stale, notInArray(sql`lower(${foods.name})`, keys)) : stale)
      .returning({ id: foods.id });
    retired = result.length;
  }

  await db
    .update(restaurants)
    .set({
      itemCount: sql`(select count(*)::int from ${foods} where ${foods.restaurantId} = ${restaurantId} and ${foods.retiredAt} is null)`,
    })
    .where(eq(restaurants.id, restaurantId));

  return { inserted, updated, retired, revived };
}

export async function listRestaurants(): Promise<Restaurant[]> {
  const db = await getDb();
  return runRead(db, restaurantsRead(db));
}

export function restaurantsRead(db: Database): Read<Restaurant[]> {
  return defineRead([db.select().from(restaurants).orderBy(asc(restaurants.name))], ([rows]) => rows);
}

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const db = await getDb();
  const rows = await db.select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
  return rows[0] ?? null;
}

type NormalizedItem = Required<Pick<MenuItemInput, "name" | "kcal" | "proteinG">> & {
  servingLabel: string;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

/** Trimmed, blank-free, keyed by lowercased name; the first spelling wins. */
function dedupeItems(items: MenuItemInput[]): Map<string, NormalizedItem> {
  const out = new Map<string, NormalizedItem>();
  for (const it of items) {
    const name = it.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (out.has(key)) continue;
    out.set(key, {
      name,
      servingLabel: it.servingLabel?.trim() || DEFAULT_SERVING_LABEL,
      kcal: it.kcal,
      proteinG: it.proteinG,
      carbsG: it.carbsG ?? null,
      fatG: it.fatG ?? null,
      fiberG: it.fiberG ?? null,
    });
  }
  return out;
}

async function upsertChunk(
  db: Awaited<ReturnType<typeof getDb>>,
  restaurantId: number,
  brand: string,
  rows: NormalizedItem[],
): Promise<void> {
  if (rows.length === 0) return;
  const values = rows.map(
    (r) =>
      sql`(${restaurantId}, 'restaurant', ${brand}, ${r.name}, ${r.servingLabel}, ${r.kcal}, ${r.proteinG}, ${r.carbsG}, ${r.fatG}, ${r.fiberG})`,
  );
  await db.execute(sql`
    insert into foods (restaurant_id, source, brand, name, serving_label, kcal, protein_g, carbs_g, fat_g, fiber_g)
    values ${sql.join(values, sql`, `)}
    on conflict (restaurant_id, lower(name)) where restaurant_id is not null
    do update set
      brand = excluded.brand,
      name = excluded.name,
      serving_label = excluded.serving_label,
      serving_grams = null,
      kcal = excluded.kcal,
      protein_g = excluded.protein_g,
      carbs_g = excluded.carbs_g,
      fat_g = excluded.fat_g,
      fiber_g = excluded.fiber_g,
      retired_at = null
  `);
}
