import type { TargetNote } from "./domain";
import { midiToFrequency } from "./music";

/** A pitch sample produced by the microphone detector. */
export interface PitchFrame {
  /** Seconds from the start of the backing track. */
  timeSec: number;
  /** Detected frequency in Hz. Zero when no pitch was found. */
  hz: number;
  /** Detector confidence in the range 0..1. */
  clarity: number;
}

export type NoteRating = "perfect" | "great" | "good" | "miss";

export interface ScoringOptions {
  /** Applied to every target note before comparison. */
  transposeSemitones?: number;
  /** Fold octave errors into the same pitch class (vocals). */
  allowOctaveEquivalence?: boolean;
  clarityThreshold?: number;
  /** Skip the attack of a note for pitch quality. */
  attackSkipSec?: number;
  /** Skip the release of a note for pitch quality. */
  releaseSkipSec?: number;
  onsetEarlySec?: number;
  onsetLateSec?: number;
  perfectCents?: number;
  goodCents?: number;
  edgeCents?: number;
  missCents?: number;
  perfectOnsetSec?: number;
  goodOnsetSec?: number;
  missOnsetSec?: number;
}

export interface ResolvedScoringOptions {
  transposeSemitones: number;
  allowOctaveEquivalence: boolean;
  clarityThreshold: number;
  attackSkipSec: number;
  releaseSkipSec: number;
  onsetEarlySec: number;
  onsetLateSec: number;
  perfectCents: number;
  goodCents: number;
  edgeCents: number;
  missCents: number;
  perfectOnsetSec: number;
  goodOnsetSec: number;
  missOnsetSec: number;
}

export const DEFAULT_SCORING: ResolvedScoringOptions = {
  transposeSemitones: 0,
  allowOctaveEquivalence: false,
  clarityThreshold: 0.75,
  attackSkipSec: 0.08,
  releaseSkipSec: 0.05,
  onsetEarlySec: 0.3,
  onsetLateSec: 0.5,
  perfectCents: 30,
  goodCents: 80,
  edgeCents: 150,
  missCents: 250,
  perfectOnsetSec: 0.12,
  goodOnsetSec: 0.3,
  missOnsetSec: 0.5,
};

export interface NoteEvaluation {
  index: number;
  targetMidi: number;
  pitchQuality: number;
  timingQuality: number;
  coverage: number;
  score: number;
  rating: NoteRating;
  onsetErrorSec: number | null;
}

export interface ScoreBreakdown {
  notes: NoteEvaluation[];
  totalPoints: number;
  maxPoints: number;
  accuracy: number;
  notesHit: number;
  notesMissed: number;
  evaluatedNotes: number;
  longestStreak: number;
  meanPitchQuality: number;
  meanTimingQuality: number;
  meanCoverage: number;
}

function resolveOptions(options: ScoringOptions = {}): ResolvedScoringOptions {
  return { ...DEFAULT_SCORING, ...options };
}

export function foldOctaveCents(cents: number): number {
  return cents - 1200 * Math.round(cents / 1200);
}

function centsFromFrequency(frequencyHz: number, targetMidi: number): number {
  return 1200 * Math.log2(frequencyHz / midiToFrequency(targetMidi));
}

export function pitchScoreForCents(cents: number, options: ScoringOptions = {}): number {
  const resolved = resolveOptions(options);
  const distance = Math.abs(cents);
  if (distance <= resolved.perfectCents) {
    return 1;
  }
  if (distance <= resolved.goodCents) {
    const span = resolved.goodCents - resolved.perfectCents;
    return 1 - (0.35 * (distance - resolved.perfectCents)) / span;
  }
  if (distance <= resolved.edgeCents) {
    const span = resolved.edgeCents - resolved.goodCents;
    return 0.65 - (0.55 * (distance - resolved.goodCents)) / span;
  }
  if (distance <= resolved.missCents) {
    const span = resolved.missCents - resolved.edgeCents;
    return 0.1 - (0.1 * (distance - resolved.edgeCents)) / span;
  }
  return 0;
}

export function timingScoreForOnset(
  onsetErrorSec: number | null,
  options: ScoringOptions = {},
): number {
  if (onsetErrorSec === null) {
    return 0;
  }
  const resolved = resolveOptions(options);
  const distance = Math.abs(onsetErrorSec);
  if (distance <= resolved.perfectOnsetSec) {
    return 1;
  }
  if (distance <= resolved.goodOnsetSec) {
    const span = resolved.goodOnsetSec - resolved.perfectOnsetSec;
    return 1 - (0.5 * (distance - resolved.perfectOnsetSec)) / span;
  }
  if (distance <= resolved.missOnsetSec) {
    const span = resolved.missOnsetSec - resolved.goodOnsetSec;
    return 0.5 - (0.5 * (distance - resolved.goodOnsetSec)) / span;
  }
  return 0;
}

export function ratingForScore(score: number): NoteRating {
  if (score >= 90) {
    return "perfect";
  }
  if (score >= 75) {
    return "great";
  }
  if (score >= 50) {
    return "good";
  }
  return "miss";
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function smoothCents(cents: number[], windowSize = 5): number[] {
  if (cents.length <= 2) {
    return cents;
  }
  const half = Math.floor(windowSize / 2);
  return cents.map((_, index) =>
    median(cents.slice(Math.max(0, index - half), Math.min(cents.length, index + half + 1))),
  );
}

/**
 * Score one chart note against the pitch frames for a performance.
 *
 * The note window is `[start, end]`. Frames outside that window are ignored.
 * Notes with no detected frames score zero.
 */
export function evaluateNote(
  note: TargetNote,
  index: number,
  frames: readonly PitchFrame[],
  options: ScoringOptions = {},
): NoteEvaluation {
  const resolved = resolveOptions(options);
  const targetMidi = note.midi + resolved.transposeSemitones;
  const start = note.startSec;
  const end = note.startSec + note.durationSec;

  const windowFrames = frames.filter((frame) => frame.timeSec >= start && frame.timeSec <= end);
  const voicedWindow = windowFrames.filter(
    (frame) => frame.clarity >= resolved.clarityThreshold && frame.hz > 0,
  );
  const coverage = windowFrames.length === 0 ? 0 : voicedWindow.length / windowFrames.length;

  const attack =
    note.durationSec >= 0.25 ? Math.min(resolved.attackSkipSec, note.durationSec * 0.3) : 0;
  const release =
    note.durationSec >= 0.25 ? Math.min(resolved.releaseSkipSec, note.durationSec * 0.2) : 0;
  const bodyStart = start + attack;
  const bodyEnd = end - release;
  const bodyFrames = frames.filter(
    (frame) =>
      frame.timeSec >= bodyStart &&
      frame.timeSec <= bodyEnd &&
      frame.clarity >= resolved.clarityThreshold &&
      frame.hz > 0,
  );

  let pitchQuality = 0;
  if (bodyFrames.length > 0) {
    const cents = bodyFrames.map((frame) => {
      const raw = centsFromFrequency(frame.hz, targetMidi);
      return resolved.allowOctaveEquivalence ? foldOctaveCents(raw) : raw;
    });
    const smoothed = smoothCents(cents);
    pitchQuality =
      smoothed.reduce((sum, value) => sum + pitchScoreForCents(value, resolved), 0) /
      smoothed.length;
  }

  const onsetStart = start - resolved.onsetEarlySec;
  const onsetEnd = start + resolved.onsetLateSec;
  let onsetErrorSec: number | null = null;
  let bestOnsetDistance = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    if (frame.timeSec < onsetStart || frame.timeSec > onsetEnd) {
      continue;
    }
    if (frame.clarity < resolved.clarityThreshold || frame.hz <= 0) {
      continue;
    }
    const raw = centsFromFrequency(frame.hz, targetMidi);
    const cents = resolved.allowOctaveEquivalence ? foldOctaveCents(raw) : raw;
    // Accept a near-miss onset so that a slightly out-of-tune note still gets
    // partial credit instead of failing outright. The note's pitch quality
    // still carries the penalty.
    if (pitchScoreForCents(cents, resolved) < 0.25) {
      continue;
    }
    const error = frame.timeSec - start;
    const distance = Math.abs(error);
    if (distance < bestOnsetDistance) {
      bestOnsetDistance = distance;
      onsetErrorSec = error;
    }
  }

  const timingQuality = timingScoreForOnset(onsetErrorSec, resolved);
  const score = 100 * pitchQuality * timingQuality * coverage;

  return {
    index,
    targetMidi,
    pitchQuality,
    timingQuality,
    coverage,
    score,
    rating: ratingForScore(score),
    onsetErrorSec,
  };
}

/**
 * Score a set of chart notes. For live updates, pass `upToTimeSec` to include
 * only notes that have fully passed; the maximum is then based on those notes.
 */
export function scorePerformance(
  notes: readonly TargetNote[],
  frames: readonly PitchFrame[],
  options: ScoringOptions = {},
  upToTimeSec?: number,
): ScoreBreakdown {
  const evaluations: NoteEvaluation[] = [];

  for (const [index, note] of notes.entries()) {
    if (upToTimeSec !== undefined && note.startSec + note.durationSec > upToTimeSec) {
      continue;
    }
    evaluations.push(evaluateNote(note, index, frames, options));
  }

  const totalPoints = evaluations.reduce((sum, evaluation) => sum + evaluation.score, 0);
  const maxPoints = evaluations.length * 100;
  const notesHit = evaluations.filter((evaluation) => evaluation.score >= 50).length;
  const notesMissed = evaluations.length - notesHit;

  let longestStreak = 0;
  let currentStreak = 0;
  for (const evaluation of evaluations) {
    if (evaluation.score >= 50) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const mean = (pick: (evaluation: NoteEvaluation) => number): number =>
    evaluations.length === 0
      ? 0
      : evaluations.reduce((sum, evaluation) => sum + pick(evaluation), 0) / evaluations.length;

  return {
    notes: evaluations,
    totalPoints,
    maxPoints,
    accuracy: maxPoints === 0 ? 0 : totalPoints / maxPoints,
    notesHit,
    notesMissed,
    evaluatedNotes: evaluations.length,
    longestStreak,
    meanPitchQuality: mean((evaluation) => evaluation.pitchQuality),
    meanTimingQuality: mean((evaluation) => evaluation.timingQuality),
    meanCoverage: mean((evaluation) => evaluation.coverage),
  };
}
