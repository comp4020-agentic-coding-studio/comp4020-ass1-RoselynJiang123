import { describe, expect, it } from "vitest";
import {
  FUNDAMENTAL_GAIN,
  HARMONIC_MULTIPLES,
  MAX_HARMONIC_FREQUENCY_HZ,
  MELODY_NOTES,
  partialsForNote,
  totalMelodyDurationSeconds,
} from "./melody";

describe("MELODY_NOTES", () => {
  it("is a fixed, non-empty note sequence", () => {
    expect(MELODY_NOTES.length).toBeGreaterThan(0);
    for (const note of MELODY_NOTES) {
      expect(Number.isFinite(note.frequencyHz)).toBe(true);
      expect(note.frequencyHz).toBeGreaterThan(0);
      expect(note.durationSeconds).toBeGreaterThan(0);
    }
  });

  it("plays notes back to back with no gaps or overlaps", () => {
    for (let i = 1; i < MELODY_NOTES.length; i += 1) {
      const previous = MELODY_NOTES[i - 1];
      expect(MELODY_NOTES[i].startTimeSeconds).toBeCloseTo(
        previous.startTimeSeconds + previous.durationSeconds,
        9,
      );
    }
  });

  it("totals approximately 5-6 seconds", () => {
    const total = totalMelodyDurationSeconds();
    expect(total).toBeGreaterThanOrEqual(5);
    expect(total).toBeLessThanOrEqual(6);
  });

  it("is deterministic: the same fixed table on every import", () => {
    expect(MELODY_NOTES).toEqual(MELODY_NOTES);
    expect(totalMelodyDurationSeconds()).toBe(totalMelodyDurationSeconds());
  });
});

describe("partialsForNote: additive synthesis", () => {
  it("includes the fundamental plus 3rd, 5th and 7th harmonics when all fit under 8000 Hz", () => {
    const partials = partialsForNote(440);
    expect(HARMONIC_MULTIPLES).toEqual([1, 3, 5, 7]);
    expect(partials.length).toBe(4);
    expect(partials.map((p) => p.frequencyHz)).toEqual([440, 1320, 2200, 3080]);
  });

  it("skips harmonics above 8000 Hz", () => {
    const partials = partialsForNote(1200);
    for (const partial of partials) {
      expect(partial.frequencyHz).toBeLessThanOrEqual(MAX_HARMONIC_FREQUENCY_HZ);
    }
    // 7th harmonic of 1200 Hz is 8400 Hz, over the limit, so only 3 remain
    expect(partials.length).toBe(3);
  });

  it("uses conservative gains that never sum to clipping for a single note", () => {
    for (const note of MELODY_NOTES) {
      const partials = partialsForNote(note.frequencyHz);
      const totalGain = partials.reduce((sum, partial) => sum + partial.gainLinear, 0);
      expect(totalGain).toBeLessThan(0.2);
      for (const partial of partials) {
        expect(partial.gainLinear).toBeGreaterThan(0);
        expect(partial.gainLinear).toBeLessThanOrEqual(FUNDAMENTAL_GAIN);
      }
    }
  });

  it("is deterministic for the same frequency", () => {
    expect(partialsForNote(659)).toEqual(partialsForNote(659));
  });
});
