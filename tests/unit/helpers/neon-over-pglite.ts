/**
 * The production driver (drizzle-orm/neon-http over @neondatabase/serverless)
 * talking to the test PGlite instead of Neon. Neon's client posts each query
 * (or a batch: `{ queries: [...] }`, run as one transaction) to an HTTPS endpoint
 * and parses the raw text values it gets back with its own type parsers; this
 * answers those requests from PGlite in the same wire shape, so everything
 * between a page and fetch is the code that runs on Vercel. Every request is
 * recorded, which is the number of HTTPS round trips a render costs.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import * as schema from "@/lib/db/schema";
import type { Database } from "@/lib/db/client";

export type NeonRequest = { statements: number; batch: boolean };
type Statement = { query: string; params: (string | null)[] };
type Target = Pick<PGlite | Transaction, "query">;

export type NeonEmulatorOptions = {
  /** Runs alongside each request; the response waits for both (a latency model). */
  latency?: (req: NeonRequest) => Promise<void>;
};

export function neonOverPglite(pglite: PGlite, opts: NeonEmulatorOptions = {}): { db: Database; requests: NeonRequest[] } {
  const requests: NeonRequest[] = [];
  // Neon returns every value as Postgres text and parses it client side: keep PGlite from parsing,
  // and pass the client's already text-encoded parameters through unchanged.
  const parsers = Object.fromEntries(Object.keys(pglite.parsers).map((oid) => [oid, (v: string) => v]));
  const serializers = new Proxy({}, { get: () => (v: string) => v });
  const options = { rowMode: "array" as const, parsers, serializers };

  const runOne = async (target: Target, s: Statement) => {
    const r = await target.query<unknown[]>(s.query, s.params, options);
    return {
      command: (r as { command?: string }).command ?? "SELECT",
      rowCount: (r as { rowCount?: number }).rowCount ?? r.affectedRows ?? r.rows.length,
      fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
      rows: r.rows,
      rowAsArray: true,
    };
  };

  const fetchFunction = async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Statement | { queries: Statement[] };
    const batch = "queries" in body;
    const req: NeonRequest = { statements: batch ? body.queries.length : 1, batch };
    requests.push(req);
    const answer = async () => {
      try {
        if (!batch) return Response.json(await runOne(pglite, body));
        const results = await pglite.transaction(async (tx) => {
          const out = [];
          for (const s of body.queries) out.push(await runOne(tx, s));
          return out;
        });
        return Response.json({ results });
      } catch (e) {
        const err = e as { message?: string; code?: string };
        return Response.json({ message: err.message ?? String(e), code: err.code }, { status: 400 });
      }
    };
    const [res] = await Promise.all([answer(), opts.latency?.(req)]);
    return res;
  };

  neonConfig.fetchFunction = fetchFunction;
  const db = drizzle(neon("postgresql://emulator@neon-emulator.invalid/slate"), { schema }) as unknown as Database;
  return { db, requests };
}

/** The same driver with batch hidden, so batchReads falls back to one request per query (the code before batching). */
export function withoutBatch(db: Database): Database {
  return Object.assign(Object.create(db) as Database, { batch: undefined });
}
