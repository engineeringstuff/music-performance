import type { InstrumentId, TrackSummary } from "../../shared/domain";
import type { NoteEvaluation, ScoreBreakdown } from "../../shared/scoring";

const DB_NAME = "music-performance";
const DB_VERSION = 1;
const STORE = "results";

export interface StoredResult {
  id: string;
  trackId: string;
  trackTitle: string;
  instrumentId: InstrumentId;
  playerName: string;
  transposeSemitones: number;
  guideEnabled: boolean;
  totalPoints: number;
  maxPoints: number;
  accuracy: number;
  notesHit: number;
  notesMissed: number;
  longestStreak: number;
  meanPitchQuality: number;
  meanTimingQuality: number;
  meanCoverage: number;
  notes: NoteEvaluation[];
  completedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("byTrack", "trackId", { unique: false });
        store.createIndex("byCompletedAt", "completedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open results database"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Results request failed"));
  });
}

export function resultFromScore(
  track: TrackSummary,
  config: {
    playerName: string;
    instrumentId: InstrumentId;
    transposeSemitones: number;
    guideEnabled: boolean;
  },
  score: ScoreBreakdown,
): StoredResult {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    trackId: track.id,
    trackTitle: track.title,
    instrumentId: config.instrumentId,
    playerName: config.playerName,
    transposeSemitones: config.transposeSemitones,
    guideEnabled: config.guideEnabled,
    totalPoints: score.totalPoints,
    maxPoints: score.maxPoints,
    accuracy: score.accuracy,
    notesHit: score.notesHit,
    notesMissed: score.notesMissed,
    longestStreak: score.longestStreak,
    meanPitchQuality: score.meanPitchQuality,
    meanTimingQuality: score.meanTimingQuality,
    meanCoverage: score.meanCoverage,
    notes: score.notes,
    completedAt: new Date().toISOString(),
  };
}

export async function saveResult(result: StoredResult): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, "readwrite");
    await requestToPromise(transaction.objectStore(STORE).put(result));
  } finally {
    database.close();
  }
}

export async function getBestResult(
  trackId: string,
  instrumentId: InstrumentId,
): Promise<StoredResult | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, "readonly");
    const index = transaction.objectStore(STORE).index("byTrack");
    const results = (await requestToPromise(index.getAll(trackId))) as StoredResult[];
    const matching = results.filter((result) => result.instrumentId === instrumentId);
    matching.sort((a, b) => b.accuracy - a.accuracy || b.totalPoints - a.totalPoints);
    return matching[0] ?? null;
  } finally {
    database.close();
  }
}
