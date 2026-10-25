import { useEffect, useRef, useState } from "react";
import type { GameConfig, TrackSummary } from "../../shared/domain";
import { getInstrument } from "../../shared/instruments";
import type { NoteRating, ScoreBreakdown } from "../../shared/scoring";
import { Button } from "../components/Button";
import { getBestResult, resultFromScore, type StoredResult, saveResult } from "../lib/results";

interface ResultsScreenProps {
  config: GameConfig;
  track: TrackSummary;
  score: ScoreBreakdown | null;
  initiallySaved?: boolean;
  onSaved?: () => void;
  onTryAgain: () => void;
  onChangeSetup: () => void;
  onExit: () => void;
  onHistory: () => void;
}

const RATING_COLORS: Record<NoteRating, string> = {
  perfect: "bg-emerald-400",
  great: "bg-teal-400",
  good: "bg-amber-400",
  miss: "bg-rose-500",
};

const CONFETTI_COLORS = ["#34d399", "#a78bfa", "#fbbf24", "#f472b6"];
const CONFETTI = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  left: (index * 37) % 100,
  delay: (index % 7) * 130,
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
}));

const RATING_SYMBOLS: Record<NoteRating, string> = {
  perfect: "★",
  great: "✓",
  good: "•",
  miss: "×",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-4 text-center">
      <div className="text-2xl font-semibold text-white tabular-nums">{value}</div>
      <div className="mt-1 text-[10px] font-medium tracking-widest text-stage-300 uppercase">
        {label}
      </div>
    </div>
  );
}

export function ResultsScreen({
  config,
  track,
  score,
  initiallySaved = false,
  onSaved,
  onTryAgain,
  onChangeSetup,
  onExit,
  onHistory,
}: ResultsScreenProps) {
  const instrument = getInstrument(config.instrumentId);
  const keyTranspose = config.keyTransposeSemitones ?? 0;
  const octaveShift = config.transposeSemitones - keyTranspose;
  const [best, setBest] = useState<StoredResult | null>(null);
  const [bestReadFailed, setBestReadFailed] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const [saveState, setSaveState] = useState<"none" | "saving" | "saved" | "failed">("none");
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied" | "failed">("idle");
  const savedRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!score || savedRef.current) {
      return;
    }
    savedRef.current = true;
    if (initiallySaved) {
      setSaveState("saved");
      return;
    }
    setSaveState("saving");

    void (async () => {
      let previous: StoredResult | null = null;
      let readFailed = false;
      try {
        previous = await getBestResult(track.id, config.instrumentId, octaveShift);
        setBest(previous);
      } catch {
        // A read failure must not prevent saving the current run.
        readFailed = true;
        setBestReadFailed(true);
      }

      try {
        await saveResult(resultFromScore(track, config, score));
        setSaveState("saved");
        onSaved?.();
        setIsNewBest(
          !config.guideEnabled && !readFailed && (!previous || score.accuracy > previous.accuracy),
        );
      } catch {
        setSaveState("failed");
      }
    })();
  }, [config, initiallySaved, octaveShift, onSaved, score, track]);

  const accuracy = score ? Math.round(score.accuracy * 100) : 0;
  const bestAccuracy = best ? Math.round(best.accuracy * 100) : null;

  const shareResult = async () => {
    if (!score) {
      return;
    }
    const text = `I scored ${Math.round(score.totalPoints)}/${score.maxPoints} (${accuracy}%) on ${track.title} in Music Performance.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Music Performance", text });
        setShareState("shared");
      } else {
        await navigator.clipboard.writeText(text);
        setShareState("copied");
      }
    } catch {
      setShareState("failed");
    }
  };

  return (
    <div className="animate-rise relative mx-auto w-full max-w-4xl px-6 pt-4 pb-16 text-center">
      <div
        aria-hidden="true"
        className="animate-glow pointer-events-none absolute top-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-accent-400/15 blur-3xl"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {CONFETTI.map((piece) => (
          <span
            key={piece.id}
            className="confetti-piece"
            style={{
              left: `${piece.left}%`,
              animationDelay: `${piece.delay}ms`,
              backgroundColor: piece.color,
            }}
          />
        ))}
      </div>

      <div className="relative">
        <p className="text-xs font-semibold tracking-[0.35em] text-accent-300 uppercase">
          Performance complete
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-4 text-5xl font-semibold tracking-tight text-balance outline-none sm:text-6xl"
        >
          Encore!
        </h1>
        <p className="mt-4 text-stage-300">
          {config.playerName} · {instrument?.name ?? "Instrument"} · {track.title}
        </p>
        {(keyTranspose !== 0 || octaveShift !== 0) && (
          <p className="mt-1 text-sm text-accent-300">
            {keyTranspose !== 0 &&
              `Backing key ${keyTranspose > 0 ? "+" : ""}${keyTranspose} semitones. `}
            {octaveShift !== 0 &&
              `Octave fit ${octaveShift > 0 ? "up" : "down"} ${
                Math.abs(octaveShift) === 12
                  ? "one octave"
                  : `${Math.abs(octaveShift) / 12} octaves`
              }.`}
          </p>
        )}

        {score ? (
          <>
            <div className="mt-9 overflow-hidden rounded-3xl border border-white/10 bg-stage-900/70 p-6 shadow-2xl shadow-black/40 sm:p-8">
              <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-1">
                <span className="text-6xl font-semibold tracking-tight text-accent-300 tabular-nums sm:text-7xl">
                  {Math.round(score.totalPoints)}
                </span>
                <span className="pb-2 text-stage-300">/ {score.maxPoints} points</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm">
                <span className="rounded-full border border-accent-400/30 bg-accent-400/10 px-3 py-1 font-medium text-accent-300">
                  {accuracy}% accuracy
                </span>
                {isNewBest && (
                  <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 font-medium text-amber-200">
                    New personal best
                  </span>
                )}
                {!isNewBest && bestAccuracy !== null && (
                  <span className="text-stage-300">Clean best: {bestAccuracy}%</span>
                )}
                {bestReadFailed && (
                  <span className="text-amber-200">
                    Best unavailable for this octave; the run was still saved.
                  </span>
                )}
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Notes hit" value={String(score.notesHit)} />
                <Stat label="Notes missed" value={String(score.notesMissed)} />
                <Stat label="Best streak" value={String(score.longestStreak)} />
                <Stat label="Pitch" value={`${Math.round(score.meanPitchQuality * 100)}%`} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stat label="Timing" value={`${Math.round(score.meanTimingQuality * 100)}%`} />
                <Stat label="Coverage" value={`${Math.round(score.meanCoverage * 100)}%`} />
              </div>

              <div className="mt-8">
                <div className="flex items-center justify-between text-[10px] font-medium tracking-widest text-stage-300 uppercase">
                  <span>Note by note</span>
                  <span>{score.notes.length} notes</span>
                </div>
                <div aria-hidden="true" className="mt-3 flex h-8 items-end gap-0.5">
                  {score.notes.map((evaluation) => (
                    <div
                      key={evaluation.index}
                      title={`Note ${evaluation.index + 1}: ${Math.round(evaluation.score)}/100`}
                      className={`min-w-0 flex-1 rounded-sm ${RATING_COLORS[evaluation.rating]}`}
                      style={{ height: `${Math.max(18, evaluation.score)}%` }}
                    />
                  ))}
                </div>
                <ul className="sr-only">
                  {score.notes.map((evaluation) => (
                    <li key={evaluation.index}>
                      Note {evaluation.index + 1}: {evaluation.rating},{" "}
                      {Math.round(evaluation.score)} out of 100
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap justify-center gap-4 text-[10px] tracking-wider text-stage-300 uppercase">
                  {(["perfect", "great", "good", "miss"] as const).map((rating) => (
                    <span key={rating} className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${RATING_COLORS[rating]}`} />
                      {RATING_SYMBOLS[rating]} {rating}
                    </span>
                  ))}
                </div>

                <div className="mt-6 border-t border-white/5 pt-5">
                  <div className="flex items-center justify-between text-[10px] font-medium tracking-widest text-stage-300 uppercase">
                    <span>Phrase trend</span>
                    <span>average note score</span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {(["Opening", "Second", "Third", "Final"] as const).map(
                      (phraseName, phraseIndex) => {
                        const size = Math.max(1, Math.ceil(score.notes.length / 4));
                        const phrase = score.notes.slice(
                          phraseIndex * size,
                          (phraseIndex + 1) * size,
                        );
                        const average =
                          phrase.length === 0
                            ? 0
                            : phrase.reduce((sum, note) => sum + note.score, 0) / phrase.length;
                        return (
                          <div key={phraseName} className="text-center" title={phraseName}>
                            <div className="flex h-16 items-end justify-center rounded-lg bg-white/[0.03] p-1">
                              <div
                                className="w-full rounded bg-gradient-to-t from-accent-500/70 to-accent-300"
                                style={{ height: `${Math.max(4, average)}%` }}
                              />
                            </div>
                            <div className="mt-1 text-[10px] text-stage-300">
                              {phraseIndex + 1} · {Math.round(average)}%
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-400" role="status" aria-live="polite">
              {shareState === "failed" && "Could not share the result. "}
              {saveState === "saved" && "Saved in this browser."}
              {saveState === "saving" && "Saving in this browser…"}
              {saveState === "failed" && "Could not save this result locally."}
              {config.guideEnabled &&
                " Guide-assisted runs are saved but do not set the clean best."}
            </p>
          </>
        ) : (
          <div className="mt-9 overflow-hidden rounded-3xl border border-white/10 bg-stage-900/70 p-6 text-left shadow-2xl shadow-black/40 sm:p-8">
            <p className="text-sm font-medium text-slate-100">No score was recorded</p>
            <p className="mt-2 text-sm leading-relaxed text-stage-300">
              Start a real performance to collect pitch, timing and coverage data.
            </p>
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={onTryAgain}>
            Try again
          </Button>
          <Button variant="secondary" size="lg" onClick={onChangeSetup}>
            Change setup
          </Button>
          <Button variant="secondary" size="lg" onClick={() => void shareResult()}>
            {shareState === "shared"
              ? "Shared"
              : shareState === "copied"
                ? "Copied"
                : "Share result"}
          </Button>
          <Button variant="ghost" size="lg" onClick={onHistory}>
            History
          </Button>
          <Button variant="ghost" size="lg" onClick={onExit}>
            Back to start
          </Button>
        </div>
      </div>
    </div>
  );
}
