import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { AVERY, setupTestDb } from "./helpers/db";
import type { Database } from "@/lib/db/client";
import { foods } from "@/lib/db/schema";
import { getCoachSummary } from "@/lib/db/queries/coach";
import { logFood } from "@/lib/db/queries/nutrition";
import { upsertWeighIn } from "@/lib/db/queries/metrics";
import { getActiveProgram, upsertWorkout, type WorkoutDraft } from "@/lib/db/queries/training";
import { shiftDate } from "@/lib/utils/date";

let close: () => Promise<void>;
let db: Database;
const TODAY = "2026-10-13";

beforeAll(async () => {
  ({ db, close } = await setupTestDb({ foods: true }));
});
afterAll(() => close());

describe("coach summary", () => {
  it("is empty but well-formed before any logging", async () => {
    const s = await getCoachSummary(AVERY, TODAY);
    expect(s.days).toHaveLength(7);
    expect(s.days[6]!.date).toBe(TODAY);
    expect(s.daysLogged).toBe(0);
    expect(s.avgKcal).toBeNull();
    expect(s.weight.trend).toBeNull();
    expect(s.training.last7).toBe(0);
    expect(s.target?.kcal).toBe(1500);
  });

  it("aggregates food days, protein hits, weight trend and finished workouts", async () => {
    const chicken = (await db.select({ id: foods.id }).from(foods).where(eq(foods.name, "Chicken breast, cooked, roasted")))[0]!.id;
    // 400 g chicken = 660 kcal, 124 g protein (hits the 100 g target); yesterday 100 g (misses).
    await logFood(AVERY, { id: "eeeeeeee-0000-4000-8000-000000000001", date: TODAY, meal: "lunch", foodId: chicken, qty: 400, unit: "g" });
    await logFood(AVERY, { id: "eeeeeeee-0000-4000-8000-000000000002", date: shiftDate(TODAY, -1), meal: "lunch", foodId: chicken, qty: 100, unit: "g" });
    await upsertWeighIn(AVERY, { id: "eeeeeeee-0000-4000-8000-000000000003", date: shiftDate(TODAY, -2), value: 132 });
    await upsertWeighIn(AVERY, { id: "eeeeeeee-0000-4000-8000-000000000004", date: TODAY, value: 131 });

    const program = await getActiveProgram(AVERY);
    const routine = program!.routines[0]!;
    const draft: WorkoutDraft = {
      id: "eeeeeeee-0000-4000-8000-000000000005",
      profileId: AVERY,
      routineId: routine.id,
      title: routine.name,
      startedAt: new Date(`${shiftDate(TODAY, -3)}T17:00:00`),
      finishedAt: new Date(`${shiftDate(TODAY, -3)}T17:40:00`),
      notes: null,
      exercises: [
        {
          id: "eeeeeeee-0000-4000-8000-000000000006",
          exerciseId: routine.exercises[0]!.exerciseId,
          position: 0,
          supersetGroup: null,
          notes: null,
          sets: [{ id: "eeeeeeee-0000-4000-8000-000000000007", position: 0, setType: "normal", weightLb: 105, reps: 12, rpe: null, completedAt: new Date(), isPr: true }],
        },
      ],
    };
    await upsertWorkout(draft);
    // An unfinished workout must not count.
    await upsertWorkout({ ...draft, id: "eeeeeeee-0000-4000-8000-000000000008", finishedAt: null, exercises: [] });

    const s = await getCoachSummary(AVERY, TODAY);
    expect(s.daysLogged).toBe(2);
    expect(s.proteinHitDays).toBe(1);
    expect(s.avgKcal).toBeCloseTo((660 + 165) / 2, 3);
    expect(s.days[6]!.kcal).toBeCloseTo(660, 3);
    expect(s.weight.count).toBe(2);
    expect(s.weight.latest?.value).toBe(131);
    expect(s.weight.trend).not.toBeNull();
    expect(s.training.last7).toBe(1);
    expect(s.training.last30).toBe(1);
    expect(s.training.lastWorkout?.prCount).toBe(1);
  });
});
