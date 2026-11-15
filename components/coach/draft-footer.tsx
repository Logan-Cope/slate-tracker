"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { applyDraftAction, discardDraftAction } from "@/app/(app)/coach/restaurants/actions";

/** Sticky apply/discard bar for a restaurant draft. Sits above the tab bar. */
export function DraftFooter({ draftId, replace }: { draftId: string; replace: boolean }) {
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mt-4 flex gap-2 bg-bg/95 px-5 py-3 backdrop-blur" data-scroll-clearance="draft-footer">
      <form action={applyDraftAction.bind(null, draftId)} className="flex-1">
        <Submit className="btn-primary w-full" label={replace ? "Replace menu" : "Add menu"} testId="draft-apply" />
      </form>
      <form action={discardDraftAction}>
        <Submit className="btn-secondary" label="Discard" testId="draft-discard" />
      </form>
    </div>
  );
}

function Submit({ className, label, testId }: { className: string; label: string; testId: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      aria-disabled={pending}
      onClick={(e) => {
        if (pending) e.preventDefault();
      }}
      data-testid={testId}
    >
      {pending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
      {label}
    </button>
  );
}
