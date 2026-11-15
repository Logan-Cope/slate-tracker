"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { autoDismisses, enqueue, TOAST_DURATION_MS, type ToastAction, type ToastData, type ToastTone } from "./toast-policy";

export type { ToastAction, ToastData, ToastTone } from "./toast-policy";

type Props = {
  toast: ToastData | null;
  onDismiss: () => void;
  /** Distance from the bottom of the viewport in px, when something (the rest timer) sits where the toast usually goes. */
  bottomOffset?: number;
  /** While the diary's edit bar is up, the toast sits above it instead of under it. */
  raised?: boolean;
  durationMs?: number;
};

/**
 * Bottom toast above the tab bar, rendered by the screen that owns the state.
 * The status region is always mounted and only its children change, so screen
 * readers announce each message. It is only as wide as its content, so an
 * empty region covers nothing underneath it. A notice that times out waits at
 * least five seconds and holds while a pointer or focus is on it.
 */
export function Toast({ toast, onDismiss, bottomOffset, raised = false, durationMs = TOAST_DURATION_MS }: Props) {
  const [held, setHeld] = useState(false);
  const sticky = toast !== null && !autoDismisses(toast);
  const action = toast?.action;
  const hasControls = sticky || action !== undefined;
  // Focus rings sit on the toast's own fill, so they take that fill's text color rather than the accent.
  const ring = toast?.tone === "danger" ? "focus-visible:outline-on-danger" : "focus-visible:outline-bg";

  useEffect(() => {
    if (!toast || !autoDismisses(toast) || held) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [toast, held, durationMs, onDismiss]);

  return (
    <div
      role="status"
      data-testid="toast"
      className={`fixed left-1/2 z-[60] w-max max-w-[calc(100%-2.5rem)] -translate-x-1/2 ${
        raised ? "bottom-[calc(9.5rem+env(safe-area-inset-bottom))]" : "bottom-[calc(5.5rem+env(safe-area-inset-bottom))]"
      }`}
      style={bottomOffset !== undefined ? { bottom: bottomOffset } : undefined}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      {toast ? (
        <div
          key={toast.id}
          className={`pop flex min-h-11 items-center gap-1 rounded-2xl pl-4 shadow-2xl ${hasControls ? "pr-1" : "pr-4"} ${
            toast.tone === "danger" ? "bg-danger text-on-danger" : "bg-fg text-bg"
          }`}
        >
          <span className="tnum min-w-0 flex-1 text-pretty py-3 text-sm font-semibold">{toast.text}</span>
          {action ? (
            <button
              type="button"
              data-testid="toast-action"
              onClick={() => {
                onDismiss();
                action.onClick();
              }}
              className={`tap min-h-11 shrink-0 rounded-xl px-3 text-sm font-bold underline underline-offset-2 active:bg-bg/15 ${ring}`}
            >
              {action.label}
            </button>
          ) : null}
          {sticky ? (
            <button
              type="button"
              aria-label="Dismiss notice"
              data-testid="toast-dismiss"
              onClick={onDismiss}
              className={`tap grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-bg/15 ${ring}`}
            >
              <X size={18} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function useToast() {
  const [queue, setQueue] = useState<ToastData[]>([]);
  const seq = useRef(0);

  const show = useCallback((text: string, tone: ToastTone = "default", action?: ToastAction, opts?: { sticky?: boolean }) => {
    seq.current += 1;
    const next: ToastData = { id: seq.current, text, tone, action, sticky: opts?.sticky };
    setQueue((q) => enqueue(q, next));
  }, []);

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  return { toast: queue[0] ?? null, show, dismiss };
}
