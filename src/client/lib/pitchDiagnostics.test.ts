import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPitchDiagnostics,
  isPitchDiagnosticsEnabled,
  type PitchDiagnosticsMeta,
  readPitchDiagnostics,
  recordPitchFrame,
  setPitchDiagnosticsEnabled,
  startPitchDiagnostics,
} from "./pitchDiagnostics";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    values,
  };
}

const meta: PitchDiagnosticsMeta = {
  trackId: "demo",
  instrumentId: "vocals",
  inputMode: "microphone",
  keyTranspose: 0,
  fitSemitones: 0,
  guideEnabled: false,
  echoCancellationRequested: true,
  latencyOffsetMs: 0,
  laneMinMidi: 55,
  laneMaxMidi: 74,
  deviceLabel: "Test mic",
  applied: { echoCancellation: true },
  userAgent: "test",
};

const frame = {
  t: 1,
  ft: 0.9,
  hz: 261.6,
  clarity: 0.9,
  level: 0.04,
  target: 60,
  calibration: 60,
  display: 60,
  octaveShift: 0,
  octaveVotes: 0,
  cents: 0,
  ball: true,
  y: 73.7,
  clampedY: 73.7,
  outOfRange: false,
};

let localStorageStub: ReturnType<typeof storage>;
let sessionStorageStub: ReturnType<typeof storage>;

beforeEach(() => {
  localStorageStub = storage();
  sessionStorageStub = storage();
  vi.stubGlobal("window", {
    localStorage: localStorageStub,
    sessionStorage: sessionStorageStub,
  });
  setPitchDiagnosticsEnabled(false);
  clearPitchDiagnostics();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pitch diagnostics", () => {
  it("records and reads a session only while enabled", () => {
    expect(isPitchDiagnosticsEnabled()).toBe(false);
    startPitchDiagnostics(meta);
    recordPitchFrame(frame);
    expect(readPitchDiagnostics()).toBeNull();

    setPitchDiagnosticsEnabled(true);
    startPitchDiagnostics(meta);
    recordPitchFrame(frame);
    recordPitchFrame({ ...frame, t: 2, ball: false, display: null });
    expect(readPitchDiagnostics()).toBeNull();

    // Flushing happens at a frame threshold; a short test needs an explicit flush
    // through the public reader after the loop below, so use the threshold.
    for (let index = 0; index < 298; index += 1) {
      recordPitchFrame(frame);
    }
    const captured = readPitchDiagnostics();
    expect(captured?.meta.deviceLabel).toBe("Test mic");
    expect(captured?.frames).toHaveLength(300);
    expect(captured?.frames[0]).toEqual(frame);
    expect(captured?.frames[1]?.ball).toBe(false);
  });

  it("caps a session and marks it truncated", () => {
    setPitchDiagnosticsEnabled(true);
    startPitchDiagnostics(meta);
    for (let index = 0; index < 3601; index += 1) {
      recordPitchFrame({ ...frame, t: index });
    }
    const captured = readPitchDiagnostics();
    expect(captured?.frames).toHaveLength(3600);
    expect(captured?.truncated).toBe(true);
  });

  it("stops recording when disabled but keeps the previous capture", () => {
    setPitchDiagnosticsEnabled(true);
    startPitchDiagnostics(meta);
    for (let index = 0; index < 300; index += 1) {
      recordPitchFrame({ ...frame, t: index });
    }
    expect(readPitchDiagnostics()?.frames).toHaveLength(300);

    setPitchDiagnosticsEnabled(false);
    recordPitchFrame({ ...frame, t: 301 });
    expect(readPitchDiagnostics()?.frames).toHaveLength(300);

    clearPitchDiagnostics();
    expect(readPitchDiagnostics()).toBeNull();
  });
});
