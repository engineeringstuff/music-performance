import { useEffect, useState } from "react";
import { getInstrument } from "../../shared/instruments";
import { Button } from "../components/Button";
import { getPersonalBests, getRecentResults, type StoredResult } from "../lib/results";

interface HistoryScreenProps {
  onBack: () => void;
  onSettings: () => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function HistoryScreen({ onBack, onSettings }: HistoryScreenProps) {
  const [results, setResults] = useState<StoredResult[] | null>(null);
  const [bests, setBests] = useState<StoredResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getRecentResults(100), getPersonalBests()])
      .then(([recent, personalBests]) => {
        if (active) {
          setResults(recent);
          setBests(personalBests);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Could not load local history.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pt-2 pb-16">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center text-sm text-stage-300 transition hover:text-white"
      >
        ← Back
      </button>
      <p className="mt-6 text-xs font-semibold tracking-[0.3em] text-accent-300 uppercase">
        Local only
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your performances</h1>
      <p className="mt-3 max-w-2xl text-stage-300">
        Results are stored in this browser only. Clean runs (guide off) set your personal bests;
        guide-assisted practice runs are kept for history.
      </p>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      )}

      {results === null && !error && (
        <p className="mt-8 text-sm text-stage-300">Loading local history…</p>
      )}

      {results !== null && results.length === 0 && (
        <div className="mt-8 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-6">
          <p className="font-medium text-slate-100">No performances yet</p>
          <p className="mt-2 text-sm text-stage-300">
            Complete a run and your score will appear here.
          </p>
        </div>
      )}

      {bests.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-100">Personal bests</h2>
          <div className="mt-3 space-y-2">
            {bests.map((result) => (
              <div
                key={`${result.trackId}-${result.instrumentId}-${result.transposeSemitones}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-400/20 bg-accent-400/[0.06] px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-100">{result.trackTitle}</p>
                  <p className="mt-0.5 text-sm text-stage-300">
                    {getInstrument(result.instrumentId)?.name ?? result.instrumentId}
                    {result.keyTransposeSemitones !== 0
                      ? ` · key ${result.keyTransposeSemitones > 0 ? "+" : ""}${result.keyTransposeSemitones} st`
                      : ""}
                    {result.octaveShiftSemitones !== 0
                      ? ` · octave ${result.octaveShiftSemitones > 0 ? "+" : ""}${result.octaveShiftSemitones / 12}`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold text-accent-300 tabular-nums">
                    {Math.round(result.accuracy * 100)}%
                  </p>
                  <p className="text-xs text-stage-300">
                    {Math.round(result.totalPoints)} / {result.maxPoints}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {results !== null && results.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-100">Recent runs</h2>
          <div className="mt-3 space-y-2">
            {results.map((result) => (
              <div
                key={result.id}
                className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-100">
                    {result.trackTitle}
                    {result.guideEnabled && (
                      <span className="ml-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] tracking-wider text-amber-200 uppercase">
                        Guide on
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-semibold text-slate-200 tabular-nums">
                    {Math.round(result.accuracy * 100)}%
                  </p>
                </div>
                <p className="mt-1 text-xs text-stage-300">
                  {formatDate(result.completedAt)} ·{" "}
                  {getInstrument(result.instrumentId)?.name ?? result.instrumentId} ·{" "}
                  {Math.round(result.totalPoints)} / {result.maxPoints}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onSettings}>
          Privacy &amp; data
        </Button>
      </div>
    </div>
  );
}
