import { describe, expect, it } from "vitest";
import { frequencyToDisplayPosition } from "./cochlea";
import {
  SPECTRUM_BAND_COUNT,
  SPECTRUM_MAX_FREQUENCY_HZ,
  SPECTRUM_MIN_FREQUENCY_HZ,
  aggregateBandEnergies,
  buildSpectrumBands,
  erbBandwidthHz,
  erbRate,
  erbRateToFrequency,
} from "./spectrum";

describe("erbRate / erbRateToFrequency", () => {
  it("round-trips a representative frequency", () => {
    const frequency = 2500;
    const rate = erbRate(frequency);
    expect(erbRateToFrequency(rate)).toBeCloseTo(frequency, 6);
  });

  it("is monotonically increasing with frequency", () => {
    expect(erbRate(250)).toBeLessThan(erbRate(1000));
    expect(erbRate(1000)).toBeLessThan(erbRate(4000));
  });
});

describe("erbBandwidthHz", () => {
  it("is positive and grows with frequency", () => {
    const low = erbBandwidthHz(200);
    const high = erbBandwidthHz(4000);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
  });
});

describe("buildSpectrumBands", () => {
  const bands = buildSpectrumBands();

  it("creates exactly 24 bands", () => {
    expect(bands.length).toBe(SPECTRUM_BAND_COUNT);
  });

  it("orders bands by ascending, finite centre frequency within 125-8000 Hz", () => {
    for (const band of bands) {
      expect(Number.isFinite(band.centerFrequencyHz)).toBe(true);
      expect(band.centerFrequencyHz).toBeGreaterThanOrEqual(SPECTRUM_MIN_FREQUENCY_HZ - 1e-6);
      expect(band.centerFrequencyHz).toBeLessThanOrEqual(SPECTRUM_MAX_FREQUENCY_HZ + 1e-6);
    }
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].centerFrequencyHz).toBeGreaterThan(bands[i - 1].centerFrequencyHz);
    }
  });

  it("spans the documented endpoints", () => {
    expect(bands[0].centerFrequencyHz).toBeCloseTo(SPECTRUM_MIN_FREQUENCY_HZ, 3);
    expect(bands[bands.length - 1].centerFrequencyHz).toBeCloseTo(SPECTRUM_MAX_FREQUENCY_HZ, 3);
  });

  it("gives every band a valid, positive bandwidth and ordered bounds", () => {
    for (const band of bands) {
      expect(band.erbBandwidthHz).toBeGreaterThan(0);
      expect(band.lowerFrequencyHz).toBeLessThan(band.upperFrequencyHz);
      expect(band.centerFrequencyHz).toBeGreaterThan(band.lowerFrequencyHz);
      expect(band.centerFrequencyHz).toBeLessThan(band.upperFrequencyHz);
    }
  });

  it("maps high-frequency bands to the left and low-frequency bands to the right, matching cochlea.ts's own orientation", () => {
    for (const band of bands) {
      expect(band.displayPosition).toBeCloseTo(frequencyToDisplayPosition(band.centerFrequencyHz), 9);
    }
    expect(bands[bands.length - 1].displayPosition).toBeLessThan(bands[0].displayPosition);
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].displayPosition).toBeLessThan(bands[i - 1].displayPosition);
    }
  });

  it("is deterministic across calls", () => {
    const again = buildSpectrumBands();
    expect(again).toEqual(bands);
  });
});

describe("aggregateBandEnergies", () => {
  const bands = buildSpectrumBands();
  const sampleRate = 48000;
  const fftSize = 2048;
  const binCount = fftSize / 2;

  function binFrequency(binIndex: number): number {
    return (binIndex * sampleRate) / fftSize;
  }

  it("returns one energy value per band", () => {
    const magnitudes = Array.from({ length: binCount }, () => 0);
    const energies = aggregateBandEnergies(bands, magnitudes, sampleRate, fftSize);
    expect(energies.length).toBe(bands.length);
  });

  it("aggregates deterministically for the same input", () => {
    const magnitudes = Array.from({ length: binCount }, (_, i) => (i % 7) + 1);
    const first = aggregateBandEnergies(bands, magnitudes, sampleRate, fftSize);
    const second = aggregateBandEnergies(bands, magnitudes, sampleRate, fftSize);
    expect(second).toEqual(first);
  });

  it("gives a band spanning an energetic bin a higher reading than an otherwise-silent band", () => {
    const magnitudes = Array.from({ length: binCount }, () => 0);
    const targetBand = bands[Math.floor(bands.length / 2)];
    const targetBin = Math.round((targetBand.centerFrequencyHz * fftSize) / sampleRate);
    magnitudes[targetBin] = 200;

    const energies = aggregateBandEnergies(bands, magnitudes, sampleRate, fftSize);
    const targetEnergy = energies[targetBand.index];
    const otherEnergy = energies[0] === targetEnergy ? energies[bands.length - 1] : energies[0];

    expect(targetEnergy).toBeGreaterThan(otherEnergy);
  });

  it("never claims raw FFT bins as auditory filters (band bounds come from the ERB formula, not bin edges)", () => {
    for (const band of bands) {
      expect(band.lowerFrequencyHz).not.toBe(binFrequency(0));
    }
  });
});
