import { getActiveProfileId } from "@/lib/auth/session";
import { listWorkouts } from "@/lib/db/queries/training";
import { toSummaryDTO } from "@/lib/training/workout-store";
import { PageHeader } from "@/components/ui/page-header";
import { BackLink } from "@/components/training/back-link";
import { HistoryList } from "@/components/training/history-list";

const PAGE_SIZE = 20;

export default async function HistoryPage() {
  const profileId = await getActiveProfileId();
  const rows = await listWorkouts(profileId, { limit: PAGE_SIZE });
  return (
    <div className="pb-8">
      <PageHeader title="History" left={<BackLink href="/train" label="Back to Train" />} />
      <div className="px-4">
        <HistoryList initial={rows.map(toSummaryDTO)} pageSize={PAGE_SIZE} />
      </div>
    </div>
  );
}
