import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import {
  type AudioSettings,
  clearDiagnostics,
  type DiagnosticEntry,
  loadAudioSettings,
  loadLatencyOffsetMs,
  logDiagnostic,
  readDiagnostics,
  saveAudioSettings,
  saveLatencyOffsetMs,
} from "../lib/preferences";
import { clearAllLocalData } from "../lib/privateData";
import { countResults } from "../lib/results";

interface SettingsScreenProps {
  onBack: () => void;
  onCleared: () => void;
}

export function SettingsScreen({ onBack, onCleared }: SettingsScreenProps) {
  const [audio, setAudio] = useState<AudioSettings>(() => loadAudioSettings());
  const [latencyMs, setLatencyMs] = useState(() => loadLatencyOffsetMs());
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>(() => readDiagnostics());
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    countResults()
      .then((count) => {
        if (active) {
          setResultCount(count);
        }
      })
      .catch(() => {
        if (active) {
          setResultCount(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (confirmClear) {
      confirmButtonRef.current?.focus();
    } else {
      clearButtonRef.current?.focus();
    }
  }, [confirmClear]);

  const updateAudio = (next: AudioSettings) => {
    const clamped = {
      backingVolume: Math.min(1, Math.max(0, next.backingVolume)),
      guideVolume: Math.min(1, Math.max(0, next.guideVolume)),
    };
    setAudio(clamped);
    saveAudioSettings(clamped);
  };

  const updateLatency = (value: number) => {
    setLatencyMs(value);
    saveLatencyOffsetMs(value);
  };

  const handleClear = async () => {
    setClearing(true);
    setError(null);
    try {
      await clearAllLocalData();
      setConfirmClear(false);
      setResultCount(0);
      setDiagnostics([]);
      onCleared();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not clear local data.");
    } finally {
      setClearing(false);
    }
  };

  const copyDiagnostics = async () => {
    const text = diagnostics.map((entry) => `${entry.at} ${entry.message}`).join("\n");
    try {
      await navigator.clipboard.writeText(text || "No diagnostics recorded.");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      logDiagnostic("Could not copy diagnostics to the clipboard");
      setError("Could not copy diagnostics.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-2 pb-16">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center text-sm text-stage-300 transition hover:text-white"
      >
        ← Back
      </button>
      <p className="mt-6 text-xs font-semibold tracking-[0.3em] text-accent-300 uppercase">
        Your data
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Privacy &amp; sound</h1>
      <p className="mt-3 max-w-2xl text-stage-300">
        Everything is stored in this browser. Audio is processed locally and is never sent to the
        Worker or any third party.
      </p>

      <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-lg font-semibold text-slate-100">What is stored</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-stage-300">
          <li>Your player name and last instrument/track in localStorage.</li>
          <li>
            {resultCount === null
              ? "Local performance results in IndexedDB."
              : `${resultCount} local performance result${resultCount === 1 ? "" : "s"} in IndexedDB.`}
          </li>
          <li>Audio and timing preferences in localStorage.</li>
          <li>
            Session diagnostics are kept in sessionStorage for this tab only; they are never
            uploaded.
          </li>
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!confirmClear ? (
            <Button ref={clearButtonRef} variant="danger" onClick={() => setConfirmClear(true)}>
              Clear local data
            </Button>
          ) : (
            <div
              className="w-full rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4"
              role="alert"
            >
              <p className="text-sm font-medium text-rose-100">
                Remove your name, preferences and all local results?
              </p>
              <p className="mt-1 text-sm text-rose-200/80">This cannot be undone.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  ref={confirmButtonRef}
                  variant="danger"
                  onClick={() => void handleClear()}
                  disabled={clearing}
                >
                  {clearing ? "Clearing…" : "Remove everything"}
                </Button>
                <Button variant="secondary" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-rose-200">{error}</p>}
      </section>

      <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-lg font-semibold text-slate-100">Sound levels</h2>
        <p className="mt-2 text-sm text-stage-300">
          These apply to the next performance. The guide is still toggled per run in setup.
        </p>
        <label className="mt-5 block text-sm text-slate-200">
          Backing volume · {Math.round(audio.backingVolume * 100)}%
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(audio.backingVolume * 100)}
            onChange={(event) =>
              updateAudio({ ...audio, backingVolume: Number(event.target.value) / 100 })
            }
            className="mt-2 block w-full accent-emerald-400"
          />
        </label>
        <label className="mt-5 block text-sm text-slate-200">
          Guide volume · {Math.round(audio.guideVolume * 100)}%
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(audio.guideVolume * 100)}
            onChange={(event) =>
              updateAudio({ ...audio, guideVolume: Number(event.target.value) / 100 })
            }
            className="mt-2 block w-full accent-emerald-400"
          />
        </label>
      </section>

      <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-lg font-semibold text-slate-100">Timing offset</h2>
        <p className="mt-2 text-sm leading-relaxed text-stage-300">
          Frames are corrected to the analysis-window centre and browser-reported input latency.
          This offset applies to both microphone and MIDI input. If your notes consistently feel
          late, move it toward positive; if they feel early, move it toward negative.
        </p>
        <label className="mt-5 block text-sm text-slate-200">
          Offset · {latencyMs > 0 ? "+" : ""}
          {latencyMs} ms
          <input
            type="range"
            min={-250}
            max={250}
            step={5}
            value={latencyMs}
            onChange={(event) => updateLatency(Number(event.target.value))}
            className="mt-2 block w-full accent-emerald-400"
          />
        </label>
      </section>

      <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-lg font-semibold text-slate-100">Diagnostics</h2>
        <p className="mt-2 text-sm text-stage-300">
          Errors are recorded for this tab only. Nothing is uploaded.
        </p>
        {diagnostics.length === 0 ? (
          <p className="mt-3 text-sm text-stage-300">No diagnostics recorded.</p>
        ) : (
          <ul className="mt-3 max-h-48 space-y-2 overflow-auto rounded-2xl border border-white/5 bg-stage-950/60 p-3 font-mono text-xs text-stage-300">
            {diagnostics.map((entry) => (
              <li key={`${entry.at}-${entry.message}`}>
                {entry.at} · {entry.message}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => void copyDiagnostics()}>
            {copied ? "Copied" : "Copy diagnostics"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              clearDiagnostics();
              setDiagnostics([]);
            }}
          >
            Clear diagnostics
          </Button>
        </div>
      </section>

      <p className="mt-6 text-sm text-stage-300">
        Read the{" "}
        <a
          href="/THIRD_PARTY_NOTICES.txt"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-white/20 underline-offset-4 hover:text-white"
        >
          third-party notices
        </a>
        .
      </p>
    </div>
  );
}
