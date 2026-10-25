import { describe, expect, it } from "vitest";
import { chartRange, fitRange, transposeNotes } from "./chart";
import type { NoteRange, TargetNote } from "./domain";
import { midiToFrequency } from "./music";
import {
  DEFAULT_SCORING,
  evaluateNote,
  foldOctaveCents,
  type PitchFrame,
  pitchScoreForCents,
  ratingForScore,
  scorePerformance,
  timingScoreForOnset,
} from "./scoring";

const FPS = 60;

function framesFor(
  startSec: number,
  durationSec: number,
  targetMidi: number,
  options: {
    centsOffset?: number;
    clarity?: number;
    fps?: number;
    octaveShift?: number;
    voiceUntilSec?: number;
    vibratoCents?: number;
  } = {},
): PitchFrame[] {
  const fps = options.fps ?? FPS;
  const interval = 1 / fps;
  const clarity = options.clarity ?? 0.95;
  const frames: PitchFrame[] = [];
  const end = startSec + durationSec;

  for (let time = startSec; time <= end + 1e-9; time += interval) {
    if (options.voiceUntilSec !== undefined && time > options.voiceUntilSec) {
      frames.push({ timeSec: time, hz: 0, clarity: 0 });
      continue;
    }
    const vibrato = options.vibratoCents
      ? options.vibratoCents * Math.sin((time - startSec) * 2 * Math.PI * 5)
      : 0;
    const cents = (options.centsOffset ?? 0) + vibrato;
    const frequency =
      midiToFrequency(targetMidi + (options.octaveShift ?? 0)) * 2 ** (cents / 1200);
    frames.push({ timeSec: time, hz: frequency, clarity });
  }

  return frames;
}

const note: TargetNote = { startSec: 0, durationSec: 1, midi: 69 };

describe("pitchScoreForCents", () => {
  it("gives full credit inside the perfect band", () => {
    expect(pitchScoreForCents(0)).toBe(1);
    expect(pitchScoreForCents(30)).toBe(1);
    expect(pitchScoreForCents(-30)).toBe(1);
  });

  it("falls through the wider bands", () => {
    expect(pitchScoreForCents(80)).toBeCloseTo(0.65, 6);
    expect(pitchScoreForCents(150)).toBeCloseTo(0.1, 6);
    expect(pitchScoreForCents(250)).toBe(0);
    expect(pitchScoreForCents(300)).toBe(0);
  });

  it("is symmetric for sharp and flat notes", () => {
    expect(pitchScoreForCents(70)).toBeCloseTo(pitchScoreForCents(-70), 6);
  });
});

describe("timingScoreForOnset", () => {
  it("awards full credit for a tight onset", () => {
    expect(timingScoreForOnset(0)).toBe(1);
    expect(timingScoreForOnset(0.12)).toBe(1);
  });

  it("tapers to zero at half a second", () => {
    expect(timingScoreForOnset(0.3)).toBeCloseTo(0.5, 6);
    expect(timingScoreForOnset(0.5)).toBe(0);
    expect(timingScoreForOnset(null)).toBe(0);
  });
});

describe("foldOctaveCents", () => {
  it("folds octave errors", () => {
    expect(foldOctaveCents(1200)).toBe(0);
    expect(foldOctaveCents(-1200)).toBe(0);
    expect(foldOctaveCents(1250)).toBeCloseTo(50, 6);
  });
});

describe("evaluateNote", () => {
  it("scores a perfect note", () => {
    const result = evaluateNote(note, 0, framesFor(0, 1, 69));
    expect(result.score).toBeCloseTo(100, 1);
    expect(result.rating).toBe("perfect");
    expect(result.coverage).toBeCloseTo(1, 6);
    expect(result.timingQuality).toBe(1);
  });

  it("scores silence as zero", () => {
    const result = evaluateNote(note, 0, framesFor(0, 1, 69, { clarity: 0, voiceUntilSec: -1 }));
    expect(result.score).toBe(0);
    expect(result.coverage).toBe(0);
  });

  it("accepts an octave below for vocals but not instruments", () => {
    const frames = framesFor(0, 1, 69, { octaveShift: -12 });
    const vocal = evaluateNote(note, 0, frames, { allowOctaveEquivalence: true });
    const instrument = evaluateNote(note, 0, frames, { allowOctaveEquivalence: false });
    expect(vocal.score).toBeCloseTo(100, 1);
    expect(instrument.score).toBe(0);
  });

  it("gives partial credit to a near miss", () => {
    const result = evaluateNote(note, 0, framesFor(0, 1, 69, { centsOffset: 100 }));
    expect(result.score).toBeGreaterThan(35);
    expect(result.score).toBeLessThan(60);
    expect(result.rating).toBe("miss");
  });

  it("penalises a late start", () => {
    const result = evaluateNote(note, 0, framesFor(0.2, 0.8, 69));
    expect(result.onsetErrorSec).toBeCloseTo(0.2, 1);
    expect(result.score).toBeGreaterThan(50);
    expect(result.score).toBeLessThan(80);
  });

  it("penalises a short hold", () => {
    const result = evaluateNote(note, 0, framesFor(0, 1, 69, { voiceUntilSec: 0.5 }));
    expect(result.coverage).toBeGreaterThan(0.4);
    expect(result.coverage).toBeLessThan(0.6);
    expect(result.score).toBeGreaterThan(40);
    expect(result.score).toBeLessThan(60);
  });

  it("is tolerant of vibrato", () => {
    const result = evaluateNote(note, 0, framesFor(0, 1, 69, { vibratoCents: 40 }));
    expect(result.score).toBeGreaterThan(85);
  });

  it("ignores low-confidence frames", () => {
    const result = evaluateNote(note, 0, framesFor(0, 1, 69, { clarity: 0.5 }));
    expect(result.coverage).toBe(0);
    expect(result.score).toBe(0);
  });

  it("uses the configured transposition", () => {
    const frames = framesFor(0, 1, 71);
    const result = evaluateNote(note, 0, frames, { transposeSemitones: 2 });
    expect(result.targetMidi).toBe(71);
    expect(result.score).toBeCloseTo(100, 1);
  });
});

describe("ratingForScore", () => {
  it("maps scores to labels", () => {
    expect(ratingForScore(95)).toBe("perfect");
    expect(ratingForScore(80)).toBe("great");
    expect(ratingForScore(60)).toBe("good");
    expect(ratingForScore(10)).toBe("miss");
  });
});

describe("scorePerformance", () => {
  const notes: TargetNote[] = [
    { startSec: 0, durationSec: 1, midi: 60 },
    { startSec: 1, durationSec: 1, midi: 62 },
    { startSec: 2, durationSec: 1, midi: 64 },
  ];

  it("aggregates notes, streaks and accuracy", () => {
    const frames = [
      ...framesFor(0, 1, 60),
      ...framesFor(1, 1, 62, { centsOffset: 100 }),
      ...framesFor(2, 1, 64, { clarity: 0 }),
    ];
    const result = scorePerformance(notes, frames);
    expect(result.notes).toHaveLength(3);
    expect(result.notesHit).toBe(1);
    expect(result.notesMissed).toBe(2);
    expect(result.longestStreak).toBe(1);
    expect(result.maxPoints).toBe(300);
    expect(result.accuracy).toBeGreaterThan(0.3);
    expect(result.accuracy).toBeLessThan(0.5);
  });

  it("can score only completed notes for live updates", () => {
    const frames = [...framesFor(0, 1, 60), ...framesFor(1, 1, 62)];
    const result = scorePerformance(notes, frames, undefined, 1.5);
    expect(result.notes).toHaveLength(1);
    expect(result.maxPoints).toBe(100);
    expect(result.accuracy).toBeCloseTo(1, 2);
  });

  it("returns a zero breakdown when nothing has passed", () => {
    const result = scorePerformance(notes, [], undefined, -1);
    expect(result.notes).toHaveLength(0);
    expect(result.totalPoints).toBe(0);
    expect(result.maxPoints).toBe(0);
    expect(result.accuracy).toBe(0);
  });
});

describe("chart range fitting", () => {
  const range: NoteRange = { minMidi: 48, maxMidi: 84 };

  it("reports the written range", () => {
    expect(chartRange([{ midi: 60 }, { midi: 72 }])).toEqual({ minMidi: 60, maxMidi: 72 });
    expect(chartRange([])).toBeNull();
  });

  it("leaves a fitting chart alone", () => {
    const result = fitRange([{ startSec: 0, durationSec: 1, midi: 60 }], range);
    expect(result.semitones).toBe(0);
    expect(result.outOfRangeNotes).toBe(0);
    expect(result.warning).toBeNull();
  });

  it("chooses an octave shift that fits", () => {
    const result = fitRange([{ startSec: 0, durationSec: 1, midi: 90 }], range);
    expect(result.semitones).toBe(-12);
    expect(result.outOfRangeNotes).toBe(0);
  });

  it("never uses a semitone shift that would leave the backing key", () => {
    const result = fitRange([{ startSec: 0, durationSec: 1, midi: 85 }], range);
    expect([0, -12, 12, -24, 24]).toContain(result.semitones);
  });

  it("warns when the melody is too wide for the range", () => {
    const result = fitRange(
      [
        { startSec: 0, durationSec: 1, midi: 30 },
        { startSec: 1, durationSec: 1, midi: 100 },
      ],
      range,
    );
    expect(result.outOfRangeNotes).toBeGreaterThan(0);
    expect(result.warning).not.toBeNull();
  });

  it("transposes notes without mutating the input", () => {
    const source: TargetNote[] = [{ startSec: 0, durationSec: 1, midi: 60 }];
    const transposed = transposeNotes(source, 2);
    expect(transposed[0]?.midi).toBe(62);
    expect(source[0]?.midi).toBe(60);
    expect(DEFAULT_SCORING.transposeSemitones).toBe(0);
  });
});
