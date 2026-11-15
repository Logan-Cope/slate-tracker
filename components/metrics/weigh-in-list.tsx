"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { removeWeighIn, saveWeighIn } from "@/app/(app)/weight/actions";
import { Toast, useToast } from "@/components/nutrition/toast";
import { humanDate } from "@/lib/utils/date";
import { fmtWeight } from "@/lib/utils/format";

type Row = { id: string; date: string; value: number; trend: number | null };

/**
 * Past weigh-ins with a one-tap delete. Deleting is reversible and routine,
 * so it acts at once and offers Undo in the toast instead of asking first.
 */
export function WeighInList({ rows }: { rows: Row[] }) {
  const [, start] = useTransition();
  const { toast, show, dismiss } = useToast();

  const restore = (r: Row) => {
    const retry = { label: "Retry", onClick: () => restore(r) };
    start(async () => {
      try {
        const res = await saveWeighIn({ id: r.id, date: r.date, value: r.value });
        if (!res.ok) show("Could not put the weigh-in back. Log it again from the form above.", "danger", retry);
      } catch {
        show("Could not put the weigh-in back. Check your connection.", "danger", retry);
      }
    });
  };

  const remove = (r: Row) => {
    start(async () => {
      try {
        const res = await removeWeighIn(r.id);
        if (!res.ok) {
          show("That weigh-in is already gone. Reload the page to update the list.", "danger");
          return;
        }
        show(`${fmtWeight(r.value)} lb for ${humanDate(r.date)} deleted.`, "default", { label: "Undo", onClick: () => restore(r) });
      } catch {
        show("Could not delete that weigh-in. Check your connection and try again.", "danger");
      }
    });
  };

  return (
    <>
      {rows.length > 0 ? (
        <section className="mt-6">
          <h2 className="px-5 text-sm font-semibold text-muted uppercase tracking-wide">Recent weigh-ins</h2>
          <ul className="mt-2 divide-y divide-line border-y border-line bg-surface">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3" data-testid={`weigh-in-row-${r.date}`}>
                <div className="flex-1">
                  <div className="font-medium">{humanDate(r.date)}</div>
                  <div className="text-xs text-muted">{r.date}</div>
                </div>
                <div className="text-right tnum">
                  <div className="font-bold">{fmtWeight(r.value)} lb</div>
                  {r.trend !== null ? <div className="text-xs text-muted">trend {fmtWeight(r.trend)}</div> : null}
                </div>
                <button type="button" className="tap -mr-2 p-2 text-muted" aria-label={`Delete weigh-in for ${r.date}`} onClick={() => remove(r)}>
                  <X size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Toast toast={toast} onDismiss={dismiss} />
    </>
  );
}
