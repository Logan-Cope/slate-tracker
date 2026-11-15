import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import { requireCoachPage } from "@/lib/auth/session";
import { getDraft } from "@/lib/db/queries/restaurant-drafts";
import { fmtG, fmtKcal } from "@/lib/utils/format";
import { PageHeader } from "@/components/ui/page-header";
import { DraftFooter } from "@/components/coach/draft-footer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SHOWN_ITEMS = 60;

const ERRORS: Record<string, string> = {
  already_applied: "This menu was already added. Go back to Coach to see it under Restaurants.",
  expired: "This menu is no longer available. Go back to Coach and find it again.",
  not_found: "This menu is no longer available. Go back to Coach and find it again.",
  empty: "The menu came back empty. Discard it and try again with the address of the nutrition page.",
};

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };

export default async function RestaurantDraftPage({ params, searchParams }: Props) {
  const user = await requireCoachPage();
  if (user.role !== "coach") redirect("/today");
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const draft = await getDraft(id);

  const back = (
    <Link href="/coach" className="tap -ml-2 p-1 text-muted" aria-label="Back to Coach">
      <ChevronLeft size={28} />
    </Link>
  );

  if (!draft) {
    return (
      <div className="pb-8">
        <PageHeader title="Menu" left={back} />
        <div className="card mx-5 p-4">
          <p className="text-sm">{ERRORS.not_found}</p>
          <Link href="/coach" className="mt-3 inline-block text-sm font-semibold text-accent-ink">
            Back to Coach
          </Link>
        </div>
      </div>
    );
  }

  const { items, existing } = draft;
  // An applied draft is a notice, not a failure, so it does not wear the danger color.
  const message = draft.appliedAt ? ERRORS.already_applied : error ? ERRORS[error] : undefined;
  const messageClass = draft.appliedAt ? "mt-2 text-sm text-muted" : "mt-2 text-sm text-danger";
  const shown = items.slice(0, SHOWN_ITEMS);
  const hidden = items.length - shown.length;

  return (
    <div className="pb-8">
      <PageHeader title={draft.restaurantName} subtitle={sourceLabel(draft.sourceUrl, draft.model)} left={back} />

      <section className="px-5">
        <div className="card p-4">
          <p className="text-sm font-semibold">{countLabel(items.length)}</p>
          {existing ? (
            <p className="text-sm text-muted mt-0.5">
              Replaces {countLabel(existing.itemCount)} from {existing.source === "menustat" ? format(parseISO(existing.menuAsOf), "MMM yyyy") : "the last import"}
            </p>
          ) : null}
          {draft.warnings.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-sm text-muted" data-testid="draft-warnings">
              {draft.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
          <p className={message ? messageClass : ""} role="alert" data-testid="draft-error">
            {message}
          </p>
        </div>
      </section>

      <section className="px-5 mt-4">
        <ul className="card divide-y divide-line overflow-hidden" data-testid="draft-items">
          {shown.map((it) => (
            <li key={it.name} className="flex items-center gap-3 px-4 py-3" data-testid="draft-item">
              <div className="min-w-0 flex-1">
                <div className="text-pretty break-words font-semibold leading-snug">{it.name}</div>
                {it.servingLabel ? <div className="text-pretty break-words text-sm text-muted">{it.servingLabel}</div> : null}
              </div>
              <div className="tnum shrink-0 text-right">
                <div className="font-bold text-accent-ink">{fmtKcal(it.kcal)}</div>
                <div className="text-xs font-semibold text-protein-ink">{fmtG(it.proteinG)} g</div>
              </div>
            </li>
          ))}
        </ul>
        {hidden > 0 ? <p className="mt-2 px-1 text-sm text-muted">and {hidden} more</p> : null}
      </section>

      {draft.appliedAt ? null : <DraftFooter draftId={draft.id} replace={existing !== null} />}
    </div>
  );
}

function countLabel(n: number): string {
  return `${n} ${n === 1 ? "item" : "items"}`;
}

/** Bare domain of the source page, or the model name when no page is known. */
function sourceLabel(sourceUrl: string | null, model: string): string {
  if (!sourceUrl) return model;
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return sourceUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? sourceUrl;
  }
}
