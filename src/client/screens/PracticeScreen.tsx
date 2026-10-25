import { useEffect, useRef, useState } from "react";
import { transposeNotes } from "../../shared/chart";
import type { GameConfig, TargetNote, TrackSummary } from "../../shared/domain";
import { midiToNoteName } from "../../shared/music";
import { Button } from "../components/Button";
import { formatClock } from "../lib/format";
import { loadAudioSettings } from "../lib/preferences";
import { parseTrackChart } from "../lib/validate";
import { advancePracticeClock, createPracticeClock } from "./practiceClock";

interface PracticeScreenProps {
  config: GameConfig;
  track: TrackSummary;
  onBack: () => void;
}

function findCurrentNote(notes: readonly TargetNote[], timeSec: number): TargetNote | null {
  for (const note of notes) {
    if (timeSec >= note.startSec && timeSec <= note.startSec + note.durationSec) {
      return note;
    }
  }
  return notes.find((note) => note.startSec > timeSec) ?? null;
}

export function PracticeScreen({ config, track, onBack }: PracticeScreenProps) {
  const keyTranspose = config.keyTransposeSemitones ?? config.transposeSemitones;
  const variant = track.audioVariants?.find(
    (candidate) => candidate.transposeSemitones === keyTranspose,
  );
  const variantError = track.audioVariants
    ? !variant
      ? `The backing key ${keyTranspose} is not available for this track.`
      : null
    : keyTranspose !== 0
      ? "This track does not ship pre-rendered key variants."
      : null;
  const backingUrl = variant?.audioUrl ?? (track.audioVariants ? "" : track.audioUrl);
  const guideUrl = variant?.guideUrl ?? (track.audioVariants ? undefined : track.guideUrl);
  const [notes, setNotes] = useState<TargetNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [guideOnly, setGuideOnly] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [rate, setRate] = useState(1);
  const [timeSec, setTimeSec] = useState(0);
  const backingRef = useRef<HTMLAudioElement>(null);
  const guideRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const clockRef = useRef(createPracticeClock(0, track.tempoBpm ?? 100));

  useEffect(() => {
    const controller = new AbortController();
    fetch(track.chartUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load the chart (${response.status})`);
        }
        const chart = parseTrackChart(await response.json());
        setNotes(transposeNotes(chart.notes, keyTranspose));
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Could not load the practice chart.");
        }
      });
    return () => controller.abort();
  }, [keyTranspose, track.chartUrl]);

  useEffect(() => {
    const backing = backingRef.current;
    const guide = guideRef.current;
    const settings = loadAudioSettings();
    if (backing) {
      backing.loop = loop;
      backing.playbackRate = rate;
      backing.preservesPitch = true;
      const backingWithWebkit = backing as HTMLAudioElement & {
        webkitPreservesPitch?: boolean;
      };
      backingWithWebkit.webkitPreservesPitch = true;
      backing.volume = guideOnly ? 0 : settings.backingVolume;
    }
    if (guide) {
      guide.loop = loop;
      guide.playbackRate = rate;
      guide.preservesPitch = true;
      const guideWithWebkit = guide as HTMLAudioElement & { webkitPreservesPitch?: boolean };
      guideWithWebkit.webkitPreservesPitch = true;
      guide.volume = guideOnly ? 0.8 : settings.guideVolume;
    }
    if (backing && guide && Math.abs(backing.currentTime - guide.currentTime) > 0.08) {
      guide.currentTime = backing.currentTime;
    }
  }, [loop, guideOnly, rate]);

  useEffect(() => {
    if (!playing) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    const bpm = track.tempoBpm ?? 100;
    const tick = () => {
      const backing = backingRef.current;
      const context = contextRef.current;
      if (backing) {
        const time = backing.currentTime;
        setTimeSec(time);

        const step = advancePracticeClock(clockRef.current, time, bpm);
        clockRef.current = step.clock;
        const guide = guideRef.current;
        if (guide) {
          if (step.looped || Math.abs(guide.currentTime - time) > 0.08) {
            guide.currentTime = time;
          }
        }

        if (metronome && context && step.click) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const now = context.currentTime;
          oscillator.frequency.value = 1000;
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(now);
          oscillator.stop(now + 0.07);
        }
      }
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [playing, metronome, track.tempoBpm]);

  useEffect(() => {
    return () => {
      backingRef.current?.pause();
      guideRef.current?.pause();
      if (contextRef.current) {
        void contextRef.current.close().catch(() => undefined);
      }
    };
  }, []);

  const play = async () => {
    if (variantError) {
      return;
    }
    setError(null);
    try {
      const backing = backingRef.current;
      const guide = guideRef.current;
      if (!backing) {
        return;
      }
      if (!contextRef.current) {
        contextRef.current = new AudioContext({ latencyHint: "interactive" });
        await contextRef.current.resume();
      }
      await backing.play();
      if (guide) {
        guide.currentTime = backing.currentTime;
        await guide.play();
      }
      clockRef.current = createPracticeClock(backing.currentTime, track.tempoBpm ?? 100);
      setPlaying(true);
    } catch (caught) {
      backingRef.current?.pause();
      guideRef.current?.pause();
      setPlaying(false);
      setError(caught instanceof Error ? caught.message : "Could not play the practice audio.");
    }
  };

  const pause = () => {
    backingRef.current?.pause();
    guideRef.current?.pause();
    setPlaying(false);
  };

  const stop = () => {
    pause();
    if (backingRef.current) {
      backingRef.current.currentTime = 0;
    }
    if (guideRef.current) {
      guideRef.current.currentTime = 0;
    }
    clockRef.current = createPracticeClock(0, track.tempoBpm ?? 100);
    setTimeSec(0);
  };

  const current = findCurrentNote(notes, timeSec);
  const upcoming = current
    ? notes.filter((note) => note.startSec > (current.startSec ?? 0)).slice(0, 4)
    : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-2 pb-16">
      <button
        type="button"
        onClick={() => {
          pause();
          onBack();
        }}
        className="inline-flex min-h-11 items-center text-sm text-stage-300 transition hover:text-white"
      >
        ← Back to stage
      </button>
      <p className="mt-6 text-xs font-semibold tracking-[0.3em] text-accent-300 uppercase">
        Practice · no score
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{track.title}</h1>
      <p className="mt-2 text-stage-300">
        {track.artist} · {track.keySignature ?? "Concert pitch"}
        {keyTranspose !== 0 ? ` · ${keyTranspose > 0 ? "+" : ""}${keyTranspose} semitones` : ""}
      </p>

      {(error || variantError) && (
        <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error ?? variantError}
        </div>
      )}

      <div className="mt-6 rounded-3xl border border-white/10 bg-stage-900/70 p-6">
        <p className="text-[10px] font-medium tracking-widest text-stage-300 uppercase">
          Current target · concert pitch
        </p>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <span className="font-mono text-6xl font-semibold text-accent-300">
              {current ? midiToNoteName(current.midi) : "—"}
            </span>
            {current?.lyric && (
              <p className="mt-2 text-lg font-medium text-accent-300">“{current.lyric}”</p>
            )}
          </div>
          <div className="font-mono text-2xl text-stage-300 tabular-nums">
            {formatClock(timeSec)} / {formatClock(track.durationSec)}
          </div>
        </div>
        <p className="mt-4 text-sm text-stage-300">
          Up next:{" "}
          {upcoming.length > 0
            ? upcoming.map((note) => midiToNoteName(note.midi)).join(" · ")
            : "end of track"}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {playing ? (
          <Button variant="secondary" onClick={pause}>
            Pause
          </Button>
        ) : (
          <Button onClick={() => void play()} disabled={Boolean(variantError)}>
            Play practice
          </Button>
        )}
        <Button variant="ghost" onClick={stop}>
          Reset
        </Button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-12 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 text-sm text-slate-200">
          Loop
          <input
            type="checkbox"
            checked={loop}
            onChange={(event) => setLoop(event.target.checked)}
            className="h-4 w-4 accent-emerald-400"
          />
        </label>
        <label className="flex min-h-12 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 text-sm text-slate-200">
          Guide only
          <input
            type="checkbox"
            checked={guideOnly}
            onChange={(event) => setGuideOnly(event.target.checked)}
            disabled={!guideUrl}
            className="h-4 w-4 accent-emerald-400 disabled:opacity-40"
          />
        </label>
        <label className="flex min-h-12 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 text-sm text-slate-200">
          Metronome
          <input
            type="checkbox"
            checked={metronome}
            onChange={(event) => setMetronome(event.target.checked)}
            className="h-4 w-4 accent-emerald-400"
          />
        </label>
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 text-sm text-slate-200">
          Speed
          <select
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            className="rounded-lg border border-white/10 bg-stage-900 px-2 py-1 text-slate-100"
          >
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
          </select>
        </label>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        Practice mode does not request the microphone or collect a score. Slow speeds use the
        browser’s pitch-preserving playback.
      </p>

      {/* biome-ignore lint/a11y/useMediaCaption: instrumental practice audio has no speech */}
      <audio
        ref={backingRef}
        src={backingUrl}
        preload="auto"
        onEnded={() => {
          if (!loop) {
            backingRef.current?.pause();
            guideRef.current?.pause();
            setPlaying(false);
          }
        }}
      />
      {guideUrl && (
        // biome-ignore lint/a11y/useMediaCaption: instrumental practice audio has no speech
        <audio ref={guideRef} src={guideUrl} preload="auto" />
      )}
    </div>
  );
}
