import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { MAX_PHOTO_BYTES, sniffPhotoType } from "@/lib/nutrition/label-photo";
import { getLabelReader } from "@/lib/nutrition/label-reader-for-env";

export const dynamic = "force-dynamic";
/** A read takes about 2 s; the backup model can add a second read. */
export const maxDuration = 45;

/**
 * POST /api/foods/label, body: the photo (JPEG, PNG or WebP) -> { draft } | 422 | 4xx/502 { error }
 * Reads one nutrition label for the custom-food form. The photo is read and dropped, never stored.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Your session ended. Sign in again." }, { status: 401 });

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_PHOTO_BYTES) return NextResponse.json({ error: "That photo is too large." }, { status: 413 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_PHOTO_BYTES) return NextResponse.json({ error: "That photo is too large." }, { status: 413 });
  const mediaType = sniffPhotoType(bytes);
  if (!mediaType) return NextResponse.json({ error: "That file is not a photo." }, { status: 415 });

  const started = Date.now();
  const result = await getLabelReader()({ data: Buffer.from(bytes).toString("base64"), mediaType });
  console.info(
    JSON.stringify({ event: "label_read", ok: result.ok, reason: result.ok ? null : result.reason, model: result.model, ms: Date.now() - started, ...result.usage }),
  );

  if (result.ok) return NextResponse.json({ draft: result.draft });
  if (result.reason === "unreadable") return NextResponse.json({ error: "Could not read the label." }, { status: 422 });
  return NextResponse.json({ error: "Could not read the label right now. Try again." }, { status: 502 });
}
