import type { InstrumentId } from "../../shared/domain";
import { getInstrument } from "../../shared/instruments";

const PROFILE_KEY = "music-performance:profile:v1";
const CONFIG_KEY = "music-performance:last-config:v1";

export interface StoredProfile {
  name: string;
}

export interface StoredConfig {
  instrumentId: InstrumentId;
  trackId: string;
}

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, quota). The game still works
    // for the current session, it just will not be remembered.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function loadProfile(): StoredProfile | null {
  const value = readJson(PROFILE_KEY);
  if (!isRecord(value) || typeof value.name !== "string" || value.name.trim() === "") {
    return null;
  }
  return { name: value.name };
}

export function saveProfile(name: string): void {
  writeJson(PROFILE_KEY, { name });
}

export function loadLastConfig(): StoredConfig | null {
  const value = readJson(CONFIG_KEY);
  if (!isRecord(value)) {
    return null;
  }
  const { instrumentId, trackId } = value;
  if (typeof instrumentId !== "string" || typeof trackId !== "string") {
    return null;
  }
  if (!getInstrument(instrumentId)) {
    return null;
  }
  return { instrumentId: instrumentId as InstrumentId, trackId };
}

export function saveLastConfig(config: StoredConfig): void {
  writeJson(CONFIG_KEY, config);
}
