import { describe, expect, it } from "vitest";
import {
  INITIAL_PITCH_DISPLAY,
  pitchLaneRange,
  pitchLaneYPercent,
  updatePitchDisplay,
} from "./pitchDisplay";

function update(
  state: typeof INITIAL_PITCH_DISPLAY,
  midi: number | null,
  targetMidi = 60,
  timeSec = 0,
  vocals = false,
) {
  return updatePitchDisplay(state, midi, targetMidi, vocals, timeSec);
}

function lockVocalShift(
  state: typeof INITIAL_PITCH_DISPLAY,
  midi: number,
  targetMidi = 60,
  start = 0,
) {
  let next = state;
  for (let index = 0; index < 4; index += 1) {
    next = update(next, midi, targetMidi, start + index * 0.016, true);
  }
  return next;
}

describe("pitch lane geometry", () => {
  it("uses a symmetric margin around the chart", () => {
    expect(pitchLaneRange([{ midi: 60 }, { midi: 69 }])).toEqual({
      minMidi: 55,
      maxMidi: 74,
    });
  });

  it("maps pitch linearly and lets out-of-range pitches leave the lane", () => {
    const range = { minMidi: 55, maxMidi: 74 };
    expect(pitchLaneYPercent(74, range)).toBe(0);
    expect(pitchLaneYPercent(55, range)).toBe(100);
    expect(pitchLaneYPercent(80, range)).toBeLessThan(0);
    expect(pitchLaneYPercent(50, range)).toBeGreaterThan(100);
  });
});

describe("pitch display filter", () => {
  it("uses a median so a single bad frame does not move the ball", () => {
    let state = update(INITIAL_PITCH_DISPLAY, 60);
    state = update(state, 60, 60, 0.016);
    state = update(state, 72, 60, 0.032);
    expect(state.midi).toBe(60);

    state = update(state, 60, 60, 0.048);
    expect(state.midi).toBe(60);
  });

  it("holds the last reading through a brief unvoiced gap, then clears it", () => {
    let state = update(INITIAL_PITCH_DISPLAY, 60);
    state = update(state, null, 60, 0.1);
    expect(state.midi).toBe(60);

    state = update(state, null, 60, 0.5);
    expect(state.midi).toBeNull();
    expect(state.history).toEqual([]);
  });

  it("carries the absolute pitch across a target change instead of snapping", () => {
    let state = update(INITIAL_PITCH_DISPLAY, 60, 60, 0);
    state = update(state, 60, 62, 0.5);
    expect(state.midi).toBeCloseTo(60, 5);
  });

  it("settles on the target without a residual deadband error", () => {
    let state = update(INITIAL_PITCH_DISPLAY, 60, 60, 0);
    for (let index = 1; index <= 120; index += 1) {
      state = update(state, 62, 62, index * 0.016);
    }
    expect(state.midi).toBeCloseTo(62, 2);
  });

  it("locks a singer's octave shift after a few matching notes", () => {
    const state = lockVocalShift(INITIAL_PITCH_DISPLAY, 48);
    expect(state.octaveShift).toBe(12);

    const next = update(state, 50, 62, 0.08, true);
    expect(next.octaveShift).toBe(12);
    expect(next.midi).toBeGreaterThan(48);
    expect(next.midi).toBeLessThanOrEqual(62);
  });

  it("does not let a later target change rewrite a locked octave shift", () => {
    let state = lockVocalShift(INITIAL_PITCH_DISPLAY, 48, 60);
    expect(state.octaveShift).toBe(12);

    for (let index = 0; index < 20; index += 1) {
      state = update(state, 48, 72, 0.1 + index * 0.016, true);
    }
    expect(state.octaveShift).toBe(12);
    expect(state.midi).toBeCloseTo(60, 0);
  });

  it("recovers from a transient octave error on the first note", () => {
    let state = update(INITIAL_PITCH_DISPLAY, 72, 60, 0, true);
    for (let index = 1; index <= 3; index += 1) {
      state = update(state, 60, 60, index * 0.016, true);
    }
    expect(state.octaveShift).toBe(0);

    for (let index = 4; index <= 20; index += 1) {
      state = update(state, 60, 60, index * 0.016, true);
    }
    expect(state.midi).toBeCloseTo(60, 0);
  });

  it("does not force a non-octave wrong note into the target octave", () => {
    const state = update(INITIAL_PITCH_DISPLAY, 69, 60, 0, true);
    expect(state.octaveShift).toBeNull();
    expect(state.midi).toBe(69);
  });

  it("establishes the vocal octave shift on a later in-tune note", () => {
    let state = update(INITIAL_PITCH_DISPLAY, 69, 60, 0, true);
    expect(state.octaveShift).toBeNull();

    state = lockVocalShift(state, 48, 60, 0.016);
    expect(state.octaveShift).toBe(12);
    expect(state.midi).toBeGreaterThan(48);
    expect(state.midi).toBeLessThanOrEqual(60);
  });

  it("does not fold instruments", () => {
    const state = update(INITIAL_PITCH_DISPLAY, 48, 60, 0, false);
    expect(state.octaveShift).toBeNull();
    expect(state.midi).toBe(48);
  });

  it("drops unlocked octave votes after a long silence", () => {
    let state = update(INITIAL_PITCH_DISPLAY, 48, 60, 0, true);
    expect(state.octaveVotes).toEqual([12]);

    state = update(state, null, 60, 0.1, true);
    expect(state.octaveVotes).toEqual([12]);

    state = update(state, null, 60, 0.7, true);
    expect(state.octaveVotes).toEqual([]);
  });

  it("ignores non-finite detected pitches", () => {
    const state = update(INITIAL_PITCH_DISPLAY, Number.NaN);
    expect(state.midi).toBeNull();
    expect(state.history).toEqual([]);
  });
});
