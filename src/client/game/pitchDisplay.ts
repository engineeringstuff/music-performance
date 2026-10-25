/**
 * Display-only pitch stabilisation.
 *
 * The detector produces a fresh estimate for every animation frame. Voice
 * vibrato, analysis-window overlap and the occasional octave/harmonic error
 * make those estimates move more than the player perceives. Scoring already
 * uses a median filter; the lane uses a smaller median plus a time-based
 * easing filter so the ball follows the note instead of every analysis frame.
 *
 * The ball is positioned by absolute pitch. The smoothing filter therefore
 * carries across target changes; it never resets just because the melody moves.
 * For vocals, one octave offset is chosen per run from a few notes that match
 * the target pitch class, then kept. Recomputing that offset from the current
 * target every frame makes the ball jump an octave when the chart moves.
 *
 * The lane has extra vertical headroom and the ball is clipped rather than
 * clamped, so an out-of-range input disappears instead of resting against an
 * edge.
 */

const HISTORY_LIMIT = 3;
const HOLD_SEC = 0.4;
const SMOOTHING_TIME_CONSTANT_SEC = 0.07;
const RESIDUAL_DEADBAND_SEMITONES = 0.005;
const PITCH_CLASS_TOLERANCE_CENTS = 80;
const OCTAVE_SEMITONES = 12;
const OCTAVE_VOTE_LIMIT = 8;
const OCTAVE_VOTES_REQUIRED = 4;
const OCTAVE_VOTE_MAJORITY = 3;
const LANE_MARGIN_SEMITONES = 5;
const MIN_LANE_SPAN_SEMITONES = 12;

export interface PitchLaneRange {
  minMidi: number;
  maxMidi: number;
}

/**
 * Vertical range used by the pitch lane. The margin is symmetric and wider
 * than a semitone or two so ordinary intonation errors do not sit on an edge.
 */
export function pitchLaneRange(notes: readonly { midi: number }[]): PitchLaneRange {
  if (notes.length === 0) {
    return { minMidi: 48, maxMidi: 84 };
  }
  const midis = notes.map((note) => note.midi);
  const chartMin = Math.min(...midis);
  const chartMax = Math.max(...midis);
  const span = chartMax - chartMin;
  const margin = Math.max(LANE_MARGIN_SEMITONES, (MIN_LANE_SPAN_SEMITONES - span) / 2);
  return { minMidi: chartMin - margin, maxMidi: chartMax + margin };
}

export function pitchLaneYPercent(midi: number, range: PitchLaneRange): number {
  return ((range.maxMidi - midi) / (range.maxMidi - range.minMidi)) * 100;
}

export interface PitchDisplayState {
  /** Smoothed absolute MIDI pitch shown by the ball. */
  midi: number | null;
  /** Run-level octave offset for vocals, once enough evidence has accumulated. */
  octaveShift: number | null;
  /** Octave-offset evidence, kept only until the shift locks. */
  octaveVotes: number[];
  /** Recent absolute pitch estimates before smoothing. */
  history: number[];
  lastVoicedAtSec: number | null;
}

export const INITIAL_PITCH_DISPLAY: PitchDisplayState = {
  midi: null,
  octaveShift: null,
  octaveVotes: [],
  history: [],
  lastVoicedAtSec: null,
};

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function mostCommonShift(votes: readonly number[]): { shift: number; count: number } {
  const counts = new Map<number, number>();
  for (const vote of votes) {
    counts.set(vote, (counts.get(vote) ?? 0) + 1);
  }
  let best = votes[votes.length - 1] ?? 0;
  let count = 0;
  for (const [shift, candidateCount] of counts) {
    if (candidateCount > count) {
      best = shift;
      count = candidateCount;
    }
  }
  return { shift: best, count };
}

/**
 * Update the displayed pitch.
 *
 * @param detectedMidi Absolute detected pitch, or null while unvoiced.
 * @param calibrationTargetMidi Target note at the *frame's* timestamp. This is
 *   used only to calibrate the vocal octave offset, never to move an
 *   established shift.
 * @param allowOctaveEquivalence Vocals may be shifted by whole octaves;
 *   instruments must show the octave they actually played.
 */
export function updatePitchDisplay(
  previous: PitchDisplayState,
  detectedMidi: number | null,
  calibrationTargetMidi: number,
  allowOctaveEquivalence: boolean,
  timeSec: number,
): PitchDisplayState {
  if (detectedMidi !== null && Number.isFinite(detectedMidi)) {
    let octaveShift = previous.octaveShift;
    let octaveVotes = previous.octaveVotes;

    if (!allowOctaveEquivalence) {
      octaveShift = null;
      octaveVotes = [];
    } else if (octaveShift === null) {
      const rawCents = (detectedMidi - calibrationTargetMidi) * 100;
      const pitchClassCents = rawCents - 1200 * Math.round(rawCents / 1200);
      if (Math.abs(pitchClassCents) <= PITCH_CLASS_TOLERANCE_CENTS) {
        const candidate =
          OCTAVE_SEMITONES * Math.round((calibrationTargetMidi - detectedMidi) / OCTAVE_SEMITONES);
        octaveVotes = [...octaveVotes, candidate].slice(-OCTAVE_VOTE_LIMIT);
        const winner = mostCommonShift(octaveVotes);
        if (octaveVotes.length >= OCTAVE_VOTES_REQUIRED && winner.count >= OCTAVE_VOTE_MAJORITY) {
          octaveShift = winner.shift;
          octaveVotes = [];
        }
      }
    }

    const pitch = detectedMidi + (octaveShift ?? 0);
    const history = [...previous.history, pitch].slice(-HISTORY_LIMIT);
    const target = median(history);
    let midi = target;

    if (previous.midi !== null && previous.lastVoicedAtSec !== null) {
      const elapsed = Math.min(0.1, Math.max(0.001, timeSec - previous.lastVoicedAtSec));
      const alpha = 1 - Math.exp(-elapsed / SMOOTHING_TIME_CONSTANT_SEC);
      midi = previous.midi + alpha * (target - previous.midi);
      if (Math.abs(target - midi) < RESIDUAL_DEADBAND_SEMITONES) {
        midi = target;
      }
    }

    return {
      midi,
      octaveShift,
      octaveVotes,
      history,
      lastVoicedAtSec: timeSec,
    };
  }

  if (previous.lastVoicedAtSec !== null && timeSec - previous.lastVoicedAtSec <= HOLD_SEC) {
    return previous;
  }

  const gap =
    previous.lastVoicedAtSec === null ? 0 : Math.max(0, timeSec - previous.lastVoicedAtSec);
  return {
    midi: null,
    octaveShift: previous.octaveShift,
    octaveVotes: gap > 0.5 ? [] : previous.octaveVotes,
    history: [],
    lastVoicedAtSec: null,
  };
}
