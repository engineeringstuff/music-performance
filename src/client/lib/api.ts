import type { TrackChart, TrackSummary } from "../../shared/domain";
import { parseTrackChart, parseTracksResponse } from "./validate";

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

  return parseTracksResponse(await response.json());
}

/** Warm the HTTP cache with the chart and selected-key backing audio. */
export async function preloadTrack(
  track: TrackSummary,
  signal: AbortSignal,
  transposeSemitones = 0,
): Promise<TrackChart> {
  const variant = track.audioVariants?.find(
    (candidate) => candidate.transposeSemitones === transposeSemitones,
  );
  if (track.audioVariants && !variant) {
    throw new Error(`The backing key ${transposeSemitones} is not available for this track.`);
  }
  if (!track.audioVariants && transposeSemitones !== 0) {
    throw new Error("This track does not ship pre-rendered key variants.");
  }
  const [chartResponse, audioResponse] = await Promise.all([
    fetch(track.chartUrl, { signal, headers: { accept: "application/json" } }),
    fetch(variant?.audioUrl ?? track.audioUrl, { signal }),
  ]);
  if (!chartResponse.ok) {
    throw new Error(`Could not preload the chart (${chartResponse.status})`);
  }
  if (!audioResponse.ok) {
    throw new Error(`Could not preload the backing track (${audioResponse.status})`);
  }
  const chart = parseTrackChart(await chartResponse.json());
  await audioResponse.arrayBuffer();
  return chart;
}
