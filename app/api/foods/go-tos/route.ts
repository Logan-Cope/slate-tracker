import { NextResponse } from "next/server";
import { getActiveProfileId, getSessionUser } from "@/lib/auth/session";
import { getGoTos, getRecents } from "@/lib/db/queries/nutrition";
import { toGoToDto } from "@/components/nutrition/serialize";

export const dynamic = "force-dynamic";

/** GET /api/foods/go-tos -> { goTos, recents }, ranked for the current hour. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profileId = await getActiveProfileId();
  const [goTos, recents] = await Promise.all([getGoTos(profileId, new Date()), getRecents(profileId)]);
  return NextResponse.json({
    goTos: goTos.map((g) => toGoToDto(g, profileId)),
    recents: recents.map((g) => toGoToDto(g, profileId)),
  });
}
