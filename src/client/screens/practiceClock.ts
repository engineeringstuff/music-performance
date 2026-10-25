export interface PracticeClock {
  lastTime: number;
  nextBeat: number;
}

export function createPracticeClock(timeSec: number, bpm: number): PracticeClock {
  return {
    lastTime: timeSec,
    nextBeat: Math.ceil(timeSec * (bpm / 60) - 0.0001),
  };
}

export interface PracticeClockStep {
  clock: PracticeClock;
  click: boolean;
  looped: boolean;
}

/** Advance the practice beat/metronome state from the master media clock. */
export function advancePracticeClock(
  clock: PracticeClock,
  timeSec: number,
  bpm: number,
): PracticeClockStep {
  const looped = timeSec < clock.lastTime - 0.5;
  const beat = timeSec * (bpm / 60);
  let nextBeat = looped ? Math.floor(timeSec * (bpm / 60)) : clock.nextBeat;
  let click = false;

  if (beat >= nextBeat) {
    click = true;
    nextBeat = Math.floor(beat) + 1;
  }

  return {
    clock: { lastTime: timeSec, nextBeat },
    click,
    looped,
  };
}
