import { ROTATED_PASS_DEGREES, type Region } from "./camera";

/** The parts of a video element, canvas and 2D context the frame grab touches. Narrow so tests can fake them. */
export type FrameSource = { videoWidth: number; videoHeight: number };
export type FrameCanvas = { width: number; height: number };
export interface FrameContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  translate(x: number, y: number): void;
  rotate(radians: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(source: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(x: number, y: number, w: number, h: number): ImageData;
}

/** Grey fill for the corners a rotation leaves empty: a plain quiet zone, not a false edge. */
const CORNER_FILL = "#808080";

function size(canvas: FrameCanvas, width: number, height: number): void {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

/**
 * One decode pass over the visible region of the stream.
 * Straight: the region copied at full resolution.
 * Rotated: the region's centre square turned by ROTATED_PASS_DEGREES about its centre, so a label
 * lying between the decoder's own 0 and 90 degree tries lands near 0.
 */
export function grabFrame(source: FrameSource, canvas: FrameCanvas, ctx: FrameContext, region: Region, rotated: boolean): ImageData {
  const { sx, sy, sw, sh } = region;
  if (!rotated) {
    size(canvas, sw, sh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    return ctx.getImageData(0, 0, sw, sh);
  }
  const side = Math.min(sw, sh);
  const sqx = sx + Math.floor((sw - side) / 2);
  const sqy = sy + Math.floor((sh - side) / 2);
  size(canvas, side, side);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = CORNER_FILL;
  ctx.fillRect(0, 0, side, side);
  ctx.translate(side / 2, side / 2);
  ctx.rotate((ROTATED_PASS_DEGREES * Math.PI) / 180);
  ctx.drawImage(source, sqx, sqy, side, side, -side / 2, -side / 2, side, side);
  return ctx.getImageData(0, 0, side, side);
}
