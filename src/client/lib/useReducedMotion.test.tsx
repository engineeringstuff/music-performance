// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "./useReducedMotion";

let listener: (() => void) | null = null;
let matches = false;

beforeEach(() => {
  matches = false;
  listener = null;
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_event: string, callback: () => void) => {
      listener = callback;
    },
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useReducedMotion", () => {
  it("tracks the media query", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    matches = true;
    act(() => listener?.());
    expect(result.current).toBe(true);
  });

  it("reads an initially reduced preference", () => {
    matches = true;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });
});
