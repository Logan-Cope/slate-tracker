"use server";

/**
 * Diary and catalogue mutations. Each action validates its input, resolves the
 * active profile, runs the query and revalidates the diary. Ids for new log
 * rows come from the client so a retried action is a no-op.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProfileId } from "@/lib/auth/session";
import {
  copyDay,
  copyEntries,
  copyMeal,
  deleteLogEntries,
  deleteLogEntry,
  explodeMealEntry,
  logFood,
  quickAdd,
  updateLogEntry,
} from "@/lib/db/queries/nutrition";
import {
  createCustomFood,
  createSavedMeal,
  deleteCustomFood,
  deleteSavedMeal,
  updateCustomFood,
  updateSavedMeal,
} from "@/lib/db/queries/foods";
import { isDateString } from "@/lib/utils/date";
import { toEntryDto } from "@/components/nutrition/serialize";
import type { EntryDto } from "@/components/nutrition/types";

const dateSchema = z.string().refine(isDateString, "Expected YYYY-MM-DD");
const mealSchema = z.enum(["breakfast", "lunch", "dinner", "snacks"]);
const entryIdSchema = z.uuid();
const foodIdSchema = z.int().positive();
const qtySchema = z.number().positive().max(100_000);
const unitSchema = z.string().trim().min(1).max(80);
const nonNegative = z.number().min(0).max(100_000);
const optionalNonNegative = nonNegative.nullable().optional();

function refresh() {
  revalidatePath("/today");
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/** Undo after a delete sends the original time back so the row returns to its place in the meal. */
const loggedAtSchema = z.iso.datetime().optional();

const logFoodSchema = z.object({
  id: entryIdSchema,
  date: dateSchema,
  meal: mealSchema,
  foodId: foodIdSchema,
  qty: qtySchema,
  unit: unitSchema,
  loggedAt: loggedAtSchema,
  /** Undo after a delete: the row goes back without counting as a fresh log. */
  restore: z.boolean().optional(),
});

export async function logFoodAction(raw: z.input<typeof logFoodSchema>): Promise<EntryDto> {
  const { loggedAt, ...input } = logFoodSchema.parse(raw);
  const profileId = await getActiveProfileId();
  const row = await logFood(profileId, { ...input, loggedAt: loggedAt ? new Date(loggedAt) : undefined });
  refresh();
  return toEntryDto(row);
}

const quickAddSchema = z.object({
  id: entryIdSchema,
  date: dateSchema,
  meal: mealSchema,
  kcal: nonNegative,
  proteinG: nonNegative.optional(),
  name: z.string().trim().max(120).optional(),
  loggedAt: loggedAtSchema,
  // Snapshot fields, sent when undo puts back an entry whose food is gone.
  brand: z.string().trim().max(120).nullable().optional(),
  qty: qtySchema.optional(),
  unit: unitSchema.optional(),
  grams: z.number().positive().max(100_000).nullable().optional(),
  carbsG: optionalNonNegative,
  fatG: optionalNonNegative,
});

export async function quickAddAction(raw: z.input<typeof quickAddSchema>): Promise<EntryDto> {
  const { loggedAt, ...input } = quickAddSchema.parse(raw);
  const profileId = await getActiveProfileId();
  const row = await quickAdd(profileId, { ...input, loggedAt: loggedAt ? new Date(loggedAt) : undefined });
  refresh();
  return toEntryDto(row);
}

const updateEntrySchema = z.object({
  id: entryIdSchema,
  qty: qtySchema.optional(),
  unit: unitSchema.optional(),
  meal: mealSchema.optional(),
  date: dateSchema.optional(),
  kcal: nonNegative.optional(),
  proteinG: nonNegative.optional(),
  name: z.string().trim().max(120).optional(),
});

export async function updateEntryAction(raw: z.input<typeof updateEntrySchema>): Promise<EntryDto> {
  const { id, ...patch } = updateEntrySchema.parse(raw);
  const profileId = await getActiveProfileId();
  const row = await updateLogEntry(profileId, id, patch);
  refresh();
  return toEntryDto(row);
}

export async function deleteEntryAction(raw: { id: string }): Promise<{ ok: boolean }> {
  const { id } = z.object({ id: entryIdSchema }).parse(raw);
  const profileId = await getActiveProfileId();
  const ok = await deleteLogEntry(profileId, id);
  refresh();
  return { ok };
}

const deleteEntriesSchema = z.object({ ids: z.array(entryIdSchema).min(1).max(200) });

/** Edit mode's Delete. Returns how many rows went, so a stale selection shows as fewer than asked. */
export async function deleteEntriesAction(raw: z.input<typeof deleteEntriesSchema>): Promise<{ deleted: number }> {
  const { ids } = deleteEntriesSchema.parse(raw);
  const profileId = await getActiveProfileId();
  const deleted = await deleteLogEntries(profileId, ids);
  refresh();
  return { deleted };
}

export async function explodeEntryAction(raw: { id: string }): Promise<EntryDto[]> {
  const { id } = z.object({ id: entryIdSchema }).parse(raw);
  const profileId = await getActiveProfileId();
  const rows = await explodeMealEntry(profileId, id);
  refresh();
  return rows.map(toEntryDto);
}

// ---------------------------------------------------------------------------
// Copying
// ---------------------------------------------------------------------------

const copyEntriesSchema = z.object({
  ids: z.array(entryIdSchema).min(1).max(200),
  toDate: dateSchema,
  toMeal: mealSchema.optional(),
  newIds: z.array(entryIdSchema).max(200).optional(),
});

export async function copyEntriesAction(raw: z.input<typeof copyEntriesSchema>): Promise<EntryDto[]> {
  const input = copyEntriesSchema.parse(raw);
  const profileId = await getActiveProfileId();
  const rows = await copyEntries(profileId, input);
  refresh();
  return rows.map(toEntryDto);
}

const copyMealSchema = z.object({ fromDate: dateSchema, meal: mealSchema, toDate: dateSchema, toMeal: mealSchema.optional() });

export async function copyMealAction(raw: z.input<typeof copyMealSchema>): Promise<EntryDto[]> {
  const input = copyMealSchema.parse(raw);
  const profileId = await getActiveProfileId();
  const rows = await copyMeal(profileId, input);
  refresh();
  return rows.map(toEntryDto);
}

const copyDaySchema = z.object({ fromDate: dateSchema, toDate: dateSchema });

export async function copyDayAction(raw: z.input<typeof copyDaySchema>): Promise<EntryDto[]> {
  const input = copyDaySchema.parse(raw);
  if (input.fromDate === input.toDate) return [];
  const profileId = await getActiveProfileId();
  const rows = await copyDay(profileId, input);
  refresh();
  return rows.map(toEntryDto);
}

// ---------------------------------------------------------------------------
// Custom foods
// ---------------------------------------------------------------------------

const customFoodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(120).nullable().optional(),
  servingLabel: z.string().trim().min(1).max(80),
  servingGrams: z.number().positive().max(100_000).nullable().optional(),
  kcal: nonNegative,
  proteinG: nonNegative,
  carbsG: optionalNonNegative,
  fatG: optionalNonNegative,
  fiberG: optionalNonNegative,
  upc: z.string().trim().max(20).nullable().optional(),
});

export async function createCustomFoodAction(raw: z.input<typeof customFoodSchema>): Promise<{ id: number }> {
  const input = customFoodSchema.parse(raw);
  const profileId = await getActiveProfileId();
  const food = await createCustomFood(profileId, input);
  refresh();
  return { id: food.id };
}

export async function updateCustomFoodAction(raw: z.input<typeof customFoodSchema> & { id: number }): Promise<{ id: number }> {
  const { id, ...input } = customFoodSchema.extend({ id: foodIdSchema }).parse(raw);
  const profileId = await getActiveProfileId();
  const food = await updateCustomFood(profileId, id, input);
  refresh();
  return { id: food.id };
}

export async function deleteCustomFoodAction(raw: { id: number }): Promise<{ ok: boolean }> {
  const { id } = z.object({ id: foodIdSchema }).parse(raw);
  const profileId = await getActiveProfileId();
  const ok = await deleteCustomFood(profileId, id);
  refresh();
  return { ok };
}

// ---------------------------------------------------------------------------
// Saved meals
// ---------------------------------------------------------------------------

const savedMealSchema = z.object({
  name: z.string().trim().min(1).max(120),
  items: z.array(z.object({ foodId: foodIdSchema, qty: qtySchema, unit: unitSchema })).min(1).max(60),
});

export async function createSavedMealAction(raw: z.input<typeof savedMealSchema>): Promise<{ id: number }> {
  const input = savedMealSchema.parse(raw);
  const profileId = await getActiveProfileId();
  const meal = await createSavedMeal(profileId, input.name, input.items);
  refresh();
  return { id: meal.id };
}

export async function updateSavedMealAction(raw: z.input<typeof savedMealSchema> & { id: number }): Promise<{ id: number }> {
  const { id, ...input } = savedMealSchema.extend({ id: foodIdSchema }).parse(raw);
  const profileId = await getActiveProfileId();
  const meal = await updateSavedMeal(profileId, id, input.name, input.items);
  refresh();
  return { id: meal.id };
}

export async function deleteSavedMealAction(raw: { id: number }): Promise<{ ok: boolean }> {
  const { id } = z.object({ id: foodIdSchema }).parse(raw);
  const profileId = await getActiveProfileId();
  const ok = await deleteSavedMeal(profileId, id);
  refresh();
  return { ok };
}
