import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalPreferences,
  loadAudioSettings,
  loadLatencyOffsetMs,
  logDiagnostic,
  readDiagnostics,
  saveAudioSettings,
  saveLatencyOffsetMs,
} from "./preferences";

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
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    values,
  };
}

let localStorageStub: ReturnType<typeof storage>;
let sessionStorageStub: ReturnType<typeof storage>;

beforeEach(() => {
  localStorageStub = storage();
  sessionStorageStub = storage();
  vi.stubGlobal("window", {
    localStorage: localStorageStub,
    sessionStorage: sessionStorageStub,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preferences", () => {
  it("clamps audio and timing settings", () => {
    saveAudioSettings({ backingVolume: 2, guideVolume: -1 });
    expect(loadAudioSettings()).toEqual({ backingVolume: 1, guideVolume: 0 });

    saveLatencyOffsetMs(999);
    expect(loadLatencyOffsetMs()).toBe(250);
    saveLatencyOffsetMs(-999);
    expect(loadLatencyOffsetMs()).toBe(-250);
  });

  it("drops malformed diagnostics instead of crashing", () => {
    sessionStorageStub.setItem("music-performance:diagnostics:v1", '[null, 4, {"message":"ok"}]');
    expect(readDiagnostics()).toEqual([]);

    sessionStorageStub.setItem("music-performance:diagnostics:v1", "not-json");
    expect(readDiagnostics()).toEqual([]);

    logDiagnostic("safe");
    expect(readDiagnostics().map((entry) => entry.message)).toEqual(["safe"]);
  });

  it("clears every music-performance storage key by prefix", () => {
    localStorageStub.setItem("music-performance:profile:v1", "{}");
    localStorageStub.setItem("music-performance:audio:v1", "{}");
    localStorageStub.setItem("unrelated", "keep");
    sessionStorageStub.setItem("music-performance:last-result:v1", "{}");
    sessionStorageStub.setItem("other", "keep");

    clearLocalPreferences();

    expect([...localStorageStub.values.keys()]).toEqual(["unrelated"]);
    expect([...sessionStorageStub.values.keys()]).toEqual(["other"]);
  });
});
