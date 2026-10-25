import type {
  InstrumentId,
  TargetNote,
  TrackAudioVariant,
  TrackChart,
  TrackSummary,
} from "../../shared/domain";

const INSTRUMENT_IDS: readonly InstrumentId[] = ["vocals", "piano", "guitar", "violin", "flute"];

export class ContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ContentValidationError(`${context}: missing ${key}`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function parseAudioVariant(value: unknown, context: string): TrackAudioVariant {
  if (!isRecord(value)) {
    throw new ContentValidationError(`${context}: invalid audio variant`);
  }
  const transpose = requireNumber(value, "transposeSemitones", context);
  if (!Number.isInteger(transpose)) {
    throw new ContentValidationError(`${context}: invalid audio variant transposition`);
  }
  return {
    transposeSemitones: transpose,
    audioUrl: requireString(value, "audioUrl", context),
    ...(optionalString(value, "guideUrl") ? { guideUrl: optionalString(value, "guideUrl") } : {}),
  };
}

function parseAudioVariants(value: unknown[], context: string): TrackAudioVariant[] {
  const variants = value.map((variant) => parseAudioVariant(variant, `${context} variant`));
  if (!variants.some((variant) => variant.transposeSemitones === 0)) {
    throw new ContentValidationError(`${context}: audio variants must include the original key`);
  }
  if (new Set(variants.map((variant) => variant.transposeSemitones)).size !== variants.length) {
    throw new ContentValidationError(`${context}: duplicate audio variant`);
  }
  return variants;
}

function requireNumber(record: Record<string, unknown>, key: string, context: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ContentValidationError(`${context}: invalid ${key}`);
  }
  return value;
}

export function parseTrackSummary(value: unknown): TrackSummary {
  if (!isRecord(value)) {
    throw new ContentValidationError("Track catalogue: entry is not an object");
  }
  const context = `Track ${String(value.id ?? "?")}`;
  const difficulty = requireString(value, "difficulty", context);
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    throw new ContentValidationError(`${context}: invalid difficulty`);
  }
  const durationSec = requireNumber(value, "durationSec", context);
  if (durationSec <= 0) {
    throw new ContentValidationError(`${context}: duration must be positive`);
  }

  return {
    id: requireString(value, "id", context),
    title: requireString(value, "title", context),
    artist: requireString(value, "artist", context),
    durationSec,
    difficulty: difficulty as TrackSummary["difficulty"],
    licence: requireString(value, "licence", context),
    ...(optionalString(value, "audioLicence")
      ? { audioLicence: optionalString(value, "audioLicence") }
      : {}),
    attribution: requireString(value, "attribution", context),
    sourceUrl: requireString(value, "sourceUrl", context),
    ...(optionalString(value, "soundfont")
      ? { soundfont: optionalString(value, "soundfont") }
      : {}),
    audioUrl: requireString(value, "audioUrl", context),
    ...(optionalString(value, "guideUrl") ? { guideUrl: optionalString(value, "guideUrl") } : {}),
    ...(Array.isArray(value.audioVariants)
      ? { audioVariants: parseAudioVariants(value.audioVariants, context) }
      : {}),
    chartUrl: requireString(value, "chartUrl", context),
    ...(optionalString(value, "keySignature")
      ? { keySignature: optionalString(value, "keySignature") }
      : {}),
    ...(typeof value.tempoBpm === "number" && Number.isFinite(value.tempoBpm)
      ? { tempoBpm: value.tempoBpm }
      : {}),
  };
}

export function parseTracksResponse(value: unknown): TrackSummary[] {
  if (!isRecord(value) || !Array.isArray(value.tracks)) {
    throw new ContentValidationError("Track catalogue: expected a tracks array");
  }
  return value.tracks.map(parseTrackSummary);
}

function parseNote(value: unknown, index: number): TargetNote {
  if (!isRecord(value)) {
    throw new ContentValidationError(`Chart note ${index}: not an object`);
  }
  const startSec = requireNumber(value, "startSec", `Chart note ${index}`);
  const durationSec = requireNumber(value, "durationSec", `Chart note ${index}`);
  const midi = requireNumber(value, "midi", `Chart note ${index}`);
  if (startSec < 0 || durationSec <= 0 || !Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new ContentValidationError(`Chart note ${index}: invalid values`);
  }
  return {
    startSec,
    durationSec,
    midi,
    ...(optionalString(value, "lyric") ? { lyric: optionalString(value, "lyric") } : {}),
  };
}

export function parseTrackChart(value: unknown): TrackChart {
  if (!isRecord(value)) {
    throw new ContentValidationError("Chart: not an object");
  }
  if (value.version !== 1) {
    throw new ContentValidationError("Chart: unsupported version");
  }
  const trackId = requireString(value, "trackId", "Chart");
  const sourceInstrument = requireString(value, "sourceInstrument", "Chart");
  if (!INSTRUMENT_IDS.includes(sourceInstrument as InstrumentId)) {
    throw new ContentValidationError("Chart: invalid sourceInstrument");
  }
  const tempoBpm = requireNumber(value, "tempoBpm", "Chart");
  if (!Array.isArray(value.notes) || value.notes.length === 0) {
    throw new ContentValidationError("Chart: no notes");
  }
  const notes = value.notes.map(parseNote);
  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const note of notes) {
    if (note.startSec < previousEnd - 0.005) {
      throw new ContentValidationError("Chart: overlapping notes");
    }
    previousEnd = note.startSec + note.durationSec;
  }

  return {
    version: 1,
    trackId,
    sourceInstrument: sourceInstrument as InstrumentId,
    tempoBpm,
    ...(optionalString(value, "keySignature")
      ? { keySignature: optionalString(value, "keySignature") }
      : {}),
    notes,
  };
}
