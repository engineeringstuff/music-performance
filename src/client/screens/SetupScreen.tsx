import { type FormEvent, useEffect, useState } from "react";
import { fitRange, type RangeFit, transposeNotes } from "../../shared/chart";
import type { GameConfig, InputMode, InstrumentId, TrackSummary } from "../../shared/domain";
import { getInstrument, INSTRUMENTS } from "../../shared/instruments";
import { midiToNoteName } from "../../shared/music";
import { Button } from "../components/Button";
import { fetchTracks, preloadTrack } from "../lib/api";
import { formatClock } from "../lib/format";
import { loadLastConfig, loadProfile, saveLastConfig, saveProfile } from "../lib/storage";

interface SetupScreenProps {
  onBack: () => void;
  onReady: (config: GameConfig, track: TrackSummary) => void;
}

const DIFFICULTY_STYLES: Record<TrackSummary["difficulty"], string> = {
  easy: "border-accent-400/30 bg-accent-400/10 text-accent-300",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  hard: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

export function SetupScreen({ onBack, onReady }: SetupScreenProps) {
  const [name, setName] = useState(() => loadProfile()?.name ?? "");
  const [instrumentId, setInstrumentId] = useState<InstrumentId | null>(
    () => loadLastConfig()?.instrumentId ?? null,
  );
  const [trackId, setTrackId] = useState<string | null>(() => loadLastConfig()?.trackId ?? null);
  const [guideEnabled, setGuideEnabled] = useState(false);
  const [keyTranspose, setKeyTranspose] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>("microphone");
  const midiAvailable = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;

  const [tracks, setTracks] = useState<TrackSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [rangeFit, setRangeFit] = useState<RangeFit | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is an intentional retry trigger
  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);

    fetchTracks(controller.signal)
      .then((result) => {
        setTracks(result);
        setTrackId((current) =>
          current && result.some((track) => track.id === current) ? current : null,
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : "Could not load tracks");
      });

    return () => controller.abort();
  }, [reloadKey]);

  const instrument = instrumentId ? getInstrument(instrumentId) : undefined;
  const selectedTrack = tracks?.find((track) => track.id === trackId);
  const hasGuide = Boolean(selectedTrack?.guideUrl);
  const variants = selectedTrack?.audioVariants ?? [];
  const availableKeys = variants.map((variant) => variant.transposeSemitones);
  const effectiveKey = availableKeys.includes(keyTranspose) ? keyTranspose : 0;
  const canStart =
    name.trim().length > 0 && instrument !== undefined && selectedTrack !== undefined;

  useEffect(() => {
    if (!selectedTrack || !instrument) {
      setRangeFit(null);
      return;
    }
    const controller = new AbortController();
    setRangeFit(null);
    preloadTrack(selectedTrack, controller.signal, effectiveKey)
      .then((chart) => {
        if (!controller.signal.aborted) {
          setRangeFit(fitRange(transposeNotes(chart.notes, effectiveKey), instrument.range));
        }
      })
      .catch(() => {
        // Preloading is best effort; the performance screen reports real errors.
      });
    return () => controller.abort();
  }, [selectedTrack, instrument, effectiveKey]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!instrument || !selectedTrack) {
      return;
    }

    const config: GameConfig = {
      playerName: name.trim(),
      instrumentId: instrument.id,
      trackId: selectedTrack.id,
      transposeSemitones: effectiveKey,
      keyTransposeSemitones: effectiveKey,
      guideEnabled: hasGuide && guideEnabled,
      inputMode,
    };

    saveProfile(config.playerName);
    saveLastConfig({ instrumentId: instrument.id, trackId: selectedTrack.id });
    onReady(config, selectedTrack);
  };

  return (
    <div className="animate-rise mx-auto w-full max-w-4xl px-6 pt-2 pb-20">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center text-sm text-stage-300 transition hover:text-white"
      >
        ← Back
      </button>

      <form onSubmit={handleSubmit} className="mt-6 space-y-10">
        <header>
          <p className="text-xs font-semibold tracking-[0.3em] text-accent-300 uppercase">
            Soundcheck
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Set up your performance
          </h1>
          <p className="mt-3 max-w-2xl text-stage-300">
            Tell us who is playing, choose an instrument, then pick a track. Your details stay in
            this browser.
          </p>
        </header>

        <section>
          <label
            htmlFor="player-name"
            className="block text-sm font-medium tracking-wide text-slate-200"
          >
            Player name
          </label>
          <input
            id="player-name"
            name="playerName"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            autoComplete="nickname"
            placeholder="What should we call you?"
            className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-lg text-white placeholder:text-slate-400 focus:border-accent-400/60 focus:ring-2 focus:ring-accent-400/20 focus:outline-none"
          />
        </section>

        <fieldset>
          <legend className="text-sm font-medium tracking-wide text-slate-200">Input</legend>
          <p className="mt-1 text-sm text-stage-300">
            Use a microphone for an acoustic instrument or voice, or a MIDI keyboard for a digital
            instrument.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={inputMode === "microphone"}
              onClick={() => setInputMode("microphone")}
              className={[
                "min-h-11 rounded-full border px-4 text-sm font-medium transition",
                inputMode === "microphone"
                  ? "border-accent-400/60 bg-accent-400/10 text-accent-200"
                  : "border-white/10 bg-white/[0.02] text-stage-300 hover:text-white",
              ].join(" ")}
            >
              Microphone
            </button>
            {midiAvailable && (
              <button
                type="button"
                aria-pressed={inputMode === "midi"}
                onClick={() => setInputMode("midi")}
                className={[
                  "min-h-11 rounded-full border px-4 text-sm font-medium transition",
                  inputMode === "midi"
                    ? "border-accent-400/60 bg-accent-400/10 text-accent-200"
                    : "border-white/10 bg-white/[0.02] text-stage-300 hover:text-white",
                ].join(" ")}
              >
                MIDI keyboard
              </button>
            )}
          </div>
          {!midiAvailable && (
            <p className="mt-2 text-xs text-stage-300">
              Web MIDI is not available in this browser; the microphone will be used.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium tracking-wide text-slate-200">
            Your instrument
          </legend>
          <p className="mt-1 text-sm text-stage-300">
            Charts are shown at concert pitch and fitted to a comfortable range for each instrument.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INSTRUMENTS.map((option) => {
              const selected = option.id === instrumentId;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setInstrumentId(option.id)}
                  className={[
                    "group rounded-2xl border p-4 text-left transition duration-200",
                    selected
                      ? "border-accent-400/60 bg-accent-400/10 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-100">{option.name}</span>
                    <span
                      className={[
                        "h-2.5 w-2.5 rounded-full transition",
                        selected ? "bg-accent-400" : "bg-white/15 group-hover:bg-white/30",
                      ].join(" ")}
                    />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-stage-300">
                    {option.description}
                  </p>
                  <p className="mt-3 font-mono text-[11px] tracking-wide text-stage-300/80">
                    Concert range {midiToNoteName(option.range.minMidi)} –{" "}
                    {midiToNoteName(option.range.maxMidi)}
                  </p>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium tracking-wide text-slate-200">
            Backing track
          </legend>
          <p className="mt-1 text-sm text-stage-300">
            Every track ships with a pre-computed note chart and transparent licence metadata.
          </p>

          {tracks === null && loadError === null && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-stage-300">
              Loading tracks…
            </div>
          )}

          {loadError !== null && (
            <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6">
              <p className="text-sm text-rose-100">Could not load the track catalogue.</p>
              <p className="mt-1 font-mono text-xs text-rose-200/70">{loadError}</p>
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                Try again
              </Button>
            </div>
          )}

          {tracks !== null && tracks.length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6">
              <p className="text-sm font-medium text-slate-200">No tracks installed yet</p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-stage-300">
                The catalogue is empty. Phase 1 adds CC-licensed backing tracks with their audio and
                pre-computed charts. Add a manifest under{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-accent-300">
                  {"content/tracks/<id>"}
                </code>{" "}
                following{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-accent-300">
                  docs/002. TRACK-CONTENT.md
                </code>
                .
              </p>
            </div>
          )}

          {tracks !== null && tracks.length > 0 && (
            <div className="mt-4 space-y-3">
              {tracks.map((track) => {
                const selected = track.id === trackId;
                return (
                  <button
                    key={track.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTrackId(track.id)}
                    className={[
                      "flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 text-left transition duration-200",
                      selected
                        ? "border-accent-400/60 bg-accent-400/10"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-100">{track.title}</span>
                        <span
                          className={[
                            "rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                            DIFFICULTY_STYLES[track.difficulty],
                          ].join(" ")}
                        >
                          {track.difficulty}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-stage-300">
                        {track.artist} · {formatClock(track.durationSec)}
                        {track.keySignature ? ` · ${track.keySignature}` : ""}
                        {track.tempoBpm ? ` · ${track.tempoBpm} BPM` : ""} · {track.licence}
                      </p>
                    </div>
                    <span
                      className={[
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-accent-400 bg-accent-400 text-emerald-950"
                          : "border-white/20",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      {selected ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        {selectedTrack && variants.length > 1 && (
          <fieldset>
            <legend className="text-sm font-medium tracking-wide text-slate-200">
              Backing key
            </legend>
            <p className="mt-1 text-sm text-stage-300">
              These keys are pre-rendered so the accompaniment stays in tune. Octave fitting may
              still be applied automatically.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {variants.map((variant) => {
                const selected = variant.transposeSemitones === effectiveKey;
                const label =
                  variant.transposeSemitones === 0
                    ? "Original"
                    : `${variant.transposeSemitones > 0 ? "+" : ""}${variant.transposeSemitones} semitones`;
                return (
                  <button
                    key={variant.transposeSemitones}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setKeyTranspose(variant.transposeSemitones)}
                    className={[
                      "min-h-11 rounded-full border px-4 text-sm font-medium transition",
                      selected
                        ? "border-accent-400/60 bg-accent-400/10 text-accent-200"
                        : "border-white/10 bg-white/[0.02] text-stage-300 hover:border-white/20 hover:text-white",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {hasGuide && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={guideEnabled}
                onChange={(event) => setGuideEnabled(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-emerald-400"
              />
              <span>
                <span className="text-sm font-medium text-slate-100">Play guide melody</span>
                <span className="mt-1 block text-sm leading-relaxed text-stage-300">
                  Quietly plays the target melody under the backing track. Leave it off for the
                  cleanest score, or use it while learning the notes.
                </span>
              </span>
            </label>
          </section>
        )}

        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-4 text-sm leading-relaxed text-amber-100">
          Use wired headphones. Speakers can leak the backing into the microphone and inflate your
          score; Bluetooth adds latency.{" "}
          <a
            href="#/pitch-lab"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-amber-200/40 underline-offset-4 hover:text-white"
          >
            Test your microphone
          </a>
          .
        </div>

        {selectedTrack && (
          <details className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-100 marker:hidden">
              Credits &amp; licence for {selectedTrack.title}
            </summary>
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-stage-300">
              <p>
                <span className="text-slate-200">Composition licence:</span> {selectedTrack.licence}
              </p>
              <p>
                <span className="text-slate-200">Rendered audio:</span>{" "}
                {selectedTrack.audioLicence ?? "CC0 1.0"}
              </p>
              <p>
                <span className="text-slate-200">Attribution:</span> {selectedTrack.attribution}
              </p>
              {selectedTrack.soundfont && (
                <p>
                  <span className="text-slate-200">Soundfont:</span> {selectedTrack.soundfont}
                </p>
              )}
              <p>
                <a
                  href={selectedTrack.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-white/20 underline-offset-4 hover:text-white"
                >
                  Source / reference
                </a>{" "}
                ·{" "}
                <a
                  href="/THIRD_PARTY_NOTICES.txt"
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-white/20 underline-offset-4 hover:text-white"
                >
                  Third-party notices
                </a>
              </p>
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <p className="text-sm text-stage-300">
            {instrument
              ? `Concert range: ${midiToNoteName(instrument.range.minMidi)} – ${midiToNoteName(
                  instrument.range.maxMidi,
                )}`
              : "Choose an instrument to continue."}
            {rangeFit && (
              <span className="mt-1 block text-xs text-stage-300">
                {rangeFit.warning
                  ? rangeFit.warning
                  : rangeFit.semitones === 0
                    ? "Chart fits your range as written."
                    : `Chart fitted ${rangeFit.semitones > 0 ? "up" : "down"} an octave.`}
              </span>
            )}
          </p>
          <Button type="submit" size="lg" disabled={!canStart}>
            Continue to stage
            <span aria-hidden="true">→</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
