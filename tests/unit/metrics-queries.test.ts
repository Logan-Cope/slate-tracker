import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AVERY, setupTestDb } from "./helpers/db";
import {
  deleteMeasurement,
  latestMeasurement,
  listMeasurements,
  rangeMessage,
  upsertWeighIn,
} from "@/lib/db/queries/metrics";

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await setupTestDb());
});
afterAll(() => close());

describe("weigh-ins", () => {
  it("inserts a weigh-in and reads it back", async () => {
    const row = await upsertWeighIn(AVERY, { id: "11111111-1111-4111-8111-111111111111", date: "2026-10-01", value: 131.4 });
    expect(row.value).toBeCloseTo(131.4);
    expect(row.unit).toBe("lb");
    const list = await listMeasurements(AVERY, "weight");
    expect(list).toHaveLength(1);
  });

  it("a second weigh-in on the same date replaces the first (one reading per day)", async () => {
    await upsertWeighIn(AVERY, { id: "22222222-2222-4222-8222-222222222222", date: "2026-10-01", value: 130.9 });
    const list = await listMeasurements(AVERY, "weight");
    expect(list).toHaveLength(1);
    expect(list[0]!.value).toBeCloseTo(130.9);
  });

  it("retrying with the same id is a no-op", async () => {
    await upsertWeighIn(AVERY, { id: "22222222-2222-4222-8222-222222222222", date: "2026-10-01", value: 130.9 });
    expect(await listMeasurements(AVERY, "weight")).toHaveLength(1);
  });

  it("lists ascending by date within a range and reports the latest", async () => {
    await upsertWeighIn(AVERY, { id: "33333333-3333-4333-8333-333333333333", date: "2026-09-28", value: 132.2 });
    await upsertWeighIn(AVERY, { id: "44444444-4444-4444-8444-444444444444", date: "2026-10-03", value: 130.1 });
    const all = await listMeasurements(AVERY, "weight");
    expect(all.map((m) => m.date)).toEqual(["2026-09-28", "2026-10-01", "2026-10-03"]);
    const ranged = await listMeasurements(AVERY, "weight", { from: "2026-10-01" });
    expect(ranged.map((m) => m.date)).toEqual(["2026-10-01", "2026-10-03"]);
    const latest = await latestMeasurement(AVERY, "weight");
    expect(latest?.date).toBe("2026-10-03");
  });

  it("rejects nonsense values with a sentence that says what to enter, in the unit she sees", async () => {
    await expect(upsertWeighIn(AVERY, { id: "55555555-5555-4555-8555-555555555555", date: "2026-10-04", value: 0 })).rejects.toThrow("Enter a weight between 50 and 700 lb");
    await expect(upsertWeighIn(AVERY, { id: "55555555-5555-4555-8555-555555555555", date: "2026-10-04", value: 2000 })).rejects.toThrow(RangeError);
    expect(rangeMessage("body_fat")).toBe("Enter a body fat between 2 and 70 %");
  });

  it("deletes only the owner's measurement", async () => {
    const ok = await deleteMeasurement(AVERY, "44444444-4444-4444-8444-444444444444");
    expect(ok).toBe(true);
    const nope = await deleteMeasurement(999, "33333333-3333-4333-8333-333333333333");
    expect(nope).toBe(false);
    expect(await listMeasurements(AVERY, "weight")).toHaveLength(2);
  });
});
