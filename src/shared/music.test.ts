import { describe, expect, it } from "vitest";
import {
  centsBetween,
  centsFromTarget,
  frequencyToMidi,
  midiToFrequency,
  midiToNoteName,
} from "./music";

describe("midiToFrequency", () => {
  it("anchors A4 at 440 Hz", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
  });

  it("computes middle C", () => {
    expect(midiToFrequency(60)).toBeCloseTo(261.625565, 5);
  });

  it("respects a custom concert pitch", () => {
    expect(midiToFrequency(69, 432)).toBeCloseTo(432, 6);
  });
});

describe("frequencyToMidi", () => {
  it("is the inverse of midiToFrequency", () => {
    for (const midi of [21, 40, 60, 69, 84, 108]) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 6);
    }
  });
});

describe("midiToNoteName", () => {
  it.each([
    [21, "A0"],
    [60, "C4"],
    [61, "C#4"],
    [69, "A4"],
    [108, "C8"],
  ])("formats %i as %s", (midi, expected) => {
    expect(midiToNoteName(midi)).toBe(expected);
  });

  it("handles notes below C-1", () => {
    expect(midiToNoteName(0)).toBe("C-1");
  });
});

describe("centsFromTarget", () => {
  it("returns zero for the exact pitch", () => {
    expect(centsFromTarget(440, 69)).toBeCloseTo(0, 6);
  });

  it("measures one semitone as 100 cents", () => {
    expect(centsFromTarget(midiToFrequency(70), 69)).toBeCloseTo(100, 6);
  });

  it("returns negative cents for a flat note", () => {
    expect(centsFromTarget(midiToFrequency(68), 69)).toBeCloseTo(-100, 6);
  });
});

describe("centsBetween", () => {
  it("measures an octave as 1200 cents", () => {
    expect(centsBetween(880, 440)).toBeCloseTo(1200, 6);
  });
});
