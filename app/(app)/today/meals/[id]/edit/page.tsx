import { notFound } from "next/navigation";
import { getActiveProfileId } from "@/lib/auth/session";
import { getSavedMeal } from "@/lib/db/queries/foods";
import { isDateString, todayLocal } from "@/lib/utils/date";
import { SavedMealBuilder } from "@/components/nutrition/saved-meal-builder";
import { toSavedMealDto } from "@/components/nutrition/serialize";
import { isMealSlot } from "@/components/nutrition/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EditMealPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const profileId = await getActiveProfileId();
  const mealId = Number(id);
  const savedMeal = Number.isInteger(mealId) && mealId > 0 ? await getSavedMeal(profileId, mealId) : null;
  if (!savedMeal) notFound();

  const date = isDateString(sp.date) ? sp.date : todayLocal();
  const meal = isMealSlot(sp.meal) ? sp.meal : "snacks";
  return <SavedMealBuilder mode="edit" date={date} meal={meal} savedMeal={toSavedMealDto(savedMeal, profileId)} />;
}
