"use client";

import { useId, useRef, useState } from "react";
import { CalendarPlus, Scissors, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { NumberField } from "@/components/ui/number-field";
import { FieldError } from "@/components/ui/field-error";
import { AMOUNT_ERROR, quickAddCheck } from "@/lib/nutrition/amount-check";
import { availableUnits } from "@/lib/nutrition/servings";
import { fmtQty, parseDecimal } from "@/lib/utils/format";
import { safeCompute } from "./amounts";
import { MacroGrid } from "./macro-grid";
import { UnitChips } from "./unit-chips";
import { MEAL_LABELS, MEAL_SLOTS, type EntryDto, type FoodSummary, type MealSlot } from "./types";

export type EntryPatch =
  | { kind: "amount"; qty: number; unit: string }
  | { kind: "quick"; kcal: number; proteinG: number; name: string };

type Props = {
  entry: EntryDto | null;
  food: FoodSummary | null;
  onClose: () => void;
  onSave: (patch: EntryPatch) => void;
  onMove: (meal: MealSlot) => void;
  onCopyTomorrow: () => void;
  onSplit: () => void;
  onDelete: () => void;
};

/** Edit one diary entry: amount and unit (or kcal / protein for quick adds), move, copy, split, delete. */
export function EntrySheet({ entry, food, onClose, ...rest }: Props) {
  return (
    <Sheet open={entry !== null} onClose={onClose} title={entry?.name}>
      {entry ? <Body key={entry.id} entry={entry} food={food} onClose={onClose} {...rest} /> : null}
    </Sheet>
  );
}

type BodyProps = Omit<Props, "entry"> & { entry: EntryDto };

/** Save stays a real button. With nothing changed it simply closes the sheet, the outcome a save would have had. */
type EditorProps = { entry: EntryDto; onSave: (p: EntryPatch) => void; onClose: () => void };

function Body({ entry, food, onClose, onSave, onMove, onCopyTomorrow, onSplit, onDelete }: BodyProps) {
  return (
    <div className="flex flex-col gap-5 pb-2" data-testid="entry-sheet">
      {entry.brand ? <p className="-mt-2 text-sm text-muted">{entry.brand}</p> : null}
      {food ? <AmountEditor entry={entry} food={food} onSave={onSave} onClose={onClose} /> : <QuickEditor entry={entry} onSave={onSave} onClose={onClose} />}

      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Move to</div>
        <div className="grid grid-cols-4 gap-2">
          {MEAL_SLOTS.map((m) => (
            <button
              key={m}
              type="button"
              disabled={m === entry.meal}
              data-testid={`sheet-move-${m}`}
              onClick={() => onMove(m)}
              className={`tap min-h-11 rounded-xl border px-1 text-sm font-semibold ${
                m === entry.meal ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-fg active:bg-surface-2"
              }`}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <button type="button" onClick={onCopyTomorrow} data-testid="sheet-copy-tomorrow" className="btn-secondary w-full">
          <CalendarPlus size={18} aria-hidden />
          Copy to tomorrow
        </button>
        {food?.isMeal ? (
          <button type="button" onClick={onSplit} data-testid="sheet-split" className="btn-secondary w-full">
            <Scissors size={18} aria-hidden />
            Split into items
          </button>
        ) : null}
        <button type="button" onClick={onDelete} data-testid="sheet-delete" className="btn-ghost w-full text-danger">
          <Trash2 size={18} aria-hidden />
          Delete
        </button>
      </div>
    </div>
  );
}

function AmountEditor({ entry, food, onSave, onClose }: EditorProps & { food: FoodSummary }) {
  const units = availableUnits(food, food.servings);
  const [qtyText, setQtyText] = useState(fmtQty(entry.qty));
  const [unit, setUnit] = useState(units.some((u) => u.unit === entry.unit) ? entry.unit : "serving");
  const [attempted, setAttempted] = useState(false);
  const qtyRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const qty = parseDecimal(qtyText);
  const computed = qty !== null && qty > 0 ? safeCompute(food, qty, unit) : null;
  const changed = qty !== entry.qty || unit !== entry.unit;
  const error = attempted && !computed ? AMOUNT_ERROR : null;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!changed) {
          onClose();
          return;
        }
        if (!computed || qty === null) {
          setAttempted(true);
          qtyRef.current?.focus();
          return;
        }
        onSave({ kind: "amount", qty, unit });
      }}
    >
      <div>
        <NumberField
          ref={qtyRef}
          size="xl"
          value={qtyText}
          onChange={setQtyText}
          aria-label="Amount"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          data-testid="sheet-amount"
        />
        <FieldError id={errorId} message={error} data-testid="sheet-amount-error" />
      </div>
      <UnitChips units={units} value={unit} onChange={setUnit} />
      <MacroGrid values={computed} testId="sheet-preview" />
      <button type="submit" className="btn-primary w-full" data-testid="sheet-save">
        Save
      </button>
    </form>
  );
}

function QuickEditor({ entry, onSave, onClose }: EditorProps) {
  const [kcal, setKcal] = useState(fmtQty(entry.kcal));
  const [protein, setProtein] = useState(fmtQty(entry.proteinG));
  const [name, setName] = useState(entry.name);
  const [attempted, setAttempted] = useState(false);
  const kcalRef = useRef<HTMLInputElement>(null);
  const proteinRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const check = quickAddCheck(kcal, protein);
  const errors = attempted ? check : null;
  const v = check.values;
  const changed = v === null || v.kcal !== entry.kcal || v.proteinG !== entry.proteinG || name.trim() !== entry.name;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!changed) {
          onClose();
          return;
        }
        if (!check.values) {
          setAttempted(true);
          (check.kcal ? kcalRef : proteinRef).current?.focus();
          return;
        }
        onSave({ kind: "quick", ...check.values, name: name.trim() });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Calories</span>
            <NumberField
              ref={kcalRef}
              value={kcal}
              onChange={setKcal}
              suffix="cal"
              aria-invalid={errors?.kcal ? true : undefined}
              aria-describedby={errors?.kcal ? `${errorId}-kcal` : undefined}
              data-testid="sheet-kcal"
            />
          </label>
          <FieldError id={`${errorId}-kcal`} message={errors?.kcal ?? null} data-testid="sheet-kcal-error" />
        </div>
        <div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Protein</span>
            <NumberField
              ref={proteinRef}
              value={protein}
              onChange={setProtein}
              suffix="g"
              aria-invalid={errors?.protein ? true : undefined}
              aria-describedby={errors?.protein ? `${errorId}-protein` : undefined}
              data-testid="sheet-protein"
            />
          </label>
          <FieldError id={`${errorId}-protein`} message={errors?.protein ?? null} data-testid="sheet-protein-error" />
        </div>
      </div>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" data-testid="sheet-name" />
      <button type="submit" className="btn-primary w-full" data-testid="sheet-save">
        Save
      </button>
    </form>
  );
}
