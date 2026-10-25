import { Hono } from "hono";
import type { ApiErrorResponse, HealthResponse, TracksResponse } from "../shared/api";
import { TRACKS } from "./catalog";

/**
 * Worker entry point.
 *
 * Static assets are served by Cloudflare before this Worker runs, except for
 * /api/* which is pinned to the Worker in wrangler.jsonc. Everything here is
 * same-origin JSON; no CORS middleware is needed.
 */
const app = new Hono();

app.get("/api/health", (c) => {
  const body: HealthResponse = {
    ok: true,
    service: "music-performance",
    time: new Date().toISOString(),
  };
  return c.json(body);
});

app.get("/api/tracks", (c) => {
  const body: TracksResponse = { tracks: TRACKS };
  return c.json(body);
});

app.notFound((c) => {
  const body: ApiErrorResponse = { error: "Not found" };
  return c.json(body, 404);
});

export default app;
