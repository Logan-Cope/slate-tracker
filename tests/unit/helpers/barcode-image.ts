/**
 * Pure EAN-13 renderer for tests: produces camera-like frames (fractional pixels per
 * module, blur, rotation, a gray table around the label) so decoder limits can be
 * measured deterministically without a camera. No DOM, no canvas.
 */

export type RawImage = { data: Uint8ClampedArray; width: number; height: number; colorSpace: "srgb" };
type Gray = { px: Float32Array; width: number; height: number };

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export const EAN13_MODULES = 95;

export function ean13CheckDigit(d12: string): number {
  if (!/^\d{12}$/.test(d12)) throw new Error("need 12 digits");
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** 95 booleans, true where a bar is. Accepts 12 digits (check digit appended) or 13 (verified). */
export function ean13Modules(digits: string): boolean[] {
  let d = digits.replace(/\D/g, "");
  if (d.length === 12) d += String(ean13CheckDigit(d));
  if (d.length !== 13) throw new Error("EAN-13 needs 12 or 13 digits");
  if (Number(d[12]) !== ean13CheckDigit(d.slice(0, 12))) throw new Error("bad check digit");
  const parity = PARITY[Number(d[0])]!;
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[Number(d[i])]!;
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[Number(d[i])]!;
  bits += "101";
  return [...bits].map((b) => b === "1");
}

export type RenderOptions = {
  /** Pixels per module. Fractional values are rendered with exact area coverage, like a camera sampling a label. */
  pxPerModule: number;
  heightPx: number;
  quietModules?: number;
  /** Paper and ink levels, 0..255. Real labels are never pure black on pure white. */
  paper?: number;
  ink?: number;
};

/** Grayscale barcode with quiet zones, antialiased at the requested pixel density. */
export function renderEan13(digits: string, opts: RenderOptions): Gray {
  return renderModules(ean13Modules(digits), opts);
}

/** Bar and space widths of Code 128 values 0 to 105 (start A, B, C are 103 to 105), then the stop pattern as value 106. */
const CODE128 =
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 " +
  "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 " +
  "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
  "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 " +
  "114131 311141 411131 211412 211214 211232 2331112";

/** Code 128 set B (printable ASCII) with its check digit: true where a bar is. This is what an Amazon FNSKU sticker is. */
export function code128Modules(text: string): boolean[] {
  const patterns = CODE128.split(" ");
  const values = [104, ...[...text].map((c) => c.charCodeAt(0) - 32)];
  const check = values.reduce((sum, v, i) => sum + v * Math.max(1, i), 0) % 103;
  values.push(check, 106);
  const modules: boolean[] = [];
  for (const v of values) {
    let bar = true;
    for (const width of patterns[v]!) {
      for (let i = 0; i < Number(width); i++) modules.push(bar);
      bar = !bar;
    }
  }
  return modules;
}

export function renderCode128(text: string, opts: RenderOptions): Gray {
  return renderModules(code128Modules(text), opts);
}

/** Copy `src` into `dst` with its top left corner at (x, y); what is stuck on a package is stuck over what is under it. */
export function paste(dst: Gray, src: Gray, x: number, y: number): Gray {
  const px = new Float32Array(dst.px);
  for (let j = 0; j < src.height; j++) {
    for (let i = 0; i < src.width; i++) {
      const tx = x + i;
      const ty = y + j;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      px[ty * dst.width + tx] = src.px[j * src.width + i]!;
    }
  }
  return { px, width: dst.width, height: dst.height };
}

function renderModules(modules: boolean[], opts: RenderOptions): Gray {
  const quiet = opts.quietModules ?? 10;
  const paper = opts.paper ?? 235;
  const ink = opts.ink ?? 25;
  const totalModules = modules.length + quiet * 2;
  const width = Math.max(1, Math.ceil(totalModules * opts.pxPerModule));
  const row = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    // module-space extent of this pixel
    const m0 = x / opts.pxPerModule;
    const m1 = (x + 1) / opts.pxPerModule;
    let covered = 0;
    for (let m = Math.floor(m0); m < Math.ceil(m1); m++) {
      const idx = m - quiet;
      if (idx < 0 || idx >= modules.length || !modules[idx]) continue;
      covered += Math.min(m1, m + 1) - Math.max(m0, m);
    }
    const frac = Math.min(1, covered / (m1 - m0));
    row[x] = paper + (ink - paper) * frac;
  }
  const px = new Float32Array(width * opts.heightPx);
  for (let y = 0; y < opts.heightPx; y++) px.set(row, y * width);
  return { px, width, height: opts.heightPx };
}

/** Three box passes of the given radius, which approximates a gaussian of sigma about radius. Radius 0 is a copy. */
export function blur(img: Gray, radius: number): Gray {
  if (radius <= 0) return { px: new Float32Array(img.px), width: img.width, height: img.height };
  let cur = img.px;
  for (let pass = 0; pass < 3; pass++) {
    cur = boxBlur1D(cur, img.width, img.height, radius, true);
    cur = boxBlur1D(cur, img.width, img.height, radius, false);
  }
  return { px: cur, width: img.width, height: img.height };
}

function boxBlur1D(src: Float32Array, w: number, h: number, r: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[y * w + Math.min(w - 1, Math.max(0, x + k))]!;
        out[y * w + x] = sum / n;
      }
    }
  } else {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[Math.min(h - 1, Math.max(0, y + k)) * w + x]!;
        out[y * w + x] = sum / n;
      }
    }
  }
  return out;
}

/** Rotate about the center by degrees, bilinear sampling, background where the source does not reach. */
export function rotate(img: Gray, degrees: number, background = 200): Gray {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const outW = Math.ceil(Math.abs(img.width * cos) + Math.abs(img.height * sin));
  const outH = Math.ceil(Math.abs(img.width * sin) + Math.abs(img.height * cos));
  const px = new Float32Array(outW * outH).fill(background);
  const cx = img.width / 2;
  const cy = img.height / 2;
  const ox = outW / 2;
  const oy = outH / 2;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const dx = x + 0.5 - ox;
      const dy = y + 0.5 - oy;
      const sx = cos * dx + sin * dy + cx - 0.5;
      const sy = -sin * dx + cos * dy + cy - 0.5;
      if (sx < 0 || sy < 0 || sx > img.width - 1 || sy > img.height - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(img.width - 1, x0 + 1);
      const y1 = Math.min(img.height - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const top = img.px[y0 * img.width + x0]! * (1 - fx) + img.px[y0 * img.width + x1]! * fx;
      const bottom = img.px[y1 * img.width + x0]! * (1 - fx) + img.px[y1 * img.width + x1]! * fx;
      px[y * outW + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return { px, width: outW, height: outH };
}

/** Place the image at the center of a frame of the given size on a plain background (the table). */
export function embed(img: Gray, frameWidth: number, frameHeight: number, background = 200): Gray {
  const px = new Float32Array(frameWidth * frameHeight).fill(background);
  const x0 = Math.floor((frameWidth - img.width) / 2);
  const y0 = Math.floor((frameHeight - img.height) / 2);
  for (let y = 0; y < img.height; y++) {
    const ty = y0 + y;
    if (ty < 0 || ty >= frameHeight) continue;
    for (let x = 0; x < img.width; x++) {
      const tx = x0 + x;
      if (tx < 0 || tx >= frameWidth) continue;
      px[ty * frameWidth + tx] = img.px[y * img.width + x]!;
    }
  }
  return { px, width: frameWidth, height: frameHeight };
}

/** RGBA ImageData-shaped object the decoder accepts in Node and in browsers alike. */
export function toImageData(img: Gray): RawImage {
  const data = new Uint8ClampedArray(img.width * img.height * 4);
  for (let i = 0; i < img.px.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(img.px[i]!)));
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { data, width: img.width, height: img.height, colorSpace: "srgb" };
}

/** Full-size Y4M (YUV 4:2:0) file for Chromium's fake camera. Luma from the gray image, neutral chroma. */
export function toY4m(img: Gray, frames = 1): Uint8Array {
  const w = img.width - (img.width % 2);
  const h = img.height - (img.height % 2);
  const header = new TextEncoder().encode(`YUV4MPEG2 W${w} H${h} F30:1 Ip A1:1 C420jpeg\n`);
  const frameHeader = new TextEncoder().encode("FRAME\n");
  const ySize = w * h;
  const cSize = (w / 2) * (h / 2);
  const out = new Uint8Array(header.length + frames * (frameHeader.length + ySize + 2 * cSize));
  out.set(header, 0);
  let o = header.length;
  for (let f = 0; f < frames; f++) {
    out.set(frameHeader, o);
    o += frameHeader.length;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = img.px[y * img.width + x]!;
        // full-range gray to studio-range luma
        out[o + y * w + x] = Math.max(16, Math.min(235, Math.round(16 + (v / 255) * 219)));
      }
    }
    o += ySize;
    out.fill(128, o, o + 2 * cSize);
    o += 2 * cSize;
  }
  return out;
}

/**
 * A frame as the phone camera would see a standard 100% UPC label (31.4 mm of bars) held
 * `distanceCm` from a lens with the given horizontal field of view, captured at `frameWidth`.
 * Returns pixels per module so a test can speak in camera terms.
 */
export function pxPerModuleAt(frameWidth: number, distanceCm: number, zoom = 1, hfovDeg = 68): number {
  const fovWidthCm = (2 * distanceCm * Math.tan(((hfovDeg / 2) * Math.PI) / 180)) / zoom;
  const barsCm = 3.14;
  return (frameWidth * (barsCm / fovWidthCm)) / EAN13_MODULES;
}
