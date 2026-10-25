import type { InstrumentId, TrackSummary } from "../../shared/domain";
import { getInstrument } from "../../shared/instruments";
import type { NoteEvaluation, ScoreBreakdown } from "../../shared/scoring";

const DB_NAME = "music-performance";
const DB_VERSION = 2;
const STORE = "results";
const BEST_STORE = "bests";
const MAX_RESULTS = 100;

export interface StoredResult {
  id: string;
  trackId: string;
  trackTitle: string;
  instrumentId: InstrumentId;
  playerName: string;
  /** Total semitone shift from the written chart (key transposition + octave fit). */
  transposeSemitones: number;
  /** Selected pre-rendered backing key. */
  keyTransposeSemitones: number;
  /** Octave fit applied on top of the selected key. */
  octaveShiftSemitones: number;
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

interface StoredBest extends StoredResult {
  bestKey: string;
}

function bestKey(
  trackId: string,
  instrumentId: InstrumentId,
  octaveShiftSemitones: number,
): string {
  return `${trackId}:${instrumentId}:${octaveShiftSemitones}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Validate a record read from IndexedDB. Legacy v1 records did not store
 * key/octave separately; derive them from the old total transpose.
 */
function normalizeResult(value: unknown): StoredResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = value.id;
  const trackId = value.trackId;
  const trackTitle = value.trackTitle;
  const instrumentId = value.instrumentId;
  const completedAt = value.completedAt;
  if (
    typeof id !== "string" ||
    typeof trackId !== "string" ||
    typeof trackTitle !== "string" ||
    typeof completedAt !== "string" ||
    typeof instrumentId !== "string" ||
    !getInstrument(instrumentId)
  ) {
    return null;
  }

  const total = finiteNumber(value.transposeSemitones);
  const key = finiteNumber(value.keyTransposeSemitones);
  const octave =
    typeof value.octaveShiftSemitones === "number" && Number.isFinite(value.octaveShiftSemitones)
      ? value.octaveShiftSemitones
      : total - key;

  return {
    id,
    trackId,
    trackTitle,
    instrumentId: instrumentId as InstrumentId,
    playerName: typeof value.playerName === "string" ? value.playerName : "",
    transposeSemitones: total,
    keyTransposeSemitones: key,
    octaveShiftSemitones: octave,
    guideEnabled: value.guideEnabled === true,
    totalPoints: finiteNumber(value.totalPoints),
    maxPoints: finiteNumber(value.maxPoints),
    accuracy: finiteNumber(value.accuracy),
    notesHit: finiteNumber(value.notesHit),
    notesMissed: finiteNumber(value.notesMissed),
    longestStreak: finiteNumber(value.longestStreak),
    meanPitchQuality: finiteNumber(value.meanPitchQuality),
    meanTimingQuality: finiteNumber(value.meanTimingQuality),
    meanCoverage: finiteNumber(value.meanCoverage),
    notes: Array.isArray(value.notes) ? (value.notes as NoteEvaluation[]) : [],
    completedAt,
  };
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
      const transaction = request.transaction;
      if (!transaction) {
        return;
      }

      let resultsStore: IDBObjectStore;
      if (!database.objectStoreNames.contains(STORE)) {
        resultsStore = database.createObjectStore(STORE, { keyPath: "id" });
        resultsStore.createIndex("byTrack", "trackId", { unique: false });
        resultsStore.createIndex("byCompletedAt", "completedAt", { unique: false });
      } else {
        resultsStore = transaction.objectStore(STORE);
      }

      if (!database.objectStoreNames.contains(BEST_STORE)) {
        const bestsStore = database.createObjectStore(BEST_STORE, {
          keyPath: "bestKey",
        });
        bestsStore.createIndex("byTrack", "trackId", { unique: false });

        // Seed bests from existing v1 results before older rows are pruned.
        resultsStore.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) {
            return;
          }
          const result = normalizeResult(cursor.value);
          if (result && !result.guideEnabled) {
            const key = bestKey(result.trackId, result.instrumentId, result.octaveShiftSemitones);
            const existingRequest = bestsStore.get(key);
            existingRequest.onsuccess = () => {
              const existing = existingRequest.result as StoredBest | undefined;
              if (
                !existing ||
                result.accuracy > existing.accuracy ||
                (result.accuracy === existing.accuracy && result.totalPoints > existing.totalPoints)
              ) {
                bestsStore.put({ ...result, bestKey: key });
              }
            };
          }
          cursor.continue();
        };
      }
    };
    request.onblocked = () => reject(new Error("Results database is blocked by another tab"));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open results database"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Results request failed"));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Results transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Results transaction was aborted"));
  });
}

export function selectBestResult(
  results: readonly StoredResult[],
  trackId: string,
  instrumentId: InstrumentId,
  octaveShiftSemitones: number,
  includeGuide = false,
): StoredResult | null {
  const matching = results.filter(
    (result) =>
      result.trackId === trackId &&
      result.instrumentId === instrumentId &&
      result.octaveShiftSemitones === octaveShiftSemitones &&
      (includeGuide || !result.guideEnabled),
  );
  matching.sort((a, b) => b.accuracy - a.accuracy || b.totalPoints - a.totalPoints);
  return matching[0] ?? null;
}

/** Oldest result ids beyond the retention limit. */
export function resultsToPrune(
  results: readonly StoredResult[],
  maxResults = MAX_RESULTS,
): string[] {
  return [...results]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(maxResults)
    .map((result) => result.id);
}

export function resultFromScore(
  track: TrackSummary,
  config: {
    playerName: string;
    instrumentId: InstrumentId;
    transposeSemitones: number;
    keyTransposeSemitones?: number;
    guideEnabled: boolean;
  },
  score: ScoreBreakdown,
): StoredResult {
  const key = config.keyTransposeSemitones ?? 0;
  const total = config.transposeSemitones;
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    trackId: track.id,
    trackTitle: track.title,
    instrumentId: config.instrumentId,
    playerName: config.playerName,
    transposeSemitones: total,
    keyTransposeSemitones: key,
    octaveShiftSemitones: total - key,
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
    const transaction = database.transaction([STORE, BEST_STORE], "readwrite");
    const completion = transactionToPromise(transaction);
    const store = transaction.objectStore(STORE);
    const bests = transaction.objectStore(BEST_STORE);

    try {
      store.put(result);
      if (!result.guideEnabled) {
        const key = bestKey(result.trackId, result.instrumentId, result.octaveShiftSemitones);
        const existing = (await requestToPromise(bests.get(key))) as StoredBest | undefined;
        if (
          !existing ||
          result.accuracy > existing.accuracy ||
          (result.accuracy === existing.accuracy && result.totalPoints > existing.totalPoints)
        ) {
          bests.put({ ...result, bestKey: key });
        }
      }

      const all = ((await requestToPromise(store.getAll())) as unknown[])
        .map(normalizeResult)
        .filter((candidate): candidate is StoredResult => candidate !== null);
      for (const id of resultsToPrune(all)) {
        store.delete(id);
      }
    } catch (error) {
      await completion.catch(() => undefined);
      throw error;
    }

    await completion;
  } finally {
    database.close();
  }
}

/**
 * Best score for a track/instrument/octave. Guide-assisted practice runs are
 * saved but do not set the clean personal best. Clean bests survive result
 * retention because they live in a separate object store.
 */
export async function getBestResult(
  trackId: string,
  instrumentId: InstrumentId,
  octaveShiftSemitones: number,
  includeGuide = false,
): Promise<StoredResult | null> {
  const database = await openDatabase();
  try {
    if (!includeGuide) {
      const transaction = database.transaction(BEST_STORE, "readonly");
      const stored = (await requestToPromise(
        transaction
          .objectStore(BEST_STORE)
          .get(bestKey(trackId, instrumentId, octaveShiftSemitones)),
      )) as StoredBest | undefined;
      const normalized = stored ? normalizeResult(stored) : null;
      if (normalized) {
        return normalized;
      }
    }

    const transaction = database.transaction(STORE, "readonly");
    const index = transaction.objectStore(STORE).index("byTrack");
    const results = ((await requestToPromise(index.getAll(trackId))) as unknown[])
      .map(normalizeResult)
      .filter((candidate): candidate is StoredResult => candidate !== null);
    return selectBestResult(results, trackId, instrumentId, octaveShiftSemitones, includeGuide);
  } finally {
    database.close();
  }
}

export async function getPersonalBests(): Promise<StoredResult[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BEST_STORE, "readonly");
    const stored = (await requestToPromise(
      transaction.objectStore(BEST_STORE).getAll(),
    )) as unknown[];
    return stored
      .map(normalizeResult)
      .filter((candidate): candidate is StoredResult => candidate !== null)
      .sort((a, b) => b.accuracy - a.accuracy || a.trackTitle.localeCompare(b.trackTitle));
  } finally {
    database.close();
  }
}

export async function getRecentResults(limit = 20): Promise<StoredResult[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, "readonly");
    const results = (await requestToPromise(transaction.objectStore(STORE).getAll())) as unknown[];
    return results
      .map(normalizeResult)
      .filter((candidate): candidate is StoredResult => candidate !== null)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, Math.max(1, limit));
  } finally {
    database.close();
  }
}

export async function countResults(): Promise<number> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, "readonly");
    return await requestToPromise(transaction.objectStore(STORE).count());
  } finally {
    database.close();
  }
}

export async function clearResults(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([STORE, BEST_STORE], "readwrite");
    const completion = transactionToPromise(transaction);
    transaction.objectStore(STORE).clear();
    transaction.objectStore(BEST_STORE).clear();
    await completion;
  } finally {
    database.close();
  }
}
