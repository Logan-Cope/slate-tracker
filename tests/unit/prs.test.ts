import { describe, expect, it } from "vitest";
import { detectPrs, epley1rm, type PrCandidate } from "@/lib/training/prs";

function s(weightLb: number | null, reps: number | null, setType: PrCandidate["setType"] = "normal"): PrCandidate {
  return { weightLb, reps, setType };
}

describe("epley1rm", () => {
  it("estimates a one-rep max with the Epley formula and returns the weight itself for a single", () => {
    expect(epley1rm(100, 1)).toBe(100);
    expect(epley1rm(100, 10)).toBeCloseTo(133.33, 2);
    expect(epley1rm(150, 5)).toBeCloseTo(175, 5);
  });
});

describe("detectPrs", () => {
  it("awards every PR kind, in fixed order, when there is no prior history", () => {
    expect(detectPrs([], s(100, 10))).toEqual(["weight", "e1rm", "volume"]);
  });

  it("never awards a PR to a warmup set", () => {
    expect(detectPrs([], s(100, 10, "warmup"))).toEqual([]);
  });

  it("returns nothing for a candidate missing weight or reps, or with non-positive reps", () => {
    expect(detectPrs([], s(null, 10))).toEqual([]);
    expect(detectPrs([], s(100, null))).toEqual([]);
    expect(detectPrs([], s(100, 0))).toEqual([]);
    expect(detectPrs([], s(100, -3))).toEqual([]);
  });

  it("awards each kind only when the candidate strictly beats the best prior value", () => {
    // Best prior: weight 100, e1rm 133.33, volume 1000.
    const prior = [s(100, 10), s(90, 11), s(60, 12)];

    expect(detectPrs(prior, s(105, 8))).toEqual(["weight"]); // e1rm 133, volume 840
    expect(detectPrs(prior, s(90, 15))).toEqual(["e1rm", "volume"]); // e1rm 135, volume 1350
    expect(detectPrs(prior, s(100, 10))).toEqual([]); // ties are not records
    expect(detectPrs(prior, s(95, 9))).toEqual([]);
  });

  it("ignores warmup and incomplete prior sets when establishing the bar to beat", () => {
    const prior = [s(200, 5, "warmup"), s(null, 10), s(150, null), s(150, 0)];

    expect(detectPrs(prior, s(100, 10))).toEqual(["weight", "e1rm", "volume"]);
  });
});
