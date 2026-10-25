// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredResult } from "../lib/results";

const resultMocks = vi.hoisted(() => ({
  getRecentResults: vi.fn(),
  getPersonalBests: vi.fn(),
}));

vi.mock("../lib/results", () => ({
  getRecentResults: resultMocks.getRecentResults,
  getPersonalBests: resultMocks.getPersonalBests,
}));

import { HistoryScreen } from "./HistoryScreen";

function result(overrides: Partial<StoredResult> = {}): StoredResult {
  return {
    id: "r1",
    trackId: "demo",
    trackTitle: "Demo Track",
    instrumentId: "vocals",
    playerName: "Player",
    transposeSemitones: 2,
    keyTransposeSemitones: 2,
    octaveShiftSemitones: 0,
    guideEnabled: false,
    totalPoints: 260,
    maxPoints: 400,
    accuracy: 0.65,
    notesHit: 3,
    notesMissed: 1,
    longestStreak: 3,
    meanPitchQuality: 0.8,
    meanTimingQuality: 0.9,
    meanCoverage: 0.85,
    notes: [],
    completedAt: "2026-10-25T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  resultMocks.getRecentResults.mockReset();
  resultMocks.getPersonalBests.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("HistoryScreen", () => {
  it("shows clean bests and recent runs with key/octave metadata", async () => {
    resultMocks.getRecentResults.mockResolvedValue([
      result(),
      result({ id: "guided", guideEnabled: true, accuracy: 0.5 }),
    ]);
    resultMocks.getPersonalBests.mockResolvedValue([result()]);

    render(<HistoryScreen onBack={vi.fn()} onSettings={vi.fn()} />);

    expect(await screen.findByText("Personal bests")).toBeTruthy();
    expect(screen.getAllByText("Demo Track").length).toBeGreaterThan(0);
    expect(screen.getByText(/key \+2 st/)).toBeTruthy();
    expect(screen.getByText("Guide on")).toBeTruthy();
    expect(screen.getAllByText("65%").length).toBeGreaterThan(0);
  });

  it("shows an empty state and routes Back", async () => {
    resultMocks.getRecentResults.mockResolvedValue([]);
    resultMocks.getPersonalBests.mockResolvedValue([]);
    const onBack = vi.fn();

    render(<HistoryScreen onBack={onBack} onSettings={vi.fn()} />);

    expect(await screen.findByText("No performances yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows a load failure", async () => {
    resultMocks.getRecentResults.mockRejectedValue(new Error("history failed"));
    resultMocks.getPersonalBests.mockResolvedValue([]);

    render(<HistoryScreen onBack={vi.fn()} onSettings={vi.fn()} />);
    expect(await screen.findByText("history failed")).toBeTruthy();
  });
});
