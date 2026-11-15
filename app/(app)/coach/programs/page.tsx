import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getProfileContext, requireCoachPage } from "@/lib/auth/session";
import { listPrograms } from "@/lib/db/queries/training";
import { PageHeader } from "@/components/ui/page-header";
import { activateProgramAction, createProgramAction } from "../actions";
import { ConfirmButton } from "@/components/coach/confirm-button";
import { deleteProgramAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  await requireCoachPage();
  const ctx = await getProfileContext();
  const programs = await listPrograms(ctx.profile.id);

  return (
    <div className="pb-8">
      <PageHeader
        title="Programs"
        subtitle={`${ctx.profile.name}'s training`}
        left={
          <Link href="/coach" className="tap -ml-2 p-1 text-muted" aria-label="Back to coach">
            <ChevronLeft size={28} />
          </Link>
        }
      />
      <ul className="px-5 space-y-3">
        {programs.map((p) => (
          <li key={p.id} className="card p-4" data-testid={`program-${p.id}`}>
            <div className="flex items-center justify-between gap-3">
              <Link href={`/coach/programs/${p.id}`} className="font-bold text-lg inline-flex items-center gap-1 min-w-0">
                <span className="truncate">{p.name}</span>
                <ChevronRight size={18} className="text-muted shrink-0" />
              </Link>
              {p.isActive ? (
                <span className="text-xs font-semibold rounded-full bg-protein-soft text-protein-ink px-2 py-0.5">Active</span>
              ) : (
                <form action={activateProgramAction.bind(null, p.id)}>
                  <button type="submit" className="btn-ghost text-sm py-1 min-h-0">
                    Make active
                  </button>
                </form>
              )}
            </div>
            {p.notes ? <p className="text-sm text-muted mt-1 whitespace-pre-line line-clamp-2">{p.notes}</p> : null}
            {!p.isActive ? (
              <div className="mt-2">
                <ConfirmButton
                  action={deleteProgramAction.bind(null, p.id)}
                  label="Delete program"
                  confirm={`Delete "${p.name}"?`}
                  body="Its routines and their exercises are removed too. Finished workouts stay in history."
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <form action={createProgramAction} className="card mx-5 mt-5 p-4 space-y-3">
        <h2 className="font-bold">New program</h2>
        <input name="name" className="input" placeholder="Upper / Lower" required data-testid="new-program-name" />
        <textarea name="notes" className="input" rows={3} placeholder="Program notes (optional)" />
        <button type="submit" className="btn-primary" data-testid="new-program-submit">
          Create
        </button>
      </form>
    </div>
  );
}
