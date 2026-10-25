// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadLastConfig, loadProfile, saveLastConfig, saveProfile } from "./storage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("storage", () => {
  it("round-trips a valid profile and last config", () => {
    saveProfile("Player");
    saveLastConfig({ instrumentId: "violin", trackId: "ode" });
    expect(loadProfile()).toEqual({ name: "Player" });
    expect(loadLastConfig()).toEqual({ instrumentId: "violin", trackId: "ode" });
  });

  it("rejects empty names, corrupt JSON and unknown instruments", () => {
    expect(loadProfile()).toBeNull();
    saveProfile("   ");
    expect(loadProfile()).toBeNull();

    window.localStorage.setItem("music-performance:profile:v1", "{bad");
    expect(loadProfile()).toBeNull();

    window.localStorage.setItem(
      "music-performance:last-config:v1",
      JSON.stringify({ instrumentId: "theremin", trackId: "ode" }),
    );
    expect(loadLastConfig()).toBeNull();

    window.localStorage.setItem("music-performance:last-config:v1", "null");
    expect(loadLastConfig()).toBeNull();
  });
});
