// Stage 1 "Find the sound" pure tone. Kept separate from main.ts's rendering
// so the visual interaction (CLAUDE.md's "the educational result must hold
// without sound") never depends on Web Audio, and so jsdom specs that never
// press the activation button never touch AudioContext at all --- jsdom has
// no Web Audio implementation, so any reference has to be lazy and guarded.

const TONE_GAIN = 0.025;
const RAMP_SECONDS = 0.05;

interface ActiveTone {
  setFrequency: (frequencyHz: number) => void;
  stop: () => void;
}

let activeTone: ActiveTone | null = null;
let sharedContext: AudioContext | null = null;

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

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();

  activeTone = {
    setFrequency(nextFrequencyHz) {
      oscillator.frequency.linearRampToValueAtTime(nextFrequencyHz, context.currentTime + RAMP_SECONDS);
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

export function stopTone(): void {
  activeTone?.stop();
  activeTone = null;
}
