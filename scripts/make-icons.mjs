// Generates PWA icons without any image library: a warm background with a
// stacked-slab mark. Run: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BG = [0xd9, 0x47, 0x2b];
const INK = [0xff, 0xf7, 0xf0];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

/**
 * Three stacked slabs, offset like a pile of slate tiles, anti-aliased by
 * supersampling. Geometry scales with the padded inner square so the maskable
 * variant keeps the same proportions.
 */
function glyphPixel(size, padding) {
  const inner = size * (1 - 2 * padding);
  const off = size * padding;
  const h = inner * 0.13; // slab height
  const gap = inner * 0.07;
  const r = h / 2; // fully rounded ends
  const widths = [0.5, 0.62, 0.42].map((f) => f * inner);
  const shifts = [-0.05, 0.03, -0.09].map((f) => f * inner);
  const stack = 3 * h + 2 * gap;
  const top = off + (inner - stack) / 2;
  // [x0, y0, x1, y1]
  const slabs = widths.map((w, i) => {
    const cx = off + inner / 2 + shifts[i];
    const y0 = top + i * (h + gap);
    return [cx - w / 2, y0, cx + w / 2, y0 + h];
  });

  function insideSlab(x, y, [x0, y0, x1, y1]) {
    if (y < y0 || y > y1) return false;
    const cy = (y0 + y1) / 2;
    if (x >= x0 + r && x <= x1 - r) return true;
    const cx = x < x0 + r ? x0 + r : x1 - r;
    return Math.hypot(x - cx, y - cy) <= r;
  }

  function coverage(px, py) {
    let hits = 0;
    const n = 4;
    for (let sy = 0; sy < n; sy++) {
      for (let sx = 0; sx < n; sx++) {
        const x = px + (sx + 0.5) / n;
        const y = py + (sy + 0.5) / n;
        if (slabs.some((s) => insideSlab(x, y, s))) hits++;
      }
    }
    return hits / (n * n);
  }

  return (x, y) => mix(BG, INK, coverage(x, y));
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", png(192, glyphPixel(192, 0.08)));
writeFileSync("public/icons/icon-512.png", png(512, glyphPixel(512, 0.08)));
writeFileSync("public/icons/icon-512-maskable.png", png(512, glyphPixel(512, 0.18)));
writeFileSync("public/icons/apple-touch-icon.png", png(180, glyphPixel(180, 0.08)));
console.log("icons written to public/icons");
