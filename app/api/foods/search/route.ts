import { NextResponse } from "next/server";
import { getActiveProfileId, getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { searchFoods } from "@/lib/db/queries/food-search";
import { getFoods } from "@/lib/db/queries/foods";
import { lastUsed } from "@/lib/db/queries/nutrition";
import { toFoodSummary } from "@/components/nutrition/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/foods/search?q=&limit= -> { hits }
 * Each hit is the ranked search row plus its alternate servings and the
 * profile's last-used amount, so tiles can show what one tap would log.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profileId = await getActiveProfileId();

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const limitRaw = Number(params.get("limit") ?? 25);
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 25;
  if (!q) return NextResponse.json({ hits: [] });

  const db = await getDb();
  const rows = await searchFoods(db, { q, profileId, limit });
  const ids = rows.map((r) => r.id);
  const [foodsById, last] = await Promise.all([getFoods(profileId, ids), lastUsed(profileId, ids)]);
  const hits = rows.flatMap((row) => {
    const food = foodsById.get(row.id);
    if (!food) return [];
    return [{ ...toFoodSummary(food, profileId, last.get(row.id) ?? null), inHistory: row.inHistory, score: row.score }];
  });
  return NextResponse.json({ hits });
}
