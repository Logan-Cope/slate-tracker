// Copies the barcode decoder's wasm from the installed package into public/ so the app serves it
// itself (zxing-wasm otherwise fetches it from a CDN at runtime). Runs before `dev` and `build`,
// so the file always matches the installed zxing-wasm version. The target is gitignored.
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
// package.json is not exported by zxing-wasm, so locate the package through an exported entry.
const entry = require.resolve("zxing-wasm/reader");
const pkgDir = entry.slice(0, entry.lastIndexOf(`${path.sep}zxing-wasm${path.sep}`) + "/zxing-wasm".length);
const src = path.join(pkgDir, "dist", "reader", "zxing_reader.wasm");
const dest = path.resolve("public", "zxing", "zxing_reader.wasm");

mkdirSync(path.dirname(dest), { recursive: true });
copyFileSync(src, dest);
const kb = Math.round(statSync(dest).size / 1024);
console.log(`copied zxing_reader.wasm (${kb} KB) to public/zxing/`);
