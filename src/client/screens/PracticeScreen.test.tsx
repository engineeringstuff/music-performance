// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameConfig, TrackSummary } from "../../shared/domain";

import { PracticeScreen } from "./PracticeScreen";

const config: GameConfig = {
  playerName: "Player",
  instrumentId: "vocals",
  trackId: "demo",
  transposeSemitones: 0,
  keyTransposeSemitones: 0,
  guideEnabled: true,
};

const track: TrackSummary = {
  id: "demo",
  title: "Demo",
  artist: "Test",
  durationSec: 10,
  difficulty: "easy",
  licence: "CC0 1.0",
  attribution: "Test",
  sourceUrl: "https://example.com",
  audioUrl: "/audio/demo.backing.mp3",
  guideUrl: "/audio/demo.guide.mp3",
  chartUrl: "/charts/demo.json",
  tempoBpm: 100,
  audioVariants: [
    {
      transposeSemitones: 0,
      audioUrl: "/audio/demo.backing.mp3",
      guideUrl: "/audio/demo.guide.mp3",
    },
  ],
};

const chart = {
  version: 1,
  trackId: "demo",
  sourceInstrument: "vocals",
  tempoBpm: 100,
  notes: [{ startSec: 0, durationSec: 1, midi: 60 }],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(chart), { status: 200 })),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 0;
      destination = {};
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => undefined);
      createOscillator = vi.fn(() => ({
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }));
      createGain = vi.fn(() => ({
        gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }));
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PracticeScreen", () => {
  it("applies loop, guide-only and speed, then stops on ended", async () => {
    render(<PracticeScreen config={config} track={track} onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Play practice" })).toBeTruthy());

    const audios = [...document.querySelectorAll("audio")];
    expect(audios).toHaveLength(2);

    fireEvent.click(screen.getByLabelText("Loop"));
    fireEvent.click(screen.getByLabelText("Guide only"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "0.75" } });
    fireEvent.click(screen.getByRole("button", { name: "Play practice" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy());
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(audios[0]?.loop).toBe(true);
    expect(audios[0]?.playbackRate).toBe(0.75);
    expect(audios[0]?.preservesPitch).toBe(true);
    expect(audios[0]?.volume).toBe(0);
    expect(audios[1]?.volume).toBe(0.8);

    fireEvent.click(screen.getByLabelText("Loop"));
    const backingAudio = audios[0];
    if (!backingAudio) {
      throw new Error("Expected a backing audio element");
    }
    fireEvent.ended(backingAudio);
    await waitFor(() => expect(screen.getByRole("button", { name: "Play practice" })).toBeTruthy());
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});
