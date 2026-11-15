"use client";

import { useState } from "react";
import { parseDecimal } from "@/lib/utils/format";

type Props = {
  value: number | null;
  onChange: (n: number | null) => void;
  placeholder: string;
  mode: "decimal" | "integer";
  format: (n: number) => string;
  completed: boolean;
  readOnly?: boolean;
  testId: string;
  ariaLabel: string;
};

/**
 * Numeric field that keeps the user's partial text ("102.") while focused and
 * otherwise mirrors the stored number, so programmatic fills (ghost values)
 * show up without fighting the keyboard.
 */
export function NumInput({ value, onChange, placeholder, mode, format, completed, readOnly, testId, ariaLabel }: Props) {
  const [typing, setTyping] = useState<string | null>(null);
  const shown = typing ?? (value === null ? "" : format(value));

  const parse = (text: string): number | null => {
    const n = parseDecimal(text);
    if (n === null) return null;
    return mode === "integer" ? Math.round(n) : n;
  };

  return (
    <input
      type="text"
      inputMode={mode === "integer" ? "numeric" : "decimal"}
      autoComplete="off"
      enterKeyHint="done"
      value={shown}
      placeholder={placeholder}
      readOnly={readOnly}
      aria-label={ariaLabel}
      data-testid={testId}
      onFocus={(e) => {
        setTyping(value === null ? "" : format(value));
        e.currentTarget.select();
      }}
      onBlur={() => setTyping(null)}
      onChange={(e) => {
        const text = e.target.value;
        setTyping(text);
        onChange(parse(text));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`tnum h-12 w-full rounded-xl border text-center text-[1.0625rem] font-semibold placeholder:font-medium placeholder:text-muted focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        completed ? "border-transparent bg-transparent text-protein-ink" : "border-line bg-surface text-fg"
      }`}
    />
  );
}
