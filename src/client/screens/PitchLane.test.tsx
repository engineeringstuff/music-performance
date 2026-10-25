// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TargetNote } from "../../shared/domain";
import { pitchLaneRange, pitchLaneYPercent } from "../game/pitchDisplay";
import { PitchLane } from "./GameScreen";

const notes: TargetNote[] = [
  { startSec: 0, durationSec: 0.5, midi: 60 },
  { startSec: 0.5, durationSec: 0.5, midi: 69 },
];
const range = pitchLaneRange(notes);

function renderLane(currentCents: number | null) {
  return render(
    <PitchLane
      notes={notes}
      timeSec={0.2}
      currentIndex={0}
      currentCents={currentCents}
      evaluations={new Map()}
      reducedMotion={false}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("PitchLane", () => {
  it("places the ball on the target note when the cents are zero", () => {
    const { getByTestId } = renderLane(0);
    const ball = getByTestId("pitch-ball");
    expect(ball.style.top).toBe(`${pitchLaneYPercent(60, range)}%`);
  });

  it("keeps an out-of-range pitch visible at the edge with an off-range ring", () => {
    const { getByTestId } = renderLane(2400);
    const high = getByTestId("pitch-ball");
    expect(Number.parseFloat(high.style.top)).toBe(2);
    expect(high.className).toContain("ring-amber");

    cleanup();
    const below = renderLane(-2400);
    const low = below.getByTestId("pitch-ball");
    expect(Number.parseFloat(low.style.top)).toBe(98);
    expect(low.className).toContain("ring-amber");
  });
});
