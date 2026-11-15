"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/auth/session";
import { applyDraft, createDraft, hasDraftInFlight } from "@/lib/db/queries/restaurant-drafts";
import { getExtractor } from "@/lib/restaurants/extractor-for-env";
import { extractCostUsd } from "@/lib/restaurants/extract";
import { validateMenu } from "@/lib/restaurants/validate";

export type FindState = { error?: string };

const NAME_MIN = 2;
const NAME_MAX = 60;

/** The extractor and validator report what went wrong; the screen adds what to do about it. */
function withNextStep(error: string): string {
  return `${error.replace(/\.+$/, "")}. Try again, or give the nutrition page's address.`;
}

/** Reads a chain's menu and parks it as a draft for review. Redirects to the draft on success. */
export async function findMenuAction(_prev: FindState, formData: FormData): Promise<FindState> {
  const user = await requireCoach();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return { error: "Enter a restaurant name" };
  const url = String(formData.get("url") ?? "").trim();
  const sourceUrl = url === "" ? null : url;

  if (await hasDraftInFlight(user.id)) return { error: "A menu is already being read. Try again in a few minutes." };

  const extracted = await getExtractor()({ restaurantName: name, sourceUrl });
  if (!extracted.ok) return { error: withNextStep(extracted.error) };

  const restaurantName = extracted.menu.restaurant.trim() || name;
  const validated = validateMenu(extracted.menu, { restaurantName });
  if (!validated.ok) return { error: withNextStep(validated.error) };

  const draft = await createDraft({
    id: crypto.randomUUID(),
    restaurantName,
    sourceUrl: extracted.sourceUrl || sourceUrl,
    items: validated.items,
    warnings: validated.warnings,
    model: extracted.model,
    inputTokens: extracted.inputTokens,
    outputTokens: extracted.outputTokens,
    createdBy: user.id,
  });
  console.log(
    `restaurant extract ${name}: ${validated.items.length} items, ${extracted.inputTokens} in / ${extracted.cacheCreationTokens} cache write / ${extracted.cacheReadTokens} cache read / ${extracted.outputTokens} out tokens, about $${extractCostUsd(extracted).toFixed(2)}`,
  );
  redirect(`/coach/restaurants/${draft.id}`);
}

export async function applyDraftAction(draftId: string): Promise<void> {
  await requireCoach();
  const result = await applyDraft(draftId);
  if (!result.ok) redirect(`/coach/restaurants/${draftId}?error=${result.error}`);
  revalidatePath("/coach");
  revalidatePath("/today/add");
  redirect("/coach");
}

/** Drafts expire on their own; discarding only leaves the review page. */
export async function discardDraftAction(): Promise<void> {
  await requireCoach();
  redirect("/coach");
}
