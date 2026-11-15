/**
 * Toast shapes and the rules about their lifetime. Pure so it can be unit
 * tested; the rendering and the timer live in ./toast.tsx.
 */
export type ToastTone = "default" | "danger";

export type ToastAction = { label: string; onClick: () => void };

export type ToastData = {
  id: number;
  text: string;
  tone: ToastTone;
  action?: ToastAction;
  /** Information she may need (not a plain confirmation): waits to be dismissed even without an action. */
  sticky?: boolean;
};

/** How long a notice that times out stays on screen. WCAG asks for at least 5 seconds. */
export const TOAST_DURATION_MS = 5000;

/** Success notices go on their own; anything carrying an error, an action or information waits for the person. */
export function autoDismisses(toast: Pick<ToastData, "tone" | "action" | "sticky">): boolean {
  return toast.tone !== "danger" && toast.action === undefined && toast.sticky !== true;
}

/**
 * Where a new toast goes. The head of the queue is the one on screen. A notice
 * that times out gives way to whatever comes next. A toast that waits for the
 * person is never replaced: a later waiting toast lines up behind it, and a
 * later plain notice is dropped, since the screen it confirms already shows
 * the result (a new row, a changed total).
 */
export function enqueue(queue: readonly ToastData[], next: ToastData): ToastData[] {
  const head = queue[0];
  if (head === undefined || autoDismisses(head)) return [next];
  if (autoDismisses(next)) return [...queue];
  return [...queue, next];
}
