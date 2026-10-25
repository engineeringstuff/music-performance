// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countResults: vi.fn(),
  clearAllLocalData: vi.fn(),
}));

vi.mock("../lib/results", () => ({ countResults: mocks.countResults }));
vi.mock("../lib/privateData", () => ({ clearAllLocalData: mocks.clearAllLocalData }));

import { SettingsScreen } from "./SettingsScreen";

beforeEach(() => {
  mocks.countResults.mockReset();
  mocks.clearAllLocalData.mockReset();
  mocks.countResults.mockResolvedValue(2);
  mocks.clearAllLocalData.mockResolvedValue(undefined);
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("SettingsScreen", () => {
  it("shows storage counts, confirms clear and focuses the confirmation action", async () => {
    const onCleared = vi.fn();
    render(<SettingsScreen onBack={vi.fn()} onCleared={onCleared} />);

    expect(await screen.findByText(/2 local performance results/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear local data" }));
    await waitFor(() => expect(document.activeElement?.textContent).toContain("Remove everything"));
    fireEvent.click(screen.getByRole("button", { name: "Remove everything" }));
    await waitFor(() => expect(mocks.clearAllLocalData).toHaveBeenCalledTimes(1));
    expect(onCleared).toHaveBeenCalled();
  });

  it("persists audio and timing settings", () => {
    render(<SettingsScreen onBack={vi.fn()} onCleared={vi.fn()} />);
    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(3);
    const [backing, guide, offset] = sliders;
    if (!backing || !guide || !offset) {
      throw new Error("Expected three settings sliders");
    }
    fireEvent.change(backing, { target: { value: "25" } });
    fireEvent.change(guide, { target: { value: "75" } });
    fireEvent.change(offset, { target: { value: "-50" } });

    expect(window.localStorage.getItem("music-performance:audio:v1")).toContain("0.25");
    expect(window.localStorage.getItem("music-performance:latency:v1")).toContain("-50");
  });

  it("reports a partial clear failure without navigating away", async () => {
    mocks.clearAllLocalData.mockRejectedValue(new Error("caches blocked"));
    const onCleared = vi.fn();
    render(<SettingsScreen onBack={vi.fn()} onCleared={onCleared} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear local data" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove everything" }));
    expect(await screen.findByText("caches blocked")).toBeTruthy();
    expect(onCleared).not.toHaveBeenCalled();
  });
});
