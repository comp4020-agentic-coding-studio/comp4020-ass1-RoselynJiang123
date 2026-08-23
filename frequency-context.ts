// Pure, deterministic mapping from a frequency to a short familiar-sound
// anchor, plus a display-position-derived cochlear-place percentage shown
// alongside it (CLAUDE.md Step 6C: "Connect the current frequency to
// approximate, familiar sound context"). These are explanatory anchors, not
// scientifically exact acoustic categories --- the UI is required to label
// them "approximate context, not a strict frequency boundary" wherever
// they're shown, and this never claims to describe an individual visitor's
// hearing.

import { MAX_FREQUENCY_HZ, MIN_FREQUENCY_HZ, frequencyToDisplayPosition } from "./cochlea";

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, got ${value}`);
  }
}

function assertWithinFrequencyRange(frequencyHz: number): void {
  assertFinite(frequencyHz, "frequencyHz");
  if (frequencyHz < MIN_FREQUENCY_HZ || frequencyHz > MAX_FREQUENCY_HZ) {
    throw new RangeError(`frequencyHz must be within ${MIN_FREQUENCY_HZ}..${MAX_FREQUENCY_HZ}, got ${frequencyHz}`);
  }
}

const LOW_SPEAKING_VOICE = "Around the pitch of a low speaking voice";
const MIDDLE_C = "Around middle C on a piano";
const VOWELS_AND_VOICES = "Much of the body of vowels and voices";
const SPEECH_INFORMATION = "An important region for speech information";
const CONSONANT_CLARITY = "Many consonant clarity cues";
const SIBILANTS_AND_BRIGHTNESS = "Sibilants such as /s/ and /ʃ/, and musical brightness";

// Boundary ownership is the lower edge of each band (frequency < bound), so
// every frequency in this project's 125-8000 Hz range maps to exactly one
// context with no shared or missing edges.
export function frequencyContext(frequencyHz: number): string {
  assertWithinFrequencyRange(frequencyHz);

  if (frequencyHz < 200) return LOW_SPEAKING_VOICE;
  if (frequencyHz < 350) return MIDDLE_C;
  if (frequencyHz < 1000) return VOWELS_AND_VOICES;
  if (frequencyHz < 2000) return SPEECH_INFORMATION;
  if (frequencyHz < 4000) return CONSONANT_CLARITY;
  return SIBILANTS_AND_BRIGHTNESS;
}

// A percentage presentation of cochlea.ts's own display-position convention
// (base/left = 0, apex/right = 1) --- not a second position formula. The
// clamp is defensive only: every frequency in this project's UI range already
// maps inside 0..1 here, since that range sits well inside the Greenwood
// model's own wider domain.
export function frequencyToPercentFromBase(frequencyHz: number): number {
  assertWithinFrequencyRange(frequencyHz);
  const displayPosition = Math.min(1, Math.max(0, frequencyToDisplayPosition(frequencyHz)));
  return Math.round(displayPosition * 100);
}
