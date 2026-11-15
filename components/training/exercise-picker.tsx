"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import type { ExerciseLite } from "./types";

type Props = {
  open: boolean;
  title: string;
  exercises: ExerciseLite[];
  onClose: () => void;
  onPick: (exercise: ExerciseLite) => void;
  onCreate: (name: string) => Promise<ExerciseLite | null>;
};

function matches(ex: ExerciseLite, q: string): boolean {
  const hay = `${ex.name} ${ex.primaryMuscle ?? ""} ${ex.equipment ?? ""}`.toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export function ExercisePicker({ open, title, exercises, onClose, onPick, onCreate }: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const results = (q ? exercises.filter((e) => matches(e, q)) : exercises).slice(0, 60);
  const exact = q.length > 0 && exercises.some((e) => e.name.toLowerCase() === q);

  const close = () => {
    setQuery("");
    setError(null);
    onClose();
  };

  const create = async () => {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await onCreate(name);
      if (created) {
        setQuery("");
        onPick(created);
      } else {
        setError("Could not create that exercise. Try again.");
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title={title} compact>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises"
          autoFocus
          autoComplete="off"
          enterKeyHint="search"
          aria-label="Search exercises"
          data-testid="picker-search"
          className="input"
          style={{ paddingLeft: "2.75rem" }}
        />
      </div>
      <p role="alert" className={error ? "mt-2 text-sm text-danger" : ""}>
        {error}
      </p>
      <ul className="mt-3 divide-y divide-line">
        {q && !exact ? (
          <li>
            <button type="button" onClick={create} disabled={creating} className="tap flex w-full items-center gap-2 py-3 text-left font-semibold text-accent-ink" data-testid="create-exercise">
              <Plus size={18} aria-hidden /> {creating ? "Creating…" : `Create "${query.trim()}"`}
            </button>
          </li>
        ) : null}
        {results.map((ex) => (
          <li key={ex.id}>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                onPick(ex);
              }}
              className="tap flex w-full flex-col items-start py-3 text-left"
              data-testid={`pick-exercise-${ex.id}`}
            >
              <span className="font-semibold">{ex.name}</span>
              {ex.primaryMuscle || ex.equipment ? (
                <span className="text-xs text-muted">{[ex.primaryMuscle, ex.equipment].filter(Boolean).join(" · ")}</span>
              ) : null}
            </button>
          </li>
        ))}
        {results.length === 0 && !q ? <li className="py-6 text-center text-sm text-muted">No exercises yet.</li> : null}
      </ul>
    </Sheet>
  );
}
