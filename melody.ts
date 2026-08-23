// Pure Stage 3 melody model (CLAUDE.md's "Hear what the gap removes"): a
// fixed, deterministic note sequence and its additive-synthesis harmonics.
// This is data, not an external audio file --- kept separate from demo.ts's
// Web Audio scheduling so both the notes and the harmonic gains stay
// independently testable without ever constructing an AudioContext.

export interface MelodyNote {
  readonly frequencyHz: number;
  readonly startTimeSeconds: number;
  readonly durationSeconds: number;
}

export interface MelodyPartial {
  readonly frequencyHz: number;
  readonly gainLinear: number;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, got ${value}`);
  }
}

const MELODY_NOTE_DURATION_SECONDS = 0.9;

// A fixed six-note arpeggio (A4-C#5-E5-A5-E5-A4), six notes at 0.9 s each —
// 5.4 s total, inside the required ~5-6 s window. Same table on every run.
const MELODY_NOTE_FREQUENCIES_HZ = [440, 554, 659, 880, 659, 440] as const;

export const MELODY_NOTES: readonly MelodyNote[] = MELODY_NOTE_FREQUENCIES_HZ.map(
  (frequencyHz, index) => ({
    frequencyHz,
    startTimeSeconds: index * MELODY_NOTE_DURATION_SECONDS,
    durationSeconds: MELODY_NOTE_DURATION_SECONDS,
  }),
);

// Fundamental plus 3rd, 5th and 7th harmonics (odd partials), skipping any
// harmonic above 8000 Hz so nothing synthesises inaudible-to-irrelevant
// ultrasonic content or wastes headroom on it.
export const HARMONIC_MULTIPLES = [1, 3, 5, 7] as const;
export const MAX_HARMONIC_FREQUENCY_HZ = 8000;

// Conservative: a fundamental at 0.05 with harmonics falling off as 1/n
// keeps a single note's summed gain well under 1 --- no clipping headroom
// needed on top of that.
export const FUNDAMENTAL_GAIN = 0.05;

export const MELODY_ATTACK_SECONDS = 0.02;
export const MELODY_RELEASE_SECONDS = 0.05;

export function partialsForNote(frequencyHz: number): MelodyPartial[] {
  assertFinite(frequencyHz, "frequencyHz");
  return HARMONIC_MULTIPLES.map((multiple) => ({
    frequencyHz: frequencyHz * multiple,
    gainLinear: FUNDAMENTAL_GAIN / multiple,
  })).filter((partial) => partial.frequencyHz <= MAX_HARMONIC_FREQUENCY_HZ);
}

export function totalMelodyDurationSeconds(): number {
  const lastNote = MELODY_NOTES[MELODY_NOTES.length - 1];
  return lastNote.startTimeSeconds + lastNote.durationSeconds;
}
