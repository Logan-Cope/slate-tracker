"use client";

import { useActionState } from "react";
import { saveTargets, type TargetFormState } from "@/app/(app)/coach/actions";

type Initial = { kcal: number; proteinG: number; carbsG: number | null; fatG: number | null };

export function TargetsForm({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState<TargetFormState, FormData>(saveTargets, { error: null, saved: false });
  return (
    <form action={action} className="mt-3 grid grid-cols-2 gap-3">
      <Field name="kcal" label="Calories" defaultValue={initial.kcal} suffix="cal" testId="target-kcal" />
      <Field name="proteinG" label="Protein" defaultValue={initial.proteinG} suffix="g" testId="target-protein" />
      <Field name="carbsG" label="Carbs (optional)" defaultValue={initial.carbsG} suffix="g" />
      <Field name="fatG" label="Fat (optional)" defaultValue={initial.fatG} suffix="g" />
      <div className="col-span-2 flex items-center gap-3">
        <button
          type="submit"
          className="btn-primary"
          aria-disabled={pending}
          onClick={(e) => {
            if (pending) e.preventDefault();
          }}
          data-testid="target-save"
        >
          {pending ? "Saving…" : "Save targets"}
        </button>
        <span className="text-sm font-semibold text-success empty:hidden" role="status">
          {state.saved && !pending ? "Saved" : ""}
        </span>
        <span className="text-sm text-danger empty:hidden" role="alert">
          {state.error}
        </span>
      </div>
    </form>
  );
}

function Field({ name, label, defaultValue, suffix, testId }: { name: string; label: string; defaultValue: number | null; suffix: string; testId?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="relative mt-1">
        <input
          name={name}
          type="text"
          inputMode="numeric"
          defaultValue={defaultValue ?? ""}
          className="input tnum pr-14"
          data-testid={testId}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted text-sm">{suffix}</span>
      </div>
    </label>
  );
}
