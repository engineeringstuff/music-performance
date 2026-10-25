import { describe, expect, it } from "vitest";
import type { TargetNote } from "../../shared/domain";
import { findNoteIndex } from "./usePerformance";

const notes: TargetNote[] = [
  { startSec: 0, durationSec: 0.5, midi: 60 },
  { startSec: 0.5, durationSec: 0.5, midi: 62 },
  { startSec: 3, durationSec: 0.5, midi: 64 },
];

describe("findNoteIndex", () => {
  it("handles boundaries and adjacent notes", () => {
    expect(findNoteIndex(notes, 0)).toBe(0);
    expect(findNoteIndex(notes, 0.5)).toBe(0);
    expect(findNoteIndex(notes, 0.51)).toBe(1);
    expect(findNoteIndex(notes, 1.01)).toBeNull();
  });

  it("does not treat a distant future note as the current target", () => {
    expect(findNoteIndex(notes, 1.5)).toBeNull();
    expect(findNoteIndex(notes, 2.4)).toBeNull();
    expect(findNoteIndex(notes, 2.6)).toBe(2);
  });

  it("returns null after the last note's grace period", () => {
    expect(findNoteIndex(notes, 3.4)).toBe(2);
    expect(findNoteIndex(notes, 3.6)).toBe(2);
    expect(findNoteIndex(notes, 4.1)).toBeNull();
  });
});
