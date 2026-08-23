// Stage 3 "Hear what the gap removes" audio orchestration (CLAUDE.md's
// "Intended interaction", point 3). Plays the student's recorded sentence,
// then the deterministic melody from melody.ts, both through the same
// dry/wet bus as Stage 1/2's tone (audio.ts) --- the gap's filter
// parameters remain the single attenuation source of truth, this module
// only wires the same two cascaded peaking filters into a second signal
// path.
//
// Guarded exactly like audio.ts: jsdom has no Web Audio implementation, so
// every AudioContext reference here is lazy and behind a capability check.
// The visible UI state (play/stop, phase, dry/wet route) is owned by
// main.ts and never depends on whether the real audio graph could be built
// --- CLAUDE.md's "the educational result must hold without sound".

import { stopTone } from "./audio";
import { MELODY_ATTACK_SECONDS, MELODY_NOTES, MELODY_RELEASE_SECONDS, partialsForNote } from "./melody";
import type { PeakingFilterStage } from "./gap";

const VOICE_URL = new URL("./assets/voice.m4a", import.meta.url).href;

const START_LEAD_SECONDS = 0.05;
const PAUSE_BETWEEN_SPEECH_AND_MELODY_SECONDS = 0.3;
const STOP_RAMP_SECONDS = 0.05;
const DRY_WET_RAMP_SECONDS = 0.08;
const TAIL_SECONDS = 0.2;
const ANALYSER_FFT_SIZE = 2048;

export type DemoPhase = "speech" | "melody";

export interface DemoAudioCallbacks {
  onPhaseChange?: (phase: DemoPhase) => void;
  onEnded?: () => void;
  onError?: (message: string) => void;
}

interface ActiveDemo {
  analyser: AnalyserNode;
  setGapFilters: (stages: readonly PeakingFilterStage[] | null) => void;
  setWet: (wet: boolean) => void;
  stop: () => void;
}

let activeDemo: ActiveDemo | null = null;
let sharedContext: AudioContext | null = null;
let cachedVoiceBuffer: AudioBuffer | null = null;
let pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

function resolveAudioContextConstructor(): typeof AudioContext | undefined {
  const globalWithVendorPrefix = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return globalWithVendorPrefix.AudioContext ?? globalWithVendorPrefix.webkitAudioContext;
}

function clearPendingTimeouts(): void {
  for (const id of pendingTimeouts) clearTimeout(id);
  pendingTimeouts = [];
}

function scheduleCallback(delaySeconds: number, run: () => void): void {
  pendingTimeouts.push(setTimeout(run, Math.max(0, delaySeconds) * 1000));
}

async function loadVoiceBuffer(context: AudioContext): Promise<AudioBuffer> {
  if (cachedVoiceBuffer) return cachedVoiceBuffer;
  const response = await fetch(VOICE_URL);
  if (!response.ok) {
    throw new Error(`Could not load the recorded voice clip (status ${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = await context.decodeAudioData(arrayBuffer);
  cachedVoiceBuffer = buffer;
  return buffer;
}

export function isDemoPlaying(): boolean {
  return activeDemo !== null;
}

export function getDemoAnalyser(): AnalyserNode | null {
  return activeDemo?.analyser ?? null;
}

export function setDemoGapFilters(stages: readonly PeakingFilterStage[] | null): void {
  activeDemo?.setGapFilters(stages);
}

export function setDemoWet(wet: boolean): void {
  activeDemo?.setWet(wet);
}

function buildFilterStage(filter: BiquadFilterNode, stage: PeakingFilterStage, time: number): void {
  filter.type = "peaking";
  filter.frequency.setValueAtTime(stage.frequencyHz, time);
  filter.Q.setValueAtTime(stage.q, time);
  filter.gain.setValueAtTime(Math.min(0, stage.gainDb), time);
}

function rampFilterStage(filter: BiquadFilterNode, stage: PeakingFilterStage, time: number): void {
  filter.frequency.linearRampToValueAtTime(stage.frequencyHz, time);
  filter.Q.linearRampToValueAtTime(stage.q, time);
  filter.gain.linearRampToValueAtTime(Math.min(0, stage.gainDb), time);
}

// Starts the student's recorded sentence, then --- after a short pause ---
// the deterministic melody, both routed through one dry/wet bus into one
// analyser. Stopping the Stage 1 tone first guarantees the two never sound
// together (CLAUDE.md: "Starting the demonstration must stop/mute the
// Stage 1 tone").
export async function startDemo(
  initialGapFilters: readonly PeakingFilterStage[] | null,
  callbacks: DemoAudioCallbacks = {},
): Promise<void> {
  if (activeDemo) return;

  stopTone();

  const AudioContextConstructor = resolveAudioContextConstructor();
  if (!AudioContextConstructor) {
    callbacks.onError?.("Audio playback is not available in this browser.");
    return;
  }

  sharedContext ??= new AudioContextConstructor();
  const context = sharedContext;
  void context.resume();

  let voiceBuffer: AudioBuffer;
  try {
    voiceBuffer = await loadVoiceBuffer(context);
  } catch {
    callbacks.onError?.("Could not load the recorded voice clip.");
    return;
  }

  // A stop (or a second start) may have happened while decoding.
  if (activeDemo) return;

  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const filterOne = context.createBiquadFilter();
  const filterTwo = context.createBiquadFilter();
  const mixBus = context.createGain();
  const analyser = context.createAnalyser();
  analyser.fftSize = ANALYSER_FFT_SIZE;

  const now = context.currentTime;
  dryGain.gain.setValueAtTime(1, now);
  wetGain.gain.setValueAtTime(0, now);
  filterOne.type = "peaking";
  filterTwo.type = "peaking";
  if (initialGapFilters) {
    const [stageOne, stageTwo] = initialGapFilters;
    buildFilterStage(filterOne, stageOne, now);
    buildFilterStage(filterTwo, stageTwo, now);
  }

  dryGain.connect(mixBus);
  filterOne.connect(filterTwo);
  filterTwo.connect(wetGain);
  wetGain.connect(mixBus);
  mixBus.connect(analyser);
  analyser.connect(context.destination);

  const sources: AudioScheduledSourceNode[] = [];

  const speechStart = now + START_LEAD_SECONDS;
  const voiceSource = context.createBufferSource();
  voiceSource.buffer = voiceBuffer;
  voiceSource.connect(dryGain);
  voiceSource.connect(filterOne);
  voiceSource.start(speechStart);
  sources.push(voiceSource);

  const melodyStart = speechStart + voiceBuffer.duration + PAUSE_BETWEEN_SPEECH_AND_MELODY_SECONDS;

  for (const note of MELODY_NOTES) {
    const noteStart = melodyStart + note.startTimeSeconds;
    const noteEnd = noteStart + note.durationSeconds;
    for (const partial of partialsForNote(note.frequencyHz)) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(partial.frequencyHz, noteStart);

      const noteGain = context.createGain();
      noteGain.gain.setValueAtTime(0, noteStart);
      noteGain.gain.linearRampToValueAtTime(partial.gainLinear, noteStart + MELODY_ATTACK_SECONDS);
      noteGain.gain.setValueAtTime(partial.gainLinear, noteEnd - MELODY_RELEASE_SECONDS);
      noteGain.gain.linearRampToValueAtTime(0, noteEnd);

      oscillator.connect(noteGain);
      noteGain.connect(dryGain);
      noteGain.connect(filterOne);

      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
      sources.push(oscillator);
    }
  }

  const melodyEnd = melodyStart + MELODY_NOTES[MELODY_NOTES.length - 1].startTimeSeconds
    + MELODY_NOTES[MELODY_NOTES.length - 1].durationSeconds;

  function cleanup(): void {
    clearPendingTimeouts();
    const stopTime = context.currentTime;
    mixBus.gain.cancelScheduledValues(stopTime);
    mixBus.gain.setValueAtTime(mixBus.gain.value, stopTime);
    mixBus.gain.linearRampToValueAtTime(0, stopTime + STOP_RAMP_SECONDS);
    for (const source of sources) {
      try {
        source.stop(stopTime + STOP_RAMP_SECONDS);
      } catch {
        // Already stopped/ended --- nothing further to do.
      }
    }
    setTimeout(() => {
      dryGain.disconnect();
      wetGain.disconnect();
      filterOne.disconnect();
      filterTwo.disconnect();
      mixBus.disconnect();
      analyser.disconnect();
    }, (STOP_RAMP_SECONDS + 0.02) * 1000);
    activeDemo = null;
  }

  activeDemo = {
    analyser,
    setGapFilters(stages) {
      const rampTime = context.currentTime + DRY_WET_RAMP_SECONDS;
      if (stages) {
        const [stageOne, stageTwo] = stages;
        rampFilterStage(filterOne, stageOne, rampTime);
        rampFilterStage(filterTwo, stageTwo, rampTime);
      }
    },
    setWet(wet) {
      const rampTime = context.currentTime + DRY_WET_RAMP_SECONDS;
      dryGain.gain.linearRampToValueAtTime(wet ? 0 : 1, rampTime);
      wetGain.gain.linearRampToValueAtTime(wet ? 1 : 0, rampTime);
    },
    stop: cleanup,
  };

  callbacks.onPhaseChange?.("speech");
  scheduleCallback(speechStart - now + voiceBuffer.duration + PAUSE_BETWEEN_SPEECH_AND_MELODY_SECONDS / 2, () => {
    if (activeDemo) callbacks.onPhaseChange?.("melody");
  });
  scheduleCallback(melodyEnd - now + TAIL_SECONDS, () => {
    if (activeDemo) {
      cleanup();
      callbacks.onEnded?.();
    }
  });
}

export function stopDemo(): void {
  activeDemo?.stop();
  activeDemo = null;
}
