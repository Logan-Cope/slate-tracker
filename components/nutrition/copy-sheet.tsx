"use client";

import { useId, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { FieldError } from "@/components/ui/field-error";
import { humanDate, isDateString, shiftDate } from "@/lib/utils/date";

type Props = {
  open: boolean;
  title: string;
  /** The day being copied from; quick picks are relative to it. */
  fromDate: string;
  today: string;
  onClose: () => void;
  onConfirm: (toDate: string) => void;
};

/** Pick a target day for a copy: quick chips plus the native date picker. */
export function CopySheet({ open, title, fromDate, today, onClose, onConfirm }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={title} compact>
      {open ? <Body fromDate={fromDate} today={today} onConfirm={onConfirm} /> : null}
    </Sheet>
  );
}

function Body({ fromDate, today, onConfirm }: Pick<Props, "fromDate" | "today" | "onConfirm">) {
  const [toDate, setToDate] = useState(shiftDate(fromDate, 1));
  const [attempted, setAttempted] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const quick = [shiftDate(fromDate, -1), today, shiftDate(fromDate, 1)].filter((d, i, all) => d !== fromDate && all.indexOf(d) === i);
  // The copy button stays live; copying a day onto itself is caught on submit and explained under the date.
  const sameDay = toDate === fromDate;
  const error = attempted && sameDay ? `Pick a day other than ${humanDate(fromDate, today)}` : null;

  return (
    <form
      className="flex flex-col gap-4 pb-2"
      data-testid="copy-sheet"
      onSubmit={(e) => {
        e.preventDefault();
        if (sameDay) {
          setAttempted(true);
          dateRef.current?.focus();
          return;
        }
        onConfirm(toDate);
      }}
    >
      <div className="flex flex-wrap gap-2">
        {quick.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setToDate(d)}
            className={`tap min-h-11 rounded-full border px-4 text-sm font-semibold ${
              d === toDate ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface"
            }`}
          >
            {humanDate(d, today)}
          </button>
        ))}
      </div>
      <div>
        <input
          ref={dateRef}
          type="date"
          className="input aria-invalid:border-danger"
          value={toDate}
          aria-label="Copy to date"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          data-testid="copy-date"
          onChange={(e) => {
            if (isDateString(e.target.value)) setToDate(e.target.value);
          }}
        />
        <FieldError id={errorId} message={error} data-testid="copy-date-error" />
      </div>
      <button type="submit" className="btn-primary w-full" data-testid="copy-confirm">
        Copy to {humanDate(toDate, today)}
      </button>
    </form>
  );
}
