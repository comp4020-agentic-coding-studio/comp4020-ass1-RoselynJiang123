// Guided cochlea orientation state (CLAUDE.md: "Guided orientation"). This is
// a pure transition function, deliberately separate from DOM rendering and
// Web Audio side effects, the same separation cochlea.ts and gap.ts already
// keep for their own calculations.
//
// Only an explicit user activation event may move the state forward ---
// initialization, resize, animation completion and audio events must never
// call nextExperienceState.

export type ExperienceState = "orientation" | "cochlea-focus" | "find" | "gap" | "compare";

export type ExperienceEvent = "explore-cochlea" | "skip-to-map" | "unfold-cochlea";

export function nextExperienceState(
  current: ExperienceState,
  event: ExperienceEvent,
): ExperienceState {
  if (current === "orientation") {
    if (event === "explore-cochlea") return "cochlea-focus";
    if (event === "skip-to-map") return "find";
  }
  if (current === "cochlea-focus" && event === "unfold-cochlea") return "find";
  return current;
}
