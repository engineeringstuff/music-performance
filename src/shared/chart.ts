import type { NoteRange, TargetNote } from "./domain";

export interface RangeFit {
  semitones: number;
  outOfRangeNotes: number;
  warning: string | null;
}

/** The written MIDI range covered by a set of notes. */
export function chartRange(notes: readonly Pick<TargetNote, "midi">[]): NoteRange | null {
  if (notes.length === 0) {
    return null;
  }
  let minMidi = notes[0]?.midi ?? 0;
  let maxMidi = minMidi;
  for (const note of notes) {
    minMidi = Math.min(minMidi, note.midi);
    maxMidi = Math.max(maxMidi, note.midi);
  }
  return { minMidi, maxMidi };
}

function countOutOfRange(notes: readonly TargetNote[], range: NoteRange, shift: number): number {
  let count = 0;
  for (const note of notes) {
    const midi = note.midi + shift;
    if (midi < range.minMidi || midi > range.maxMidi) {
      count += 1;
    }
  }
  return count;
}

/**
 * Choose an octave transposition that keeps the melody inside the
 * instrument's comfortable range. Phase 1 only shifts by octaves because the
 * backing audio is not pitch-shifted; a semitone transposition would move the
 * target out of the backing track's key.
 */
export function fitRange(notes: readonly TargetNote[], range: NoteRange): RangeFit {
  const octaveShifts = [0, -12, 12, -24, 24];
  let best: RangeFit = {
    semitones: 0,
    outOfRangeNotes: countOutOfRange(notes, range, 0),
    warning: null,
  };
  let bestCost = Number.POSITIVE_INFINITY;

  for (const shift of octaveShifts) {
    const outOfRange = countOutOfRange(notes, range, shift);
    const cost = outOfRange * 1000 + Math.abs(shift);
    if (cost < bestCost) {
      bestCost = cost;
      best = { semitones: shift, outOfRangeNotes: outOfRange, warning: null };
    }
  }

  if (best.outOfRangeNotes > 0) {
    best.warning =
      "This melody spans more than the instrument's comfortable range; the chart stays in its original octave.";
  }
  return best;
}

export function transposeNotes(notes: readonly TargetNote[], semitones: number): TargetNote[] {
  if (semitones === 0) {
    return notes.map((note) => ({ ...note }));
  }
  return notes.map((note) => ({ ...note, midi: note.midi + semitones }));
}
