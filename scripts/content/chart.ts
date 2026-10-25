import type { Buffer } from "node:buffer";
import type { TrackChart } from "../../src/shared/domain.ts";
import { noteEndSeconds, noteStartSeconds, parseMidi } from "./midi.ts";
import type { TrackManifest } from "./model.ts";

export type ChartSource = Pick<
  TrackManifest,
  "id" | "sourceInstrument" | "tempoBpm" | "keySignature" | "lyrics"
>;

export function buildChart(manifest: ChartSource, melodyMidi: Buffer): TrackChart {
  const parsed = parseMidi(melodyMidi);
  if (parsed.notes.length === 0) {
    throw new Error(`${manifest.id}: melody.mid has no notes`);
  }

  interface BuiltNote {
    startSec: number;
    durationSec: number;
    midi: number;
    lyric?: string;
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
    if (previous && startSec < previous.startSec + previous.durationSec - 0.005) {
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

  if (manifest.lyrics) {
    if (manifest.lyrics.length !== notes.length) {
      throw new Error(
        `${manifest.id}: ${manifest.lyrics.length} lyrics but ${notes.length} chart notes`,
      );
    }
    for (const [index, lyric] of manifest.lyrics.entries()) {
      const note = notes[index];
      if (note) {
        note.lyric = lyric;
      }
    }
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

export function chartEndSec(chart: TrackChart): number {
  return Math.max(...chart.notes.map((note) => note.startSec + note.durationSec));
}
