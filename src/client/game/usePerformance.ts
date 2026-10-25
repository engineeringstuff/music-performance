import { useCallback, useEffect, useRef, useState } from "react";
import type { RangeFit } from "../../shared/chart";
import { fitRange, transposeNotes } from "../../shared/chart";
import type {
  GameConfig,
  Instrument,
  TargetNote,
  TrackChart,
  TrackSummary,
} from "../../shared/domain";
import { getInstrument } from "../../shared/instruments";
import { midiToFrequency } from "../../shared/music";
import type { ScoreBreakdown } from "../../shared/scoring";
import {
  DEFAULT_SCORING,
  foldOctaveCents,
  type PitchFrame,
  scorePerformance,
} from "../../shared/scoring";
import { loadPerformance } from "../audio/loadPerformance";
import { MicrophonePitchSource, MidiPitchSource, type PitchSource } from "../audio/pitch";
import { loadAudioSettings, loadLatencyOffsetMs } from "../lib/preferences";

const COUNTDOWN_SECONDS = 3;
const SCORE_UPDATE_INTERVAL = 0.2;
const FINISH_GRACE_SEC = 0.25;

export type PerformancePhase =
  | "idle"
  | "preparing"
  | "countdown"
  | "playing"
  | "finished"
  | "error";

export interface PerformanceState {
  phase: PerformancePhase;
  countdown: number | null;
  timeSec: number;
  currentIndex: number | null;
  currentCents: number | null;
  liveScore: ScoreBreakdown | null;
  error: string | null;
  preparingMessage: string | null;
  instrument: Instrument | null;
  chart: TrackChart | null;
  notes: TargetNote[];
  fit: RangeFit | null;
}

interface UsePerformanceOptions {
  config: GameConfig;
  track: TrackSummary;
  onFinish: (score: ScoreBreakdown, transposeSemitones: number) => void;
  onForfeit: () => void;
}

const INITIAL_STATE: PerformanceState = {
  phase: "idle",
  countdown: null,
  timeSec: 0,
  currentIndex: null,
  currentCents: null,
  liveScore: null,
  error: null,
  preparingMessage: null,
  instrument: null,
  chart: null,
  notes: [],
  fit: null,
};

function findNoteIndex(notes: readonly TargetNote[], timeSec: number): number | null {
  if (notes.length === 0) {
    return null;
  }
  for (const [index, note] of notes.entries()) {
    if (timeSec >= note.startSec && timeSec <= note.startSec + note.durationSec) {
      return index;
    }
  }
  for (const [index, note] of notes.entries()) {
    if (note.startSec > timeSec) {
      return index;
    }
  }
  const last = notes[notes.length - 1];
  if (last && timeSec > last.startSec + last.durationSec + 0.5) {
    return null;
  }
  return notes.length - 1;
}

function centsFromFrame(frame: PitchFrame, targetMidi: number): number {
  return 1200 * Math.log2(frame.hz / midiToFrequency(targetMidi));
}

function scheduleCountIn(context: AudioContext, startTime: number): void {
  for (let index = 0; index < 3; index += 1) {
    const at = startTime - 3 + index;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = index === 0 ? 1046.5 : 880;
    gain.gain.setValueAtTime(0.16, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.07);
  }
}

export function usePerformance({ config, track, onFinish, onForfeit }: UsePerformanceOptions) {
  const [state, setState] = useState<PerformanceState>(INITIAL_STATE);
  const [paused, setPaused] = useState(false);

  const contextRef = useRef<AudioContext | null>(null);
  const pitchSourceRef = useRef<PitchSource | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const animationRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const framesRef = useRef<PitchFrame[]>([]);
  const startTimeRef = useRef(0);
  const durationRef = useRef(0);
  const notesRef = useRef<TargetNote[]>([]);
  const scoringOptionsRef = useRef({ ...DEFAULT_SCORING });
  const lastScoreAtRef = useRef(Number.NEGATIVE_INFINITY);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const fitRef = useRef<RangeFit | null>(null);
  const onFinishRef = useRef(onFinish);
  const onForfeitRef = useRef(onForfeit);

  onFinishRef.current = onFinish;
  onForfeitRef.current = onForfeit;

  const stopPlayback = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    sourcesRef.current = [];
    pitchSourceRef.current?.disconnect();
    pitchSourceRef.current = null;
    if (contextRef.current) {
      const context = contextRef.current;
      contextRef.current = null;
      void context.close().catch(() => undefined);
    }
    startedRef.current = false;
    activeRef.current = false;
    pausedRef.current = false;
    framesRef.current = [];
    setPaused(false);
  }, []);

  const fail = useCallback(
    (error: unknown) => {
      stopPlayback();
      setState((current) => ({
        ...current,
        phase: "error",
        countdown: null,
        error: error instanceof Error ? error.message : "The performance could not start.",
      }));
    },
    [stopPlayback],
  );

  const pause = useCallback(() => {
    if (!contextRef.current || pausedRef.current) {
      return;
    }
    pausedRef.current = true;
    setPaused(true);
    void contextRef.current.suspend().catch(() => undefined);
  }, []);

  const resume = useCallback(async () => {
    if (!contextRef.current || !pausedRef.current) {
      return;
    }
    try {
      await contextRef.current.resume();
    } catch {
      // The context may have been closed while the dialog was open.
    } finally {
      pausedRef.current = false;
      setPaused(false);
    }
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;

    const finalScore = scorePerformance(
      notesRef.current,
      framesRef.current,
      scoringOptionsRef.current,
    );

    stopPlayback();
    setState((current) => ({
      ...current,
      phase: "finished",
      countdown: null,
      timeSec: durationRef.current,
      liveScore: finalScore,
      currentCents: null,
    }));
    const keyTranspose = config.keyTransposeSemitones ?? config.transposeSemitones;
    onFinishRef.current(finalScore, keyTranspose + (fitRef.current?.semitones ?? 0));
  }, [config, stopPlayback]);

  const start = useCallback(async () => {
    if (
      activeRef.current ||
      state.phase === "preparing" ||
      state.phase === "countdown" ||
      state.phase === "playing"
    ) {
      return;
    }

    stopPlayback();
    activeRef.current = true;
    setState({
      ...INITIAL_STATE,
      phase: "preparing",
      preparingMessage: "Loading chart and audio…",
    });
    const instrument = getInstrument(config.instrumentId);
    if (!instrument) {
      fail(new Error(`Unknown instrument: ${config.instrumentId}`));
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;
    let pitchSource: PitchSource | null = null;

    try {
      const context = new AudioContext({ latencyHint: "interactive" });
      contextRef.current = context;
      await context.resume();

      const audioSettings = loadAudioSettings();
      const latencyMs = loadLatencyOffsetMs();
      pitchSource =
        config.inputMode === "midi"
          ? new MidiPitchSource(latencyMs / 1000)
          : new MicrophonePitchSource(context, latencyMs / 1000);
      pitchSourceRef.current = pitchSource;

      const keyTranspose = config.keyTransposeSemitones ?? config.transposeSemitones;
      const [loaded] = await Promise.all([
        loadPerformance(context, track, abort.signal, {
          loadGuide: config.guideEnabled,
          transposeSemitones: keyTranspose,
        }),
        pitchSource.connect(abort.signal),
      ]);

      if (abort.signal.aborted) {
        pitchSource.disconnect();
        stopPlayback();
        return;
      }

      const shiftedChart = transposeNotes(loaded.chart.notes, keyTranspose);
      const fit = fitRange(shiftedChart, instrument.range);
      const notes = transposeNotes(shiftedChart, fit.semitones);
      scoringOptionsRef.current = {
        ...DEFAULT_SCORING,
        transposeSemitones: 0,
        allowOctaveEquivalence: config.instrumentId === "vocals",
        onsetRequired: config.inputMode === "midi",
      };
      const contextStart = context.currentTime + COUNTDOWN_SECONDS;
      const performanceDuration = Math.min(
        track.durationSec,
        loaded.audio.backing.duration,
        loaded.audio.guide?.duration ?? Number.POSITIVE_INFINITY,
      );

      fitRef.current = fit;
      notesRef.current = notes;
      framesRef.current = [];
      startTimeRef.current = contextStart;
      durationRef.current = performanceDuration;
      lastScoreAtRef.current = Number.NEGATIVE_INFINITY;
      startedRef.current = false;
      finishedRef.current = false;
      pausedRef.current = false;

      scheduleCountIn(context, contextStart);

      const backingGain = context.createGain();
      backingGain.gain.value = audioSettings.backingVolume;
      backingGain.connect(context.destination);
      const backingSource = context.createBufferSource();
      backingSource.buffer = loaded.audio.backing;
      backingSource.connect(backingGain);
      backingSource.start(contextStart);
      sourcesRef.current.push(backingSource);

      if (loaded.audio.guide) {
        const guideGain = context.createGain();
        guideGain.gain.value = config.guideEnabled ? audioSettings.guideVolume : 0;
        guideGain.connect(context.destination);
        const guideSource = context.createBufferSource();
        guideSource.buffer = loaded.audio.guide;
        guideSource.connect(guideGain);
        guideSource.start(contextStart);
        sourcesRef.current.push(guideSource);
      }

      if (abort.signal.aborted) {
        pitchSource.disconnect();
        stopPlayback();
        return;
      }

      setState({
        ...INITIAL_STATE,
        phase: "countdown",
        preparingMessage: null,
        countdown: COUNTDOWN_SECONDS,
        instrument,
        chart: loaded.chart,
        notes,
        fit,
      });

      const loop = () => {
        const currentContext = contextRef.current;
        const currentMic = pitchSourceRef.current;
        if (!currentContext || !currentMic || finishedRef.current) {
          return;
        }

        if (pausedRef.current) {
          animationRef.current = requestAnimationFrame(loop);
          return;
        }

        const elapsed = currentContext.currentTime - startTimeRef.current;
        if (elapsed < 0) {
          setState((current) => ({
            ...current,
            phase: "countdown",
            countdown: Math.max(1, Math.ceil(-elapsed)),
          }));
          animationRef.current = requestAnimationFrame(loop);
          return;
        }

        if (!startedRef.current) {
          startedRef.current = true;
          setState((current) => ({ ...current, phase: "playing", countdown: null }));
        }

        let frame: PitchFrame;
        try {
          frame = currentMic.read(elapsed);
        } catch (error) {
          fail(error);
          return;
        }
        framesRef.current.push(frame);
        const noteIndex = findNoteIndex(notesRef.current, elapsed);
        const note = noteIndex === null ? null : notesRef.current[noteIndex];
        let cents: number | null = null;
        if (note && frame.hz > 0 && frame.clarity >= DEFAULT_SCORING.clarityThreshold) {
          const raw = centsFromFrame(frame, note.midi);
          cents = config.instrumentId === "vocals" ? foldOctaveCents(raw) : raw;
        }

        setState((current) => ({
          ...current,
          timeSec: Math.min(elapsed, durationRef.current),
          currentIndex: noteIndex,
          currentCents: cents,
        }));

        if (elapsed - lastScoreAtRef.current >= SCORE_UPDATE_INTERVAL) {
          lastScoreAtRef.current = elapsed;
          const liveScore = scorePerformance(
            notesRef.current,
            framesRef.current,
            scoringOptionsRef.current,
            elapsed,
          );
          setState((current) => ({ ...current, liveScore }));
        }

        if (elapsed >= durationRef.current + FINISH_GRACE_SEC) {
          finish();
          return;
        }

        animationRef.current = requestAnimationFrame(loop);
      };

      animationRef.current = requestAnimationFrame(loop);
    } catch (error) {
      pitchSource?.disconnect();
      if (abort.signal.aborted) {
        stopPlayback();
        return;
      }
      fail(error);
    }
  }, [config, fail, finish, state.phase, stopPlayback, track]);

  const forfeit = useCallback(() => {
    stopPlayback();
    setState(INITIAL_STATE);
    onForfeitRef.current();
  }, [stopPlayback]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  return {
    ...state,
    paused,
    start,
    pause,
    resume,
    forfeit,
    durationSec: durationRef.current || track.durationSec,
  };
}
