"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { FieldError } from "@/components/ui/field-error";
import {
  barcodeDigits,
  coverCrop,
  MAX_DECODE_FAILURES,
  MIN_DECODE_GAP_MS,
  READER_OPTIONS,
  STICKER_OPTIONS,
  stickerPass,
  WASM_PATH,
} from "@/lib/scan/camera";
import { grabFrame } from "@/lib/scan/frame";
import { scanStream, stopUnlessFoodRoute, tuneTrack, watchPageHidden } from "./scan-stream";
import { foodSummaryFromJson, type FoodJson } from "./food-json";
import type { FoodSummary, MealSlot } from "./types";

type Props = {
  open: boolean;
  date: string;
  meal: MealSlot;
  onClose: () => void;
  onFound: (food: FoodSummary) => void;
};

type Status =
  | { kind: "starting" }
  | { kind: "camera" }
  | { kind: "no-camera"; reason: string }
  | { kind: "looking-up"; code: string }
  | { kind: "not-found"; code: string }
  /** next: what the sheet offers under the message; a short typo gets neither, a lost session gets Sign in. */
  | { kind: "error"; code: string; message: string; next: "retry" | "sign-in" | null };

/** The shortest code the decoder accepts (EAN-8); anything shorter is a typo. */
const MIN_DIGITS = 6;
const BARCODE_ERROR = "That does not look like a barcode. Check the digits and try again.";
const SCAN_UNAVAILABLE = "Scanning is not available here. Type the code instead.";

/** Camera barcode scanner with a typed-code fallback. The decoder loads only once the camera is up. */
export function ScanSheet({ open, onClose, ...rest }: Props) {
  useEffect(() => {
    watchPageHidden();
    // Unmounting means the screen was left; the browser's location is already the new route.
    return () => stopUnlessFoodRoute();
  }, []);
  return (
    <Sheet open={open} onClose={onClose} title="Scan a barcode">
      {open ? <Body {...rest} /> : null}
    </Sheet>
  );
}

function cameraMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access is off. Allow it in Settings, or type the code.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera found. Type the code instead.";
  return "The camera could not start. Type the code instead.";
}

type VideoFrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };

function Body({ date, meal, onFound }: Omit<Props, "open" | "onClose">) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onFoundRef = useRef(onFound);
  /** Set once a code is on its way to lookup, so the camera and the typed field cannot both answer. */
  const doneRef = useRef(false);
  const stopCameraRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  /** A Code 128 sticker is in view and no food code is: the camera keeps running under the card. */
  const [sticker, setSticker] = useState(false);
  const [manual, setManual] = useState("");
  const [manualAttempted, setManualAttempted] = useState(false);
  const manualRef = useRef<HTMLInputElement>(null);
  const manualDigits = manual.replace(/\D/g, "");
  const manualError = manualAttempted && manualDigits.length < MIN_DIGITS ? BARCODE_ERROR : null;

  useEffect(() => {
    onFoundRef.current = onFound;
  }, [onFound]);

  const lookup = useCallback(async (raw: string) => {
    doneRef.current = true;
    setSticker(false);
    stopCameraRef.current();
    const code = raw.replace(/\D/g, "");
    if (code.length < MIN_DIGITS) {
      setStatus({ kind: "error", code, message: BARCODE_ERROR, next: null });
      return;
    }
    setStatus({ kind: "looking-up", code });
    try {
      const res = await fetch(`/api/barcode/${encodeURIComponent(code)}`, { credentials: "same-origin" });
      if (res.status === 404) {
        setStatus({ kind: "not-found", code });
        return;
      }
      if (res.status === 401) {
        setStatus({ kind: "error", code, message: "Your session ended. Sign in again.", next: "sign-in" });
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatus({ kind: "error", code, message: body?.error ?? "Lookup failed. Try again.", next: "retry" });
        return;
      }
      const body = (await res.json()) as { food: FoodJson };
      onFoundRef.current(foodSummaryFromJson(body.food));
    } catch {
      setStatus({ kind: "error", code, message: "No connection. Try again when you are back online.", next: "retry" });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    // Hand the stream back to the keeper, which holds it for a few minutes so a reopen does not prompt again.
    const stop = () => {
      if (stream) scanStream.release();
      stream = null;
    };
    stopCameraRef.current = stop;
    doneRef.current = false;

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus({ kind: "no-camera", reason: "This browser cannot open the camera here. Type the code instead." });
        return;
      }
      try {
        stream = await scanStream.acquire();
      } catch (err) {
        if (!cancelled) setStatus({ kind: "no-camera", reason: cameraMessage(err) });
        return;
      }
      // Read the track now: stop() nulls `stream` if the sheet closes during any await below.
      const track = stream.getVideoTracks()[0] ?? null;
      const decoderModule = import("zxing-wasm/reader");
      const video = videoRef.current as VideoFrameVideo | null;
      if (cancelled || !video) {
        stop();
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // autoplay is allowed for muted inline video; ignore a rejected play() on older WebKit.
      }
      if (cancelled) {
        stop();
        return;
      }
      if (track) await tuneTrack(track);
      if (cancelled) {
        stop();
        return;
      }

      let readBarcodes: Awaited<typeof decoderModule>["readBarcodes"];
      try {
        const mod = await decoderModule;
        await mod.prepareZXingModule({
          overrides: { locateFile: (file: string, prefix: string) => (file.endsWith(".wasm") ? WASM_PATH : prefix + file) },
          fireImmediately: true,
        });
        readBarcodes = mod.readBarcodes;
      } catch {
        stop();
        if (!cancelled) setStatus({ kind: "no-camera", reason: SCAN_UNAVAILABLE });
        return;
      }
      if (cancelled) {
        stop();
        return;
      }
      setStatus({ kind: "camera" });

      const straight = document.createElement("canvas");
      const turned = document.createElement("canvas");
      const straightCtx = straight.getContext("2d", { willReadFrequently: true });
      const turnedCtx = turned.getContext("2d", { willReadFrequently: true });
      if (!straightCtx || !turnedCtx) return;
      let retailCount = 0;
      let stickerCount = 0;
      let decodeIndex = 0;
      const startedAt = performance.now();
      let lastDecode = 0;
      let failures = 0;

      // One decode per delivered video frame, at most every MIN_DECODE_GAP_MS, straight and turned passes alternating.
      const schedule = () => {
        if (cancelled || doneRef.current) return;
        if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(() => void tick());
        else requestAnimationFrame(() => void tick());
      };
      async function tick() {
        if (cancelled || doneRef.current || !video) return;
        const now = performance.now();
        if (video.readyState < 2 || video.videoWidth === 0 || now - lastDecode < MIN_DECODE_GAP_MS) {
          schedule();
          return;
        }
        lastDecode = now;
        try {
          const region = coverCrop(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight);
          const onSticker = stickerPass(now - startedAt, decodeIndex++);
          // Each pass alternates straight and turned on its own, so the sticker pass sees both.
          const rotated = (onSticker ? stickerCount++ : retailCount++) % 2 === 1;
          const image = rotated ? grabFrame(video, turned, turnedCtx!, region, true) : grabFrame(video, straight, straightCtx!, region, false);
          const results = await readBarcodes(image, onSticker ? STICKER_OPTIONS : READER_OPTIONS);
          failures = 0;
          if (onSticker) {
            if (!cancelled && !doneRef.current && results.some((r) => r.isValid)) setSticker(true);
            schedule();
            return;
          }
          const hit = results.find((r) => r.isValid && barcodeDigits(r.text, MIN_DIGITS) !== null);
          if (hit && !cancelled && !doneRef.current) {
            void lookup(hit.text);
            return;
          }
        } catch {
          // A bad frame is not fatal, but a decoder that fails every frame is: offer the typed code.
          if (++failures >= MAX_DECODE_FAILURES) {
            stop();
            if (!cancelled) setStatus({ kind: "no-camera", reason: SCAN_UNAVAILABLE });
            return;
          }
        }
        schedule();
      }
      schedule();
    }

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [lookup]);

  const showVideo = status.kind === "starting" || status.kind === "camera";
  const newFoodHref = (code: string | null, label = false) =>
    `/today/foods/new?${code ? `upc=${encodeURIComponent(code)}&` : ""}date=${date}&meal=${meal}${label ? "&label=1" : ""}`;

  return (
    <div className="flex flex-col gap-4 pb-2" data-testid="scan-sheet">
      <div className={`relative overflow-hidden rounded-2xl bg-black ${showVideo ? "aspect-[4/3]" : "hidden"}`}>
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" data-testid="scan-video" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[46%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white/80" aria-hidden />
        {status.kind === "starting" ? (
          <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-white/90">Starting camera…</div>
        ) : null}
      </div>

      <p className="text-center text-sm text-muted" data-testid="scan-hint" role="status">
        {status.kind === "camera" ? "Point at the barcode, 6 to 15 inches away. Any angle works." : null}
      </p>
      {status.kind === "camera" && sticker ? (
        <div className="rounded-2xl bg-surface-2 px-4 py-3" data-testid="scan-invalid">
          <p className="text-sm font-semibold">Invalid barcode.</p>
          <Link href={newFoodHref(null, true)} className="btn-primary mt-3 w-full" data-testid="scan-invalid-label">
            Scan label
          </Link>
          <Link href={newFoodHref(null)} className="btn-secondary mt-2 w-full" data-testid="scan-invalid-create">
            Create custom food
          </Link>
        </div>
      ) : null}
      {status.kind === "no-camera" ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted" data-testid="scan-no-camera">
          {status.reason}
        </p>
      ) : null}
      {status.kind === "looking-up" ? (
        <p className="flex items-center justify-center gap-2 text-sm font-semibold text-muted" data-testid="scan-looking-up">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Looking up {status.code}…
        </p>
      ) : null}
      {status.kind === "not-found" ? (
        <div className="rounded-2xl bg-surface-2 px-4 py-3" data-testid="scan-not-found">
          <p className="text-sm font-semibold">No match for {status.code}.</p>
          <p className="mt-0.5 text-sm text-muted">Add it once and it will scan next time.</p>
          <Link href={newFoodHref(status.code, true)} className="btn-primary mt-3 w-full" data-testid="scan-label">
            Scan label
          </Link>
          <Link href={newFoodHref(status.code)} className="btn-secondary mt-2 w-full" data-testid="scan-create-food">
            Create custom food
          </Link>
        </div>
      ) : null}
      {status.kind === "error" ? (
        <div className="rounded-2xl bg-surface-2 px-4 py-3" data-testid="scan-error">
          <p className="text-sm font-semibold text-danger">{status.message}</p>
          {status.next === "retry" ? (
            <button type="button" className="btn-secondary mt-3 w-full" onClick={() => void lookup(status.code)} data-testid="scan-retry">
              Retry
            </button>
          ) : null}
          {status.next === "sign-in" ? (
            <Link href="/login" className="btn-secondary mt-3 w-full" data-testid="scan-sign-in">
              Sign in
            </Link>
          ) : null}
        </div>
      ) : null}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (status.kind === "looking-up") return;
          if (manualDigits.length < MIN_DIGITS) {
            setManualAttempted(true);
            manualRef.current?.focus();
            return;
          }
          void lookup(manual);
        }}
      >
        <label className="text-xs font-semibold text-muted" htmlFor="scan-manual">
          Type the numbers under the barcode
        </label>
        <div className="flex gap-2">
          <input
            ref={manualRef}
            id="scan-manual"
            className="input tnum aria-invalid:border-danger"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="888849000012"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            aria-invalid={manualError ? true : undefined}
            aria-describedby={manualError ? "scan-manual-error" : undefined}
            data-testid="scan-manual"
          />
          <button type="submit" className="btn-secondary shrink-0" aria-disabled={status.kind === "looking-up"} data-testid="scan-manual-submit">
            {status.kind === "looking-up" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            Look up
          </button>
        </div>
        <FieldError id="scan-manual-error" message={manualError} data-testid="scan-manual-error" />
      </form>
    </div>
  );
}
