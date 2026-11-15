import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression guard for the motion, focus and scroll rules (interface review rows
// 6, 10, 11, 13 and 15). The stylesheet and the components are read as text: a
// rule that drops the reduced-motion gate, brings back `outline: none`, lets a
// disabled button shrink, puts the accent ring on an accent fill or animates a
// layout property fails here before it ships.

const root = new URL("../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const css = read("app/globals.css");

/** Splits `source` into the text outside every block opened by `head` and the bodies inside them. */
function splitBlocks(source: string, head: RegExp): { outside: string; inside: string } {
  let outside = "";
  let inside = "";
  let cursor = 0;
  for (const m of source.matchAll(new RegExp(head.source, "g"))) {
    const open = source.indexOf("{", m.index + m[0].length);
    if (open < 0) break;
    let depth = 0;
    let close = open;
    for (; close < source.length; close++) {
      if (source[close] === "{") depth++;
      if (source[close] === "}" && --depth === 0) break;
    }
    outside += source.slice(cursor, m.index);
    inside += source.slice(open + 1, close);
    cursor = close + 1;
  }
  return { outside: outside + source.slice(cursor), inside };
}

const MOTION_GATE = /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/;
const gated = splitBlocks(css, MOTION_GATE);
const still = splitBlocks(gated.outside, /@keyframes\s+[\w-]+/).outside;
const keyframes = splitBlocks(css, /@keyframes\s+slate-fade/).inside;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...tsxFiles(p));
    else if (d.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const rootDir = fileURLToPath(root);
const sources = ["app", "components"]
  .flatMap((dir) => tsxFiles(join(rootDir, dir)))
  .map((p) => [p.slice(rootDir.length), readFileSync(p, "utf8")] as const);

const NOT_DISABLED = String.raw`:not\(:disabled\):not\(\[aria-disabled="true"\]\)`;

/** Controls that fill a clipped card edge to edge, so the 2px ring must sit inside their own box. */
const FULL_BLEED_ROWS: [string, RegExp][] = [
  ["components/nutrition/meal-section.tsx", /tap flex w-full items-center gap-3 px-5 py-3 text-left[^"]*focus-visible:-outline-offset-2/],
  ["components/nutrition/food-tile.tsx", /tap flex min-w-0 flex-1 items-center[^"]*focus-visible:-outline-offset-2/],
  ["components/training/workout-row.tsx", /tap flex items-center gap-3 px-4 py-3 focus-visible:-outline-offset-2/],
  ["components/training/exercise-card.tsx", /tap flex w-full items-center justify-center gap-1 border-t[^"]*focus-visible:-outline-offset-2/],
  ["app/(app)/train/page.tsx", /tap flex items-center gap-3 p-4 focus-visible:-outline-offset-2/],
];

describe("globals.css motion", () => {
  it("gates every scale, transform and translate behind prefers-reduced-motion: no-preference", () => {
    expect(css).toMatch(MOTION_GATE);
    expect(still).not.toMatch(/\b(scale|transform|translate|rotate)\s*:/);
    expect(still).not.toMatch(/transition[^;]*\b(scale|transform|translate)\b/);
    expect(still).not.toMatch(/slate-pop/);
  });

  it("fades .pop under reduced motion with an opacity-only keyframe that fills both ways", () => {
    expect(still).toMatch(/\.pop\s*\{[^}]*animation:\s*slate-fade[^;}]*\bboth\b/);
    expect(keyframes).toMatch(/opacity/);
    expect(keyframes).not.toMatch(/transform|scale/);
    expect(gated.inside).toMatch(/\.pop\s*\{[^}]*slate-pop/);
  });

  it("presses buttons to one scale, 0.96 over 150ms ease-out, never while disabled natively or with aria-disabled", () => {
    const press = new RegExp(String.raw`\.btn-primary${NOT_DISABLED}:active,\s*\.btn-secondary${NOT_DISABLED}:active,\s*\.btn-ghost${NOT_DISABLED}:active\s*\{\s*scale:\s*0\.96;`);
    expect(gated.inside).toMatch(press);
    expect(css).not.toMatch(/0\.97|scale\(0\.95\)|scale-95/);
    expect(css).toMatch(/transition-duration:\s*150ms/);
    expect(css).toMatch(/transition-timing-function:\s*ease-out/);
    expect(css).not.toMatch(/transition(-property)?:\s*all\b/);
  });

  it("dims a pending primary button the same way whether it is disabled or aria-disabled", () => {
    expect(css).toMatch(/\.btn-primary:disabled,\s*\.btn-primary\[aria-disabled="true"\]\s*\{\s*opacity:\s*0\.55;/);
  });
});

describe("globals.css focus and scroll", () => {
  it("shows a 2px accent outline on focus-visible for inputs, taps and buttons and never removes the outline", () => {
    expect(css).not.toMatch(/outline:\s*none/);
    expect(css).not.toMatch(/box-shadow:\s*0 0 0 3px/);
    for (const sel of [".input", ".tap", ".btn-primary", ".btn-secondary", ".btn-ghost"]) {
      const re = new RegExp(`${sel.replace(".", "\\.")}:focus-visible[^{]*\\{[^}]*outline:\\s*2px solid var\\(--accent\\);[^}]*outline-offset:\\s*2px;`);
      expect(css, `${sel}:focus-visible`).toMatch(re);
    }
    // The comment states the measured ratio; the stale 4.3 figure is gone.
    expect(css).not.toMatch(/4\.3:1/);
  });

  it("pads the page scroller only for the sticky chrome on the page, by that chrome's height", () => {
    // The viewport is the scroller, so the padding sits on html and :has() scopes
    // it to the element that needs it: a page with no sticky header gets none.
    expect(css).not.toMatch(/html\s*\{[^}]*scroll-padding-block-start/);
    const cssValues = [...css.matchAll(/html:has\(([^)]*)\)\s*\{/g)]
      .flatMap(([, selector = ""]) => [...selector.matchAll(/\[data-scroll-clearance="([\w-]+)"\]/g)].map((m) => m[1]))
      .sort();
    const tsxValues = sources.flatMap(([, text]) => [...text.matchAll(/data-scroll-clearance="([\w-]+)"/g)].map((m) => m[1])).sort();
    expect(cssValues).toEqual(tsxValues);
    expect(tsxValues).toEqual(["add-food", "draft-footer", "edit-bar", "rest-timer", "workout"]);
    // Add food's header is 153px and the workout's two-line header 89px; each value leaves room for the 2px ring and its offset.
    expect(css).toMatch(/html:has\(\[data-scroll-clearance="add-food"\]\)\s*\{\s*scroll-padding-block-start:\s*calc\(env\(safe-area-inset-top\)\s*\+\s*10rem\)/);
    expect(css).toMatch(/html:has\(\[data-scroll-clearance="workout"\]\)\s*\{\s*scroll-padding-block-start:\s*calc\(env\(safe-area-inset-top\)\s*\+\s*6rem\)/);
    // The 4.5rem tab bar is on every page of the shell; the rest timer, a draft footer or the diary's edit bar stacks 6rem more on it.
    expect(css).toMatch(/html\s*\{[^}]*scroll-padding-block-end:\s*calc\(env\(safe-area-inset-bottom\)\s*\+\s*5rem\)/);
    expect(css).toMatch(
      /html:has\(\[data-scroll-clearance="rest-timer"\],\s*\[data-scroll-clearance="draft-footer"\],\s*\[data-scroll-clearance="edit-bar"\]\)\s*\{\s*scroll-padding-block-end:\s*calc\(env\(safe-area-inset-bottom\)\s*\+\s*10\.5rem\)/,
    );
  });

  it("pads the sheet's own scroller by its sticky header", () => {
    expect(read("components/ui/sheet.tsx")).toMatch(/scroll-pt-\[4\.625rem\]/);
  });
});

describe("components", () => {
  it("prefix every pulse, press scale and transform transition with motion-safe:", () => {
    for (const [file, text] of sources) {
      for (const m of text.matchAll(/[\w:[\].-]*animate-pulse/g)) expect(m[0], file).toMatch(/^motion-safe:animate-pulse$/);
      for (const m of text.matchAll(/[\w:[\].-]*active:scale-[\w[\].]*/g)) expect(m[0], file).toBe("motion-safe:enabled:active:scale-[0.96]");
      for (const m of text.matchAll(/[\w:[\].-]*transition-transform/g)) expect(m[0], file).toMatch(/^motion-safe:transition-transform$/);
      for (const m of text.matchAll(/[\w:[\].-]*transition-\[[\w-]+\]/g)) expect(m[0], file).toMatch(/^motion-safe:transition-\[/);
      // An inline transition string bypasses the reduced-motion gate; only the drag's "none" switch is allowed inline.
      expect(text, `${file} sets a transition inline`).not.toMatch(/transition:\s*["`]/);
    }
    expect(read("components/ui/ring.tsx")).toMatch(/motion-safe:transition-\[stroke-dashoffset\] motion-safe:duration-400 motion-safe:ease-out/);
  });

  it("never removes an outline; num-input carries the 2px accent focus-visible ring", () => {
    for (const [file, text] of sources) expect(text, file).not.toMatch(/outline-none/);
    const numInput = read("components/training/num-input.tsx");
    for (const cls of ["focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-accent"]) expect(numInput).toContain(cls);
  });

  it("swaps the ring color on accent, danger and inverted fills for that fill's text color", () => {
    const toast = read("components/nutrition/toast.tsx");
    expect(toast).toMatch(/"focus-visible:outline-on-danger" : "focus-visible:outline-bg"/);
    expect(toast.match(/\$\{ring\}/g)?.length).toBe(2);
    const timer = read("components/training/rest-timer-bar.tsx");
    expect(timer.match(/bg-on-accent text-accent-ink focus-visible:outline-on-accent/g)?.length).toBe(2);
    expect(read("components/training/set-row.tsx")).toMatch(/bg-danger text-sm font-bold text-on-danger focus-visible:-outline-offset-2 focus-visible:outline-on-danger/);
  });

  it("draws the ring inside full-bleed rows so a clipped card cannot cut it", () => {
    for (const [file, re] of FULL_BLEED_ROWS) expect(read(file), file).toMatch(re);
  });

  it("gives a visually hidden input a visible ring on its label", () => {
    for (const [file, text] of sources) {
      if (!/className="sr-only"/.test(text)) continue;
      expect(text, file).toMatch(/has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent/);
    }
  });

  it("moves bar fills with translateX instead of width", () => {
    for (const file of ["components/ui/progress-bar.tsx", "components/nutrition/add-food-screen.tsx"]) {
      const text = read(file);
      expect(text, file).toMatch(/transform:\s*`translateX\(\$\{pct - 100\}%\)`/);
      expect(text, file).not.toMatch(/width:\s*`\$\{pct\}%`/);
    }
  });

  it("contains scroll inside the sheet", () => {
    expect(read("components/ui/sheet.tsx")).toMatch(/overflow-y-auto[^"`]*overscroll-contain|overscroll-contain[^"`]*overflow-y-auto/);
  });

  it("keeps the workout header below the status bar like the Add food header", () => {
    expect(read("components/training/active-workout.tsx")).toMatch(/<header className="sticky top-\[env\(safe-area-inset-top\)\]/);
  });

  it("holds a toast for five seconds and while a pointer or focus is on it, and lifts it above the rest timer", () => {
    const toast = read("components/nutrition/toast.tsx");
    expect(toast).toMatch(/durationMs = TOAST_DURATION_MS/);
    expect(toast).toMatch(/onPointerEnter=\{\(\) => setHeld\(true\)\}/);
    expect(toast).toMatch(/onFocus=\{\(\) => setHeld\(true\)\}/);
    expect(toast).toMatch(/if \(!toast \|\| !autoDismisses\(toast\) \|\| held\) return;/);
    expect(read("components/training/active-workout.tsx")).toMatch(/bottomOffset=\{rest && !finished \? tabBarHeight \+ restBarHeight/);
    expect(read("components/metrics/weigh-in-form.tsx")).toMatch(/setTimeout\(\(\) => setSaved\(null\), TOAST_DURATION_MS\)/);
  });
});
