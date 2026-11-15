"use client";

import type { UnitOption } from "@/lib/nutrition/servings";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Horizontal unit picker: label serving first, then g / oz, then alternates. */
export function UnitChips({ units, value, onChange }: { units: UnitOption[]; value: string; onChange: (unit: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Unit" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
      {units.map((u) => {
        const active = u.unit === value;
        return (
          <button
            key={u.unit}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`unit-${slug(u.unit)}`}
            onClick={() => onChange(u.unit)}
            className={`tap min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors ${
              active ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-fg"
            }`}
          >
            {u.label}
          </button>
        );
      })}
    </div>
  );
}
