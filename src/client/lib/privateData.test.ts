// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearResults: vi.fn(),
}));

vi.mock("./results", () => ({ clearResults: mocks.clearResults }));

import { clearAllLocalData } from "./privateData";

let cacheDelete: ReturnType<typeof vi.fn>;
let unregister: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mocks.clearResults.mockReset();
  cacheDelete = vi.fn(async () => true);
  unregister = vi.fn(async () => true);
  vi.stubGlobal("caches", {
    keys: vi.fn(async () => ["mp-a", "mp-b"]),
    delete: cacheDelete,
  });
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistrations: vi.fn(async () => [{ unregister }]),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clearAllLocalData", () => {
  it("attempts preferences, caches and the service worker even when results fail", async () => {
    window.localStorage.setItem("music-performance:profile:v1", "{}");
    window.sessionStorage.setItem("music-performance:last-result:v1", "{}");
    mocks.clearResults.mockRejectedValue(new Error("db down"));

    await expect(clearAllLocalData()).rejects.toThrow(/db down/);

    expect(window.localStorage.getItem("music-performance:profile:v1")).toBeNull();
    expect(window.sessionStorage.getItem("music-performance:last-result:v1")).toBeNull();
    expect(cacheDelete).toHaveBeenCalledTimes(2);
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it("completes without errors when every store succeeds", async () => {
    mocks.clearResults.mockResolvedValue(undefined);
    await expect(clearAllLocalData()).resolves.toBeUndefined();
  });
});
