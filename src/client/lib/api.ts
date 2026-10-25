import type { TracksResponse } from "../../shared/api";
import type { TrackSummary } from "../../shared/domain";

/**
 * Fetch the backing-track catalogue from the Worker.
 *
 * Charts and audio are intentionally not fetched here; they will be loaded
 * when a performance starts.
 */
export async function fetchTracks(signal?: AbortSignal): Promise<TrackSummary[]> {
  const response = await fetch("/api/tracks", {
    headers: { accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Track catalogue request failed (${response.status})`);
  }

  const body = (await response.json()) as TracksResponse;
  return body.tracks;
}
