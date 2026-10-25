import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { TrackChart, TrackSummary } from "../../src/shared/domain.ts";
import { TRACKS } from "../../src/worker/catalog.generated.ts";
import { buildCatalogueEntry, compareCatalogue } from "./catalogue.ts";
import { buildChart, chartEndSec } from "./chart.ts";
import { isAllowedAudioLicence, isAllowedLicence, licencePolicyMessage } from "./licence.ts";
import {
  AUDIO_DIR,
  CHART_DIR,
  LOCK_VERSION,
  listManifests,
  NOTICES_PATH,
  readJson,
  readLock,
  sha256File,
  sha256Value,
  type TrackLock,
  type TrackManifest,
} from "./model.ts";

function fail(id: string, message: string): never {
  throw new Error(`${id}: ${message}`);
}

function assertDeepEqual(id: string, actual: unknown, expected: unknown, label: string): void {
  if (!isDeepStrictEqual(actual, expected)) {
    fail(id, `${label} is stale or does not match`);
  }
}

function assertHash(id: string, file: string, expected: string, label: string): void {
  if (!existsSync(file)) {
    fail(id, `missing ${label} (${file})`);
  }
  const actual = sha256File(file);
  if (actual !== expected) {
    fail(id, `${label} hash mismatch; run npm run content:build`);
  }
}

function verifyLicence(manifest: TrackManifest): void {
  if (!isAllowedLicence(manifest.licence)) {
    fail(manifest.id, `licence is not permitted. ${licencePolicyMessage()}`);
  }
  if (!isAllowedAudioLicence(manifest.audioLicence)) {
    fail(manifest.id, "audioLicence must be public domain or CC0");
  }
  if (!manifest.attribution.trim() || !/^https?:\/\//.test(manifest.sourceUrl)) {
    fail(manifest.id, "attribution and an absolute sourceUrl are required");
  }
  if (!manifest.soundfont?.trim()) {
    fail(manifest.id, "soundfont attribution is required");
  }
  if (!["easy", "medium", "hard"].includes(manifest.difficulty)) {
    fail(manifest.id, `invalid difficulty ${String(manifest.difficulty)}`);
  }
  if (!["vocals", "piano", "guitar", "violin", "flute"].includes(manifest.sourceInstrument)) {
    fail(manifest.id, `invalid sourceInstrument ${String(manifest.sourceInstrument)}`);
  }
}

function verifyChartShape(manifest: TrackManifest, chart: TrackChart, durationSec: number): void {
  if (chart.version !== 1) {
    fail(manifest.id, `unsupported chart version ${String(chart.version)}`);
  }
  if (chart.trackId !== manifest.id) {
    fail(manifest.id, `chart trackId is ${chart.trackId}`);
  }
  if (!Array.isArray(chart.notes) || chart.notes.length === 0) {
    fail(manifest.id, "chart has no notes");
  }

  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const [index, note] of chart.notes.entries()) {
    if (
      !Number.isFinite(note.startSec) ||
      !Number.isFinite(note.durationSec) ||
      !Number.isInteger(note.midi)
    ) {
      fail(manifest.id, `note ${index} has invalid values`);
    }
    if (note.startSec < 0 || note.durationSec <= 0) {
      fail(manifest.id, `note ${index} has an invalid start or duration`);
    }
    if (note.startSec < previousEnd - 0.005) {
      fail(manifest.id, `note ${index} overlaps the previous note`);
    }
    if (note.startSec + note.durationSec > durationSec + 0.1) {
      fail(manifest.id, `note ${index} ends after the performance duration`);
    }
    previousEnd = note.startSec + note.durationSec;
  }
}

function verifyTrack(
  manifest: TrackManifest,
  directory: string,
  lockTrack: TrackLock,
): TrackSummary {
  verifyLicence(manifest);
  if (!/^[a-z0-9-]+$/.test(manifest.id) || path.basename(directory) !== manifest.id) {
    fail(manifest.id, "manifest id must be lowercase kebab-case and match its directory");
  }

  const sourcePath = path.join(directory, manifest.source);
  if (sha256File(sourcePath) !== manifest.sourceSha256) {
    fail(manifest.id, `source hash mismatch for ${manifest.source}`);
  }
  if (lockTrack.artifacts.sourceSha256 !== manifest.sourceSha256) {
    fail(manifest.id, "lock source hash mismatch");
  }
  const expectedRenderConfig = sha256Value({
    program: manifest.program ?? 0,
    transpositions: manifest.transpositions ?? [0],
    render: manifest.render,
    lyrics: manifest.lyrics ?? null,
    melody: manifest.melody,
    tempoBpm: manifest.tempoBpm,
    keySignature: manifest.keySignature ?? null,
    sourceInstrument: manifest.sourceInstrument,
  });
  if (lockTrack.artifacts.renderConfigSha256 !== expectedRenderConfig) {
    fail(manifest.id, "render configuration changed; run npm run content:build");
  }
  const licenceDocument = readFileSync(path.join(directory, "LICENSE.md"), "utf8");
  if (licenceDocument.trim().length === 0) {
    fail(manifest.id, "LICENSE.md is empty");
  }
  const notices = readFileSync(NOTICES_PATH, "utf8");
  if (!notices.includes(manifest.title)) {
    fail(manifest.id, `third-party notices do not mention ${manifest.title}`);
  }

  if (manifest.sourceMidi && manifest.sourceMidiSha256) {
    assertHash(
      manifest.id,
      path.join(directory, manifest.sourceMidi),
      manifest.sourceMidiSha256,
      "source MIDI",
    );
    if (lockTrack.artifacts.sourceMidiSha256 !== manifest.sourceMidiSha256) {
      fail(manifest.id, "lock source MIDI hash mismatch");
    }
  } else if (manifest.sourceMidi || manifest.sourceMidiSha256) {
    fail(manifest.id, "sourceMidi and sourceMidiSha256 must be provided together");
  }

  if (manifest.render.kind === "voices") {
    const voicesPath = path.join(directory, manifest.render.voicesFile);
    const expected = lockTrack.artifacts.voicesSha256;
    if (!expected) {
      fail(manifest.id, "lock is missing the voices hash");
    }
    assertHash(manifest.id, voicesPath, expected, "voices.json");
  } else if (lockTrack.artifacts.voicesSha256) {
    fail(manifest.id, "lock has an unexpected voices hash");
  }

  const melodyPath = path.join(directory, "melody.mid");
  const backingPath = path.join(directory, "backing.mid");
  assertHash(manifest.id, melodyPath, lockTrack.artifacts.melodySha256, "melody.mid");
  assertHash(manifest.id, backingPath, lockTrack.artifacts.backingMidiSha256, "backing.mid");

  const chartPath = path.join(CHART_DIR, `${manifest.id}.json`);
  assertHash(manifest.id, chartPath, lockTrack.artifacts.chartSha256, "chart");
  const chart = readJson<TrackChart>(chartPath);
  const rebuilt = buildChart(manifest, readFileSync(melodyPath));
  assertDeepEqual(manifest.id, chart, rebuilt, "chart");

  const endSec = chartEndSec(rebuilt);
  const expectedDuration = Math.ceil((endSec + 0.5) * 1000) / 1000;
  if (lockTrack.artifacts.durationSec !== expectedDuration) {
    fail(manifest.id, `lock duration ${lockTrack.artifacts.durationSec} != ${expectedDuration}`);
  }
  if (lockTrack.artifacts.audioDurationSec + 0.05 < endSec) {
    fail(manifest.id, "rendered audio is shorter than the chart");
  }
  if (lockTrack.artifacts.audioDurationSec + 0.05 < lockTrack.artifacts.durationSec) {
    fail(manifest.id, "rendered audio is shorter than the performance duration");
  }
  verifyChartShape(manifest, chart, lockTrack.artifacts.durationSec);

  const hasGuide = Boolean(lockTrack.catalogue.guideUrl);
  const expectedCatalogue = buildCatalogueEntry(
    manifest,
    lockTrack.artifacts.durationSec,
    hasGuide,
  );
  assertDeepEqual(manifest.id, lockTrack.catalogue, expectedCatalogue, "lock catalogue entry");

  const backingMp3 = path.join(AUDIO_DIR, `${manifest.id}.backing.mp3`);
  assertHash(manifest.id, backingMp3, lockTrack.artifacts.backingMp3Sha256, "backing MP3");
  const guideMp3 = path.join(AUDIO_DIR, `${manifest.id}.guide.mp3`);
  if (hasGuide) {
    assertHash(manifest.id, guideMp3, lockTrack.artifacts.guideMp3Sha256, "guide MP3");
  } else if (lockTrack.artifacts.guideMp3Sha256 !== "") {
    fail(manifest.id, "lock has a guide hash but no guide URL");
  }

  if (lockTrack.catalogue.guideUrl && lockTrack.artifacts.guideMp3Sha256) {
    if (
      !lockTrack.artifacts.variants.every(
        (variant) =>
          variant.guideMp3Sha256 &&
          lockTrack.catalogue.audioVariants?.some(
            (candidate) =>
              candidate.transposeSemitones === variant.transposeSemitones && candidate.guideUrl,
          ),
      )
    ) {
      fail(manifest.id, "a guide-enabled track is missing a guide for a key variant");
    }
  }

  const variants = lockTrack.artifacts.variants;
  if (!Array.isArray(variants) || variants.length === 0) {
    fail(manifest.id, "lock is missing audio key variants");
  }
  if (!variants.some((variant) => variant.transposeSemitones === 0)) {
    fail(manifest.id, "lock variants must include the original key");
  }
  if (new Set(variants.map((variant) => variant.transposeSemitones)).size !== variants.length) {
    fail(manifest.id, "duplicate key variant");
  }

  for (const variant of variants) {
    const catalogueVariant = lockTrack.catalogue.audioVariants?.find(
      (candidate) => candidate.transposeSemitones === variant.transposeSemitones,
    );
    if (!catalogueVariant) {
      fail(manifest.id, `missing catalogue variant ${variant.transposeSemitones}`);
    }
    const backingFile = path.join(AUDIO_DIR, catalogueVariant.audioUrl.replace(/^\/audio\//, ""));
    assertHash(manifest.id, backingFile, variant.backingMp3Sha256, "variant backing MP3");
    if (variant.guideMp3Sha256) {
      if (!catalogueVariant.guideUrl) {
        fail(manifest.id, "variant has a guide hash but no guide URL");
      }
      const guideFile = path.join(AUDIO_DIR, catalogueVariant.guideUrl.replace(/^\/audio\//, ""));
      assertHash(manifest.id, guideFile, variant.guideMp3Sha256, "variant guide MP3");
    }
    if (variant.audioDurationSec + 0.05 < lockTrack.artifacts.durationSec) {
      fail(manifest.id, `variant ${variant.transposeSemitones} is shorter than the performance`);
    }
  }

  const baseVariant = variants.find((variant) => variant.transposeSemitones === 0);
  if (
    baseVariant &&
    (baseVariant.backingMp3Sha256 !== lockTrack.artifacts.backingMp3Sha256 ||
      baseVariant.guideMp3Sha256 !== lockTrack.artifacts.guideMp3Sha256)
  ) {
    fail(manifest.id, "base audio hashes do not match the zero-transpose variant");
  }

  const entry = TRACKS.find((track) => track.id === manifest.id);
  if (!entry) {
    fail(manifest.id, "missing from generated catalogue; run npm run content:build");
  }
  assertDeepEqual(manifest.id, entry, lockTrack.catalogue, "generated catalogue entry");

  console.log(
    `✓ ${manifest.id}: ${chart.notes.length} notes, ${lockTrack.artifacts.durationSec.toFixed(2)}s`,
  );
  return entry;
}

function main(): void {
  if (!existsSync(NOTICES_PATH)) {
    throw new Error("Missing public/THIRD_PARTY_NOTICES.txt");
  }

  const lock = readLock();
  if (!lock) {
    throw new Error("Missing content/content.lock.json; run npm run content:build");
  }
  if (lock.version !== LOCK_VERSION) {
    throw new Error(`Unsupported content lock version ${lock.version}`);
  }

  const manifests = listManifests();
  if (manifests.length === 0) {
    throw new Error("No track manifests found in content/tracks");
  }
  if (manifests.length !== Object.keys(lock.tracks).length) {
    throw new Error("Content lock has a different number of tracks; run npm run content:build");
  }

  const entries = manifests.map(({ manifest, directory }) => {
    const lockTrack = lock.tracks[manifest.id];
    if (!lockTrack) {
      fail(manifest.id, "missing from content lock; run npm run content:build");
    }
    return verifyTrack(manifest, directory, lockTrack);
  });

  const expectedEntries = [...entries].sort(compareCatalogue);
  assertDeepEqual("catalogue", TRACKS, expectedEntries, "generated catalogue");

  const unknown = Object.keys(lock.tracks).filter(
    (id) => !manifests.some(({ manifest }) => manifest.id === id),
  );
  if (unknown.length > 0) {
    throw new Error(`Content lock contains unknown tracks: ${unknown.join(", ")}`);
  }

  console.log(`Content valid: ${manifests.length} tracks.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
