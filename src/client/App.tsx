import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { GameConfig, TrackSummary } from "../shared/domain";
import type { ScoreBreakdown } from "../shared/scoring";
import { GameScreen } from "./screens/GameScreen";
import { PracticeScreen } from "./screens/PracticeScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";

const HistoryScreen = lazy(() =>
  import("./screens/HistoryScreen").then((module) => ({ default: module.HistoryScreen })),
);
const SettingsScreen = lazy(() =>
  import("./screens/SettingsScreen").then((module) => ({ default: module.SettingsScreen })),
);
const PitchLabScreen = lazy(() =>
  import("./screens/PitchLabScreen").then((module) => ({ default: module.PitchLabScreen })),
);

type Screen =
  | { name: "welcome" }
  | { name: "pitch-lab" }
  | { name: "settings" }
  | { name: "history" }
  | { name: "setup" }
  | { name: "game"; config: GameConfig; track: TrackSummary }
  | { name: "practice"; config: GameConfig; track: TrackSummary }
  | {
      name: "results";
      config: GameConfig;
      track: TrackSummary;
      score: ScoreBreakdown | null;
      saved: boolean;
    };

const RESULTS_SNAPSHOT_KEY = "music-performance:last-result:v1";

interface ResultsSnapshot {
  config: GameConfig;
  track: TrackSummary;
  score: ScoreBreakdown | null;
  saved: boolean;
}

function readResultsSnapshot(): ResultsSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(RESULTS_SNAPSHOT_KEY);
    if (!raw) {
      return null;
    }
    const value = JSON.parse(raw) as unknown;
    if (
      typeof value !== "object" ||
      value === null ||
      !("config" in value) ||
      !("track" in value)
    ) {
      return null;
    }
    const snapshot = value as Partial<ResultsSnapshot>;
    if (!snapshot.config || !snapshot.track) {
      return null;
    }
    return {
      config: snapshot.config,
      track: snapshot.track,
      score: snapshot.score ?? null,
      saved: snapshot.saved === true,
    };
  } catch {
    return null;
  }
}

function writeResultsSnapshot(snapshot: ResultsSnapshot): void {
  try {
    window.sessionStorage.setItem(RESULTS_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Results still render for this session.
  }
}

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

export function screenFromHash(hash: string): Screen | null {
  switch (hash.replace(/^#\/?/, "")) {
    case "":
    case "welcome":
      return { name: "welcome" };
    case "setup":
      return { name: "setup" };
    case "settings":
      return { name: "settings" };
    case "history":
      return { name: "history" };
    case "results": {
      const snapshot = readResultsSnapshot();
      return snapshot ? { name: "results", ...snapshot } : null;
    }
    case "pitch-lab":
      return { name: "pitch-lab" };
    default:
      return null;
  }
}

export function hashForScreen(screen: Screen): string {
  switch (screen.name) {
    case "setup":
      return "#/setup";
    case "settings":
      return "#/settings";
    case "history":
      return "#/history";
    case "results":
      return "#/results";
    case "pitch-lab":
      return "#/pitch-lab";
    default:
      return "#/";
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(
    () => screenFromHash(window.location.hash) ?? { name: "welcome" },
  );
  const mainRef = useRef<HTMLElement>(null);
  const performanceActiveRef = useRef(false);
  const historyReturnRef = useRef(false);

  const setPerformanceActive = useCallback((active: boolean) => {
    performanceActiveRef.current = active;
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      if (performanceActiveRef.current) {
        // A performance must be forfeited explicitly, not discarded by a hash link.
        window.history.replaceState(null, "", "#/");
        return;
      }
      const next = screenFromHash(window.location.hash);
      if (next) {
        setScreen(next);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const hash = hashForScreen(screen);
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [screen]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll and focus when the screen changes
  useEffect(() => {
    window.scrollTo(0, 0);
    mainRef.current?.focus();
  }, [screen.name]);

  const startPerformance = (config: GameConfig, track: TrackSummary) => {
    setScreen({ name: "game", config, track });
  };

  const startPractice = (config: GameConfig, track: TrackSummary) => {
    setScreen({ name: "practice", config, track });
  };

  const finishPerformance = (
    config: GameConfig,
    track: TrackSummary,
    score: ScoreBreakdown | null,
    transposeSemitones = 0,
  ) => {
    const snapshot: ResultsSnapshot = {
      config: { ...config, transposeSemitones },
      track,
      score,
      saved: false,
    };
    writeResultsSnapshot(snapshot);
    setScreen({ name: "results", ...snapshot });
  };

  const openHistoryFromResults = () => {
    historyReturnRef.current = true;
    setScreen({ name: "history" });
  };

  const handleHistoryBack = () => {
    if (historyReturnRef.current) {
      historyReturnRef.current = false;
      const snapshot = readResultsSnapshot();
      if (snapshot) {
        setScreen({ name: "results", ...snapshot });
        return;
      }
    }
    setScreen({ name: "welcome" });
  };

  const markResultsSaved = () => {
    setScreen((current) => {
      if (current.name !== "results") {
        return current;
      }
      const next = { ...current, saved: true };
      writeResultsSnapshot({
        config: next.config,
        track: next.track,
        score: next.score,
        saved: true,
      });
      return next;
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

      <main ref={mainRef} tabIndex={-1} className="flex-1 outline-none">
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] items-center justify-center px-6 text-stage-300">
              Loading…
            </div>
          }
        >
          {screen.name === "welcome" && (
            <WelcomeScreen
              onStart={() => setScreen({ name: "setup" })}
              onPitchLab={() => setScreen({ name: "pitch-lab" })}
            />
          )}

          {screen.name === "pitch-lab" && (
            <PitchLabScreen onBack={() => setScreen({ name: "welcome" })} />
          )}

          {screen.name === "settings" && (
            <SettingsScreen
              onBack={() => setScreen({ name: "welcome" })}
              onCleared={() => setScreen({ name: "welcome" })}
            />
          )}

          {screen.name === "history" && (
            <HistoryScreen
              onBack={handleHistoryBack}
              onSettings={() => setScreen({ name: "settings" })}
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
              onFinish={(score, transposeSemitones) =>
                finishPerformance(screen.config, screen.track, score, transposeSemitones)
              }
              onPractice={() => startPractice(screen.config, screen.track)}
              onActiveChange={setPerformanceActive}
            />
          )}

          {screen.name === "practice" && (
            <PracticeScreen
              config={screen.config}
              track={screen.track}
              onBack={() => startPerformance(screen.config, screen.track)}
            />
          )}

          {screen.name === "results" && (
            <ResultsScreen
              config={screen.config}
              track={screen.track}
              score={screen.score}
              initiallySaved={screen.saved}
              onSaved={markResultsSaved}
              onTryAgain={() => startPerformance(screen.config, screen.track)}
              onChangeSetup={() => setScreen({ name: "setup" })}
              onExit={() => setScreen({ name: "welcome" })}
              onHistory={openHistoryFromResults}
            />
          )}
        </Suspense>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-6 pb-8 text-xs text-slate-400">
        <span>Audio is captured and scored in your browser. Nothing is uploaded.</span>
        <div className="flex flex-wrap items-center gap-4">
          {screen.name !== "game" && screen.name !== "results" && (
            <>
              <a
                href="#/history"
                className="inline-flex min-h-11 items-center underline decoration-white/20 underline-offset-4 hover:text-white"
              >
                Local history
              </a>
              <a
                href="#/settings"
                className="inline-flex min-h-11 items-center underline decoration-white/20 underline-offset-4 hover:text-white"
              >
                Privacy &amp; data
              </a>
            </>
          )}
          <a
            href="/THIRD_PARTY_NOTICES.txt"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center underline decoration-white/20 underline-offset-4 hover:text-white"
          >
            Licences &amp; credits
          </a>
        </div>
      </footer>
    </div>
  );
}
