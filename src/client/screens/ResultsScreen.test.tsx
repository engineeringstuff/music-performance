// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameConfig, TrackSummary } from "../../shared/domain";
import type { NoteEvaluation, ScoreBreakdown } from "../../shared/scoring";

const resultMocks = vi.hoisted(() => ({
  getBestResult: vi.fn(),
  saveResult: vi.fn(),
  resultFromScore: vi.fn(() => ({})),
}));

vi.mock("../lib/results", () => ({
  getBestResult: resultMocks.getBestResult,
  saveResult: resultMocks.saveResult,
  resultFromScore: resultMocks.resultFromScore,
}));

import { ResultsScreen } from "./ResultsScreen";

const config: GameConfig = {
  playerName: "Player",
  instrumentId: "vocals",
  trackId: "demo",
  transposeSemitones: 2,
  keyTransposeSemitones: 2,
  guideEnabled: false,
};

const track: TrackSummary = {
  id: "demo",
  title: "Demo Track",
  artist: "Test",
  durationSec: 30,
  difficulty: "easy",
  licence: "CC0 1.0",
  attribution: "Test",
  sourceUrl: "https://example.com",
  audioUrl: "/audio/demo.mp3",
  chartUrl: "/charts/demo.json",
};

function note(index: number, score: number): NoteEvaluation {
  return {
    index,
    targetMidi: 60,
    pitchQuality: score / 100,
    timingQuality: 1,
    coverage: 1,
    score,
    rating: score >= 90 ? "perfect" : score >= 50 ? "good" : "miss",
    onsetErrorSec: 0,
  };
}

const score: ScoreBreakdown = {
  notes: [note(0, 100), note(1, 80), note(2, 60), note(3, 20)],
  totalPoints: 260,
  maxPoints: 400,
  accuracy: 0.65,
  notesHit: 3,
  notesMissed: 1,
  evaluatedNotes: 4,
  currentStreak: 0,
  longestStreak: 3,
  meanPitchQuality: 0.8,
  meanTimingQuality: 0.9,
  meanCoverage: 0.85,
};

beforeEach(() => {
  resultMocks.getBestResult.mockReset();
  resultMocks.saveResult.mockReset();
  resultMocks.resultFromScore.mockClear();
  resultMocks.getBestResult.mockResolvedValue(null);
  resultMocks.saveResult.mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn(async () => undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderResults(overrides: { initiallySaved?: boolean } = {}) {
  return render(
    <ResultsScreen
      config={config}
      track={track}
      score={score}
      initiallySaved={overrides.initiallySaved}
      onSaved={vi.fn()}
      onTryAgain={vi.fn()}
      onChangeSetup={vi.fn()}
      onExit={vi.fn()}
      onHistory={vi.fn()}
    />,
  );
}

describe("ResultsScreen", () => {
  it("renders the score and saves exactly once with the octave best key", async () => {
    renderResults();
    expect(screen.getByRole("heading", { name: "Encore!" })).toBeTruthy();
    expect(screen.getByText("260")).toBeTruthy();
    expect(screen.getByText(/65% accuracy/)).toBeTruthy();
    expect(screen.getByText(/Backing key \+2 semitones/)).toBeTruthy();

    await waitFor(() => expect(resultMocks.saveResult).toHaveBeenCalledTimes(1));
    expect(resultMocks.getBestResult).toHaveBeenCalledWith("demo", "vocals", 0);
    await screen.findByText("Saved in this browser.");
  });

  it("does not save again when restored from the results snapshot", async () => {
    renderResults({ initiallySaved: true });
    expect(resultMocks.saveResult).not.toHaveBeenCalled();
    expect(screen.getByText("Saved in this browser.")).toBeTruthy();
  });

  it("reports a best-read failure without claiming a new best", async () => {
    resultMocks.getBestResult.mockRejectedValueOnce(new Error("db down"));
    renderResults();
    await screen.findByText("Saved in this browser.");
    expect(screen.getByText(/Best unavailable for this octave/)).toBeTruthy();
    expect(screen.queryByText("New personal best")).toBeNull();
  });

  it("shares via the clipboard fallback", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderResults();
    fireEvent.click(screen.getByRole("button", { name: "Share result" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    await screen.findByText("Copied");
  });
});
