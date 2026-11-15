/**
 * Keeps the camera stream open for a while after the scanner closes, so a reopen inside the window
 * reuses it and iOS does not ask for camera permission again. Pure: the camera, the timers and
 * the page events are injected, so the release rules are unit-tested without a browser.
 */

/** How long a closed scanner keeps the camera open. */
export const KEEP_MS = 5 * 60 * 1000;

/** The food screens live under /today (diary, add, custom foods, meals). */
export function isFoodRoute(pathname: string): boolean {
  return pathname === "/today" || pathname.startsWith("/today/");
}

type Track = { readyState: string; stop: () => void };
type Stream = { getTracks: () => Track[] };

export type KeeperDeps<S extends Stream> = {
  open: () => Promise<S>;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  keepMs?: number;
};

export function createStreamKeeper<S extends Stream>(deps: KeeperDeps<S>) {
  const keepMs = deps.keepMs ?? KEEP_MS;
  let stream: S | null = null;
  let opening: Promise<S> | null = null;
  let timer: unknown = null;

  const cancelTimer = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };

  /** Stop every track now. */
  function stop() {
    cancelTimer();
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  /** The held stream when every track is still live, otherwise a new one from the camera. */
  async function acquire(): Promise<S> {
    cancelTimer();
    if (stream) {
      if (stream.getTracks().length > 0 && stream.getTracks().every((t) => t.readyState === "live")) return stream;
      stop();
    }
    if (!opening) {
      opening = deps
        .open()
        .then((s) => {
          stream = s;
          return s;
        })
        .finally(() => {
          opening = null;
        });
    }
    return opening;
  }

  /** The scanner closed: keep the stream for keepMs, then stop it. */
  function release() {
    if (!stream) return;
    cancelTimer();
    timer = deps.setTimer(stop, keepMs);
  }

  return { acquire, release, stop, held: () => stream !== null };
}
