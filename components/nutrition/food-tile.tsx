"use client";

import { Plus } from "lucide-react";
import { fmtG, fmtKcal } from "@/lib/utils/format";
import { formatAmount, safeCompute } from "./amounts";
import type { Amount, FoodSummary } from "./types";

type Props = {
  food: FoodSummary;
  /** What one tap on + logs. */
  amount: Amount;
  onOpen: () => void;
  onAdd: () => void;
};

/** One row in a food list: body opens the detail sheet, the round + logs immediately. */
export function FoodTile({ food, amount, onOpen, onAdd }: Props) {
  const c = safeCompute(food, amount.qty, amount.unit);
  const sub = [food.brand, formatAmount(amount.qty, amount.unit, food.servingLabel)].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center" data-testid={`food-tile-${food.id}`}>
      <button type="button" onClick={onOpen} className="tap flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left active:bg-surface-2 focus-visible:-outline-offset-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-snug">{food.name}</div>
          <div className="truncate text-sm text-muted">{sub}</div>
        </div>
        <div className="tnum shrink-0 text-right">
          <div className="font-bold text-accent-ink">{c ? fmtKcal(c.kcal) : "?"}</div>
          <div className="text-xs font-semibold text-protein-ink">{c ? `${fmtG(c.proteinG)} g` : ""}</div>
        </div>
      </button>
      <div className="shrink-0 py-2 pl-1 pr-3">
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${food.name}`}
          data-testid={`food-tile-add-${food.id}`}
          className="tap grid h-11 w-11 place-items-center rounded-full bg-accent text-on-accent shadow-sm motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:enabled:active:scale-[0.96]"
        >
          <Plus size={24} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function TileList({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div className="card divide-y divide-line overflow-hidden" data-testid={testId}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted">{children}</h2>
      {right}
    </div>
  );
}
