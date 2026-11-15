import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb } from "./helpers/db";
import type { Database } from "@/lib/db/client";
import { foods, restaurantImports, restaurants, users } from "@/lib/db/schema";
import { getRestaurantBySlug, upsertMenu, upsertRestaurant } from "@/lib/db/queries/restaurants";
import {
  applyDraft,
  createDraft,
  getDraft,
  hasDraftInFlight,
  type DraftItem,
} from "@/lib/db/queries/restaurant-drafts";
import { dateInZone } from "@/lib/utils/tz";

let close: () => Promise<void>;
let db: Database;
let coachId: number;

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-19T15:00:00Z");

const item = (name: string, kcal = 100, proteinG = 10): DraftItem => ({ name, kcal, proteinG });

function draftInput(id: string, restaurantName: string, items: DraftItem[], overrides: Record<string, unknown> = {}) {
  return {
    id,
    restaurantName,
    sourceUrl: `https://example.com/${id}`,
    items,
    warnings: ["dropped 1 item with no calories"],
    model: "claude-sonnet-4-5",
    inputTokens: 1200,
    outputTokens: 340,
    createdBy: coachId,
    ...overrides,
  };
}

async function draftRows(id: string) {
  return db.select().from(restaurantImports).where(eq(restaurantImports.id, id));
}

async function foodsFor(restaurantId: number) {
  return db.select().from(foods).where(eq(foods.restaurantId, restaurantId));
}

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
  const coach = await db.select({ id: users.id }).from(users).where(eq(users.role, "coach")).limit(1);
  coachId = coach[0]!.id;
});
afterAll(() => close());

describe("createDraft", () => {
  it("stores and returns the draft with existing = null for a new chain", async () => {
    const draft = await createDraft(draftInput("draft-new-1", "Shake Shack", [item("ShackBurger", 530, 28)]));
    expect(draft.id).toBe("draft-new-1");
    expect(draft.restaurantName).toBe("Shake Shack");
    expect(draft.sourceUrl).toBe("https://example.com/draft-new-1");
    expect(draft.items).toEqual([item("ShackBurger", 530, 28)]);
    expect(draft.warnings).toEqual(["dropped 1 item with no calories"]);
    expect(draft.model).toBe("claude-sonnet-4-5");
    expect(draft.inputTokens).toBe(1200);
    expect(draft.outputTokens).toBe(340);
    expect(draft.createdBy).toBe(coachId);
    expect(draft.createdAt).toBeInstanceOf(Date);
    expect(draft.appliedAt).toBeNull();
    expect(draft.existing).toBeNull();

    expect(await draftRows("draft-new-1")).toHaveLength(1);
  });

  it("is idempotent on the same id: one row, the stored draft is returned", async () => {
    const first = await createDraft(draftInput("draft-dup-1", "Five Guys", [item("Cheeseburger", 980, 47)]));
    const second = await createDraft(draftInput("draft-dup-1", "Five Guys RETRY", [item("Fries", 950, 15)]));
    expect(second.restaurantName).toBe(first.restaurantName);
    expect(second.items).toEqual(first.items);
    expect(await draftRows("draft-dup-1")).toHaveLength(1);
  });
});

describe("getDraft", () => {
  it("returns existing for a chain already in the database", async () => {
    const { id } = await upsertRestaurant({ name: "Chick-fil-A", source: "menustat", menuAsOf: "2018-01-01" });
    await upsertMenu(id, [item("Chicken Sandwich", 440, 28), item("Waffle Fries", 420, 5)]);

    await createDraft(draftInput("draft-existing-1", "Chick Fil A", [item("Chicken Sandwich", 450, 29)]));
    const draft = await getDraft("draft-existing-1");
    expect(draft).not.toBeNull();
    expect(draft!.existing).toEqual({
      id,
      name: "Chick-fil-A",
      itemCount: 2,
      source: "menustat",
      menuAsOf: "2018-01-01",
    });
  });

  it("returns null for a missing draft and for one older than 7 days", async () => {
    expect(await getDraft("nope")).toBeNull();

    await db.insert(restaurantImports).values({
      ...draftInput("draft-old-1", "Old Chain", [item("Stale Burger")]),
      createdAt: new Date(Date.now() - 8 * DAY_MS),
    });
    expect(await draftRows("draft-old-1")).toHaveLength(1);
    expect(await getDraft("draft-old-1")).toBeNull();
  });
});

describe("applyDraft", () => {
  it("inserts a new chain as web with menuAsOf = today in the app zone and marks the draft applied", async () => {
    await createDraft(draftInput("draft-apply-new", "Raising Cane's", [item("Box Combo", 1250, 60)]));
    const result = await applyDraft("draft-apply-new", { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result).toEqual({ inserted: 1, updated: 0, retired: 0, revived: 0 });
    expect(result.itemCount).toBe(1);

    const row = await getRestaurantBySlug("raisingcanes");
    expect(row).not.toBeNull();
    expect(row!.id).toBe(result.restaurantId);
    expect(row!.source).toBe("web");
    expect(row!.sourceUrl).toBe("https://example.com/draft-apply-new");
    expect(row!.menuAsOf).toBe(dateInZone(NOW));
    expect(row!.itemCount).toBe(1);

    const [draft] = await draftRows("draft-apply-new");
    expect(draft!.appliedAt).toEqual(NOW);
  });

  it("upserts items onto an existing chain and retires the item not in the draft", async () => {
    const { id } = await upsertRestaurant({ name: "Wendy's", source: "menustat", menuAsOf: "2018-01-01" });
    await upsertMenu(id, [item("Baconator", 960, 58), item("Frosty", 350, 9)]);

    await createDraft(draftInput("draft-apply-existing", "Wendys", [item("Baconator", 970, 57), item("Dave's Single", 570, 30)]));
    const result = await applyDraft("draft-apply-existing", { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.restaurantId).toBe(id);
    expect(result.result).toEqual({ inserted: 1, updated: 1, retired: 1, revived: 0 });
    expect(result.itemCount).toBe(2);

    const row = await getRestaurantBySlug("wendys");
    expect(row!.source).toBe("web");
    expect(row!.menuAsOf).toBe(dateInZone(NOW));

    const byName = new Map((await foodsFor(id)).map((f) => [f.name, f]));
    expect(byName.get("Baconator")!.kcal).toBe(970);
    expect(byName.get("Baconator")!.retiredAt).toBeNull();
    expect(byName.get("Dave's Single")!.retiredAt).toBeNull();
    expect(byName.get("Frosty")!.retiredAt).not.toBeNull();
  });

  it("returns already_applied on a second apply and leaves the menu untouched", async () => {
    const before = await foodsFor((await getRestaurantBySlug("wendys"))!.id);
    const again = await applyDraft("draft-apply-existing", { now: new Date(NOW.getTime() + 60_000) });
    expect(again).toEqual({ ok: false, error: "already_applied" });
    const after = await foodsFor((await getRestaurantBySlug("wendys"))!.id);
    expect(after).toEqual(before);
    const [draft] = await draftRows("draft-apply-existing");
    expect(draft!.appliedAt).toEqual(NOW);
  });

  it("returns empty for a draft with no items and writes nothing", async () => {
    await createDraft(draftInput("draft-empty", "Empty Chain", []));
    expect(await applyDraft("draft-empty", { now: NOW })).toEqual({ ok: false, error: "empty" });
    expect(await getRestaurantBySlug("emptychain")).toBeNull();
    const [draft] = await draftRows("draft-empty");
    expect(draft!.appliedAt).toBeNull();
  });

  it("returns not_found for a missing draft and expired for an old one", async () => {
    expect(await applyDraft("nope", { now: NOW })).toEqual({ ok: false, error: "not_found" });

    await db.insert(restaurantImports).values({
      ...draftInput("draft-expired", "Expired Chain", [item("Old Fries")]),
      createdAt: new Date(NOW.getTime() - 8 * DAY_MS),
    });
    expect(await applyDraft("draft-expired", { now: NOW })).toEqual({ ok: false, error: "expired" });
    expect(await getRestaurantBySlug("expiredchain")).toBeNull();
    expect(await db.select().from(restaurants).where(eq(restaurants.slug, "expiredchain"))).toHaveLength(0);
  });
});

describe("hasDraftInFlight", () => {
  it("is true right after createDraft and false once applied", async () => {
    const draft = await createDraft(draftInput("draft-flight-1", "In Flight", [item("Wrap", 400, 20)]));
    const now = new Date(draft.createdAt.getTime() + 60_000);
    expect(await hasDraftInFlight(coachId, { now })).toBe(true);
    expect(await hasDraftInFlight(coachId + 1000, { now })).toBe(false);

    await db.update(restaurantImports).set({ appliedAt: now }).where(eq(restaurantImports.createdBy, coachId));
    expect(await hasDraftInFlight(coachId, { now })).toBe(false);
  });

  it("is false when the only unapplied draft is older than the window", async () => {
    const draft = await createDraft(draftInput("draft-flight-2", "Stale Flight", [item("Bowl", 600, 35)]));
    const sixMinutesLater = new Date(draft.createdAt.getTime() + 6 * 60_000);
    expect(await hasDraftInFlight(coachId, { now: sixMinutesLater })).toBe(false);
    expect(await hasDraftInFlight(coachId, { now: sixMinutesLater, withinMinutes: 10 })).toBe(true);
  });
});
