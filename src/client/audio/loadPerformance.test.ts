import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrackSummary } from "../../shared/domain";
import { loadPerformance } from "./loadPerformance";

const track: TrackSummary = {
  id: "demo",
  title: "Demo",
  artist: "Test",
  durationSec: 1,
  difficulty: "easy",
  licence: "CC0 1.0",
  attribution: "Test",
  sourceUrl: "https://example.com",
  audioUrl: "/audio/demo.backing.mp3",
  guideUrl: "/audio/demo.guide.mp3",
  chartUrl: "/charts/demo.json",
  keySignature: "C major",
  tempoBpm: 100,
};

const chart = {
  version: 1 as const,
  trackId: "demo",
  sourceInstrument: "piano" as const,
  tempoBpm: 100,
  notes: [{ startSec: 0, durationSec: 1, midi: 60 }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadPerformance", () => {
  it("does not fetch the guide when it is disabled", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(".json")) {
        return new Response(JSON.stringify(chart), { status: 200 });
      }
      return new Response(new ArrayBuffer(8), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const context = {
      decodeAudioData: vi.fn(async () => ({ duration: 1 })),
    } as unknown as AudioContext;

    const loaded = await loadPerformance(context, track, new AbortController().signal, {
      loadGuide: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("guide"))).toBe(false);
    expect(loaded.audio.guide).toBeNull();
  });

  it("rejects a missing requested key and a missing guide", async () => {
    const context = {
      decodeAudioData: vi.fn(async () => ({ duration: 1 })),
    } as unknown as AudioContext;
    const baseTrack = {
      ...track,
      audioVariants: [{ transposeSemitones: 0, audioUrl: "/audio/demo.backing.mp3" }],
    };

    await expect(
      loadPerformance(context, baseTrack, new AbortController().signal, {
        transposeSemitones: 2,
      }),
    ).rejects.toThrow(/backing key 2/);

    await expect(
      loadPerformance(context, baseTrack, new AbortController().signal, {
        loadGuide: true,
        transposeSemitones: 0,
      }),
    ).rejects.toThrow(/guide stem is not available/);
  });

  it("rejects chart identity, HTTP and decode failures", async () => {
    const context = {
      decodeAudioData: vi.fn(async () => ({ duration: 1 })),
    } as unknown as AudioContext;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(".json")) {
          return new Response(JSON.stringify({ ...chart, trackId: "other" }), { status: 200 });
        }
        return new Response(new ArrayBuffer(8), { status: 200 });
      }),
    );
    await expect(
      loadPerformance(context, track, new AbortController().signal, { loadGuide: false }),
    ).rejects.toThrow(/does not match/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );
    await expect(
      loadPerformance(context, track, new AbortController().signal, { loadGuide: false }),
    ).rejects.toThrow(/503/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(".json")) {
          return new Response(JSON.stringify(chart), { status: 200 });
        }
        return new Response(new ArrayBuffer(8), { status: 200 });
      }),
    );
    const broken = {
      decodeAudioData: vi.fn(async () => {
        throw new Error("decode failed");
      }),
    } as unknown as AudioContext;
    await expect(
      loadPerformance(broken, track, new AbortController().signal, { loadGuide: false }),
    ).rejects.toThrow(/decode failed/);
  });

  it("fetches and decodes the guide when it is enabled", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(".json")) {
        return new Response(JSON.stringify(chart), { status: 200 });
      }
      return new Response(new ArrayBuffer(8), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const decodeAudioData = vi.fn(async () => ({ duration: 1 }));
    const context = { decodeAudioData } as unknown as AudioContext;

    const loaded = await loadPerformance(context, track, new AbortController().signal, {
      loadGuide: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(decodeAudioData).toHaveBeenCalledTimes(2);
    expect(loaded.audio.guide).not.toBeNull();
  });
});
