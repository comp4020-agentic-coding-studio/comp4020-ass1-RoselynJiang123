// Guided cochlea orientation state (CLAUDE.md: "Guided orientation"). This is
// a pure transition function, deliberately separate from DOM rendering and
// Web Audio side effects, the same separation cochlea.ts and gap.ts already
// keep for their own calculations.
//
// Only an explicit user activation event may move the state forward ---
// initialization, resize, animation completion and audio events must never
// call nextExperienceState.

export type ExperienceState = "orientation" | "cochlea-focus" | "find" | "gap" | "compare";

export type ExperienceEvent =
  | "explore-cochlea"
  | "skip-to-map"
  | "unfold-cochlea"
  | "explore-frequency"
  | "create-gap"
  | "edit-gap"
  | "clear-gap";

export function nextExperienceState(
  current: ExperienceState,
  event: ExperienceEvent,
): ExperienceState {
  if (current === "orientation") {
    if (event === "explore-cochlea") return "cochlea-focus";
    if (event === "skip-to-map") return "find";
  }
  if (current === "cochlea-focus" && event === "unfold-cochlea") return "find";
  // Progressive disclosure (CLAUDE.md: "Guide visitors through Stages 1-3").
  // Both steps are one-way: a genuine Stage 1 interaction unlocks Stage 2,
  // and a genuine valid gap unlocks Stage 3. Neither ever regresses the
  // state, so re-exploring frequency or re-editing an existing gap in later
  // states is a no-op here.
  if (current === "find" && event === "explore-frequency") return "gap";
  if (current === "gap" && event === "create-gap") return "compare";
  // Edit gap and Clear gap are explicit, user-triggered regressions from
  // compare back to gap --- a deliberate exception to "never regresses",
  // which only ever meant re-triggering the same forward event is a no-op.
  if (current === "compare" && event === "edit-gap") return "gap";
  if (current === "compare" && event === "clear-gap") return "gap";
  return current;
}
