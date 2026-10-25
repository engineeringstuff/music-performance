import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { TrackSummary } from "../../src/shared/domain.ts";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const CONTENT = path.join(ROOT, "content");
export const TRACKS_DIR = path.join(CONTENT, "tracks");
export const AUDIO_DIR = path.join(ROOT, "public", "audio");
export const CHART_DIR = path.join(ROOT, "public", "charts");
export const NOTICES_PATH = path.join(ROOT, "public", "THIRD_PARTY_NOTICES.txt");
export const SOUNDFONT = path.join(CONTENT, "soundfont", "FluidR3Mono_GM.sf3");
export const SOUNDFONT_SHA = "2aacd036d7058d40a371846ef2f5dc5f130d648ab3837fe2626591ba49a71254";
export const LOCK_PATH = path.join(CONTENT, "content.lock.json");
export const LOCK_VERSION = 1;

export interface VoiceNote {
  midi: number;
  startBeats: number;
  durationBeats: number;
}

export interface VoicesFile {
  tempoBpm: number;
  timeSignature: [number, number];
  voices: Record<string, VoiceNote[]>;
}

export type RenderConfig =
  | {
      kind: "voices";
      voicesFile: string;
      guideVoices: string[];
      backingVoices: string[];
      tailSec: number;
    }
  | {
      kind: "tracks";
      source: string;
      melodyTracks: number[];
      backingTracks: number[];
      tailSec: number;
    };

export interface TrackManifest {
  id: string;
  title: string;
  artist: string;
  difficulty: "easy" | "medium" | "hard";
  sourceInstrument: "vocals" | "piano" | "guitar" | "violin" | "flute";
  keySignature?: string;
  tempoBpm: number;
  licence: string;
  audioLicence: string;
  attribution: string;
  sourceUrl: string;
  source: string;
  sourceSha256: string;
  sourceMidi?: string;
  sourceMidiSha256?: string;
  soundfont?: string;
  /** General MIDI program used for generated voices (0..127). */
  program?: number;
  /** Pre-rendered key transpositions; must include 0. */
  transpositions?: number[];
  /** Optional lyrics, one entry per chart note. */
  lyrics?: string[];
  melody: { source: string; voice: string };
  render: RenderConfig;
}

export interface TrackVariantArtifact {
  transposeSemitones: number;
  backingMp3Sha256: string;
  guideMp3Sha256: string;
  audioDurationSec: number;
}

export interface TrackArtifacts {
  sourceSha256: string;
  renderConfigSha256: string;
  sourceMidiSha256?: string;
  voicesSha256?: string;
  melodySha256: string;
  backingMidiSha256: string;
  chartSha256: string;
  backingMp3Sha256: string;
  guideMp3Sha256: string;
  audioDurationSec: number;
  durationSec: number;
  variants: TrackVariantArtifact[];
}

export interface TrackLock {
  artifacts: TrackArtifacts;
  catalogue: TrackSummary;
}

export interface ContentLock {
  version: number;
  tracks: Record<string, TrackLock>;
}

export function sha256Buffer(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Value(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function sha256File(file: string): string {
  return sha256Buffer(readFileSync(file));
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function trackDir(id: string): string {
  return path.join(TRACKS_DIR, id);
}

export function listManifests(): { manifest: TrackManifest; directory: string }[] {
  return readdirSync(TRACKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(TRACKS_DIR, entry.name, "track.json"))
    .filter((manifestPath) => existsSync(manifestPath))
    .map((manifestPath) => ({
      manifest: readJson<TrackManifest>(manifestPath),
      directory: path.dirname(manifestPath),
    }));
}

export function readLock(): ContentLock | null {
  if (!existsSync(LOCK_PATH)) {
    return null;
  }
  return readJson<ContentLock>(LOCK_PATH);
}
