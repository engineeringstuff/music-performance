/**
 * Small, dependency-free music helpers used by both the game client and the
 * content tooling.
 */

export const A4_MIDI = 69;
export const A4_HZ = 440;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Convert a MIDI note number to equal-tempered frequency in Hz. */
export function midiToFrequency(midi: number, a4Hz = A4_HZ): number {
  return a4Hz * 2 ** ((midi - A4_MIDI) / 12);
}

/** Convert a frequency in Hz to a (fractional) MIDI note number. */
export function frequencyToMidi(frequency: number, a4Hz = A4_HZ): number {
  return A4_MIDI + 12 * Math.log2(frequency / a4Hz);
}

/** Format a MIDI note number as scientific pitch notation, e.g. 60 -> "C4". */
export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const pitchClass = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

/**
 * How far a measured frequency is from a target MIDI note, in cents.
 * Positive means sharp, negative means flat. 100 cents is one semitone.
 */
export function centsFromTarget(frequency: number, targetMidi: number, a4Hz = A4_HZ): number {
  return 1200 * Math.log2(frequency / midiToFrequency(targetMidi, a4Hz));
}

/** Compare two frequencies in cents. */
export function centsBetween(frequency: number, referenceFrequency: number): number {
  return 1200 * Math.log2(frequency / referenceFrequency);
}
