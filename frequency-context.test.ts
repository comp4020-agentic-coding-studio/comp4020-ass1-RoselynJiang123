import { describe, expect, it } from "vitest";
import { MAX_FREQUENCY_HZ, MIN_FREQUENCY_HZ } from "./cochlea";
import { frequencyContext, frequencyToPercentFromBase } from "./frequency-context";

const ALL_BOUNDARIES = [125, 199, 200, 349, 350, 999, 1000, 1999, 2000, 3999, 4000, 8000];

describe("frequencyContext", () => {
  it("returns the low-speaking-voice anchor from 125 Hz up to just below 200 Hz", () => {
    expect(frequencyContext(125)).toBe("Around the pitch of a low speaking voice");
    expect(frequencyContext(199)).toBe("Around the pitch of a low speaking voice");
  });

  it("returns the middle-C anchor starting exactly at 200 Hz, up to just below 350 Hz", () => {
    expect(frequencyContext(200)).toBe("Around middle C on a piano");
    expect(frequencyContext(349)).toBe("Around middle C on a piano");
  });

  it("returns the vowels-and-voices anchor starting exactly at 350 Hz, up to just below 1000 Hz", () => {
    expect(frequencyContext(350)).toBe("Much of the body of vowels and voices");
    expect(frequencyContext(999)).toBe("Much of the body of vowels and voices");
  });

  it("returns the speech-information anchor starting exactly at 1000 Hz, up to just below 2000 Hz", () => {
    expect(frequencyContext(1000)).toBe("An important region for speech information");
    expect(frequencyContext(1999)).toBe("An important region for speech information");
  });

  it("returns the consonant-clarity anchor starting exactly at 2000 Hz, up to just below 4000 Hz", () => {
    expect(frequencyContext(2000)).toBe("Many consonant clarity cues");
    expect(frequencyContext(3999)).toBe("Many consonant clarity cues");
  });

  it("returns the sibilants-and-brightness anchor from exactly 4000 Hz through the top of the range", () => {
    expect(frequencyContext(4000)).toBe("Sibilants such as /s/ and /ʃ/, and musical brightness");
    expect(frequencyContext(MAX_FREQUENCY_HZ)).toBe("Sibilants such as /s/ and /ʃ/, and musical brightness");
  });

  it("never returns the old low-hums-and-bass-energy phrasing", () => {
    for (const hz of ALL_BOUNDARIES) {
      expect(frequencyContext(hz)).not.toMatch(/low hums|bass energy/i);
    }
  });

  it("is always non-empty across the full frequency range", () => {
    for (const hz of ALL_BOUNDARIES) {
      expect(frequencyContext(hz).length).toBeGreaterThan(0);
    }
  });

  it("rejects a frequency outside the project's 125-8000 Hz range", () => {
    expect(() => frequencyContext(MIN_FREQUENCY_HZ - 1)).toThrow(RangeError);
    expect(() => frequencyContext(MAX_FREQUENCY_HZ + 1)).toThrow(RangeError);
  });

  it("rejects non-finite input", () => {
    expect(() => frequencyContext(NaN)).toThrow(RangeError);
    expect(() => frequencyContext(Infinity)).toThrow(RangeError);
  });
});

describe("frequencyToPercentFromBase", () => {
  it("shows a smaller percent from the base for a higher frequency than a lower one", () => {
    const high = frequencyToPercentFromBase(8000);
    const mid = frequencyToPercentFromBase(1000);
    const low = frequencyToPercentFromBase(250);
    expect(high).toBeLessThan(mid);
    expect(mid).toBeLessThan(low);
  });

  it("stays within the 0-100 display range at both ends of the frequency range", () => {
    for (const hz of [MIN_FREQUENCY_HZ, MAX_FREQUENCY_HZ]) {
      const percent = frequencyToPercentFromBase(hz);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });

  it("returns a whole-number percent", () => {
    expect(Number.isInteger(frequencyToPercentFromBase(2713))).toBe(true);
  });

  it("rejects a frequency outside the project's 125-8000 Hz range", () => {
    expect(() => frequencyToPercentFromBase(MIN_FREQUENCY_HZ - 1)).toThrow(RangeError);
    expect(() => frequencyToPercentFromBase(MAX_FREQUENCY_HZ + 1)).toThrow(RangeError);
  });
});
