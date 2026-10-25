import { describe, expect, it } from "vitest";
import { parseTrackChart, parseTracksResponse } from "./validate";

const track = {
  id: "demo",
  title: "Demo",
  artist: "Traditional",
  durationSec: 10,
  difficulty: "easy",
  licence: "Public domain",
  audioUrl: "/audio/demo.mp3",
  audioVariants: [
    { transposeSemitones: -2, audioUrl: "/audio/demo.backing.t-2.mp3" },
    { transposeSemitones: 0, audioUrl: "/audio/demo.mp3" },
  ],
  chartUrl: "/charts/demo.json",
  attribution: "Traditional",
  sourceUrl: "https://example.com",
};

const chart = {
  version: 1,
  trackId: "demo",
  sourceInstrument: "piano",
  tempoBpm: 100,
  notes: [{ startSec: 0, durationSec: 1, midi: 60 }],
};

describe("content validation", () => {
  it("accepts a valid catalogue and chart", () => {
    const parsed = parseTracksResponse({ tracks: [track] });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.audioVariants).toHaveLength(2);
    expect(parseTrackChart(chart).notes[0]?.midi).toBe(60);
  });

  it("rejects malformed catalogues", () => {
    expect(() => parseTracksResponse({})).toThrow(/tracks/);
    expect(() => parseTracksResponse({ tracks: [{ ...track, durationSec: 0 }] })).toThrow(
      /duration/,
    );
  });

  it("rejects malformed charts", () => {
    expect(() => parseTrackChart({ ...chart, version: 2 })).toThrow(/version/);
    expect(() => parseTrackChart({ ...chart, notes: [] })).toThrow(/notes/);
    expect(() =>
      parseTrackChart({
        ...chart,
        notes: [
          { startSec: 0, durationSec: 2, midi: 60 },
          { startSec: 1, durationSec: 1, midi: 62 },
        ],
      }),
    ).toThrow(/overlapping/);
  });

  it("rejects notes outside MIDI range", () => {
    expect(() => parseTrackChart({ ...chart, notes: [{ ...chart.notes[0], midi: 200 }] })).toThrow(
      /invalid/,
    );
  });
});
