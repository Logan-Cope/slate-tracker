"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";

type Props = {
  action: () => Promise<void>;
  /** Verb plus object, used on the trigger and again on the confirming button. */
  label: string;
  /** The sheet's title: the action and the object, such as Delete "Total Body A"? */
  confirm: string;
  /** What is lost, so the sheet is answerable without reading further. */
  body?: string;
  className?: string;
};

/** A destructive action behind a confirm sheet whose buttons name the action, never OK and Cancel alone. */
export function ConfirmButton({ action, label, confirm: title, body, className }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const run = () => {
    if (pending) return;
    start(async () => {
      await action();
      setOpen(false);
    });
  };

  return (
    <>
      <button type="button" className={className ?? "text-sm font-semibold text-danger tap py-1"} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Sheet
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={title}
        compact
      >
        {body ? <p className="text-sm text-muted">{body}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setOpen(false)} aria-disabled={pending} className="btn-secondary flex-1">
            Cancel
          </button>
          <button type="button" onClick={run} aria-disabled={pending} className="btn-primary flex-1 bg-danger text-on-danger" data-testid="confirm-destructive">
            {pending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
            {label}
          </button>
        </div>
      </Sheet>
    </>
  );
}
