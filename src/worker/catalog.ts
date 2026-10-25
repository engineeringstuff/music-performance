import type { TrackSummary } from "../shared/domain";

/**
 * The Phase 1 backing-track catalogue.
 *
 * Tracks are added here only after their audio, licence metadata and
 * pre-computed chart are in place. See docs/002. TRACK-CONTENT.md for the
 * required files and the provenance checklist.
 */
export const TRACKS: TrackSummary[] = [];
