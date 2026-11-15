/**
 * Round-trip budget for each tab. Runs the real page and layout functions on the
 * in-memory PGlite with every round trip delayed (helpers/query-trace.ts, which
 * also gives the driver a batch method like neon-http's) and holds the number of
 * queries, the number of round trips and how many of those wait on each other.
 * In production each round trip is one HTTPS request to Neon: a lone query is
 * one, a batch of queries is one. The layout and the page render separately,
 * so each gets its own budget.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const session = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; role: "coach" | "client"; defaultProfileId: number },
  cookies: new Map<string, string>(),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: async () => (session.user ? { user: session.user, expires: "2099-01-01T00:00:00.000Z" } : null),
  signIn: async () => undefined,
  signOut: async () => undefined,
  handlers: {},
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (session.cookies.has(name) ? { name, value: session.cookies.get(name) } : undefined),
    getAll: () => [...session.cookies].map(([name, value]) => ({ name, value })),
    has: (name: string) => session.cookies.has(name),
    set: (name: string, value: string) => void session.cookies.set(name, String(value)),
    delete: (name: string) => void session.cookies.delete(name),
  }),
  headers: async () => new Headers(),
}));

import { AVERY, setupTestDb } from "./helpers/db";
import { measure, type Trace } from "./helpers/query-trace";
import type { Database } from "@/lib/db/client";
import { foods, profiles, targets, users } from "@/lib/db/schema";
import { PROFILE_COOKIE, getProfileContext } from "@/lib/auth/session";
import { logFood, quickAdd } from "@/lib/db/queries/nutrition";
import { setTarget } from "@/lib/db/queries/targets";
import { upsertWeighIn } from "@/lib/db/queries/metrics";
import { deleteWorkout, getActiveProgram, upsertWorkout } from "@/lib/db/queries/training";
import { shiftDate, todayLocal } from "@/lib/utils/date";

type Page = (props: { searchParams: Promise<Record<string, string>>; params: Promise<Record<string, string>> }) => Promise<unknown>;
const props = () => ({ searchParams: Promise.resolve({}), params: Promise.resolve({}) });
const load = async (p: Promise<{ default: unknown }>) => (await p).default as Page;
const pages = {
  layout: () => load(import("@/app/(app)/layout")),
  today: () => load(import("@/app/(app)/today/page")),
  train: () => load(import("@/app/(app)/train/page")),
  weight: () => load(import("@/app/(app)/weight/page")),
  settings: () => load(import("@/app/(app)/settings/page")),
  coach: () => load(import("@/app/(app)/coach/page")),
};

let db: Database;
let close: () => Promise<void>;
let averyUser: { id: string; name: string; role: "client"; defaultProfileId: number };
let morganUser: { id: string; name: string; role: "coach"; defaultProfileId: number };
let otherProfileId: number;
const today = todayLocal();

beforeAll(async () => {
  ({ db, close } = await setupTestDb({ foods: true }));
  const all = await db.select().from(users);
  const avery = all.find((u) => u.handle === "avery")!;
  const morgan = all.find((u) => u.handle === "morgan")!;
  averyUser = { id: String(avery.id), name: avery.name, role: "client", defaultProfileId: avery.defaultProfileId };
  morganUser = { id: String(morgan.id), name: morgan.name, role: "coach", defaultProfileId: morgan.defaultProfileId };
  otherProfileId = (await db.insert(profiles).values({ name: "Sam" }).returning())[0]!.id;

  // A diary today and yesterday: catalogue foods and quick adds.
  const someFoods = await db.select({ id: foods.id }).from(foods).limit(3);
  for (const date of [today, shiftDate(today, -1)]) {
    for (const [i, f] of someFoods.entries()) {
      await logFood(AVERY, { id: randomUUID(), date, meal: (["breakfast", "lunch", "dinner"] as const)[i]!, foodId: f.id, qty: 1, unit: "serving" });
    }
    await quickAdd(AVERY, { id: randomUUID(), date, meal: "snacks", name: "Quick", kcal: 200, proteinG: 10 });
  }
  // Only a future target: the case that used to cost a second, fallback query per day.
  await db.delete(targets).where(eq(targets.profileId, AVERY));
  await setTarget(AVERY, { kcal: 1500, proteinG: 100, effectiveFrom: shiftDate(today, 5) });

  for (let i = 9; i >= 0; i--) await upsertWeighIn(AVERY, { id: randomUUID(), date: shiftDate(today, -i), value: 150 - i * 0.2 });

  await upsertWorkout(await workoutDraft(new Date(Date.now() - 2 * 86_400_000), true));
});
afterAll(() => close());

beforeEach(() => {
  session.cookies.clear();
  session.user = averyUser;
});

async function workoutDraft(startedAt: Date, finished: boolean) {
  const program = await getActiveProgram(AVERY);
  const routine = program!.routines[0]!;
  return {
    id: randomUUID(),
    profileId: AVERY,
    routineId: routine.id,
    title: routine.name,
    startedAt,
    finishedAt: finished ? new Date(startedAt.getTime() + 3_600_000) : null,
    notes: null,
    exercises: routine.exercises.slice(0, 3).map((e, i) => ({
      id: randomUUID(),
      exerciseId: e.exercise.id,
      position: i,
      supersetGroup: null,
      notes: null,
      sets: [0, 1].map((k) => ({
        id: randomUUID(),
        position: k,
        setType: "normal" as const,
        weightLb: 50,
        reps: 10,
        rpe: null,
        completedAt: finished || k === 0 ? startedAt : null,
        isPr: false,
      })),
    })),
  };
}

/** Holds a traced load to its budget; failures name every number. */
function within(t: Trace, max: { queries: number; roundTrips: number; depth?: number }) {
  const all = `(measured ${t.queries} queries, ${t.roundTrips} round trips, depth ${t.depth})`;
  expect(t.queries, `queries ${all}`).toBeLessThanOrEqual(max.queries);
  expect(t.roundTrips, `round trips ${all}`).toBeLessThanOrEqual(max.roundTrips);
  if (max.depth !== undefined) expect(t.depth, `depth ${all}`).toBeLessThanOrEqual(max.depth);
}

type El = { type: unknown; props: Record<string, unknown> };
/** Every element in a page's returned tree, children and element-valued props included. */
function elements(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const n of node) elements(n, out);
  } else if (node && typeof node === "object" && "type" in node && "props" in node) {
    const el = node as El;
    out.push(el);
    for (const v of Object.values(el.props)) elements(v, out);
  }
  return out;
}
/** Props of each element of the named component in a page's tree. */
function propsOf(tree: unknown, name: string): Record<string, unknown>[] {
  return elements(tree)
    .filter((e) => typeof e.type === "function" && e.type.name === name)
    .map((e) => e.props);
}

function asCoach(profileId?: number) {
  session.user = morganUser;
  if (profileId !== undefined) session.cookies.set(PROFILE_COOKIE, String(profileId));
}

describe("client (Avery): every tab loads in one round trip", () => {
  it("/today: at most 5 queries, in one round trip", async () => {
    const page = await pages.today();
    const t = await measure(() => page(props()));
    within(t, { queries: 5, roundTrips: 1 });
  });

  it("/train: at most 7 queries, in one round trip", async () => {
    const page = await pages.train();
    const t = await measure(() => page(props()));
    within(t, { queries: 7, roundTrips: 1 });
  });

  it("/train with a workout in progress: still at most 7 queries in one round trip", async () => {
    const draft = await workoutDraft(new Date(), false);
    await upsertWorkout(draft);
    try {
      const page = await pages.train();
      const t = await measure(() => page(props()));
      within(t, { queries: 7, roundTrips: 1 });
      expect(propsOf(t.value, "ResumeDiscard")).toEqual([expect.objectContaining({ workoutId: draft.id })]);
    } finally {
      await deleteWorkout(AVERY, draft.id);
    }
  });

  it("/weight: one query", async () => {
    const page = await pages.weight();
    const t = await measure(() => page(props()));
    within(t, { queries: 1, roundTrips: 1 });
    expect(propsOf(t.value, "PageHeader")[0]?.subtitle).toBe("Weigh in once a day, first thing");
    expect(propsOf(t.value, "WeighInList")[0]?.rows).toHaveLength(10);
  });

  it("/settings: no queries", async () => {
    const page = await pages.settings();
    const t = await measure(() => page(props()));
    within(t, { queries: 0, roundTrips: 0 });
  });

  it("(app) layout on a hard load: no queries", async () => {
    const layout = await pages.layout();
    const t = await measure(() => layout({ children: null } as never));
    within(t, { queries: 0, roundTrips: 0 });
  });
});

describe("coach (Morgan)", () => {
  it("getProfileContext: one query", async () => {
    asCoach();
    const t = await measure(() => getProfileContext());
    within(t, { queries: 1, roundTrips: 1 });
  });

  it("(app) layout: one query", async () => {
    asCoach();
    const layout = await pages.layout();
    const t = await measure(() => layout({ children: null } as never));
    within(t, { queries: 1, roundTrips: 1 });
  });

  it("/settings: one query", async () => {
    asCoach();
    const page = await pages.settings();
    await page(props());
    const t = await measure(() => page(props()));
    within(t, { queries: 1, roundTrips: 1 });
  });

  it("/weight: the profile list and the readings in one round trip", async () => {
    asCoach();
    const page = await pages.weight();
    const t = await measure(() => page(props()));
    within(t, { queries: 2, roundTrips: 1 });
    expect(propsOf(t.value, "PageHeader")[0]?.subtitle).toBe("Avery's weigh-ins");
    expect(propsOf(t.value, "WeighInList")[0]?.rows).toHaveLength(10);
  });

  it("/weight for another profile: that profile's readings, one round trip", async () => {
    asCoach(otherProfileId);
    const page = await pages.weight();
    const t = await measure(() => page(props()));
    within(t, { queries: 2, roundTrips: 1 });
    expect(propsOf(t.value, "PageHeader")[0]?.subtitle).toBe("Sam's weigh-ins");
    expect(propsOf(t.value, "WeighInList")[0]?.rows).toHaveLength(0);
  });

  it("/coach: one round trip, no more queries than before", async () => {
    asCoach();
    const page = await pages.coach();
    await page(props());
    const t = await measure(() => page(props()));
    within(t, { queries: COACH_QUERIES_BEFORE, roundTrips: 1 });
    expect(propsOf(t.value, "PageHeader")[0]?.subtitle).toBe("Avery, last 7 days");
    expect(propsOf(t.value, "TrendHeadline")[0]?.count).toBe(10);
  });

  // A cookie naming a deleted profile: the profile on screen is only known once the list
  // is back, so the readings for the fallback cost a second round trip. Rare: only after
  // a profile is deleted while a coach is viewing it.
  it("/weight with a stale profile cookie: the default profile's readings, at most two round trips", async () => {
    asCoach(987_654);
    const page = await pages.weight();
    const t = await measure(() => page(props()));
    within(t, { queries: 3, roundTrips: 2 });
    expect(propsOf(t.value, "PageHeader")[0]?.subtitle).toBe("Avery's weigh-ins");
    expect(propsOf(t.value, "WeighInList")[0]?.rows).toHaveLength(10);
  });

  it("/coach with a stale profile cookie: the default profile's week, at most two round trips", async () => {
    asCoach(987_654);
    const page = await pages.coach();
    await page(props());
    const t = await measure(() => page(props()));
    within(t, { queries: COACH_QUERIES_BEFORE, roundTrips: 2 });
    expect(propsOf(t.value, "PageHeader")[0]?.subtitle).toBe("Avery, last 7 days");
    expect(propsOf(t.value, "TrendHeadline")[0]?.count).toBe(10);
  });
});

describe("getProfileContext picks the profile on screen", () => {
  it("a client is pinned to their default profile, whatever the cookie says", async () => {
    session.cookies.set(PROFILE_COOKIE, String(otherProfileId));
    const ctx = await getProfileContext();
    expect(ctx.isCoach).toBe(false);
    expect(ctx.profile.id).toBe(averyUser.defaultProfileId);
  });

  it("a coach sees the profile in the cookie and the full list", async () => {
    asCoach(otherProfileId);
    const ctx = await getProfileContext();
    expect(ctx.isCoach).toBe(true);
    expect(ctx.profile).toMatchObject({ id: otherProfileId, name: "Sam" });
    expect(ctx.profiles.map((p) => p.name)).toEqual(["Avery", "Sam"]);
  });

  it("a coach with a cookie naming a deleted profile falls back to their default", async () => {
    asCoach(987_654);
    const ctx = await getProfileContext();
    expect(ctx.profile.id).toBe(morganUser.defaultProfileId);
  });
});

/** Measured on the code before the one-wave change; the coach page must not grow. */
const COACH_QUERIES_BEFORE = 12;
