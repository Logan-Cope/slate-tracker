/**
 * Asks Claude to pull a restaurant chain's published nutrition facts from the
 * chain's own website, using the web_search and web_fetch server tools and a
 * structured (zod) output. Server-only: holds the API key and makes a long
 * network call. Never throws; every failure comes back as `{ ok: false }`.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractedMenuSchema, type ExtractedMenu } from "./validate";

export type ExtractInput = { restaurantName: string; sourceUrl?: string | null };

export type ExtractResult =
  | { ok: true; menu: ExtractedMenu; model: string; inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number; sourceUrl: string }
  | { ok: false; error: string; model: string; inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number };

/** Dollars for one extraction at Claude Opus 5 list prices (uncached $5/M, cache write $6.25/M, cache read $0.50/M, output $25/M). */
export function extractCostUsd(r: { inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number }): number {
  return (r.inputTokens * 5 + r.cacheCreationTokens * 6.25 + r.cacheReadTokens * 0.5 + r.outputTokens * 25) / 1e6;
}

export type Extractor = (input: ExtractInput) => Promise<ExtractResult>;

export const EXTRACT_MODEL = "claude-opus-5";

const MAX_TOKENS = 32000;
/** A server-tool turn can stop with pause_turn; resume at most this many times. */
const MAX_RESUMES = 5;

const BLOCKED_DOMAINS = ["myfitnesspal.com", "nutritionix.com", "fatsecret.com", "calorieking.com", "eatthismuch.com"];

export const EXTRACT_SYSTEM_PROMPT = `You are extracting the published nutrition facts for one restaurant chain.

Sources:
- Use the chain's own official website or its official nutrition PDF. If no URL is given, find it with web search.
- Never use third-party calorie sites. If the official source cannot be found or fetched, return an empty items list.

Coverage:
- Return the whole menu, every category: entrees, sandwiches, salads, sides, breakfast, kids, beverages, sauces and dressings, desserts. If the site has one nutrition index, fetch it; if it splits by category, fetch each category page. Never stop after one page.
- A chain of this kind usually publishes 60 to 400 items. If you have fewer than 30, you have not found the full menu yet.

Items:
- One item per orderable menu item, named exactly as the menu names it, never shortened ("Waffle Potato Fries", not "Waffle").
- When an item comes in sizes, emit one item per size with the size in the name, for example "Waffle Potato Fries (Medium)" and "Latte (Large)"; never emit a sized item without its size.
- Include dipping sauces, dressings, sides and build-your-own components (proteins, rice, beans, salsas, toppings) when the chain publishes them as their own line items; that is how bowls and salads get logged.
- Skip substitutions and "add X" modifiers that have no standalone nutrition line.

Numbers:
- Copy numbers exactly as published. No estimates, no rounding, no filling in gaps.
- When the chain's menu page and a separate nutrition document disagree, use the menu page's number for the default build; that is what a customer sees when ordering.
- Leave carbs_g, fat_g or fiber_g null when the source does not publish them.

Output fields:
- restaurant: the chain's proper name.
- source_url: the page or PDF the numbers came from.`;

function userMessage(input: ExtractInput): string {
  const lines = [`Restaurant: ${input.restaurantName}`];
  if (input.sourceUrl) lines.push(`Start from: ${input.sourceUrl}`);
  return lines.join("\n");
}

export function createClaudeExtractor(client: Anthropic = new Anthropic()): Extractor {
  return async (input) => {
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;
    const fail = (error: string): ExtractResult => ({ ok: false, error, model: EXTRACT_MODEL, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens });

    try {
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage(input) }];
      let message: Anthropic.Message | undefined;

      for (let attempt = 0; attempt <= MAX_RESUMES; attempt++) {
        const stream = client.messages.stream({
          model: EXTRACT_MODEL,
          max_tokens: MAX_TOKENS,
          system: EXTRACT_SYSTEM_PROMPT,
          // The fetched pages are re-read on every internal iteration; caching the prefix prices repeats at 10%.
          cache_control: { type: "ephemeral" },
          tools: [
            { type: "web_search_20260209", name: "web_search", max_uses: 3, blocked_domains: BLOCKED_DOMAINS },
            { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10, max_content_tokens: 60000 },
          ],
          output_config: { format: zodOutputFormat(ExtractedMenuSchema) },
          messages,
        });
        message = await stream.finalMessage();
        inputTokens += message.usage.input_tokens;
        outputTokens += message.usage.output_tokens;
        cacheCreationTokens += message.usage.cache_creation_input_tokens ?? 0;
        cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;

        if (message.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: message.content });
      }

      if (!message || message.stop_reason === "pause_turn") {
        return fail(`The model did not finish after ${MAX_RESUMES} resumes`);
      }
      if (message.stop_reason === "refusal") return fail("The model declined this request");

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (text.trim() === "") return fail("The model returned no text");

      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return fail("The model's reply was not valid JSON");
      }

      const parsed = ExtractedMenuSchema.safeParse(raw);
      if (!parsed.success) return fail(describeIssue(parsed.error.issues[0]));

      const menu = parsed.data;
      if (menu.items.length === 0) return fail(`No menu items found at ${menu.source_url || "the pages fetched"}`);

      return { ok: true, menu, model: EXTRACT_MODEL, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, sourceUrl: menu.source_url };
    } catch (error) {
      return fail(describeError(error));
    }
  };
}

export function createFakeExtractor(menu: ExtractedMenu, opts: { delayMs?: number } = {}): Extractor {
  return async () => {
    if (opts.delayMs) await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    return { ok: true, menu, model: EXTRACT_MODEL, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, sourceUrl: menu.source_url };
  };
}

function describeIssue(issue: { path: PropertyKey[]; message: string } | undefined): string {
  if (!issue) return "The menu did not match the expected shape";
  const path = issue.path.map(String).join(".");
  const where = path === "" ? "The menu" : path;
  return `${where}: ${issue.message}`.replace(/\s+/g, " ");
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return error.status ? `Claude API error ${error.status}: ${error.message}` : `Claude API error: ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
