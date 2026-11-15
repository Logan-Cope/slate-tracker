#!/usr/bin/env node
/**
 * First-load client JS per URL route, gzipped, from the Turbopack build manifests (the build prints
 * no First Load JS column). Run after `next build`.
 *
 *   node scripts/perf/route-sizes.mjs            print the table
 *   node scripts/perf/route-sizes.mjs --write    save scripts/perf/route-sizes.baseline.json
 *   node scripts/perf/route-sizes.mjs --check    exit 1 if a route grew past its ceiling
 *
 * A route's ceiling is its override in CEILINGS when it has one, else its baseline + SLACK_KB.
 * Route groups such as (app) and (tab) are dropped from the URL, so a page that moves into a group
 * keeps its row.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import zlib from "node:zlib";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NEXT = path.join(REPO, ".next");
const BASELINE_FILE = path.join(REPO, "scripts/perf/route-sizes.baseline.json");
const ROUTES = ["/today", "/train", "/weight", "/settings", "/today/add", "/train/history", "/coach", "/login"];
const SLACK_KB = 2.0;
/** Fixed ceilings that replace baseline + slack: Weight drew its chart with Recharts (256 KB). */
const CEILINGS = { "/weight": 170 };

const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : "print";

const sizeCache = new Map();
function gz(file) {
  if (!sizeCache.has(file)) {
    const buf = readFileSync(path.join(NEXT, file));
    sizeCache.set(file, zlib.gzipSync(buf, { level: 9 }).length);
  }
  return sizeCache.get(file);
}
const kb = (bytes) => +(bytes / 1024).toFixed(1);

/** URL path for an app-dir folder: route groups dropped. */
function urlOf(dirFromApp) {
  const segs = dirFromApp.split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s));
  return "/" + segs.join("/");
}

function manifests(dir, rel = "") {
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...manifests(p, path.join(rel, d.name)));
    else if (d.name === "page_client-reference-manifest.js") out.push({ file: p, url: urlOf(rel) });
  }
  return out;
}

function loadManifest(file) {
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(file, "utf8"), sandbox);
  return Object.values(sandbox.__RSC_MANIFEST)[0];
}

if (!existsSync(path.join(NEXT, "build-manifest.json"))) {
  console.error("No .next build found; run next build first.");
  process.exit(2);
}
const bm = JSON.parse(readFileSync(path.join(NEXT, "build-manifest.json"), "utf8"));
const rootMain = bm.rootMainFiles.reduce((s, f) => s + gz(f), 0);
const byUrl = new Map(manifests(path.join(NEXT, "server/app")).map((m) => [m.url, m.file]));

const result = {};
for (const route of ROUTES) {
  const file = byUrl.get(route);
  if (!file) {
    console.error(`No client reference manifest for ${route}`);
    process.exit(2);
  }
  const m = loadManifest(file);
  const files = new Set();
  for (const [k, v] of Object.entries(m.entryJSFiles)) {
    if (/\/(error|not-found|global-error)$/.test(k)) continue;
    for (const f of v) if (!bm.rootMainFiles.includes(f)) files.add(f);
  }
  const routeOnly = [...files].reduce((s, f) => s + gz(f), 0);
  result[route] = { firstLoadGzKB: kb(rootMain + routeOnly), routeChunksGzKB: kb(routeOnly) };
}

const baseline = existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, "utf8")) : null;
let failed = 0;
console.log(`${"route".padEnd(16)}${"first load gz KB".padStart(18)}${"baseline".padStart(10)}${"ceiling".padStart(10)}`);
for (const [route, r] of Object.entries(result)) {
  const base = baseline?.routes?.[route]?.firstLoadGzKB ?? null;
  const ceiling = CEILINGS[route] ?? (base !== null ? +(base + SLACK_KB).toFixed(1) : null);
  const over = mode === "check" && ceiling !== null && r.firstLoadGzKB > ceiling;
  if (over) failed++;
  console.log(
    `${route.padEnd(16)}${String(r.firstLoadGzKB).padStart(18)}${String(base ?? "-").padStart(10)}${String(ceiling ?? "-").padStart(10)}${over ? "  OVER" : ""}`,
  );
}

if (mode === "write") {
  writeFileSync(BASELINE_FILE, JSON.stringify({ rootMainGzKB: kb(rootMain), routes: result }, null, 1) + "\n");
  console.log(`wrote ${path.relative(REPO, BASELINE_FILE)}`);
}
if (mode === "check") {
  if (!baseline) {
    console.error("No baseline; run with --write on the base build first.");
    process.exit(2);
  }
  if (failed) {
    console.error(`${failed} route(s) over their ceiling`);
    process.exit(1);
  }
  console.log("all routes within their ceilings");
}
