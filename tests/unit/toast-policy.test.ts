import { describe, expect, it } from "vitest";
import { autoDismisses, enqueue, TOAST_DURATION_MS, type ToastData } from "@/components/nutrition/toast-policy";

// Review rows 3 and 6: a toast that carries an error, an action or information
// waits for the person; only plain success notices go away on their own, and
// never before five seconds. A waiting toast is never replaced underneath her.

const undo = { label: "Undo", onClick: () => {} };

function toast(over: Partial<ToastData> & { id: number }): ToastData {
  return { text: "x", tone: "default", ...over };
}

describe("toast auto-dismiss policy", () => {
  it("lets a plain success notice time out, after at least five seconds", () => {
    expect(autoDismisses({ tone: "default" })).toBe(true);
    expect(autoDismisses({ tone: "default", action: undefined })).toBe(true);
    expect(TOAST_DURATION_MS).toBeGreaterThanOrEqual(5000);
  });

  it("keeps a danger toast until dismissed", () => {
    expect(autoDismisses({ tone: "danger" })).toBe(false);
  });

  it("keeps any toast that offers an action, whatever its tone", () => {
    expect(autoDismisses({ tone: "default", action: undo })).toBe(false);
    expect(autoDismisses({ tone: "danger", action: { label: "Retry", onClick: () => {} } })).toBe(false);
  });

  it("keeps a notice marked sticky, since it carries information rather than a confirmation", () => {
    expect(autoDismisses({ tone: "default", sticky: true })).toBe(false);
  });
});

describe("toast queue", () => {
  const success = toast({ id: 1, text: "Added" });
  const failure = toast({ id: 2, text: "Could not add", tone: "danger" });
  const deleted = toast({ id: 3, text: "Deleted.", action: undo });

  it("shows the first toast straight away", () => {
    expect(enqueue([], success)).toEqual([success]);
    expect(enqueue([], failure)).toEqual([failure]);
  });

  it("replaces a success notice with whatever comes next", () => {
    expect(enqueue([success], failure)).toEqual([failure]);
    expect(enqueue([success], toast({ id: 4, text: "Moved" }))).toEqual([toast({ id: 4, text: "Moved" })]);
  });

  it("never replaces a failure or an undo before she dismisses it: a later success is dropped", () => {
    expect(enqueue([failure], success)).toEqual([failure]);
    expect(enqueue([deleted], success)).toEqual([deleted]);
  });

  it("lines a second waiting toast up behind the first", () => {
    expect(enqueue([failure], deleted)).toEqual([failure, deleted]);
    expect(enqueue([failure, deleted], toast({ id: 5, tone: "danger" }))).toEqual([failure, deleted, toast({ id: 5, tone: "danger" })]);
  });

  it("does not mutate the queue it was given", () => {
    const queue = [failure];
    enqueue(queue, deleted);
    expect(queue).toEqual([failure]);
  });
});
