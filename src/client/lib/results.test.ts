import { describe, expect, it } from "vitest";
import type { StoredResult } from "./results";
import { resultsToPrune, selectBestResult } from "./results";

function result(overrides: Partial<StoredResult>): StoredResult {
  return {
    id: "id",
    trackId: "track",
    trackTitle: "Track",
    instrumentId: "vocals",
    playerName: "Player",
    transposeSemitones: 0,
    keyTransposeSemitones: 0,
    octaveShiftSemitones: 0,
    guideEnabled: false,
    totalPoints: 50,
    maxPoints: 100,
    accuracy: 0.5,
    notesHit: 1,
    notesMissed: 1,
    longestStreak: 1,
    meanPitchQuality: 0.5,
    meanTimingQuality: 0.5,
    meanCoverage: 0.5,
    notes: [],
    completedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("result selection", () => {
  const results = [
    result({ id: "clean", accuracy: 0.7 }),
    result({ id: "best-clean", accuracy: 0.9 }),
    result({ id: "guide", accuracy: 0.99, guideEnabled: true }),
    result({
      id: "octave",
      accuracy: 0.95,
      transposeSemitones: -12,
      octaveShiftSemitones: -12,
    }),
    result({ id: "other-instrument", accuracy: 0.95, instrumentId: "piano" }),
  ];

  it("only considers clean runs at the same octave and instrument", () => {
    expect(selectBestResult(results, "track", "vocals", 0)?.id).toBe("best-clean");
    expect(selectBestResult(results, "track", "vocals", -12)?.id).toBe("octave");
    expect(selectBestResult(results, "track", "piano", 0)?.id).toBe("other-instrument");
  });

  it("can include guide-assisted runs explicitly", () => {
    expect(selectBestResult(results, "track", "vocals", 0, true)?.id).toBe("guide");
  });

  it("prunes the oldest results beyond the limit", () => {
    const many = Array.from({ length: 5 }, (_, index) =>
      result({
        id: `result-${index}`,
        completedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
      }),
    );
    expect(resultsToPrune(many, 3)).toEqual(["result-1", "result-0"]);
  });
});
