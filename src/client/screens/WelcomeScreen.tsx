import { Button } from "../components/Button";

const RULES = [
  {
    title: "Choose your instrument",
    body: "Pick a voice or instrument, then pick a backing track to perform with.",
  },
  {
    title: "Wait for the countdown",
    body: "The big green button starts the track after a 3-2-1 countdown.",
  },
  {
    title: "Match the melody",
    body: "Pitch and timing both count. The target is shifted into a range that suits you.",
  },
  {
    title: "Finish to keep your score",
    body: "Exit at any time, but leaving mid-performance forfeits the run.",
  },
];

interface WelcomeScreenProps {
  onStart: () => void;
  onPreview?: () => void;
}

export function WelcomeScreen({ onStart, onPreview }: WelcomeScreenProps) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 pt-6 pb-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
      <section className="animate-rise">
        <p className="text-xs font-semibold tracking-[0.3em] text-accent-300 uppercase">
          A game of pitch and nerve
        </p>
        <h1 className="mt-5 text-5xl leading-[0.95] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
          Find your <span className="text-accent-300">note.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-stage-300">
          Perform the melody of a backing track on your instrument, or with your voice. The browser
          listens, follows the chart, and scores how closely you match each note.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Button size="lg" onClick={onStart}>
            Enter the stage
            <span aria-hidden="true">→</span>
          </Button>
          {onPreview && (
            <Button variant="ghost" size="lg" onClick={onPreview}>
              Preview game flow
            </Button>
          )}
        </div>

        <p className="mt-5 max-w-md text-xs leading-relaxed text-slate-400">
          Microphone access is requested only when a performance starts. Audio never leaves this
          browser. This is the Phase 1 scaffold: the stage is ready, the audio engine is next.
        </p>
      </section>

      <section className="animate-rise space-y-5 [animation-delay:120ms]">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-stage-900/70 p-5 shadow-2xl shadow-black/40 backdrop-blur">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(52,211,153,0.16),transparent_65%)]"
          />
          <div className="relative">
            <div className="flex items-center justify-between text-[11px] font-medium tracking-[0.2em] text-stage-300 uppercase">
              <span>Pitch monitor</span>
              <span className="flex items-center gap-2 text-accent-300">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
                Ready
              </span>
            </div>

            <div className="relative mt-4 h-52 overflow-hidden rounded-2xl border border-white/5 bg-stage-950/80">
              {[0, 1, 2, 3, 4].map((line) => (
                <div
                  key={line}
                  className="absolute right-0 left-0 border-t border-white/[0.06]"
                  style={{ top: `${22 + line * 14}%` }}
                />
              ))}
              <div className="absolute inset-x-5 top-[50%] h-10 -translate-y-1/2 rounded-xl border border-accent-400/30 bg-accent-400/10" />
              <div className="animate-glow absolute top-[50%] left-[56%] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-300 shadow-[0_0_26px_rgba(110,231,183,0.95)]" />
              <div className="absolute bottom-3 left-5 text-[10px] tracking-widest text-stage-300 uppercase">
                Target zone
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                ["Pitch", "—"],
                ["Timing", "—"],
                ["Streak", "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/5 bg-white/[0.03] py-3">
                  <div className="text-xl font-semibold text-slate-200">{value}</div>
                  <div className="mt-1 text-[10px] tracking-widest text-stage-300 uppercase">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <ol className="space-y-3">
          {RULES.map((rule, index) => (
            <li
              key={rule.title}
              className="flex gap-4 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3.5"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent-400/30 bg-accent-400/10 text-xs font-semibold text-accent-300">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-slate-100">{rule.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-stage-300">{rule.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
