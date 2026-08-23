import { describe, expect, it } from "vitest";
import { nextExperienceState } from "./experience";

describe("nextExperienceState", () => {
  it("moves orientation to cochlea-focus on explore-cochlea", () => {
    expect(nextExperienceState("orientation", "explore-cochlea")).toBe("cochlea-focus");
  });

  it("moves orientation directly to find on skip-to-map", () => {
    expect(nextExperienceState("orientation", "skip-to-map")).toBe("find");
  });

  it("moves cochlea-focus to find on unfold-cochlea", () => {
    expect(nextExperienceState("cochlea-focus", "unfold-cochlea")).toBe("find");
  });

  it("ignores events that don't apply to the current state", () => {
    expect(nextExperienceState("cochlea-focus", "skip-to-map")).toBe("cochlea-focus");
    expect(nextExperienceState("cochlea-focus", "explore-cochlea")).toBe("cochlea-focus");
    expect(nextExperienceState("find", "explore-cochlea")).toBe("find");
    expect(nextExperienceState("find", "unfold-cochlea")).toBe("find");
    expect(nextExperienceState("gap", "skip-to-map")).toBe("gap");
    expect(nextExperienceState("compare", "unfold-cochlea")).toBe("compare");
  });
});
