import { describe, expect, it } from "vitest";
import { advancePracticeClock, createPracticeClock } from "./practiceClock";

describe("practice clock", () => {
  it("clicks once per beat and not between beats", () => {
    let clock = createPracticeClock(0, 100);
    let step = advancePracticeClock(clock, 0, 100);
    expect(step.click).toBe(true);
    clock = step.clock;

    step = advancePracticeClock(clock, 0.3, 100);
    expect(step.click).toBe(false);
    clock = step.clock;

    step = advancePracticeClock(clock, 0.6, 100);
    expect(step.click).toBe(true);
  });

  it("resets the beat grid when media loops", () => {
    let clock = createPracticeClock(0, 100);
    clock = advancePracticeClock(clock, 10, 100).clock;
    const step = advancePracticeClock(clock, 0.01, 100);
    expect(step.looped).toBe(true);
    expect(step.click).toBe(true);
    expect(step.clock.nextBeat).toBe(1);
  });

  it("keeps the same musical beat at a slower media rate", () => {
    let clock = createPracticeClock(0, 100);
    clock = advancePracticeClock(clock, 0, 100).clock;
    const step = advancePracticeClock(clock, 0.6, 100);
    expect(step.click).toBe(true);
  });
});
