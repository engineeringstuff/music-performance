const AUDIO_KEY = "music-performance:audio:v1";
const LATENCY_KEY = "music-performance:latency:v1";
const DIAGNOSTICS_KEY = "music-performance:diagnostics:v1";

export interface AudioSettings {
  backingVolume: number;
  guideVolume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  backingVolume: 0.9,
  guideVolume: 0.22,
};

export interface DiagnosticEntry {
  message: string;
  at: string;
}

function readLocalJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLocalJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; the current session still works.
  }
}

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

export function loadAudioSettings(): AudioSettings {
  const value = readLocalJson(AUDIO_KEY);
  if (typeof value !== "object" || value === null) {
    return DEFAULT_AUDIO_SETTINGS;
  }
  const record = value as Record<string, unknown>;
  return {
    backingVolume: clampVolume(record.backingVolume, DEFAULT_AUDIO_SETTINGS.backingVolume),
    guideVolume: clampVolume(record.guideVolume, DEFAULT_AUDIO_SETTINGS.guideVolume),
  };
}

export function saveAudioSettings(settings: AudioSettings): void {
  writeLocalJson(AUDIO_KEY, {
    backingVolume: clampVolume(settings.backingVolume, DEFAULT_AUDIO_SETTINGS.backingVolume),
    guideVolume: clampVolume(settings.guideVolume, DEFAULT_AUDIO_SETTINGS.guideVolume),
  });
}

export function loadLatencyOffsetMs(): number {
  const value = readLocalJson(LATENCY_KEY);
  if (typeof value !== "object" || value === null) {
    return 0;
  }
  const offset = (value as Record<string, unknown>).offsetMs;
  if (typeof offset !== "number" || !Number.isFinite(offset)) {
    return 0;
  }
  return Math.min(250, Math.max(-250, offset));
}

export function saveLatencyOffsetMs(offsetMs: number): void {
  writeLocalJson(LATENCY_KEY, { offsetMs: Math.min(250, Math.max(-250, offsetMs)) });
}

export function logDiagnostic(message: string): void {
  try {
    let entries: DiagnosticEntry[] = [];
    const raw = window.sessionStorage.getItem(DIAGNOSTICS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          entries = parsed.filter(
            (entry): entry is DiagnosticEntry =>
              typeof entry === "object" &&
              entry !== null &&
              typeof (entry as DiagnosticEntry).message === "string" &&
              typeof (entry as DiagnosticEntry).at === "string",
          );
        }
      } catch {
        entries = [];
      }
    }
    entries.push({ message: message.slice(0, 500), at: new Date().toISOString() });
    window.sessionStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(entries.slice(-20)));
  } catch {
    // Diagnostics are best effort and must never break the game.
  }
}

export function readDiagnostics(): DiagnosticEntry[] {
  try {
    const raw = window.sessionStorage.getItem(DIAGNOSTICS_KEY);
    if (!raw) {
      return [];
    }
    const entries = JSON.parse(raw) as unknown;
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries
      .filter(
        (entry): entry is DiagnosticEntry =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as DiagnosticEntry).message === "string" &&
          typeof (entry as DiagnosticEntry).at === "string",
      )
      .slice(-20);
  } catch {
    return [];
  }
}

export function clearDiagnostics(): void {
  try {
    window.sessionStorage.removeItem(DIAGNOSTICS_KEY);
  } catch {
    // Ignore.
  }
}

export function clearLocalPreferences(): void {
  const errors: string[] = [];

  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("music-performance:")) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      window.localStorage.removeItem(key);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "localStorage");
  }

  try {
    const sessionKeys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith("music-performance:")) {
        sessionKeys.push(key);
      }
    }
    for (const key of sessionKeys) {
      window.sessionStorage.removeItem(key);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "sessionStorage");
  }

  if (errors.length > 0) {
    throw new Error(`Could not clear preferences: ${errors.join("; ")}`);
  }
}
