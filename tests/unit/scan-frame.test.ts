import { describe, expect, it } from "vitest";
import { coverCrop, ROTATED_PASS_DEGREES } from "@/lib/scan/camera";
import { grabFrame, type FrameCanvas, type FrameContext } from "@/lib/scan/frame";

describe("coverCrop", () => {
  it("is the centre band of a portrait phone stream shown in a 4:3 box (object-fit: cover)", () => {
    expect(coverCrop(1080, 1920, 4, 3)).toEqual({ sx: 0, sy: 555, sw: 1080, sh: 810 });
  });

  it("is the centre columns of a landscape stream shown in a 4:3 box", () => {
    expect(coverCrop(1920, 1080, 4, 3)).toEqual({ sx: 240, sy: 0, sw: 1440, sh: 1080 });
    expect(coverCrop(1280, 720, 4, 3)).toEqual({ sx: 160, sy: 0, sw: 960, sh: 720 });
  });

  it("is the whole frame when the box has the same shape", () => {
    expect(coverCrop(1600, 1200, 400, 300)).toEqual({ sx: 0, sy: 0, sw: 1600, sh: 1200 });
  });

  it("falls back to the whole frame when the box has not been laid out yet", () => {
    expect(coverCrop(1280, 720, 0, 0)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 });
  });
});

/** Records every canvas call so the exact draw sequence can be asserted without a DOM. */
function fakeContext() {
  const calls: string[] = [];
  const canvas: FrameCanvas = { width: 0, height: 0 };
  const ctx: FrameContext = {
    fillStyle: "",
    setTransform: (...a) => void calls.push(`setTransform(${a.join(",")})`),
    translate: (x, y) => void calls.push(`translate(${x},${y})`),
    rotate: (r) => void calls.push(`rotate(${r.toFixed(4)})`),
    fillRect: (...a) => void calls.push(`fillRect(${a.join(",")})`),
    drawImage: (_src, ...a) => void calls.push(`drawImage(${a.join(",")})`),
    getImageData: (x, y, w, h) => {
      calls.push(`getImageData(${x},${y},${w},${h})`);
      return { width: w, height: h } as ImageData;
    },
  };
  return { calls, canvas, ctx };
}

describe("grabFrame", () => {
  const video = { videoWidth: 1080, videoHeight: 1920 };
  const region = coverCrop(1080, 1920, 4, 3); // 1080 x 810 at y 555

  it("straight pass copies exactly the visible region at full resolution", () => {
    const { calls, canvas, ctx } = fakeContext();
    const out = grabFrame(video, canvas, ctx, region, false);
    expect(canvas).toEqual({ width: 1080, height: 810 });
    expect(calls).toEqual(["setTransform(1,0,0,1,0,0)", "drawImage(0,555,1080,810,0,0,1080,810)", "getImageData(0,0,1080,810)"]);
    expect(out).toEqual({ width: 1080, height: 810 });
  });

  it("rotated pass turns the centre square of the visible region by 45 degrees about its centre, corners filled", () => {
    const { calls, canvas, ctx } = fakeContext();
    grabFrame(video, canvas, ctx, region, true);
    // square of side 810, centred in the 1080 wide band: x 135, y 555
    expect(canvas).toEqual({ width: 810, height: 810 });
    expect(calls).toEqual([
      "setTransform(1,0,0,1,0,0)",
      "fillRect(0,0,810,810)",
      "translate(405,405)",
      `rotate(${((ROTATED_PASS_DEGREES * Math.PI) / 180).toFixed(4)})`,
      "drawImage(135,555,810,810,-405,-405,810,810)",
      "getImageData(0,0,810,810)",
    ]);
    expect(ctx.fillStyle).toBe("#808080");
  });

  it("does not resize a canvas that already has the right size", () => {
    const { canvas, ctx } = fakeContext();
    canvas.width = 1080;
    canvas.height = 810;
    const before = canvas;
    grabFrame(video, canvas, ctx, region, false);
    expect(canvas).toBe(before);
    expect(canvas).toEqual({ width: 1080, height: 810 });
  });
});
