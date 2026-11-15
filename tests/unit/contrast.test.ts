import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/utils/contrast";

// Regression guard for color contrast. Every pair in TEXT_ON_FILL is text that
// renders on that fill somewhere in the app at 10 to 17px, so the WCAG AA floor
// is 4.5:1. Every pair in RING_ON_FILL is the 2px focus ring against a fill a
// control sits on, where the floor is 3:1. The tokens are read straight out of
// globals.css: a palette tweak that drops a pair under its floor fails here
// before it ships.
const AA_TEXT = 4.5;
const AA_UI = 3;

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

type Tokens = Record<string, string>;

/** Pulls `--name: #hex;` declarations out of one rule body. Non-hex values (shadows) are skipped. */
function tokensIn(body: string): Tokens {
  const out: Tokens = {};
  for (const [, name, value] of body.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    if (name && value) out[name] = value.toLowerCase();
  }
  return out;
}

function block(re: RegExp, label: string): Tokens {
  const body = css.match(re)?.[1];
  if (body === undefined) throw new Error(`globals.css: ${label} block not found`);
  return tokensIn(body);
}

const themes = {
  light: block(/^:root\s*\{([^}]*)\}/m, "light :root"),
  "dark (system)": block(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/, "prefers-color-scheme dark"),
  "dark (chosen)": block(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/, "[data-theme=dark]"),
};

// [text token, fill token, where it renders]
const TEXT_ON_FILL: [string, string, string][] = [
  ["fg", "surface", "body copy on cards"],
  ["fg", "bg", "body copy on the page"],
  ["muted", "bg", "PageHeader subtitles"],
  ["muted", "surface", "captions in cards, set input placeholders"],
  ["muted", "surface-2", "MacroGrid labels, Finish stats, warm-up badge, profile banner, scan notices, coach stat labels"],
  ["muted", "protein-soft", "placeholder of a completed set left blank"],
  ["protein-ink", "surface", "protein grams in food rows"],
  ["protein-ink", "surface-2", "protein cell in MacroGrid"],
  ["protein-ink", "protein-soft", "completed set numbers and inputs"],
  ["accent-ink", "surface", "kcal in food rows, Add and New food links"],
  ["accent-ink", "bg", "All history link"],
  ["accent-ink", "accent-soft", "accent badges"],
  ["danger", "bg", "field errors, Delete in the diary edit bar"],
  ["danger", "surface", "Delete in the entry sheet"],
  ["accent-ink", "surface-2", "kcal cell in MacroGrid"],
  ["accent-ink", "on-accent", "rest timer chips while the bar is accent"],
  ["on-accent", "accent", "primary buttons, Finish, PR badge"],
  ["on-danger", "danger", "danger toast, swipe Remove, Discard"],
  ["bg", "fg", "default toast text and its Undo"],
];

// [ring token, fill token, where a focusable control sits on that fill]
const RING_ON_FILL: [string, string, string][] = [
  ["accent", "surface", "rows, chips and inputs in cards"],
  ["accent", "bg", "page-level buttons and links"],
  ["accent", "surface-2", "set type badge, header icon buttons, rest timer chips"],
  ["accent", "protein-soft", "inputs and check of a completed set"],
  ["accent", "accent-soft", "active unit chip, meal slot"],
  ["bg", "fg", "default toast's Undo and Dismiss"],
  ["on-danger", "danger", "danger toast's Dismiss, swipe Remove"],
  ["on-accent", "accent", "rest timer chips once the bar turns accent"],
];

describe("theme tokens", () => {
  it("defines the same values in both dark blocks", () => {
    expect(themes["dark (chosen)"]).toEqual(themes["dark (system)"]);
  });

  for (const [name, tokens] of Object.entries(themes)) {
    describe(name, () => {
      const check = (text: string, fill: string, floor: number) => {
        const textHex = tokens[text];
        const fillHex = tokens[fill];
        expect(textHex, `--${text} is not defined`).toBeDefined();
        expect(fillHex, `--${fill} is not defined`).toBeDefined();
        if (textHex === undefined || fillHex === undefined) return;
        const ratio = contrastRatio(textHex, fillHex);
        expect(ratio, `${textHex} on ${fillHex} measures ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(floor);
      };

      for (const [text, fill, where] of TEXT_ON_FILL) {
        it(`--${text} on --${fill} reads at ${AA_TEXT}:1 or better (${where})`, () => check(text, fill, AA_TEXT));
      }

      for (const [ring, fill, where] of RING_ON_FILL) {
        it(`--${ring} focus ring on --${fill} shows at ${AA_UI}:1 or better (${where})`, () => check(ring, fill, AA_UI));
      }
    });
  }
});
