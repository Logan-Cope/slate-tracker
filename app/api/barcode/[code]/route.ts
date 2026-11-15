import { NextResponse } from "next/server";
import { getSessionUser, getActiveProfileId } from "@/lib/auth/session";
import { cacheOffFood, findFoodByUpc, normalizeUpc } from "@/lib/db/queries/foods";
import { fetchOffProduct } from "@/lib/nutrition/off";

export const dynamic = "force-dynamic";

/**
 * GET /api/barcode/:code -> { food } | 404 { error }
 * Local catalogue first (USDA import, own custom foods, cached OFF products),
 * then Open Food Facts, whose hit is cached for next time.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Your session ended. Sign in again." }, { status: 401 });
  const profileId = await getActiveProfileId();
  const { code } = await ctx.params;
  const upc = normalizeUpc(code);
  if (upc.length < 6 || upc.length > 14) {
    return NextResponse.json({ error: "That does not look like a barcode. Check the digits and try again." }, { status: 400 });
  }

  const local = await findFoodByUpc(profileId, upc);
  if (local) return NextResponse.json({ food: local, source: "local" });

  try {
    const off = await fetchOffProduct(upc);
    if (!off) return NextResponse.json({ error: "No match. Add it as a custom food." }, { status: 404 });
    // Cache under the scanned code so the next lookup of the same code hits.
    const food = await cacheOffFood({ ...off, upc });
    return NextResponse.json({ food, source: "off" });
  } catch {
    return NextResponse.json({ error: "Could not reach Open Food Facts. Try again or add it manually." }, { status: 502 });
  }
}
