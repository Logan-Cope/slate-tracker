"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyThemePreference, readThemePreference, subscribeTheme, type ThemePreference } from "@/lib/theme";

const options: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

const serverSnapshot = (): ThemePreference => "system";

export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribeTheme, readThemePreference, serverSnapshot);

  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-2" data-testid="theme-toggle">
      {options.map(({ value, label, Icon }) => {
        const active = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`theme-${value}`}
            onClick={() => applyThemePreference(value)}
            className={`tap flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 text-sm font-semibold transition-colors ${
              active ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-muted"
            }`}
          >
            <Icon size={22} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
