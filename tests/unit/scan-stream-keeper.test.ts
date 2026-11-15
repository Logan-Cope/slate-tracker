import { describe, expect, it } from "vitest";
import { createStreamKeeper, isFoodRoute, KEEP_MS } from "@/lib/scan/stream-keeper";

function setup() {
  let opens = 0;
  const streams: { tracks: { readyState: string; stopped: number; stop: () => void }[]; getTracks: () => { readyState: string; stop: () => void }[] }[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextTimer = 1;
  const keeper = createStreamKeeper({
    open: async () => {
      opens++;
      const track = {
        readyState: "live",
        stopped: 0,
        stop() {
          this.stopped++;
          this.readyState = "ended";
        },
      };
      const s = { tracks: [track], getTracks: () => [track] };
      streams.push(s);
      return s;
    },
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (h) => void timers.delete(h as number),
  });
  const fire = () => [...timers.values()].forEach((t) => t.fn());
  const track = () => streams[0]!.tracks[0]!;
  return { keeper, streams, timers, fire, track, opens: () => opens };
}

describe("stream keeper", () => {
  it("opens the camera on the first acquire and again only after the stream was released for good", async () => {
    const t = setup();
    const a = await t.keeper.acquire();
    t.keeper.release();
    const b = await t.keeper.acquire();
    expect(b).toBe(a);
    expect(t.opens()).toBe(1);
  });

  it("keeps the stream for 5 minutes after the scanner closes, then stops every track", async () => {
    const t = setup();
    await t.keeper.acquire();
    t.keeper.release();
    expect([...t.timers.values()].map((x) => x.ms)).toEqual([KEEP_MS]);
    expect(KEEP_MS).toBe(300_000);
    expect(t.track().stopped).toBe(0);
    t.fire();
    expect(t.track().stopped).toBe(1);
    expect(t.keeper.held()).toBe(false);
  });

  it("starts a new stream after the window passed", async () => {
    const t = setup();
    await t.keeper.acquire();
    t.keeper.release();
    t.fire();
    await t.keeper.acquire();
    expect(t.opens()).toBe(2);
  });

  it("a reopen inside the window cancels the pending stop", async () => {
    const t = setup();
    await t.keeper.acquire();
    t.keeper.release();
    await t.keeper.acquire();
    expect(t.timers.size).toBe(0);
    expect(t.track().stopped).toBe(0);
  });

  it("stop() (page hidden, left the food screens) ends the tracks at once and clears the timer", async () => {
    const t = setup();
    await t.keeper.acquire();
    t.keeper.release();
    t.keeper.stop();
    expect(t.track().stopped).toBe(1);
    expect(t.timers.size).toBe(0);
    await t.keeper.acquire();
    expect(t.opens()).toBe(2);
  });

  it("does not reuse a stream the system already ended", async () => {
    const t = setup();
    await t.keeper.acquire();
    t.keeper.release();
    t.track().readyState = "ended";
    await t.keeper.acquire();
    expect(t.opens()).toBe(2);
  });

  it("shares one getUserMedia between acquires that overlap", async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.keeper.acquire(), t.keeper.acquire()]);
    expect(a).toBe(b);
    expect(t.opens()).toBe(1);
  });

  it("release with nothing held starts no timer", () => {
    const t = setup();
    t.keeper.release();
    expect(t.timers.size).toBe(0);
  });
});

describe("isFoodRoute", () => {
  it("covers the diary and every screen under /today", () => {
    for (const p of ["/today", "/today/add", "/today/foods/new", "/today/meals/x"]) expect(isFoodRoute(p)).toBe(true);
  });
  it("is false elsewhere", () => {
    for (const p of ["/train", "/weight", "/settings", "/todayish", "/"]) expect(isFoodRoute(p)).toBe(false);
  });
});
