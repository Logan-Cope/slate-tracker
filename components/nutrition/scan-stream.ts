"use client";

import { pickZoom, videoConstraints, type ZoomCapability } from "@/lib/scan/camera";
import { createStreamKeeper, isFoodRoute } from "@/lib/scan/stream-keeper";

/** The one camera stream the scanner shares between opens (rules in lib/scan/stream-keeper.ts). */
export const scanStream = createStreamKeeper<MediaStream>({
  open: () => navigator.mediaDevices.getUserMedia({ video: videoConstraints(), audio: false }),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
});

let listening = false;

/** Stop the stream when the page is hidden (app backgrounded, phone locked). Installed once. */
export function watchPageHidden() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") scanStream.stop();
  });
}

/** Stop the stream unless the browser is still on a food screen. */
export function stopUnlessFoodRoute() {
  if (typeof window !== "undefined" && !isFoodRoute(window.location.pathname)) scanStream.stop();
}

/**
 * Zoom in (2x where the camera allows) and ask for continuous focus. More pixels per bar at the
 * same distance is what lets a label decode from arm's length instead of from inside the blur zone.
 * A camera that rejects the constraints simply keeps its defaults.
 */
export async function tuneTrack(track: MediaStreamTrack): Promise<void> {
  const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { zoom?: ZoomCapability; focusMode?: string[] };
  const advanced: Record<string, unknown>[] = [];
  const zoom = pickZoom(caps);
  if (zoom !== null) advanced.push({ zoom });
  if (caps.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" });
  if (advanced.length === 0) return;
  try {
    await track.applyConstraints({ advanced } as MediaTrackConstraints);
  } catch {
    // Not supported on this camera; the stream still works at its defaults.
  }
}
