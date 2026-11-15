/**
 * Decoder limits with a synthetic camera. These numbers are the reason the scanner asks for
 * 1080p, applies a 2x zoom and runs a 45 degree pass. If the decoder or its options change,
 * this is what tells us whether the phone can still read a label at arm's length.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { READER_OPTIONS, ROTATED_PASS_DEGREES, STICKER_OPTIONS } from "@/lib/scan/camera";
import { blur, embed, paste, pxPerModuleAt, renderCode128, renderEan13, rotate, toImageData, type RawImage } from "./helpers/barcode-image";

const QUEST = "0888849000012"; // the Quest bar seeded in lib/db/seed.ts
const QUEST_DIGITS = /888849000012$/;

beforeAll(async () => {
  const wasm = readFileSync("node_modules/zxing-wasm/dist/reader/zxing_reader.wasm");
  await prepareZXingModule({
    overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) },
    fireImmediately: true,
  });
});

async function decode(img: RawImage): Promise<string | null> {
  const results = await readBarcodes(img as ImageData, READER_OPTIONS);
  const hit = results.find((r) => r.isValid);
  return hit ? hit.text.replace(/\D/g, "") : null;
}

const label = (pxPerModule: number) => renderEan13(QUEST, { pxPerModule, heightPx: Math.round(pxPerModule * 95 * 0.7) });

describe("Amazon sticker (Code 128)", () => {
  const FNSKU = "X0043HVMNB";
  const sticker = () => renderCode128(FNSKU, { pxPerModule: 3, heightPx: 120 });
  const scene = () => embed(label(3), 1280, 720);
  // The sticker covers the UPC's neighbor on the bag, in the same frame.
  const both = () => paste(scene(), sticker(), 150, 100);

  it("the sticker pass reads the FNSKU label", async () => {
    const results = await readBarcodes(toImageData(embed(sticker(), 1280, 720)) as ImageData, STICKER_OPTIONS);
    expect(results.find((r) => r.isValid)?.text).toBe(FNSKU);
  });

  it("the retail pass does not report the sticker", async () => {
    expect(await decode(toImageData(embed(sticker(), 1280, 720)))).toBeNull();
  });

  it("the retail pass still reads the Quest UPC with the sticker in the same frame", async () => {
    expect(await decode(toImageData(both()))).toMatch(QUEST_DIGITS);
  });

  it("the sticker pass does not read a retail UPC", async () => {
    const results = await readBarcodes(toImageData(scene()) as ImageData, STICKER_OPTIONS);
    expect(results.filter((r) => r.isValid)).toHaveLength(0);
  });
});

describe("barcode decoder limits", () => {
  it("reads the label at 2 pixels per bar on a sharp 1080p frame", async () => {
    expect(await decode(toImageData(embed(label(2), 1920, 1080)))).toMatch(QUEST_DIGITS);
  });

  it("cannot read what a 640-wide stream delivers at 20 cm (the bug: too few pixels per bar)", async () => {
    const ppm = pxPerModuleAt(640, 20);
    expect(ppm).toBeLessThan(1);
    expect(await decode(toImageData(embed(label(ppm), 640, 480)))).toBeNull();
  });

  it("reads what 1080p at 2x delivers at 30 cm, even through a 1 px blur", async () => {
    const ppm = pxPerModuleAt(1920, 30, 2);
    expect(ppm).toBeGreaterThan(3);
    expect(await decode(toImageData(embed(blur(label(ppm), 1), 1920, 1080)))).toMatch(QUEST_DIGITS);
  });

  it("reads a label at 15 cm with 2x zoom through a 3 px blur (soft focus close up)", async () => {
    const ppm = pxPerModuleAt(1920, 15, 2);
    expect(await decode(toImageData(embed(blur(label(ppm), 3), 1920, 1080)))).toMatch(QUEST_DIGITS);
  });

  it("misses a label at 45 degrees straight on, and reads it after the rotated pass", async () => {
    const scene = embed(rotate(label(3), 45), 1080, 1080);
    expect(await decode(toImageData(scene))).toBeNull();
    expect(await decode(toImageData(rotate(scene, -ROTATED_PASS_DEGREES)))).toMatch(QUEST_DIGITS);
  });

  it("reads a label at 90 degrees without any extra pass", async () => {
    expect(await decode(toImageData(embed(rotate(label(3), 90), 1080, 1080)))).toMatch(QUEST_DIGITS);
  });
});
