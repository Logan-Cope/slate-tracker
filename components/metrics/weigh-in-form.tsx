"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import { saveWeighIn } from "@/app/(app)/weight/actions";
import { TOAST_DURATION_MS } from "@/components/nutrition/toast-policy";
import { newId } from "@/lib/utils/uuid";
import { fmtWeight, parseDecimal } from "@/lib/utils/format";
import { todayLocal } from "@/lib/utils/date";

type Props = { loggedToday: boolean; today: string };

/** Two taps and a number: focus is on the field, Save is one tap away. */
export function WeighInForm({ loggedToday, today }: Props) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // A saved confirmation is low stakes, so it may clear itself, but not before the five seconds a toast gets.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [saved]);

  const submit = () => {
    if (pending) return;
    const value = parseDecimal(text);
    if (value === null || value <= 0) {
      setError("Enter a weight like 131.4");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    // The phone decides what day it is, not the server.
    const date = todayLocal();
    start(async () => {
      try {
        const res = await saveWeighIn({ id: newId(), date, value });
        if (res.ok) setSaved(`${fmtWeight(res.value)} lb saved for ${res.date === today ? "today" : res.date}`);
        else {
          setError(res.error);
          inputRef.current?.focus();
        }
      } catch {
        setError("Could not save. Check your connection and try again.");
      }
    });
  };

  return (
    <form
      className="card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="block text-sm font-medium text-muted mb-2" htmlFor="weigh-in">
        {loggedToday ? "Today's weight (edit to correct)" : "Today's weight"}
      </label>
      <div className="flex items-stretch gap-3">
        <NumberField
          ref={inputRef}
          id="weigh-in"
          data-testid="weigh-in-input"
          value={text}
          onChange={setText}
          size="xl"
          suffix="lb"
          placeholder="0"
          className="flex-1 [&_input:focus::placeholder]:opacity-0"
          aria-label="Weight in pounds"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "weigh-in-error" : undefined}
        />
        <button type="submit" className="btn-primary px-5" aria-disabled={pending} data-testid="weigh-in-save" aria-label="Save weight">
          {pending ? <Loader2 size={26} className="animate-spin" aria-hidden /> : <Check size={26} strokeWidth={3} aria-hidden />}
        </button>
      </div>
      <p className={saved ? "mt-3 text-sm font-semibold text-success pop" : ""} role="status" data-testid="weigh-in-saved">
        {saved}
      </p>
      <p id="weigh-in-error" className={error ? "mt-3 text-sm text-danger" : ""} role="alert" data-testid="weigh-in-error">
        {error}
      </p>
    </form>
  );
}
