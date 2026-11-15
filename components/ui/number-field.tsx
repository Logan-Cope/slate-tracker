"use client";

import { forwardRef } from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "onChange" | "size"> & {
  /** Raw text, so partial input like "1." is preserved while typing. */
  value: string;
  onChange: (text: string) => void;
  suffix?: string;
  /** Larger variant for the main number on a screen. */
  size?: "md" | "xl";
  "data-testid"?: string;
};

/**
 * Decimal input that opens the numeric keypad on iPhone. Always text + decimal
 * inputMode; type="number" is broken for decimals on iOS.
 */
export const NumberField = forwardRef<HTMLInputElement, Props>(function NumberField(
  { value, onChange, suffix, size = "md", className = "", ...rest },
  ref,
) {
  return (
    <div className={`relative ${className}`}>
      <input
        ref={ref}
        {...rest}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        className={`input tnum aria-invalid:border-danger ${size === "xl" ? "text-4xl font-bold py-4 text-center" : ""} ${suffix ? "pr-14" : ""}`}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted font-medium">
          {suffix}
        </span>
      ) : null}
    </div>
  );
});
