import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db/client";
import { defineRead, runRead, type Read } from "@/lib/db/batch";
import { measurements, type Measurement } from "@/lib/db/schema";

type Metric = Measurement["metric"];

const LIMITS: Record<Metric, { min: number; max: number; unit: string; label: string }> = {
  weight: { min: 50, max: 700, unit: "lb", label: "weight" },
  waist: { min: 15, max: 80, unit: "in", label: "waist" },
  hips: { min: 15, max: 90, unit: "in", label: "hip measurement" },
  body_fat: { min: 2, max: 70, unit: "%", label: "body fat" },
  steps: { min: 0, max: 100_000, unit: "steps", label: "step count" },
  sleep_h: { min: 0, max: 24, unit: "h", label: "sleep" },
};

/** The sentence a reading outside its range gets; shown as is under the field. */
export function rangeMessage(metric: Metric): string {
  const { min, max, unit, label } = LIMITS[metric];
  return `Enter a ${label} between ${min} and ${max} ${unit}`;
}

export type WeighInInput = {
  id: string;
  date: string;
  value: number;
  metric?: Metric;
  unit?: string;
  measuredAt?: Date;
  note?: string | null;
};

/**
 * One reading per metric per day. A new reading for an existing day replaces
 * it; retrying with the same id is a no-op.
 */
export async function upsertWeighIn(profileId: number, input: WeighInInput): Promise<Measurement> {
  const metric = input.metric ?? "weight";
  const limits = LIMITS[metric];
  if (!Number.isFinite(input.value) || input.value < limits.min || input.value > limits.max) {
    throw new RangeError(rangeMessage(metric));
  }
  const db = await getDb();
  const existing = await db
    .select()
    .from(measurements)
    .where(and(eq(measurements.profileId, profileId), eq(measurements.metric, metric), eq(measurements.date, input.date)))
    .limit(1);
  const current = existing[0];
  if (current) {
    if (current.id === input.id && current.value === input.value) return current;
    const [updated] = await db
      .update(measurements)
      .set({ value: input.value, measuredAt: input.measuredAt ?? new Date(), note: input.note ?? current.note })
      .where(eq(measurements.id, current.id))
      .returning();
    return updated!;
  }
  const [row] = await db
    .insert(measurements)
    .values({
      id: input.id,
      profileId,
      metric,
      value: input.value,
      unit: input.unit ?? limits.unit,
      date: input.date,
      measuredAt: input.measuredAt ?? new Date(),
      note: input.note ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const again = await db
    .select()
    .from(measurements)
    .where(and(eq(measurements.id, input.id), eq(measurements.profileId, profileId)))
    .limit(1);
  if (!again[0]) throw new Error("That id belongs to another profile");
  return again[0];
}

type MeasurementRange = { from?: string; to?: string; limit?: number };

export async function listMeasurements(profileId: number, metric: Metric, opts: MeasurementRange = {}): Promise<Measurement[]> {
  const db = await getDb();
  return runRead(db, measurementsRead(db, profileId, metric, opts));
}

/** Oldest first. */
export function measurementsRead(db: Database, profileId: number, metric: Metric, opts: MeasurementRange = {}): Read<Measurement[]> {
  const conds = [eq(measurements.profileId, profileId), eq(measurements.metric, metric)];
  if (opts.from) conds.push(gte(measurements.date, opts.from));
  if (opts.to) conds.push(lte(measurements.date, opts.to));
  const q = db
    .select()
    .from(measurements)
    .where(and(...conds))
    .orderBy(asc(measurements.date))
    .$dynamic();
  return defineRead([opts.limit ? q.limit(opts.limit) : q], ([rows]) => rows);
}

export async function latestMeasurement(profileId: number, metric: Metric): Promise<Measurement | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(measurements)
    .where(and(eq(measurements.profileId, profileId), eq(measurements.metric, metric)))
    .orderBy(desc(measurements.date))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteMeasurement(profileId: number, id: string): Promise<boolean> {
  const db = await getDb();
  const deleted = await db
    .delete(measurements)
    .where(and(eq(measurements.id, id), eq(measurements.profileId, profileId)))
    .returning();
  return deleted.length > 0;
}
