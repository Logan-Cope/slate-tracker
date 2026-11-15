import { notFound } from "next/navigation";
import { getActiveProfileId } from "@/lib/auth/session";
import { getFood } from "@/lib/db/queries/foods";
import { isDateString, todayLocal } from "@/lib/utils/date";
import { CustomFoodForm } from "@/components/nutrition/custom-food-form";
import { toFoodSummary } from "@/components/nutrition/serialize";
import { isMealSlot } from "@/components/nutrition/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Edit (or delete) one of the profile's own custom foods. */
export default async function EditFoodPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const profileId = await getActiveProfileId();
  const foodId = Number(id);
  const food = Number.isInteger(foodId) && foodId > 0 ? await getFood(profileId, foodId) : null;
  if (!food || food.source !== "custom" || food.profileId !== profileId || food.isMeal) notFound();

  const date = isDateString(sp.date) ? sp.date : todayLocal();
  const meal = isMealSlot(sp.meal) ? sp.meal : "snacks";
  return <CustomFoodForm mode="edit" date={date} meal={meal} food={toFoodSummary(food, profileId)} />;
}
