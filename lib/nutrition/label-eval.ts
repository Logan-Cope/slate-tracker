/**
 * Scores label reads against the golden photos in evals/label-golden.json.
 * The bar (all must hold): no calories that are wrong yet filled in, at least 98% of number
 * fields exact, at least 90% of labels right on every field, and every non-label photo refused.
 */
import { z } from "zod";
import type { LabelDraft } from "./label-fields";

const num = z.number().nullable();
const TruthSchema = z.object({
  servingLabel: z.string(),
  servingGrams: num,
  kcal: z.number(),
  proteinG: num,
  carbsG: num,
  fatG: num,
  fiberG: num,
});
export type LabelTruth = z.infer<typeof TruthSchema>;

const NUMERIC = ["servingGrams", "kcal", "proteinG", "carbsG", "fatG", "fiberG"] as const;
type NumericField = (typeof NUMERIC)[number];
type Field = NumericField | "servingLabel";

const EntrySchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    file: z.string(),
    kind: z.literal("label"),
    source: z.string(),
    truth: TruthSchema,
    alternatives: z.array(TruthSchema).optional(),
    accept: z.record(z.string(), z.array(z.union([z.number(), z.string(), z.null()]))).optional(),
    note: z.string().optional(),
  }),
  z.object({ id: z.string(), file: z.string(), kind: z.literal("negative"), source: z.string(), note: z.string().optional() }),
]);
export const GoldenSchema = z.array(EntrySchema);
export type GoldenEntry = z.infer<typeof EntrySchema>;

/** A failed read: the reader refused the photo ("unreadable", the default) or never got an answer ("error"). */
export type ReadOutcome = { ok: true; draft: LabelDraft } | { ok: false; reason?: "unreadable" | "error" };

export type EntryScore = {
  id: string;
  kind: "label" | "negative";
  /** Label: every field right. */
  fullyCorrect: boolean;
  /** Label: number fields right, out of 6. */
  numericCorrect: number;
  /** Label: the reader filled in calories and they are wrong. */
  silentKcalError: boolean;
  /** Label: the reader refused a real label. */
  missed: boolean;
  /** Negative: the reader refused it. */
  rejected: boolean;
  wrong: Field[];
};

export const NUMERIC_FIELDS = NUMERIC.length;
export const BAR = { numericAccuracy: 0.98, fullyCorrectRate: 0.9 } as const;

export function normalizeServing(text: string): string {
  return text.toLowerCase().replace(/[\s.]+/g, "");
}

function sameNumber(a: number | null, b: number | string | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return typeof b === "number" && Math.abs(a - b) < 1e-9;
}

function wrongFields(draft: LabelDraft, truth: LabelTruth, accept: Record<string, Array<number | string | null>>): Field[] {
  const wrong: Field[] = [];
  const servingOk = [truth.servingLabel, ...(accept.servingLabel ?? [])].some(
    (v) => typeof v === "string" && normalizeServing(v) === normalizeServing(draft.servingLabel),
  );
  if (!servingOk) wrong.push("servingLabel");
  for (const f of NUMERIC) {
    const ok = [truth[f], ...(accept[f] ?? [])].some((v) => sameNumber(draft[f], v));
    if (!ok) wrong.push(f);
  }
  return wrong;
}

export function scoreEntry(entry: GoldenEntry, outcome: ReadOutcome): EntryScore {
  const base = { id: entry.id, kind: entry.kind, fullyCorrect: false, numericCorrect: 0, silentKcalError: false, missed: false, rejected: false, wrong: [] as Field[] };
  if (entry.kind === "negative") return { ...base, rejected: !outcome.ok && outcome.reason !== "error" };
  if (!outcome.ok) return { ...base, missed: true, wrong: ["servingLabel", ...NUMERIC] };

  // Score against whichever serving column the read matches best; columns are never mixed.
  const accept = entry.accept ?? {};
  const candidates = [entry.truth, ...(entry.alternatives ?? [])];
  const wrong = candidates.map((t) => wrongFields(outcome.draft, t, accept)).reduce((best, w) => (w.length < best.length ? w : best));
  return {
    ...base,
    fullyCorrect: wrong.length === 0,
    numericCorrect: NUMERIC.filter((f) => !wrong.includes(f)).length,
    silentKcalError: wrong.includes("kcal"),
    wrong,
  };
}

export type Summary = {
  labels: number;
  negatives: number;
  numericAccuracy: number;
  fullyCorrectRate: number;
  silentKcalErrors: number;
  missed: number;
  negativesRejected: number;
  pass: boolean;
};

export function summarize(scores: EntryScore[]): Summary {
  const labels = scores.filter((s) => s.kind === "label");
  const negatives = scores.filter((s) => s.kind === "negative");
  const numericAccuracy = labels.length === 0 ? 0 : labels.reduce((n, s) => n + s.numericCorrect, 0) / (labels.length * NUMERIC_FIELDS);
  const fullyCorrectRate = labels.length === 0 ? 0 : labels.filter((s) => s.fullyCorrect).length / labels.length;
  const silentKcalErrors = labels.filter((s) => s.silentKcalError).length;
  const negativesRejected = negatives.filter((s) => s.rejected).length;
  return {
    labels: labels.length,
    negatives: negatives.length,
    numericAccuracy,
    fullyCorrectRate,
    silentKcalErrors,
    missed: labels.filter((s) => s.missed).length,
    negativesRejected,
    pass:
      labels.length > 0 &&
      silentKcalErrors === 0 &&
      numericAccuracy >= BAR.numericAccuracy &&
      fullyCorrectRate >= BAR.fullyCorrectRate &&
      negativesRejected === negatives.length,
  };
}
