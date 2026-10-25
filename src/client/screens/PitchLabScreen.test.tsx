// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  read: vi.fn(() => ({ timeSec: 0, hz: 440, clarity: 0.95, level: 0.2 })),
}));

vi.mock("../audio/pitch", () => ({
  MicrophonePitchSource: class {
    connect = mocks.connect;
    disconnect = mocks.disconnect;
    read = mocks.read;
  },
}));

import { PitchLabScreen } from "./PitchLabScreen";

beforeEach(() => {
  mocks.connect.mockReset();
  mocks.disconnect.mockReset();
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 0;
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => undefined);
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PitchLabScreen", () => {
  it("aborts a pending microphone connection when unmounted", async () => {
    let signal: AbortSignal | undefined;
    mocks.connect.mockImplementation((abortSignal?: AbortSignal) => {
      signal = abortSignal;
      return new Promise<void>((_resolve, reject) => {
        abortSignal?.addEventListener("abort", () =>
          reject(new DOMException("cancelled", "AbortError")),
        );
      });
    });

    const view = render(<PitchLabScreen onBack={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));
    await Promise.resolve();

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);

    view.unmount();
    expect(signal?.aborted).toBe(true);
    expect(mocks.disconnect).toHaveBeenCalled();
  });

  it("aborts when the Back button is used during startup", async () => {
    mocks.connect.mockImplementation(
      (abortSignal?: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          abortSignal?.addEventListener("abort", () =>
            reject(new DOMException("cancelled", "AbortError")),
          );
        }),
    );
    const onBack = vi.fn();

    render(<PitchLabScreen onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));
    await Promise.resolve();
    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(onBack).toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalled();
  });
});
