import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { LABEL_MODELS, LABEL_SYSTEM_PROMPT, createClaudeLabelReader, createFakeLabelReader, labelCostUsd } from "@/lib/nutrition/label-reader";
import type { LabelRead } from "@/lib/nutrition/label-fields";

const READ: LabelRead = {
  readable: true,
  name: null,
  brand: null,
  serving_size: "2/3 cup (65g)",
  calories: "290",
  protein: "7g",
  total_carbohydrate: "40g",
  total_fat: "12g",
  dietary_fiber: "5g",
};

const IMAGE = { data: "aGVsbG8=", mediaType: "image/jpeg" as const };

type Reply = { stop_reason: string; content: Array<Record<string, unknown>>; usage: { input_tokens: number; output_tokens: number } } | Error;

function reply(json: unknown, stop_reason = "end_turn"): Reply {
  return { stop_reason, content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }], usage: { input_tokens: 2000, output_tokens: 100 } };
}

function fakeClient(...replies: Reply[]) {
  const queue = [...replies];
  const create = vi.fn<(params: unknown) => Promise<unknown>>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("no reply queued");
    if (next instanceof Error) throw next;
    return next;
  });
  return { client: { messages: { create } } as unknown as Anthropic, create };
}

function params(create: { mock: { calls: unknown[][] } }, i: number): Record<string, unknown> {
  return create.mock.calls[i]?.[0] as Record<string, unknown>;
}

describe("createClaudeLabelReader", () => {
  it("sends the photo as a base64 image with a structured output format and no sampling params", async () => {
    const { client, create } = fakeClient(reply(READ));
    await createClaudeLabelReader({ client })(IMAGE);

    const p = params(create, 0);
    expect(p.model).toBe(LABEL_MODELS[0]);
    expect(p.system).toBe(LABEL_SYSTEM_PROMPT);
    expect(p).not.toHaveProperty("temperature");
    const content = (p.messages as Array<{ content: Array<Record<string, unknown>> }>)[0]?.content ?? [];
    expect(content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "aGVsbG8=" } });
    const config = p.output_config as { format: { type: string }; effort?: string };
    expect(config.format.type).toBe("json_schema");
  });

  it("returns the form draft for a readable label", async () => {
    const { client } = fakeClient(reply(READ));
    const r = await createClaudeLabelReader({ client })(IMAGE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.draft).toMatchObject({ servingLabel: "2/3 cup", servingGrams: 65, kcal: 290, proteinG: 7 });
    expect(r.model).toBe(LABEL_MODELS[0]);
    expect(r.usage).toEqual({ inputTokens: 2000, outputTokens: 100 });
  });

  it("reports an unreadable photo without trying the backup model", async () => {
    const { client, create } = fakeClient(reply({ ...READ, readable: false, calories: null }));
    const r = await createClaudeLabelReader({ client })(IMAGE);
    expect(r).toMatchObject({ ok: false, reason: "unreadable" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("falls back to the next model when the first one errors, and adds up usage", async () => {
    const { client, create } = fakeClient(new Error("overloaded"), reply(READ));
    const r = await createClaudeLabelReader({ client, models: ["model-a", "model-b"] })(IMAGE);
    expect(r.ok).toBe(true);
    expect(r.model).toBe("model-b");
    expect(params(create, 1).model).toBe("model-b");
  });

  it("falls back on a refusal, a cut-off reply and invalid JSON", async () => {
    for (const bad of [reply(READ, "refusal"), reply(READ, "max_tokens"), reply("not json"), reply({ readable: true })]) {
      const { client } = fakeClient(bad, reply(READ));
      const r = await createClaudeLabelReader({ client, models: ["a", "b"] })(IMAGE);
      expect(r.ok).toBe(true);
    }
  });

  it("returns an error when every model fails, never throws", async () => {
    const { client } = fakeClient(new Error("down"), new Error("still down"));
    const r = await createClaudeLabelReader({ client, models: ["a", "b"] })(IMAGE);
    expect(r).toMatchObject({ ok: false, reason: "error", model: "b" });
  });
});

describe("createFakeLabelReader", () => {
  it("returns its fixed read", async () => {
    const r = await createFakeLabelReader(READ)(IMAGE);
    expect(r.ok && r.draft.kcal).toBe(290);
  });
});

describe("labelCostUsd", () => {
  it("prices Haiku 5.5 and Sonnet 5.5 at list rates", () => {
    expect(labelCostUsd("claude-haiku-5-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(0.6);
    expect(labelCostUsd("claude-sonnet-5-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(12);
  });
});
