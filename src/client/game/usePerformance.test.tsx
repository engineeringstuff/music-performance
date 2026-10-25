// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameConfig, TrackSummary } from "../../shared/domain";

const hoisted = vi.hoisted(() => {
  const chart = {
    version: 1 as const,
    trackId: "demo",
    sourceInstrument: "vocals" as const,
    tempoBpm: 100,
    notes: [
      { startSec: 0, durationSec: 0.5, midi: 60 },
      { startSec: 0.5, durationSec: 0.5, midi: 62 },
    ],
  };
  const loaded = {
    chart,
    audio: {
      backing: { duration: 1.5 } as AudioBuffer,
      guide: { duration: 1.5 } as AudioBuffer,
    },
  };
  const frame = { timeSec: 0, hz: 261.6256, clarity: 1, level: 1 };
  return {
    chart,
    loaded,
    frame,
    micInstances: [] as Array<{
      context: unknown;
      offset: number;
      echoCancellation: boolean;
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      read: ReturnType<typeof vi.fn>;
    }>,
    midiInstances: [] as Array<{
      offset: number;
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      read: ReturnType<typeof vi.fn>;
    }>,
  };
});

vi.mock("../audio/loadPerformance", () => ({
  loadPerformance: vi.fn(async () => hoisted.loaded),
}));

vi.mock("../audio/pitch", () => ({
  MicrophonePitchSource: class {
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn();
    read = vi.fn(() => hoisted.frame);
    constructor(
      public context: unknown,
      public offset: number,
      public echoCancellation = false,
    ) {
      hoisted.micInstances.push(this);
    }
  },
  MidiPitchSource: class {
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn();
    read = vi.fn(() => ({ ...hoisted.frame, onset: true, onsetMidi: 60 }));
    constructor(public offset: number) {
      hoisted.midiInstances.push(this);
    }
  },
}));

vi.mock("../lib/preferences", () => ({
  loadAudioSettings: vi.fn(() => ({
    backingVolume: 0.4,
    guideVolume: 0.6,
    echoCancellation: false,
  })),
  loadLatencyOffsetMs: vi.fn(() => 50),
}));

import { loadPerformance } from "../audio/loadPerformance";
import {
  clearPitchDiagnostics,
  readPitchDiagnostics,
  setPitchDiagnosticsEnabled,
} from "../lib/pitchDiagnostics";
import { loadAudioSettings } from "../lib/preferences";
import { usePerformance } from "./usePerformance";

const track: TrackSummary = {
  id: "demo",
  title: "Demo",
  artist: "Test",
  durationSec: 1.5,
  difficulty: "easy",
  licence: "CC0 1.0",
  attribution: "Test",
  sourceUrl: "https://example.com",
  audioUrl: "/audio/demo.backing.mp3",
  guideUrl: "/audio/demo.guide.mp3",
  chartUrl: "/charts/demo.json",
};

const config: GameConfig = {
  playerName: "Test",
  instrumentId: "vocals",
  trackId: "demo",
  transposeSemitones: 0,
  keyTransposeSemitones: 0,
  guideEnabled: true,
};

interface FakeGain {
  gain: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface FakeSource {
  buffer: AudioBuffer | null;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

let context: {
  currentTime: number;
  destination: object;
  resume: ReturnType<typeof vi.fn>;
  suspend: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  gains: FakeGain[];
  sources: FakeSource[];
  oscillators: number;
  createGain: () => FakeGain;
  createBufferSource: () => FakeSource;
  createOscillator: () => object;
};

let raf = new Map<number, FrameRequestCallback>();
let nextRaf = 1;

function flushFrame(): void {
  const callbacks = [...raf.values()];
  raf.clear();
  for (const callback of callbacks) {
    callback(0);
  }
}

beforeEach(() => {
  hoisted.micInstances.length = 0;
  hoisted.midiInstances.length = 0;
  vi.mocked(loadPerformance).mockReset();
  vi.mocked(loadPerformance).mockResolvedValue(hoisted.loaded);
  raf = new Map();
  nextRaf = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextRaf;
    nextRaf += 1;
    raf.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    raf.delete(id);
  });
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 0;
      destination = {};
      resume = vi.fn(async () => undefined);
      suspend = vi.fn(async () => undefined);
      close = vi.fn(async () => undefined);
      gains: FakeGain[] = [];
      sources: FakeSource[] = [];
      oscillators = 0;
      createGain = () => {
        const gain = {
          gain: {
            value: 1,
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        this.gains.push(gain);
        return gain;
      };
      createBufferSource = () => {
        const source = {
          buffer: null as AudioBuffer | null,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        this.sources.push(source);
        return source;
      };
      createOscillator = () => {
        this.oscillators += 1;
        return {
          frequency: { value: 0 },
          connect: vi.fn((target: unknown) => target),
          start: vi.fn(),
          stop: vi.fn(),
        };
      };
      constructor() {
        context = this;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function startPerformance(
  inputMode: "microphone" | "midi" = "microphone",
  overrides: Partial<GameConfig> = {},
) {
  const onFinish = vi.fn();
  const onForfeit = vi.fn();
  const hook = renderHook(() =>
    usePerformance({
      config: { ...config, inputMode, ...overrides },
      track,
      onFinish,
      onForfeit,
    }),
  );
  await act(async () => {
    await hook.result.current.start();
  });
  return { hook, onFinish, onForfeit };
}

describe("usePerformance", () => {
  it("prepares, schedules count-in and applies audio/timing settings", async () => {
    const { hook } = await startPerformance();
    expect(hook.result.current.phase).toBe("countdown");
    expect(hook.result.current.countdown).toBe(3);
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0]?.start).toHaveBeenCalledWith(3);
    expect(context.gains.slice(-2).map((gain) => gain.gain.value)).toEqual([0.4, 0.6]);
    expect(context.oscillators).toBe(3);
    expect(hoisted.micInstances[0]?.offset).toBeCloseTo(0.05, 9);
  });

  it("enters playing, pauses without advancing, and resumes", async () => {
    const { hook } = await startPerformance();
    context.currentTime = 3.05;
    await act(async () => {
      flushFrame();
    });
    expect(hook.result.current.phase).toBe("playing");
    expect(hook.result.current.timeSec).toBeGreaterThan(0);

    act(() => hook.result.current.pause());
    expect(hook.result.current.paused).toBe(true);
    expect(context.suspend).toHaveBeenCalled();
    const pausedAt = hook.result.current.timeSec;
    context.currentTime = 4;
    await act(async () => {
      flushFrame();
    });
    expect(hook.result.current.timeSec).toBe(pausedAt);

    await act(async () => {
      await hook.result.current.resume();
    });
    expect(hook.result.current.paused).toBe(false);
    expect(context.resume).toHaveBeenCalled();
  });

  it("smooths the displayed cents and holds through a brief dropout", async () => {
    const { hook } = await startPerformance();
    const mic = hoisted.micInstances[0];
    if (!mic) {
      throw new Error("Expected a microphone source");
    }
    const step = async (time: number, frame = hoisted.frame) => {
      mic.read.mockReturnValue(frame);
      context.currentTime = time;
      await act(async () => {
        flushFrame();
      });
    };

    await step(3);
    expect(hook.result.current.currentCents).toBeCloseTo(0, 0);
    await step(3.016);
    await step(3.032, { ...hoisted.frame, hz: 523.2511 });
    expect(hook.result.current.currentCents).toBeCloseTo(0, 0);
    await step(3.048);
    expect(hook.result.current.currentCents).toBeCloseTo(0, 0);

    await step(3.064, { ...hoisted.frame, hz: 0, clarity: 0 });
    expect(hook.result.current.currentCents).toBeCloseTo(0, 0);
    await step(3.55, { ...hoisted.frame, hz: 0, clarity: 0 });
    expect(hook.result.current.currentCents).toBeNull();
  });

  it("records pitch diagnostics when the opt-in is enabled", async () => {
    setPitchDiagnosticsEnabled(true);
    clearPitchDiagnostics();
    try {
      const { hook } = await startPerformance();
      context.currentTime = 3;
      await act(async () => {
        flushFrame();
      });
      context.currentTime = 3.05;
      await act(async () => {
        flushFrame();
      });
      act(() => hook.result.current.forfeit());

      const captured = readPitchDiagnostics();
      expect(captured?.frames.length).toBeGreaterThan(0);
      expect(captured?.meta.trackId).toBe("demo");
      expect(captured?.frames[0]?.target).toBe(60);
    } finally {
      setPitchDiagnosticsEnabled(false);
      clearPitchDiagnostics();
    }
  });

  it("passes the echo-cancellation preference to the microphone source", async () => {
    vi.mocked(loadAudioSettings).mockReturnValueOnce({
      backingVolume: 0.4,
      guideVolume: 0.6,
      echoCancellation: true,
    });
    await startPerformance();
    expect(hoisted.micInstances[0]?.echoCancellation).toBe(true);
  });

  it("uses the corrected frame time for octave calibration", async () => {
    const { hook } = await startPerformance();
    const mic = hoisted.micInstances[0];
    if (!mic) {
      throw new Error("Expected a microphone source");
    }
    mic.read.mockImplementation((readTime: number) => ({
      ...hoisted.frame,
      hz: 130.8128,
      clarity: 1,
      timeSec: readTime - 0.1,
    }));

    for (let index = 0; index < 20; index += 1) {
      context.currentTime = 3.55 + index * 0.016;
      await act(async () => {
        flushFrame();
      });
    }

    // The analysed C3 belongs to the previous C4 target (frame time 0.45),
    // so it calibrates the vocal octave to the chart octave. Against the
    // current D4 target the ball sits at C4, i.e. -200 cents.
    expect(hook.result.current.currentIndex).toBe(1);
    expect(hook.result.current.currentCents).toBeGreaterThan(-260);
    expect(hook.result.current.currentCents).toBeLessThan(-140);
  });

  it("keeps the ball on the held pitch when the target note changes", async () => {
    const { hook } = await startPerformance();
    const mic = hoisted.micInstances[0];
    if (!mic) {
      throw new Error("Expected a microphone source");
    }
    const step = async (time: number) => {
      mic.read.mockReturnValue(hoisted.frame);
      context.currentTime = time;
      await act(async () => {
        flushFrame();
      });
    };

    await step(3);
    expect(hook.result.current.currentIndex).toBe(0);
    expect(hook.result.current.currentCents).toBeCloseTo(0, 0);

    // The second chart note is D4; the player is still holding C4.
    await step(3.55);
    expect(hook.result.current.currentIndex).toBe(1);
    expect(hook.result.current.currentCents).toBeGreaterThan(-260);
    expect(hook.result.current.currentCents).toBeLessThan(-140);
  });

  it("forfeits, disconnects and closes the context", async () => {
    const { hook, onForfeit } = await startPerformance();
    act(() => hook.result.current.forfeit());
    expect(onForfeit).toHaveBeenCalledTimes(1);
    expect(context.sources.every((source) => source.stop.mock.calls.length > 0)).toBe(true);
    expect(context.close).toHaveBeenCalled();
    expect(hoisted.micInstances[0]?.disconnect).toHaveBeenCalled();
  });

  it("finishes once and reports the selected key transpose", async () => {
    const { hook, onFinish } = await startPerformance("microphone", {
      keyTransposeSemitones: 2,
      transposeSemitones: 2,
    });
    expect(hook.result.current.notes[0]?.midi).toBe(62);
    context.currentTime = 3.05;
    await act(async () => {
      flushFrame();
    });
    context.currentTime = 4.8;
    await act(async () => {
      flushFrame();
    });
    expect(hook.result.current.phase).toBe("finished");
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]?.[1]).toBe(2);
  });

  it("uses the MIDI source and onset-required scoring in MIDI mode", async () => {
    const { hook } = await startPerformance("midi");
    expect(hoisted.micInstances).toHaveLength(0);
    expect(hoisted.midiInstances).toHaveLength(1);
    expect(hoisted.midiInstances[0]?.offset).toBeCloseTo(0.05, 9);
    context.currentTime = 3.05;
    await act(async () => {
      flushFrame();
    });
    expect(hook.result.current.phase).toBe("playing");
  });

  it("enters the error phase when loading fails", async () => {
    vi.mocked(loadPerformance).mockRejectedValueOnce(new Error("chart missing"));
    const { hook } = await startPerformance();
    expect(hook.result.current.phase).toBe("error");
    expect(hook.result.current.error).toBe("chart missing");
    expect(context.close).toHaveBeenCalled();
  });
});
