import type { Instrument } from "./domain";

/**
 * The Phase 1 instrument roster.
 *
 * Ranges are written pitch, not concert pitch, and are intentionally
 * conservative: they describe a comfortable amateur range rather than the full
 * capability of the instrument. Scoring will use these ranges to transpose a
 * track into a playable key.
 */
export const INSTRUMENTS: readonly Instrument[] = [
  {
    id: "vocals",
    name: "Vocals",
    description: "Sing or hum the melody. Any voice type is welcome.",
    range: { minMidi: 48, maxMidi: 84 },
  },
  {
    id: "piano",
    name: "Piano",
    description: "Play the melody on any keyboard or piano.",
    range: { minMidi: 48, maxMidi: 84 },
  },
  {
    id: "guitar",
    name: "Guitar",
    description: "Single-note lines, acoustic or electric.",
    range: { minMidi: 40, maxMidi: 88 },
  },
  {
    id: "violin",
    name: "Violin",
    description: "Bowed single-note lines.",
    range: { minMidi: 55, maxMidi: 100 },
  },
  {
    id: "flute",
    name: "Flute",
    description: "Concert flute, single-note lines.",
    range: { minMidi: 60, maxMidi: 96 },
  },
];

export function getInstrument(id: string): Instrument | undefined {
  return INSTRUMENTS.find((instrument) => instrument.id === id);
}
