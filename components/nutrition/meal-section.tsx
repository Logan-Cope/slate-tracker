"use client";

import Link from "next/link";
import { Check, Copy, Loader2, Minus, MoreHorizontal, Plus } from "lucide-react";
import { fmtG, fmtKcal } from "@/lib/utils/format";
import { formatAmount, sumDtos } from "./amounts";
import { groupState, type GroupState } from "./selection";
import { MEAL_LABELS, type EntryDto, type FoodSummary, type MealSlot } from "./types";

type Props = {
  meal: MealSlot;
  date: string;
  entries: EntryDto[];
  foods: Record<number, FoodSummary>;
  canCopyYesterday: boolean;
  copying: boolean;
  /** Edit mode: the header and the rows become checkboxes; Add, the menu and Copy yesterday step aside. */
  editing: boolean;
  selected: ReadonlySet<string>;
  onOpenEntry: (id: string) => void;
  onToggleEntry: (id: string) => void;
  onToggleMeal: () => void;
  onCopyYesterday: () => void;
  onMenu: () => void;
};

export function MealSection({
  meal,
  date,
  entries,
  foods,
  canCopyYesterday,
  copying,
  editing,
  selected,
  onOpenEntry,
  onToggleEntry,
  onToggleMeal,
  onCopyYesterday,
  onMenu,
}: Props) {
  const subtotal = sumDtos(entries);
  const label = MEAL_LABELS[meal];
  const state = groupState(
    selected,
    entries.map((e) => e.id),
  );

  return (
    <section className="card mx-5 overflow-hidden" data-testid={`meal-${meal}`} aria-label={label}>
      <header className={`flex items-center gap-1 pl-5 pt-3 ${editing ? "pr-5" : "pr-2"} ${editing && entries.length === 0 ? "pb-3" : "pb-1"}`}>
        <h2 className={`flex-1 text-lg font-bold ${editing && entries.length === 0 ? "pl-9" : ""}`}>
          {editing && entries.length > 0 ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
              data-testid={`meal-${meal}-select`}
              onClick={onToggleMeal}
              className="tap flex min-h-11 w-full items-center gap-3 text-left"
            >
              <SelectCircle state={state} />
              {label}
            </button>
          ) : (
            label
          )}
        </h2>
        {entries.length > 0 ? (
          <span data-testid={`meal-${meal}-kcal`} className={`tnum text-sm font-semibold text-muted ${editing ? "" : "mr-1"}`}>
            {fmtKcal(subtotal.kcal)} cal
          </span>
        ) : null}
        {editing ? null : (
          <button
            type="button"
            aria-label={`${label} options`}
            data-testid={`meal-${meal}-menu`}
            onClick={onMenu}
            className="tap grid h-10 w-10 place-items-center rounded-full text-muted active:bg-surface-2"
          >
            <MoreHorizontal size={22} />
          </button>
        )}
      </header>

      {entries.length > 0 ? (
        <ul data-testid={`meal-${meal}-entries`} className="divide-y divide-line border-t border-line">
          {entries.map((e) => (
            <li key={e.id}>
              <EntryRow
                entry={e}
                food={e.foodId !== null ? foods[e.foodId] : undefined}
                editing={editing}
                checked={selected.has(e.id)}
                onOpen={() => onOpenEntry(e.id)}
                onToggle={() => onToggleEntry(e.id)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {editing ? null : (
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2 pt-1">
          <Link
            href={`/today/add?date=${date}&meal=${meal}`}
            data-testid={`meal-${meal}-add`}
            className="tap inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold text-accent-ink active:bg-accent-soft"
          >
            <Plus size={20} strokeWidth={2.5} aria-hidden />
            Add
          </Link>
          {entries.length === 0 && canCopyYesterday ? (
            <button
              type="button"
              data-testid={`meal-${meal}-copy-yesterday`}
              onClick={onCopyYesterday}
              disabled={copying}
              className="tap inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted active:bg-surface-2 disabled:opacity-60"
            >
              {copying ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Copy size={16} aria-hidden />}
              Copy yesterday&apos;s {label.toLowerCase()}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** The 24px selection circle: empty, a check when selected, a minus when only part of a meal is. */
function SelectCircle({ state }: { state: GroupState }) {
  const tone = state === "all" ? "border-accent bg-accent text-on-accent" : state === "some" ? "border-accent text-accent" : "border-muted";
  return (
    <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 motion-safe:transition-colors motion-safe:duration-150 ${tone}`}>
      {state === "all" ? <Check size={14} strokeWidth={3} /> : state === "some" ? <Minus size={14} strokeWidth={3} /> : null}
    </span>
  );
}

function EntryRow({
  entry,
  food,
  editing,
  checked,
  onOpen,
  onToggle,
}: {
  entry: EntryDto;
  food: FoodSummary | undefined;
  editing: boolean;
  checked: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const amount = amountText(entry, food);
  const sub = [entry.brand, amount].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      role={editing ? "checkbox" : undefined}
      aria-checked={editing ? checked : undefined}
      onClick={editing ? onToggle : onOpen}
      data-testid={`entry-${entry.id}`}
      className="tap flex w-full items-center gap-3 px-5 py-3 text-left active:bg-surface-2 focus-visible:-outline-offset-2"
    >
      {editing ? <SelectCircle state={checked ? "all" : "none"} /> : null}
      <div className="min-w-0 flex-1">
        <div className={`${editing ? "line-clamp-2 text-pretty" : "truncate"} font-medium leading-snug`}>{entry.name}</div>
        {sub ? <div className="truncate text-sm text-muted">{sub}</div> : null}
      </div>
      <div className="tnum shrink-0 text-right">
        <div className="font-semibold">{fmtKcal(entry.kcal)}</div>
        <div className="text-xs font-medium text-protein-ink">{fmtG(entry.proteinG)} g</div>
      </div>
    </button>
  );
}

function amountText(entry: EntryDto, food: FoodSummary | undefined): string | null {
  if (entry.unit === "g" || entry.unit === "oz") return formatAmount(entry.qty, entry.unit, "");
  if (food) return formatAmount(entry.qty, entry.unit, food.servingLabel);
  if (entry.foodId === null && entry.grams === null) return null;
  return formatAmount(entry.qty, entry.unit, entry.grams !== null ? `${fmtG(entry.grams)} g` : "serving");
}
