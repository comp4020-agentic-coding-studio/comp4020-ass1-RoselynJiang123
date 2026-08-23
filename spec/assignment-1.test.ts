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
import { isToneActive } from "../audio";

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

// jsdom's PointerEvent has no setPointerCapture, so Stage 2's pointer-drag
// selection isn't exercisable here --- this spec drives the same shared gap
// state through its keyboard-accessible equivalent instead (CLAUDE.md: "The
// pointer gesture and numeric inputs must update one shared gap state").
function setGapFrequencies(lowerHz: number, upperHz: number): void {
  const lowerInput = document.querySelector<HTMLInputElement>('[data-testid="gap-lower-frequency"]');
  const upperInput = document.querySelector<HTMLInputElement>('[data-testid="gap-upper-frequency"]');
  expect(lowerInput, 'expected a [data-testid="gap-lower-frequency"] element').not.toBeNull();
  expect(upperInput, 'expected a [data-testid="gap-upper-frequency"] element').not.toBeNull();
  lowerInput!.value = String(lowerHz);
  lowerInput!.dispatchEvent(new Event("input", { bubbles: true }));
  upperInput!.value = String(upperHz);
  upperInput!.dispatchEvent(new Event("input", { bubbles: true }));
}

// Stage 1-3 only become available in the "find" experience state (CLAUDE.md:
// "Guided orientation"). Existing specs that exercise Stage 1-3 controls
// immediately after loading the page now go through the guided orientation's
// keyboard/screen-reader escape hatch first, same as a returning visitor
// would.
function clickButton(testId: string): void {
  const button = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  expect(button, `expected a [data-testid="${testId}"] element`).not.toBeNull();
  button!.click();
}

function enterFind(): void {
  clickButton("skip-to-map");
}

describe("Assignment 1: Hearing Is a Map, Not a Volume Knob", () => {
  beforeEach(() => {
    loadPage();
  });

  it('presents the title "Hearing Is a Map, Not a Volume Knob"', () => {
    const heading = document.querySelector("h1");
    expect(heading?.textContent?.trim()).toBe("Hearing Is a Map, Not a Volume Knob");
  });

  describe("Guided orientation", () => {
    it('starts fresh with data-experience-state="orientation"', async () => {
      vi.resetModules();
      await import("../main");

      const root = document.querySelector("main");
      expect(root?.getAttribute("data-experience-state")).toBe("orientation");
    });

    it("hides the Stage 1-3 explorer panel while in orientation", async () => {
      vi.resetModules();
      await import("../main");

      const explorerPanel = document.querySelector<HTMLElement>('[data-testid="explorer-panel"]');
      expect(explorerPanel, 'expected a [data-testid="explorer-panel"] element').not.toBeNull();
      expect(explorerPanel!.hidden).toBe(true);

      const control = document.querySelector<HTMLInputElement>('[data-testid="frequency-control"]');
      expect(control, 'expected a [data-testid="frequency-control"] element').not.toBeNull();
      expect(control!.closest("[hidden]")).not.toBeNull();
    });

    it('has a real "Explore the cochlea" button', async () => {
      vi.resetModules();
      await import("../main");

      const button = document.querySelector<HTMLButtonElement>('[data-testid="explore-cochlea"]');
      expect(button, 'expected a [data-testid="explore-cochlea"] element').not.toBeNull();
      expect(button!.tagName.toLowerCase()).toBe("button");
      expect(accessibleName(button!)).toBe("Explore the cochlea");
    });

    it('the "Explore the cochlea" hotspot has an accessible name distinct from its visible label', async () => {
      vi.resetModules();
      await import("../main");

      const button = document.querySelector<HTMLButtonElement>('[data-testid="explore-cochlea"]');
      expect(button, 'expected a [data-testid="explore-cochlea"] element').not.toBeNull();
      expect(accessibleName(button!)).toBe("Explore the cochlea");

      const label = button!.querySelector<HTMLElement>('[data-testid="cochlea-hotspot-label"]');
      expect(label, "expected a dedicated visible-label element inside the hotspot").not.toBeNull();
      expect(label!.textContent?.trim()).toBe("Explore cochlea");
    });

    it('activating "Explore the cochlea" enters cochlea-focus', async () => {
      vi.resetModules();
      await import("../main");

      clickButton("explore-cochlea");

      const root = document.querySelector("main");
      expect(root?.getAttribute("data-experience-state")).toBe("cochlea-focus");
    });

    it('cochlea-focus has a real "Unfold the cochlea" button', async () => {
      vi.resetModules();
      await import("../main");

      clickButton("explore-cochlea");

      const button = document.querySelector<HTMLButtonElement>('[data-testid="unfold-cochlea"]');
      expect(button, 'expected a [data-testid="unfold-cochlea"] element').not.toBeNull();
      expect(button!.tagName.toLowerCase()).toBe("button");
      expect(button!.textContent?.trim()).toBe("Unfold the cochlea");
    });

    it('activating "Unfold the cochlea" enters find', async () => {
      vi.resetModules();
      await import("../main");

      clickButton("explore-cochlea");
      clickButton("unfold-cochlea");

      const root = document.querySelector("main");
      expect(root?.getAttribute("data-experience-state")).toBe("find");

      const explorerPanel = document.querySelector<HTMLElement>('[data-testid="explorer-panel"]');
      expect(explorerPanel!.hidden).toBe(false);
    });

    it('orientation\'s "Skip to the interactive map" enters find directly', async () => {
      vi.resetModules();
      await import("../main");

      const skip = document.querySelector<HTMLButtonElement>('[data-testid="skip-to-map"]');
      expect(skip, 'expected a [data-testid="skip-to-map"] element').not.toBeNull();
      expect(skip!.textContent?.trim()).toBe("Skip to the interactive map");

      skip!.click();

      const root = document.querySelector("main");
      expect(root?.getAttribute("data-experience-state")).toBe("find");
    });

    it("orientation/cochlea-focus controls are real <button> elements with the correct accessible name", async () => {
      vi.resetModules();
      await import("../main");

      const explore = document.querySelector<HTMLButtonElement>('[data-testid="explore-cochlea"]');
      expect(explore, 'expected a [data-testid="explore-cochlea"] element').not.toBeNull();
      expect(explore!.tagName.toLowerCase()).toBe("button");
      expect(accessibleName(explore!)).toBe("Explore the cochlea");

      const skip = document.querySelector<HTMLButtonElement>('[data-testid="skip-to-map"]');
      expect(skip, 'expected a [data-testid="skip-to-map"] element').not.toBeNull();
      expect(skip!.tagName.toLowerCase()).toBe("button");
      expect(skip!.textContent?.trim()).toBe("Skip to the interactive map");

      clickButton("explore-cochlea");
      const unfold = document.querySelector<HTMLButtonElement>('[data-testid="unfold-cochlea"]');
      expect(unfold, 'expected a [data-testid="unfold-cochlea"] element').not.toBeNull();
      expect(unfold!.tagName.toLowerCase()).toBe("button");
      expect(unfold!.textContent?.trim()).toBe("Unfold the cochlea");
    });

    // jsdom does not simulate a native <button>'s default Enter/Space-to-click
    // activation, so a synthetic keydown here cannot stand in for real
    // keyboard activation --- that is verified manually in-browser instead
    // (Tab/Enter/Space), per CLAUDE.md's keyboard-equivalence rule. What this
    // locks down is the regression it replaces: application code must not
    // attach its own keydown handler that performs the transition a second
    // time. One physical activation must produce exactly one logical
    // transition, via the native click path only.
    it("does not run a transition from a keydown event --- native click is the only activation path", async () => {
      vi.resetModules();
      await import("../main");

      const explore = document.querySelector<HTMLButtonElement>('[data-testid="explore-cochlea"]');
      expect(explore, 'expected a [data-testid="explore-cochlea"] element').not.toBeNull();
      explore!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      explore!.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
      );

      expect(document.querySelector("main")?.getAttribute("data-experience-state")).toBe(
        "orientation",
      );
    });

    it("does not advance state on resize or animation-completion events", async () => {
      vi.resetModules();
      await import("../main");

      window.dispatchEvent(new Event("resize"));
      document
        .querySelector('[data-testid="cochlea-focus-panel"]')
        ?.dispatchEvent(new Event("animationend", { bubbles: true }));
      document
        .querySelector('[data-testid="orientation-panel"]')
        ?.dispatchEvent(new Event("transitionend", { bubbles: true }));

      const root = document.querySelector("main");
      expect(root?.getAttribute("data-experience-state")).toBe("orientation");
    });

    it("entering find via skip does not start audio or change the current frequency", async () => {
      vi.resetModules();
      await import("../main");

      const control = document.querySelector<HTMLInputElement>('[data-testid="frequency-control"]');
      expect(control, 'expected a [data-testid="frequency-control"] element').not.toBeNull();
      const initialValue = control!.value;

      enterFind();

      expect(control!.value).toBe(initialValue);
      expect(isToneActive()).toBe(false);
    });

    // Step 3 (CLAUDE.md: "Guided orientation" -> first orientation screen):
    // ear cutaway -> WHO hook -> accessible cochlea hotspot.
    it('shows the main title and "Follow the sound into the cochlea" heading on a fresh load', () => {
      const heading = document.querySelector("h1");
      expect(heading?.textContent?.trim()).toBe("Hearing Is a Map, Not a Volume Knob");

      const orientationHeading = document.querySelector(".orientation-heading");
      expect(orientationHeading?.textContent?.trim()).toBe("Follow the sound into the cochlea");
    });

    it("states the exact WHO hook wording, linked to the WHO fact sheet", () => {
      expect(document.body.textContent).toMatch(
        /Over 1 billion young adults are at risk of permanent, avoidable hearing loss due to\s+unsafe listening practices\./,
      );

      const link = document.querySelector<HTMLAnchorElement>(".evidence-line a");
      expect(link, "expected a WHO fact sheet link inside .evidence-line").not.toBeNull();
      expect(link!.getAttribute("href")).toBe(
        "https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss",
      );
    });

    it("loads the ear cutaway from a local repository asset, not a remote URL", () => {
      const image = document.querySelector<HTMLImageElement>('[data-testid="orientation-ear-image"]');
      expect(image, 'expected a [data-testid="orientation-ear-image"] element').not.toBeNull();

      const src = image!.getAttribute("src") ?? "";
      expect(src).toMatch(/^\.?\/?assets\//);
      expect(src).not.toMatch(/^https?:\/\//);
    });

    it("describes the ear cutaway as schematic/generated and identifies the cochlea", () => {
      const image = document.querySelector<HTMLImageElement>('[data-testid="orientation-ear-image"]');
      expect(image, 'expected a [data-testid="orientation-ear-image"] element').not.toBeNull();

      const alt = image!.getAttribute("alt") ?? "";
      expect(alt.toLowerCase()).toMatch(/schematic|generated/);
      expect(alt.toLowerCase()).toContain("cochlea");
    });

    it('places the "Explore the cochlea" hotspot over the ear illustration', () => {
      const hero = document.querySelector('[data-testid="orientation-hero"]');
      expect(hero, 'expected a [data-testid="orientation-hero"] element').not.toBeNull();

      const hotspot = hero!.querySelector<HTMLButtonElement>('[data-testid="explore-cochlea"]');
      expect(hotspot, "expected the explore-cochlea hotspot inside the ear illustration").not.toBeNull();
      expect(hotspot!.tagName.toLowerCase()).toBe("button");
      expect(accessibleName(hotspot!)).toBe("Explore the cochlea");
    });

    it("does not advance state when the ear image finishes loading or animating", async () => {
      vi.resetModules();
      await import("../main");

      const image = document.querySelector('[data-testid="orientation-ear-image"]');
      image?.dispatchEvent(new Event("load", { bubbles: true }));
      image?.dispatchEvent(new Event("animationend", { bubbles: true }));

      const root = document.querySelector("main");
      expect(root?.getAttribute("data-experience-state")).toBe("orientation");
    });

    it("renders the orientation screen without starting audio or changing frequency from its declared default", async () => {
      vi.resetModules();
      await import("../main");

      const control = document.querySelector<HTMLInputElement>('[data-testid="frequency-control"]');
      expect(control, 'expected a [data-testid="frequency-control"] element').not.toBeNull();
      expect(control!.value).toBe(control!.getAttribute("value"));
      expect(isToneActive()).toBe(false);
    });
  });

  describe("Cochlea focus: inline SVG schematics", () => {
    function enterCochleaFocus(): void {
      clickButton("explore-cochlea");
    }

    it("does not expose the illustrations before cochlea-focus is entered", async () => {
      vi.resetModules();
      await import("../main");

      const panel = document.querySelector<HTMLElement>('[data-testid="cochlea-focus-panel"]');
      expect(panel, 'expected a [data-testid="cochlea-focus-panel"] element').not.toBeNull();
      expect(panel!.hidden).toBe(true);

      const art = panel!.querySelector('[data-testid="cochlea-focus-art"]');
      expect(art, 'expected a [data-testid="cochlea-focus-art"] element').not.toBeNull();
      expect(art!.closest("[hidden]")).toBe(panel);
    });

    it("contains exactly two inline SVG illustrations, never img/iframe/object", async () => {
      vi.resetModules();
      await import("../main");
      enterCochleaFocus();

      const art = document.querySelector('[data-testid="cochlea-focus-art"]');
      expect(art, 'expected a [data-testid="cochlea-focus-art"] element').not.toBeNull();

      const svgs = art!.querySelectorAll("svg");
      expect(svgs.length).toBe(2);

      expect(art!.querySelectorAll("img, iframe, object").length).toBe(0);
    });

    it("both illustrations have accessible titles and descriptions", async () => {
      vi.resetModules();
      await import("../main");
      enterCochleaFocus();

      const svgs = Array.from(document.querySelectorAll('[data-testid="cochlea-focus-art"] svg'));
      expect(svgs.length).toBe(2);

      for (const svg of svgs) {
        const labelledBy = svg.getAttribute("aria-labelledby") ?? "";
        const ids = labelledBy.split(/\s+/).filter(Boolean);
        expect(ids.length).toBeGreaterThanOrEqual(2);
        for (const id of ids) {
          const referenced = document.getElementById(id);
          expect(referenced, `expected an element with id="${id}"`).not.toBeNull();
          expect(referenced!.textContent?.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it("both illustrations carry a visible schematic/not-to-scale indication", async () => {
      vi.resetModules();
      await import("../main");
      enterCochleaFocus();

      const svgs = Array.from(document.querySelectorAll('[data-testid="cochlea-focus-art"] svg'));
      expect(svgs.length).toBe(2);

      for (const svg of svgs) {
        expect(svg.textContent).toMatch(/SCHEMATIC/i);
        expect(svg.textContent).toMatch(/NOT TO SCALE/i);
      }
    });

    it("every rendered DOM id is unique", async () => {
      vi.resetModules();
      await import("../main");
      enterCochleaFocus();

      const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("the coiled map retains its data-frequency nodes", async () => {
      vi.resetModules();
      await import("../main");
      enterCochleaFocus();

      const nodes = Array.from(
        document.querySelectorAll('[data-testid="coiled-map-illustration"] [data-frequency]'),
      );
      const values = nodes.map((node) => node.getAttribute("data-frequency"));
      expect(values.sort((a, b) => Number(b) - Number(a))).toEqual([
        "8000",
        "3000",
        "1000",
        "500",
        "262",
        "160",
      ]);
    });

    it("labels the base as higher-frequency and the apex as lower-frequency", async () => {
      vi.resetModules();
      await import("../main");
      enterCochleaFocus();

      const coiled = document.querySelector('[data-testid="coiled-map-illustration"] svg');
      expect(coiled, "expected the coiled map svg").not.toBeNull();

      const baseGroup = coiled!.querySelector('[id$="base-label"]');
      const apexGroup = coiled!.querySelector('[id$="apex-label"]');
      expect(baseGroup, "expected a base-label group").not.toBeNull();
      expect(apexGroup, "expected an apex-label group").not.toBeNull();
      expect(baseGroup!.textContent).toMatch(/higher frequencies/i);
      expect(apexGroup!.textContent).toMatch(/lower frequencies/i);
    });

    it('keeps the exact "low speaking voice" contextual label', async () => {
      vi.resetModules();
      await import("../main");
      enterCochleaFocus();

      const coiled = document.querySelector('[data-testid="coiled-map-illustration"] svg');
      expect(coiled, "expected the coiled map svg").not.toBeNull();
      expect(coiled!.textContent).toContain("Around the pitch of a low");
      expect(coiled!.textContent).toContain("speaking voice");
    });

    it("represents three outer-hair-cell rows", async () => {
      vi.resetModules();
      await import("../main");
      enterCochleaFocus();

      const ohc = document.querySelector('[data-testid="ohc-illustration"] svg');
      expect(ohc, "expected the outer-hair-cell svg").not.toBeNull();

      const rows = ohc!.querySelectorAll('[id$="row-1"], [id$="row-2"], [id$="row-3"]');
      expect(rows.length).toBe(3);
    });

    it("cites Greenwood (1990) and Ashmore (2019) with meaningful link text", async () => {
      vi.resetModules();
      await import("../main");
      enterCochleaFocus();

      const panel = document.querySelector<HTMLElement>('[data-testid="cochlea-focus-panel"]');
      expect(panel, 'expected a [data-testid="cochlea-focus-panel"] element').not.toBeNull();

      const greenwood = panel!.querySelector<HTMLAnchorElement>(
        'a[href="https://doi.org/10.1121/1.399052"]',
      );
      const ashmore = panel!.querySelector<HTMLAnchorElement>(
        'a[href="https://doi.org/10.1101/cshperspect.a033522"]',
      );
      expect(greenwood, "expected a Greenwood (1990) citation link").not.toBeNull();
      expect(ashmore, "expected an Ashmore (2019) citation link").not.toBeNull();
      expect(greenwood!.textContent?.trim().length).toBeGreaterThan(0);
      expect(ashmore!.textContent?.trim().length).toBeGreaterThan(0);
    });

    it('"Unfold the cochlea" still enters find and preserves frequency without starting audio', async () => {
      vi.resetModules();
      await import("../main");

      const control = document.querySelector<HTMLInputElement>('[data-testid="frequency-control"]');
      expect(control, 'expected a [data-testid="frequency-control"] element').not.toBeNull();
      const initialValue = control!.value;

      enterCochleaFocus();
      clickButton("unfold-cochlea");

      const root = document.querySelector("main");
      expect(root?.getAttribute("data-experience-state")).toBe("find");
      expect(control!.value).toBe(initialValue);
      expect(isToneActive()).toBe(false);
    });

    it("introduces no remote runtime visual asset for either illustration", async () => {
      vi.resetModules();
      await import("../main");
      enterCochleaFocus();

      const art = document.querySelector('[data-testid="cochlea-focus-art"]');
      expect(art, 'expected a [data-testid="cochlea-focus-art"] element').not.toBeNull();

      const hrefs = Array.from(art!.querySelectorAll("use")).map(
        (use) => use.getAttribute("href") ?? use.getAttribute("xlink:href") ?? "",
      );
      for (const href of hrefs) {
        expect(href.startsWith("#")).toBe(true);
      }
    });
  });

  it("has an accessible frequency control", () => {
    const control = document.querySelector('[data-testid="frequency-control"]');
    expect(control).not.toBeNull();
    expect(accessibleName(control!)).toMatch(/Frequency/);
  });

  it("moving the frequency control updates the visible readout and the travelling-wave peak, base-left/apex-right", async () => {
    vi.resetModules();
    await import("../main");
    enterFind();

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
    enterFind();

    const diagram = document.querySelector('[data-testid="cochlear-diagram"]');
    expect(diagram, 'expected a [data-testid="cochlear-diagram"] element').not.toBeNull();
    expect(diagram!.classList.contains("is-unfolded")).toBe(false);

    setFrequency(1000);

    expect(diagram!.classList.contains("is-unfolded")).toBe(true);
  });

  it("changing frequency moves the active outer-hair-cell cluster in the same left/right direction as the travelling-wave peak", async () => {
    vi.resetModules();
    await import("../main");
    enterFind();

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
    enterFind();

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

  describe("Stage 2: Make a gap", () => {
    it("setting or reversing gap boundaries produces one ordered visible selection", async () => {
      vi.resetModules();
      await import("../main");
      enterFind();
      setFrequency(1000);

      const selection = document.querySelector('[data-testid="gap-selection"]');
      expect(selection, 'expected a [data-testid="gap-selection"] element').not.toBeNull();

      setGapFrequencies(2000, 4000);
      const widthForward = Number(selection!.getAttribute("width"));
      expect(widthForward).toBeGreaterThan(0);

      setGapFrequencies(4000, 2000);
      const widthReversed = Number(selection!.getAttribute("width"));
      expect(widthReversed).toBeCloseTo(widthForward, 5);

      const readout = document.querySelector('[data-testid="gap-readout"]');
      expect(readout, 'expected a [data-testid="gap-readout"] element').not.toBeNull();
      const readoutText = readout!.textContent ?? "";
      expect(readoutText.indexOf("2.0")).toBeGreaterThanOrEqual(0);
      expect(readoutText.indexOf("4.0")).toBeGreaterThan(readoutText.indexOf("2.0"));
    });

    it("only outer-hair-cell clusters within the gap interval receive data-in-gap", async () => {
      vi.resetModules();
      await import("../main");
      enterFind();
      setFrequency(1000);
      setGapFrequencies(MIN_FREQUENCY_HZ, 500);

      const layer = document.querySelector('[data-testid="outer-hair-cells"]');
      expect(layer, 'expected a [data-testid="outer-hair-cells"] element').not.toBeNull();
      const clusters = Array.from(layer!.querySelectorAll(".ohc-cluster"));

      const inGap = clusters.filter((cluster) => cluster.getAttribute("data-in-gap") === "true");
      const outsideGap = clusters.filter((cluster) => cluster.getAttribute("data-in-gap") !== "true");

      expect(inGap.length).toBeGreaterThan(0);
      expect(outsideGap.length).toBeGreaterThan(0);
    });

    it("moving the frequency into the gap visibly reduces the wave peak and envelope glow", async () => {
      vi.resetModules();
      await import("../main");
      enterFind();

      setGapFrequencies(3000, 5000);

      setFrequency(4000);
      const peak = document.querySelector('[data-testid="travelling-wave-peak"]');
      const envelope = document.querySelector(".wave-envelope");
      expect(peak, 'expected a [data-testid="travelling-wave-peak"] element').not.toBeNull();
      expect(envelope, "expected a .wave-envelope element").not.toBeNull();
      expect(peak!.getAttribute("data-attenuated")).toBe("true");
      expect(envelope!.getAttribute("data-attenuated")).toBe("true");

      setFrequency(1000);
      expect(peak!.getAttribute("data-attenuated")).not.toBe("true");
      expect(envelope!.getAttribute("data-attenuated")).not.toBe("true");
    });

    it("clearing the gap removes the selection and all in-gap cell states", async () => {
      vi.resetModules();
      await import("../main");
      enterFind();
      setFrequency(1000);
      setGapFrequencies(2000, 4000);

      const clearButton = document.querySelector<HTMLButtonElement>('[data-testid="clear-gap"]');
      expect(clearButton, 'expected a [data-testid="clear-gap"] element').not.toBeNull();
      clearButton!.click();

      const selection = document.querySelector('[data-testid="gap-selection"]');
      expect(Number(selection?.getAttribute("width"))).toBe(0);

      const layer = document.querySelector('[data-testid="outer-hair-cells"]');
      expect(layer, 'expected a [data-testid="outer-hair-cells"] element').not.toBeNull();
      expect(layer!.querySelectorAll('[data-in-gap="true"]').length).toBe(0);

      const readout = document.querySelector('[data-testid="gap-readout"]');
      expect(readout?.textContent).toMatch(/no gap/i);
    });
  });

  describe("Stage 3: Hear what the gap removes", () => {
    function dispatchType(element: Element, type: string): void {
      element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    }

    function dispatchKey(element: Element, type: string, key: string): void {
      element.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
    }

    it("renders exactly 24 spectrum bars inside the map, in Greenwood order", async () => {
      vi.resetModules();
      await import("../main");
      enterFind();

      const container = document.querySelector('[data-testid="spectrum-bars"]');
      expect(container, 'expected a [data-testid="spectrum-bars"] element').not.toBeNull();

      const bars = Array.from(container!.querySelectorAll<SVGRectElement>("[data-band-index]"));
      expect(bars.length).toBe(24);

      const readings = bars.map((bar) => ({
        hz: Number(bar.dataset.centerHz),
        x: Number(bar.getAttribute("x")),
      }));

      for (const reading of readings) {
        expect(Number.isFinite(reading.hz)).toBe(true);
        expect(Number.isFinite(reading.x)).toBe(true);
      }

      // High frequency bars sit to the left (smaller x); low frequency bars
      // sit to the right (larger x) --- same orientation as everything else
      // on this map.
      const byX = [...readings].sort((a, b) => a.x - b.x);
      for (let i = 1; i < byX.length; i += 1) {
        expect(byX[i].hz).toBeLessThan(byX[i - 1].hz);
      }
    });

    it("disables the compare control until a gap exists", async () => {
      vi.resetModules();
      await import("../main");
      enterFind();

      const compareButton = document.querySelector<HTMLButtonElement>('[data-testid="gap-compare"]');
      expect(compareButton, 'expected a [data-testid="gap-compare"] element').not.toBeNull();
      expect(compareButton!.disabled).toBe(true);

      const playButton = document.querySelector<HTMLButtonElement>('[data-testid="demo-play"]');
      expect(playButton, 'expected a [data-testid="demo-play"] element').not.toBeNull();
      playButton!.click();

      expect(compareButton!.disabled).toBe(true);
    });

    it("holding the compare control (pointer or keyboard) switches to 'Through the gap'; releasing restores 'Original'", async () => {
      vi.resetModules();
      await import("../main");
      enterFind();

      setGapFrequencies(2000, 4000);

      const playButton = document.querySelector<HTMLButtonElement>('[data-testid="demo-play"]');
      const compareButton = document.querySelector<HTMLButtonElement>('[data-testid="gap-compare"]');
      const routeStatus = document.querySelector('[data-testid="demo-route-status"]');
      expect(playButton, 'expected a [data-testid="demo-play"] element').not.toBeNull();
      expect(compareButton, 'expected a [data-testid="gap-compare"] element').not.toBeNull();
      expect(routeStatus, 'expected a [data-testid="demo-route-status"] element').not.toBeNull();

      playButton!.click();
      expect(compareButton!.disabled).toBe(false);
      expect(routeStatus!.textContent).toMatch(/Original/);

      dispatchType(compareButton!, "pointerdown");
      expect(routeStatus!.textContent).toMatch(/Through the gap/);
      expect(compareButton!.getAttribute("aria-pressed")).toBe("true");

      dispatchType(compareButton!, "pointerup");
      expect(routeStatus!.textContent).toMatch(/Original/);
      expect(compareButton!.getAttribute("aria-pressed")).toBe("false");

      dispatchKey(compareButton!, "keydown", "Enter");
      expect(routeStatus!.textContent).toMatch(/Through the gap/);

      dispatchKey(compareButton!, "keyup", "Enter");
      expect(routeStatus!.textContent).toMatch(/Original/);

      dispatchKey(compareButton!, "keydown", " ");
      expect(routeStatus!.textContent).toMatch(/Through the gap/);

      dispatchKey(compareButton!, "keyup", " ");
      expect(routeStatus!.textContent).toMatch(/Original/);
    });

    it("losing the hold (pointercancel, pointerleave or blur) restores 'Original'", async () => {
      vi.resetModules();
      await import("../main");
      enterFind();

      setGapFrequencies(2000, 4000);
      const playButton = document.querySelector<HTMLButtonElement>('[data-testid="demo-play"]');
      const compareButton = document.querySelector<HTMLButtonElement>('[data-testid="gap-compare"]');
      const routeStatus = document.querySelector('[data-testid="demo-route-status"]');
      playButton!.click();

      for (const releaseType of ["pointercancel", "pointerleave", "blur"]) {
        dispatchType(compareButton!, "pointerdown");
        expect(routeStatus!.textContent).toMatch(/Through the gap/);
        dispatchType(compareButton!, releaseType);
        expect(routeStatus!.textContent).toMatch(/Original/);
        expect(compareButton!.getAttribute("aria-pressed")).toBe("false");
      }
    });
  });

  describe("Final copy: medical limits, sources and conclusion", () => {
    it("labels each stage with its concise heading, in order", () => {
      const headings = Array.from(document.querySelectorAll("h2")).map((h) =>
        h.textContent?.trim(),
      );
      expect(headings).toEqual([
        "Follow the sound into the cochlea",
        "Find the sound",
        "Make a gap",
        "Hear what the gap removes",
        "Sources",
      ]);
    });

    it("states the required medical disclaimer", () => {
      expect(document.body.textContent).toMatch(
        /This page is not a hearing test or medical advice\. If you are concerned about your\s+hearing, see an audiologist\./,
      );
    });

    it("provides an accessible model-limits disclosure", () => {
      const details = document.querySelector(".model-limits");
      expect(details, "expected a .model-limits <details> element").not.toBeNull();
      expect(details!.tagName.toLowerCase()).toBe("details");
      const summary = details!.querySelector("summary");
      expect(summary?.textContent?.trim()).toBe("Model limits and safety");
    });

    it("closes with the required medically qualified conclusion", () => {
      const conclusions = Array.from(document.querySelectorAll(".conclusion")).map((el) =>
        el.textContent?.trim(),
      );
      expect(conclusions).toContain(
        "Sensorineural damage does not simply turn the world down. It can remove parts of it.",
      );
      expect(conclusions).toContain("Speaking louder may not restore the missing detail.");
    });

    it("cites the WHO evidence line directly", () => {
      const evidenceLink = document.querySelector<HTMLAnchorElement>(".evidence-line a");
      expect(evidenceLink, "expected an evidence-line link to the WHO source").not.toBeNull();
      expect(evidenceLink!.getAttribute("href")).toBe(
        "https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss",
      );
    });

    it("links every source as an HTTPS URL that names its destination", () => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".sources-list a"));
      expect(links.length).toBeGreaterThanOrEqual(5);
      for (const link of links) {
        expect(link.getAttribute("href")).toMatch(/^https:\/\//);
        expect(link.textContent?.trim().length).toBeGreaterThan(0);
      }
    });
  });
});
