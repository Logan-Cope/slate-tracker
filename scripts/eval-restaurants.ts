/**
 * Menu-extractor eval against the golden set in tests/fixtures/restaurant-golden.json.
 *
 *   npm run eval:restaurants            fake extractor, offline, free; scores the first chain only
 *   npm run eval:restaurants -- --real  real Claude extractor; needs ANTHROPIC_API_KEY and costs money
 *   --only <chain substring>            score one chain
 *
 * For each chain the extractor runs, validateMenu cleans the result, and
 * scoreMenu matches golden items by normalized name. PASS when at least 80%
 * of golden items are found and every found item's kcal is within tolerance
 * (5% or 10 kcal, whichever is larger). Always exits 0.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { readFileSync } from "node:fs";
import path from "node:path";
import { createClaudeExtractor, createFakeExtractor, type Extractor, extractCostUsd } from "../lib/restaurants/extract";
import { scoreMenu, type GoldenItem, type MenuScore } from "../lib/restaurants/eval";
import { validateMenu, type ExtractedMenu } from "../lib/restaurants/validate";

type GoldenChain = { restaurant: string; source: string; verified: string | null; items: GoldenItem[] };

type ChainResult =
  | { chain: GoldenChain; kind: "scored"; score: MenuScore; error: string | null; warnings: string[]; inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number }
  | { chain: GoldenChain; kind: "skipped" };

const FIXTURE = "tests/fixtures/restaurant-golden.json";
const PASS_FOUND_RATE = 0.8;

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}% (${n}/${d})`;
}

type Tokens = { inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number };

function cost(t: Tokens): string {
  return `$${extractCostUsd(t).toFixed(2)}`;
}

function tokenLine(t: Tokens): string {
  return `tokens: ${t.inputTokens} in, ${t.cacheCreationTokens} cache write, ${t.cacheReadTokens} cache read, ${t.outputTokens} out; cost ${cost(t)}`;
}

/** A menu that mirrors the first golden chain exactly, so the offline pipeline scores 5/5. */
function fakeMenuFor(chain: GoldenChain): ExtractedMenu {
  return {
    restaurant: chain.restaurant,
    source_url: chain.source,
    items: chain.items.map((it) => ({ name: it.name, kcal: it.kcal, protein_g: it.protein_g })),
  };
}

function emptyScore(chain: GoldenChain): MenuScore {
  return scoreMenu(chain, [], { restaurantName: chain.restaurant });
}

async function runChain(chain: GoldenChain, extractor: Extractor): Promise<ChainResult> {
  const result = await extractor({ restaurantName: chain.restaurant, sourceUrl: chain.source });
  const tokens: Tokens = { inputTokens: result.inputTokens, outputTokens: result.outputTokens, cacheCreationTokens: result.cacheCreationTokens, cacheReadTokens: result.cacheReadTokens };
  if (!result.ok) return { chain, kind: "scored", score: emptyScore(chain), error: result.error, warnings: [], ...tokens };

  const validated = validateMenu(result.menu, { restaurantName: chain.restaurant });
  if (!validated.ok) return { chain, kind: "scored", score: emptyScore(chain), error: validated.error, warnings: [], ...tokens };

  const score = scoreMenu(chain, validated.items.map((it) => ({ name: it.name, kcal: it.kcal, proteinG: it.proteinG })), { restaurantName: chain.restaurant });
  return { chain, kind: "scored", score, error: null, warnings: validated.warnings, ...tokens };
}

function printChain(r: ChainResult): void {
  console.log("");
  console.log(`## ${r.chain.restaurant}`);
  if (r.kind === "skipped") {
    console.log("skipped (fake mode)");
    return;
  }
  if (r.error) console.log(`extractor/validator error: ${r.error}`);
  for (const w of r.warnings) console.log(`warning: ${w}`);

  const w1 = Math.max(...r.chain.items.map((it) => it.name.length), 11);
  const w2 = Math.max(...r.score.matches.map((m) => (m.matched ?? "(none)").length), 7);
  console.log(`${"golden item".padEnd(w1)}  ${"matched".padEnd(w2)}  kcal golden/found  ok`);
  console.log(`${"-".repeat(w1)}  ${"-".repeat(w2)}  -----------------  --`);
  for (const m of r.score.matches) {
    const kcal = `${m.kcalGolden}/${m.kcalFound ?? "-"}`;
    console.log(`${m.golden.padEnd(w1)}  ${(m.matched ?? "(none)").padEnd(w2)}  ${kcal.padEnd(17)}  ${m.withinTolerance ? "ok" : "NO"}`);
  }
  console.log(`found ${pct(r.score.found, r.score.total)}, kcal ok ${pct(r.score.kcalWithinTolerance, r.score.found)}`);
  console.log(tokenLine(r));
}

async function main(): Promise<void> {
  const real = process.argv.includes("--real");
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx >= 0 ? (process.argv[onlyIdx + 1] ?? "").toLowerCase() : "";
  const golden = (JSON.parse(readFileSync(path.join(process.cwd(), FIXTURE), "utf8")) as GoldenChain[]).filter(
    (c) => only === "" || c.restaurant.toLowerCase().includes(only),
  );
  const first = golden[0];
  if (!first) {
    console.log(`${FIXTURE} has no chains`);
    console.log("FAIL");
    return;
  }

  let extractor: Extractor;
  if (real) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log("--real needs ANTHROPIC_API_KEY (set it in .env.local or the environment)");
      console.log("FAIL");
      return;
    }
    console.log("WARNING: --real calls the Claude API with web search and web fetch; this costs real money.");
    console.log("Pricing: Claude Opus 5 list prices, uncached $5/M, cache write $6.25/M, cache read $0.50/M, output $25/M.");
    console.log(`Chains to call: ${golden.map((g) => g.restaurant).join(", ")}`);
    extractor = createClaudeExtractor();
  } else {
    console.log("Fake mode: built-in menu mirrors the first golden chain; pass --real to call Claude.");
    extractor = createFakeExtractor(fakeMenuFor(first));
  }

  const results: ChainResult[] = [];
  for (const chain of golden) {
    if (!real && chain !== first) {
      results.push({ chain, kind: "skipped" });
      continue;
    }
    results.push(await runChain(chain, extractor));
  }

  for (const r of results) printChain(r);

  const scored = results.filter((r): r is Extract<ChainResult, { kind: "scored" }> => r.kind === "scored");
  const total = scored.reduce((n, r) => n + r.score.total, 0);
  const found = scored.reduce((n, r) => n + r.score.found, 0);
  const kcalOk = scored.reduce((n, r) => n + r.score.kcalWithinTolerance, 0);
  const totals: Tokens = {
    inputTokens: scored.reduce((n, r) => n + r.inputTokens, 0),
    outputTokens: scored.reduce((n, r) => n + r.outputTokens, 0),
    cacheCreationTokens: scored.reduce((n, r) => n + r.cacheCreationTokens, 0),
    cacheReadTokens: scored.reduce((n, r) => n + r.cacheReadTokens, 0),
  };

  console.log("");
  console.log(`Overall found rate: ${pct(found, total)}`);
  console.log(`Overall kcal within tolerance (of found): ${pct(kcalOk, found)}`);
  console.log(`Total ${tokenLine(totals)}`);
  console.log("");
  const pass = total > 0 && found / total >= PASS_FOUND_RATE && found > 0 && kcalOk === found;
  console.log(pass ? "PASS" : "FAIL");
}

main().catch((err) => {
  console.error(err);
  console.log("FAIL");
});
