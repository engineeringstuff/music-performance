import { afterEach, describe, expect, it, vi } from "vitest";
import {
  correctedFrameTime,
  MicrophonePitchSource,
  MidiPitchSource,
  PITCH_WINDOW_SIZE,
  rootMeanSquare,
} from "./pitch";

function fakeStream(stop: () => void, latency = 0.02): MediaStream {
  const track = {
    stop,
    getSettings: () => ({ latency }),
  };
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
}

function fakeContext(options: { throwOnSource?: boolean; analyser?: AnalyserNode } = {}) {
  const analyser =
    options.analyser ??
    ({
      fftSize: 0,
      smoothingTimeConstant: 0,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getFloatTimeDomainData: (target: Float32Array) => target.fill(0),
    } as unknown as AnalyserNode);

  return {
    sampleRate: 44100,
    createMediaStreamSource: vi.fn(() => {
      if (options.throwOnSource) {
        throw new Error("closed context");
      }
      return { connect: vi.fn(), disconnect: vi.fn() };
    }),
    createAnalyser: vi.fn(() => analyser),
    analyser,
  } as unknown as AudioContext & { analyser: AnalyserNode };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("correctedFrameTime", () => {
  it("centres the analysis window", () => {
    const expected = 1 - PITCH_WINDOW_SIZE / (2 * 44100);
    expect(correctedFrameTime(1, 44100)).toBeCloseTo(expected, 9);
  });

  it("subtracts reported input latency (positive offset moves frames earlier)", () => {
    expect(correctedFrameTime(1, 44100, 0.02)).toBeCloseTo(
      1 - PITCH_WINDOW_SIZE / (2 * 44100) - 0.02,
      9,
    );
    expect(correctedFrameTime(1, 44100, -0.02)).toBeCloseTo(
      1 - PITCH_WINDOW_SIZE / (2 * 44100) + 0.02,
      9,
    );
  });
});

describe("rootMeanSquare", () => {
  it("measures a sine-like signal and clamps to 1", () => {
    expect(rootMeanSquare(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 6);
    expect(rootMeanSquare(new Float32Array([1, 1, 1, 1]))).toBe(1);
    expect(rootMeanSquare(new Float32Array())).toBe(0);
  });
});

describe("MicrophonePitchSource", () => {
  it("stops a stream that resolves after an abort", async () => {
    let resolveStream!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    );
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const stop = vi.fn();
    const source = new MicrophonePitchSource(fakeContext());
    const abort = new AbortController();
    const connection = source.connect(abort.signal);
    abort.abort();
    resolveStream(fakeStream(stop));

    await expect(connection).rejects.toMatchObject({ name: "AbortError" });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("stops the stream if the audio context rejects the source", async () => {
    const stop = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => fakeStream(stop)) },
    });

    const source = new MicrophonePitchSource(fakeContext({ throwOnSource: true }));
    await expect(source.connect()).rejects.toThrow("closed context");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("reports pitch, level and a window-centred timestamp", async () => {
    const stop = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => fakeStream(stop, 0)) },
    });

    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getFloatTimeDomainData: (target: Float32Array) => {
        for (let index = 0; index < target.length; index += 1) {
          target[index] = 0.5 * Math.sin((2 * Math.PI * 440 * index) / 44100);
        }
      },
    } as unknown as AnalyserNode;

    const source = new MicrophonePitchSource(fakeContext({ analyser }));
    await source.connect();
    const frame = source.read(1);

    expect(frame.hz).toBeCloseTo(440, 0);
    expect(frame.clarity).toBeGreaterThan(0.8);
    expect(frame.level).toBeCloseTo(0.3535, 1);
    expect(frame.timeSec).toBeCloseTo(correctedFrameTime(1, 44100, 0), 9);

    source.disconnect();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe("MidiPitchSource", () => {
  function midiSetup() {
    const input = { onmidimessage: null } as unknown as MIDIInput;
    const access = {
      inputs: new Map([["keyboard", input]]),
    } as unknown as MIDIAccess;
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn(async () => access),
    });
    return input;
  }

  it("turns note-on/off into frames and preserves the onset flag", async () => {
    const input = midiSetup();
    const source = new MidiPitchSource();
    await source.connect();

    input.onmidimessage?.({ data: new Uint8Array([0x90, 69, 100]) } as MIDIMessageEvent);
    const first = source.read(1);
    expect(first.hz).toBeCloseTo(440, 6);
    expect(first.clarity).toBe(1);
    expect(first.level).toBe(1);
    expect(first.onset).toBe(true);
    expect(first.onsetMidi).toBe(69);

    const held = source.read(1.1);
    expect(held.onset).toBe(false);
    expect(held.hz).toBeCloseTo(440, 6);

    input.onmidimessage?.({ data: new Uint8Array([0x80, 69, 0]) } as MIDIMessageEvent);
    const silent = source.read(1.2);
    expect(silent.hz).toBe(0);
    expect(silent.clarity).toBe(0);

    source.disconnect();
    expect(input.onmidimessage).toBeNull();
  });

  it("applies the timing offset to MIDI frames", async () => {
    const input = midiSetup();
    const source = new MidiPitchSource(0.05);
    await source.connect();
    input.onmidimessage?.({ data: new Uint8Array([0x90, 69, 100]) } as MIDIMessageEvent);
    expect(source.read(1).timeSec).toBeCloseTo(0.95, 9);
    source.disconnect();
  });

  it("fails clearly when no MIDI input is connected", async () => {
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn(async () => ({ inputs: new Map() })),
    });
    await expect(new MidiPitchSource().connect()).rejects.toThrow(/No MIDI input/);
  });
});

describe("MidiPitchSource edge cases", () => {
  it("tracks multiple inputs and chooses the highest active note", async () => {
    const inputA = { onmidimessage: null } as unknown as MIDIInput;
    const inputB = { onmidimessage: null } as unknown as MIDIInput;
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn(async () => ({
        inputs: new Map([
          ["a", inputA],
          ["b", inputB],
        ]),
      })),
    });

    const source = new MidiPitchSource();
    await source.connect();
    inputA.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) } as MIDIMessageEvent);
    inputB.onmidimessage?.({ data: new Uint8Array([0x90, 64, 100]) } as MIDIMessageEvent);
    expect(source.read(1).hz).toBeCloseTo(329.6276, 3);

    inputB.onmidimessage?.({ data: new Uint8Array([0x80, 64, 0]) } as MIDIMessageEvent);
    expect(source.read(1.1).hz).toBeCloseTo(261.6256, 3);
    source.disconnect();
  });

  it("ignores non-note messages and reports repeated note-ons", async () => {
    const input = { onmidimessage: null } as unknown as MIDIInput;
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn(async () => ({ inputs: new Map([["a", input]]) })),
    });
    const source = new MidiPitchSource();
    await source.connect();

    input.onmidimessage?.({ data: new Uint8Array([0xb0, 1, 127]) } as MIDIMessageEvent);
    expect(source.read(1)).toMatchObject({ hz: 0, clarity: 0 });

    input.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) } as MIDIMessageEvent);
    expect(source.read(1.1).onset).toBe(true);
    input.onmidimessage?.({ data: new Uint8Array([0x80, 60, 0]) } as MIDIMessageEvent);
    input.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) } as MIDIMessageEvent);
    expect(source.read(1.2).onset).toBe(true);
    expect(source.read(1.3).onset).toBe(false);
    source.disconnect();
  });

  it("aborts if the access request resolves after cancellation", async () => {
    let resolveAccess!: (access: MIDIAccess) => void;
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn(
        () =>
          new Promise<MIDIAccess>((resolve) => {
            resolveAccess = resolve;
          }),
      ),
    });
    const abort = new AbortController();
    const source = new MidiPitchSource();
    const connection = source.connect(abort.signal);
    abort.abort();
    resolveAccess({ inputs: new Map() } as unknown as MIDIAccess);
    await expect(connection).rejects.toMatchObject({ name: "AbortError" });
  });
});
