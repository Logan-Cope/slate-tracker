/**
 * Picks the menu extractor for the running environment. Under E2E=1, and in
 * demo mode without an API key, a fixed menu stands in for the Claude call so
 * nothing touches the network; otherwise the real extractor is used.
 */
import { isDemo } from "@/lib/demo/mode";
import { createClaudeExtractor, createFakeExtractor, type Extractor } from "./extract";
import type { ExtractedMenu } from "./validate";

export const FAKE_MENU: ExtractedMenu = {
  restaurant: "Chipotle",
  source_url: "https://www.chipotle.com/nutrition-calculator",
  items: [
    { name: "Chicken", serving: "1 serving", kcal: 180, protein_g: 32, carbs_g: 0, fat_g: 7, fiber_g: 0 },
    { name: "Cilantro-Lime White Rice", serving: "1 serving", kcal: 210, protein_g: 4, carbs_g: 40, fat_g: 4, fiber_g: 1 },
    { name: "Black Beans", serving: "1 serving", kcal: 130, protein_g: 8, carbs_g: 22, fat_g: 2, fiber_g: 7 },
    { name: "Guacamole", serving: "1 serving", kcal: 230, protein_g: 2, carbs_g: 8, fat_g: 22, fiber_g: 6 },
    { name: "Tortilla", serving: "1 serving", kcal: 320, protein_g: 8, carbs_g: 50, fat_g: 9, fiber_g: 2 },
  ],
};

export function getExtractor(): Extractor {
  if (process.env.E2E === "1" || (isDemo() && !process.env.ANTHROPIC_API_KEY)) return createFakeExtractor(FAKE_MENU);
  return createClaudeExtractor();
}
