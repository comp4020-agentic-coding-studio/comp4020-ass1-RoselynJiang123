// Stage 1 "Find the sound" pure tone, extended for Stage 2's "Make a gap"
// attenuation model. Kept separate from main.ts's rendering so the visual
// interaction (CLAUDE.md's "the educational result must hold without sound")
// never depends on Web Audio, and so jsdom specs that never press the
// activation button never touch AudioContext at all --- jsdom has no Web
// Audio implementation, so any reference has to be lazy and guarded.
//
// The tone routes through a dry path (bypass) and a wet path (two cascaded
// peaking filters carrying the gap's -24 dB attenuation) that crossfade
// 0..1, never summing above unity --- this is the routing Stage 3 can later
// reuse for a hold-to-compare A/B control, though that control isn't added
// here.

import type { PeakingFilterStage } from "./gap";

const TONE_GAIN = 0.025;
const RAMP_SECONDS = 0.05;
const GAP_RAMP_SECONDS = 0.08;

interface ActiveTone {
  setFrequency: (frequencyHz: number) => void;
  setGapFilters: (stages: readonly PeakingFilterStage[] | null) => void;
  stop: () => void;
}

let activeTone: ActiveTone | null = null;
let sharedContext: AudioContext | null = null;

// Stored so a gap made before the tone is ever started is still applied,
// without creating an AudioContext just to remember the parameters.
let pendingGapFilters: readonly PeakingFilterStage[] | null = null;

function resolveAudioContextConstructor(): typeof AudioContext | undefined {
  const globalWithVendorPrefix = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return globalWithVendorPrefix.AudioContext ?? globalWithVendorPrefix.webkitAudioContext;
}

export function isToneActive(): boolean {
  return activeTone !== null;
}

export function startTone(frequencyHz: number): void {
  if (activeTone) return;

  const AudioContextConstructor = resolveAudioContextConstructor();
  if (!AudioContextConstructor) return;

  sharedContext ??= new AudioContextConstructor();
  const context = sharedContext;
  void context.resume();

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequencyHz, context.currentTime);

  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(TONE_GAIN, context.currentTime + RAMP_SECONDS);

  // Bypass (dry) and attenuated (wet, through two cascaded peaking filters)
  // paths from the same source, crossfaded 0..1 so their sum never exceeds
  // the dry level --- this can only ever cut, never boost.
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const filterOne = context.createBiquadFilter();
  const filterTwo = context.createBiquadFilter();
  filterOne.type = "peaking";
  filterTwo.type = "peaking";

  const hasGapAtStart = pendingGapFilters !== null;
  dryGain.gain.setValueAtTime(hasGapAtStart ? 0 : 1, context.currentTime);
  wetGain.gain.setValueAtTime(hasGapAtStart ? 1 : 0, context.currentTime);
  if (pendingGapFilters) {
    const [stageOne, stageTwo] = pendingGapFilters;
    filterOne.frequency.setValueAtTime(stageOne.frequencyHz, context.currentTime);
    filterOne.Q.setValueAtTime(stageOne.q, context.currentTime);
    filterOne.gain.setValueAtTime(Math.min(0, stageOne.gainDb), context.currentTime);
    filterTwo.frequency.setValueAtTime(stageTwo.frequencyHz, context.currentTime);
    filterTwo.Q.setValueAtTime(stageTwo.q, context.currentTime);
    filterTwo.gain.setValueAtTime(Math.min(0, stageTwo.gainDb), context.currentTime);
  }

  oscillator.connect(gain);
  gain.connect(dryGain);
  gain.connect(filterOne);
  filterOne.connect(filterTwo);
  filterTwo.connect(wetGain);
  dryGain.connect(context.destination);
  wetGain.connect(context.destination);
  oscillator.start();

  activeTone = {
    setFrequency(nextFrequencyHz) {
      oscillator.frequency.linearRampToValueAtTime(nextFrequencyHz, context.currentTime + RAMP_SECONDS);
    },
    setGapFilters(stages) {
      const now = context.currentTime;
      if (stages) {
        const [stageOne, stageTwo] = stages;
        filterOne.frequency.linearRampToValueAtTime(stageOne.frequencyHz, now + GAP_RAMP_SECONDS);
        filterOne.Q.linearRampToValueAtTime(stageOne.q, now + GAP_RAMP_SECONDS);
        filterOne.gain.linearRampToValueAtTime(Math.min(0, stageOne.gainDb), now + GAP_RAMP_SECONDS);
        filterTwo.frequency.linearRampToValueAtTime(stageTwo.frequencyHz, now + GAP_RAMP_SECONDS);
        filterTwo.Q.linearRampToValueAtTime(stageTwo.q, now + GAP_RAMP_SECONDS);
        filterTwo.gain.linearRampToValueAtTime(Math.min(0, stageTwo.gainDb), now + GAP_RAMP_SECONDS);
        dryGain.gain.linearRampToValueAtTime(0, now + GAP_RAMP_SECONDS);
        wetGain.gain.linearRampToValueAtTime(1, now + GAP_RAMP_SECONDS);
      } else {
        dryGain.gain.linearRampToValueAtTime(1, now + GAP_RAMP_SECONDS);
        wetGain.gain.linearRampToValueAtTime(0, now + GAP_RAMP_SECONDS);
      }
    },
    stop() {
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + RAMP_SECONDS);
      oscillator.stop(now + RAMP_SECONDS + 0.01);
    },
  };
}

export function updateToneFrequency(frequencyHz: number): void {
  activeTone?.setFrequency(frequencyHz);
}

// Stores the gap's filter parameters even if no tone is currently playing
// (so no AudioContext is created merely by selecting a gap), and ramps the
// live tone's filters/crossfade if one is active. Passing `null` restores
// bypass.
export function setGapFilters(stages: readonly PeakingFilterStage[] | null): void {
  pendingGapFilters = stages;
  activeTone?.setGapFilters(stages);
}

export function stopTone(): void {
  activeTone?.stop();
  activeTone = null;
}
