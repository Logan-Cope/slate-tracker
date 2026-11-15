import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProfileContext, requireCoachPage } from "@/lib/auth/session";
import { getProgram, listExercises } from "@/lib/db/queries/training";
import { PageHeader } from "@/components/ui/page-header";
import { RoutineEditor } from "@/components/coach/routine-editor";
import { createRoutineAction, updateProgramAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const programId = Number(id);
  if (!Number.isInteger(programId)) notFound();
  await requireCoachPage();
  const ctx = await getProfileContext();
  const [data, library] = await Promise.all([getProgram(ctx.profile.id, programId), listExercises(ctx.profile.id)]);
  if (!data) notFound();
  const { program, routines } = data;

  return (
    <div className="pb-8">
      <PageHeader
        title={program.name}
        subtitle={program.isActive ? "Active program" : "Not active"}
        left={
          <Link href="/coach/programs" className="tap -ml-2 p-1 text-muted" aria-label="Back to programs">
            <ChevronLeft size={28} />
          </Link>
        }
      />

      <form action={updateProgramAction.bind(null, program.id)} className="card mx-5 p-4 space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-muted">Program name</span>
          <input name="name" defaultValue={program.name} className="input mt-1" required />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted">Program notes</span>
          <textarea name="notes" defaultValue={program.notes ?? ""} className="input mt-1" rows={5} />
        </label>
        <button type="submit" className="btn-secondary">
          Save program
        </button>
      </form>

      <div className="mt-5 space-y-5">
        {routines.map((r) => (
          <RoutineEditor key={r.id} routine={r} libraryNames={library.map((e) => e.name)} />
        ))}
      </div>

      <form action={createRoutineAction.bind(null, program.id)} className="card mx-5 mt-5 p-4 flex gap-2">
        <input name="name" className="input" placeholder="Total Body C" aria-label="New routine name" required data-testid="new-routine-name" />
        <button type="submit" className="btn-primary shrink-0" data-testid="new-routine-submit">
          Add
        </button>
      </form>
    </div>
  );
}
