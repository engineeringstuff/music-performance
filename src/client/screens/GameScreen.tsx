import { useEffect, useState } from "react";
import type { GameConfig, ScoreSummary, TrackSummary } from "../../shared/domain";
import { getInstrument } from "../../shared/instruments";
import { Button } from "../components/Button";
import { formatClock } from "../lib/format";

interface GameScreenProps {
  config: GameConfig;
  track: TrackSummary;
  onForfeit: () => void;
  onFinish: (score: ScoreSummary | null) => void;
}

type Phase = "ready" | "countdown" | "live";

const DECORATIVE_BARS = [
  { id: "bar-1", height: 28 },
  { id: "bar-2", height: 52 },
  { id: "bar-3", height: 36 },
  { id: "bar-4", height: 70 },
  { id: "bar-5", height: 44 },
  { id: "bar-6", height: 62 },
  { id: "bar-7", height: 32 },
  { id: "bar-8", height: 76 },
  { id: "bar-9", height: 48 },
  { id: "bar-10", height: 58 },
  { id: "bar-11", height: 34 },
  { id: "bar-12", height: 66 },
  { id: "bar-13", height: 42 },
  { id: "bar-14", height: 72 },
  { id: "bar-15", height: 38 },
  { id: "bar-16", height: 54 },
];

export function GameScreen({ config, track, onForfeit, onFinish }: GameScreenProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);

  const instrument = getInstrument(config.instrumentId);
  const progress = track.durationSec > 0 ? Math.min(100, (elapsed / track.durationSec) * 100) : 0;

  useEffect(() => {
    if (phase !== "countdown") {
      return;
    }
    if (count === 0) {
      setPhase("live");
      return;
    }
    const timer = window.setTimeout(() => setCount((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, count]);

  useEffect(() => {
    if (phase !== "live") {
      return;
    }
    const startedAt = performance.now();
    setElapsed(0);
    const timer = window.setInterval(() => {
      setElapsed((performance.now() - startedAt) / 1000);
    }, 200);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") {
      return;
    }
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [phase]);

  const handleExit = () => {
    if (phase === "live") {
      const confirmed = window.confirm("Leaving now forfeits this performance. Exit anyway?");
      if (!confirmed) {
        return;
      }
    }
    onForfeit();
  };

  if (phase === "countdown") {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center px-6">
        <p className="text-xs font-semibold tracking-[0.35em] text-accent-300 uppercase">
          Get ready
        </p>
        <div
          key={count}
          className="animate-pop mt-6 font-mono text-[9rem] leading-none font-semibold text-white tabular-nums sm:text-[12rem]"
        >
          {count}
        </div>
        <p className="mt-6 text-stage-300">
          {track.title} · {instrument?.name ?? "Instrument"}
        </p>
        <button
          type="button"
          onClick={handleExit}
          className="mt-10 text-sm text-stage-300 transition hover:text-white"
        >
          Cancel performance
        </button>
      </div>
    );
  }

  if (phase === "live") {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 pt-2 pb-16">
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
              {formatClock(elapsed)}
            </div>
            <div className="mt-1 text-[11px] tracking-widest text-stage-300 uppercase">
              of {formatClock(track.durationSec)}
            </div>
          </div>
        </div>

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-300 transition-[width] duration-200 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="relative mt-8 overflow-hidden rounded-3xl border border-white/10 bg-stage-900/70 p-6 shadow-2xl shadow-black/40">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.14),transparent_65%)]"
          />
          <div className="relative">
            <div className="flex items-center justify-between text-[11px] font-medium tracking-[0.2em] text-stage-300 uppercase">
              <span>Live pitch lane</span>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-stage-300">
                Awaiting audio engine
              </span>
            </div>

            <div className="mt-5 flex h-48 items-end justify-center gap-1.5">
              {DECORATIVE_BARS.map((bar, index) => (
                <div
                  key={bar.id}
                  className="animate-pulse w-full max-w-2.5 rounded-full bg-gradient-to-t from-accent-500/25 to-accent-300/80"
                  style={{ height: `${bar.height}%`, animationDelay: `${index * 90}ms` }}
                />
              ))}
            </div>

            <p className="mt-6 rounded-2xl border border-white/5 bg-stage-950/60 px-4 py-3 text-sm leading-relaxed text-stage-300">
              This scaffold runs the stage and timing UI only. Microphone capture, pitch detection
              and the scoring engine are implemented in Phase 1.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <Button variant="danger" onClick={handleExit}>
            Forfeit &amp; exit
          </Button>
          <div className="flex items-center gap-3">
            {import.meta.env.DEV && (
              <Button variant="secondary" onClick={() => onFinish(null)}>
                Simulate finish
              </Button>
            )}
          </div>
        </div>
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

      <div className="relative mx-auto mt-10 max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-stage-900/70 p-6 shadow-2xl shadow-black/40">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.16),transparent_70%)]"
        />
        <div className="relative">
          <div className="flex h-32 items-end justify-center gap-1.5">
            {DECORATIVE_BARS.slice(0, 12).map((bar) => (
              <div
                key={bar.id}
                className="w-2.5 rounded-full bg-gradient-to-t from-accent-500/20 to-accent-300/65"
                style={{ height: `${Math.max(18, bar.height - 16)}%` }}
              />
            ))}
          </div>
          <p className="mt-5 text-sm text-stage-300">
            The backing track starts after a short countdown. Make sure your microphone is nearby.
          </p>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center gap-5">
        <Button
          size="xl"
          className="w-full max-w-sm text-2xl font-bold tracking-wide uppercase"
          onClick={() => {
            setCount(3);
            setElapsed(0);
            setPhase("countdown");
          }}
        >
          Start performance
        </Button>
        <button
          type="button"
          onClick={handleExit}
          className="text-sm text-stage-300 transition hover:text-white"
        >
          ← Back to soundcheck
        </button>
      </div>
    </div>
  );
}
