"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { parseDecimal } from "@/lib/utils/format";

/** Labelled form row. */
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function FormHeader({ title, backHref, right }: { title: string; backHref: string; right?: React.ReactNode }) {
  return (
    <PageHeader
      title={title}
      right={right}
      left={
        <Link href={backHref} aria-label="Back" data-testid="form-back" className="tap -ml-2 mt-0.5 grid h-9 w-9 place-items-center rounded-full text-muted">
          <ChevronLeft size={26} />
        </Link>
      }
    />
  );
}

export type Optional = { ok: boolean; value: number | null };

/** Blank is fine (null); anything else must parse as a non-negative decimal. */
export function optionalNumber(text: string): Optional {
  if (text.trim() === "") return { ok: true, value: null };
  const n = parseDecimal(text);
  return n === null ? { ok: false, value: null } : { ok: true, value: n };
}

/** Two-tap delete: the first tap arms, the second fires. */
export function DeleteButton({ armed, onClick, pending, label, testId }: { armed: boolean; onClick: () => void; pending: boolean; label: string; testId: string }) {
  return (
    <button type="button" onClick={onClick} disabled={pending} data-testid={testId} className={`btn-ghost w-full ${armed ? "bg-danger text-on-danger" : "text-danger"}`}>
      {armed ? `Tap again to delete ${label}` : `Delete ${label}`}
    </button>
  );
}
