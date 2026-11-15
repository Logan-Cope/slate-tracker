import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { embed, renderEan13, rotate, toY4m } from "../unit/helpers/barcode-image";

/** Where Chromium's fake camera reads its frames from. playwright.config.ts imports this same path. */
export const FAKE_CAMERA_FILE = path.resolve(__dirname, "../../.data/e2e-camera.y4m");

/**
 * Writes a 1280x720 camera feed showing the seeded Quest bar's EAN-13 at 3 pixels per bar, turned
 * 45 degrees. Straight on, the decoder cannot read that angle, so the scan e2e passes only through
 * the scanner's rotated pass, in a real browser, against the real decoder.
 */
export default function globalSetup(): void {
  const label = renderEan13("0888849000012", { pxPerModule: 3, heightPx: 200 });
  const frame = embed(rotate(label, 45), 1280, 720);
  mkdirSync(path.dirname(FAKE_CAMERA_FILE), { recursive: true });
  writeFileSync(FAKE_CAMERA_FILE, toY4m(frame, 2));
}
