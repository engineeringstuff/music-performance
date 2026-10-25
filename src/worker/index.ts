import { Hono } from "hono";
import type { ApiErrorResponse, HealthResponse, TracksResponse } from "../shared/api";
import { TRACKS } from "./catalog";

/**
 * Worker entry point.
 *
 * Static assets are served by Cloudflare before this Worker runs, except for
 * /api/* which is pinned to the Worker in wrangler.jsonc. The site is a
 * single-page app at the root; `not_found_handling: "404-page"` ensures a
 * missing audio or chart file returns a real 404 instead of index.html.
 */
const app = new Hono();

app.use("/api/*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
});

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
