type Props = { value: number; color?: string; height?: number; label?: string };

export function ProgressBar({ value, color = "var(--protein)", height = 10, label }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-line"
      style={{ height }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* Full width, slid left by what is missing: a transform the compositor moves, and the round end keeps its shape. */}
      <div
        className="h-full w-full rounded-full motion-safe:transition-transform motion-safe:duration-400 motion-safe:ease-out"
        style={{ transform: `translateX(${pct - 100}%)`, background: value > 1.15 ? "var(--danger)" : color }}
      />
    </div>
  );
}
