// @vitest-environment jsdom
//
// Black-box spec for Assignment 1's core "Find the sound" interaction (see
// CLAUDE.md's "Intended interaction" and "One visual coordinate system"). This
// loads the real page markup and executes the real entry point, the same way a
// visitor's browser would --- it never imports cochlea.ts's own display-position
// function to assert against, so the assertions can't become circular with the
// implementation they're checking.
//
// Contract this spec fixes for the implementation:
// - the visible page title is an <h1>, not just the <title> element (already
//   covered generically by spec/invariants.test.ts)
// - the frequency control is reachable via [data-testid="frequency-control"],
//   is a range input whose value is the normalised 0..1 logarithmic slider
//   position from cochlea.ts (not raw Hz), and carries an accessible name
//   containing "Frequency"
// - a live readout is reachable via [data-testid="frequency-readout"] and
//   shows the current frequency in Hz as visible text
// - the schematic travelling-wave peak is reachable via
//   [data-testid="travelling-wave-peak"] inside real SVG markup, and exposes
//   its horizontal position via one of cx, x or a translate() transform

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FREQUENCY_HZ, MIN_FREQUENCY_HZ, frequencyToSliderPosition } from "../cochlea";

const SOURCE_HTML = readFileSync(resolve("index.html"), "utf8");

function loadPage(): void {
  const parsed = new DOMParser().parseFromString(SOURCE_HTML, "text/html");
  document.title = parsed.title;
  document.body.innerHTML = parsed.body.innerHTML;
}

function accessibleName(element: Element): string {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const id = element.getAttribute("id");
  if (id) {
    const forLabel = document.querySelector(`label[for="${id}"]`);
    if (forLabel?.textContent) return forLabel.textContent;
  }

  const wrappingLabel = element.closest("label");
  if (wrappingLabel?.textContent) return wrappingLabel.textContent;

  return "";
}

function horizontalPosition(element: Element): number {
  const cx = element.getAttribute("cx");
  if (cx !== null) return Number(cx);

  const x = element.getAttribute("x");
  if (x !== null) return Number(x);

  const transform = element.getAttribute("transform") ?? "";
  const match = transform.match(/translate\(\s*(-?[\d.]+)/);
  if (match) return Number(match[1]);

  throw new Error(
    '[data-testid="travelling-wave-peak"] has no cx, x or translate() to read a horizontal position from',
  );
}

function setFrequency(hz: number): void {
  const control = document.querySelector<HTMLInputElement>('[data-testid="frequency-control"]');
  expect(control, 'expected a [data-testid="frequency-control"] element').not.toBeNull();
  control!.value = String(frequencyToSliderPosition(hz));
  control!.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Assignment 1: Hearing Is a Map, Not a Volume Knob", () => {
  beforeEach(() => {
    loadPage();
  });

  it('presents the title "Hearing Is a Map, Not a Volume Knob"', () => {
    const heading = document.querySelector("h1");
    expect(heading?.textContent?.trim()).toBe("Hearing Is a Map, Not a Volume Knob");
  });

  it("has an accessible frequency control", () => {
    const control = document.querySelector('[data-testid="frequency-control"]');
    expect(control).not.toBeNull();
    expect(accessibleName(control!)).toMatch(/Frequency/);
  });

  it("moving the frequency control updates the visible readout and the travelling-wave peak, base-left/apex-right", async () => {
    vi.resetModules();
    await import("../main");

    const readoutText = () =>
      document.querySelector('[data-testid="frequency-readout"]')?.textContent ?? "";
    const peakPosition = () => {
      const peak = document.querySelector('[data-testid="travelling-wave-peak"]');
      expect(peak, 'expected a [data-testid="travelling-wave-peak"] element').not.toBeNull();
      return horizontalPosition(peak!);
    };

    setFrequency(250);
    expect(readoutText().replace(/[^\d]/g, "")).toBe("250");
    const peakXAt250 = peakPosition();

    setFrequency(1000);
    expect(readoutText().replace(/[^\d]/g, "")).toBe("1000");
    const peakXAt1000 = peakPosition();

    setFrequency(8000);
    expect(readoutText().replace(/[^\d]/g, "")).toBe("8000");
    const peakXAt8000 = peakPosition();

    expect(peakXAt8000).toBeLessThan(peakXAt1000);
    expect(peakXAt1000).toBeLessThan(peakXAt250);
  });

  it("reveals the unfolded cochlear map after the first frequency-control interaction", async () => {
    vi.resetModules();
    await import("../main");

    const diagram = document.querySelector('[data-testid="cochlear-diagram"]');
    expect(diagram, 'expected a [data-testid="cochlear-diagram"] element').not.toBeNull();
    expect(diagram!.classList.contains("is-unfolded")).toBe(false);

    setFrequency(1000);

    expect(diagram!.classList.contains("is-unfolded")).toBe(true);
  });

  it("changing frequency moves the active outer-hair-cell cluster in the same left/right direction as the travelling-wave peak", async () => {
    vi.resetModules();
    await import("../main");

    const peakPosition = () => {
      const peak = document.querySelector('[data-testid="travelling-wave-peak"]');
      expect(peak, 'expected a [data-testid="travelling-wave-peak"] element').not.toBeNull();
      return horizontalPosition(peak!);
    };

    const activeClusterIndices = (): number[] => {
      const layer = document.querySelector('[data-testid="outer-hair-cells"]');
      expect(layer, 'expected a [data-testid="outer-hair-cells"] element').not.toBeNull();
      return Array.from(layer!.querySelectorAll('.ohc-cluster[data-active="true"]')).map((cluster) =>
        Number(cluster.getAttribute("data-cluster-index")),
      );
    };

    setFrequency(MIN_FREQUENCY_HZ);
    const peakAtLowFrequency = peakPosition();
    const activeAtLowFrequency = activeClusterIndices();

    setFrequency(MAX_FREQUENCY_HZ);
    const peakAtHighFrequency = peakPosition();
    const activeAtHighFrequency = activeClusterIndices();

    expect(activeAtLowFrequency.length).toBeGreaterThan(0);
    expect(activeAtHighFrequency.length).toBeGreaterThan(0);

    // base-left/apex-right orientation: the peak moves left as frequency rises
    expect(peakAtHighFrequency).toBeLessThan(peakAtLowFrequency);

    // the active cluster set must shift in that same direction --- lower
    // cluster indices sit toward the base/left, so the high-frequency active
    // set has to sit entirely to the left of the low-frequency active set
    expect(Math.max(...activeAtHighFrequency)).toBeLessThan(Math.min(...activeAtLowFrequency));
  });

  it("builds a three-row, ordered outer-hair-cell layer inside the map", async () => {
    vi.resetModules();
    await import("../main");

    const layer = document.querySelector('[data-testid="outer-hair-cells"]');
    expect(layer, 'expected a [data-testid="outer-hair-cells"] element').not.toBeNull();

    const rows = new Set(
      Array.from(layer!.querySelectorAll("[data-row]")).map((cell) => cell.getAttribute("data-row")),
    );
    expect(rows).toEqual(new Set(["0", "1", "2"]));

    const clusters = Array.from(layer!.querySelectorAll("[data-cluster-index]"));
    expect(clusters.length).toBeGreaterThan(1);

    const indices = clusters.map((cluster) => Number(cluster.getAttribute("data-cluster-index")));
    const sortedIndices = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sortedIndices);
    expect(new Set(indices).size).toBe(indices.length);

    const positions = clusters.map((cluster) => Number(cluster.getAttribute("data-display-position")));
    expect(positions[0]).toBeCloseTo(0, 5);
    expect(positions[positions.length - 1]).toBeCloseTo(1, 5);
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });
});
