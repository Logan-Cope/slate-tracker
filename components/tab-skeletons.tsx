/**
 * Each tab's frame while its page is on the way: low-contrast blocks where the
 * page's own header, cards and rows land, sized to them so nothing jumps when the
 * page arrives. Shown by TabMain from the tab bar's pending state, not by a
 * loading.tsx (see components/tab-pending.tsx). No text; the root is an
 * indeterminate progress bar named Loading.
 */
import { Bone, HeaderBones, Line } from "@/components/ui/skeleton";

/** Today's frame while the diary loads: date strip, calories ring with macros, the four meal cards. */
function TodaySkeleton() {
  return (
    <div data-perf="skeleton" role="progressbar" aria-label="Loading" className="pb-6">
      <div aria-hidden className="motion-safe:animate-pulse">
        <div className="flex flex-col items-center px-2 pb-3 pt-2">
          <div className="flex flex-col items-center py-1">
            <Line line="h-[1.875rem]" bar="h-6 w-24" />
            <Line line="h-4" bar="h-3 w-32" />
          </div>
        </div>

        <div className="card mx-5 flex items-center gap-5 p-5">
          <div className="h-[136px] w-[136px] shrink-0 rounded-full border-[12px] border-surface-2" />
          <div className="min-w-0 flex-1">
            <div className="flex h-5 items-center justify-between gap-2">
              <Bone className="h-3.5 w-14" />
              <Bone className="h-3.5 w-16" />
            </div>
            <Bone className="mt-1.5 h-2.5 w-full rounded-full" />
            <div className="mt-4 flex h-4 items-center gap-4">
              <Bone className="h-3 w-10" />
              <Bone className="h-3 w-10" />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card mx-5">
              <div className="pb-1 pl-5 pr-2 pt-3">
                <Line line="h-10" bar="h-5 w-24" />
              </div>
              <div className="px-2 pb-2 pt-1">
                <Line line="min-h-11 px-3" bar="h-4 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Train's frame while the program loads: header, the Up next card, routine rows, recent rows. */
function TrainSkeleton() {
  return (
    <div data-perf="skeleton" role="progressbar" aria-label="Loading" className="pb-8">
      <div aria-hidden className="motion-safe:animate-pulse">
        <HeaderBones />

        <div className="px-4">
          <div className="card p-4">
            <Line line="h-4" bar="h-3 w-16" />
            <Line line="h-8" bar="h-6 w-44" className="mt-0.5" />
            <Line line="h-5" bar="h-3.5 w-24" />
            <div className="mt-3 flex flex-col gap-1">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <Line key={i} line="h-5" bar={`h-3.5 ${i % 3 === 1 ? "w-2/3" : "w-5/6"}`} />
              ))}
            </div>
            <Bone className="mt-4 h-12 w-full rounded-xl" />
          </div>
        </div>

        {[2, 3].map((rows, s) => (
          <section key={s} className="mt-5 px-4">
            <Line line="mb-2 h-4" bar="h-3 w-20" />
            <div className="card divide-y divide-line">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Line line="h-6" bar="h-4 w-36" />
                    <Line line="h-5" bar="h-3.5 w-24" />
                  </div>
                  <Bone className="h-11 w-20 rounded-xl" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Weight's frame while the weigh-ins load: header, the weigh-in card, trend and chart, recent rows. */
function WeightSkeleton() {
  return (
    <div data-perf="skeleton" role="progressbar" aria-label="Loading" className="pb-6">
      <div aria-hidden className="motion-safe:animate-pulse">
        <HeaderBones />

        <section className="px-5">
          <div className="card p-4">
            <Line line="mb-2 h-5" bar="h-3.5 w-28" />
            <div className="flex gap-3">
              <Bone className="h-[4.625rem] flex-1 rounded-xl" />
              <Bone className="h-[4.625rem] w-[4.25rem] rounded-xl" />
            </div>
          </div>
        </section>

        <section className="mt-5 px-5">
          <Line line="h-4" bar="h-3 w-24" />
          <Line line="mt-1 h-12" bar="h-10 w-36" />
          <Line line="mt-2 h-5" bar="h-3.5 w-48" />
          <Line line="h-5" bar="h-3.5 w-40" />
        </section>

        <section className="mt-4 px-5">
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <Bone className="h-3 w-28" />
              <Bone className="h-10 w-36 rounded-xl" />
            </div>
            <Bone className="h-56 w-full" />
          </div>
        </section>

        <section className="mt-6">
          <Line line="h-5 px-5" bar="h-3.5 w-36" />
          <div className="mt-2 divide-y divide-line border-y border-line bg-surface">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1">
                  <Line line="h-6" bar="h-4 w-24" />
                  <Line line="h-4" bar="h-3 w-20" />
                </div>
                <Bone className="h-4 w-16" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Settings' frame while it loads: header and its two cards, with the profile switch when the coach has one. */
function SettingsSkeleton({ switcher }: SkeletonProps) {
  return (
    <div data-perf="skeleton" role="progressbar" aria-label="Loading" className="pb-8">
      <div aria-hidden className="motion-safe:animate-pulse">
        <HeaderBones subtitle={false} />

        <section className="px-5">
          <div className="card p-4">
            <Line line="mb-3 h-6" bar="h-5 w-28" />
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <Bone key={i} className="h-[4.625rem] rounded-xl" />
              ))}
            </div>
          </div>
        </section>

        <section className="mt-4 px-5">
          <div className="card p-4">
            <Line line="h-6" bar="h-5 w-20" />
            <Line line="mt-1 h-5" bar="h-3.5 w-44" />
            {switcher ? (
              <div className="mt-3 flex h-10 items-center gap-2">
                <Bone className="h-3.5 w-14" />
                <Bone className="h-10 flex-1 rounded-xl" />
                <Bone className="h-10 w-20 rounded-xl" />
              </div>
            ) : null}
            <Bone className="mt-3 h-12 w-full rounded-xl" />
          </div>
        </section>
      </div>
    </div>
  );
}

/** Coach's frame while the week summary loads: header, the food table (head, seven days, average), weight and training cards. */
function CoachSkeleton() {
  return (
    <div data-perf="skeleton" role="progressbar" aria-label="Loading" className="pb-8">
      <div aria-hidden className="motion-safe:animate-pulse">
        <HeaderBones right />

        <section className="px-5">
          <div className="card p-4">
            <Line line="h-6" bar="h-5 w-16" />
            <div className="mt-3 flex flex-col">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Line key={i} line="h-[1.9375rem]" bar={`h-3.5 ${i === 0 ? "w-1/2" : "w-full"}`} />
              ))}
            </div>
          </div>
        </section>

        <section className="mt-4 px-5">
          <div className="card p-4">
            <Line line="mb-3 h-6" bar="h-5 w-20" />
            <Line line="h-4" bar="h-3 w-24" />
            <Line line="mt-1 h-12" bar="h-10 w-36" />
            <Line line="mt-2 h-10" bar="h-3.5 w-48" />
          </div>
        </section>

        <section className="mt-4 px-5">
          <div className="card p-4">
            <Line line="h-6" bar="h-5 w-20" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <Bone key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

type SkeletonProps = { switcher: boolean };

export const TAB_SKELETONS: Record<string, (props: SkeletonProps) => React.JSX.Element> = {
  "/today": TodaySkeleton,
  "/train": TrainSkeleton,
  "/weight": WeightSkeleton,
  "/settings": SettingsSkeleton,
  "/coach": CoachSkeleton,
};
