// Pure "Make a gap" attenuation-region model (Stage 2, CLAUDE.md's "Make a
// gap"). Converts one ordered display-position interval on the existing
// unfolded map into deterministic frequency-dependent attenuation
// parameters. Reuses cochlea.ts's Greenwood conversions rather than
// reimplementing the frequency-place formula --- this module only inverts
// cochlea.ts's own display-position orientation flip
// (`displayPosition = 1 - frequencyToPlace(frequency)`) using its exported
// `placeToFrequency`.
//
// This is a fixed, simplified attenuation-only model: one continuous
// interval, a constant -24 dB maximum cut split across two cascaded peaking
// filters, never a boost. It does not reproduce real sensorineural hearing
// loss (loudness recruitment, reduced frequency selectivity, temporal
// changes are all out of scope here).

import { MAX_FREQUENCY_HZ, MIN_FREQUENCY_HZ, frequencyToDisplayPosition, placeToFrequency } from "./cochlea";

export const MIN_GAP_WIDTH = 0.04;
export const MIN_GAP_Q = 0.25;
export const MAX_GAP_Q = 18;
export const TOTAL_ATTENUATION_DB = -24;
export const PEAKING_FILTER_COUNT = 2;
export const PEAKING_FILTER_GAIN_DB = TOTAL_ATTENUATION_DB / PEAKING_FILTER_COUNT;

export interface GapSelection {
  readonly lowDisplayPosition: number;
  readonly highDisplayPosition: number;
  readonly lowFrequencyHz: number;
  readonly highFrequencyHz: number;
  readonly centerFrequencyHz: number;
  readonly bandwidthHz: number;
  readonly q: number;
}

export interface PeakingFilterStage {
  readonly type: "peaking";
  readonly frequencyHz: number;
  readonly q: number;
  readonly gainDb: number;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, got ${value}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampDisplayPosition(position: number): number {
  assertFinite(position, "position");
  return clamp(position, 0, 1);
}

export function displayPositionToFrequency(displayPosition: number): number {
  const clamped = clampDisplayPosition(displayPosition);
  const frequency = placeToFrequency(1 - clamped);
  return clamp(frequency, MIN_FREQUENCY_HZ, MAX_FREQUENCY_HZ);
}

export function assertNonPositiveGainDb(gainDb: number, name = "gainDb"): void {
  assertFinite(gainDb, name);
  if (gainDb > 0) {
    throw new RangeError(`${name} must not boost gain above 0 dB, got ${gainDb}`);
  }
}

// Orders and clamps a raw pointer/touch drag interval, enforces the minimum
// selectable width, then converts both edges through the Greenwood
// conversion above to derive the rest of the attenuation parameters.
export function createGapSelection(startPosition: number, endPosition: number): GapSelection {
  assertFinite(startPosition, "startPosition");
  assertFinite(endPosition, "endPosition");

  let low = clampDisplayPosition(Math.min(startPosition, endPosition));
  let high = clampDisplayPosition(Math.max(startPosition, endPosition));

  if (high - low < MIN_GAP_WIDTH) {
    const center = (low + high) / 2;
    low = center - MIN_GAP_WIDTH / 2;
    high = center + MIN_GAP_WIDTH / 2;
    if (low < 0) {
      high -= low;
      low = 0;
    }
    if (high > 1) {
      low -= high - 1;
      high = 1;
    }
    low = clamp(low, 0, 1);
    high = clamp(high, 0, 1);
  }

  // Orientation is reversed: the low (left) display position is the higher
  // frequency, so the frequency bounds have to be re-sorted after conversion
  // rather than assumed to follow the display-position order.
  const frequencyAtLowPosition = displayPositionToFrequency(low);
  const frequencyAtHighPosition = displayPositionToFrequency(high);
  const lowFrequencyHz = Math.min(frequencyAtLowPosition, frequencyAtHighPosition);
  const highFrequencyHz = Math.max(frequencyAtLowPosition, frequencyAtHighPosition);

  const centerFrequencyHz = Math.sqrt(lowFrequencyHz * highFrequencyHz);
  const bandwidthHz = highFrequencyHz - lowFrequencyHz;
  const q = clamp(centerFrequencyHz / bandwidthHz, MIN_GAP_Q, MAX_GAP_Q);

  return {
    lowDisplayPosition: low,
    highDisplayPosition: high,
    lowFrequencyHz,
    highFrequencyHz,
    centerFrequencyHz,
    bandwidthHz,
    q,
  };
}

// Keyboard-equivalent entry point: builds the same selection from an ordered
// Hz pair by converting to display positions first, so both input methods
// share one code path and one minimum-width rule.
export function createGapSelectionFromFrequencies(lowFrequencyHz: number, highFrequencyHz: number): GapSelection {
  assertFinite(lowFrequencyHz, "lowFrequencyHz");
  assertFinite(highFrequencyHz, "highFrequencyHz");

  const low = Math.min(lowFrequencyHz, highFrequencyHz);
  const high = Math.max(lowFrequencyHz, highFrequencyHz);

  return createGapSelection(frequencyToDisplayPosition(high), frequencyToDisplayPosition(low));
}

export function isFrequencyInGap(frequencyHz: number, gap: GapSelection): boolean {
  assertFinite(frequencyHz, "frequencyHz");
  return frequencyHz >= gap.lowFrequencyHz && frequencyHz <= gap.highFrequencyHz;
}

export function isDisplayPositionInGap(displayPosition: number, gap: GapSelection): boolean {
  const clamped = clampDisplayPosition(displayPosition);
  return clamped >= gap.lowDisplayPosition && clamped <= gap.highDisplayPosition;
}

// Two cascaded peaking filters at a fixed -12 dB each (-24 dB total): the
// attenuation depth is a constant of this prototype, not derived from the
// selection, so only centre frequency and Q vary per gap.
export function gapToFilterStages(gap: GapSelection): [PeakingFilterStage, PeakingFilterStage] {
  assertNonPositiveGainDb(PEAKING_FILTER_GAIN_DB);
  const stage: PeakingFilterStage = {
    type: "peaking",
    frequencyHz: gap.centerFrequencyHz,
    q: gap.q,
    gainDb: PEAKING_FILTER_GAIN_DB,
  };
  return [stage, { ...stage }];
}
