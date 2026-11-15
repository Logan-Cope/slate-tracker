"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Keeps the sheet short so the keyboard does not push content off screen. */
  compact?: boolean;
};

/** Controls that can take focus, in the order the sheet offers them. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focusing one of these raises the keyboard, so the sheet never does it on its own; a consumer opts in with autoFocus. */
const TEXT_ENTRY = 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea, [contenteditable]';

/**
 * The opener of a sheet that closed in the same commit another sheet opened
 * (a menu row that opens a confirm). The closing sheet cannot focus it, since
 * the new dialog has already made the page inert, so it leaves it here and the
 * new sheet adopts it as the place its own close returns focus to.
 */
let handedOff: HTMLElement | null = null;

/**
 * Bottom sheet on a native modal dialog. showModal() makes the page behind it
 * inert and owns Escape; the component keeps React state as the source of truth
 * (the cancel event is prevented and reported through onClose, and a close the
 * browser would not let it cancel is reopened unless the consumer closes too),
 * moves focus into the sheet on open and back to the opener on close. Closes on
 * the X, Escape, or a tap on the scrim. Unmounts when closed, so nothing hidden
 * stays in the accessibility tree.
 */
export function Sheet({ open, onClose, title, children, compact }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** What had focus before the sheet opened; set by ShowModal, read on close. */
  const restoreToRef = useRef<HTMLElement | null>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const content = contentRef.current;
    if (!dialog || !content) return;

    // Opened from a row of a sheet that just closed: return focus where that sheet would have.
    if (restoreToRef.current === null && handedOff?.isConnected) restoreToRef.current = handedOff;
    handedOff = null;

    // By now the children have mounted and a consumer autoFocus has already won.
    // Otherwise land on the first control, unless it would raise the keyboard,
    // in which case the sheet itself keeps focus and VoiceOver reads its name.
    if (document.activeElement === dialog) {
      const first = content.querySelector<HTMLElement>(FOCUSABLE);
      if (first && !first.matches(TEXT_ENTRY)) first.focus();
    }

    // ShowModal recorded the opener before it took focus away.
    const opener = restoreToRef.current;

    // The top layer makes the page inert, but iOS Safari still scrolls it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      // Unmounting removes the dialog from the top layer, so the opener is
      // focusable again. While the dialog is still open (dev StrictMode replays
      // this cleanup) the opener is inert and this is a no-op.
      const next = document.querySelector("dialog[open]");
      if (next && next !== dialog) {
        // Another sheet took over in this same commit; it returns focus for both.
        handedOff = opener;
        return;
      }
      if (opener?.isConnected) opener.focus();
      else document.getElementById("main")?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        onClose();
        // Chromium closes a dialog outright on a second Escape with no user
        // activation in between. If the consumer kept the sheet mounted (a
        // pending action), the dialog must come back, or it sits closed and
        // invisible with the body still locked.
        requestAnimationFrame(() => {
          const d = dialogRef.current;
          if (d?.isConnected && !d.open) d.showModal();
        });
      }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // A tap on ::backdrop targets the dialog itself. A drag that starts in
        // the panel and ends on the scrim also does, so both ends must be outside.
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose();
        pressedBackdrop.current = false;
      }}
      className={`pop fixed inset-x-0 top-auto bottom-0 mx-auto my-0 w-full max-w-lg rounded-t-3xl border-0 bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/40 ${
        compact ? "max-h-[70dvh]" : "max-h-[92dvh]"
      } scroll-pt-[4.625rem] overflow-y-auto overscroll-contain`}
    >
      <ShowModal restoreToRef={restoreToRef} />
      <div className="pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-surface px-5 pt-4 pb-2">
          <div className="mx-auto absolute left-1/2 -translate-x-1/2 top-2 h-1 w-10 rounded-full bg-line" aria-hidden />
          {title ? <h2 className="text-lg font-bold mt-2 pr-8 leading-tight">{title}</h2> : <span />}
          <button type="button" onClick={onClose} aria-label="Close dialog" className="tap mt-2 -mr-2 p-2 text-muted">
            <X size={22} />
          </button>
        </div>
        <div ref={contentRef} className="px-5 pb-2">
          {children}
        </div>
      </div>
    </dialog>
  );
}

/**
 * Opens the dialog in a layout effect from its first child. React runs this
 * before the later siblings' mount focus, which is what a child's autoFocus
 * compiles to and which is a no-op inside a dialog that is not yet shown. The
 * dialog's own ref is attached after its children, too late for that.
 */
function ShowModal({ restoreToRef }: { restoreToRef: React.RefObject<HTMLElement | null> }) {
  const anchor = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const dialog = anchor.current?.closest("dialog");
    if (!dialog || dialog.open) return;
    const active = document.activeElement;
    restoreToRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    dialog.showModal();
    dialog.focus();
  }, [restoreToRef]);
  return <span ref={anchor} hidden />;
}
