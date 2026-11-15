import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression guard for the typography, form and copy rules (interface review
// rows 5, 7, 8, 9, 10, 11, 12, 16 and the ASCII row). Unit tests run without a
// DOM, so the components are read as text: a clamp with no way back, a Save
// gated on validity, a live region that mounts together with its text, an error
// with no next step, or a keyboard stand-in for an ellipsis fails here before it
// reaches a phone.

const root = new URL("../../", import.meta.url);
const rootDir = fileURLToPath(root);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...tsxFiles(p));
    else if (d.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Source with block comments and whole-line comments removed, so only code and rendered strings remain. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Every opening `<tag ...>` in JSX source, with where it starts. Attribute
 * values can hold arrow functions, so the tag ends at the first `>` outside
 * any braces rather than at the first `>`.
 */
function openingTags(text: string, tag: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  const re = new RegExp(`<${tag}\\b`, "g");
  for (const m of text.matchAll(re)) {
    let depth = 0;
    let i = m.index;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    out.push({ start: m.index, text: text.slice(m.index, i + 1) });
  }
  return out;
}

const sources = ["app", "components"]
  .flatMap((dir) => tsxFiles(join(rootDir, dir)))
  .map((p) => [p.slice(rootDir.length), withoutComments(readFileSync(p, "utf8"))] as const);

/** Server code whose error strings reach the screen as they are. */
const ACTION_FILES = [
  "app/(app)/train/actions.ts",
  "app/(app)/weight/actions.ts",
  "app/(app)/coach/actions.ts",
  "app/(app)/coach/restaurants/actions.ts",
  "app/login/actions.ts",
  "app/api/barcode/[code]/route.ts",
];

const AMOUNT_SHEETS = [
  "components/nutrition/quick-add-sheet.tsx",
  "components/nutrition/food-detail-sheet.tsx",
  "components/nutrition/entry-sheet.tsx",
  "components/nutrition/scan-sheet.tsx",
];

/** Forms that validate on submit with a per-field error, beyond the amount sheets. */
const VALIDATING_FORMS = ["components/nutrition/custom-food-form.tsx", "components/nutrition/saved-meal-builder.tsx", "components/nutrition/copy-sheet.tsx"];

/** Files whose every clamp was removed: the full value shows where it is. */
const UNCLAMPED = [
  "app/(app)/train/page.tsx",
  "app/(app)/coach/restaurants/[id]/page.tsx",
  "components/nutrition/saved-meal-builder.tsx",
  "components/nutrition/toast.tsx",
  "components/nutrition/add-food-screen.tsx",
  "components/coach/routine-editor.tsx",
];

/** The workout header keeps its two-line title (the options sheet and Summary show it whole) but nothing on one line. */
const NO_TRUNCATE = ["components/training/active-workout.tsx"];

/** An error sentence names a next step: a verb she can act on, or a place to go. */
const NEXT_STEP =
  /\b(try again|check|go back|back to|sign in|enter|reload|allow|type|add|pick|tap|choose|use|open|reopen|discard|give|search|clear|undo|retry|log|leave it blank|look it up|wait)\b|\b(Train|Today|Coach|History|Settings|Weight)\b/i;

describe("typography", () => {
  it("lets the page title wrap instead of clipping it", () => {
    const header = read("components/ui/page-header.tsx");
    const h1 = header.slice(header.indexOf("<h1"), header.indexOf("</h1>"));
    expect(h1).not.toMatch(/\btruncate\b/);
    expect(h1).toMatch(/\btext-pretty\b/);
  });

  it("lets a restaurant item's name and serving wrap, since no other screen shows them", () => {
    const page = read("app/(app)/coach/restaurants/[id]/page.tsx");
    const name = page.match(/<div className="([^"]*)">\{it\.name\}<\/div>/);
    expect(name, "item name element").not.toBeNull();
    expect(name![1]).toMatch(/\btext-pretty\b/);
    expect(name![1]).not.toMatch(/\bline-clamp-|\btruncate\b/);
  });

  it("never clamps a value that has no other place to be read in full", () => {
    for (const file of UNCLAMPED) {
      const text = withoutComments(read(file));
      expect(text, file).not.toMatch(/\btruncate\b/);
      expect(text, `${file} line-clamp`).not.toMatch(/\bline-clamp-\d/);
    }
    for (const file of NO_TRUNCATE) expect(withoutComments(read(file)), file).not.toMatch(/\btruncate\b/);
  });

  it("renders the ellipsis character, never three periods, in every string a person can see", () => {
    for (const [file, text] of sources) {
      const hits = [...text.matchAll(/\.\.\.(?![\w[({])/g)].map((m) => text.slice(Math.max(0, m.index - 30), m.index + 3));
      expect(hits, file).toEqual([]);
    }
  });

  it("never prints a double hyphen as a dash or a blank", () => {
    for (const [file, text] of sources) {
      expect(text, file).not.toMatch(/["'`>]--["'`<]/);
      expect(text, file).not.toMatch(/\w -- \w/);
    }
  });

  it("keeps placeholders short enough for a 320px phone, as examples rather than instructions", () => {
    expect(read("components/nutrition/add-food-screen.tsx")).toContain('placeholder="150g chicken, quest bar"');
    expect(read("app/(app)/coach/programs/[id]/page.tsx")).toContain('placeholder="Total Body C"');
    expect(read("components/nutrition/scan-sheet.tsx")).toContain('placeholder="888849000012"');
    for (const [file, text] of sources) {
      for (const m of text.matchAll(/placeholder="([^"]*)"/g)) expect(m[1], `${file}: ${m[0]}`).not.toMatch(/\be\.g\.|^New /);
    }
  });

  it("keeps the coach profile select at 16px on a phone so iOS does not zoom on focus", () => {
    const banner = read("components/profile-banner.tsx");
    const select = openingTags(banner, "select")[0]?.text ?? "";
    expect(select).toMatch(/\btext-base\b/);
    expect(select).toMatch(/\bsm:text-xs\b/);
  });

  it("sizes the set inputs in rem and chart ticks at 12px or more", () => {
    expect(read("components/training/num-input.tsx")).toContain("text-[1.0625rem]");
    for (const file of ["components/metrics/weight-chart.tsx", "components/training/exercise-chart.tsx"]) {
      for (const m of read(file).matchAll(/fontSize:\s*(\d+)/g)) expect(Number(m[1]), file).toBeGreaterThanOrEqual(12);
    }
  });
});

describe("coach table", () => {
  it("pairs the red calorie number with the word over", () => {
    const page = read("app/(app)/coach/page.tsx");
    expect(page).toMatch(/kcalCellText\(/);
    expect(page).toMatch(/isOverTarget\(/);
  });
});

describe("forms", () => {
  it("never disable Save until the input parses; they validate on submit, mark the field and focus it", () => {
    for (const file of [...AMOUNT_SHEETS, ...VALIDATING_FORMS]) {
      const text = read(file);
      expect(text, file).not.toMatch(/\sdisabled=\{!(valid|computed)/);
      expect(text, file).not.toMatch(/\sdisabled=\{manual\.replace/);
      expect(text, file).not.toMatch(/\sdisabled=\{pending \|\| !valid/);
      expect(text, file).not.toMatch(/\sdisabled=\{toDate === fromDate/);
      expect(text, file).toMatch(/aria-invalid[=":]/);
      expect(text, file).toMatch(/aria-describedby[=":]/);
      expect(text, file).toMatch(/<FieldError\b/);
      expect(text, file).toMatch(/\.focus\(\)/);
    }
  });

  it("share one error sentence from lib under the amount field", () => {
    for (const file of [...AMOUNT_SHEETS.slice(0, 3), "components/nutrition/saved-meal-builder.tsx"]) {
      expect(read(file), file).toMatch(/AMOUNT_ERROR|quickAddCheck/);
    }
  });

  it("never put a native disabled on a submit button: a pending one is aria-disabled and ignores repeat clicks", () => {
    for (const [file, text] of sources) {
      for (const tag of openingTags(text, "button")) {
        if (!/type="submit"/.test(tag.text)) continue;
        expect(tag.text, `${file}: ${tag.text.slice(0, 80)}`).not.toMatch(/\sdisabled=/);
      }
    }
  });

  it("keep an unchanged entry's Save a live button that closes the sheet", () => {
    const text = read("components/nutrition/entry-sheet.tsx");
    expect(text).not.toMatch(/aria-disabled=/);
    expect(text).not.toMatch(/\sdisabled=\{[^}]*changed/);
    expect(text).toMatch(/if \(!changed\) \{\s*onClose\(\);/);
  });

  it("free the barcode fields of a pattern and a keystroke filter so submit validation always runs", () => {
    for (const file of ["components/nutrition/scan-sheet.tsx", "components/nutrition/custom-food-form.tsx"]) {
      const text = read(file);
      expect(text, file).not.toMatch(/pattern="\[0-9\]\*"/);
      expect(text, file).not.toMatch(/onChange=\{\(e\) => set\w+\(e\.target\.value\.replace/);
    }
  });

  it("render the field error as a plain paragraph the field describes, taking no space while empty", () => {
    const text = read("components/ui/field-error.tsx");
    expect(text).not.toMatch(/role=/);
    expect(text).toMatch(/className=\{message \? /);
  });

  it("mark the weigh-in field invalid and focus it when its value does not parse", () => {
    const text = read("components/metrics/weigh-in-form.tsx");
    expect(text).toMatch(/aria-invalid=\{error/);
    expect(text).toMatch(/aria-describedby=\{error \? "weigh-in-error"/);
    expect(text).toMatch(/inputRef\.current\?\.focus\(\)/);
  });

  it("open the weigh-in field empty with a 0 placeholder that is gone while focused", () => {
    const text = read("components/metrics/weigh-in-form.tsx");
    expect(text).toMatch(/useState\(""\)/);
    expect(text).toMatch(/placeholder="0"/);
    expect(text).toMatch(/\[&_input:focus::placeholder\]:opacity-0/);
  });
});

describe("live regions", () => {
  it("are mounted once, in every component, and only their text changes", () => {
    let seen = 0;
    for (const [file, text] of sources) {
      for (const tag of [...openingTags(text, "p"), ...openingTags(text, "span"), ...openingTags(text, "div")]) {
        if (!/role="(status|alert)"/.test(tag.text)) continue;
        seen++;
        const before = text.slice(Math.max(0, tag.start - 80), tag.start).replace(/\s+/g, " ").trimEnd();
        expect(before, `${file}: ${tag.text.slice(0, 60)} is rendered conditionally`).not.toMatch(/(\?|&&)\s*\(?$/);
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it("exist for the discard, custom food, saved meal, history and picker errors", () => {
    for (const file of [
      "components/training/discard-sheet.tsx",
      "components/nutrition/custom-food-form.tsx",
      "components/nutrition/saved-meal-builder.tsx",
      "components/training/history-list.tsx",
      "components/training/exercise-picker.tsx",
      "components/training/active-workout.tsx",
    ]) {
      expect(read(file), file).toMatch(/role="alert" className=\{\w+(\.\w+)? \? /);
    }
  });
});

describe("errors name the next step", () => {
  /** Every literal that becomes an error message: action results, setError calls, danger toasts, status messages. */
  function errorStrings(text: string): string[] {
    const out: string[] = [];
    const patterns = [
      /\berror:\s*"([^"]+)"/g,
      /\berror:\s*`([^`]+)`/g,
      /\bmessage:\s*"([^"]+)"/g,
      /\breason:\s*"([^"]+)"/g,
      /set\w*Error\(\s*"([^"]+)"/g,
      /set\w*Error\(\s*`([^`]+)`/g,
      /show\(\s*"([^"]+)",\s*"danger"/g,
      /show\(\s*`([^`]+)`,\s*"danger"/g,
    ];
    for (const re of patterns) for (const m of text.matchAll(re)) if (m[1]) out.push(m[1]);
    // The restaurant draft page keeps its messages in a map keyed by the error code.
    const errorsMap = text.match(/const ERRORS[^{]*\{([^}]*)\}/)?.[1] ?? "";
    for (const m of errorsMap.matchAll(/"([^"]+)"/g)) if (m[1]) out.push(m[1]);
    return out;
  }

  it("in every error string a component or action renders", () => {
    const files = [...sources, ...ACTION_FILES.map((f) => [f, withoutComments(read(f))] as const)];
    for (const [file, text] of files) {
      for (const s of errorStrings(text)) {
        // Zod refinement notes and the sync status line are not error messages: the
        // status names what the app is doing on its own, and a refusal shows the server's sentence.
        if (/^(date must be|date out of range)/.test(s) || /^(Saving|Saved|Offline|Not saved)/.test(s)) continue;
        expect(s, `${file}: "${s}" names no next step`).toMatch(NEXT_STEP);
        expect(s, `${file}: "${s}"`).not.toMatch(/!|\boops\b|\bsomething went wrong\b|\binvalid\b/i);
      }
    }
  });

  it("the framework fallbacks offer a way back", () => {
    for (const file of ["app/not-found.tsx", "app/error.tsx"]) {
      const text = read(file);
      expect(text, file).toMatch(/href="\/today"/);
      expect(text, file).toMatch(/Back to Today/);
    }
    expect(read("app/error.tsx")).toMatch(/onClick=\{reset\}/);
  });

  it("maps a lost session on barcode lookup to Sign in, with no Retry", () => {
    const text = read("components/nutrition/scan-sheet.tsx");
    expect(text).toMatch(/res\.status === 401/);
    expect(text).toMatch(/next: "sign-in"/);
    expect(text).toMatch(/status\.next === "retry"/);
    expect(text).toMatch(/href="\/login"/);
  });

  it("shows the go-tos failing to load instead of a blank", () => {
    const text = read("components/nutrition/add-food-screen.tsx");
    expect(text).toMatch(/goTos\.isError \?/);
    expect(text).toMatch(/data-testid="go-tos-error"/);
  });
});

describe("destructive actions", () => {
  it("confirm with verb plus object, never a native confirm()", () => {
    for (const [file, text] of sources) expect(text, file).not.toMatch(/\bconfirm\(/);
    const sheet = read("components/coach/confirm-button.tsx");
    expect(sheet).toMatch(/<Sheet\b/);
    expect(sheet).toMatch(/>\s*Cancel\s*</);
    expect(read("components/training/discard-sheet.tsx")).toMatch(/Discard workout\s*</);
  });

  it("offer undo for a weigh-in and two taps for a routine exercise", () => {
    expect(read("components/metrics/weigh-in-list.tsx")).toMatch(/label: "Undo"/);
    expect(read("components/coach/routine-editor.tsx")).toMatch(/Tap again to remove/);
  });

  it("name a removed set the way its row shows it", () => {
    const text = read("components/training/active-workout.tsx");
    expect(text).toMatch(/\$\{capitalize\(setName\(set\)\)\} removed\./);
    expect(text).not.toMatch(/dismissToast\(\);\s*setRest/);
  });
});

describe("no narration", () => {
  /**
   * The rule: a control is named by its verb and nothing in the
   * interface explains how to use it. Unit tests run without a DOM, so the
   * screens added under that rule are read as text: every JSX text node,
   * placeholder and aria-label is a label of a few words, never a sentence.
   * Errors and toasts are code strings (checked above for a next step), not
   * JSX text, so they are not counted here. Files not yet written are skipped
   * so this guard can land before the screens do.
   */
  const SCREENS = [
    "components/nutrition/edit-bar.tsx",
  ];
  const MAX_WORDS = 5;

  function visibleStrings(text: string): string[] {
    const out: string[] = [];
    // JSX text between one tag and the next. Code characters rule a candidate out, so a
    // generic like useState<string>(x) is not mistaken for a text node.
    for (const m of text.matchAll(/>([^<>{}();=[\]]*[A-Za-z][^<>{}();=[\]]*)<(?=[/A-Za-z])/g)) out.push(m[1]!.trim());
    for (const m of text.matchAll(/(?:placeholder|aria-label|title)=(?:"([^"]+)"|\{`([^`]+)`\})/g)) out.push((m[1] ?? m[2] ?? "").replace(/\$\{[^}]*\}/g, "x").trim());
    return out.filter((s) => s.length > 0 && !/^\{/.test(s));
  }

  it("labels every control in the edit bar in a few words, never a sentence", () => {
    for (const file of SCREENS) {
      let text: string;
      try {
        text = withoutComments(read(file));
      } catch {
        continue;
      }
      for (const s of visibleStrings(text)) {
        const words = s.split(/\s+/).filter(Boolean).length;
        expect(words, `${file}: "${s}" reads as a sentence`).toBeLessThanOrEqual(MAX_WORDS);
        expect(s, `${file}: "${s}" explains instead of naming`).not.toMatch(/\b(you can|tap|how to|to get started|here you)\b/i);
      }
    }
  });

  it("keeps Settings free of the install walkthrough and the signed-in explanation", () => {
    const text = withoutComments(read("app/(app)/settings/page.tsx"));
    expect(text).not.toMatch(/home screen|Add to Home Screen|stay signed in/i);
    expect(text).not.toMatch(/InstallTip/);
  });
});
