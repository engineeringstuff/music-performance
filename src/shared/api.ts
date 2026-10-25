import type { TrackSummary } from "./domain";

/** GET /api/health */
export interface HealthResponse {
  ok: true;
  service: string;
  time: string;
}

/** GET /api/tracks */
export interface TracksResponse {
  tracks: TrackSummary[];
}

/** Any non-2xx API response. */
export interface ApiErrorResponse {
  error: string;
}
