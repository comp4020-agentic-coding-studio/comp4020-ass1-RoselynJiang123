import { describe, expect, it } from "vitest";
import { frequencyToDisplayPosition, frequencyToPlace, placeToFrequency } from "./cochlea";
import {
  MAX_GAP_Q,
  MIN_GAP_Q,
  MIN_GAP_WIDTH,
  PEAKING_FILTER_GAIN_DB,
  TOTAL_ATTENUATION_DB,
  assertNonPositiveGainDb,
  clampDisplayPosition,
  createGapSelection,
  createGapSelectionFromFrequencies,
  displayPositionToFrequency,
  gapToFilterStages,
  isDisplayPositionInGap,
  isFrequencyInGap,
} from "./gap";

describe("clampDisplayPosition", () => {
  it("clamps pointer positions to 0..1", () => {
    expect(clampDisplayPosition(-0.4)).toBe(0);
    expect(clampDisplayPosition(1.7)).toBe(1);
    expect(clampDisplayPosition(0.5)).toBe(0.5);
  });

  it("throws on non-finite programmer input", () => {
    expect(() => clampDisplayPosition(NaN)).toThrow(RangeError);
    expect(() => clampDisplayPosition(Infinity)).toThrow(RangeError);
  });
});

describe("displayPositionToFrequency", () => {
  it("converts through the existing Greenwood placeToFrequency, not a duplicated formula", () => {
    const position = 0.3;
    const expected = Math.min(8000, Math.max(125, placeToFrequency(1 - position)));
    expect(displayPositionToFrequency(position)).toBeCloseTo(expected, 6);
  });
});

describe("createGapSelection: endpoint ordering and clamping", () => {
  it("orders a reversed drag so low < high regardless of drag direction", () => {
    const forward = createGapSelection(0.2, 0.6);
    const reversed = createGapSelection(0.6, 0.2);
    expect(forward.lowDisplayPosition).toBeCloseTo(reversed.lowDisplayPosition, 9);
    expect(forward.highDisplayPosition).toBeCloseTo(reversed.highDisplayPosition, 9);
    expect(forward.lowFrequencyHz).toBeLessThan(forward.highFrequencyHz);
  });

  it("clamps out-of-range drag endpoints into 0..1", () => {
    const selection = createGapSelection(-0.5, 1.8);
    expect(selection.lowDisplayPosition).toBe(0);
    expect(selection.highDisplayPosition).toBe(1);
  });

  it("throws on non-finite drag endpoints", () => {
    expect(() => createGapSelection(NaN, 0.5)).toThrow(RangeError);
    expect(() => createGapSelection(0.5, Infinity)).toThrow(RangeError);
  });
});

describe("createGapSelection: minimum width", () => {
  it("enforces the minimum selectable width for a near-zero-width drag", () => {
    const selection = createGapSelection(0.5, 0.501);
    expect(selection.highDisplayPosition - selection.lowDisplayPosition).toBeGreaterThanOrEqual(
      MIN_GAP_WIDTH - 1e-9,
    );
  });

  it("keeps the minimum width inside 0..1 near the left edge", () => {
    const selection = createGapSelection(0, 0.001);
    expect(selection.lowDisplayPosition).toBeGreaterThanOrEqual(0);
    expect(selection.highDisplayPosition - selection.lowDisplayPosition).toBeGreaterThanOrEqual(
      MIN_GAP_WIDTH - 1e-9,
    );
  });

  it("keeps the minimum width inside 0..1 near the right edge", () => {
    const selection = createGapSelection(0.999, 1);
    expect(selection.highDisplayPosition).toBeLessThanOrEqual(1);
    expect(selection.highDisplayPosition - selection.lowDisplayPosition).toBeGreaterThanOrEqual(
      MIN_GAP_WIDTH - 1e-9,
    );
  });
});

describe("createGapSelection: geometric centre and bandwidth", () => {
  it("centre frequency is the geometric mean of the bounds", () => {
    const selection = createGapSelection(0.3, 0.5);
    expect(selection.centerFrequencyHz).toBeCloseTo(
      Math.sqrt(selection.lowFrequencyHz * selection.highFrequencyHz),
      6,
    );
  });

  it("bandwidth is the difference between the bounds", () => {
    const selection = createGapSelection(0.3, 0.5);
    expect(selection.bandwidthHz).toBeCloseTo(selection.highFrequencyHz - selection.lowFrequencyHz, 6);
  });
});

describe("createGapSelection: bounded Q", () => {
  it("clamps Q to the documented range for a very wide selection", () => {
    const selection = createGapSelection(0, 1);
    expect(selection.q).toBeGreaterThanOrEqual(MIN_GAP_Q);
    expect(selection.q).toBeLessThanOrEqual(MAX_GAP_Q);
  });

  it("clamps Q to the documented range for the narrowest selection", () => {
    const selection = createGapSelection(0.5, 0.5);
    expect(selection.q).toBeGreaterThanOrEqual(MIN_GAP_Q);
    expect(selection.q).toBeLessThanOrEqual(MAX_GAP_Q);
  });
});

describe("gapToFilterStages", () => {
  it("returns two cascaded peaking stages at a fixed -12 dB each, -24 dB total", () => {
    const selection = createGapSelection(0.3, 0.5);
    const [first, second] = gapToFilterStages(selection);
    expect(first.type).toBe("peaking");
    expect(second.type).toBe("peaking");
    expect(first.gainDb).toBe(PEAKING_FILTER_GAIN_DB);
    expect(second.gainDb).toBe(PEAKING_FILTER_GAIN_DB);
    expect(first.gainDb + second.gainDb).toBeCloseTo(TOTAL_ATTENUATION_DB, 9);
    expect(first.frequencyHz).toBeCloseTo(selection.centerFrequencyHz, 6);
    expect(first.q).toBeCloseTo(selection.q, 6);
  });

  it("never produces a gain above 0 dB", () => {
    const selection = createGapSelection(0.1, 0.9);
    for (const stage of gapToFilterStages(selection)) {
      expect(stage.gainDb).toBeLessThanOrEqual(0);
    }
  });
});

describe("assertNonPositiveGainDb", () => {
  it("throws for a positive (boosting) gain", () => {
    expect(() => assertNonPositiveGainDb(0.1)).toThrow(RangeError);
  });

  it("does not throw for zero or negative gain", () => {
    expect(() => assertNonPositiveGainDb(0)).not.toThrow();
    expect(() => assertNonPositiveGainDb(-12)).not.toThrow();
  });

  it("throws for non-finite gain", () => {
    expect(() => assertNonPositiveGainDb(NaN)).toThrow(RangeError);
  });
});

describe("createGapSelectionFromFrequencies: representative selections", () => {
  it("builds a low-frequency selection (near the apex/right)", () => {
    const selection = createGapSelectionFromFrequencies(150, 300);
    expect(selection.lowFrequencyHz).toBeCloseTo(150, 0);
    expect(selection.highFrequencyHz).toBeCloseTo(300, 0);
    expect(selection.lowDisplayPosition).toBeGreaterThan(0.5);
  });

  it("builds a mid-frequency selection", () => {
    const selection = createGapSelectionFromFrequencies(800, 1200);
    expect(selection.lowFrequencyHz).toBeCloseTo(800, 0);
    expect(selection.highFrequencyHz).toBeCloseTo(1200, 0);
  });

  it("builds a high-frequency selection (near the base/left)", () => {
    const selection = createGapSelectionFromFrequencies(4000, 7000);
    expect(selection.lowFrequencyHz).toBeCloseTo(4000, 0);
    expect(selection.highFrequencyHz).toBeCloseTo(7000, 0);
    expect(selection.highDisplayPosition).toBeLessThan(0.5);
  });

  it("orders reversed Hz inputs", () => {
    const selection = createGapSelectionFromFrequencies(4000, 1000);
    expect(selection.lowFrequencyHz).toBeCloseTo(1000, 0);
    expect(selection.highFrequencyHz).toBeCloseTo(4000, 0);
  });
});

describe("membership checks", () => {
  const selection = createGapSelectionFromFrequencies(2000, 4000);

  it("isFrequencyInGap is true inside and false outside the range", () => {
    expect(isFrequencyInGap(3000, selection)).toBe(true);
    expect(isFrequencyInGap(500, selection)).toBe(false);
  });

  it("isDisplayPositionInGap matches the same interval via frequencyToDisplayPosition", () => {
    const insidePosition = frequencyToDisplayPosition(3000);
    const outsidePosition = frequencyToDisplayPosition(500);
    expect(isDisplayPositionInGap(insidePosition, selection)).toBe(true);
    expect(isDisplayPositionInGap(outsidePosition, selection)).toBe(false);
  });
});

// Sanity check that this module's Greenwood usage stays consistent with
// cochlea.ts's own round trip, so it can't silently drift onto a different
// formula.
describe("consistency with cochlea.ts", () => {
  it("round-trips a representative frequency through cochlea.ts's own functions", () => {
    const frequency = 2500;
    const place = frequencyToPlace(frequency);
    expect(placeToFrequency(place)).toBeCloseTo(frequency, 6);
  });
});
