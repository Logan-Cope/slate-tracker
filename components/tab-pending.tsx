"use client";

import { createContext, startTransition, use, useLayoutEffect, useOptimistic } from "react";
import { TAB_SKELETONS } from "@/components/tab-skeletons";

/**
 * The tab the person just tapped, until its navigation is over. The tab bar
 * lights it and TabMain swaps the page for its skeleton, both in the frame after
 * the tap. This is an optimistic value rather than a loading.tsx on purpose: a
 * Suspense fallback makes React hold the page back until at least 300 ms after the
 * fallback appeared, while this way the page shows the moment Next commits it.
 *
 * start() runs in the click that starts Next's navigation, so its transition
 * shares that navigation's lane. React drops the value when the lane commits:
 * when the page lands, and when Back, Forward, another tab or any other
 * navigation takes over (Next's router state entangles them). Nothing has to
 * clear it, so nothing can leave it behind.
 */
type Ctx = { lit: string | null; start: (href: string | null) => void };

const PendingTab = createContext<Ctx>({ lit: null, start: () => undefined });

export function PendingTabProvider({ children }: { children: React.ReactNode }) {
  const [lit, setLit] = useOptimistic<string | null>(null);
  const start = (href: string | null) => startTransition(() => setLit(href));
  return <PendingTab value={{ lit, start }}>{children}</PendingTab>;
}

export function usePendingTab(): Ctx {
  return use(PendingTab);
}

/**
 * The main landmark: the page, or while a tab is on its way, that tab's skeleton
 * from the top of the screen. The page stays mounted, out of sight.
 */
export function TabMain({ switcher, className, children }: { switcher: boolean; className: string; children: React.ReactNode }) {
  const { lit } = usePendingTab();
  const Skeleton = lit ? TAB_SKELETONS[lit] : undefined;
  useLayoutEffect(() => {
    if (Skeleton) scrollTo(0, 0);
  }, [Skeleton]);
  return (
    // id and tabIndex let a closing sheet hand focus here when the control that opened it is gone.
    <main id="main" tabIndex={-1} aria-busy={Skeleton ? true : undefined} className={className}>
      {Skeleton ? <Skeleton switcher={switcher} /> : null}
      <div className={Skeleton ? "hidden" : "contents"}>{children}</div>
    </main>
  );
}
