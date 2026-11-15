import { describe, expect, it } from "vitest";
import { contrastRatio, parseHex, relativeLuminance } from "@/lib/utils/contrast";

// WCAG 2 relative luminance and contrast, checked against published reference
// values so the regression guard in contrast.test.ts measures the real thing.
describe("parseHex", () => {
  it("reads six-digit hex with or without the hash", () => {
    expect(parseHex("#d9472b")).toEqual([217, 71, 43]);
    expect(parseHex("0D9488")).toEqual([13, 148, 136]);
  });

  it("expands three-digit hex", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("#abc")).toEqual([170, 187, 204]);
  });

  it("rejects anything that is not a hex color", () => {
    expect(() => parseHex("rgb(1 2 3)")).toThrow();
    expect(() => parseHex("#12345")).toThrow();
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("linearizes sRGB below and above the 0.04045 knee", () => {
    // 0x0a = 10/255 = 0.0392 sits below the knee: 0.0392 / 12.92
    expect(relativeLuminance("#0a0a0a")).toBeCloseTo(10 / 255 / 12.92, 6);
    // 0x80 = 128/255: ((0.50196 + 0.055) / 1.055) ^ 2.4 = 0.21586
    expect(relativeLuminance("#808080")).toBeCloseTo(0.21586, 4);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a color on itself", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 6);
    expect(contrastRatio("#d9472b", "#d9472b")).toBe(1);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#0d9488", "#ffffff")).toBe(contrastRatio("#ffffff", "#0d9488"));
  });

  it("matches published reference pairs", () => {
    // #767676 on white is the canonical 4.54:1 AA gray; #777777 misses at 4.48:1
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    // the audit's measured protein-on-white figure
    expect(contrastRatio("#0d9488", "#ffffff")).toBeCloseTo(3.74, 2);
  });
});
