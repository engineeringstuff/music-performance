import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrackSummary } from "../../shared/domain";
import { fetchTracks, preloadTrack } from "./api";

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
  audioVariants: [
    { transposeSemitones: 0, audioUrl: "/audio/demo.backing.mp3" },
    { transposeSemitones: 2, audioUrl: "/audio/demo.backing.t2.mp3" },
  ],
};

const chart = {
  version: 1,
  trackId: "demo",
  sourceInstrument: "piano",
  tempoBpm: 100,
  notes: [{ startSec: 0, durationSec: 1, midi: 60 }],
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTracks", () => {
  it("parses a valid catalogue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ tracks: [track] })),
    );
    expect(await fetchTracks()).toEqual([track]);
  });

  it("rejects malformed and failed catalogues", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ tracks: {} })),
    );
    await expect(fetchTracks()).rejects.toThrow(/tracks/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 500)),
    );
    await expect(fetchTracks()).rejects.toThrow(/500/);
  });
});

describe("preloadTrack", () => {
  it("loads the requested key stem and chart", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.endsWith(".json") ? jsonResponse(chart) : new Response(new ArrayBuffer(8));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await preloadTrack(track, new AbortController().signal, 2);
    expect(result.trackId).toBe("demo");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "/audio/demo.backing.t2.mp3",
    );
  });

  it("rejects a missing key instead of silently using the original", async () => {
    await expect(preloadTrack(track, new AbortController().signal, -2)).rejects.toThrow(
      /backing key -2/,
    );
  });

  it("rejects a nonzero key when the track has no variants", async () => {
    const plain = { ...track, audioVariants: undefined };
    await expect(preloadTrack(plain, new AbortController().signal, 2)).rejects.toThrow(
      /does not ship/,
    );
  });

  it("rejects chart and audio HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 404)),
    );
    await expect(preloadTrack(track, new AbortController().signal, 0)).rejects.toThrow(/404/);
  });
});
