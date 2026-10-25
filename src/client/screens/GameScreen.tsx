import { useEffect, useMemo, useRef, useState } from "react";
import type { GameConfig, TargetNote, TrackSummary } from "../../shared/domain";
import { getInstrument } from "../../shared/instruments";
import { midiToNoteName } from "../../shared/music";
import type { NoteEvaluation, NoteRating, ScoreBreakdown } from "../../shared/scoring";
import { Button } from "../components/Button";
import { usePerformance } from "../game/usePerformance";
import { formatClock } from "../lib/format";
import { useReducedMotion } from "../lib/useReducedMotion";

interface GameScreenProps {
  config: GameConfig;
  track: TrackSummary;
  onForfeit: () => void;
  onFinish: (score: ScoreBreakdown, transposeSemitones: number) => void;
  onPractice: () => void;
  onActiveChange: (active: boolean) => void;
}

const RATING_STYLES: Record<
  NoteRating,
  { label: string; symbol: string; block: string; text: string }
> = {
  perfect: {
    label: "Perfect",
    symbol: "★",
    block: "border-emerald-200/70 bg-emerald-400/85 text-emerald-950",
    text: "text-emerald-300",
  },
  great: {
    label: "Great",
    symbol: "✓",
    block: "border-teal-200/60 bg-teal-400/80 text-teal-950",
    text: "text-teal-300",
  },
  good: {
    label: "Good",
    symbol: "•",
    block: "border-amber-200/60 bg-amber-400/80 text-amber-950",
    text: "text-amber-300",
  },
  miss: {
    label: "Miss",
    symbol: "×",
    block: "border-rose-300/50 bg-rose-500/55 text-rose-50",
    text: "text-rose-300",
  },
};

const LANE_BEFORE_SEC = 1.2;
const LANE_AFTER_SEC = 4.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function PitchLane({
  notes,
  timeSec,
  currentIndex,
  currentCents,
  evaluations,
  reducedMotion,
}: {
  notes: readonly TargetNote[];
  timeSec: number;
  currentIndex: number | null;
  currentCents: number | null;
  evaluations: Map<number, NoteEvaluation>;
  reducedMotion: boolean;
}) {
  const laneAfterSec = notes.length > 90 ? 3.2 : LANE_AFTER_SEC;
  const laneSpanSec = LANE_BEFORE_SEC + laneAfterSec;
  const laneStart = timeSec - LANE_BEFORE_SEC;
  const laneEnd = timeSec + laneAfterSec;
  const currentNote = currentIndex === null ? null : notes[currentIndex];

  const range = useMemo(() => {
    if (notes.length === 0) {
      return { minMidi: 48, maxMidi: 84 };
    }
    const midis = notes.map((note) => note.midi);
    const minMidi = Math.min(...midis) - 3;
    const maxMidi = Math.max(...midis) + 3;
    return { minMidi, maxMidi: Math.max(maxMidi, minMidi + 12) };
  }, [notes]);

  const xPercent = (seconds: number) => ((seconds - laneStart) / laneSpanSec) * 100;
  const yPercent = (midi: number) =>
    ((range.maxMidi - midi) / (range.maxMidi - range.minMidi)) * 100;
  const playheadPercent = (LANE_BEFORE_SEC / laneSpanSec) * 100;

  if (reducedMotion) {
    const startIndex = currentIndex === null ? 0 : currentIndex + 1;
    const upcoming = notes.slice(startIndex, startIndex + 4);
    return (
      <div className="relative flex h-72 flex-col justify-center overflow-hidden rounded-3xl border border-white/10 bg-stage-950/80 p-6">
        <p className="text-[10px] font-medium tracking-widest text-stage-300 uppercase">
          Current target · concert pitch
        </p>
        <div className="mt-4 flex flex-wrap items-baseline gap-4">
          <span className="font-mono text-6xl font-semibold text-accent-300">
            {currentNote ? midiToNoteName(currentNote.midi) : "—"}
          </span>
          <span className="text-lg text-stage-300">
            {currentCents === null
              ? "Listening"
              : `${currentCents > 0 ? "+" : ""}${Math.round(currentCents)} cents`}
          </span>
        </div>
        {currentNote?.lyric && (
          <p className="mt-3 text-lg font-medium text-accent-300">“{currentNote.lyric}”</p>
        )}
        <p className="mt-6 text-sm text-stage-300">
          Reduced motion is on, so the lane stays still. Follow the current note and the cents
          reading.
        </p>
        <p className="mt-3 text-sm text-slate-200">
          Up next:{" "}
          {upcoming.length > 0
            ? upcoming.map((note) => midiToNoteName(note.midi)).join(" · ")
            : "end of track"}
        </p>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="relative h-72 overflow-hidden rounded-3xl border border-white/10 bg-stage-950/80"
    >
      <div className="absolute inset-0">
        {[0.2, 0.4, 0.6, 0.8].map((position) => (
          <div
            key={position}
            className="absolute inset-x-0 border-t border-white/[0.05]"
            style={{ top: `${position * 100}%` }}
          />
        ))}
        <div
          className="absolute inset-y-0 w-px bg-accent-300/50 shadow-[0_0_16px_rgba(110,231,183,0.55)]"
          style={{ left: `${playheadPercent}%` }}
        />
        <span className="absolute top-3 left-4 rounded-full border border-white/10 bg-stage-950/70 px-2 py-0.5 text-[10px] tracking-wider text-stage-300 uppercase">
          Concert pitch
        </span>
      </div>

      {currentNote && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 border-y border-accent-400/20 bg-accent-400/[0.07]"
          style={{
            top: `calc(${yPercent(currentNote.midi)}% - 14px)`,
            height: "28px",
          }}
        />
      )}

      {notes.map((note, index) => {
        const noteEnd = note.startSec + note.durationSec;
        if (noteEnd < laneStart || note.startSec > laneEnd) {
          return null;
        }
        const evaluation = evaluations.get(index);
        const isCurrent = index === currentIndex;
        const style = evaluation ? RATING_STYLES[evaluation.rating] : null;
        const left = xPercent(note.startSec);
        const width = Math.max(1.4, (note.durationSec / laneSpanSec) * 100);
        const upcoming = !evaluation && !isCurrent;

        return (
          <div
            key={`${note.startSec}-${note.midi}-${note.durationSec}`}
            className={[
              "absolute flex h-7 -translate-y-1/2 items-center overflow-hidden rounded-md border px-1.5 text-[10px] font-semibold whitespace-nowrap transition-colors",
              style
                ? style.block
                : isCurrent
                  ? "border-white/70 bg-white text-stage-950 shadow-[0_0_22px_rgba(255,255,255,0.35)]"
                  : upcoming
                    ? "border-white/15 bg-stage-700/70 text-stage-300"
                    : "border-white/10 bg-stage-800/50 text-stage-500",
            ].join(" ")}
            style={{
              left: `${left}%`,
              width: `${width}%`,
              top: `${yPercent(note.midi)}%`,
            }}
          >
            {style
              ? width > 7
                ? `${style.symbol} ${midiToNoteName(note.midi)}`
                : style.symbol
              : width > 4
                ? midiToNoteName(note.midi)
                : ""}
          </div>
        );
      })}

      {currentNote && currentCents !== null && (
        <div
          aria-hidden="true"
          className="absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.9)]"
          style={{
            left: `${playheadPercent}%`,
            top: `${clamp(yPercent(currentNote.midi + currentCents / 100), 0, 100)}%`,
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-3 text-center">
      <div
        className={[
          "text-xl font-semibold tabular-nums",
          accent ? "text-accent-300" : "text-white",
        ].join(" ")}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] font-medium tracking-widest text-stage-300 uppercase">
        {label}
      </div>
    </div>
  );
}

export function GameScreen({
  config,
  track,
  onForfeit,
  onFinish,
  onPractice,
  onActiveChange,
}: GameScreenProps) {
  const performance = usePerformance({ config, track, onFinish, onForfeit });
  const reducedMotion = useReducedMotion();
  const [dialogMode, setDialogMode] = useState<"forfeit" | "pause" | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const forfeitButtonRef = useRef<HTMLButtonElement>(null);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);
  const instrument = performance.instrument ?? getInstrument(config.instrumentId);
  const keyTranspose = config.keyTransposeSemitones ?? config.transposeSemitones;
  const { phase, pause, resume } = performance;

  useEffect(() => {
    onActiveChange(phase === "playing");
    return () => onActiveChange(false);
  }, [onActiveChange, phase]);

  useEffect(() => {
    if (phase !== "playing") {
      return;
    }
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing" || dialogMode !== null) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDialogMode("forfeit");
        pause();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, dialogMode, pause]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (dialogMode !== null && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = "hidden";
    } else if (dialogMode === null && dialog.open) {
      dialog.close();
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [dialogMode]);

  const handleExit = () => {
    if (phase === "playing") {
      setDialogMode("forfeit");
      pause();
      return;
    }
    performance.forfeit();
  };

  const handlePause = () => {
    if (phase !== "playing" || dialogMode !== null) {
      return;
    }
    setDialogMode("pause");
    pause();
  };

  const handleKeepPlaying = () => {
    setDialogMode(null);
    void resume();
    requestAnimationFrame(() => forfeitButtonRef.current?.focus());
  };

  const handleResume = () => {
    setDialogMode(null);
    void resume();
    requestAnimationFrame(() => pauseButtonRef.current?.focus());
  };

  const handleForfeit = () => {
    setDialogMode(null);
    performance.forfeit();
  };

  if (phase === "error") {
    return (
      <div className="mx-auto w-full max-w-xl px-6 py-16">
        <p className="text-xs font-semibold tracking-[0.3em] text-rose-300 uppercase">
          Stage problem
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">We couldn't start</h1>
        <p className="mt-4 text-stage-300">{performance.error}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={() => void performance.start()}>Try again</Button>
          <Button variant="secondary" onClick={() => performance.forfeit()}>
            Back to soundcheck
          </Button>
        </div>
        <p className="mt-6 text-xs leading-relaxed text-slate-400">
          If the browser is blocking your input, check the site permissions and make sure the page
          is served over HTTPS or localhost.
        </p>
      </div>
    );
  }

  if (phase === "preparing") {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center px-6 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-accent-300" />
        <p className="mt-6 text-xs font-semibold tracking-[0.3em] text-accent-300 uppercase">
          Preparing the stage
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{track.title}</h1>
        <p className="mt-3 max-w-md text-stage-300">
          Loading the backing track and asking for microphone access. Allow the microphone when your
          browser asks.
        </p>
        <button
          type="button"
          onClick={handleExit}
          className="mt-8 inline-flex min-h-11 items-center text-sm text-stage-300 transition hover:text-white"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-xs font-semibold tracking-[0.35em] text-accent-300 uppercase">
          Get ready
        </p>
        <div
          role="status"
          aria-live="assertive"
          aria-atomic="true"
          className="mt-6 font-mono text-[9rem] leading-none font-semibold text-white tabular-nums sm:text-[12rem]"
        >
          <span key={performance.countdown} className="animate-pop inline-block">
            {performance.countdown}
          </span>
        </div>
        <p className="mt-6 text-stage-300">
          {track.title} · {instrument?.name ?? "Instrument"}
        </p>
        {keyTranspose !== 0 && (
          <p className="mt-2 text-sm text-accent-300">
            Backing key {keyTranspose > 0 ? "+" : ""}
            {keyTranspose} semitones.
          </p>
        )}
        {performance.fit && performance.fit.semitones !== 0 && (
          <p className="mt-2 text-sm text-accent-300">
            Fitted {performance.fit.semitones > 0 ? "up" : "down"}{" "}
            {Math.abs(performance.fit.semitones) === 12
              ? "an octave"
              : `${Math.abs(performance.fit.semitones) / 12} octaves`}{" "}
            to your range.
          </p>
        )}
        {performance.fit?.warning && (
          <p className="mt-2 max-w-md text-sm text-amber-200">{performance.fit.warning}</p>
        )}
        <p className="mt-6 max-w-md text-xs leading-relaxed text-slate-400">
          Wired headphones are best. Bluetooth adds latency.
        </p>
        <button
          type="button"
          onClick={handleExit}
          className="mt-8 inline-flex min-h-11 items-center text-sm text-stage-300 transition hover:text-white"
        >
          Cancel performance
        </button>
      </div>
    );
  }

  if (phase === "playing") {
    const live = performance.liveScore;
    const evaluations = new Map<number, NoteEvaluation>(
      (live?.notes ?? []).map((evaluation) => [evaluation.index, evaluation]),
    );
    const currentNote =
      performance.currentIndex === null ? null : performance.notes[performance.currentIndex];
    const lastEvaluation = live?.notes.at(-1);
    const lastRating = lastEvaluation ? RATING_STYLES[lastEvaluation.rating] : null;
    const cents = performance.currentCents;
    const centsLabel =
      cents === null ? "Listening" : `${cents > 0 ? "+" : ""}${Math.round(cents)} cents`;
    const centsColor =
      cents === null
        ? "text-stage-300"
        : Math.abs(cents) <= 30
          ? "text-accent-300"
          : Math.abs(cents) <= 80
            ? "text-amber-300"
            : "text-rose-300";
    const progress = clamp((performance.timeSec / performance.durationSec) * 100, 0, 100);

    return (
      <div className="mx-auto w-full max-w-5xl px-6 pt-2 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.3em] text-accent-300 uppercase">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent-400" />
              Performing
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {track.title}
            </h1>
            <p className="mt-1 text-stage-300">
              {config.playerName} · {instrument?.name ?? "Instrument"} · {track.artist}
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-4xl font-medium text-white tabular-nums">
              {formatClock(performance.timeSec)}
            </div>
            <div className="mt-1 text-[11px] tracking-widest text-stage-300 uppercase">
              of {formatClock(performance.durationSec)}
            </div>
          </div>
        </div>

        <div
          role="progressbar"
          aria-label="Performance progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-300 transition-[width] duration-200 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium tracking-[0.2em] text-stage-300 uppercase">
                  Pitch lane · concert pitch
                </p>
                <p className="mt-1 text-lg font-medium text-slate-100">
                  {currentNote ? midiToNoteName(currentNote.midi) : "—"}
                  <span className={`ml-3 text-sm font-normal ${centsColor}`}>{centsLabel}</span>
                </p>
                {currentNote?.lyric && (
                  <p className="mt-1 text-sm font-medium text-accent-300">“{currentNote.lyric}”</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {lastRating && lastEvaluation && (
                  <span
                    key={`${lastEvaluation.index}-${lastEvaluation.rating}`}
                    className={`animate-pop text-sm font-semibold ${lastRating.text}`}
                  >
                    {lastRating.symbol} {lastRating.label}
                  </span>
                )}
                {keyTranspose !== 0 && (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-medium tracking-wider text-stage-300 uppercase">
                    Key {keyTranspose > 0 ? "+" : ""}
                    {keyTranspose}
                  </span>
                )}
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-medium tracking-wider text-stage-300 uppercase">
                  {config.guideEnabled ? "Guide on" : "Clean backing"}
                </span>
              </div>
            </div>

            <PitchLane
              notes={performance.notes}
              timeSec={performance.timeSec}
              currentIndex={performance.currentIndex}
              currentCents={cents}
              evaluations={evaluations}
              reducedMotion={reducedMotion}
            />

            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {currentNote
                ? `Target ${midiToNoteName(currentNote.midi)}.`
                : "Waiting for the next note."}
            </p>
          </section>

          <aside className="space-y-3">
            <div className="rounded-3xl border border-white/10 bg-stage-900/70 p-4">
              <div className="text-[10px] font-medium tracking-widest text-stage-300 uppercase">
                Score
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-semibold text-accent-300 tabular-nums">
                  {Math.round(live?.totalPoints ?? 0)}
                </span>
                <span className="text-sm text-stage-300">/ {live?.maxPoints ?? 0}</span>
              </div>
              <div className="mt-2 text-sm text-stage-300">
                {Math.round((live?.accuracy ?? 0) * 100)}% points · {live?.notesHit ?? 0}/
                {live?.evaluatedNotes ?? 0} notes
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Streak" value={String(live?.currentStreak ?? 0)} accent />
              <Stat label="Notes hit" value={String(live?.notesHit ?? 0)} />
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm leading-relaxed text-stage-300">
              Match the highlighted note. Stay relaxed; the score forgives small tuning and timing
              differences.
            </div>
          </aside>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
          <p className="text-xs text-slate-400">
            {config.guideEnabled
              ? "Guide melody is playing quietly under the backing."
              : "Wired headphones recommended: the backing can leak into the microphone, and Bluetooth adds latency."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button ref={pauseButtonRef} variant="secondary" onClick={handlePause}>
              Pause
            </Button>
            <Button ref={forfeitButtonRef} variant="danger" onClick={handleExit}>
              Forfeit &amp; exit
            </Button>
          </div>
        </div>

        <dialog
          ref={dialogRef}
          onCancel={(event) => {
            event.preventDefault();
            if (dialogMode === "pause") {
              handleResume();
            } else {
              handleKeepPlaying();
            }
          }}
          aria-labelledby="dialog-title"
          className="m-auto w-full max-w-md rounded-3xl border border-white/10 bg-stage-900 p-6 text-left text-slate-100 shadow-2xl backdrop:bg-stage-950/80 backdrop:backdrop-blur"
        >
          {dialogMode === "pause" ? (
            <>
              <h2 id="dialog-title" className="text-2xl font-semibold tracking-tight">
                Paused
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-stage-300">
                The backing track and timer are paused. Resume when you are ready, or end the run.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button autoFocus onClick={handleResume}>
                  Resume
                </Button>
                <Button variant="danger" onClick={handleForfeit}>
                  Forfeit &amp; exit
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 id="dialog-title" className="text-2xl font-semibold tracking-tight">
                Forfeit this run?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-stage-300">
                Leaving now discards the score for this performance. You can start again from the
                soundcheck.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button autoFocus onClick={handleKeepPlaying}>
                  Keep playing
                </Button>
                <Button variant="danger" onClick={handleForfeit}>
                  Forfeit &amp; exit
                </Button>
              </div>
            </>
          )}
        </dialog>
      </div>
    );
  }

  if (phase === "finished") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-6">
        <p className="text-stage-300">Saving your performance…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-4 pb-16 text-center">
      <p className="text-xs font-semibold tracking-[0.35em] text-accent-300 uppercase">
        Ready when you are
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        {track.title}
      </h1>
      <p className="mt-3 text-stage-300">
        {config.playerName} · {instrument?.name ?? "Instrument"} · {track.artist} ·{" "}
        {formatClock(track.durationSec)}
      </p>

      <div className="relative mx-auto mt-8 max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-stage-900/70 p-6 shadow-2xl shadow-black/40">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.16),transparent_70%)]"
        />
        <div className="relative">
          <div className="grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
              <div className="text-[10px] tracking-widest text-stage-300 uppercase">Track key</div>
              <div className="mt-1 font-medium text-slate-100">{track.keySignature ?? "—"}</div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
              <div className="text-[10px] tracking-widest text-stage-300 uppercase">
                Backing key
              </div>
              <div className="mt-1 font-medium text-slate-100">
                {keyTranspose === 0
                  ? "Original"
                  : `${keyTranspose > 0 ? "+" : ""}${keyTranspose} st`}
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
              <div className="text-[10px] tracking-widest text-stage-300 uppercase">Tempo</div>
              <div className="mt-1 font-medium text-slate-100">
                {track.tempoBpm ? `${track.tempoBpm} BPM` : "—"}
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
              <div className="text-[10px] tracking-widest text-stage-300 uppercase">Guide</div>
              <div className="mt-1 font-medium text-slate-100">
                {config.guideEnabled ? "On" : "Off"}
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-stage-300">
            The backing track starts after a short countdown. Keep the tab visible and use wired
            headphones if you can, so the backing does not reach the microphone. Bluetooth adds
            latency.
          </p>
        </div>
      </div>

      <div className="mt-9 flex flex-col items-center gap-5">
        <Button
          size="xl"
          className="w-full max-w-sm text-2xl font-bold tracking-wide uppercase"
          onClick={() => void performance.start()}
        >
          Start performance
        </Button>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="secondary" onClick={onPractice}>
            Practice without scoring
          </Button>
          <button
            type="button"
            onClick={handleExit}
            className="inline-flex min-h-11 items-center text-sm text-stage-300 transition hover:text-white"
          >
            ← Back to soundcheck
          </button>
        </div>
      </div>
    </div>
  );
}
