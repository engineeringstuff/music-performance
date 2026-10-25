import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TrackChart, TrackSummary } from "../../src/shared/domain.ts";
import {
  extractTracks,
  noteEndSeconds,
  noteStartSeconds,
  parseMidi,
  type WriteTrack,
  writeMidi,
} from "./midi.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CONTENT = path.join(ROOT, "content");
const TRACKS_DIR = path.join(CONTENT, "tracks");
const AUDIO_DIR = path.join(ROOT, "public", "audio");
const CHART_DIR = path.join(ROOT, "public", "charts");
const SOUNDFONT = path.join(CONTENT, "soundfont", "FluidR3Mono_GM.sf3");
const SOUNDFONT_SHA = "2aacd036d7058d40a371846ef2f5dc5f130d648ab3837fe2626591ba49a71254";

interface VoiceNote {
  midi: number;
  startBeats: number;
  durationBeats: number;
}

interface VoicesFile {
  tempoBpm: number;
  timeSignature: [number, number];
  voices: Record<string, VoiceNote[]>;
}

interface TrackManifest {
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
  melody: { source: string; voice: string };
  render:
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
}

interface TrackBuild {
  manifest: TrackManifest;
  chart: TrackChart;
  durationSec: number;
  hasGuide: boolean;
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
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
): void {
  const tracks: WriteTrack[] = voiceNames.map((name, index) => {
    const notes = voices.voices[name];
    if (!notes) {
      throw new Error(`Voice "${name}" is missing from voices.json`);
    }
    return {
      name,
      channel: (startChannel + index) % 16,
      program: 0,
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

function generateMidiFiles(manifest: TrackManifest, trackDir: string): void {
  const melodyPath = path.join(trackDir, "melody.mid");
  const backingPath = path.join(trackDir, "backing.mid");

  if (manifest.render.kind === "voices") {
    const voices = readJson<VoicesFile>(path.join(trackDir, manifest.render.voicesFile));
    if (voices.tempoBpm !== manifest.tempoBpm) {
      throw new Error(
        `${manifest.id}: tempo mismatch between track.json (${manifest.tempoBpm}) and voices.json (${voices.tempoBpm})`,
      );
    }
    buildVoicesMidi(voices, manifest.render.guideVoices, melodyPath, 0);
    buildVoicesMidi(voices, manifest.render.backingVoices, backingPath, 1);
    return;
  }

  const sourcePath = path.join(trackDir, manifest.render.source);
  const source = readFileSync(sourcePath);
  writeFileSync(melodyPath, extractTracks(source, manifest.render.melodyTracks));
  writeFileSync(backingPath, extractTracks(source, manifest.render.backingTracks));
}

function buildChart(manifest: TrackManifest, melodyPath: string): TrackChart {
  const parsed = parseMidi(readFileSync(melodyPath));
  if (parsed.notes.length === 0) {
    throw new Error(`${manifest.id}: melody.mid has no notes`);
  }

  interface BuiltNote {
    startSec: number;
    durationSec: number;
    midi: number;
  }

  const notes: BuiltNote[] = [];

  for (const note of parsed.notes) {
    const startSec = noteStartSeconds(parsed, note);
    const endSec = noteEndSeconds(parsed, note);
    const durationSec = endSec - startSec;
    if (durationSec < 0.08) {
      continue;
    }

    const previous = notes.at(-1);
    if (previous && startSec < previous.startSec + previous.durationSec - 0.001) {
      throw new Error(
        `${manifest.id}: overlapping melody notes at ${startSec.toFixed(3)}s (${previous.midi} -> ${note.midi})`,
      );
    }

    notes.push({
      startSec: Math.round(startSec * 1000) / 1000,
      durationSec: Math.round(durationSec * 1000) / 1000,
      midi: note.midi,
    });
  }

  if (notes.length === 0) {
    throw new Error(`${manifest.id}: no chart notes survived filtering`);
  }

  return {
    version: 1,
    trackId: manifest.id,
    sourceInstrument: manifest.sourceInstrument,
    tempoBpm: manifest.tempoBpm,
    ...(manifest.keySignature ? { keySignature: manifest.keySignature } : {}),
    notes,
  };
}

function renderStem(
  midiPath: string,
  outputPath: string,
  durationSec: number,
  tempDir: string,
  label: string,
): void {
  const wavPath = path.join(tempDir, `${label}.wav`);
  run(
    "fluidsynth",
    ["-ni", "-F", wavPath, "-r", "44100", "-g", "0.7", SOUNDFONT, midiPath],
    `${label} FluidSynth render`,
  );

  const fade = Math.min(0.15, durationSec / 4);
  const filter = [
    `afade=t=out:st=${Math.max(0, durationSec - fade).toFixed(3)}:d=${fade.toFixed(3)}`,
    "loudnorm=I=-18:TP=-1.5:LRA=11",
  ].join(",");

  run(
    "ffmpeg",
    [
      "-y",
      "-i",
      wavPath,
      "-t",
      durationSec.toFixed(3),
      "-af",
      filter,
      "-ar",
      "44100",
      "-ac",
      "2",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "128k",
      outputPath,
    ],
    `${label} MP3 encode`,
  );
}

function buildTrack(manifest: TrackManifest, tempDir: string): TrackBuild {
  const trackDir = path.join(TRACKS_DIR, manifest.id);
  const sourcePath = path.join(trackDir, manifest.source);
  if (!existsSync(sourcePath)) {
    throw new Error(`${manifest.id}: missing source file ${manifest.source}`);
  }
  if (sha256File(sourcePath) !== manifest.sourceSha256) {
    throw new Error(`${manifest.id}: source hash mismatch for ${manifest.source}`);
  }
  if (manifest.sourceMidi && manifest.sourceMidiSha256) {
    const sourceMidiPath = path.join(trackDir, manifest.sourceMidi);
    if (sha256File(sourceMidiPath) !== manifest.sourceMidiSha256) {
      throw new Error(`${manifest.id}: source MIDI hash mismatch`);
    }
  }

  console.log(`Building ${manifest.id}…`);
  generateMidiFiles(manifest, trackDir);

  const melodyPath = path.join(trackDir, "melody.mid");
  const backingPath = path.join(trackDir, "backing.mid");
  const chart = buildChart(manifest, melodyPath);
  const chartEnd = Math.max(...chart.notes.map((note) => note.startSec + note.durationSec));
  const durationSec = Math.ceil((chartEnd + manifest.render.tailSec) * 1000) / 1000;

  const backingMp3 = path.join(AUDIO_DIR, `${manifest.id}.backing.mp3`);
  const guideMp3 = path.join(AUDIO_DIR, `${manifest.id}.guide.mp3`);
  mkdirSync(AUDIO_DIR, { recursive: true });
  mkdirSync(CHART_DIR, { recursive: true });

  renderStem(backingPath, backingMp3, durationSec, tempDir, `${manifest.id}-backing`);
  renderStem(melodyPath, guideMp3, durationSec, tempDir, `${manifest.id}-guide`);

  writeJson(path.join(CHART_DIR, `${manifest.id}.json`), chart);

  const backingDuration = ffprobeDuration(backingMp3);
  const guideDuration = ffprobeDuration(guideMp3);
  const finalDuration = Math.round(Math.min(backingDuration, guideDuration) * 1000) / 1000;

  if (finalDuration + 0.05 < chartEnd) {
    throw new Error(
      `${manifest.id}: rendered audio (${finalDuration}s) is shorter than the chart (${chartEnd}s)`,
    );
  }

  console.log(
    `  ${chart.notes.length} notes, chart ends ${chartEnd.toFixed(2)}s, audio ${finalDuration.toFixed(2)}s`,
  );

  return { manifest, chart, durationSec: finalDuration, hasGuide: true };
}

function writeCatalogue(tracks: TrackBuild[]): void {
  const order = { easy: 0, medium: 1, hard: 2 };
  tracks.sort(
    (a, b) =>
      order[a.manifest.difficulty] - order[b.manifest.difficulty] ||
      a.manifest.title.localeCompare(b.manifest.title),
  );

  const entries: TrackSummary[] = tracks.map(({ manifest, durationSec, hasGuide }) => ({
    id: manifest.id,
    title: manifest.title,
    artist: manifest.artist,
    durationSec,
    difficulty: manifest.difficulty,
    licence: manifest.licence,
    attribution: manifest.attribution,
    sourceUrl: manifest.sourceUrl,
    audioUrl: `/audio/${manifest.id}.backing.mp3`,
    ...(hasGuide ? { guideUrl: `/audio/${manifest.id}.guide.mp3` } : {}),
    chartUrl: `/charts/${manifest.id}.json`,
    ...(manifest.keySignature ? { keySignature: manifest.keySignature } : {}),
    tempoBpm: manifest.tempoBpm,
  }));

  const output = [
    "// Generated by `npm run content:build`. Do not edit by hand.",
    'import type { TrackSummary } from "../shared/domain";',
    "",
    `export const TRACKS: TrackSummary[] = ${JSON.stringify(entries, null, 2)};`,
    "",
  ].join("\n");

  writeFileSync(path.join(ROOT, "src", "worker", "catalog.generated.ts"), output);
  console.log(`Wrote ${entries.length} catalogue entries.`);
}

function main(): void {
  checkTooling();
  const tempDir = mkdtempSync(path.join(tmpdir(), "music-performance-content-"));
  try {
    const manifestPaths = readdirSync(TRACKS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(TRACKS_DIR, entry.name, "track.json"))
      .filter((manifestPath) => existsSync(manifestPath));

    if (manifestPaths.length === 0) {
      throw new Error("No track manifests found in content/tracks");
    }

    const builds = manifestPaths.map((manifestPath) =>
      buildTrack(readJson<TrackManifest>(manifestPath), tempDir),
    );
    writeCatalogue(builds);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
