import { describe, expect, it } from "vitest";
import { centerSquare, pickZoom, READER_OPTIONS, STICKER_AFTER_MS, STICKER_OPTIONS, stickerPass, videoConstraints } from "@/lib/scan/camera";

describe("videoConstraints", () => {
  const c = videoConstraints();

  it("prefers the back camera without requiring it (a laptop has only a front one)", () => {
    expect(c.facingMode).toEqual({ ideal: "environment" });
  });

  it("asks for 1080p so a UPC held a hand's length away still has 2 pixels per bar", () => {
    // 640 wide gives 0.78 px per bar at 20 cm, 1920 gives 2.35; the decoder needs about 1.5 (tests/unit/scan-decode.test.ts).
    expect(c.width).toEqual({ ideal: 1920 });
    expect(c.height).toEqual({ ideal: 1080 });
  });

  it("uses ideal, never exact, so an older phone that tops out at 720p still opens", () => {
    const flat = JSON.stringify(c);
    expect(flat).not.toContain('"exact"');
    expect(flat).not.toContain('"min"');
  });
});

describe("pickZoom", () => {
  it("returns null when the track reports no zoom capability", () => {
    expect(pickZoom(undefined)).toBeNull();
    expect(pickZoom({})).toBeNull();
  });

  it("picks 2x when the range allows it", () => {
    expect(pickZoom({ zoom: { min: 1, max: 8, step: 0.1 } })).toBe(2);
  });

  it("clamps to the camera's maximum", () => {
    expect(pickZoom({ zoom: { min: 1, max: 1.5 } })).toBe(1.5);
  });

  it("returns null when zoom cannot go above 1x, since applying 1x is a no-op", () => {
    expect(pickZoom({ zoom: { min: 1, max: 1 } })).toBeNull();
  });

  it("never goes below the camera's minimum", () => {
    expect(pickZoom({ zoom: { min: 3, max: 10 } })).toBe(3);
  });

  it("snaps to the step so applyConstraints does not reject the value", () => {
    expect(pickZoom({ zoom: { min: 1, max: 4, step: 0.5 } }, 2.2)).toBe(2);
    expect(pickZoom({ zoom: { min: 1, max: 4, step: 0.5 } }, 2.3)).toBe(2.5);
  });
});

describe("centerSquare", () => {
  it("is the largest centered square of a landscape frame", () => {
    expect(centerSquare(1920, 1080)).toEqual({ sx: 420, sy: 0, side: 1080 });
  });

  it("is the largest centered square of a portrait frame", () => {
    expect(centerSquare(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 });
  });

  it("is the whole frame when it is already square", () => {
    expect(centerSquare(720, 720)).toEqual({ sx: 0, sy: 0, side: 720 });
  });
});

describe("stickerPass", () => {
  it("never runs in the first 1.5 s, so a food scan pays nothing for it", () => {
    for (let i = 0; i < 40; i++) expect(stickerPass(i * 37, i)).toBe(false);
    expect(stickerPass(STICKER_AFTER_MS - 1, 3)).toBe(false);
  });

  it("is exactly one decode in four afterwards", () => {
    const passes = Array.from({ length: 40 }, (_, i) => stickerPass(STICKER_AFTER_MS + i * 100, i));
    expect(passes.filter(Boolean)).toHaveLength(10);
    for (let i = 0; i < 40; i += 4) expect(passes.slice(i, i + 4).filter(Boolean)).toHaveLength(1);
  });
});

describe("STICKER_OPTIONS", () => {
  it("reads Code 128 only, one symbol", () => {
    expect([...STICKER_OPTIONS.formats!]).toEqual(["Code128"]);
    expect(STICKER_OPTIONS.maxNumberOfSymbols).toBe(1);
  });
});

describe("READER_OPTIONS", () => {
  it("reads only retail formats, with the extra scan lines and rotations on", () => {
    expect([...READER_OPTIONS.formats!]).toEqual(["EAN-13", "UPC-A", "UPC-E", "EAN-8"]);
    expect(READER_OPTIONS.tryHarder).toBe(true);
    expect(READER_OPTIONS.tryRotate).toBe(true);
    expect(READER_OPTIONS.maxNumberOfSymbols).toBe(1);
  });
});
