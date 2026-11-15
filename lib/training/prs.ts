import type { SetType } from "@/lib/db/schema";

export type PrKind = "weight" | "e1rm" | "volume";

export type PrCandidate = {
  weightLb: number | null;
  reps: number | null;
  setType: SetType;
};

export type PriorSet = PrCandidate;

// Epley estimate: weight * (1 + reps / 30). A single rep is its own max.
export function epley1rm(weightLb: number, reps: number): number {
  if (reps === 1) return weightLb;
  return weightLb * (1 + reps / 30);
}

type Scorable = { weightLb: number; reps: number };

// Only completed working sets with real numbers can set or beat a record.
function scorable(set: PrCandidate): Scorable | null {
  if (set.setType === "warmup") return null;
  if (set.weightLb === null || set.reps === null || set.reps <= 0) return null;
  return { weightLb: set.weightLb, reps: set.reps };
}

const SCORES: Array<[PrKind, (s: Scorable) => number]> = [
  ["weight", (s) => s.weightLb],
  ["e1rm", (s) => epley1rm(s.weightLb, s.reps)],
  ["volume", (s) => s.weightLb * s.reps],
];

export function detectPrs(prior: PriorSet[], candidate: PrCandidate): PrKind[] {
  const current = scorable(candidate);
  if (!current) return [];
  const history = prior.map(scorable).filter((s): s is Scorable => s !== null);
  // Math.max() with no prior scores is -Infinity, so a first valid set beats everything.
  return SCORES.filter(([, score]) => score(current) > Math.max(...history.map(score))).map(
    ([kind]) => kind,
  );
}
