import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TrackChart, TrackSummary } from "../../src/shared/domain.ts";
import { TRACKS } from "../../src/worker/catalog.generated.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CONTENT = path.join(ROOT, "content");
const TRACKS_DIR = path.join(CONTENT, "tracks");
const PUBLIC = path.join(ROOT, "public");

interface Manifest {
  id: string;
  title: string;
  artist: string;
  difficulty: string;
  sourceInstrument: string;
  tempoBpm: number;
  licence: string;
  audioLicence: string;
  attribution: string;
  sourceUrl: string;
  source: string;
  sourceSha256: string;
  sourceMidi?: string;
  sourceMidiSha256?: string;
  melody: { source: string; voice: string };
  render: { kind: string; tailSec: number };
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function fail(trackId: string, message: string): never {
  throw new Error(`${trackId}: ${message}`);
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function validateLicence(trackId: string, manifest: Manifest): void {
  for (const [field, value] of [
    ["licence", manifest.licence],
    ["audioLicence", manifest.audioLicence],
  ] as const) {
    if (!value || value.trim() === "") {
      fail(trackId, `${field} is empty`);
    }
    if (/non-?commercial|\b(nc|nd|sa)\b/i.test(value)) {
      fail(trackId, `${field} is not permitted in Phase 1: ${value}`);
    }
  }
  if (!manifest.attribution?.trim()) {
    fail(trackId, "attribution is empty");
  }
  if (!/^https?:\/\//.test(manifest.sourceUrl)) {
    fail(trackId, "sourceUrl must be an absolute URL");
  }
}

function validateChart(trackId: string, chart: TrackChart, durationSec: number): void {
  if (chart.version !== 1) {
    fail(trackId, `unsupported chart version ${String(chart.version)}`);
  }
  if (chart.trackId !== trackId) {
    fail(trackId, `chart trackId is ${chart.trackId}`);
  }
  if (!Array.isArray(chart.notes) || chart.notes.length === 0) {
    fail(trackId, "chart has no notes");
  }

  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const [index, note] of chart.notes.entries()) {
    if (
      !Number.isFinite(note.startSec) ||
      !Number.isFinite(note.durationSec) ||
      !Number.isInteger(note.midi)
    ) {
      fail(trackId, `note ${index} has invalid values`);
    }
    if (note.startSec < 0 || note.durationSec <= 0) {
      fail(trackId, `note ${index} has a negative start or non-positive duration`);
    }
    if (note.startSec < previousEnd - 0.001) {
      fail(trackId, `note ${index} overlaps the previous note`);
    }
    if (note.startSec + note.durationSec > durationSec + 0.1) {
      fail(
        trackId,
        `note ${index} ends after the track duration (${note.startSec + note.durationSec} > ${durationSec})`,
      );
    }
    previousEnd = note.startSec + note.durationSec;
  }
}

function main(): void {
  const manifests = readdirSync(TRACKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(TRACKS_DIR, entry.name, "track.json"))
    .filter((file) => existsSync(file))
    .map((file) => readJson<Manifest>(file));

  if (manifests.length === 0) {
    throw new Error("No track manifests found in content/tracks");
  }
  if (TRACKS.length !== manifests.length) {
    throw new Error(
      `Catalogue has ${TRACKS.length} tracks but ${manifests.length} manifests exist; run npm run content:build`,
    );
  }

  const byId = new Map<string, TrackSummary>(TRACKS.map((track) => [track.id, track]));

  for (const manifest of manifests) {
    const trackDir = path.join(TRACKS_DIR, manifest.id);
    const sourcePath = path.join(trackDir, manifest.source);
    if (!existsSync(sourcePath)) {
      fail(manifest.id, `missing source ${manifest.source}`);
    }
    if (sha256File(sourcePath) !== manifest.sourceSha256) {
      fail(manifest.id, `source hash mismatch for ${manifest.source}`);
    }
    if (manifest.sourceMidi && manifest.sourceMidiSha256) {
      const midiPath = path.join(trackDir, manifest.sourceMidi);
      if (!existsSync(midiPath)) {
        fail(manifest.id, `missing source MIDI ${manifest.sourceMidi}`);
      }
      if (sha256File(midiPath) !== manifest.sourceMidiSha256) {
        fail(manifest.id, `source MIDI hash mismatch for ${manifest.sourceMidi}`);
      }
    }
    for (const file of ["melody.mid", "backing.mid", "track.json", "LICENSE.md"]) {
      if (!existsSync(path.join(trackDir, file))) {
        fail(manifest.id, `missing ${file}`);
      }
    }

    validateLicence(manifest.id, manifest);
    if (!["easy", "medium", "hard"].includes(manifest.difficulty)) {
      fail(manifest.id, `invalid difficulty ${manifest.difficulty}`);
    }
    if (!["vocals", "piano", "guitar", "violin", "flute"].includes(manifest.sourceInstrument)) {
      fail(manifest.id, `invalid sourceInstrument ${manifest.sourceInstrument}`);
    }

    const chartPath = path.join(PUBLIC, "charts", `${manifest.id}.json`);
    if (!existsSync(chartPath)) {
      fail(manifest.id, `missing chart ${chartPath}`);
    }
    const catalogueEntry = byId.get(manifest.id);
    if (!catalogueEntry) {
      fail(manifest.id, "missing from generated catalogue; run npm run content:build");
    }
    if (!Number.isFinite(catalogueEntry.durationSec) || catalogueEntry.durationSec <= 0) {
      fail(manifest.id, "catalogue duration must be positive");
    }
    if (catalogueEntry.title !== manifest.title) {
      fail(manifest.id, "catalogue title is stale");
    }

    for (const url of [catalogueEntry.audioUrl, catalogueEntry.guideUrl, catalogueEntry.chartUrl]) {
      if (!url) {
        continue;
      }
      const file = path.join(PUBLIC, url.replace(/^\//, ""));
      if (!existsSync(file)) {
        fail(manifest.id, `catalogue points at missing file ${url}`);
      }
    }

    const chart = readJson<TrackChart>(chartPath);
    validateChart(manifest.id, chart, catalogueEntry.durationSec);

    console.log(
      `✓ ${manifest.id}: ${chart.notes.length} notes, ${catalogueEntry.durationSec.toFixed(2)}s audio`,
    );
  }

  for (const track of TRACKS) {
    if (!manifests.some((manifest) => manifest.id === track.id)) {
      throw new Error(`Catalogue contains unknown track ${track.id}; run npm run content:build`);
    }
  }

  console.log(`Content valid: ${manifests.length} tracks.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
