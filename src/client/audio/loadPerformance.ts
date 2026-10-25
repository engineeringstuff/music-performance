import type { TrackSummary } from "../../shared/domain";
import { parseTrackChart } from "../lib/validate";

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
  chart: ReturnType<typeof parseTrackChart>;
  audio: LoadedPerformanceAudio;
}

export async function loadPerformance(
  context: AudioContext,
  track: TrackSummary,
  signal: AbortSignal,
  options: { loadGuide?: boolean; transposeSemitones?: number } = {},
): Promise<LoadedPerformance> {
  const requestedTranspose = options.transposeSemitones ?? 0;
  const variant = track.audioVariants?.find(
    (candidate) => candidate.transposeSemitones === requestedTranspose,
  );
  if (track.audioVariants && !variant) {
    throw new Error(`The backing key ${requestedTranspose} is not available for this track.`);
  }
  if (!track.audioVariants && requestedTranspose !== 0) {
    throw new Error("This track does not ship pre-rendered key variants.");
  }
  const backingUrl = variant?.audioUrl ?? track.audioUrl;
  const guideUrl = variant ? variant.guideUrl : track.guideUrl;
  if (options.loadGuide && !guideUrl) {
    throw new Error(`The guide stem is not available for backing key ${requestedTranspose}.`);
  }

  const [chart, backing, guide] = await Promise.all([
    fetchJson<unknown>(track.chartUrl, signal),
    decodeAudio(context, backingUrl, signal),
    options.loadGuide && guideUrl ? decodeAudio(context, guideUrl, signal) : Promise.resolve(null),
  ]);

  const parsedChart = parseTrackChart(chart);
  if (parsedChart.trackId !== track.id) {
    throw new Error(`Chart ${parsedChart.trackId} does not match track ${track.id}`);
  }

  return { chart: parsedChart, audio: { backing, guide } };
}
