import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TrackChart } from "../../src/shared/domain.ts";
import { buildChart, chartEndSec } from "./chart";
import { noteEndSeconds, noteStartSeconds, parseMidi, writeMidi } from "./midi";
import { CHART_DIR, readJson, type TrackManifest, trackDir } from "./model";

const CASES = [
  { id: "twinkle", notes: 42, minMidi: 60, maxMidi: 69, endSec: 28.8 },
  { id: "ode-to-joy", notes: 62, minMidi: 62, maxMidi: 74, endSec: 38.4 },
  { id: "greensleeves", notes: 72, minMidi: 64, maxMidi: 79, endSec: 38.8 },
  { id: "bach-minuet", notes: 127, minMidi: 62, maxMidi: 83, endSec: 41.14 },
] as const;

describe("committed charts", () => {
  it.each(CASES)("reproduces $id from melody.mid", (testCase) => {
    const directory = trackDir(testCase.id);
    const manifest = readJson<TrackManifest>(path.join(directory, "track.json"));
    const melody = readFileSync(path.join(directory, "melody.mid"));
    const committed = readJson<TrackChart>(path.join(CHART_DIR, `${testCase.id}.json`));

    const rebuilt = buildChart(manifest, melody);
    expect(rebuilt).toEqual(committed);
    expect(rebuilt.notes).toHaveLength(testCase.notes);
    expect(Math.min(...rebuilt.notes.map((note) => note.midi))).toBe(testCase.minMidi);
    expect(Math.max(...rebuilt.notes.map((note) => note.midi))).toBe(testCase.maxMidi);
    expect(chartEndSec(rebuilt)).toBeCloseTo(testCase.endSec, 2);
  });
});

function melodyMidi(notes: { startBeats: number; durationBeats: number; midi: number }[]) {
  return writeMidi({
    tempoBpm: 100,
    timeSignature: [4, 4],
    tracks: [{ name: "melody", channel: 0, notes }],
  });
}

describe("Twinkle backing", () => {
  it("does not double the melody pitch in the same octave", () => {
    const directory = trackDir("twinkle");
    const melody = parseMidi(readFileSync(path.join(directory, "melody.mid")));
    const backing = parseMidi(readFileSync(path.join(directory, "backing.mid")));
    const melodyNotes = melody.notes.map((note) => ({
      start: noteStartSeconds(melody, note),
      end: noteEndSeconds(melody, note),
      midi: note.midi,
    }));
    const backingNotes = backing.notes.map((note) => ({
      start: noteStartSeconds(backing, note),
      end: noteEndSeconds(backing, note),
      midi: note.midi,
    }));

    const overlaps = melodyNotes.filter((melodyNote) =>
      backingNotes.some(
        (backingNote) =>
          backingNote.midi === melodyNote.midi &&
          backingNote.start - 0.03 <= melodyNote.start &&
          backingNote.end + 0.03 >= melodyNote.start,
      ),
    );

    expect(overlaps).toHaveLength(0);
  });
});

describe("chart extraction", () => {
  const manifest = { id: "test", sourceInstrument: "piano" as const, tempoBpm: 100 };

  it("converts ticks using the tempo map", () => {
    const chart = buildChart(
      manifest,
      melodyMidi([{ midi: 69, startBeats: 1, durationBeats: 0.5 }]),
    );
    expect(chart.notes[0]?.startSec).toBeCloseTo(0.6, 3);
    expect(chart.notes[0]?.durationSec).toBeCloseTo(0.3, 3);
  });

  it("drops notes shorter than 80 ms", () => {
    const chart = buildChart(
      manifest,
      melodyMidi([
        { midi: 60, startBeats: 0, durationBeats: 0.05 },
        { midi: 62, startBeats: 0.5, durationBeats: 1 },
      ]),
    );
    expect(chart.notes).toHaveLength(1);
    expect(chart.notes[0]?.midi).toBe(62);
  });

  it("attaches lyrics one-per-note and rejects a length mismatch", () => {
    const midi = melodyMidi([
      { midi: 60, startBeats: 0, durationBeats: 1 },
      { midi: 62, startBeats: 1, durationBeats: 1 },
    ]);
    const chart = buildChart({ ...manifest, lyrics: ["one", "two"] }, midi);
    expect(chart.notes.map((note) => note.lyric)).toEqual(["one", "two"]);
    expect(() => buildChart({ ...manifest, lyrics: ["one"] }, midi)).toThrow(/lyrics/);
  });

  it("rejects overlapping notes", () => {
    expect(() =>
      buildChart(
        manifest,
        melodyMidi([
          { midi: 60, startBeats: 0, durationBeats: 2 },
          { midi: 62, startBeats: 1, durationBeats: 1 },
        ]),
      ),
    ).toThrow(/overlapping/);
  });
});
