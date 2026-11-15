/**
 * Reads a nutrition label photo with Claude: one image in, one serving's values out, transcribed as
 * printed and parsed by label-fields.ts. Server-only (holds the API key). Never throws. Tries each
 * model in LABEL_MODELS in turn when one errors, refuses or returns something unusable; a clear
 * "this is not a readable label" answer is final and costs no second call.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { LabelReadSchema, labelDraft, type LabelDraft, type LabelRead } from "./label-fields";

export type LabelImage = { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };
export type LabelUsage = { inputTokens: number; outputTokens: number };
export type LabelReaderResult =
  | { ok: true; draft: LabelDraft; model: string; usage: LabelUsage }
  | { ok: false; reason: "unreadable" | "error"; model: string; usage: LabelUsage; error?: string };
export type LabelReader = (image: LabelImage) => Promise<LabelReaderResult>;
export type LabelEffort = "low" | "medium" | "high";

/** First model reads every photo; the next one is the backup when it fails. Chosen by `npm run eval:labels`. */
export const LABEL_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"] as const;
export const LABEL_EFFORT: LabelEffort = "medium";

const MAX_TOKENS = 8000;
/**
 * Per model, no SDK retries: the backup model is the retry. Two models at 15 s each stay inside the
 * route's 45 s limit; a normal read takes about 2 s.
 */
const TIMEOUT_MS = 15_000;

/** List prices per million tokens (input, output). Haiku 5.5 rates are for prompts up to 100K tokens, which a photo always is. */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};

export function labelCostUsd(model: string, usage: LabelUsage): number {
  const [inp, out] = PRICES[model] ?? [0, 0];
  return (usage.inputTokens * inp + usage.outputTokens * out) / 1e6;
}

export const LABEL_SYSTEM_PROMPT = `You transcribe the Nutrition Facts or Supplement Facts panel in a photo, so an app can fill in a food for one serving.

readable:
- true only when the photo shows a nutrition panel whose serving size and calories you can read with certainty.
- false when the photo is too blurry to read, the panel is cut off so the serving or calories are out of frame, there is no nutrition panel (front of a package, ingredients only, anything else), or you would have to guess. Then set every other field to null.

Which column:
- Copy the values for ONE serving, the per-serving or per-portion column.
- Never the per-container, per-package, per-100 g or per-100 ml column.
- When the panel lists two serving sizes side by side, use the first one.

Fields, each copied exactly as printed, unit and any "<" included. Never compute, convert, round or estimate:
- serving_size: the whole serving line, household measure and weight together, e.g. "1 cup (228g)", "3 crackers (16g)", "30g (about 12 chips)".
- calories: the calories (kcal) for one serving, e.g. "210". When the panel shows kJ and kcal, the kcal.
- protein, total_carbohydrate, total_fat, dietary_fiber: that line's amount, e.g. "9g", "<1g", "2,5". Labels in other languages count.
- null for a line the panel does not have, or that it covers only with "Not a significant source of ...".
- name and brand: only when printed in the photo, otherwise null.`;

function errorText(error: unknown): string {
  if (error instanceof Anthropic.APIError) return error.status ? `Claude API error ${error.status}: ${error.message}` : `Claude API error: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

type Attempt = { kind: "read"; read: LabelRead } | { kind: "fail"; error: string };

export function createClaudeLabelReader(opts: { client?: Anthropic; models?: readonly string[]; effort?: LabelEffort } = {}): LabelReader {
  const client = opts.client ?? new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const models = opts.models ?? LABEL_MODELS;
  const effort = opts.effort ?? LABEL_EFFORT;

  async function attempt(model: string, image: LabelImage, usage: LabelUsage): Promise<Attempt> {
    try {
      const message = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: LABEL_SYSTEM_PROMPT,
        output_config: { format: zodOutputFormat(LabelReadSchema), effort },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
              { type: "text", text: "Read this label." },
            ],
          },
        ],
      });
      usage.inputTokens += message.usage.input_tokens;
      usage.outputTokens += message.usage.output_tokens;
      if (message.stop_reason !== "end_turn") return { kind: "fail", error: `stop_reason ${message.stop_reason}` };
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return { kind: "fail", error: "reply was not JSON" };
      }
      const parsed = LabelReadSchema.safeParse(raw);
      return parsed.success ? { kind: "read", read: parsed.data } : { kind: "fail", error: "reply did not match the schema" };
    } catch (error) {
      return { kind: "fail", error: errorText(error) };
    }
  }

  return async (image) => {
    const usage: LabelUsage = { inputTokens: 0, outputTokens: 0 };
    let lastError = "no model configured";
    let model = models[0] ?? "";
    for (const m of models) {
      model = m;
      const a = await attempt(m, image, usage);
      if (a.kind === "fail") {
        lastError = a.error;
        continue;
      }
      const draft = labelDraft(a.read);
      return draft.ok ? { ok: true, draft: draft.draft, model, usage } : { ok: false, reason: "unreadable", model, usage };
    }
    return { ok: false, reason: "error", model, usage, error: lastError };
  };
}

export function createFakeLabelReader(read: LabelRead, opts: { delayMs?: number } = {}): LabelReader {
  return async () => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    const draft = labelDraft(read);
    const usage = { inputTokens: 0, outputTokens: 0 };
    return draft.ok ? { ok: true, draft: draft.draft, model: "fake", usage } : { ok: false, reason: "unreadable", model: "fake", usage };
  };
}
