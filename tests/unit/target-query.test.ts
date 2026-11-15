import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers/db";
import { measure } from "./helpers/query-trace";
import type { Database } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { getTargetFor, setTarget } from "@/lib/db/queries/targets";

let db: Database;
let close: () => Promise<void>;
const D = "2026-06-15";

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(() => close());

async function profileWith(targets: { effectiveFrom: string; kcal: number }[]): Promise<number> {
  const [p] = await db.insert(profiles).values({ name: "Target test" }).returning();
  for (const t of targets) await setTarget(p!.id, { kcal: t.kcal, proteinG: 100, effectiveFrom: t.effectiveFrom });
  return p!.id;
}

describe("getTargetFor", () => {
  it("returns the latest target effective on or before the date", async () => {
    const id = await profileWith([
      { effectiveFrom: "2026-06-01", kcal: 1600 },
      { effectiveFrom: "2026-06-12", kcal: 1500 },
      { effectiveFrom: "2026-06-20", kcal: 1400 },
    ]);
    expect((await getTargetFor(id, D))?.kcal).toBe(1500);
    expect((await getTargetFor(id, "2026-06-12"))?.kcal).toBe(1500);
    expect((await getTargetFor(id, "2026-06-05"))?.kcal).toBe(1600);
    expect((await getTargetFor(id, "2026-07-01"))?.kcal).toBe(1400);
  });

  it("falls back to the earliest target when none is in force yet", async () => {
    const id = await profileWith([
      { effectiveFrom: "2026-06-25", kcal: 1450 },
      { effectiveFrom: "2026-06-20", kcal: 1550 },
    ]);
    expect((await getTargetFor(id, D))?.kcal).toBe(1550);
  });

  it("returns null for a profile with no targets", async () => {
    const id = await profileWith([]);
    expect(await getTargetFor(id, D)).toBeNull();
  });

  it("breaks a same-day tie in favour of the newest row", async () => {
    const id = await profileWith([
      { effectiveFrom: "2026-06-10", kcal: 1700 },
      { effectiveFrom: "2026-06-10", kcal: 1650 },
    ]);
    expect((await getTargetFor(id, D))?.kcal).toBe(1650);
  });

  it("costs one query, whether a target is in force or only a future one exists", async () => {
    const past = await profileWith([{ effectiveFrom: "2026-06-01", kcal: 1600 }]);
    const future = await profileWith([{ effectiveFrom: "2026-07-01", kcal: 1600 }]);
    expect((await measure(() => getTargetFor(past, D))).queries).toBe(1);
    expect((await measure(() => getTargetFor(future, D))).queries).toBe(1);
  });
});
