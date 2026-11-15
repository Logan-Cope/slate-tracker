/**
 * Label-reader eval against the synthetic photos in evals/label-golden.json (rendered by
 * scripts/make-eval-labels.mjs).
 *
 *   npm run eval:labels                                   the shipped models and effort (LABEL_MODELS, LABEL_EFFORT)
 *   npm run eval:labels -- --models claude-sonnet-5-5     one model, no backup
 *   npm run eval:labels -- --effort low --only granola    effort level, entries whose id contains a substring
 *   npm run eval:labels -- --write                        also writes evals/RESULTS.md, the table the README links
 *
 * Needs ANTHROPIC_API_KEY (from .env.local or the environment) and costs well under a cent per run on Haiku.
 * PASS needs: no calories filled in wrong, at least 98% of number fields exact, at least 90% of labels
 * right on every field, every non-label photo refused (lib/nutrition/label-eval.ts). Prints latency and
 * cost, writes the full result to .data/label-eval/, and always exits 0.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GoldenSchema, scoreEntry, summarize, type GoldenEntry } from "../lib/nutrition/label-eval";
import { LABEL_EFFORT, LABEL_MODELS, createClaudeLabelReader, labelCostUsd, type LabelEffort, type LabelReaderResult } from "../lib/nutrition/label-reader";

const FIXTURES = ["evals/label-golden.json"];
const CONCURRENCY = 4;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("eval:labels needs ANTHROPIC_API_KEY (set it in .env.local or the environment)");
    return;
  }
  const models = (arg("models") ?? LABEL_MODELS.join(",")).split(",").filter(Boolean);
  const effort = (arg("effort") ?? LABEL_EFFORT) as LabelEffort;
  const only = arg("only");

  const entries: GoldenEntry[] = FIXTURES.filter((f) => existsSync(f)).flatMap((f) => GoldenSchema.parse(JSON.parse(readFileSync(f, "utf8"))));
  const named = only ? entries.filter((e) => e.id.includes(only)) : entries;
  const picked = named.filter((e) => existsSync(path.join("evals", e.file)));
  const missing = named.length - picked.length;
  if (missing) console.log(`Skipping ${missing} photos not on disk (run node scripts/make-eval-labels.mjs)`);
  const read = createClaudeLabelReader({ models, effort });

  console.log(`Reading ${picked.length} photos with ${models.join(" then ")} at effort ${effort}\n`);
  const results: Array<{ entry: GoldenEntry; result: LabelReaderResult; ms: number }> = [];
  let next = 0;
  async function worker() {
    while (next < picked.length) {
      const entry = picked[next++]!;
      const file = path.join("evals", entry.file);
      const data = readFileSync(file).toString("base64");
      const started = performance.now();
      const result = await read({ data, mediaType: "image/jpeg" });
      results.push({ entry, result, ms: performance.now() - started });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  results.sort((a, b) => a.entry.id.localeCompare(b.entry.id));

  const scores = results.map(({ entry, result }) => scoreEntry(entry, result.ok ? { ok: true, draft: result.draft } : { ok: false, reason: result.reason }));
  for (const [i, { entry, result, ms }] of results.entries()) {
    const s = scores[i]!;
    const verdict = entry.kind === "negative" ? (s.rejected ? "refused  ok" : "ACCEPTED A NON-LABEL") : s.fullyCorrect ? "all right" : s.missed ? "MISSED" : `wrong: ${s.wrong.join(", ")}`;
    const got = result.ok ? `${result.draft.servingLabel} | ${result.draft.servingGrams ?? "-"} g | ${result.draft.kcal} cal | P ${result.draft.proteinG} C ${result.draft.carbsG} F ${result.draft.fatG} Fi ${result.draft.fiberG}` : `${result.reason}${result.error ? ` (${result.error})` : ""}`;
    console.log(`${entry.id.padEnd(28)} ${(ms / 1000).toFixed(1).padStart(5)}s  ${result.model.padEnd(18)} ${verdict}`);
    if (!s.fullyCorrect && entry.kind === "label") console.log(`${"".padEnd(28)} got ${got}`);
  }

  const sum = summarize(scores);
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const cost = results.reduce((n, r) => n + labelCostUsd(r.result.model, r.result.usage), 0);
  const fallbacks = results.filter((r) => r.result.model !== models[0]).length;
  console.log(`
Labels ${sum.labels}, non-labels ${sum.negatives}
  Number fields exact     ${pct(sum.numericAccuracy)}   (bar 98%)
  Labels fully right      ${pct(sum.fullyCorrectRate)}   (bar 90%)
  Wrong calories shown    ${sum.silentKcalErrors}        (bar 0)
  Real labels refused     ${sum.missed}
  Non-labels refused      ${sum.negativesRejected}/${sum.negatives}   (bar all)
  Latency p50 / p90       ${(quantile(times, 0.5) / 1000).toFixed(1)}s / ${(quantile(times, 0.9) / 1000).toFixed(1)}s   (bar p50 6s)
  Backup model used       ${fallbacks}
  Cost                    $${cost.toFixed(4)} total, $${(cost / Math.max(1, results.length)).toFixed(5)} per photo
${sum.pass && quantile(times, 0.5) <= 6000 ? "PASS" : "FAIL"}`);

  if (process.argv.includes("--write")) {
    const verdict = sum.pass && quantile(times, 0.5) <= 6000 ? "PASS" : "FAIL";
    const rows = results.map(({ entry, result, ms }, i) => {
      const s = scores[i]!;
      const outcome = entry.kind === "negative" ? (s.rejected ? "refused, as it should" : "accepted a non-label") : s.fullyCorrect ? "every field right" : s.missed ? "refused a real label" : `wrong: ${s.wrong.join(", ")}`;
      return `| ${entry.id} | ${entry.kind} | ${outcome} | ${result.model} | ${(ms / 1000).toFixed(1)} s |`;
    });
    const md = [
      "# Label eval results",
      "",
      `Written by \`npm run eval:labels -- --write\` on ${new Date().toISOString().slice(0, 10)}: ${models.join(" then ")}, effort ${effort}, ${results.length} photos from evals/label-golden.json.`,
      "",
      "| Measure | Result | Bar |",
      "|---|---|---|",
      `| Number fields exact | ${pct(sum.numericAccuracy)} | 98% |`,
      `| Labels with every field right | ${pct(sum.fullyCorrectRate)} | 90% |`,
      `| Wrong calories filled in | ${sum.silentKcalErrors} | 0 |`,
      `| Non-labels refused | ${sum.negativesRejected} of ${sum.negatives} | all |`,
      `| Latency p50 / p90 | ${(quantile(times, 0.5) / 1000).toFixed(1)} s / ${(quantile(times, 0.9) / 1000).toFixed(1)} s | p50 6 s |`,
      `| Cost | $${cost.toFixed(4)} total | |`,
      `| Verdict | ${verdict} | |`,
      "",
      "| Photo | Kind | Outcome | Model | Time |",
      "|---|---|---|---|---|",
      ...rows,
      "",
    ].join("\n");
    writeFileSync("evals/RESULTS.md", md);
    console.log("Wrote evals/RESULTS.md");
  }

  mkdirSync(".data/label-eval", { recursive: true });
  const out = `.data/label-eval/${new Date().toISOString().replace(/[:.]/g, "-")}-${models.join("+")}-${effort}.json`;
  writeFileSync(out, JSON.stringify({ models, effort, summary: sum, results: results.map((r, i) => ({ id: r.entry.id, ms: Math.round(r.ms), result: r.result, score: scores[i] })) }, null, 2));
  console.log(`Full result: ${out}`);
}

void main();
