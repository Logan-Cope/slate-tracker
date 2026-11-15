"use client";

import { useFormStatus } from "react-dom";

export function StartButton({ routineId, variant = "primary" }: { routineId: number; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  const cls =
    variant === "primary"
      ? "btn-primary w-full"
      : "tap inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-bold text-accent-ink";
  return (
    <button
      type="submit"
      aria-disabled={pending}
      onClick={(e) => {
        if (pending) e.preventDefault();
      }}
      className={cls}
      data-testid={`start-routine-${routineId}`}
    >
      {pending ? "Starting…" : "Start"}
    </button>
  );
}
