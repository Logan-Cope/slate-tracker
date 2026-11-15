"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Dumbbell, Scale, Settings, UtensilsCrossed } from "lucide-react";
import { usePendingTab } from "@/components/tab-pending";

const tabs = [
  { href: "/today", label: "Today", Icon: UtensilsCrossed },
  { href: "/train", label: "Train", Icon: Dumbbell },
  { href: "/weight", label: "Weight", Icon: Scale },
];
const settingsTab = { href: "/settings", label: "Settings", Icon: Settings };

const isUnder = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/** A plain left click or tap: Cmd, Ctrl, Shift and Alt clicks open elsewhere and leave this page as it is. */
const isPlainClick = (e: MouseEvent) => !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export function BottomTabs({ isCoach }: { isCoach: boolean }) {
  const pathname = usePathname();
  const all = isCoach ? [...tabs, { href: "/coach", label: "Coach", Icon: ClipboardList }, settingsTab] : [...tabs, settingsTab];

  // The tapped tab lights up on the tap; aria-current stays with the page on screen until the new one commits.
  const { lit, start } = usePendingTab();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid auto-cols-fr grid-flow-col">
        {all.map(({ href, label, Icon }) => {
          const current = isUnder(pathname, href);
          const shown = lit ? lit === href : current;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                onClick={(e) => {
                  // The tab already on screen just reloads in place; from one of its inner pages it shows its skeleton.
                  if (isPlainClick(e)) start(pathname === href ? null : href);
                }}
                className={`tap flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${shown ? "text-accent-ink" : "text-muted"}`}
              >
                <Icon size={24} strokeWidth={shown ? 2.5 : 2} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
