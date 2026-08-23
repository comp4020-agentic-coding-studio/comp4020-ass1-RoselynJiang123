// Pure Greenwood cochlear frequency-place mapping; see CLAUDE.md's
// "Scientific mapping" and "One visual coordinate system" sections for the
// source formula, orientation and domain this module is required to hold.

const GREENWOOD_A = 165.4;
const GREENWOOD_EXPONENT_SCALE = 2.1; // "a" in the Greenwood formula
const GREENWOOD_K = 0.88;

export const MIN_FREQUENCY_HZ = 125;
export const MAX_FREQUENCY_HZ = 8000;

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, got ${value}`);
  }
}

function assertWithin(value: number, min: number, max: number, name: string): void {
  if (value < min || value > max) {
    throw new RangeError(`${name} must be within ${min}..${max}, got ${value}`);
  }
}

export function placeToFrequency(place: number): number {
  assertFinite(place, "place");
  assertWithin(place, 0, 1, "place");
  return GREENWOOD_A * (10 ** (GREENWOOD_EXPONENT_SCALE * place) - GREENWOOD_K);
}

// The Greenwood model's own frequency domain, derived from its place domain
// (place 0 = apex, place 1 = base) rather than the narrower UI slider range.
const MODEL_MIN_FREQUENCY_HZ = placeToFrequency(0);
const MODEL_MAX_FREQUENCY_HZ = placeToFrequency(1);

export function frequencyToPlace(frequency: number): number {
  assertFinite(frequency, "frequency");
  assertWithin(frequency, MODEL_MIN_FREQUENCY_HZ, MODEL_MAX_FREQUENCY_HZ, "frequency");
  return Math.log10(frequency / GREENWOOD_A + GREENWOOD_K) / GREENWOOD_EXPONENT_SCALE;
}

// Reverses Greenwood place onto this project's visual orientation: base/high
// frequencies on the left (small display position), apex/low frequencies on
// the right (large display position).
export function frequencyToDisplayPosition(frequency: number): number {
  return 1 - frequencyToPlace(frequency);
}

export function sliderPositionToFrequency(position: number): number {
  assertFinite(position, "position");
  assertWithin(position, 0, 1, "position");
  return MIN_FREQUENCY_HZ * (MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ) ** position;
}

export function frequencyToSliderPosition(frequency: number): number {
  assertFinite(frequency, "frequency");
  assertWithin(frequency, MIN_FREQUENCY_HZ, MAX_FREQUENCY_HZ, "frequency");
  return Math.log(frequency / MIN_FREQUENCY_HZ) / Math.log(MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ);
}
