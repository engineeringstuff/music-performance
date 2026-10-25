import { describe, expect, it } from "vitest";
import app from "./index";

describe("Worker API", () => {
  it("returns a health payload", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("music-performance");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns the catalogue", async () => {
    const response = await app.request("/api/tracks");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      tracks: { id: string; audioUrl: string; chartUrl: string }[];
    };
    expect(body.tracks).toHaveLength(4);
    expect(body.tracks.map((track) => track.id)).toEqual([
      "twinkle",
      "greensleeves",
      "ode-to-joy",
      "bach-minuet",
    ]);
    for (const track of body.tracks) {
      expect(track.audioUrl).toMatch(/^\/audio\//);
      expect(track.chartUrl).toMatch(/^\/charts\//);
    }
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const response = await app.request("/api/nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
