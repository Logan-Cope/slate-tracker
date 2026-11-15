"use client";

import { useId, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { NumberField } from "@/components/ui/number-field";
import { FieldError } from "@/components/ui/field-error";
import { quickAddCheck } from "@/lib/nutrition/amount-check";
import { MEAL_LABELS, type MealSlot } from "./types";

export type QuickAddInput = { kcal: number; proteinG: number; name: string };

type Props = { open: boolean; meal: MealSlot; onClose: () => void; onSubmit: (input: QuickAddInput) => void };

/** Calories and protein straight into the diary, no food lookup. */
export function QuickAddSheet({ open, meal, onClose, onSubmit }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Quick add" compact>
      {open ? <Body meal={meal} onSubmit={onSubmit} /> : null}
    </Sheet>
  );
}

function Body({ meal, onSubmit }: Pick<Props, "meal" | "onSubmit">) {
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [name, setName] = useState("");
  // Errors show only after a submit attempt, then track the fields live.
  const [attempted, setAttempted] = useState(false);
  const kcalRef = useRef<HTMLInputElement>(null);
  const proteinRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const check = quickAddCheck(kcal, protein);
  const errors = attempted ? check : null;

  return (
    <form
      className="flex flex-col gap-3 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!check.values) {
          setAttempted(true);
          (check.kcal ? kcalRef : proteinRef).current?.focus();
          return;
        }
        onSubmit({ ...check.values, name: name.trim() });
      }}
    >
      <div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Calories</span>
          <NumberField
            ref={kcalRef}
            size="xl"
            value={kcal}
            onChange={setKcal}
            autoFocus
            suffix="cal"
            aria-label="Calories"
            aria-invalid={errors?.kcal ? true : undefined}
            aria-describedby={errors?.kcal ? `${errorId}-kcal` : undefined}
            data-testid="quick-add-kcal"
          />
        </label>
        <FieldError id={`${errorId}-kcal`} message={errors?.kcal ?? null} data-testid="quick-add-kcal-error" />
      </div>
      <div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Protein</span>
          <NumberField
            ref={proteinRef}
            value={protein}
            onChange={setProtein}
            suffix="g"
            aria-label="Protein"
            aria-invalid={errors?.protein ? true : undefined}
            aria-describedby={errors?.protein ? `${errorId}-protein` : undefined}
            data-testid="quick-add-protein"
          />
        </label>
        <FieldError id={`${errorId}-protein`} message={errors?.protein ?? null} data-testid="quick-add-protein-error" />
      </div>
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (optional)"
        aria-label="Name"
        autoComplete="off"
        data-testid="quick-add-name"
      />
      <button type="submit" className="btn-primary mt-1 w-full" data-testid="quick-add-submit">
        Add to {MEAL_LABELS[meal]}
      </button>
    </form>
  );
}
