// Stage 1 "Find the sound" wiring: the frequency control, the SVG
// travelling-wave peak and the pure tone all read from one explicit frequency
// state (CLAUDE.md: "Rendering derives from explicit state; the DOM is not
// the application state"). The Greenwood/slider maths live only in
// cochlea.ts --- this file never recomputes them.
//
// The diagram has two visual layers sharing one coordinate system: a
// decorative opening "ear-context" illustration, and the persistent unfolded
// cochlear map (CLAUDE.md: "one visual coordinate system", "no second graph
// or independent coordinate system"). Only a CSS class toggle
// (`is-unfolded`) distinguishes them --- the map's geometry and data-testids
// exist from first paint regardless of that class, so nothing here depends on
// the reveal having happened yet.

import {
  MAX_FREQUENCY_HZ,
  MIN_FREQUENCY_HZ,
  frequencyToDisplayPosition,
  frequencyToSliderPosition,
  sliderPositionToFrequency,
} from "./cochlea";
import { isToneActive, setGapFilters, startTone, stopTone, updateToneFrequency } from "./audio";
import { frequencyContext, frequencyToPercentFromBase } from "./frequency-context";
import { type ExperienceEvent, type ExperienceState, nextExperienceState } from "./experience";
import {
  type GapSelection,
  clampDisplayPosition,
  createGapSelection,
  createGapSelectionFromFrequencies,
  displayPositionToFrequency,
  formatFrequencyRangeHz,
  gapToFilterStages,
  isDisplayPositionInGap,
  isFrequencyInGap,
} from "./gap";
import { type SpectrumBand, aggregateBandEnergies, buildSpectrumBands } from "./spectrum";
import { getDemoAnalyser, getDemoProgress, setDemoGapFilters, setDemoWet, startDemo, stopDemo } from "./demo";
import coiledMapSvg from "./assets/orientation/coiled-cochlear-frequency-map.svg?raw";
import ohcCutawaySvg from "./assets/orientation/outer-hair-cell-cutaway.svg?raw";

const MAP_LEFT_X = 60;
const MAP_RIGHT_X = 740;
const ENVELOPE_BASELINE_Y = 150;
const ENVELOPE_AMPLITUDE = 46;
const ENVELOPE_SIGMA_LEFT = 140;
const ENVELOPE_SIGMA_RIGHT = 60;
const ENVELOPE_SAMPLE_STEPS = 60;
const OHC_CLUSTER_COUNT = 16;
const OHC_ROW_COUNT = 3;
const OHC_ROW_Y = [182, 195, 208];
const OHC_STEM_TOP_Y = 174;
const OHC_ACTIVE_NEIGHBOUR_SPREAD = 1;
const REFERENCE_LABEL_COLLISION_THRESHOLD = 30;
const REFERENCE_LABEL_YIELD_OFFSET = 22;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Stage 3 spectrum bars share the membrane's own vertical band (see
// ENVELOPE_BASELINE_Y/ENVELOPE_AMPLITUDE above) and are inserted immediately
// after the membrane path in index.html, so they paint behind the wave,
// reference marks, outer-hair-cell layer and labels that follow it.
const SPECTRUM_BASELINE_Y = 172;
const SPECTRUM_MAX_BAR_HEIGHT = 64;
const SPECTRUM_IDLE_BAR_HEIGHT = 3;
const SPECTRUM_BAR_WIDTH = 14;

interface OuterHairCellCluster {
  index: number;
  displayPosition: number;
  element: SVGGElement;
}

interface SpectrumBar {
  band: SpectrumBand;
  element: SVGRectElement;
}

interface ReferenceMark {
  x: number;
  label: SVGTextElement | null;
}

function formatFrequency(frequencyHz: number): string {
  return `${Math.round(frequencyHz).toLocaleString("en-US")} Hz`;
}

function formatPositionReadout(percentFromBase: number): string {
  return `Strongest response: ${percentFromBase}% from the base`;
}

// Feeds the native slider's aria-valuetext (Step 6C, CLAUDE.md: "The native
// slider must remain the primary keyboard-accessible frequency control") so
// its own accessible value already carries frequency, familiar-sound context
// and cochlear position together --- the visible frequency-context block
// deliberately isn't a second live region duplicating this same information.
function formatFrequencyValueText(frequencyHz: number, context: string, percentFromBase: number): string {
  return `${Math.round(frequencyHz)} hertz. ${context}. Strongest response ${percentFromBase} percent from the base.`;
}

function frequencyToMapX(frequencyHz: number): number {
  const displayPosition = frequencyToDisplayPosition(frequencyHz);
  return MAP_LEFT_X + displayPosition * (MAP_RIGHT_X - MAP_LEFT_X);
}

function displayPositionToMapX(displayPosition: number): number {
  return MAP_LEFT_X + displayPosition * (MAP_RIGHT_X - MAP_LEFT_X);
}

function mapXToDisplayPosition(x: number): number {
  return clampDisplayPosition((x - MAP_LEFT_X) / (MAP_RIGHT_X - MAP_LEFT_X));
}

function formatGapReadout(gap: GapSelection): string {
  const lowKHz = (gap.lowFrequencyHz / 1000).toFixed(1);
  const highKHz = (gap.highFrequencyHz / 1000).toFixed(1);
  return `${lowKHz}–${highKHz} kHz attenuated`;
}

// Step 6D: the two-part playback timeline's state, kept a distinct concept
// from the guided ExperienceState above --- this only ever describes where
// the current Stage 3 example has reached, never which stage the visitor is
// in.
type PlaybackPart = "ready" | "voice" | "melody" | "complete";

const PLAYBACK_STATUS_TEXT: Record<PlaybackPart, string> = {
  ready: "Ready · Your recorded voice plays first, followed by a code-synthesised melody.",
  voice: "Now playing: Your recorded voice · Next: code-synthesised melody.",
  melody: "Now playing: Code-synthesised melody.",
  complete: "Playback complete · Ready to play again.",
};

function buildEnvelopePath(centerX: number): string {
  const commands: string[] = [];
  for (let step = 0; step <= ENVELOPE_SAMPLE_STEPS; step += 1) {
    const x = MAP_LEFT_X + (step / ENVELOPE_SAMPLE_STEPS) * (MAP_RIGHT_X - MAP_LEFT_X);
    const sigma = x <= centerX ? ENVELOPE_SIGMA_LEFT : ENVELOPE_SIGMA_RIGHT;
    const y = ENVELOPE_BASELINE_Y - ENVELOPE_AMPLITUDE * Math.exp(-((x - centerX) ** 2) / (2 * sigma * sigma));
    commands.push(`${step === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return commands.join(" ");
}

function layOutReferenceMarks(svg: SVGSVGElement): ReferenceMark[] {
  const marks: ReferenceMark[] = [];

  for (const mark of svg.querySelectorAll<SVGGElement>(".reference-mark")) {
    const hz = Number(mark.dataset.refHz);
    if (!Number.isFinite(hz)) continue;

    const x = frequencyToMapX(hz);
    const tick = mark.querySelector("line");
    const label = mark.querySelector<SVGTextElement>("text");
    tick?.setAttribute("x1", String(x));
    tick?.setAttribute("x2", String(x));
    label?.setAttribute("x", String(x));
    marks.push({ x, label });
  }

  return marks;
}

// The travelling-wave peak and its "Peak response" callout share the same
// horizontal band as these static reference labels. When the peak lands on
// or near one of the four fixed frequencies, its circle can sit directly on
// top of that label's text. Nudging the label sideways (away from the peak,
// tick left in place) keeps both readable without moving the peak/callout
// out of the row it shares with the wave it's marking.
function updateReferenceMarkCollisions(marks: ReferenceMark[], centerX: number): void {
  for (const mark of marks) {
    if (!mark.label) continue;
    const delta = mark.x - centerX;
    if (Math.abs(delta) < REFERENCE_LABEL_COLLISION_THRESHOLD) {
      const offset = delta <= 0 ? -REFERENCE_LABEL_YIELD_OFFSET : REFERENCE_LABEL_YIELD_OFFSET;
      mark.label.setAttribute("x", String(mark.x + offset));
    } else {
      mark.label.setAttribute("x", String(mark.x));
    }
  }
}

function createOuterHairCellGlyph(row: number): SVGGElement {
  const cell = document.createElementNS(SVG_NAMESPACE, "g");
  cell.setAttribute("class", "ohc-cell");
  cell.setAttribute("data-row", String(row));

  const body = document.createElementNS(SVG_NAMESPACE, "rect");
  body.setAttribute("class", "ohc-body");
  body.setAttribute("x", "-3.5");
  body.setAttribute("y", "-8");
  body.setAttribute("width", "7");
  body.setAttribute("height", "16");
  body.setAttribute("rx", "3.5");

  const plate = document.createElementNS(SVG_NAMESPACE, "ellipse");
  plate.setAttribute("class", "ohc-plate");
  plate.setAttribute("cx", "0");
  plate.setAttribute("cy", "-8");
  plate.setAttribute("rx", "4");
  plate.setAttribute("ry", "2.2");

  const stereocilia = document.createElementNS(SVG_NAMESPACE, "path");
  stereocilia.setAttribute("class", "ohc-stereocilia");
  stereocilia.setAttribute("d", "M -4,-9 L -5.5,-17 M 0,-9 L 0,-18.5 M 4,-9 L 5.5,-17");

  cell.append(body, plate, stereocilia);
  return cell;
}

// Cell clusters are spaced evenly along the map's x-axis, not via the
// Greenwood formula: OHCs are physically ~evenly distributed along the
// cochlear duct, and it's frequency (not physical place) that's log-spaced
// over that even physical spacing. Each cluster records a stable index and
// a normalised base(0)-to-apex(1) display position so this stage can address
// the cluster nearest the current travelling-wave peak, and so Stage 2 can
// later address and dim the clusters inside a selected frequency range.
function layOutOuterHairCells(svg: SVGSVGElement): OuterHairCellCluster[] {
  const layer = svg.querySelector<SVGGElement>('[data-testid="outer-hair-cells"]');
  if (!layer) return [];

  const clusters: OuterHairCellCluster[] = [];

  for (let index = 0; index < OHC_CLUSTER_COUNT; index += 1) {
    const displayPosition = index / (OHC_CLUSTER_COUNT - 1);
    const x = MAP_LEFT_X + displayPosition * (MAP_RIGHT_X - MAP_LEFT_X);
    const jitter = (index % 2) * 3 - 1.5;

    const cluster = document.createElementNS(SVG_NAMESPACE, "g");
    cluster.setAttribute("class", "ohc-cluster");
    cluster.setAttribute("data-cluster-index", String(index));
    cluster.setAttribute("data-display-position", displayPosition.toFixed(3));

    const stem = document.createElementNS(SVG_NAMESPACE, "line");
    stem.setAttribute("class", "ohc-stem");
    stem.setAttribute("x1", String(x + jitter));
    stem.setAttribute("y1", String(OHC_STEM_TOP_Y));
    stem.setAttribute("x2", String(x + jitter));
    stem.setAttribute("y2", String(OHC_ROW_Y[0] - 8));
    cluster.append(stem);

    for (let row = 0; row < OHC_ROW_COUNT; row += 1) {
      const cell = createOuterHairCellGlyph(row);
      cell.setAttribute("transform", `translate(${x + jitter}, ${OHC_ROW_Y[row]})`);
      cluster.append(cell);
    }

    layer.append(cluster);
    clusters.push({ index, displayPosition, element: cluster });
  }

  return clusters;
}

// Finds the cluster(s) whose display position lies nearest the current
// travelling-wave peak and marks them active; every previously active
// cluster is returned to its resting appearance first. This only ever
// marks "active" state --- Stage 2 owns the separate damaged state, so
// nothing here dims, removes or labels a cell as damaged.
function updateActiveOuterHairCells(clusters: OuterHairCellCluster[], displayPosition: number): void {
  if (clusters.length === 0) return;

  let nearestIndex = clusters[0].index;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const cluster of clusters) {
    const distance = Math.abs(cluster.displayPosition - displayPosition);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = cluster.index;
    }
  }

  for (const cluster of clusters) {
    const isActive = Math.abs(cluster.index - nearestIndex) <= OHC_ACTIVE_NEIGHBOUR_SPREAD;
    if (isActive) {
      cluster.element.setAttribute("data-active", "true");
    } else {
      cluster.element.removeAttribute("data-active");
    }
  }
}

// Stage 3's 24 ERB-grouped bars (spectrum.ts's buildSpectrumBands), laid out
// on the same Greenwood x-axis as everything else on the map. Bars start at
// a quiet baseline height and are only ever raised by real analyser energy
// (see updateSpectrumBarEnergies below) --- never by decorative animation.
function layOutSpectrumBars(svg: SVGSVGElement): SpectrumBar[] {
  const layer = svg.querySelector<SVGGElement>('[data-testid="spectrum-bars"]');
  if (!layer) return [];

  const bars: SpectrumBar[] = [];
  for (const band of buildSpectrumBands()) {
    const centerX = MAP_LEFT_X + band.displayPosition * (MAP_RIGHT_X - MAP_LEFT_X);

    const bar = document.createElementNS(SVG_NAMESPACE, "rect");
    bar.setAttribute("class", "spectrum-bar");
    bar.setAttribute("data-band-index", String(band.index));
    bar.setAttribute("data-center-hz", band.centerFrequencyHz.toFixed(1));
    bar.setAttribute("x", String(centerX - SPECTRUM_BAR_WIDTH / 2));
    bar.setAttribute("width", String(SPECTRUM_BAR_WIDTH));
    bar.setAttribute("y", String(SPECTRUM_BASELINE_Y - SPECTRUM_IDLE_BAR_HEIGHT));
    bar.setAttribute("height", String(SPECTRUM_IDLE_BAR_HEIGHT));

    layer.append(bar);
    bars.push({ band, element: bar });
  }
  return bars;
}

function setSpectrumBarHeight(bar: SpectrumBar, height: number): void {
  const clampedHeight = Math.max(SPECTRUM_IDLE_BAR_HEIGHT, Math.min(SPECTRUM_MAX_BAR_HEIGHT, height));
  bar.element.setAttribute("y", String(SPECTRUM_BASELINE_Y - clampedHeight));
  bar.element.setAttribute("height", String(clampedHeight));
}

function resetSpectrumBarsToBaseline(bars: SpectrumBar[]): void {
  for (const bar of bars) setSpectrumBarHeight(bar, SPECTRUM_IDLE_BAR_HEIGHT);
}

// Marks bars whose centre frequency falls inside the current gap so the
// selected region stays visually identifiable on the spectrum row, the same
// way updateOuterHairCellGapState marks the outer-hair-cell layer.
function updateSpectrumBarGapState(bars: SpectrumBar[], gap: GapSelection | null): void {
  for (const bar of bars) {
    const inGap = gap !== null && isFrequencyInGap(bar.band.centerFrequencyHz, gap);
    if (inGap) {
      bar.element.setAttribute("data-in-gap", "true");
    } else {
      bar.element.removeAttribute("data-in-gap");
    }
  }
}

// Reads the analyser's current FFT-bin magnitudes and raises each bar to its
// ERB-grouped energy --- this is the only thing that ever raises a bar above
// its idle baseline, so no bar moves while nothing is playing.
function updateSpectrumBarEnergies(bars: SpectrumBar[], analyser: AnalyserNode): void {
  const magnitudes = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(magnitudes);
  const energies = aggregateBandEnergies(
    bars.map((bar) => bar.band),
    magnitudes,
    analyser.context.sampleRate,
    analyser.fftSize,
  );
  bars.forEach((bar, index) => {
    const energy = energies[index] ?? 0;
    setSpectrumBarHeight(bar, (energy / 255) * SPECTRUM_MAX_BAR_HEIGHT);
  });
}

// Public surface `init()` uses to advance and read the guided state without
// reaching into initExperience()'s own closure --- Stage 1-3's progressive
// disclosure (CLAUDE.md: "Guide visitors through Stages 1-3") is driven by
// genuine control interactions that live in `init()`, not here.
interface ExperienceController {
  advance(event: ExperienceEvent): ExperienceState;
  getState(): ExperienceState;
}

// Guided orientation wiring (CLAUDE.md: "Guided orientation"). The state
// itself lives in `state` below and is the only thing nextExperienceState
// ever reads/advances --- initialization, resize, animation completion and
// audio events must never call it, only explicit user activations.
function initExperience(): ExperienceController | null {
  const root = document.querySelector<HTMLElement>("main");
  const orientationPanel = document.querySelector<HTMLElement>('[data-testid="orientation-panel"]');
  const cochleaFocusPanel = document.querySelector<HTMLElement>('[data-testid="cochlea-focus-panel"]');
  const explorerPanel = document.querySelector<HTMLElement>('[data-testid="explorer-panel"]');
  const exploreButton = document.querySelector<HTMLButtonElement>('[data-testid="explore-cochlea"]');
  const skipButton = document.querySelector<HTMLButtonElement>('[data-testid="skip-to-map"]');
  const unfoldButton = document.querySelector<HTMLButtonElement>('[data-testid="unfold-cochlea"]');
  const stageProgressItems = Array.from(
    explorerPanel?.querySelectorAll<HTMLLIElement>('[data-testid="stage-progress-item"]') ?? [],
  );

  if (!root || !orientationPanel || !cochleaFocusPanel || !explorerPanel) return null;

  const experienceStage = document.querySelector<HTMLElement>(".experience-stage");

  const coiledMapContainer = cochleaFocusPanel.querySelector<HTMLElement>(
    '[data-testid="coiled-map-illustration"]',
  );
  const ohcContainer = cochleaFocusPanel.querySelector<HTMLElement>('[data-testid="ohc-illustration"]');
  if (coiledMapContainer) coiledMapContainer.innerHTML = coiledMapSvg;
  if (ohcContainer) ohcContainer.innerHTML = ohcCutawaySvg;

  let state: ExperienceState = "orientation";

  // The three Stage 1-3 steps, in the order the progress indicator lists
  // them --- used only to compare "how far along" the current state is, not
  // to drive nextExperienceState itself.
  const STAGE_ORDER: ExperienceState[] = ["find", "gap", "compare"];

  function updateStageProgress(): void {
    const currentIndex = STAGE_ORDER.indexOf(state);
    for (const item of stageProgressItems) {
      const step = item.dataset.step as ExperienceState | undefined;
      const stepIndex = step ? STAGE_ORDER.indexOf(step) : -1;
      if (stepIndex === -1 || currentIndex === -1) continue;

      if (step === state) {
        item.setAttribute("aria-current", "step");
      } else {
        item.removeAttribute("aria-current");
      }

      if (currentIndex > stepIndex) {
        item.setAttribute("data-complete", "true");
      } else {
        item.removeAttribute("data-complete");
      }
    }
  }

  function applyState(): void {
    root!.setAttribute("data-experience-state", state);
    orientationPanel!.hidden = state !== "orientation";
    cochleaFocusPanel!.hidden = state !== "cochlea-focus";
    explorerPanel!.hidden = state === "orientation" || state === "cochlea-focus";
    updateStageProgress();
  }

  // These are native <button> elements, so the browser already turns Enter
  // and Space into a "click" --- wiring both events here would fire the
  // transition twice per keyboard activation. Rely on native activation only.
  function bindActivation(button: HTMLButtonElement | null, handler: () => void): void {
    if (!button) return;
    button.addEventListener("click", handler);
  }

  // Step 5 ("Connect the coiled orientation map to the existing straight
  // interactive map"): a staged visual bridge layered on top of the state
  // change above, never a cause of it. `applyState()` above has already made
  // cochleaFocusPanel `hidden` and explorerPanel visible by the time any of
  // this runs --- these temporary classes and elements only keep the
  // outgoing panel visually present (via a CSS `[hidden]` override) and
  // animate the incoming one, while `aria-hidden`/`inert` keep the outgoing
  // layer out of the accessible and focusable tree throughout. Cleanup is
  // triggered by whichever of animationend/the fallback timer fires first,
  // and must be safe to run more than once and never touch `state`.
  let unfoldFallbackTimer: number | undefined;
  let unfoldCaption: HTMLParagraphElement | null = null;
  let unfoldGuideLine: HTMLSpanElement | null = null;

  function clearUnfoldTransition(): void {
    if (unfoldFallbackTimer !== undefined) {
      window.clearTimeout(unfoldFallbackTimer);
      unfoldFallbackTimer = undefined;
    }
    cochleaFocusPanel!.classList.remove("is-unfold-transition");
    cochleaFocusPanel!.removeAttribute("aria-hidden");
    cochleaFocusPanel!.removeAttribute("inert");
    explorerPanel!.classList.remove("is-unfold-reveal");
    unfoldCaption?.remove();
    unfoldCaption = null;
    unfoldGuideLine?.remove();
    unfoldGuideLine = null;
  }

  function handleUnfoldAnimationEnd(event: Event): void {
    if (event.target !== cochleaFocusPanel) return;
    cochleaFocusPanel!.removeEventListener("animationend", handleUnfoldAnimationEnd);
    clearUnfoldTransition();
  }

  // The decorative bridge between the two maps: a short caption and a guide
  // line, created fresh for each presentation and removed by
  // clearUnfoldTransition. Neither is part of either inline SVG, neither is
  // exposed as a control, and the caption is never announced as a new
  // application state --- the state itself already changed, above, before
  // either of these exists.
  function createUnfoldBridgeElements(): void {
    if (!experienceStage) return;

    const caption = document.createElement("p");
    caption.className = "unfold-caption";
    caption.dataset.testid = "unfold-caption";
    caption.setAttribute("aria-hidden", "true");
    caption.textContent = "Same map, unfolded";
    experienceStage.append(caption);
    unfoldCaption = caption;

    const guideLine = document.createElement("span");
    guideLine.className = "unfold-guide-line";
    guideLine.dataset.testid = "unfold-guide-line";
    guideLine.setAttribute("aria-hidden", "true");
    experienceStage.append(guideLine);
    unfoldGuideLine = guideLine;
  }

  bindActivation(exploreButton, () => {
    state = nextExperienceState(state, "explore-cochlea");
    applyState();
  });
  bindActivation(skipButton, () => {
    state = nextExperienceState(state, "skip-to-map");
    applyState();
  });
  bindActivation(unfoldButton, () => {
    const wasCochleaFocus = state === "cochlea-focus";
    state = nextExperienceState(state, "unfold-cochlea");
    applyState();

    if (!wasCochleaFocus || state !== "find") return;

    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      clearUnfoldTransition();
      return;
    }

    cochleaFocusPanel!.classList.add("is-unfold-transition");
    cochleaFocusPanel!.setAttribute("aria-hidden", "true");
    cochleaFocusPanel!.setAttribute("inert", "");
    explorerPanel!.classList.add("is-unfold-reveal");
    createUnfoldBridgeElements();

    cochleaFocusPanel!.addEventListener("animationend", handleUnfoldAnimationEnd);
    unfoldFallbackTimer = window.setTimeout(clearUnfoldTransition, 1450);
  });

  applyState();

  return {
    advance(event) {
      state = nextExperienceState(state, event);
      applyState();
      return state;
    },
    getState() {
      return state;
    },
  };
}

function init(): void {
  const experience = initExperience();

  const control = document.querySelector<HTMLInputElement>('[data-testid="frequency-control"]');
  const readout = document.querySelector<HTMLOutputElement>('[data-testid="frequency-readout"]');
  const diagram = document.querySelector<SVGSVGElement>('[data-testid="cochlear-diagram"]');
  const peak = document.querySelector<SVGCircleElement>('[data-testid="travelling-wave-peak"]');
  const envelope = document.querySelector<SVGPathElement>(".wave-envelope");
  const instruction = document.querySelector<HTMLElement>('[data-testid="diagram-instruction"]');
  const frequencyContextSound = document.querySelector<HTMLElement>('[data-testid="frequency-context-sound"]');
  const frequencyContextPosition = document.querySelector<HTMLElement>(
    '[data-testid="frequency-context-position"]',
  );
  const toneToggle = document.querySelector<HTMLButtonElement>('[data-testid="tone-toggle"]');
  const peakCallout = document.querySelector<SVGGElement>('[data-testid="peak-callout"]');
  const gapControlPanel = document.querySelector<HTMLElement>('[data-testid="gap-control"]');
  const demoControlPanel = document.querySelector<HTMLElement>('[data-testid="demo-control"]');
  const gapSurface = document.querySelector<SVGRectElement>('[data-testid="map-interaction-surface"]');
  const gapSelectionRect = document.querySelector<SVGRectElement>('[data-testid="gap-selection"]');
  const gapReadout = document.querySelector<HTMLOutputElement>('[data-testid="gap-readout"]');
  const editGapButton = document.querySelector<HTMLButtonElement>('[data-testid="edit-gap"]');
  const clearGapButton = document.querySelector<HTMLButtonElement>('[data-testid="clear-gap"]');
  const gapLowerInput = document.querySelector<HTMLInputElement>('[data-testid="gap-lower-frequency"]');
  const gapUpperInput = document.querySelector<HTMLInputElement>('[data-testid="gap-upper-frequency"]');
  const demoPlayButton = document.querySelector<HTMLButtonElement>('[data-testid="demo-play"]');
  const gapCompareButton = document.querySelector<HTMLButtonElement>('[data-testid="gap-compare"]');
  const demoPhaseStatus = document.querySelector<HTMLOutputElement>('[data-testid="demo-phase-status"]');
  const demoRouteStatus = document.querySelector<HTMLOutputElement>('[data-testid="demo-route-status"]');
  const demoErrorEl = document.querySelector<HTMLElement>('[data-testid="demo-error"]');
  const playbackTimeline = document.querySelector<HTMLElement>('[data-testid="playback-timeline"]');
  const playbackProgress = document.querySelector<HTMLProgressElement>('[data-testid="playback-progress"]');

  // The persistent straight map has exactly three interaction modes, keyed
  // off the same guided experience state Stage 1-3's progressive disclosure
  // already tracks (CLAUDE.md: "explicit Explore, Select-Gap and Compare
  // modes"). Exposed on the SVG as `data-map-mode` so it's inspectable and
  // testable without reaching into this closure.
  type MapMode = "explore-frequency" | "select-gap" | "display-only";

  function currentMapMode(): MapMode {
    const state = experience?.getState() ?? "find";
    if (state === "gap") return "select-gap";
    if (state === "compare") return "display-only";
    return "explore-frequency";
  }

  // Stage 2 and Stage 3's progressive disclosure (CLAUDE.md: "Guide visitors
  // through Stages 1-3"): each panel's `hidden` attribute follows the guided
  // experience state, not just CSS, so an unlocked-later panel is genuinely
  // unreachable by keyboard or screen reader until its stage is reached.
  function updateStageVisibility(): void {
    const currentState = experience?.getState() ?? "find";
    if (gapControlPanel) gapControlPanel.hidden = currentState !== "gap" && currentState !== "compare";
    if (demoControlPanel) demoControlPanel.hidden = currentState !== "compare";
    if (editGapButton) editGapButton.hidden = currentState !== "compare";
    if (diagram) diagram.dataset.mapMode = currentMapMode();
    updateModeInstruction();
  }

  function advanceExperience(event: ExperienceEvent): void {
    experience?.advance(event);
    updateStageVisibility();
  }

  if (!control || !readout || !diagram || !peak || !envelope) return;

  const controlEl = control;
  const readoutEl = readout;
  const diagramEl = diagram;
  const peakEl = peak;
  const envelopeEl = envelope;
  const peakCalloutLeader = peakCallout?.querySelector<SVGLineElement>(".peak-callout-leader") ?? null;
  const peakCalloutLabel = peakCallout?.querySelector<SVGTextElement>(".peak-callout-label") ?? null;

  const referenceMarks = layOutReferenceMarks(diagramEl);
  const outerHairCellClusters = layOutOuterHairCells(diagramEl);
  const spectrumBars = layOutSpectrumBars(diagramEl);

  let gap: GapSelection | null = null;

  function currentFrequency(): number {
    return sliderPositionToFrequency(controlEl.valueAsNumber);
  }

  function render(): void {
    const frequencyHz = currentFrequency();
    const displayPosition = frequencyToDisplayPosition(frequencyHz);
    const centerX = frequencyToMapX(frequencyHz);
    readoutEl.textContent = formatFrequency(frequencyHz);

    // Step 6C: one shared frequency-context result, kept in sync with the
    // readout above because both are driven from the same currentFrequency()
    // read --- there is no separate context state to fall out of step.
    const context = frequencyContext(frequencyHz);
    const percentFromBase = frequencyToPercentFromBase(frequencyHz);
    if (frequencyContextSound) frequencyContextSound.textContent = context;
    if (frequencyContextPosition) frequencyContextPosition.textContent = formatPositionReadout(percentFromBase);
    controlEl.setAttribute("aria-valuetext", formatFrequencyValueText(frequencyHz, context, percentFromBase));
    peakEl.setAttribute("cx", String(centerX));
    envelopeEl.setAttribute("d", buildEnvelopePath(centerX));
    peakCalloutLeader?.setAttribute("x1", String(centerX));
    peakCalloutLeader?.setAttribute("x2", String(centerX));
    peakCalloutLabel?.setAttribute("x", String(centerX));
    updateActiveOuterHairCells(outerHairCellClusters, displayPosition);
    updateReferenceMarkCollisions(referenceMarks, centerX);

    const attenuated = gap !== null && isFrequencyInGap(frequencyHz, gap);
    if (attenuated) {
      envelopeEl.setAttribute("data-attenuated", "true");
      peakEl.setAttribute("data-attenuated", "true");
    } else {
      envelopeEl.removeAttribute("data-attenuated");
      peakEl.removeAttribute("data-attenuated");
    }

    if (isToneActive()) {
      updateToneFrequency(frequencyHz);
    }
  }

  let hasUnfolded = false;

  // One short instruction for the current map mode (CLAUDE.md: "Do not
  // display all three instructions simultaneously"). A no-op before the map
  // unfolds, so it never overwrites the static pre-unfold prompt.
  function updateModeInstruction(): void {
    if (!instruction || !hasUnfolded) return;
    const mode = currentMapMode();
    if (mode === "select-gap") {
      instruction.textContent = "Drag across the cochlea to make one gap.";
    } else if (mode === "display-only") {
      instruction.textContent = "Gap shown · use Edit gap to change it.";
    } else {
      instruction.textContent = "Drag along the cochlea to find a sound.";
    }
  }

  function revealUnfoldedMap(): void {
    if (hasUnfolded) return;
    hasUnfolded = true;
    diagramEl.classList.add("is-unfolded");
    updateModeInstruction();
  }

  controlEl.addEventListener("input", () => {
    revealUnfoldedMap();
    render();
    // A real "input" event only fires from genuine pointer/keyboard use, not
    // from a programmatic .value assignment --- so this is already the
    // narrowest signal of "the visitor actually explored a frequency"
    // Stage 2's unlock needs.
    advanceExperience("explore-frequency");
  });

  toneToggle?.addEventListener("click", () => {
    if (isToneActive()) {
      stopTone();
      toneToggle.textContent = "Play tone";
      toneToggle.setAttribute("aria-pressed", "false");
    } else {
      startTone(currentFrequency());
      toneToggle.textContent = "Stop tone";
      toneToggle.setAttribute("aria-pressed", "true");
    }
  });

  window.addEventListener("pagehide", () => {
    stopTone();
    stopDemo();
    if (energyAnimationFrame !== null) cancelAnimationFrame(energyAnimationFrame);
  });

  if (gapSurface && gapSelectionRect && gapReadout && clearGapButton && gapLowerInput && gapUpperInput) {
    const surfaceEl = gapSurface;
    const selectionEl = gapSelectionRect;
    const gapReadoutEl = gapReadout;
    const lowerInputEl = gapLowerInput;
    const upperInputEl = gapUpperInput;

    function renderGapGeometry(current: GapSelection | null): void {
      if (!current) {
        selectionEl.setAttribute("width", "0");
        return;
      }
      const x = displayPositionToMapX(current.lowDisplayPosition);
      const width = displayPositionToMapX(current.highDisplayPosition) - x;
      selectionEl.setAttribute("x", String(x));
      selectionEl.setAttribute("width", String(width));
    }

    function updateOuterHairCellGapState(current: GapSelection | null): void {
      for (const cluster of outerHairCellClusters) {
        const inGap = current !== null && isDisplayPositionInGap(cluster.displayPosition, current);
        if (inGap) {
          cluster.element.setAttribute("data-in-gap", "true");
        } else {
          cluster.element.removeAttribute("data-in-gap");
        }
      }
    }

    // Updates the selection geometry, cell states, readout, filters and
    // wave/tone attenuation from a gap --- but never writes into the number
    // inputs themselves. Doing that unconditionally on every commit would
    // let editing one field's own "input" handler overwrite the *other*
    // field's still-in-progress value with a rounded, minimum-width-enforced
    // number before the visitor (or a keyboard-only test) gets to it.
    function setGap(next: GapSelection | null): void {
      gap = next;
      renderGapGeometry(gap);
      updateOuterHairCellGapState(gap);
      updateSpectrumBarGapState(spectrumBars, gap);

      if (gap) {
        gapReadoutEl.textContent = formatGapReadout(gap);
        setGapFilters(gapToFilterStages(gap));
        setDemoGapFilters(gapToFilterStages(gap));
        // createGapSelection/createGapSelectionFromFrequencies always return
        // an ordered, minimum-width, in-range selection, so "a gap was
        // committed here" already is "a valid gap" --- Stage 3's unlock
        // needs no separate validity check.
        advanceExperience("create-gap");
      } else {
        gapReadoutEl.textContent = "No gap selected";
        setGapFilters(null);
        setDemoGapFilters(null);
      }

      updateGapCompareAvailability();
      render();
    }

    // Reflects a gap set by pointer/touch drag or Clear back into the
    // keyboard-accessible numeric fields, so all three input methods stay in
    // sync with one shared gap state.
    function syncGapInputs(current: GapSelection | null): void {
      if (current) {
        lowerInputEl.value = String(Math.round(current.lowFrequencyHz));
        upperInputEl.value = String(Math.round(current.highFrequencyHz));
      } else {
        lowerInputEl.value = "";
        upperInputEl.value = "";
      }
    }

    function displayPositionFromClientX(clientX: number): number {
      const rect = diagramEl.getBoundingClientRect();
      const viewBoxX = rect.width > 0 ? ((clientX - rect.left) / rect.width) * 800 : 0;
      return mapXToDisplayPosition(viewBoxX);
    }

    // Reads the slider's position from the same Greenwood conversion the map
    // uses (gap.ts's displayPositionToFrequency) --- no second approximate
    // frequency-position formula. Sets .value directly (not via a dispatched
    // "input" event) so this never re-enters this same handler.
    function applyFrequencyFromPosition(displayPosition: number): void {
      const frequencyHz = displayPositionToFrequency(displayPosition);
      controlEl.value = String(frequencyToSliderPosition(frequencyHz));
      revealUnfoldedMap();
      render();
    }

    // The map mode is locked once, at pointerdown, into activeGestureMode and
    // reread from that local for the rest of the gesture --- never from a
    // live currentMapMode() --- so a mid-drag stage unlock (explore-frequency
    // advancing find -> gap) can never change what the in-progress gesture
    // does. display-only intentionally has no branch below: dragging or
    // clicking in compare mode is a deliberate no-op.
    let activeGestureMode: MapMode | null = null;
    let gestureStartPosition = 0;

    surfaceEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const mode = currentMapMode();
      activeGestureMode = mode;
      const position = displayPositionFromClientX(event.clientX);
      gestureStartPosition = position;
      surfaceEl.setPointerCapture?.(event.pointerId);
      event.preventDefault();

      if (mode === "explore-frequency") {
        applyFrequencyFromPosition(position);
      } else if (mode === "select-gap") {
        renderGapGeometry(createGapSelection(position, position));
      }
    });

    surfaceEl.addEventListener("pointermove", (event) => {
      if (activeGestureMode === null) return;
      const position = displayPositionFromClientX(event.clientX);
      if (activeGestureMode === "explore-frequency") {
        applyFrequencyFromPosition(position);
      } else if (activeGestureMode === "select-gap") {
        renderGapGeometry(createGapSelection(gestureStartPosition, position));
      }
    });

    surfaceEl.addEventListener("pointerup", (event) => {
      if (activeGestureMode === null) return;
      const mode = activeGestureMode;
      const position = displayPositionFromClientX(event.clientX);
      surfaceEl.releasePointerCapture?.(event.pointerId);
      activeGestureMode = null;

      if (mode === "explore-frequency") {
        applyFrequencyFromPosition(position);
        // Fires only on gesture completion --- mirrors the native slider's
        // "input" event only ever meaning a completed user action, and keeps
        // a single explore gesture from also creating a gap mid-drag.
        advanceExperience("explore-frequency");
      } else if (mode === "select-gap") {
        const finalized = createGapSelection(gestureStartPosition, position);
        setGap(finalized);
        syncGapInputs(finalized);
      }
    });

    surfaceEl.addEventListener("pointercancel", () => {
      if (activeGestureMode === "select-gap") {
        renderGapGeometry(gap);
      }
      activeGestureMode = null;
    });

    // Deliberately does not call syncGapInputs: this handler fires from the
    // inputs' own "input" event, and writing rounded values back into both
    // fields here would clobber whichever field the visitor (or a
    // keyboard-only edit of lower then upper) hasn't gotten to yet.
    function commitGapFromInputs(): void {
      const lowerRaw = lowerInputEl.valueAsNumber;
      const upperRaw = upperInputEl.valueAsNumber;
      if (!Number.isFinite(lowerRaw) || !Number.isFinite(upperRaw)) return;
      const lower = Math.min(MAX_FREQUENCY_HZ, Math.max(MIN_FREQUENCY_HZ, lowerRaw));
      const upper = Math.min(MAX_FREQUENCY_HZ, Math.max(MIN_FREQUENCY_HZ, upperRaw));
      setGap(createGapSelectionFromFrequencies(lower, upper));
    }

    lowerInputEl.addEventListener("input", commitGapFromInputs);
    upperInputEl.addEventListener("input", commitGapFromInputs);

    // Only Clear gap deletes the interval --- it is the one control that
    // ever calls setGap(null). Edit gap (below) deliberately never does.
    clearGapButton.addEventListener("click", () => {
      setGap(null);
      syncGapInputs(null);
      advanceExperience("clear-gap");
    });
  }

  // Edit gap only moves the experience (and map mode) back to gap: the
  // existing gap, filters and inputs are untouched, so the next drag can
  // replace or adjust the interval already shown.
  editGapButton?.addEventListener("click", () => {
    advanceExperience("edit-gap");
  });

  // Stage 3 "Hear what the gap removes" demo wiring. `demoUiPlaying` is an
  // optimistic UI-level flag, deliberately independent of demo.ts's own
  // isDemoPlaying(): jsdom has no Web Audio implementation, so the visible
  // play/stop state, phase status and A/B availability must all hold even
  // when the underlying AudioContext can never be constructed
  // (CLAUDE.md: "the educational result must hold without sound").
  let demoUiPlaying = false;
  let energyAnimationFrame: number | null = null;
  let progressAnimationFrame: number | null = null;

  function updateGapCompareAvailability(): void {
    if (!gapCompareButton) return;
    gapCompareButton.disabled = !(gap !== null && demoUiPlaying);
  }

  function setDemoRouteStatus(throughGap: boolean): void {
    if (demoRouteStatus) {
      demoRouteStatus.textContent =
        throughGap && gap
          ? `Gap active · ${formatFrequencyRangeHz(gap.lowFrequencyHz, gap.highFrequencyHz)} attenuated`
          : "Original spectrum";
    }
    gapCompareButton?.setAttribute("aria-pressed", throughGap ? "true" : "false");
  }

  // The visible playback-part timeline/status/progress all read from this one
  // piece of state, which is only ever advanced by demo.ts's phase/end
  // callbacks (real or fallback-timed --- see demo.ts's
  // FALLBACK_VOICE_DURATION_SECONDS) --- never by this function itself
  // guessing at timing.
  function setPlaybackPart(part: PlaybackPart): void {
    if (playbackTimeline) playbackTimeline.dataset.playbackPart = part;
    if (demoPhaseStatus) demoPhaseStatus.textContent = PLAYBACK_STATUS_TEXT[part];
  }

  function syncPlaybackProgress(): void {
    if (!playbackProgress) return;
    const percent = Math.round(getDemoProgress() * 100);
    playbackProgress.value = Math.min(100, Math.max(0, percent));
  }

  function startProgressLoop(): void {
    function tick(): void {
      syncPlaybackProgress();
      progressAnimationFrame = requestAnimationFrame(tick);
    }
    if (progressAnimationFrame === null) {
      progressAnimationFrame = requestAnimationFrame(tick);
    }
  }

  function stopProgressLoop(): void {
    if (progressAnimationFrame !== null) {
      cancelAnimationFrame(progressAnimationFrame);
      progressAnimationFrame = null;
    }
  }

  function startEnergyLoop(): void {
    function tick(): void {
      const analyser = getDemoAnalyser();
      if (!analyser) {
        energyAnimationFrame = null;
        return;
      }
      updateSpectrumBarEnergies(spectrumBars, analyser);
      energyAnimationFrame = requestAnimationFrame(tick);
    }
    if (energyAnimationFrame === null) {
      energyAnimationFrame = requestAnimationFrame(tick);
    }
  }

  function stopEnergyLoop(): void {
    if (energyAnimationFrame !== null) {
      cancelAnimationFrame(energyAnimationFrame);
      energyAnimationFrame = null;
    }
    resetSpectrumBarsToBaseline(spectrumBars);
  }

  function showDemoError(message: string): void {
    if (!demoErrorEl) return;
    demoErrorEl.textContent = message;
    demoErrorEl.hidden = false;
  }

  function hideDemoError(): void {
    if (!demoErrorEl) return;
    demoErrorEl.hidden = true;
    demoErrorEl.textContent = "";
  }

  function endDemoPlayback(part: PlaybackPart): void {
    demoUiPlaying = false;
    if (demoPlayButton) demoPlayButton.textContent = "Play speech + melody";
    setPlaybackPart(part);
    if (playbackProgress) playbackProgress.value = part === "complete" ? 100 : 0;
    setDemoRouteStatus(false);
    stopEnergyLoop();
    stopProgressLoop();
    updateGapCompareAvailability();
  }

  demoPlayButton?.addEventListener("click", () => {
    if (demoUiPlaying) {
      stopDemo();
      endDemoPlayback("ready");
      return;
    }

    hideDemoError();
    demoUiPlaying = true;
    demoPlayButton.textContent = "Stop playback";
    setDemoRouteStatus(false);
    setPlaybackPart("ready");
    if (playbackProgress) playbackProgress.value = 0;
    updateGapCompareAvailability();
    startEnergyLoop();
    startProgressLoop();

    void startDemo(gap ? gapToFilterStages(gap) : null, {
      onPhaseChange(phase) {
        setPlaybackPart(phase === "speech" ? "voice" : "melody");
        syncPlaybackProgress();
      },
      onEnded() {
        endDemoPlayback("complete");
      },
      onError(message) {
        // Deliberately doesn't call endDemoPlayback(): a browser/environment
        // that can't construct real audio (including jsdom in tests) must
        // still leave the visible demo --- phase status, spectrum bars' gap
        // marking, and the hold-to-compare status text --- usable, per
        // CLAUDE.md's "the educational result must hold without sound". Only
        // the never-going-to-arrive analyser loop is stood down; the playback
        // timeline/progress still run from demo.ts's fallback timing.
        showDemoError(message);
        stopEnergyLoop();
      },
    });
  });

  // Momentary hold-to-compare, never a click-toggle: every pointer path that
  // can end a press (up/cancel/leave/blur/losing page visibility) restores
  // dry audio, and Space/Enter provide the required keyboard-operable
  // equivalent to a pointer hold (CLAUDE.md: "holding a pointer must not be
  // the only way to trigger it").
  if (gapCompareButton) {
    const compareButton = gapCompareButton;

    function engageWet(): void {
      if (compareButton.disabled) return;
      setDemoWet(true);
      setDemoRouteStatus(true);
    }

    function releaseWet(): void {
      setDemoWet(false);
      setDemoRouteStatus(false);
    }

    compareButton.addEventListener("pointerdown", (event) => {
      if (typeof event.button === "number" && event.button !== 0) return;
      event.preventDefault();
      engageWet();
    });
    compareButton.addEventListener("pointerup", releaseWet);
    compareButton.addEventListener("pointercancel", releaseWet);
    compareButton.addEventListener("pointerleave", releaseWet);
    compareButton.addEventListener("lostpointercapture", releaseWet);
    compareButton.addEventListener("blur", releaseWet);

    // event.repeat guards against the browser's own key-repeat re-firing
    // keydown while Space/Enter stays held --- without it, a long hold would
    // call engageWet() repeatedly instead of once.
    compareButton.addEventListener("keydown", (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (event.repeat) return;
      engageWet();
    });
    compareButton.addEventListener("keyup", (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      releaseWet();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") releaseWet();
    });
  }

  // Deferred to here (not immediately after its own definition): it calls
  // updateModeInstruction(), which reads `hasUnfolded` --- a `let` not
  // initialized until further up this same function --- so calling any
  // earlier would throw before that declaration runs.
  updateStageVisibility();
  render();
}

init();
