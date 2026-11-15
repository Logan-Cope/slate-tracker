"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Images, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { coverCrop } from "@/lib/scan/camera";
import type { LabelDraft } from "@/lib/nutrition/label-fields";
import { fitLongEdge, labelFailure, PHOTO_QUALITY, type LabelFailure } from "@/lib/nutrition/label-photo";
import { scanStream, stopUnlessFoodRoute, tuneTrack, watchPageHidden } from "./scan-stream";

type Props = { open: boolean; onClose: () => void; onRead: (draft: LabelDraft) => void };

type Status =
  | { kind: "starting" }
  | { kind: "camera" }
  | { kind: "no-camera" }
  | { kind: "reading"; photo: Photo }
  | { kind: "failed"; photo: Photo | null; failure: LabelFailure };

type Photo = { blob: Blob; url: string };

/** Nutrition label camera: a photo from the live camera, or one chosen from the library, read into a food draft. */
export function LabelSheet({ open, onClose, onRead }: Props) {
  useEffect(() => {
    watchPageHidden();
    return () => stopUnlessFoodRoute();
  }, []);
  return (
    <Sheet open={open} onClose={onClose} title="Scan label">
      {open ? <Body onRead={onRead} /> : null}
    </Sheet>
  );
}

function toJpeg(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): Promise<Blob | null> {
  const { width, height } = fitLongEdge(sw, sh);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY));
}

/** A chosen file, upright (the browser applies its EXIF rotation when decoding) and scaled down. */
async function fileToJpeg(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await toJpeg(img, 0, 0, img.naturalWidth, img.naturalHeight);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Body({ onRead }: Pick<Props, "onRead">) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onReadRef = useRef(onRead);
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  /** The live camera is up, so a failed read offers Retake instead of another chosen photo. */
  const [hasCamera, setHasCamera] = useState(false);
  const photoUrl = status.kind === "reading" || status.kind === "failed" ? status.photo?.url : undefined;

  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  // The preview's object URL lives exactly as long as the status showing it.
  useEffect(() => {
    if (!photoUrl) return;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  /** False once the sheet has closed: a read that lands later must not touch the form. */
  const aliveRef = useRef(true);
  /** One photo at a time: set from the tap until the read fails or the sheet closes. */
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus({ kind: "no-camera" });
        return;
      }
      let acquired: MediaStream;
      try {
        acquired = await scanStream.acquire();
      } catch {
        if (!cancelled) setStatus({ kind: "no-camera" });
        return;
      }
      // Closed while the camera was opening (the permission prompt): hand it straight back.
      if (cancelled) {
        scanStream.release();
        return;
      }
      stream = acquired;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      setHasCamera(true);
      try {
        await video.play();
      } catch {
        // Muted inline video may autoplay; a rejected play() on older WebKit still shows frames.
      }
      if (cancelled) return;
      const track = stream.getVideoTracks()[0];
      if (track) await tuneTrack(track);
      if (!cancelled) setStatus((s) => (s.kind === "starting" ? { kind: "camera" } : s));
    }

    void start();
    return () => {
      cancelled = true;
      // Hand the stream back to the keeper, which holds it a few minutes so the next open does not prompt.
      if (stream) scanStream.release();
      stream = null;
    };
  }, []);

  const fail = useCallback((photo: Photo | null, status: number | null) => {
    busyRef.current = false;
    if (aliveRef.current) setStatus({ kind: "failed", photo, failure: labelFailure(status) });
  }, []);

  const read = useCallback(
    async (photo: Photo) => {
      busyRef.current = true;
      setStatus({ kind: "reading", photo });
      const controller = new AbortController();
      abortRef.current = controller;
      let res: Response;
      try {
        res = await fetch("/api/foods/label", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": photo.blob.type || "image/jpeg" },
          body: photo.blob,
          signal: controller.signal,
        });
      } catch {
        fail(photo, null);
        return;
      }
      if (!res.ok) {
        fail(photo, res.status);
        return;
      }
      const body = (await res.json().catch(() => null)) as { draft?: LabelDraft } | null;
      if (!body?.draft) {
        fail(photo, 500);
        return;
      }
      if (aliveRef.current) onReadRef.current(body.draft);
    },
    [fail],
  );

  /** Turn a captured image into the photo to read, or a failure; nothing happens once the sheet closed. */
  async function capture(make: () => Promise<Blob | null>) {
    if (busyRef.current) return;
    busyRef.current = true;
    const blob = await make();
    if (!aliveRef.current) return;
    if (!blob) {
      fail(null, 415);
      return;
    }
    void read({ blob, url: URL.createObjectURL(blob) });
  }

  function shoot() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    // Exactly what the viewfinder shows, so a label framed in the box is a label in the photo.
    const r = coverCrop(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight);
    void capture(() => toJpeg(video, r.sx, r.sy, r.sw, r.sh));
  }

  function choose(file: File | undefined) {
    if (file) void capture(() => fileToJpeg(file));
  }

  function retake() {
    busyRef.current = false;
    setStatus(hasCamera ? { kind: "camera" } : { kind: "no-camera" });
  }

  const live = status.kind === "starting" || status.kind === "camera";
  const chooseButton = (primary: boolean) => (
    <button type="button" onClick={() => fileRef.current?.click()} className={`${primary ? "btn-primary" : "btn-secondary"} w-full`} data-testid="label-choose">
      <Images size={18} aria-hidden />
      Choose photo
    </button>
  );

  return (
    <div className="flex flex-col gap-4 pb-2" data-testid="label-sheet">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="label-file"
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className={`relative overflow-hidden rounded-2xl bg-black ${status.kind === "no-camera" || (status.kind === "failed" && !status.photo) ? "hidden" : "aspect-[3/4] max-h-[52dvh] w-full"}`}>
        <video ref={videoRef} playsInline muted autoPlay className={`h-full w-full object-cover ${live ? "" : "invisible"}`} data-testid="label-video" />
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing for next/image to optimize
          <img src={photoUrl} alt="" className={`absolute inset-0 h-full w-full object-cover ${status.kind === "reading" ? "opacity-60" : ""}`} />
        ) : null}
        {live ? <div className="pointer-events-none absolute inset-[8%] rounded-xl border-2 border-white/80" aria-hidden /> : null}
        {status.kind === "starting" ? <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-white/90">Starting camera…</div> : null}
        {status.kind === "reading" ? (
          <div className="absolute inset-0 grid place-items-center" data-testid="label-reading">
            <p className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Reading label…
            </p>
          </div>
        ) : null}
      </div>

      {live ? (
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={shoot}
            disabled={status.kind !== "camera"}
            aria-label="Take photo"
            data-testid="label-shutter"
            className="tap grid h-16 w-16 place-items-center rounded-full border-4 border-fg disabled:opacity-40"
          >
            <span className="h-12 w-12 rounded-full bg-fg" />
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost text-sm" data-testid="label-choose">
            Choose photo
          </button>
        </div>
      ) : null}

      {status.kind === "no-camera" ? chooseButton(true) : null}

      {status.kind === "failed" ? (
        <div className="flex flex-col gap-3" data-testid="label-failed">
          <p role="alert" className="text-sm font-semibold text-danger">
            {status.failure.message}
          </p>
          {status.failure.signIn ? (
            <Link href="/login" className="btn-primary w-full">
              Sign in
            </Link>
          ) : null}
          {status.failure.retry && status.photo ? (
            <button type="button" className="btn-primary w-full" onClick={() => status.photo && void read(status.photo)} data-testid="label-retry">
              Retry
            </button>
          ) : null}
          {!status.failure.signIn ? (
            hasCamera ? (
              <button type="button" className={`${status.failure.retry ? "btn-secondary" : "btn-primary"} w-full`} onClick={retake} data-testid="label-retake">
                Retake
              </button>
            ) : (
              chooseButton(!status.failure.retry)
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
