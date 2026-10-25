// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ clearAllLocalData: vi.fn() }));

vi.mock("../lib/privateData", () => ({ clearAllLocalData: mocks.clearAllLocalData }));
vi.mock("../lib/preferences", () => ({ logDiagnostic: vi.fn() }));

import { ErrorBoundary } from "./ErrorBoundary";

function Exploder(): never {
  throw new Error("render exploded");
}

beforeEach(() => {
  mocks.clearAllLocalData.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders the recovery screen for a render error", () => {
    render(
      <ErrorBoundary>
        <Exploder />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "The stage stopped." })).toBeTruthy();
    expect(screen.getByText(/No audio was uploaded/)).toBeTruthy();
  });

  it("reports a clear-data failure without reloading", async () => {
    mocks.clearAllLocalData.mockRejectedValue(new Error("caches blocked"));
    render(
      <ErrorBoundary>
        <Exploder />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear local data & reload" }));
    expect(await screen.findByText("caches blocked")).toBeTruthy();
  });
});
