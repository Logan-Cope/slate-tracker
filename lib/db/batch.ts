/**
 * Reads sent to the database in one round trip.
 *
 * On neon-http every awaited query is its own HTTPS request, so a page that
 * awaits five queries at once opens five requests. db.batch sends them in one
 * (Neon runs them as one non-interactive transaction). PGlite has no batch;
 * there the same queries run one by one, with the same results.
 *
 * A Read is a set of queries plus the code that turns their rows into a value.
 * Query modules export Reads next to their plain functions, so a page can put
 * every Read it needs into one readAll call, which is one request on Neon.
 * Reads only: never put a write in a batch.
 */
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import type { Database } from "./client";

type Query = BatchItem<"pg">;
type Batcher = { batch: (queries: readonly Query[]) => Promise<unknown[]> };

function batcher(db: Database): Batcher | null {
  const batch = (db as unknown as Partial<Batcher>).batch;
  return typeof batch === "function" ? (db as unknown as Batcher) : null;
}

type Inspectable = { toSQL?: () => { sql: string }; getQuery?: () => { sql: string } };

/** A statement's SQL text, never its parameters (they hold user data). */
function sqlOf(q: Query): string {
  const i = q as unknown as Inspectable;
  try {
    return i.toSQL?.().sql ?? i.getQuery?.().sql ?? "(unknown statement)";
  } catch {
    return "(unknown statement)";
  }
}

/** Runs the queries in one round trip where the driver can, and returns their results in order. */
export async function batchReads<Q extends readonly Query[]>(db: Database, queries: readonly [...Q]): Promise<BatchResponse<Q>> {
  const qs = queries as readonly Query[];
  const b = qs.length > 1 ? batcher(db) : null;
  // A single query needs no transaction around it, and no queries need no request.
  if (!b) return (await Promise.all(qs.map((q) => q as unknown as PromiseLike<unknown>))) as BatchResponse<Q>;
  try {
    return (await b.batch(qs)) as BatchResponse<Q>;
  } catch (e) {
    // drizzle wraps a single query's error with its SQL but passes a batch's error through bare,
    // which would leave the log without the statement that failed.
    throw new Error(`Failed batch of ${qs.length} statements: ${qs.map(sqlOf).join(" ; ")}`, { cause: e });
  }
}

export type Read<T> = {
  readonly queries: readonly Query[];
  readonly assemble: (results: readonly unknown[]) => T;
};

export type ReadValues<R extends Record<string, Read<unknown>>> = { [K in keyof R]: R[K] extends Read<infer T> ? T : never };

/** A Read from its queries and the function that builds the value from their results (a typed tuple). */
export function defineRead<Q extends readonly Query[], T>(queries: readonly [...Q], assemble: (results: BatchResponse<Q>) => T): Read<T> {
  return { queries, assemble: (results) => assemble(results as BatchResponse<Q>) };
}

/** A value already in hand, where a Read is expected. No query. */
export function constRead<T>(value: T): Read<T> {
  return { queries: [], assemble: () => value };
}

/** One Read made of several: their queries go out together and `assemble` gets each Read's value by key. */
export function combineReads<R extends Record<string, Read<unknown>>, T>(reads: R, assemble: (values: ReadValues<R>) => T): Read<T> {
  const entries = Object.entries(reads);
  return {
    queries: entries.flatMap(([, r]) => r.queries),
    assemble: (results) => {
      const values: Record<string, unknown> = {};
      let at = 0;
      for (const [key, r] of entries) {
        values[key] = r.assemble(results.slice(at, at + r.queries.length));
        at += r.queries.length;
      }
      return assemble(values as ReadValues<R>);
    },
  };
}

export async function runRead<T>(db: Database, read: Read<T>): Promise<T> {
  return read.assemble(await batchReads(db, read.queries));
}

/** Every Read's value by key, from one round trip. */
export function readAll<R extends Record<string, Read<unknown>>>(db: Database, reads: R): Promise<ReadValues<R>> {
  return runRead(db, combineReads(reads, (values) => values));
}
