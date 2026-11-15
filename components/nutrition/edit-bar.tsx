"use client";

type Props = {
  /** How many entries are selected. */
  count: number;
  onCopy: () => void;
  onDelete: () => void;
};

/**
 * Fixed just above the tab bar while the diary is in edit mode: the count on
 * the left, Copy to and Delete on the right. Both buttons are unavailable
 * until something is selected. The count span stays mounted so the bar keeps
 * its height when it is empty.
 */
export function EditBar({ count, onCopy, onDelete }: Props) {
  const none = count === 0;
  return (
    <div
      data-testid="edit-bar"
      data-scroll-clearance="edit-bar"
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-lg items-center gap-2 bg-bg/95 px-5 py-3 backdrop-blur"
    >
      <span data-testid="selected-count" className="tnum min-w-0 flex-1 text-sm font-semibold text-muted">
        {count > 0 ? `${count} selected` : ""}
      </span>
      <button type="button" data-testid="edit-copy" onClick={onCopy} disabled={none} className="btn-secondary min-h-11 py-2 disabled:opacity-55">
        Copy to
      </button>
      <button type="button" data-testid="edit-delete" onClick={onDelete} disabled={none} className="btn-ghost min-h-11 py-2 text-danger disabled:opacity-55">
        Delete
      </button>
    </div>
  );
}
