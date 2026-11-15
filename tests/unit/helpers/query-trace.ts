/**
 * Counts database queries, round trips and their serial depth. Wraps the PGlite
 * handle that lib/db/client.ts caches on globalThis: every query and exec waits a
 * fixed delay before it runs, standing in for one Neon HTTP round trip, and
 * records when it started and ended.
 *
 * While measuring, the cached Drizzle instance also gets a `batch` method, the way
 * the neon-http driver has one: a batch is one round trip (one delay) for all of
 * its queries, so lib/db/batch.ts takes the same path it takes in production.
 * Queries inside a batch count as queries but not as round trips.
 *
 * A round trip's level is 1 + the highest level among the round trips that had
 * already ended when it started, so round trips sent together share a level and
 * `depth` is the number of round trips a page waits through in sequence.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

const ROUND_TRIP_MS = 10;
/** Timer jitter: a round trip that starts within this of another's end still counts as waiting for it. */
const EPSILON_MS = 0.05;

type Call = { start: number; end: number; level: number };
type Fn = (...a: unknown[]) => Promise<unknown>;
type Handle = { query: Fn; exec: Fn };
type Slate = { pglite?: Handle; db?: { batch?: (queries: readonly PromiseLike<unknown>[]) => Promise<unknown[]> } };

function slate(): Required<Slate> {
  const s = (globalThis as unknown as { __slateDb?: Slate }).__slateDb;
  if (!s?.pglite || !s.db) throw new Error("query-trace: no PGlite handle; call getDb() (setupTestDb) first");
  return s as Required<Slate>;
}

export type Trace = { queries: number; roundTrips: number; depth: number };

const inBatch = new AsyncLocalStorage<true>();

export async function measure<T>(fn: () => Promise<T>): Promise<Trace & { value: T }> {
  const { pglite: h, db } = slate();
  const trips: Call[] = [];
  let queries = 0;
  const roundTrip = async <R>(run: () => Promise<R>): Promise<R> => {
    const call: Call = { start: performance.now(), end: Infinity, level: 0 };
    trips.push(call);
    await new Promise((r) => setTimeout(r, ROUND_TRIP_MS));
    try {
      return await run();
    } finally {
      call.end = performance.now();
    }
  };
  const originals = { query: h.query, exec: h.exec };
  const wrap =
    (orig: Fn): Fn =>
    async (...args) => {
      queries++;
      return inBatch.getStore() ? orig.apply(h, args) : roundTrip(() => orig.apply(h, args));
    };
  h.query = wrap(originals.query);
  h.exec = wrap(originals.exec);
  db.batch = (qs) => roundTrip(() => inBatch.run(true, () => Promise.all(qs)));
  let value: T;
  try {
    value = await fn();
  } finally {
    h.query = originals.query;
    h.exec = originals.exec;
    delete db.batch;
  }
  const ordered = [...trips].sort((a, b) => a.start - b.start);
  for (const c of ordered) {
    const before = ordered.filter((p) => p !== c && p.end <= c.start + EPSILON_MS);
    c.level = 1 + Math.max(0, ...before.map((p) => p.level));
  }
  return { value, queries, roundTrips: trips.length, depth: Math.max(0, ...ordered.map((c) => c.level)) };
}
