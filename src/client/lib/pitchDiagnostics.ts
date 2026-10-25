const ENABLED_KEY = "music-performance:pitch-diagnostics:enabled:v1";
const DATA_KEY = "music-performance:pitch-diagnostics:data:v1";
const MAX_FRAMES = 3600;
const FLUSH_EVERY_FRAMES = 300;

export interface PitchDiagnosticsMeta {
  trackId: string;
  instrumentId: string;
  inputMode: string;
  keyTranspose: number;
  fitSemitones: number;
  guideEnabled: boolean;
  echoCancellationRequested: boolean;
  latencyOffsetMs: number;
  laneMinMidi: number;
  laneMaxMidi: number;
  deviceLabel: string | null;
  applied: Record<string, boolean | number | null> | null;
  userAgent: string;
}

export interface PitchDiagnosticFrame {
  t: number;
  ft: number;
  hz: number;
  clarity: number;
  level: number;
  target: number | null;
  calibration: number | null;
  display: number | null;
  octaveShift: number | null;
  octaveVotes: number;
  cents: number | null;
  ball: boolean;
  y: number | null;
  clampedY: number | null;
  outOfRange: boolean;
}

export interface PitchDiagnosticsSession {
  version: 1;
  startedAt: string;
  meta: PitchDiagnosticsMeta;
  frames: PitchDiagnosticFrame[];
  truncated: boolean;
}

let session: PitchDiagnosticsSession | null = null;

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function isPitchDiagnosticsEnabled(): boolean {
  if (!canUseStorage()) {
    return false;
  }
  try {
    return window.localStorage.getItem(ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setPitchDiagnosticsEnabled(enabled: boolean): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    // Storage can be unavailable; the current session still works.
  }
  if (!enabled) {
    session = null;
  }
}

export function startPitchDiagnostics(meta: PitchDiagnosticsMeta): void {
  if (!isPitchDiagnosticsEnabled()) {
    session = null;
    return;
  }
  session = {
    version: 1,
    startedAt: new Date().toISOString(),
    meta,
    frames: [],
    truncated: false,
  };
  try {
    window.sessionStorage.removeItem(DATA_KEY);
  } catch {
    // Ignore.
  }
}

export function recordPitchFrame(frame: PitchDiagnosticFrame): void {
  if (!session) {
    return;
  }
  if (session.frames.length >= MAX_FRAMES) {
    if (!session.truncated) {
      session.truncated = true;
      flushPitchDiagnostics();
    }
    return;
  }
  session.frames.push(frame);
  if (session.frames.length % FLUSH_EVERY_FRAMES === 0) {
    flushPitchDiagnostics();
  }
}

export function flushPitchDiagnostics(): void {
  if (!session || !canUseStorage()) {
    return;
  }
  try {
    window.sessionStorage.setItem(DATA_KEY, JSON.stringify(session));
  } catch {
    // A full or blocked session storage must not break the game.
  }
}

export function readPitchDiagnostics(): PitchDiagnosticsSession | null {
  if (!canUseStorage()) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(DATA_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as PitchDiagnosticsSession).version !== 1 ||
      !Array.isArray((parsed as PitchDiagnosticsSession).frames)
    ) {
      return null;
    }
    return parsed as PitchDiagnosticsSession;
  } catch {
    return null;
  }
}

export function clearPitchDiagnostics(): void {
  session = null;
  if (!canUseStorage()) {
    return;
  }
  try {
    window.sessionStorage.removeItem(DATA_KEY);
  } catch {
    // Ignore.
  }
}
