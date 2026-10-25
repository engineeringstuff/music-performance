import { useState } from "react";
import type { GameConfig, ScoreSummary, TrackSummary } from "../shared/domain";
import { PREVIEW_CONFIG, PREVIEW_TRACK } from "./lib/preview";
import { GameScreen } from "./screens/GameScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";

type Screen =
  | { name: "welcome" }
  | { name: "setup" }
  | { name: "game"; config: GameConfig; track: TrackSummary }
  | { name: "results"; config: GameConfig; track: TrackSummary; score: ScoreSummary | null };

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

  const startPerformance = (config: GameConfig, track: TrackSummary) => {
    setScreen({ name: "game", config, track });
  };

  const finishPerformance = (
    config: GameConfig,
    track: TrackSummary,
    score: ScoreSummary | null,
  ) => {
    setScreen({ name: "results", config, track, score });
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
          Phase 1 scaffold
        </span>
      </header>

      <main className="flex-1">
        {screen.name === "welcome" && (
          <WelcomeScreen
            onStart={() => setScreen({ name: "setup" })}
            onPreview={
              import.meta.env.DEV
                ? () => startPerformance(PREVIEW_CONFIG, PREVIEW_TRACK)
                : undefined
            }
          />
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
            onFinish={(score) => finishPerformance(screen.config, screen.track, score)}
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
