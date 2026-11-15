"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { humanDate, isDateString, shiftDate } from "@/lib/utils/date";

type Props = { date: string; today: string; onChange: (date: string) => void };

/** Previous / next day chevrons around the day label; the label opens the native date picker. */
export function DateStrip({ date, today, onChange }: Props) {
  const title = humanDate(date, today);
  const showFull = title !== format(parseISO(date), "EEE, MMM d");
  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label="Previous day"
        data-testid="date-prev"
        onClick={() => onChange(shiftDate(date, -1))}
        className="tap grid h-11 w-11 place-items-center rounded-full text-muted active:bg-surface-2"
      >
        <ChevronLeft size={26} />
      </button>
      <label className="tap relative flex min-w-0 flex-1 flex-col items-center justify-center py-1 text-center">
        <span className="text-pretty text-2xl font-black leading-tight tracking-tight" data-testid="date-label">
          {title}
        </span>
        {showFull ? <span className="text-xs font-medium text-muted">{format(parseISO(date), "EEEE, MMM d")}</span> : null}
        <input
          type="date"
          aria-label="Pick a date"
          data-testid="date-pick"
          value={date}
          onChange={(e) => {
            if (isDateString(e.target.value)) onChange(e.target.value);
          }}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker?.();
            } catch {
              // Some browsers only open the picker on their own icon; the tap still focuses the field.
            }
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <button
        type="button"
        aria-label="Next day"
        data-testid="date-next"
        onClick={() => onChange(shiftDate(date, 1))}
        className="tap grid h-11 w-11 place-items-center rounded-full text-muted active:bg-surface-2"
      >
        <ChevronRight size={26} />
      </button>
    </div>
  );
}
