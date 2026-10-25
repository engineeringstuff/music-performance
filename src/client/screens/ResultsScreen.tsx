import type { GameConfig, ScoreSummary, TrackSummary } from "../../shared/domain";
import { getInstrument } from "../../shared/instruments";
import { Button } from "../components/Button";

interface ResultsScreenProps {
  config: GameConfig;
  track: TrackSummary;
  score: ScoreSummary | null;
  onTryAgain: () => void;
  onChangeSetup: () => void;
  onExit: () => void;
}

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
  onTryAgain,
  onChangeSetup,
  onExit,
}: ResultsScreenProps) {
  const instrument = getInstrument(config.instrumentId);

  return (
    <div className="animate-rise relative mx-auto w-full max-w-3xl px-6 pt-6 pb-16 text-center">
      <div
        aria-hidden="true"
        className="animate-glow pointer-events-none absolute top-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-accent-400/15 blur-3xl"
      />

      <div className="relative">
        <p className="text-xs font-semibold tracking-[0.35em] text-accent-300 uppercase">
          Performance complete
        </p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
          Encore!
        </h1>
        <p className="mt-4 text-stage-300">
          {config.playerName} · {instrument?.name ?? "Instrument"} · {track.title}
        </p>

        <div className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-stage-900/70 p-6 shadow-2xl shadow-black/40 sm:p-8">
          {score ? (
            <>
              <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-1">
                <span className="text-6xl font-semibold tracking-tight text-accent-300 tabular-nums sm:text-7xl">
                  {score.totalPoints}
                </span>
                <span className="pb-2 text-stage-300">/ {score.maxPoints} points</span>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Accuracy" value={`${Math.round(score.accuracy * 100)}%`} />
                <Stat label="Notes hit" value={String(score.notesHit)} />
                <Stat label="Notes missed" value={String(score.notesMissed)} />
                <Stat label="Best streak" value={String(score.longestStreak)} />
              </div>
            </>
          ) : (
            <div className="text-left">
              <p className="text-sm font-medium text-slate-100">Scoring engine not connected yet</p>
              <p className="mt-2 text-sm leading-relaxed text-stage-300">
                The stage completed without collecting a score. Phase 1 adds microphone capture,
                pitch tracking, range-aware targets and a points model, so this screen will show a
                real result.
              </p>
              <ul className="mt-5 grid gap-2 text-sm text-stage-300 sm:grid-cols-3">
                {["Pitch accuracy", "Timing windows", "Range forgiveness"].map((item) => (
                  <li
                    key={item}
                    className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={onTryAgain}>
            Try again
          </Button>
          <Button variant="secondary" size="lg" onClick={onChangeSetup}>
            Change setup
          </Button>
          <Button variant="ghost" size="lg" onClick={onExit}>
            Back to start
          </Button>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Results are not saved in this scaffold. Local history arrives with the scoring engine.
        </p>
      </div>
    </div>
  );
}
