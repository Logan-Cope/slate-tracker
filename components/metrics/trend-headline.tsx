import { fmtWeight } from "@/lib/utils/format";
import { humanDate } from "@/lib/utils/date";

type Props = {
  trend: number | null;
  rate: number | null;
  latest: { date: string; value: number } | null;
  count: number;
};

/** The trend is the headline; the scale reading is the footnote. */
export function TrendHeadline({ trend, rate, latest, count }: Props) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Trend weight</div>
        <div className="tnum text-5xl font-black leading-none mt-1" data-testid="trend-weight">
          {trend !== null ? fmtWeight(trend) : "–"}
          <span className="text-xl font-semibold text-muted ml-1">lb</span>
        </div>
        <div className="mt-2 text-sm" data-testid="weekly-rate">
          {rate !== null ? (
            <>
              <span className={`font-semibold ${rate < 0 ? "text-success" : rate > 0 ? "text-accent-ink" : "text-muted"}`}>
                {rate > 0 ? "+" : ""}
                {fmtWeight(rate)} lb/week
              </span>
              <span className="text-muted"> · trend runs about a week behind the scale</span>
            </>
          ) : (
            <span className="text-muted">
              {count < 8 ? `${8 - count} more daily weigh-ins until the weekly rate shows` : "Weekly rate needs more data"}
            </span>
          )}
        </div>
      </div>
      {latest ? (
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Scale</div>
          <div className="tnum text-2xl font-bold">{fmtWeight(latest.value)}</div>
          <div className="text-xs text-muted">{humanDate(latest.date)}</div>
        </div>
      ) : null}
    </div>
  );
}
