import { describe, expect, it } from "vitest";
import { groupState, selectAll, toggleGroup, toggleOne } from "@/components/nutrition/selection";

// Edit mode selection: one tap on a row flips it, one tap on a meal flips the
// whole meal, and the header circle shows none / some / all. Every helper
// returns a new Set so React sees the change.

const lunch = ["a", "b", "c"];

describe("toggleOne", () => {
  it("adds an id that is not selected", () => {
    const out = toggleOne(new Set(), "a");
    expect([...out]).toEqual(["a"]);
  });

  it("removes an id that is selected", () => {
    const out = toggleOne(new Set(["a", "b"]), "a");
    expect([...out]).toEqual(["b"]);
  });

  it("returns a new Set and leaves the input alone", () => {
    const input = new Set(["a"]);
    const out = toggleOne(input, "b");
    expect(out).not.toBe(input);
    expect([...input]).toEqual(["a"]);
  });
});

describe("toggleGroup", () => {
  it("selects every id when none is selected", () => {
    expect([...toggleGroup(new Set(), lunch)].sort()).toEqual(["a", "b", "c"]);
  });

  it("selects the rest when only some are selected", () => {
    expect([...toggleGroup(new Set(["b"]), lunch)].sort()).toEqual(["a", "b", "c"]);
  });

  it("clears every id when all are selected, keeping ids from other groups", () => {
    expect([...toggleGroup(new Set(["a", "b", "c", "z"]), lunch)]).toEqual(["z"]);
  });

  it("returns a new Set and leaves the input alone", () => {
    const input = new Set(["a"]);
    const out = toggleGroup(input, lunch);
    expect(out).not.toBe(input);
    expect([...input]).toEqual(["a"]);
  });

  it("with no ids returns a copy of the selection", () => {
    const input = new Set(["z"]);
    const out = toggleGroup(input, []);
    expect(out).not.toBe(input);
    expect([...out]).toEqual(["z"]);
  });
});

describe("groupState", () => {
  it("is none when nothing in the group is selected", () => {
    expect(groupState(new Set(), lunch)).toBe("none");
    expect(groupState(new Set(["z"]), lunch)).toBe("none");
  });

  it("is some when part of the group is selected", () => {
    expect(groupState(new Set(["a"]), lunch)).toBe("some");
    expect(groupState(new Set(["a", "b"]), lunch)).toBe("some");
  });

  it("is all when the whole group is selected", () => {
    expect(groupState(new Set(["a", "b", "c"]), lunch)).toBe("all");
    expect(groupState(new Set(["a", "b", "c", "z"]), lunch)).toBe("all");
  });

  it("is none for an empty group", () => {
    expect(groupState(new Set(["a"]), [])).toBe("none");
  });
});

describe("selectAll", () => {
  it("selects every id once", () => {
    expect([...selectAll(["a", "b", "a"])].sort()).toEqual(["a", "b"]);
  });

  it("returns a new empty Set for no ids", () => {
    const out = selectAll([]);
    expect(out).toBeInstanceOf(Set);
    expect(out.size).toBe(0);
  });
});
