/**
 * lib/db/batch.ts: reads sent to Neon in one HTTPS request. On a driver with
 * db.batch (neon-http) every query of a render goes in one call; on PGlite,
 * which has none, the same queries run as before and give the same results.
 */
import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { AVERY, setupTestDb } from "./helpers/db";
import { measure } from "./helpers/query-trace";
import type { Database } from "@/lib/db/client";
import { profiles, programs, targets, type Profile } from "@/lib/db/schema";
import { batchReads, combineReads, constRead, defineRead, readAll, runRead } from "@/lib/db/batch";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(() => close());

/** The PGlite handle with a batch method, the way neon-http has one. */
function withBatch(base: Database) {
  const batch = vi.fn(async (queries: readonly PromiseLike<unknown>[]) => Promise.all(queries));
  return { db: Object.assign(Object.create(base) as Database, { batch }), batch };
}

const profilesQ = (d: Database) => d.select().from(profiles).orderBy(asc(profiles.id));
const targetsQ = (d: Database) => d.select({ kcal: targets.kcal }).from(targets).where(eq(targets.profileId, AVERY));
const countQ = (d: Database) => d.execute(sql`select count(*)::int as n from programs`);

describe("batchReads", () => {
  it("returns each query's own result, in order, on a driver without batch", async () => {
    const [ps, ts, raw] = await batchReads(db, [profilesQ(db), targetsQ(db), countQ(db)]);
    expect(ps).toEqual(await profilesQ(db));
    expect(ts).toEqual(await targetsQ(db));
    expect((raw as unknown as { rows: { n: number }[] }).rows[0]!.n).toBeGreaterThan(0);
    // Typed tuple: each slot keeps its own row type (checked by tsc).
    expectTypeOf(ps).toEqualTypeOf<Profile[]>();
    expectTypeOf(ts).toEqualTypeOf<{ kcal: number }[]>();
    expect(ps[0]!.name).toBe("Avery");
  });

  it("sends every query in one batch call when the driver has one", async () => {
    const { db: b, batch } = withBatch(db);
    const [ps, ts] = await batchReads(b, [profilesQ(b), targetsQ(b)]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]![0]).toHaveLength(2);
    expect(ps).toEqual(await profilesQ(db));
    expect(ts).toEqual(await targetsQ(db));
  });

  it("sends a single query on its own, without a batch", async () => {
    const { db: b, batch } = withBatch(db);
    const [ps] = await batchReads(b, [profilesQ(b)]);
    expect(batch).not.toHaveBeenCalled();
    expect(ps).toEqual(await profilesQ(db));
  });

  it("sends nothing for no queries", async () => {
    const { db: b, batch } = withBatch(db);
    const t = await measure(() => batchReads(b, []));
    expect(t.value).toEqual([]);
    expect(t.queries).toBe(0);
    expect(batch).not.toHaveBeenCalled();
  });

  it("rejects when a query fails", async () => {
    const bad = db.execute(sql`select * from no_such_table`);
    await expect(batchReads(db, [profilesQ(db), bad])).rejects.toThrow();
  });
});

describe("reads", () => {
  const profileNames = (d: Database) => defineRead([profilesQ(d)], ([rows]) => rows.map((r) => r.name));
  const kcal = (d: Database) => defineRead([targetsQ(d)], ([rows]) => rows[0]?.kcal ?? null);
  const programAndCount = (d: Database) =>
    defineRead([d.select().from(programs).where(eq(programs.profileId, AVERY)), countQ(d)], ([ps, raw]) => ({
      names: ps.map((p) => p.name),
      count: (raw as unknown as { rows: { n: number }[] }).rows[0]!.n,
    }));

  it("runRead assembles a read from its queries", async () => {
    expect(await runRead(db, profileNames(db))).toEqual(["Avery"]);
  });

  it("readAll runs several reads in one batch call and hands each its own results", async () => {
    const { db: b, batch } = withBatch(db);
    const got = await readAll(b, { names: profileNames(b), kcal: kcal(b), program: programAndCount(b) });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]![0]).toHaveLength(4);
    expect(got).toEqual({
      names: await runRead(db, profileNames(db)),
      kcal: await runRead(db, kcal(db)),
      program: await runRead(db, programAndCount(db)),
    });
  });

  it("a read with no queries costs nothing", async () => {
    const { db: b, batch } = withBatch(db);
    const t = await measure(() => readAll(b, { none: defineRead([], () => "constant"), known: constRead(7), names: profileNames(b) }));
    expect(t.value).toEqual({ none: "constant", known: 7, names: ["Avery"] });
    expect(t.queries).toBe(1);
    expect(batch).not.toHaveBeenCalled();
  });

  it("combineReads nests reads into one read", async () => {
    const { db: b, batch } = withBatch(db);
    const both = combineReads({ names: profileNames(b), kcal: kcal(b) }, ({ names, kcal }) => `${names.join("+")}:${kcal}`);
    const got = await readAll(b, { both, program: programAndCount(b) });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(got.both).toBe(`Avery:${await runRead(db, kcal(db))}`);
    expect(got.program.names.length).toBeGreaterThan(0);
  });
});
