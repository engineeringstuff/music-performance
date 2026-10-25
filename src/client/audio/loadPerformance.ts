import type { TrackChart, TrackSummary } from "../../shared/domain";

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal });
  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status})`);
  }
  return (await response.json()) as T;
}

async function decodeAudio(
  context: AudioContext,
  url: string,
  signal: AbortSignal,
): Promise<AudioBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Could not load audio ${url} (${response.status})`);
  }
  const data = await response.arrayBuffer();
  return context.decodeAudioData(data);
}

export interface LoadedPerformanceAudio {
  backing: AudioBuffer;
  guide: AudioBuffer | null;
}

export interface LoadedPerformance {
  chart: TrackChart;
  audio: LoadedPerformanceAudio;
}

export async function loadPerformance(
  context: AudioContext,
  track: TrackSummary,
  signal: AbortSignal,
): Promise<LoadedPerformance> {
  const [chart, backing, guide] = await Promise.all([
    fetchJson<TrackChart>(track.chartUrl, signal),
    decodeAudio(context, track.audioUrl, signal),
    track.guideUrl ? decodeAudio(context, track.guideUrl, signal) : Promise.resolve(null),
  ]);

  if (chart.trackId !== track.id) {
    throw new Error(`Chart ${chart.trackId} does not match track ${track.id}`);
  }

  return { chart, audio: { backing, guide } };
}
