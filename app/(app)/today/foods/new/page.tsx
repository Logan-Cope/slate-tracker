import { getActiveProfileId } from "@/lib/auth/session";
import { isDateString, todayLocal } from "@/lib/utils/date";
import { CustomFoodForm } from "@/components/nutrition/custom-food-form";
import { isMealSlot } from "@/components/nutrition/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

/** New custom food. `?upc=` comes from a failed barcode lookup, `?name=` from an empty search, `?label=1` opens the label camera. */
export default async function NewFoodPage({ searchParams }: { searchParams: SearchParams }) {
  await getActiveProfileId();
  const sp = await searchParams;
  const date = isDateString(sp.date) ? sp.date : todayLocal();
  const meal = isMealSlot(sp.meal) ? sp.meal : "snacks";
  return <CustomFoodForm mode="create" date={date} meal={meal} upc={str(sp.upc).replace(/\D/g, "").slice(0, 20)} name={str(sp.name).slice(0, 120)} scanLabel={sp.label === "1"} />;
}
