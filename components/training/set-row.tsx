"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import type { Ghost } from "@/lib/training/ghost";
import type { PrKind } from "@/lib/training/prs";
import type { ClientSet } from "@/lib/training/workout-store";
import { fmtWeight } from "@/lib/utils/format";
import { prText } from "./format";
import { NumInput } from "./num-input";

const REVEAL = 88;

export const TYPE_BADGE: Record<ClientSet["setType"], { short: string | null; label: string; cls: string }> = {
  normal: { short: null, label: "Working set", cls: "bg-surface-2 text-fg" },
  failure: { short: "F", label: "To failure", cls: "bg-accent-soft text-accent-ink" },
  warmup: { short: "W", label: "Warm-up", cls: "bg-surface-2 text-muted" },
  drop: { short: "D", label: "Drop set", cls: "bg-surface-2 text-fat" },
};

type Props = {
  set: ClientSet;
  ghost: Ghost;
  prKinds: PrKind[] | undefined;
  readOnly: boolean;
  onToggle: () => void;
  onChange: (patch: { weightLb?: number | null; reps?: number | null }) => void;
  onCycleType: () => void;
  onRemove: () => void;
};

type Gesture = { id: number; x: number; y: number; base: number; dx: number; swiping: boolean };

export function SetRow({ set, ghost, prKinds, readOnly, onToggle, onChange, onCycleType, onRemove }: Props) {
  const completed = set.completedAt !== null;
  const n = set.position + 1;
  const badge = TYPE_BADGE[set.setType];

  // Swipe left to reveal Remove. Vertical movement is left to the scroller (touch-action: pan-y).
  const gesture = useRef<Gesture | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const open = dx <= -REVEAL;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, base: open ? -REVEAL : 0, dx: open ? -REVEAL : 0, swiping: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const moveX = e.clientX - g.x;
    const moveY = e.clientY - g.y;
    if (!g.swiping) {
      if (Math.abs(moveX) < 10 || Math.abs(moveX) < Math.abs(moveY)) return;
      g.swiping = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    g.dx = Math.max(-REVEAL, Math.min(0, g.base + moveX));
    setDx(g.dx);
  };
  const endGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !g.swiping) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    setDx(g.dx < -REVEAL / 2 ? -REVEAL : 0);
  };

  return (
    <div className="relative overflow-hidden" data-testid={`set-${set.id}`} data-completed={completed ? "true" : "false"}>
      {dx < 0 ? (
        <button
          type="button"
          onClick={() => {
            setDx(0);
            onRemove();
          }}
          className="tap absolute inset-y-0 right-0 flex items-center justify-center bg-danger text-sm font-bold text-on-danger focus-visible:-outline-offset-2 focus-visible:outline-on-danger"
          style={{ width: REVEAL }}
          data-testid={`set-${set.id}-remove`}
        >
          Remove
        </button>
      ) : null}
      <div
        className={`relative flex touch-pan-y items-center gap-2 px-3 py-1.5 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out ${
          completed ? "bg-protein-soft" : "bg-surface"
        }`}
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClickCapture={(e) => {
          if (!open) return;
          e.preventDefault();
          e.stopPropagation();
          setDx(0);
        }}
      >
        <button
          type="button"
          onClick={onCycleType}
          disabled={readOnly}
          aria-label={`Set ${n}: ${badge.label}. Tap to change the set type`}
          className={`tap tnum grid h-12 w-10 shrink-0 place-items-center rounded-xl text-sm font-black ${completed ? "bg-transparent text-protein-ink" : badge.cls}`}
        >
          {badge.short ?? n}
        </button>
        <div className="flex-1 min-w-0 basis-0">
          <NumInput
            value={set.weightLb}
            onChange={(w) => onChange({ weightLb: w })}
            placeholder={ghost.weightLb !== null ? fmtWeight(ghost.weightLb) : "lb"}
            mode="decimal"
            format={fmtWeight}
            completed={completed}
            readOnly={readOnly}
            testId={`set-${set.id}-weight`}
            ariaLabel={`Set ${n} weight in pounds`}
          />
        </div>
        <div className="flex-1 min-w-0 basis-0">
          <NumInput
            value={set.reps}
            onChange={(r) => onChange({ reps: r })}
            placeholder={ghost.reps !== null ? String(ghost.reps) : "reps"}
            mode="integer"
            format={(x) => String(x)}
            completed={completed}
            readOnly={readOnly}
            testId={`set-${set.id}-reps`}
            ariaLabel={`Set ${n} reps`}
          />
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={onToggle}
            disabled={readOnly}
            aria-pressed={completed}
            aria-label={completed ? `Undo set ${n}` : `Complete set ${n}`}
            data-testid={`set-${set.id}-check`}
            className={`tap grid h-12 w-12 place-items-center rounded-xl transition-colors ${
              completed ? "bg-protein text-bg" : "bg-surface-2 text-muted"
            }`}
          >
            <Check size={26} strokeWidth={3} aria-hidden />
          </button>
          {completed && set.isPr ? (
            <span
              className="pop absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-black leading-none text-on-accent shadow"
              title={prKinds && prKinds.length > 0 ? `New best ${prText(prKinds)}` : "Personal record"}
              aria-label={prKinds && prKinds.length > 0 ? `Personal record: new best ${prText(prKinds)}` : "Personal record"}
              data-testid={`set-${set.id}-pr`}
            >
              PR
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
