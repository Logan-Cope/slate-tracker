import type { ReaderOptions } from "zxing-wasm/reader";

/**
 * Camera and decoder settings for the barcode scanner. Pure, so the numbers are testable.
 *
 * Why these numbers (measured in tests/unit/scan-decode.test.ts with a synthetic camera):
 * the decoder needs about 1.5 pixels per bar on a sharp frame and more as the frame softens.
 * A standard UPC (31 mm of bars) held 20 cm from a 68 degree lens spans 0.8 px per bar on a
 * 640-wide stream and 2.35 on a 1920-wide one. Phones cannot focus closer than roughly
 * 12 to 20 cm, so a low-resolution stream can only decode inside the blur zone. Asking for
 * 1080p and a 2x zoom keeps a readable label anywhere from about 15 to 45 cm.
 */

/** Retail label formats only: fewer formats means faster frames and no phantom hits. */
export const READER_OPTIONS: ReaderOptions = {
  formats: ["EAN-13", "UPC-A", "UPC-E", "EAN-8"],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  maxNumberOfSymbols: 1,
};

/** The sticker pass: Code 128 only (an Amazon FNSKU label is one). It classifies a label as not a food code; it never looks anything up. */
export const STICKER_OPTIONS: ReaderOptions = {
  formats: ["Code128"],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  maxNumberOfSymbols: 1,
};

/** The retail pass runs alone for this long after the camera starts, so a food scan pays nothing for the sticker check. */
export const STICKER_AFTER_MS = 1500;

/** After STICKER_AFTER_MS, one decode in this many is a sticker pass. */
export const STICKER_EVERY = 4;

/** Whether this decode is the sticker pass instead of the retail pass. Pure, so the schedule is testable. */
export function stickerPass(msSinceCameraStart: number, decodeIndex: number): boolean {
  return msSinceCameraStart >= STICKER_AFTER_MS && decodeIndex % STICKER_EVERY === STICKER_EVERY - 1;
}

/** Degrees to rotate the frame on alternate passes. The decoder covers 0 and 90 with about 30 degrees of slack; 45 fills the gap. */
export const ROTATED_PASS_DEGREES = 45;

/** Preferred zoom factor once the stream is up. 2x doubles pixels per bar at the same distance. */
export const PREFERRED_ZOOM = 2;

/** Shortest gap between decodes. About 10 a second keeps the main thread free for the sheet itself. */
export const MIN_DECODE_GAP_MS = 100;

/** Consecutive decoder exceptions before the scanner gives up and offers the typed code instead of looping. */
export const MAX_DECODE_FAILURES = 20;

/** The decoder's wasm, served from this origin (scripts/copy-wasm.mjs puts it in public/) so scanning never depends on a CDN. */
export const WASM_PATH = "/zxing/zxing_reader.wasm";

export type Region = { sx: number; sy: number; sw: number; sh: number };

/**
 * The part of a frame that `object-fit: cover` shows inside a box of the given size: the centre band or
 * centre columns. Decoding exactly this keeps the guide box honest (what you see is what can scan) and
 * skips the pixels the preview hides. A box that has no size yet means the whole frame.
 */
export function coverCrop(frameWidth: number, frameHeight: number, boxWidth: number, boxHeight: number): Region {
  if (boxWidth <= 0 || boxHeight <= 0) return { sx: 0, sy: 0, sw: frameWidth, sh: frameHeight };
  const frameAspect = frameWidth / frameHeight;
  const boxAspect = boxWidth / boxHeight;
  if (frameAspect > boxAspect) {
    const sw = Math.round(frameHeight * boxAspect);
    return { sx: Math.floor((frameWidth - sw) / 2), sy: 0, sw, sh: frameHeight };
  }
  const sh = Math.round(frameWidth / boxAspect);
  return { sx: 0, sy: Math.floor((frameHeight - sh) / 2), sw: frameWidth, sh };
}

/** Back camera at 1080p when available. Everything is `ideal`, so a camera that offers less still opens. */
export function videoConstraints(): MediaTrackConstraints {
  return {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
}

export type ZoomCapability = { min: number; max: number; step?: number };

/**
 * The zoom to apply, or null when the track cannot zoom. Clamped to the camera's range and
 * snapped to its step so applyConstraints does not reject the value.
 */
export function pickZoom(caps: { zoom?: ZoomCapability } | undefined, preferred = PREFERRED_ZOOM): number | null {
  const z = caps?.zoom;
  if (!z || !(z.max > 1)) return null;
  let v = Math.min(z.max, Math.max(z.min, preferred));
  if (z.step && z.step > 0) v = z.min + Math.round((v - z.min) / z.step) * z.step;
  v = Math.min(z.max, Math.max(z.min, v));
  return Number(v.toFixed(3));
}

/** The largest centered square of a frame: what the rotated pass decodes, so no corner is lost to the rotation. */
export function centerSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

/** Digits of a decoder hit, or null when it is too short to be a retail code (EAN-8 is the shortest). */
export function barcodeDigits(text: string, minDigits = 6): string | null {
  const digits = text.replace(/\D/g, "");
  return digits.length >= minDigits ? digits : null;
}
