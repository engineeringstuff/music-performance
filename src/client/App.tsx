import { useEffect, useState } from "react";
import type { GameConfig, TrackSummary } from "../shared/domain";
import type { ScoreBreakdown } from "../shared/scoring";
import { GameScreen } from "./screens/GameScreen";
import { PitchLabScreen } from "./screens/PitchLabScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";

type Screen =
  | { name: "welcome" }
  | { name: "pitch-lab" }
  | { name: "setup" }
  | { name: "game"; config: GameConfig; track: TrackSummary }
  | { name: "results"; config: GameConfig; track: TrackSummary; score: ScoreBreakdown | null };

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 text-accent-400">
      <path
        fill="currentColor"
        d="M14.5 2v11.2a3.9 3.9 0 1 1-2-3.4V5.4l7-1.4v8.9a3.9 3.9 0 1 1-2-3.4V2.3z"
      />
    </svg>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "welcome" });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll when the screen changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.name]);

  const startPerformance = (config: GameConfig, track: TrackSummary) => {
    setScreen({ name: "game", config, track });
  };

  const finishPerformance = (
    config: GameConfig,
    track: TrackSummary,
    score: ScoreBreakdown | null,
    transposeSemitones = 0,
  ) => {
    setScreen({
      name: "results",
      config: { ...config, transposeSemitones },
      track,
      score,
    });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <span className="text-xs font-semibold tracking-[0.18em] whitespace-nowrap text-slate-200 uppercase sm:text-sm">
            Music Performance
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-medium tracking-wide whitespace-nowrap text-stage-300 uppercase sm:text-[11px]">
          Phase 1
        </span>
      </header>

      <main className="flex-1">
        {screen.name === "welcome" && (
          <WelcomeScreen
            onStart={() => setScreen({ name: "setup" })}
            onPitchLab={import.meta.env.DEV ? () => setScreen({ name: "pitch-lab" }) : undefined}
          />
        )}

        {screen.name === "pitch-lab" && (
          <PitchLabScreen onBack={() => setScreen({ name: "welcome" })} />
        )}

        {screen.name === "setup" && (
          <SetupScreen
            onBack={() => setScreen({ name: "welcome" })}
            onReady={(config, track) => startPerformance(config, track)}
          />
        )}

        {screen.name === "game" && (
          <GameScreen
            config={screen.config}
            track={screen.track}
            onForfeit={() => setScreen({ name: "setup" })}
            onFinish={(score, transposeSemitones) =>
              finishPerformance(screen.config, screen.track, score, transposeSemitones)
            }
          />
        )}

        {screen.name === "results" && (
          <ResultsScreen
            config={screen.config}
            track={screen.track}
            score={screen.score}
            onTryAgain={() => startPerformance(screen.config, screen.track)}
            onChangeSetup={() => setScreen({ name: "setup" })}
            onExit={() => setScreen({ name: "welcome" })}
          />
        )}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 pb-8 text-xs text-slate-400">
        Audio is captured and scored in your browser. Nothing is uploaded.
      </footer>
    </div>
  );
}
