/**
 * Domain types shared by the browser client and the Cloudflare Worker.
 *
 * Keep this file free of browser- and Worker-specific APIs so both environments
 * can import it.
 */

export type InstrumentId = "vocals" | "piano" | "guitar" | "violin" | "flute";

export interface NoteRange {
  /** Lowest playable MIDI note, inclusive. */
  minMidi: number;
  /** Highest playable MIDI note, inclusive. */
  maxMidi: number;
}

export interface Instrument {
  id: InstrumentId;
  name: string;
  description: string;
  /** A comfortable range for an average player, used to fit charts. */
  range: NoteRange;
}

export type TrackDifficulty = "easy" | "medium" | "hard";

/**
 * Metadata for a backing track. The audio and note chart are fetched lazily so
 * the setup screen does not download every track up front.
 */
export interface TrackSummary {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  difficulty: TrackDifficulty;
  licence: string;
  attribution: string;
  sourceUrl: string;
  audioUrl: string;
  chartUrl: string;
}

/** A single note the player is asked to match. */
export interface TargetNote {
  /** Start time in seconds from the beginning of the backing track. */
  startSec: number;
  /** Time the note should be held, in seconds. */
  durationSec: number;
  /** MIDI note number of the reference melody. */
  midi: number;
  /** Optional syllable or word shown while the note is active. */
  lyric?: string;
}

/** Pre-computed music data for one backing track. */
export interface TrackChart {
  trackId: string;
  /** Instrument the reference melody was transcribed from. */
  sourceInstrument: InstrumentId;
  /** Beats per minute, for visual pacing. */
  tempoBpm: number;
  notes: TargetNote[];
}

export interface GameConfig {
  playerName: string;
  instrumentId: InstrumentId;
  trackId: string;
  /**
   * Semitones to shift the reference melody. Phase 1 will choose this
   * automatically to fit the player's range; 0 means "as written".
   */
  transposeSemitones: number;
}

export interface ScoreSummary {
  totalPoints: number;
  maxPoints: number;
  /** Overall accuracy in the range 0..1. */
  accuracy: number;
  notesHit: number;
  notesMissed: number;
  longestStreak: number;
}

export interface GameResult {
  config: GameConfig;
  score: ScoreSummary;
  completedAt: string;
}
