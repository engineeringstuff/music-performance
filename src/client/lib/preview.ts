import type { GameConfig, TrackSummary } from "../../shared/domain";

/**
 * Development-only stand-in used to walk the game flow before any licensed
 * backing tracks have been added to the catalogue. Never use this to represent
 * a real performance; it has no audio and no chart.
 */
export const PREVIEW_TRACK: TrackSummary = {
  id: "__preview",
  title: "Scaffold preview",
  artist: "No backing track",
  durationSec: 90,
  difficulty: "easy",
  licence: "Not applicable",
  attribution: "Development preview only",
  sourceUrl: "",
  audioUrl: "",
  chartUrl: "",
};

export const PREVIEW_CONFIG: GameConfig = {
  playerName: "Preview player",
  instrumentId: "vocals",
  trackId: PREVIEW_TRACK.id,
  transposeSemitones: 0,
};
