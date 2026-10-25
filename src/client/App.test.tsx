// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GameConfig, TrackSummary } from "../shared/domain";
import { hashForScreen, screenFromHash } from "./App";

const config: GameConfig = {
  playerName: "Player",
  instrumentId: "vocals",
  trackId: "demo",
  transposeSemitones: 0,
  keyTransposeSemitones: 0,
  guideEnabled: false,
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
  audioUrl: "/audio/demo.mp3",
  chartUrl: "/charts/demo.json",
};

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("App hash helpers", () => {
  it("maps static routes and rejects unknown hashes", () => {
    expect(screenFromHash("#/setup")).toEqual({ name: "setup" });
    expect(screenFromHash("#/settings")).toEqual({ name: "settings" });
    expect(screenFromHash("#/history")).toEqual({ name: "history" });
    expect(screenFromHash("#/results")).toBeNull();
    expect(screenFromHash("#/nope")).toBeNull();
    expect(hashForScreen({ name: "setup" })).toBe("#/setup");
  });

  it("restores a saved results snapshot and hashes it", () => {
    window.sessionStorage.setItem(
      "music-performance:last-result:v1",
      JSON.stringify({ config, track, score: null, saved: true }),
    );
    const restored = screenFromHash("#/results");
    expect(restored?.name).toBe("results");
    if (restored?.name === "results") {
      expect(restored.saved).toBe(true);
      expect(hashForScreen(restored)).toBe("#/results");
    }
  });

  it("ignores corrupt results snapshots", () => {
    window.sessionStorage.setItem("music-performance:last-result:v1", "{bad");
    expect(screenFromHash("#/results")).toBeNull();
    window.sessionStorage.setItem(
      "music-performance:last-result:v1",
      JSON.stringify({ config: null, track: null }),
    );
    expect(screenFromHash("#/results")).toBeNull();
  });
});
