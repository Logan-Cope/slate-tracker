/**
 * A tapped tab shows its skeleton at once, drawn by the client from the tab bar's
 * pending state (components/tab-pending.tsx), never by a loading.tsx. A Suspense
 * fallback would hold the page back: React reveals a boundary's content no
 * sooner than 300 ms after its fallback appeared (FALLBACK_THROTTLE_MS), so a
 * page whose data took 60 ms would show at 300+. Read as text: no DOM here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const FILE = "components/tab-skeletons.tsx";
const TABS = ["/today", "/train", "/weight", "/settings", "/coach"];
const CONTENT_TEST_IDS = ["date-label", "diary", "kcal-left", "recent-workouts", "trend-weight", "weigh-in-", "weight-chart"];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)]));
}

/** Text between JSX tags, with {expressions}, arrows and whitespace-only runs dropped. */
function jsxText(source: string): string[] {
  const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const m of body.matchAll(/(?<!=)>([^<>{}]*)</g)) {
    const text = m[1]!.trim();
    if (text && !/^[)\],;]*$/.test(text)) out.push(text);
  }
  return out;
}

describe("tab skeletons", () => {
  it("no loading.tsx under the app: a Suspense fallback delays the page it stands in for", () => {
    const app = fileURLToPath(new URL("app/", root));
    expect(files(app).filter((f) => /\/loading\.(t|j)sx?$/.test(f))).toEqual([]);
  });

  it("has one skeleton per tab", () => {
    const text = read(FILE);
    for (const tab of TABS) expect(text, tab).toMatch(new RegExp(`"${tab}":\\s*\\w+Skeleton`));
  });

  it("marks each skeleton's root, names it Loading for assistive tech and shows no text", () => {
    const text = read(FILE);
    const roots = [...text.matchAll(/<div data-perf="skeleton"[^>]*>/g)].map((m) => m[0]);
    expect(roots.length).toBeGreaterThanOrEqual(TABS.length);
    for (const tag of roots) {
      expect(tag).toContain('role="progressbar"');
      expect(tag).toContain('aria-label="Loading"');
    }
    expect(jsxText(text)).toEqual([]);
    expect(jsxText(read("components/ui/skeleton.tsx"))).toEqual([]);
  });

  it("uses no content test ids, animates only for people who allow motion, and has no em dash", () => {
    for (const file of [FILE, "components/ui/skeleton.tsx"]) {
      const text = read(file);
      for (const id of CONTENT_TEST_IDS) expect(text, `${file} ${id}`).not.toContain(`data-testid="${id}`);
      for (const m of text.matchAll(/[\w:[\].-]*animate-[\w-]+/g)) expect(m[0], file).toMatch(/^motion-safe:animate-/);
      expect(text, file).not.toContain("\u2014");
    }
  });
});
