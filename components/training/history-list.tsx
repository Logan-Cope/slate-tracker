"use client";

import { useState } from "react";
import { loadMoreWorkoutsAction } from "@/app/(app)/train/actions";
import type { WorkoutSummaryDTO } from "@/lib/training/workout-store";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkoutRow } from "./workout-row";

export function HistoryList({ initial, pageSize }: { initial: WorkoutSummaryDTO[]; pageSize: number }) {
  const [rows, setRows] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length >= pageSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async () => {
    const last = rows[rows.length - 1];
    if (!last || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await loadMoreWorkoutsAction(last.startedAt);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows((r) => [...r, ...res.workouts]);
      setHasMore(res.workouts.length >= res.pageSize);
    } catch {
      setError("Could not load more. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (rows.length === 0) {
    return <EmptyState title="No workouts yet" body="Finished workouts show up here." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card divide-y divide-line overflow-hidden" data-testid="history-list">
        {rows.map((w) => (
          <WorkoutRow key={w.id} w={w} />
        ))}
      </div>
      <p role="alert" className={error ? "text-sm text-danger" : ""}>
        {error}
      </p>
      {hasMore ? (
        <button type="button" onClick={loadMore} disabled={loading} className="btn-secondary w-full" data-testid="load-more">
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
