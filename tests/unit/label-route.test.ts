/**
 * POST /api/foods/label: one photo in, the custom-food draft out. Signed-in only, images only,
 * under the size cap, and the photo never leaves the request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LabelReaderResult } from "@/lib/nutrition/label-reader";

const getSessionUser = vi.fn();
const reader = vi.fn<(image: { data: string; mediaType: string }) => Promise<LabelReaderResult>>();
vi.mock("@/lib/auth/session", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("@/lib/nutrition/label-reader-for-env", () => ({ getLabelReader: () => reader }));

const { POST } = await import("@/app/api/foods/label/route");
const { MAX_PHOTO_BYTES } = await import("@/lib/nutrition/label-photo");

const AVERY = { id: 2, name: "Avery", role: "client", defaultProfileId: 2 };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const DRAFT = { name: null, brand: null, servingLabel: "1 cup", servingGrams: 228, kcal: 210, proteinG: 9, carbsG: 30, fatG: 6, fiberG: 2 };
const USAGE = { inputTokens: 2000, outputTokens: 100 };

function post(body: Uint8Array, type = "image/jpeg") {
  return POST(new Request("https://app.test/api/foods/label", { method: "POST", headers: { "content-type": type }, body: new Blob([body as Uint8Array<ArrayBuffer>]) }));
}

beforeEach(() => {
  getSessionUser.mockReset().mockResolvedValue(AVERY);
  reader.mockReset().mockResolvedValue({ ok: true, draft: DRAFT, model: "m", usage: USAGE });
});

describe("POST /api/foods/label", () => {
  it("refuses a signed-out request before reading anything", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = await post(JPEG);
    expect(res.status).toBe(401);
    expect(reader).not.toHaveBeenCalled();
  });

  it("returns the draft for a readable label, sending the photo as base64", async () => {
    const res = await post(JPEG);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draft: DRAFT });
    expect(reader).toHaveBeenCalledWith({ data: Buffer.from(JPEG).toString("base64"), mediaType: "image/jpeg" });
  });

  it("names the media type from the file's bytes, not the header", async () => {
    await post(PNG, "image/jpeg");
    expect(reader.mock.calls[0]?.[0].mediaType).toBe("image/png");
  });

  it("refuses something that is not a JPEG, PNG or WebP", async () => {
    const res = await post(new TextEncoder().encode("<svg></svg>"), "image/svg+xml");
    expect(res.status).toBe(415);
    expect(reader).not.toHaveBeenCalled();
  });

  it("refuses an empty or oversized photo", async () => {
    expect((await post(new Uint8Array())).status).toBe(415);
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(JPEG);
    expect((await post(big)).status).toBe(413);
    expect(reader).not.toHaveBeenCalled();
  });

  it("answers 422 when the photo is not a readable label", async () => {
    reader.mockResolvedValue({ ok: false, reason: "unreadable", model: "m", usage: USAGE });
    const res = await post(JPEG);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Could not read the label." });
  });

  it("answers 502 when no model answered", async () => {
    reader.mockResolvedValue({ ok: false, reason: "error", model: "m", usage: USAGE, error: "overloaded" });
    const res = await post(JPEG);
    expect(res.status).toBe(502);
    expect((await res.json()).error).not.toContain("overloaded");
  });
});
