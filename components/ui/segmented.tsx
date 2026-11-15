"use client";

type Option<T extends string> = { value: T; label: string };

/**
 * Tabs switch what a screen shows. A choice sets a field's value, so it is a
 * radio group to assistive tech while looking the same.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  kind = "tabs",
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  kind?: "tabs" | "choice";
}) {
  const choice = kind === "choice";
  return (
    <div role={choice ? "radiogroup" : "tablist"} aria-label={ariaLabel} className="inline-flex rounded-xl bg-surface-2 p-1 gap-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role={choice ? "radio" : "tab"}
            aria-selected={choice ? undefined : active}
            aria-checked={choice ? active : undefined}
            type="button"
            onClick={() => onChange(o.value)}
            className={`tap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              active ? "bg-surface text-fg shadow-sm" : "text-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
