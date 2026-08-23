// Pure Stage 3 spectrum-band model (CLAUDE.md's "24 visual spectrum bands
// are schematic analysis bands"). These 24 bands are evenly spaced in
// ERB-rate, a standard auditory frequency scale, then aggregated against
// actual AnalyserNode FFT-bin energy for display. An FFT bin is not an
// auditory filter --- the aggregation below groups bins under an ERB-derived
// label, it never asserts the bins themselves behave like one.

import { frequencyToDisplayPosition } from "./cochlea";

const ERB_RATE_SCALE = 21.4;
const ERB_RATE_FACTOR = 0.00437;
const ERB_BANDWIDTH_BASE_HZ = 24.7;
const ERB_BANDWIDTH_SLOPE = 4.37;

export const SPECTRUM_BAND_COUNT = 24;
export const SPECTRUM_MIN_FREQUENCY_HZ = 125;
export const SPECTRUM_MAX_FREQUENCY_HZ = 8000;

export interface SpectrumBand {
  readonly index: number;
  readonly centerFrequencyHz: number;
  readonly erbBandwidthHz: number;
  readonly lowerFrequencyHz: number;
  readonly upperFrequencyHz: number;
  readonly displayPosition: number;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, got ${value}`);
  }
}

// Glasberg & Moore's ERB-rate scale: number of equivalent rectangular
// bandwidths below a given frequency. Used only to space the 24 display
// bands evenly --- it is not a substitute for the Greenwood place mapping,
// which stays the single source of truth for the map's x-axis.
export function erbRate(frequencyHz: number): number {
  assertFinite(frequencyHz, "frequencyHz");
  return ERB_RATE_SCALE * Math.log10(1 + ERB_RATE_FACTOR * frequencyHz);
}

export function erbRateToFrequency(erbRateValue: number): number {
  assertFinite(erbRateValue, "erbRateValue");
  return (10 ** (erbRateValue / ERB_RATE_SCALE) - 1) / ERB_RATE_FACTOR;
}

export function erbBandwidthHz(frequencyHz: number): number {
  assertFinite(frequencyHz, "frequencyHz");
  return ERB_BANDWIDTH_BASE_HZ * ((ERB_BANDWIDTH_SLOPE * frequencyHz) / 1000 + 1);
}

// 24 bands, evenly spaced in ERB-rate between 125 Hz and 8000 Hz (inclusive),
// then converted back to Hz. Each band's Greenwood display position reuses
// cochlea.ts's own orientation, so the bars land on the same x-axis as
// everything else on the map.
export function buildSpectrumBands(): SpectrumBand[] {
  const lowRate = erbRate(SPECTRUM_MIN_FREQUENCY_HZ);
  const highRate = erbRate(SPECTRUM_MAX_FREQUENCY_HZ);

  const bands: SpectrumBand[] = [];
  for (let index = 0; index < SPECTRUM_BAND_COUNT; index += 1) {
    const fraction = index / (SPECTRUM_BAND_COUNT - 1);
    const rate = lowRate + fraction * (highRate - lowRate);
    const centerFrequencyHz = erbRateToFrequency(rate);
    const bandwidth = erbBandwidthHz(centerFrequencyHz);

    bands.push({
      index,
      centerFrequencyHz,
      erbBandwidthHz: bandwidth,
      lowerFrequencyHz: centerFrequencyHz - bandwidth / 2,
      upperFrequencyHz: centerFrequencyHz + bandwidth / 2,
      displayPosition: frequencyToDisplayPosition(centerFrequencyHz),
    });
  }
  return bands;
}

// Aggregates actual AnalyserNode FFT-bin magnitudes into one schematic
// energy reading per ERB-grouped band, purely from (sampleRate, fftSize) and
// the bins array --- no dependency on a live AudioContext, so this stays
// jsdom-safe and independently testable.
export function aggregateBandEnergies(
  bands: readonly SpectrumBand[],
  binMagnitudes: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
): number[] {
  assertFinite(sampleRate, "sampleRate");
  assertFinite(fftSize, "fftSize");

  return bands.map((band) => {
    let sum = 0;
    let count = 0;
    for (let binIndex = 0; binIndex < binMagnitudes.length; binIndex += 1) {
      const binFrequencyHz = (binIndex * sampleRate) / fftSize;
      if (binFrequencyHz >= band.lowerFrequencyHz && binFrequencyHz < band.upperFrequencyHz) {
        sum += binMagnitudes[binIndex];
        count += 1;
      }
    }
    return count > 0 ? sum / count : 0;
  });
}
