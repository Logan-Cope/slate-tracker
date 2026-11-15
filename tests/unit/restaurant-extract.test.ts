import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  EXTRACT_MODEL,
  EXTRACT_SYSTEM_PROMPT,
  createClaudeExtractor,
  createFakeExtractor,
} from "@/lib/restaurants/extract";
import type { ExtractedMenu } from "@/lib/restaurants/validate";

const menu: ExtractedMenu = {
  restaurant: "Chipotle Mexican Grill",
  source_url: "https://www.chipotle.com/nutrition-calculator",
  items: [
    { name: "Chicken", serving: "4 oz", kcal: 180, protein_g: 32, carbs_g: 0, fat_g: 7, fiber_g: null },
    { name: "Steak", serving: "4 oz", kcal: 150, protein_g: 21, carbs_g: 1, fat_g: 6, fiber_g: null },
  ],
};

type Msg = {
  stop_reason: string;
  content: Array<Record<string, unknown>>;
  usage: { input_tokens: number; output_tokens: number };
};

function textMessage(json: unknown, stop_reason = "end_turn", usage = { input_tokens: 100, output_tokens: 50 }): Msg {
  return { stop_reason, content: [{ type: "text", text: JSON.stringify(json) }], usage };
}

/** The params object passed to the nth `messages.stream` call. */
function callParams(stream: { mock: { calls: Array<[unknown]> } }, index: number): Record<string, unknown> {
  const call = stream.mock.calls[index];
  if (!call) throw new Error(`stream was not called ${index + 1} times`);
  return call[0] as Record<string, unknown>;
}

/** A fake Anthropic client: `messages.stream` returns objects whose `finalMessage` resolves to the queued messages in order. */
function fakeClient(...messages: Msg[]) {
  const queue = [...messages];
  const stream = vi.fn<(params: unknown) => { finalMessage: () => Promise<Msg | undefined> }>(() => {
    const next = queue.shift();
    return { finalMessage: async () => next };
  });
  const client = { messages: { stream } } as unknown as Anthropic;
  return { client, stream };
}

describe("createClaudeExtractor", () => {
  it("sends the expected request shape: model, server tools, structured output, prompts", async () => {
    const { client, stream } = fakeClient(textMessage(menu));
    const extract = createClaudeExtractor(client);
    await extract({ restaurantName: "Chipotle", sourceUrl: "https://www.chipotle.com/nutrition-calculator" });

    expect(stream).toHaveBeenCalledTimes(1);
    const params = callParams(stream, 0);
    expect(params.model).toBe("claude-opus-5");
    expect(EXTRACT_MODEL).toBe("claude-opus-5");
    expect(params.max_tokens as number).toBeGreaterThanOrEqual(16000);
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("fallbacks");
    expect(params).not.toHaveProperty("betas");

    const tools = params.tools as Array<Record<string, unknown>>;
    const search = tools.filter((t) => t.type === "web_search_20260209");
    const fetch = tools.filter((t) => t.type === "web_fetch_20260209");
    expect(tools).toHaveLength(2);
    expect(search).toHaveLength(1);
    expect(fetch).toHaveLength(1);
    expect(search[0]!).toMatchObject({ name: "web_search", max_uses: 3 });
    expect(search[0]!.blocked_domains).toEqual(
      expect.arrayContaining(["myfitnesspal.com", "nutritionix.com", "fatsecret.com", "calorieking.com", "eatthismuch.com"]),
    );
    expect(fetch[0]!).toMatchObject({ name: "web_fetch", max_uses: 10, max_content_tokens: 60000 });

    const outputConfig = params.output_config as { format?: unknown };
    expect(outputConfig.format).toBeDefined();

    expect(params.system).toBe(EXTRACT_SYSTEM_PROMPT);
    expect(String(params.system)).toContain("official");

    const messages = params.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.content).toContain("Restaurant: Chipotle");
    expect(messages[0]!.content).toContain("Start from: https://www.chipotle.com/nutrition-calculator");
  });

  it("omits the Start from line when no URL is given", async () => {
    const { client, stream } = fakeClient(textMessage(menu));
    await createClaudeExtractor(client)({ restaurantName: "Chipotle" });
    const first = (callParams(stream, 0).messages as Array<{ content: string }>)[0]!;
    expect(first.content).toContain("Restaurant: Chipotle");
    expect(first.content).not.toContain("Start from");
  });

  it("returns the parsed menu, source url and token usage on success", async () => {
    const { client } = fakeClient(textMessage(menu, "end_turn", { input_tokens: 1200, output_tokens: 340 }));
    const result = await createClaudeExtractor(client)({ restaurantName: "Chipotle" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.menu.items).toHaveLength(2);
    expect(result.menu.restaurant).toBe("Chipotle Mexican Grill");
    expect(result.sourceUrl).toBe("https://www.chipotle.com/nutrition-calculator");
    expect(result.model).toBe("claude-opus-5");
    expect(result.inputTokens).toBe(1200);
    expect(result.outputTokens).toBe(340);
  });

  it("resumes a pause_turn by replaying the assistant turn and sums tokens across calls", async () => {
    const paused: Msg = {
      stop_reason: "pause_turn",
      content: [{ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "chipotle nutrition" } }],
      usage: { input_tokens: 500, output_tokens: 20 },
    };
    const { client, stream } = fakeClient(paused, textMessage(menu, "end_turn", { input_tokens: 2000, output_tokens: 300 }));
    const result = await createClaudeExtractor(client)({ restaurantName: "Chipotle" });

    expect(stream).toHaveBeenCalledTimes(2);
    const replay = callParams(stream, 1).messages as Array<{ role: string; content: unknown }>;
    expect(replay).toHaveLength(2);
    expect(replay[0]!.role).toBe("user");
    expect(replay[1]).toEqual({ role: "assistant", content: paused.content });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.inputTokens).toBe(2500);
    expect(result.outputTokens).toBe(320);
  });

  it("stops resuming after five pause_turns and reports an error", async () => {
    const paused = (): Msg => ({ stop_reason: "pause_turn", content: [{ type: "text", text: "" }], usage: { input_tokens: 1, output_tokens: 1 } });
    const { client, stream } = fakeClient(paused(), paused(), paused(), paused(), paused(), paused(), textMessage(menu));
    const result = await createClaudeExtractor(client)({ restaurantName: "Chipotle" });
    expect(stream).toHaveBeenCalledTimes(6);
    expect(result.ok).toBe(false);
    expect(result.inputTokens).toBe(6);
  });

  it("reports a refusal as a declined request", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", content: [], usage: { input_tokens: 10, output_tokens: 0 } });
    const result = await createClaudeExtractor(client)({ restaurantName: "Chipotle" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("declined");
    expect(result.inputTokens).toBe(10);
  });

  it("reports a schema mismatch naming the bad field", async () => {
    const { client } = fakeClient(textMessage({ restaurant: "Chipotle", source_url: "https://www.chipotle.com" }));
    const result = await createClaudeExtractor(client)({ restaurantName: "Chipotle" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("items");
    expect(result.error).not.toContain("\n");
  });

  it("reports a reply with no text block as an error", async () => {
    const { client } = fakeClient({ stop_reason: "end_turn", content: [], usage: { input_tokens: 10, output_tokens: 0 } });
    const result = await createClaudeExtractor(client)({ restaurantName: "Chipotle" });
    expect(result.ok).toBe(false);
  });

  it("reports an empty item list with the source url", async () => {
    const { client } = fakeClient(textMessage({ ...menu, items: [] }));
    const result = await createClaudeExtractor(client)({ restaurantName: "Chipotle" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBe("No menu items found at https://www.chipotle.com/nutrition-calculator");
  });

  it("returns an error instead of rejecting when the SDK throws", async () => {
    const stream = vi.fn(() => {
      throw new Error("connection reset");
    });
    const client = { messages: { stream } } as unknown as Anthropic;
    const result = await createClaudeExtractor(client)({ restaurantName: "Chipotle" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("connection reset");
    expect(result.model).toBe("claude-opus-5");
  });

  it("returns an error when finalMessage rejects", async () => {
    const stream = vi.fn(() => ({ finalMessage: async () => Promise.reject(new Error("stream aborted")) }));
    const client = { messages: { stream } } as unknown as Anthropic;
    const result = await createClaudeExtractor(client)({ restaurantName: "Chipotle" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("stream aborted");
  });
});

describe("createFakeExtractor", () => {
  it("resolves ok with the given menu", async () => {
    const extract = createFakeExtractor(menu);
    const result = await extract({ restaurantName: "Anything" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.menu).toEqual(menu);
    expect(result.sourceUrl).toBe(menu.source_url);
  });
});

describe("EXTRACT_SYSTEM_PROMPT", () => {
  it("contains no em dashes", () => {
    expect(EXTRACT_SYSTEM_PROMPT).not.toMatch(/\u2014/);
  });
});
