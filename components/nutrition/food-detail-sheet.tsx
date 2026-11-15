"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { NumberField } from "@/components/ui/number-field";
import { FieldError } from "@/components/ui/field-error";
import { AMOUNT_ERROR } from "@/lib/nutrition/amount-check";
import { availableUnits } from "@/lib/nutrition/servings";
import { fmtQty, parseDecimal } from "@/lib/utils/format";
import { safeCompute } from "./amounts";
import { MacroGrid } from "./macro-grid";
import { UnitChips } from "./unit-chips";
import { MEAL_LABELS, type Amount, type FoodSummary, type MealSlot } from "./types";

type Props = {
  food: FoodSummary | null;
  initialAmount: Amount;
  meal: MealSlot;
  /** Where "Edit" goes for own custom foods and meals. */
  editHref?: string;
  onClose: () => void;
  onAdd: (amount: Amount) => void;
};

/** Big amount field with unit chips and live macros, then one button to log. */
export function FoodDetailSheet({ food, onClose, ...rest }: Props) {
  return (
    <Sheet open={food !== null} onClose={onClose} title={food?.name}>
      {food ? <Body key={food.id} food={food} {...rest} /> : null}
    </Sheet>
  );
}

function Body({ food, initialAmount, meal, editHref, onAdd }: Omit<Props, "onClose" | "food"> & { food: FoodSummary }) {
  const units = availableUnits(food, food.servings);
  const [qtyText, setQtyText] = useState(fmtQty(initialAmount.qty));
  const [unit, setUnit] = useState(units.some((u) => u.unit === initialAmount.unit) ? initialAmount.unit : "serving");
  const [attempted, setAttempted] = useState(false);
  const qtyRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const qty = parseDecimal(qtyText);
  const computed = qty !== null && qty > 0 ? safeCompute(food, qty, unit) : null;
  const error = attempted && !computed ? AMOUNT_ERROR : null;

  return (
    <form
      className="flex flex-col gap-4 pb-2"
      data-testid="food-detail"
      onSubmit={(e) => {
        e.preventDefault();
        if (!computed || qty === null) {
          setAttempted(true);
          qtyRef.current?.focus();
          return;
        }
        onAdd({ qty, unit });
      }}
    >
      {food.brand || food.isMeal ? (
        <p className="-mt-2 text-sm text-muted">{food.isMeal ? "Saved meal" : food.brand}</p>
      ) : null}
      <div>
        <NumberField
          ref={qtyRef}
          size="xl"
          value={qtyText}
          onChange={setQtyText}
          autoFocus
          aria-label="Amount"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          data-testid="food-detail-qty"
        />
        <FieldError id={errorId} message={error} data-testid="food-detail-error" />
      </div>
      <UnitChips units={units} value={unit} onChange={setUnit} />
      <MacroGrid values={computed} testId="food-detail-macros" />
      <button type="submit" className="btn-primary w-full" data-testid="food-detail-add">
        Add to {MEAL_LABELS[meal]}
      </button>
      {editHref ? (
        <Link href={editHref} className="btn-ghost w-full" data-testid="food-detail-edit">
          <Pencil size={16} aria-hidden />
          Edit {food.isMeal ? "meal" : "food"}
        </Link>
      ) : null}
    </form>
  );
}
