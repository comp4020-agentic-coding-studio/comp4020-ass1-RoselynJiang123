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

import { frequencyToDisplayPosition, sliderPositionToFrequency } from "./cochlea";
import { isToneActive, startTone, stopTone, updateToneFrequency } from "./audio";

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

interface OuterHairCellCluster {
  index: number;
  displayPosition: number;
  element: SVGGElement;
}

interface ReferenceMark {
  x: number;
  label: SVGTextElement | null;
}

function formatFrequency(frequencyHz: number): string {
  return `${Math.round(frequencyHz).toLocaleString("en-US")} Hz`;
}

function frequencyToMapX(frequencyHz: number): number {
  const displayPosition = frequencyToDisplayPosition(frequencyHz);
  return MAP_LEFT_X + displayPosition * (MAP_RIGHT_X - MAP_LEFT_X);
}

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

function init(): void {
  const control = document.querySelector<HTMLInputElement>('[data-testid="frequency-control"]');
  const readout = document.querySelector<HTMLOutputElement>('[data-testid="frequency-readout"]');
  const diagram = document.querySelector<SVGSVGElement>('[data-testid="cochlear-diagram"]');
  const peak = document.querySelector<SVGCircleElement>('[data-testid="travelling-wave-peak"]');
  const envelope = document.querySelector<SVGPathElement>(".wave-envelope");
  const instruction = document.querySelector<HTMLElement>('[data-testid="diagram-instruction"]');
  const toneToggle = document.querySelector<HTMLButtonElement>('[data-testid="tone-toggle"]');
  const peakCallout = document.querySelector<SVGGElement>('[data-testid="peak-callout"]');

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

  function currentFrequency(): number {
    return sliderPositionToFrequency(controlEl.valueAsNumber);
  }

  function render(): void {
    const frequencyHz = currentFrequency();
    const displayPosition = frequencyToDisplayPosition(frequencyHz);
    const centerX = frequencyToMapX(frequencyHz);
    readoutEl.textContent = formatFrequency(frequencyHz);
    peakEl.setAttribute("cx", String(centerX));
    envelopeEl.setAttribute("d", buildEnvelopePath(centerX));
    peakCalloutLeader?.setAttribute("x1", String(centerX));
    peakCalloutLeader?.setAttribute("x2", String(centerX));
    peakCalloutLabel?.setAttribute("x", String(centerX));
    updateActiveOuterHairCells(outerHairCellClusters, displayPosition);
    updateReferenceMarkCollisions(referenceMarks, centerX);
    if (isToneActive()) {
      updateToneFrequency(frequencyHz);
    }
  }

  let hasUnfolded = false;
  function revealUnfoldedMap(): void {
    if (hasUnfolded) return;
    hasUnfolded = true;
    diagramEl.classList.add("is-unfolded");
    if (instruction) {
      instruction.textContent =
        "The cochlea is shown uncoiled so its frequency map can be read left to right.";
    }
  }

  controlEl.addEventListener("input", () => {
    revealUnfoldedMap();
    render();
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

  window.addEventListener("pagehide", stopTone);

  render();
}

init();
