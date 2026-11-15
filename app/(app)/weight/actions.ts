"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProfileId } from "@/lib/auth/session";
import { deleteMeasurement, upsertWeighIn } from "@/lib/db/queries/metrics";
import { isDateString, shiftDate, todayLocal } from "@/lib/utils/date";

const weighInSchema = z.object({
  id: z.uuid(),
  date: z
    .string()
    .refine(isDateString, "date must be YYYY-MM-DD")
    // A weigh-in belongs to a recent day: nothing older than two years, nothing past tomorrow.
    .refine((d) => d >= shiftDate(todayLocal(), -730) && d <= shiftDate(todayLocal(), 1), "date out of range"),
  value: z.number().finite().positive(),
});

export type SaveWeighInResult = { ok: true; date: string; value: number } | { ok: false; error: string };

export async function saveWeighIn(input: z.input<typeof weighInSchema>): Promise<SaveWeighInResult> {
  const parsed = weighInSchema.safeParse(input);
  if (!parsed.success) {
    const onDate = parsed.error.issues.some((i) => i.path[0] === "date");
    return { ok: false, error: onDate ? "Enter a day within the last two years." : "Enter a weight like 131.4" };
  }
  const profileId = await getActiveProfileId();
  try {
    const row = await upsertWeighIn(profileId, parsed.data);
    revalidatePath("/weight");
    revalidatePath("/coach");
    return { ok: true, date: row.date, value: row.value };
  } catch (err) {
    // RangeErrors are our own validation messages; anything else stays generic.
    return { ok: false, error: err instanceof RangeError ? err.message : "Could not save. Check your connection and try again." };
  }
}

/** Removes one weigh-in. ok is false when no such row belongs to this profile. */
export async function removeWeighIn(id: string): Promise<{ ok: boolean }> {
  const profileId = await getActiveProfileId();
  if (!z.uuid().safeParse(id).success) return { ok: false };
  const ok = await deleteMeasurement(profileId, id);
  revalidatePath("/weight");
  revalidatePath("/coach");
  return { ok };
}
