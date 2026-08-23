# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## Project contract: "Hearing Is a Map, Not a Volume Knob"

This is Assignment 1's fixed contract for this prototype, agreed before any
implementation. Treat it the same as the published spec: don't drift from it
without flagging the drift first.

### The single explanatory claim

Approved core claim: sensorineural hearing loss is not simply the same sound
turned down. Because the cochlea maps different frequencies to different
places, damage in one region can reduce particular parts of speech and music
while leaving other frequency regions less affected.

One causal chain, and only one:

```text
frequency → cochlear place → selected region → frequency-dependent attenuation
→ missing audible and visible detail
```

Every interaction has to serve this chain. This is not a general anatomy
lesson and not a hearing-loss simulator.

### One visual coordinate system

A single unfolded cochlear map, used throughout:

- base/entrance on the left; apex/deeper region on the right
- high frequencies on the left; low frequencies on the right
- the schematic travelling wave moves left to right
- high-frequency peaks stop closer to the left; low-frequency peaks travel
  farther to the right

Never silently reverse this orientation in code, labels, tests, or prose.

### Scientific mapping

The Greenwood human cochlear frequency–place function is the mathematical
basis:

```ts
const A = 165.4;
const a = 2.1;
const k = 0.88;

const placeToFrequency = (x: number) =>
  A * (Math.pow(10, a * x) - k);

const frequencyToPlace = (frequency: number) =>
  Math.log10(frequency / A + k) / a;
```

`x` is normalised distance from apex (`0`) to base (`1`). The map's left-right
direction is the opposite of that, so the displayed coordinate is:

```ts
displayPosition = 1 - frequencyToPlace(frequency);
```

Required visual invariant: `displayX(8000 Hz) < displayX(1000 Hz) <
displayX(250 Hz)`.

Numerical anchors:

- `placeToFrequency(0) ≈ 19.8 Hz`
- `placeToFrequency(1) ≈ 20,677 Hz`
- `frequencyToPlace(4000) ≈ 0.6662` — so 4 kHz sits at approximately `0.3338`
  of the displayed distance from the left/base

The travelling-wave envelope is schematic and approximate, not a complete
cochlear biomechanics simulation.

### Intended interaction

Three layers on the same map:

1. **Find the sound** — a logarithmic 125–8000 Hz frequency control drives a
   safe low-level pure tone and moves the schematic travelling-wave peak.
2. **Make a gap** — the visitor drag-selects one continuous region on the map.
   The corresponding outer-hair-cell illustration dims, and the selected
   frequency range converts into deterministic attenuation parameters.
3. **Hear what the gap removes** — one short local audio example combining
   original speech recorded by the student with a code-generated melody.
   Holding an A/B control applies the selected attenuation while the region
   visibly loses spectral energy; releasing it restores the original
   immediately.

Do not create or download a substitute voice recording. If the required
original recording is absent when this is implemented, stop and report that
the student must supply it — don't fake it or fetch one.

The 24 visual spectrum bands are schematic analysis bands. If ERB-spaced bands
are used, keep the ERB grouping distinct from raw FFT bins — an FFT bin is not
an auditory filter, and nothing should claim otherwise.

### Medical wording guardrails

Applies to UI copy, comments, docs, variable names, alt text, and any
generated explanation:

- Always qualify the central claim as sensorineural/cochlear hearing loss.
  Never imply all hearing loss behaves this way.
- State that conductive hearing loss behaves differently — closer to broad
  attenuation.
- Call the illustrated cells "outer hair cells", not just "hair cells".
- Outer hair cells contribute cochlear amplification and sharpening; don't
  describe them as the primary sensory receptors.
- Describe the audio processing as "a simplified acoustic model of
  frequency-dependent attenuation".
- Never call it a reproduction of an individual's hearing, or a complete
  simulation of sensorineural hearing loss.
- Note that real sensorineural hearing loss can also involve loudness
  recruitment, reduced frequency selectivity, and temporal-processing
  changes — this model doesn't reproduce those.
- A 3–6 kHz or 4 kHz notch may only be described as a commonly reported
  pattern — never a definitive signature, diagnosis, or universal result of
  noise exposure.
- Don't merge age-related and noise-related hearing loss into one mechanism.
- Don't imply local outer-hair-cell damage produces only attenuation.
- No fear-based, diagnostic, or personalised medical claims.
- Include: "This page is not a hearing test or medical advice. If you are
  concerned about your hearing, see an audiologist."
- Include a sound-safety warning near audio activation: start at a
  comfortable system volume, and never turn the volume up merely to hear a
  high-frequency tone.
- Close with a medically qualified line such as: "Sensorineural damage does
  not simply turn the world down. It can remove parts of it. That is why
  speaking louder may not restore the missing detail."

### Audio and accessibility rules

- Never autoplay. Audio starts only after an explicit user action.
- Begin at a conservative gain; use short gain ramps on start/stop/frequency
  change to avoid clicks and sudden tones.
- Provide a visible mute/stop control.
- Never instruct the visitor to raise the volume to hear high frequencies.
- The educational result must hold without sound: selected regions, wave
  position, frequency labels, attenuation and spectral-energy changes are all
  visible.
- Frequency control and the A/B interaction work with keyboard, mouse and
  touch — holding a pointer must not be the only way to trigger it; provide a
  keyboard-operable equivalent.
- Respect `prefers-reduced-motion`.
- Visible focus states, semantic labels, touch targets ≈44px.
- No horizontal scrolling at a 375px viewport.

### Implementation constraints

- Stays a static, GitHub Pages–compatible site.
- Follow this repo's existing TypeScript/Vite build structure — don't
  introduce a different stack or file layout.
- No third-party runtime dependencies, external APIs, remote fonts,
  analytics, microphone access, or uploaded user files.
- Prefer an accessible SVG for the cochlear map — its state and geometry need
  to be inspectable and testable.
- Keep the Greenwood calculations and damage-region-to-filter calculations as
  pure functions, separate from SVG rendering and Web Audio side effects.
- Rendering derives from explicit state; the DOM is not the application
  state.
- Don't change this harness merely to make an implementation pass. If a
  repository requirement conflicts with this contract, report the conflict
  before proceeding.

### Testable invariants to add later

Not written yet — recorded here as future requirements:

- Greenwood anchor calculations pass within documented tolerances.
- `displayX(8000) < displayX(1000) < displayX(250)`.
- Slider values use a perceptually appropriate logarithmic frequency mapping.
- Selecting a region always produces an ordered frequency range within
  125–8000 Hz.
- Attenuation centre frequency lies inside the selected range.
- Attenuation gain is non-positive and bounded to a safe documented range.
- Pressing/holding the A/B control enables the simplified attenuation path;
  releasing it restores bypass.
- The page produces no sound before explicit activation.
- The core interaction works at 375px without horizontal overflow.

### Explicitly out of scope

No cochlear implants, vocoders or electrode channels; no personal hearing
test or hearing-limit scan; no claims about an individual visitor's hearing;
no complete ear-anatomy lesson; no freehand damage brush (selection is one
continuous drag interval); no multiple songs or media menu; no microphone or
file upload; no artificial-implant processing; no quiz, navigation system or
second page; no second graph or independent coordinate system; no
third-party audio, fonts or runtime libraries.

### Process discipline

- Don't invent `PROCESS.md` or reflections entries before events actually
  happen.
- When a correction later changes a rule, invariant or test, flag whether it
  belongs in this file.
- Keep implementation changes small enough to verify and commit as distinct
  stages.
- Run the relevant checks and inspect the rendered result before any commit.
- Never commit a red state.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Run `pnpm check` before you push.
- Open the page in a browser and look at it. The rendered page is the truth;
  your mental model of it isn't.
- When a check fails, read its output before you change anything.
- Never commit a red state.

## The checks

`typecheck`, `build`, `deploy`, `spec`, `lint`, `tests`, `evidence`, `links`,
`secrets`. Run `pnpm check`. Read the failure.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook. As you learn what your prototype needs --- a
convention the work has to hold to, a sensor that keeps catching you out, a fact
about the stack that is easy to get wrong --- write it down here. Growing this
file is the work.
