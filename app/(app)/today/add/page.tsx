import { getActiveProfileId } from "@/lib/auth/session";
import { getFood, getFoods, listCustomFoods, listSavedMeals } from "@/lib/db/queries/foods";
import { getDiary, lastUsed } from "@/lib/db/queries/nutrition";
import { isDateString, todayLocal } from "@/lib/utils/date";
import { AddFoodScreen, type AddTab } from "@/components/nutrition/add-food-screen";
import { toFoodSummary, toTargetDto } from "@/components/nutrition/serialize";
import { isMealSlot, type FoodSummary } from "@/components/nutrition/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Add Food: search with inline quantities, go-tos, recents, own foods and meals, quick add, scan. */
export default async function AddFoodPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const serverToday = todayLocal();
  const date = isDateString(sp.date) ? sp.date : serverToday;
  const meal = isMealSlot(sp.meal) ? sp.meal : "snacks";
  const tab: AddTab = str(sp.tab) === "meals" ? "meals" : "my-foods";
  const foodParam = Number(str(sp.food));
  const wantFood = Number.isInteger(foodParam) && foodParam > 0 ? foodParam : null;
  const profileId = await getActiveProfileId();

  const [diary, customFoods, savedMeals, initial] = await Promise.all([
    getDiary(profileId, date),
    listCustomFoods(profileId),
    listSavedMeals(profileId),
    wantFood ? getFood(profileId, wantFood) : Promise.resolve(null),
  ]);

  const ownIds = [...customFoods.map((f) => f.id), ...savedMeals.map((m) => m.id)];
  const ids = initial ? [...ownIds, initial.id] : ownIds;
  const [withServings, last] = await Promise.all([getFoods(profileId, ids), lastUsed(profileId, ids)]);

  const summarize = (id: number): FoodSummary | null => {
    const food = withServings.get(id);
    return food ? toFoodSummary(food, profileId, last.get(id) ?? null) : null;
  };
  const myFoods = customFoods.flatMap((f) => summarize(f.id) ?? []);
  const meals = savedMeals.flatMap((m) => summarize(m.id) ?? []);
  const initialFood = initial ? toFoodSummary(initial, profileId, last.get(initial.id) ?? null) : null;

  return (
    <AddFoodScreen
      key={`${date}:${meal}`}
      date={date}
      meal={meal}
      serverToday={serverToday}
      dayTotals={diary.totals}
      target={toTargetDto(diary.target)}
      myFoods={myFoods}
      meals={meals}
      initialFood={initialFood}
      initialTab={tab}
    />
  );
}
