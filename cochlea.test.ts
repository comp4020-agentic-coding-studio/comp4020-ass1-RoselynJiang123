import { describe, expect, it } from "vitest";
import {
  MAX_FREQUENCY_HZ,
  MIN_FREQUENCY_HZ,
  frequencyToDisplayPosition,
  frequencyToPlace,
  frequencyToSliderPosition,
  placeToFrequency,
  sliderPositionToFrequency,
} from "./cochlea";

function closeTo(actual: number, expected: number, tolerance: number): void {
  expect(
    Math.abs(actual - expected),
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  ).toBeLessThan(tolerance);
}

describe("Greenwood numerical anchors", () => {
  it("placeToFrequency(0) is the model's lowest frequency, ~19.8 Hz", () => {
    closeTo(placeToFrequency(0), 19.8, 0.1);
  });

  it("placeToFrequency(1) is the model's highest frequency, ~20,677 Hz", () => {
    closeTo(placeToFrequency(1), 20677, 1);
  });

  it("frequencyToPlace(4000) is ~0.6662127913807621", () => {
    closeTo(frequencyToPlace(4000), 0.6662127913807621, 1e-9);
  });
});

describe("visual orientation", () => {
  it("orders high frequencies to the left, low frequencies to the right", () => {
    const high = frequencyToDisplayPosition(8000);
    const mid = frequencyToDisplayPosition(1000);
    const low = frequencyToDisplayPosition(250);
    expect(high).toBeLessThan(mid);
    expect(mid).toBeLessThan(low);
  });
});

describe("round-trip mapping", () => {
  const representativeFrequencies = [125, 250, 1000, 4000, 8000];

  it.each(representativeFrequencies)(
    "frequencyToPlace/placeToFrequency round-trips %d Hz",
    (frequency) => {
      const roundTripped = placeToFrequency(frequencyToPlace(frequency));
      expect(Math.abs(roundTripped - frequency) / frequency).toBeLessThan(1e-9);
    },
  );

  it.each(representativeFrequencies)(
    "frequencyToSliderPosition/sliderPositionToFrequency round-trips %d Hz",
    (frequency) => {
      const roundTripped = sliderPositionToFrequency(frequencyToSliderPosition(frequency));
      expect(Math.abs(roundTripped - frequency) / frequency).toBeLessThan(1e-9);
    },
  );
});

describe("logarithmic slider mapping", () => {
  it("position 0 is the minimum frequency", () => {
    closeTo(sliderPositionToFrequency(0), MIN_FREQUENCY_HZ, 1e-9);
  });

  it("position 1 is the maximum frequency", () => {
    closeTo(sliderPositionToFrequency(1), MAX_FREQUENCY_HZ, 1e-6);
  });

  it("the midpoint is the geometric mean, ~1000 Hz", () => {
    closeTo(sliderPositionToFrequency(0.5), 1000, 0.01);
  });
});

describe("input validation", () => {
  it("placeToFrequency rejects a place outside 0..1", () => {
    expect(() => placeToFrequency(-0.1)).toThrow(RangeError);
    expect(() => placeToFrequency(1.1)).toThrow(RangeError);
  });

  it("placeToFrequency rejects non-finite input", () => {
    expect(() => placeToFrequency(NaN)).toThrow(RangeError);
    expect(() => placeToFrequency(Infinity)).toThrow(RangeError);
  });

  it("frequencyToPlace rejects a frequency outside the model's range", () => {
    expect(() => frequencyToPlace(0)).toThrow(RangeError);
    expect(() => frequencyToPlace(30000)).toThrow(RangeError);
  });

  it("frequencyToPlace rejects non-finite input", () => {
    expect(() => frequencyToPlace(NaN)).toThrow(RangeError);
    expect(() => frequencyToPlace(Infinity)).toThrow(RangeError);
  });

  it("sliderPositionToFrequency rejects a position outside 0..1", () => {
    expect(() => sliderPositionToFrequency(-0.01)).toThrow(RangeError);
    expect(() => sliderPositionToFrequency(1.01)).toThrow(RangeError);
  });

  it("sliderPositionToFrequency rejects non-finite input", () => {
    expect(() => sliderPositionToFrequency(NaN)).toThrow(RangeError);
    expect(() => sliderPositionToFrequency(Infinity)).toThrow(RangeError);
  });

  it("frequencyToSliderPosition rejects a frequency outside the UI range", () => {
    expect(() => frequencyToSliderPosition(124)).toThrow(RangeError);
    expect(() => frequencyToSliderPosition(8001)).toThrow(RangeError);
  });

  it("frequencyToSliderPosition rejects non-finite input", () => {
    expect(() => frequencyToSliderPosition(NaN)).toThrow(RangeError);
    expect(() => frequencyToSliderPosition(Infinity)).toThrow(RangeError);
  });
});
