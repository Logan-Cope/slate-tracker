import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression guard for the bottom sheet as a native dialog (interface review
// rows 4, 7 and 17, plus the overlay scroll part of row 13). Unit tests run
// without a DOM, so the component is read as text: a change that drops
// showModal(), lets the native Escape close the dialog behind React's back,
// stops returning focus or loses the opener when one sheet hands off to another
// fails here before it reaches a phone. The behaviour itself is exercised by
// tests/e2e/sheet.spec.ts in a real browser.

const root = new URL("../../", import.meta.url);
const sheet = readFileSync(new URL("components/ui/sheet.tsx", root), "utf8");
/** The <dialog ...> opening tag with its handlers, up to its first child. */
const dialogTag = sheet.slice(sheet.indexOf("<dialog"), sheet.indexOf("<ShowModal"));

describe("sheet is a native modal dialog", () => {
  it("renders a <dialog> opened with showModal(), never a div with role=dialog or an open attribute", () => {
    expect(dialogTag).toMatch(/^<dialog\s/);
    expect(sheet).toMatch(/\.showModal\(\)/);
    expect(sheet).not.toMatch(/role="dialog"/);
    expect(dialogTag).not.toMatch(/\sopen[\s=>]/);
  });

  it("renders nothing while closed so no hidden sheet sits in the accessibility tree", () => {
    expect(sheet).toMatch(/if \(!open\) return null;/);
  });

  it("keeps the accessible name and the single Close button, and adds no ARIA the native element already carries", () => {
    expect(dialogTag).toContain("aria-label={title}");
    expect(dialogTag).not.toContain("aria-modal");
    expect(dialogTag).toContain("tabIndex={-1}");
    expect(sheet.match(/aria-label="Close dialog"/g)).toHaveLength(1);
  });

  it("owns Escape: cancels the native close and lets React state drive it, and reopens after a close it could not cancel unless the consumer closed too", () => {
    expect(dialogTag).toMatch(/onCancel=\{\(e\) => \{\s*e\.preventDefault\(\);\s*onClose\(\);/);
    expect(dialogTag).toMatch(/onClose=\{\(\) => \{\s*onClose\(\);/);
    expect(dialogTag).toMatch(/requestAnimationFrame\(\(\) => \{[^}]*if \(d\?\.isConnected && !d\.open\) d\.showModal\(\);/s);
    expect(sheet).not.toMatch(/addEventListener\("keydown"/);
  });

  it("closes on a tap that starts and ends on the backdrop, never on a drag that ends there", () => {
    expect(sheet).toMatch(/onPointerDown=\{\(e\) => \{[^}]*e\.target === e\.currentTarget/);
    expect(sheet).toMatch(/onClick=\{\(e\) => \{[^}]*e\.target === e\.currentTarget[^}]*onClose\(\)/s);
  });

  it("opens the dialog before the children mount so a consumer's autoFocus still lands", () => {
    // The layout effect lives in a first child of the dialog: React runs it before
    // the later siblings' mount focus, which is a no-op inside a closed dialog.
    expect(sheet).toMatch(/useLayoutEffect\(\(\) => \{[^}]*showModal\(\)/s);
    expect(dialogTag).toMatch(/>\s*$/);
  });

  it("moves focus into the sheet on open without raising the keyboard, and returns it on close", () => {
    expect(sheet).toMatch(/document\.activeElement/);
    expect(sheet).toMatch(/const TEXT_ENTRY = /);
    expect(sheet).toMatch(/\.matches\(TEXT_ENTRY\)/);
    expect(sheet).toMatch(/if \(opener\?\.isConnected\) opener\.focus\(\);/);
  });

  it("hands the opener to a sheet that takes over in the same commit, and falls back to main when the opener is gone", () => {
    expect(sheet).toMatch(/let handedOff: HTMLElement \| null = null;/);
    expect(sheet).toMatch(/if \(restoreToRef\.current === null && handedOff\?\.isConnected\) restoreToRef\.current = handedOff;/);
    expect(sheet).toMatch(/const next = document\.querySelector\("dialog\[open\]"\);\s*if \(next && next !== dialog\) \{[^}]*handedOff = opener;\s*return;/);
    expect(sheet).toMatch(/else document\.getElementById\("main"\)\?\.focus\(\);/);
    // The (app) layout renders main through TabMain, which marks it busy while a tab is on its way.
    expect(readFileSync(new URL("app/(app)/layout.tsx", root), "utf8")).toMatch(/<TabMain /);
    expect(readFileSync(new URL("components/tab-pending.tsx", root), "utf8")).toMatch(/<main id="main" tabIndex=\{-1\}/);
  });

  it("keeps the bottom-sheet styling: scrim, pop, heights, safe area, contained scroll, header scroll padding, body lock", () => {
    expect(dialogTag).toMatch(/backdrop:bg-black\/40/);
    expect(dialogTag).toMatch(/className=\{`pop /);
    expect(sheet).toMatch(/max-h-\[70dvh\]/);
    expect(sheet).toMatch(/max-h-\[92dvh\]/);
    expect(sheet).toMatch(/rounded-t-3xl/);
    expect(sheet).toMatch(/max-w-lg/);
    expect(sheet).toMatch(/pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
    expect(sheet).toMatch(/overflow-y-auto[^"`]*overscroll-contain|overscroll-contain[^"`]*overflow-y-auto/);
    expect(sheet).toMatch(/scroll-pt-\[4\.625rem\]/);
    expect(sheet).toMatch(/document\.body\.style\.overflow = "hidden"/);
  });
});
