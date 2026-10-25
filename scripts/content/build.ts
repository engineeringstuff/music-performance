import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildCatalogueEntry, compareCatalogue, renderCatalogue } from "./catalogue.ts";
import { buildChart, chartEndSec } from "./chart.ts";
import { isAllowedAudioLicence, isAllowedLicence, licencePolicyMessage } from "./licence.ts";
import { extractTracks, type WriteTrack, writeMidi } from "./midi.ts";
import {
  AUDIO_DIR,
  CHART_DIR,
  type ContentLock,
  LOCK_PATH,
  LOCK_VERSION,
  listManifests,
  ROOT,
  readJson,
  SOUNDFONT,
  SOUNDFONT_SHA,
  sha256File,
  sha256Value,
  type TrackArtifacts,
  type TrackLock,
  type TrackManifest,
  trackDir,
  type VoicesFile,
  writeJson,
} from "./model.ts";

interface TrackBuild {
  manifest: TrackManifest;
  lock: TrackLock;
}

function run(command: string, args: string[], label: string): void {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status}):\n${result.stderr || result.stdout}`);
  }
}

function ffprobeDuration(file: string): number {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`ffprobe failed for ${file}: ${result.stderr}`);
  }
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read duration of ${file}`);
  }
  return duration;
}

function checkTooling(): void {
  if (!existsSync(SOUNDFONT)) {
    throw new Error(
      `Missing soundfont at ${SOUNDFONT}. See content/SOUNDFONT-LICENSE.md for the download command.`,
    );
  }
  if (sha256File(SOUNDFONT) !== SOUNDFONT_SHA) {
    throw new Error(
      `Soundfont SHA-256 mismatch. Expected ${SOUNDFONT_SHA}. See content/SOUNDFONT-LICENSE.md.`,
    );
  }
  for (const tool of ["fluidsynth", "ffmpeg", "ffprobe"]) {
    if (spawnSync(tool, ["--version"], { encoding: "utf8" }).error) {
      throw new Error(`Required content tool not found: ${tool}`);
    }
  }
}

function buildVoicesMidi(
  voices: VoicesFile,
  voiceNames: string[],
  output: string,
  startChannel: number,
  program: number,
): void {
  const tracks: WriteTrack[] = voiceNames.map((name, index) => {
    const notes = voices.voices[name];
    if (!notes) {
      throw new Error(`Voice "${name}" is missing from voices.json`);
    }
    return {
      name,
      channel: (startChannel + index) % 16,
      program,
      notes,
    };
  });

  const midi = writeMidi({
    tempoBpm: voices.tempoBpm,
    timeSignature: voices.timeSignature,
    tracks,
  });
  writeFileSync(output, midi);
}

function generateMidiFiles(
  manifest: TrackManifest,
  directory: string,
  outputDirectory: string,
): void {
  mkdirSync(outputDirectory, { recursive: true });
  const melodyPath = path.join(outputDirectory, "melody.mid");
  const backingPath = path.join(outputDirectory, "backing.mid");

  if (manifest.render.kind === "voices") {
    const voices = readJson<VoicesFile>(path.join(directory, manifest.render.voicesFile));
    if (voices.tempoBpm !== manifest.tempoBpm) {
      throw new Error(
        `${manifest.id}: tempo mismatch between track.json (${manifest.tempoBpm}) and voices.json (${voices.tempoBpm})`,
      );
    }
    const program = manifest.program ?? 0;
    if (!Number.isInteger(program) || program < 0 || program > 127) {
      throw new Error(`${manifest.id}: program must be an integer 0..127`);
    }
    buildVoicesMidi(voices, manifest.render.guideVoices, melodyPath, 0, program);
    buildVoicesMidi(voices, manifest.render.backingVoices, backingPath, 1, program);
    return;
  }

  const sourcePath = path.join(directory, manifest.render.source);
  const source = readFileSync(sourcePath);
  writeFileSync(melodyPath, extractTracks(source, manifest.render.melodyTracks));
  writeFileSync(backingPath, extractTracks(source, manifest.render.backingTracks));
}

function renderWav(midiPath: string, wavPath: string, label: string): void {
  run(
    "fluidsynth",
    ["-ni", "-F", wavPath, "-r", "44100", "-g", "0.7", SOUNDFONT, midiPath],
    `${label} FluidSynth render`,
  );
}

function encodeWav(
  wavPath: string,
  outputPath: string,
  durationSec: number,
  label: string,
  transposeSemitones: number,
  metadata: { title: string; artist: string; comment: string },
): void {
  const fade = Math.min(0.15, durationSec / 4);
  const filters: string[] = [];
  if (transposeSemitones !== 0) {
    const ratio = 2 ** (transposeSemitones / 12);
    filters.push(
      `asetrate=44100*${ratio.toFixed(10)}`,
      "aresample=44100",
      `atempo=${(1 / ratio).toFixed(10)}`,
    );
  }
  filters.push(
    `afade=t=out:st=${Math.max(0, durationSec - fade).toFixed(3)}:d=${fade.toFixed(3)}`,
    "loudnorm=I=-18:TP=-1.5:LRA=11",
  );

  run(
    "ffmpeg",
    [
      "-y",
      "-i",
      wavPath,
      "-t",
      durationSec.toFixed(3),
      "-af",
      filters.join(","),
      "-ar",
      "44100",
      "-ac",
      "2",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "128k",
      "-id3v2_version",
      "3",
      "-metadata",
      `title=${metadata.title}`,
      "-metadata",
      `artist=${metadata.artist}`,
      "-metadata",
      "album=Music Performance",
      "-metadata",
      `comment=${metadata.comment}`,
      outputPath,
    ],
    `${label} MP3 encode (${transposeSemitones} st)`,
  );
}

function roundSeconds(value: number): number {
  return Math.ceil(value * 1000) / 1000;
}

function buildTrack(
  manifest: TrackManifest,
  tempDir: string,
  audioDir: string,
  chartDir: string,
  midiDir: string,
): TrackBuild {
  if (!isAllowedLicence(manifest.licence)) {
    throw new Error(`${manifest.id}: licence is not permitted. ${licencePolicyMessage()}`);
  }
  if (!isAllowedAudioLicence(manifest.audioLicence)) {
    throw new Error(`${manifest.id}: audioLicence must be public domain or CC0`);
  }
  if (!manifest.attribution.trim() || !/^https?:\/\//.test(manifest.sourceUrl)) {
    throw new Error(`${manifest.id}: attribution and an absolute sourceUrl are required`);
  }

  if (!/^[a-z0-9-]+$/.test(manifest.id)) {
    throw new Error(`${manifest.id}: id must be lowercase kebab-case`);
  }
  const directory = trackDir(manifest.id);
  if (path.basename(directory) !== manifest.id) {
    throw new Error(`${manifest.id}: manifest id does not match its directory`);
  }
  const sourcePath = path.join(directory, manifest.source);
  if (!existsSync(sourcePath)) {
    throw new Error(`${manifest.id}: missing source file ${manifest.source}`);
  }
  const sourceSha256 = sha256File(sourcePath);
  if (sourceSha256 !== manifest.sourceSha256) {
    throw new Error(`${manifest.id}: source hash mismatch for ${manifest.source}`);
  }

  let sourceMidiSha256: string | undefined;
  if (manifest.sourceMidi && manifest.sourceMidiSha256) {
    const sourceMidiPath = path.join(directory, manifest.sourceMidi);
    sourceMidiSha256 = sha256File(sourceMidiPath);
    if (sourceMidiSha256 !== manifest.sourceMidiSha256) {
      throw new Error(`${manifest.id}: source MIDI hash mismatch`);
    }
  } else if (manifest.sourceMidi || manifest.sourceMidiSha256) {
    throw new Error(`${manifest.id}: sourceMidi and sourceMidiSha256 must be provided together`);
  }

  let voicesSha256: string | undefined;
  if (manifest.render.kind === "voices") {
    const voicesPath = path.join(directory, manifest.render.voicesFile);
    if (!existsSync(voicesPath)) {
      throw new Error(`${manifest.id}: missing voices file ${manifest.render.voicesFile}`);
    }
    voicesSha256 = sha256File(voicesPath);
  }

  console.log(`Building ${manifest.id}…`);
  const midiOutput = path.join(midiDir, manifest.id);
  generateMidiFiles(manifest, directory, midiOutput);

  const melodyPath = path.join(midiOutput, "melody.mid");
  const backingPath = path.join(midiOutput, "backing.mid");
  const melodyMidi = readFileSync(melodyPath);
  const chart = buildChart(manifest, melodyMidi);
  const endSec = chartEndSec(chart);
  const durationSec = roundSeconds(endSec + 0.5);
  const renderDuration = roundSeconds(endSec + manifest.render.tailSec);

  mkdirSync(audioDir, { recursive: true });
  mkdirSync(chartDir, { recursive: true });
  const chartPath = path.join(chartDir, `${manifest.id}.json`);
  const hasGuide =
    manifest.render.kind === "voices" ? manifest.render.guideVoices.length > 0 : true;
  const transpositions = manifest.transpositions ?? [0];
  if (!transpositions.includes(0)) {
    throw new Error(`${manifest.id}: transpositions must include 0`);
  }
  if (new Set(transpositions).size !== transpositions.length) {
    throw new Error(`${manifest.id}: duplicate transposition`);
  }
  for (const transpose of transpositions) {
    if (!Number.isInteger(transpose) || Math.abs(transpose) > 12) {
      throw new Error(`${manifest.id}: transposition ${transpose} must be an integer in -12..12`);
    }
  }

  const backingWav = path.join(tempDir, `${manifest.id}-backing.wav`);
  const guideWav = path.join(tempDir, `${manifest.id}-guide.wav`);
  renderWav(backingPath, backingWav, `${manifest.id}-backing`);
  if (hasGuide) {
    renderWav(melodyPath, guideWav, `${manifest.id}-guide`);
  }
  writeJson(chartPath, chart);

  const variants = transpositions.map((transpose) => {
    const suffix = transpose === 0 ? "" : `.t${transpose}`;
    const backingMp3 = path.join(audioDir, `${manifest.id}.backing${suffix}.mp3`);
    const guideMp3 = path.join(audioDir, `${manifest.id}.guide${suffix}.mp3`);
    const metadata = {
      title: manifest.title,
      artist: manifest.artist,
      comment: `Licence: ${manifest.licence}. Rendered audio ${manifest.audioLicence}. Soundfont and track notices: /THIRD_PARTY_NOTICES.txt`,
    };
    encodeWav(backingWav, backingMp3, renderDuration, manifest.id, transpose, metadata);
    if (hasGuide) {
      encodeWav(guideWav, guideMp3, renderDuration, manifest.id, transpose, metadata);
    }
    const backingDuration = ffprobeDuration(backingMp3);
    const guideDuration = hasGuide ? ffprobeDuration(guideMp3) : backingDuration;
    const audioDurationSec = Math.round(Math.min(backingDuration, guideDuration) * 1000) / 1000;
    if (audioDurationSec + 0.05 < endSec) {
      throw new Error(`${manifest.id} (${transpose} st): rendered audio is shorter than the chart`);
    }
    if (audioDurationSec + 0.05 < durationSec) {
      throw new Error(
        `${manifest.id} (${transpose} st): rendered audio is shorter than the performance`,
      );
    }
    return {
      transposeSemitones: transpose,
      backingMp3Sha256: sha256File(backingMp3),
      guideMp3Sha256: hasGuide ? sha256File(guideMp3) : "",
      audioDurationSec,
    };
  });

  const base = variants.find((variant) => variant.transposeSemitones === 0);
  if (!base) {
    throw new Error(`${manifest.id}: missing zero-transpose variant`);
  }

  console.log(
    `  ${chart.notes.length} notes, chart ends ${endSec.toFixed(2)}s, ${variants.length} key(s), audio ${base.audioDurationSec.toFixed(2)}s`,
  );

  const renderConfigSha256 = sha256Value({
    program: manifest.program ?? 0,
    transpositions,
    render: manifest.render,
    lyrics: manifest.lyrics ?? null,
    melody: manifest.melody,
    tempoBpm: manifest.tempoBpm,
    keySignature: manifest.keySignature ?? null,
    sourceInstrument: manifest.sourceInstrument,
  });

  const artifacts: TrackArtifacts = {
    sourceSha256,
    renderConfigSha256,
    ...(sourceMidiSha256 ? { sourceMidiSha256 } : {}),
    ...(voicesSha256 ? { voicesSha256 } : {}),
    melodySha256: sha256File(melodyPath),
    backingMidiSha256: sha256File(backingPath),
    chartSha256: sha256File(chartPath),
    backingMp3Sha256: base.backingMp3Sha256,
    guideMp3Sha256: base.guideMp3Sha256,
    audioDurationSec: base.audioDurationSec,
    durationSec,
    variants,
  };

  return {
    manifest,
    lock: {
      artifacts,
      catalogue: buildCatalogueEntry(manifest, durationSec, hasGuide),
    },
  };
}

function writeCatalogue(builds: TrackBuild[]): void {
  builds.sort((a, b) => compareCatalogue(a.lock.catalogue, b.lock.catalogue));
  const entries = builds.map((build) => build.lock.catalogue);
  writeFileSync(path.join(ROOT, "src", "worker", "catalog.generated.ts"), renderCatalogue(entries));

  const lock: ContentLock = {
    version: LOCK_VERSION,
    tracks: Object.fromEntries(builds.map((build) => [build.manifest.id, build.lock])),
  };
  writeJson(LOCK_PATH, lock);
  console.log(`Wrote ${entries.length} catalogue entries and content.lock.json.`);
}

function publishDirectory(staging: string, target: string): void {
  const backup = `${target}.content-backup`;
  rmSync(backup, { recursive: true, force: true });
  if (existsSync(target)) {
    renameSync(target, backup);
  }
  try {
    renameSync(staging, target);
    rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (existsSync(backup) && !existsSync(target)) {
      renameSync(backup, target);
    }
    throw new Error(`Could not publish ${path.basename(target)}: ${String(error)}`);
  }
}

function main(): void {
  checkTooling();
  const tempDir = mkdtempSync(path.join(tmpdir(), "music-performance-content-"));
  const stagingRoot = path.join(ROOT, ".content-build");
  const stagingAudio = path.join(stagingRoot, "audio");
  const stagingCharts = path.join(stagingRoot, "charts");
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingAudio, { recursive: true });
  mkdirSync(stagingCharts, { recursive: true });

  try {
    const manifests = listManifests();
    if (manifests.length === 0) {
      throw new Error("No track manifests found in content/tracks");
    }
    const stagingMidi = path.join(stagingRoot, "midi");
    const builds = manifests.map(({ manifest }) =>
      buildTrack(manifest, tempDir, stagingAudio, stagingCharts, stagingMidi),
    );

    // Publish generated MIDI only after every track has built successfully.
    for (const { manifest } of builds) {
      const sourceDir = path.join(stagingMidi, manifest.id);
      const targetDir = trackDir(manifest.id);
      for (const file of ["melody.mid", "backing.mid"]) {
        renameSync(path.join(sourceDir, file), path.join(targetDir, file));
      }
    }

    publishDirectory(stagingAudio, AUDIO_DIR);
    publishDirectory(stagingCharts, CHART_DIR);
    writeCatalogue(builds);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

main();
