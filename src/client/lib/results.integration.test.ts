import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearResults,
  countResults,
  getBestResult,
  getPersonalBests,
  getRecentResults,
  type StoredResult,
  saveResult,
} from "./results";

const DB_NAME = "music-performance";

function resetDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabaseForTest(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function makeResult(overrides: Partial<StoredResult> = {}): StoredResult {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    trackId: "track",
    trackTitle: "Track",
    instrumentId: "vocals",
    playerName: "Player",
    transposeSemitones: 0,
    keyTransposeSemitones: 0,
    octaveShiftSemitones: 0,
    guideEnabled: false,
    totalPoints: 75,
    maxPoints: 100,
    accuracy: 0.75,
    notesHit: 1,
    notesMissed: 1,
    longestStreak: 1,
    meanPitchQuality: 0.8,
    meanTimingQuality: 0.8,
    meanCoverage: 1,
    notes: [],
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("results persistence", () => {
  it("saves, counts and exposes recent results after the transaction commits", async () => {
    await saveResult(makeResult({ id: "first", completedAt: "2026-01-01T00:00:00.000Z" }));
    await saveResult(makeResult({ id: "second", completedAt: "2026-01-02T00:00:00.000Z" }));

    expect(await countResults()).toBe(2);
    const recent = await getRecentResults(1);
    expect(recent.map((result) => result.id)).toEqual(["second"]);
  });

  it("excludes guide runs from clean bests and respects transposition", async () => {
    await saveResult(makeResult({ id: "clean", accuracy: 0.7 }));
    await saveResult(makeResult({ id: "guide", accuracy: 0.99, guideEnabled: true }));
    await saveResult(
      makeResult({
        id: "octave",
        accuracy: 0.95,
        transposeSemitones: -12,
        octaveShiftSemitones: -12,
      }),
    );

    expect((await getBestResult("track", "vocals", 0))?.id).toBe("clean");
    expect((await getBestResult("track", "vocals", 0, true))?.id).toBe("guide");
    expect((await getBestResult("track", "vocals", -12))?.id).toBe("octave");
  });

  it("keeps a clean best after more than 100 newer results", async () => {
    await saveResult(
      makeResult({
        id: "best",
        accuracy: 1,
        totalPoints: 100,
        completedAt: "2020-01-01T00:00:00.000Z",
      }),
    );
    for (let index = 0; index < 101; index += 1) {
      await saveResult(
        makeResult({
          id: `later-${index}`,
          accuracy: 0.5,
          totalPoints: 50,
          completedAt: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T${String(
            index % 24,
          ).padStart(2, "0")}:00:00.000Z`,
        }),
      );
    }

    expect(await countResults()).toBe(100);
    expect((await getBestResult("track", "vocals", 0))?.id).toBe("best");
    expect((await getPersonalBests()).some((result) => result.id === "best")).toBe(true);
  });

  it("groups bests by octave rather than by pre-rendered key", async () => {
    await saveResult(
      makeResult({
        id: "key-plus-two",
        accuracy: 0.8,
        transposeSemitones: 2,
        keyTransposeSemitones: 2,
        octaveShiftSemitones: 0,
      }),
    );
    await saveResult(
      makeResult({
        id: "octave-down",
        accuracy: 0.9,
        transposeSemitones: -10,
        keyTransposeSemitones: 2,
        octaveShiftSemitones: -12,
      }),
    );

    expect((await getBestResult("track", "vocals", 0))?.id).toBe("key-plus-two");
    expect((await getBestResult("track", "vocals", -12))?.id).toBe("octave-down");
  });

  it("migrates v1 results into persistent bests", async () => {
    const legacy = makeResult({
      id: "legacy",
      accuracy: 0.98,
      totalPoints: 98,
      transposeSemitones: -12,
      completedAt: "2025-01-01T00:00:00.000Z",
    }) as unknown as Record<string, unknown>;
    delete legacy.keyTransposeSemitones;
    delete legacy.octaveShiftSemitones;

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("results", { keyPath: "id" });
        store.createIndex("byTrack", "trackId", { unique: false });
        store.createIndex("byCompletedAt", "completedAt", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await requestToPromise(
      database.transaction("results", "readwrite").objectStore("results").put(legacy),
    );
    database.close();

    const migrated = await getBestResult("track", "vocals", -12);
    expect(migrated?.id).toBe("legacy");
    expect((await getPersonalBests()).some((result) => result.id === "legacy")).toBe(true);
  });

  it("filters corrupt rows from recent results and bests", async () => {
    await saveResult(makeResult({ id: "valid" }));
    const database = await openDatabaseForTest();
    await requestToPromise(
      database.transaction("results", "readwrite").objectStore("results").put({ id: "bad" }),
    );
    await requestToPromise(
      database.transaction("bests", "readwrite").objectStore("bests").put({ bestKey: "bad" }),
    );
    database.close();

    expect((await getRecentResults()).map((result) => result.id)).toEqual(["valid"]);
    expect((await getPersonalBests()).map((result) => result.id)).toEqual(["valid"]);
  });

  it("clears all results", async () => {
    await saveResult(makeResult());
    await clearResults();
    expect(await countResults()).toBe(0);
    expect(await getRecentResults()).toEqual([]);
  });
});
