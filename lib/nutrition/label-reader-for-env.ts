/**
 * Picks the label reader for the running environment. Under E2E=1 a fixed label stands in for the
 * Claude call so Playwright never touches the network; otherwise the real reader is used.
 */
import type { LabelRead } from "./label-fields";
import { createClaudeLabelReader, createFakeLabelReader, type LabelReader } from "./label-reader";

export const FAKE_LABEL: LabelRead = {
  readable: true,
  name: "Peach Cups",
  brand: null,
  serving_size: "1 cup (113g)",
  calories: "70",
  protein: "<1g",
  total_carbohydrate: "17g",
  total_fat: "0g",
  dietary_fiber: "1g",
};

let reader: LabelReader | null = null;

export function getLabelReader(): LabelReader {
  if (process.env.E2E === "1") return createFakeLabelReader(FAKE_LABEL, { delayMs: 300 });
  reader ??= createClaudeLabelReader();
  return reader;
}
