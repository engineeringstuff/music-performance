import { useEffect, useRef, useState } from "react";
import { frequencyToMidi, midiToNoteName } from "../../shared/music";
import { MicrophonePitchSource } from "../audio/pitch";
import { Button } from "../components/Button";

interface PitchLabScreenProps {
  onBack: () => void;
}

interface Reading {
  hz: number;
  clarity: number;
  midi: number;
  cents: number;
}

export function PitchLabScreen({ onBack }: PitchLabScreenProps) {
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connectingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const microphoneRef = useRef<MicrophonePitchSource | null>(null);
  const animationRef = useRef<number | null>(null);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    connectingRef.current = false;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    microphoneRef.current?.disconnect();
    microphoneRef.current = null;
    if (contextRef.current) {
      const context = contextRef.current;
      contextRef.current = null;
      void context.close().catch(() => undefined);
    }
    setActive(false);
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
      microphoneRef.current?.disconnect();
      if (contextRef.current) {
        void contextRef.current.close().catch(() => undefined);
      }
    };
  }, []);

  const start = async () => {
    if (connectingRef.current || active) {
      return;
    }
    connectingRef.current = true;
    setConnecting(true);
    setError(null);
    setReading(null);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const context = new AudioContext({ latencyHint: "interactive" });
      contextRef.current = context;
      await context.resume();
      const microphone = new MicrophonePitchSource(context);
      microphoneRef.current = microphone;
      await microphone.connect(abort.signal);
      if (abort.signal.aborted) {
        microphone.disconnect();
        return;
      }
      setActive(true);

      const loop = () => {
        if (!contextRef.current || !microphoneRef.current) {
          return;
        }
        const frame = microphoneRef.current.read(contextRef.current.currentTime);
        if (frame.hz > 0 && frame.clarity > 0) {
          const exactMidi = frequencyToMidi(frame.hz);
          const nearest = Math.round(exactMidi);
          setReading({
            hz: frame.hz,
            clarity: frame.clarity,
            midi: nearest,
            cents: (exactMidi - nearest) * 100,
          });
        } else {
          setReading(null);
        }
        animationRef.current = requestAnimationFrame(loop);
      };
      animationRef.current = requestAnimationFrame(loop);
    } catch (caught) {
      if (!abort.signal.aborted) {
        stop();
        setError(caught instanceof Error ? caught.message : "Could not start the microphone.");
      }
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pt-2 pb-16">
      <button
        type="button"
        onClick={() => {
          stop();
          onBack();
        }}
        className="inline-flex min-h-11 items-center text-sm text-stage-300 transition hover:text-white"
      >
        ← Back
      </button>
      <p className="mt-6 text-xs font-semibold tracking-[0.3em] text-accent-300 uppercase">
        Before you play
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Microphone check</h1>
      <p className="mt-3 text-stage-300">
        Check the microphone without a backing track. Play or sing a steady note and compare the
        reading with a tuner. Wired headphones are recommended; Bluetooth adds latency.
      </p>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="mt-8 rounded-3xl border border-white/10 bg-stage-900/70 p-6 text-center">
        <div className="text-[10px] font-medium tracking-widest text-stage-300 uppercase">
          {active ? "Listening" : "Microphone off"}
        </div>
        <div className="mt-4 flex items-baseline justify-center gap-3">
          <span className="font-mono text-6xl font-semibold text-accent-300 tabular-nums">
            {reading ? midiToNoteName(reading.midi) : "—"}
          </span>
          <span className="text-lg text-stage-300">
            {reading ? `${reading.cents > 0 ? "+" : ""}${Math.round(reading.cents)} cents` : ""}
          </span>
        </div>
        <div className="mt-4 font-mono text-sm text-stage-300 tabular-nums">
          {reading ? `${reading.hz.toFixed(2)} Hz · clarity ${reading.clarity.toFixed(2)}` : " "}
        </div>
        <div className="mx-auto mt-5 h-1.5 max-w-sm overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-300 transition-[width] duration-100"
            style={{ width: `${Math.round((reading?.clarity ?? 0) * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {active ? (
          <Button variant="secondary" onClick={stop}>
            Stop listening
          </Button>
        ) : (
          <Button onClick={() => void start()} disabled={connecting}>
            {connecting ? "Connecting…" : "Start listening"}
          </Button>
        )}
        <p className="text-xs text-slate-400">Readings are approximate; use a clean single note.</p>
      </div>
    </div>
  );
}
