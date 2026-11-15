"use client";

import { Sheet } from "@/components/ui/sheet";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  testId?: string;
  danger?: boolean;
};

/** A short list of actions in a compact bottom sheet (the "..." menus). */
export function MenuSheet({ open, title, items, onClose }: { open: boolean; title?: string; items: MenuItem[]; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} compact>
      <ul className="flex flex-col gap-1 pb-2">
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              data-testid={item.testId}
              onClick={item.onSelect}
              className={`tap flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold active:bg-surface-2 ${
                item.danger ? "text-danger" : ""
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
