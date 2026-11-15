import { switchProfile } from "@/app/(app)/coach/actions";

type Props = {
  profiles: { id: number; name: string }[];
  activeId: number;
  highlight: boolean;
};

/** Coach-only strip showing whose data is on screen, with a one-tap switch. */
export function ProfileBanner({ profiles, activeId, highlight }: Props) {
  const active = profiles.find((p) => p.id === activeId);
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-1.5 text-xs font-semibold ${
        highlight ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"
      }`}
    >
      <span>Viewing {active?.name ?? "profile"}</span>
      {profiles.length > 1 ? (
        <form action={switchProfile} className="flex items-center gap-2">
          <select
            name="profileId"
            defaultValue={activeId}
            className="rounded-md bg-transparent px-1 py-0.5 text-base font-semibold underline sm:text-xs"
            aria-label="Switch profile"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="underline">
            Switch
          </button>
        </form>
      ) : null}
    </div>
  );
}
