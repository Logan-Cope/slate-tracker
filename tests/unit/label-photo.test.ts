import { describe, expect, it } from "vitest";
import { fitLongEdge, labelFailure, sniffPhotoType } from "@/lib/nutrition/label-photo";
import { draftFormValues } from "@/lib/nutrition/label-fields";

describe("sniffPhotoType", () => {
  it("knows JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffPhotoType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe("image/jpeg");
    expect(sniffPhotoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffPhotoType(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
  });

  it("refuses anything else, however it is named", () => {
    expect(sniffPhotoType(new TextEncoder().encode("<svg onload=x>"))).toBeNull();
    expect(sniffPhotoType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffPhotoType(new Uint8Array())).toBeNull();
  });
});

describe("fitLongEdge", () => {
  it("scales a portrait 12 MP photo down to 1568 on the long edge", () => {
    expect(fitLongEdge(3024, 4032)).toEqual({ width: 1176, height: 1568 });
  });

  it("scales a landscape 1080p frame down", () => {
    expect(fitLongEdge(1920, 1080)).toEqual({ width: 1568, height: 882 });
  });

  it("never scales up", () => {
    expect(fitLongEdge(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("labelFailure", () => {
  it("offers a retake, not a retry, when the label could not be read", () => {
    expect(labelFailure(422)).toEqual({ message: "Could not read the label.", retry: false, signIn: false });
  });

  it("offers sign in when the session ended", () => {
    expect(labelFailure(401)).toMatchObject({ signIn: true, retry: false });
  });

  it("offers a retry for the same photo when the server or the network failed", () => {
    expect(labelFailure(502)).toMatchObject({ retry: true, message: "Could not read the label right now." });
    expect(labelFailure(null)).toMatchObject({ retry: true, message: "No connection. Try again when you are back online." });
  });

  it("asks for another photo when the file was refused", () => {
    expect(labelFailure(413)).toMatchObject({ retry: false, message: "Could not use that photo." });
    expect(labelFailure(415)).toMatchObject({ retry: false, message: "Could not use that photo." });
  });
});

describe("draftFormValues", () => {
  it("turns numbers into form text and missing lines into blanks", () => {
    expect(
      draftFormValues({ name: "Peach Cups", brand: null, servingLabel: "1 cup", servingGrams: 113, kcal: 70, proteinG: 0, carbsG: 17.5, fatG: null, fiberG: 1 }),
    ).toEqual({ name: "Peach Cups", brand: "", servingLabel: "1 cup", servingGrams: "113", kcal: "70", protein: "0", carbs: "17.5", fat: "", fiber: "1" });
  });
});
