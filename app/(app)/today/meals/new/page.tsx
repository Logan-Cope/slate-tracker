import { getActiveProfileId } from "@/lib/auth/session";
import { isDateString, todayLocal } from "@/lib/utils/date";
import { SavedMealBuilder } from "@/components/nutrition/saved-meal-builder";
import { isMealSlot } from "@/components/nutrition/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewMealPage({ searchParams }: { searchParams: SearchParams }) {
  await getActiveProfileId();
  const sp = await searchParams;
  const date = isDateString(sp.date) ? sp.date : todayLocal();
  const meal = isMealSlot(sp.meal) ? sp.meal : "snacks";
  return <SavedMealBuilder mode="create" date={date} meal={meal} />;
}
