/**
 * Shapes for the tab skeletons (components/tab-skeletons.tsx): low-contrast
 * blocks where the page's own frame lands, so nothing jumps when the page
 * arrives. No text.
 */
export function Bone({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-surface-2 ${className}`} />;
}

/**
 * One line of text: a box the height of the line (`line`, e.g. "h-5") holding a
 * thinner bar, so a column of these stacks like the text it stands for.
 */
export function Line({ line, bar, className = "" }: { line: string; bar: string; className?: string }) {
  return (
    <div className={`flex items-center ${line} ${className}`}>
      <Bone className={bar} />
    </div>
  );
}

/** The PageHeader frame: a title, an optional subtitle and an optional control on the right. */
export function HeaderBones({ subtitle = true, right = false }: { subtitle?: boolean; right?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
      <div>
        <Line line="h-8" bar="h-6 w-28" />
        {subtitle ? <Line line="h-5" bar="h-3.5 w-40" className="mt-0.5" /> : null}
      </div>
      {right ? <Bone className="h-9 w-24" /> : null}
    </div>
  );
}
