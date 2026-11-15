import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { WorkoutSummaryDTO } from "@/lib/training/workout-store";
import { workoutStatsLine } from "./format";
import { LocalTime } from "./local-time";

export function WorkoutRow({ w }: { w: WorkoutSummaryDTO }) {
  return (
    <Link href={`/train/workout/${w.id}`} className="tap flex items-center gap-3 px-4 py-3 focus-visible:-outline-offset-2" data-testid={`workout-row-${w.id}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{w.title}</span>
          {w.finishedAt === null ? <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-ink">In progress</span> : null}
        </div>
        <div className="tnum text-sm text-muted">
          <LocalTime iso={w.startedAt} mode="date" /> · {workoutStatsLine(w)}
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
