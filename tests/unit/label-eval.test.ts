import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GoldenSchema, scoreEntry, summarize, type GoldenEntry } from "@/lib/nutrition/label-eval";
import type { LabelDraft } from "@/lib/nutrition/label-fields";

const TRUTH = { servingLabel: "2/3 cup", servingGrams: 65, kcal: 290, proteinG: 7, carbsG: 40, fatG: 12, fiberG: 5 };

const LABEL: GoldenEntry = {
  id: "granola",
  file: "labels/granola.jpg",
  kind: "label",
  source: "iphone",
  truth: TRUTH,
  alternatives: [{ servingLabel: "1/3 cup", servingGrams: 33, kcal: 150, proteinG: 3, carbsG: 20, fatG: 6, fiberG: 2 }],
};

const NEGATIVE: GoldenEntry = { id: "blurry", file: "labels/blurry.jpg", kind: "negative", source: "iphone" };

function draft(over: Partial<LabelDraft> = {}): LabelDraft {
  return { name: null, brand: null, ...TRUTH, ...over };
}

describe("scoreEntry on a label", () => {
  it("counts a read that matches every field as fully correct", () => {
    const s = scoreEntry(LABEL, { ok: true, draft: draft() });
    expect(s.fullyCorrect).toBe(true);
    expect(s.numericCorrect).toBe(6);
    expect(s.silentKcalError).toBe(false);
  });

  it("compares the serving label without case, spaces or periods", () => {
    expect(scoreEntry(LABEL, { ok: true, draft: draft({ servingLabel: "2/3 Cup." }) }).fullyCorrect).toBe(true);
    const juice: GoldenEntry = { ...LABEL, truth: { ...TRUTH, servingLabel: "8 fl oz" }, alternatives: [] };
    expect(scoreEntry(juice, { ok: true, draft: draft({ servingLabel: "8 Fl. Oz." }) }).fullyCorrect).toBe(true);
  });

  it("flags wrong calories that the form would show as filled in", () => {
    const s = scoreEntry(LABEL, { ok: true, draft: draft({ kcal: 200 }) });
    expect(s.silentKcalError).toBe(true);
    expect(s.fullyCorrect).toBe(false);
    expect(s.wrong).toContain("kcal");
  });

  it("accepts the other serving column as a whole, never mixed with the first", () => {
    const alt = scoreEntry(LABEL, { ok: true, draft: draft({ servingLabel: "1/3 cup", servingGrams: 33, kcal: 150, proteinG: 3, carbsG: 20, fatG: 6, fiberG: 2 }) });
    expect(alt.fullyCorrect).toBe(true);
    const mixed = scoreEntry(LABEL, { ok: true, draft: draft({ kcal: 150 }) });
    expect(mixed.fullyCorrect).toBe(false);
  });

  it("takes a value from the accept list", () => {
    const entry: GoldenEntry = { ...LABEL, truth: { ...TRUTH, fiberG: null }, accept: { fiberG: [0] } };
    expect(scoreEntry(entry, { ok: true, draft: draft({ fiberG: 0 }) }).fullyCorrect).toBe(true);
    expect(scoreEntry(entry, { ok: true, draft: draft({ fiberG: null }) }).fullyCorrect).toBe(true);
    expect(scoreEntry(entry, { ok: true, draft: draft({ fiberG: 1 }) }).fullyCorrect).toBe(false);
  });

  it("counts a failed read on a real label as missed, not as a silent error", () => {
    const s = scoreEntry(LABEL, { ok: false });
    expect(s.missed).toBe(true);
    expect(s.numericCorrect).toBe(0);
    expect(s.silentKcalError).toBe(false);
  });
});

describe("scoreEntry on a negative", () => {
  it("passes when the reader refuses the photo", () => {
    expect(scoreEntry(NEGATIVE, { ok: false }).rejected).toBe(true);
  });

  it("does not count a reader error as a refusal", () => {
    expect(scoreEntry(NEGATIVE, { ok: false, reason: "error" }).rejected).toBe(false);
  });

  it("fails when the reader invents a label", () => {
    expect(scoreEntry(NEGATIVE, { ok: true, draft: draft() }).rejected).toBe(false);
  });
});

describe("summarize", () => {
  it("passes only when every bar is met", () => {
    const good = summarize([scoreEntry(LABEL, { ok: true, draft: draft() }), scoreEntry(NEGATIVE, { ok: false })]);
    expect(good.pass).toBe(true);
    expect(good.numericAccuracy).toBe(1);
    expect(good.fullyCorrectRate).toBe(1);
    expect(good.negativesRejected).toBe(1);
    expect(good.negatives).toBe(1);
  });

  it("fails on one silent calorie error even when everything else is right", () => {
    const many = Array.from({ length: 30 }, () => scoreEntry(LABEL, { ok: true, draft: draft() }));
    const r = summarize([...many, scoreEntry(LABEL, { ok: true, draft: draft({ kcal: 29 }) })]);
    expect(r.fullyCorrectRate).toBeGreaterThan(0.9);
    expect(r.silentKcalErrors).toBe(1);
    expect(r.pass).toBe(false);
  });

  it("fails when a negative is accepted", () => {
    const r = summarize([scoreEntry(LABEL, { ok: true, draft: draft() }), scoreEntry(NEGATIVE, { ok: true, draft: draft() })]);
    expect(r.pass).toBe(false);
  });
});

describe("the golden fixture", () => {
  it("parses, has unique ids, files that exist, and at least 12 labels and 4 negatives", () => {
    const entries = GoldenSchema.parse(JSON.parse(readFileSync("evals/label-golden.json", "utf8")));
    for (const e of entries) expect(existsSync(`evals/${e.file}`), e.file).toBe(true);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    expect(entries.filter((e) => e.kind === "label").length).toBeGreaterThanOrEqual(12);
    expect(entries.filter((e) => e.kind === "negative").length).toBeGreaterThanOrEqual(4);
  });
});
