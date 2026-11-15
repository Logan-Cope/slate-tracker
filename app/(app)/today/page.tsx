import type { Metadata } from "next";
import { getActiveProfileId } from "@/lib/auth/session";
import { getDiaryScreen, MEALS } from "@/lib/db/queries/nutrition";
import { isDateString, todayLocal } from "@/lib/utils/date";
import { DiaryView } from "@/components/nutrition/diary-view";
import { toDiaryDto, toFoodSummary } from "@/components/nutrition/serialize";
import type { FoodSummary, MealSlot } from "@/components/nutrition/types";

export const metadata: Metadata = { title: "Today" };

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The diary for one day. `?date=YYYY-MM-DD` picks the day; the phone's today is the default. */
export default async function TodayPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const requested = isDateString(sp.date) ? sp.date : null;
  const serverToday = todayLocal();
  const date = requested ?? serverToday;
  const profileId = await getActiveProfileId();

  const { diary, foods: foodsById, yesterdayMeals } = await getDiaryScreen(profileId, date);

  const foods: Record<number, FoodSummary> = {};
  for (const [id, food] of foodsById) foods[id] = toFoodSummary(food, profileId);
  const yesterdayHas = Object.fromEntries(MEALS.map((m) => [m, yesterdayMeals.has(m)])) as Record<MealSlot, boolean>;

  return (
    <DiaryView diary={toDiaryDto(diary)} foods={foods} yesterdayHas={yesterdayHas} serverToday={serverToday} dateFromUrl={requested !== null} />
  );
}
