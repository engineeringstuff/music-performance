import { PitchDetector } from "pitchy";
import { midiToFrequency } from "../../shared/music";
import type { PitchFrame } from "../../shared/scoring";

export const PITCH_WINDOW_SIZE = 4096;

export class MicrophoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicrophoneError";
  }
}

export class MidiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MidiError";
  }
}

export interface PitchSource {
  connect(signal?: AbortSignal): Promise<void>;
  read(timeSec: number): PitchFrame;
  disconnect(): void;
}

function microphoneErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Microphone access was denied. Allow microphone access in your browser and try again.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No microphone was found. Connect a microphone and try again.";
      case "NotReadableError":
      case "TrackStartError":
        return "The microphone is busy in another app. Close other recording apps and try again.";
      case "SecurityError":
        return "Microphone access requires HTTPS or localhost.";
      default:
        return `Could not start the microphone (${error.name}).`;
    }
  }
  return error instanceof Error ? error.message : "Could not start the microphone.";
}

async function requestMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneError("Microphone access is not available in this browser.");
  }

  const preferred: MediaStreamConstraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  };

  try {
    return await navigator.mediaDevices.getUserMedia(preferred);
  } catch (error) {
    if (error instanceof DOMException && error.name === "OverconstrainedError") {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (fallbackError) {
        throw new MicrophoneError(microphoneErrorMessage(fallbackError));
      }
    }
    throw new MicrophoneError(microphoneErrorMessage(error));
  }
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

/**
 * The analyser returns the most recent 4096 samples, so the estimate describes
 * the centre of that window, not the instant it was read. Subtract half a
 * window plus the input latency reported by the browser to approximate when
 * the sound actually happened.
 */
export function correctedFrameTime(
  readTimeSec: number,
  sampleRate: number,
  inputLatencySec = 0,
): number {
  return readTimeSec - PITCH_WINDOW_SIZE / (2 * sampleRate) - inputLatencySec;
}

export function rootMeanSquare(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / samples.length));
}

/**
 * Captures a microphone stream and turns it into pitch frames. The analyser is
 * intentionally not connected to the speakers, so there is no feedback loop.
 *
 * `connect` is abort-aware: if the caller cancels while the permission prompt
 * or device initialization is pending, the newly acquired stream is stopped
 * before the rejection escapes.
 */
export class MicrophonePitchSource implements PitchSource {
  private readonly detector: PitchDetector<Float32Array>;
  private readonly sampleRate: number;
  private readonly buffer = new Float32Array(PITCH_WINDOW_SIZE);
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private inputLatencySec = 0;

  constructor(
    private readonly context: AudioContext,
    private readonly extraLatencyOffsetSec = 0,
  ) {
    this.sampleRate = context.sampleRate;
    this.detector = PitchDetector.forFloat32Array(PITCH_WINDOW_SIZE);
    this.detector.clarityThreshold = 0.75;
    this.detector.minVolumeDecibels = -50;
  }

  async connect(signal?: AbortSignal): Promise<void> {
    this.disconnect();
    if (signal?.aborted) {
      throw new DOMException("Microphone startup was cancelled", "AbortError");
    }

    const stream = await requestMicrophone();
    if (signal?.aborted) {
      stopStream(stream);
      throw new DOMException("Microphone startup was cancelled", "AbortError");
    }

    this.stream = stream;
    try {
      const track = stream.getAudioTracks()[0];
      const settings = track?.getSettings() as
        | (MediaTrackSettings & { latency?: number })
        | undefined;
      const latency = settings?.latency;
      this.inputLatencySec = typeof latency === "number" && Number.isFinite(latency) ? latency : 0;
      this.source = this.context.createMediaStreamSource(stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = PITCH_WINDOW_SIZE;
      this.analyser.smoothingTimeConstant = 0;
      this.source.connect(this.analyser);
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  read(timeSec: number): PitchFrame {
    const frameTime = correctedFrameTime(
      timeSec,
      this.sampleRate,
      this.inputLatencySec + this.extraLatencyOffsetSec,
    );
    if (!this.analyser) {
      return { timeSec: frameTime, hz: 0, clarity: 0, level: 0 };
    }
    this.analyser.getFloatTimeDomainData(this.buffer);
    const [hz, clarity] = this.detector.findPitch(this.buffer, this.sampleRate);
    return {
      timeSec: frameTime,
      hz: Number.isFinite(hz) ? hz : 0,
      clarity: Number.isFinite(clarity) ? Math.max(0, Math.min(1, clarity)) : 0,
      level: rootMeanSquare(this.buffer),
    };
  }

  disconnect(): void {
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.stream) {
      stopStream(this.stream);
    }
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.inputLatencySec = 0;
  }
}

/**
 * Turns Web MIDI note messages into the same frame stream as the microphone.
 * The onset flag preserves note-on articulation, which pitch analysis cannot
 * recover from a held tone.
 */
export class MidiPitchSource implements PitchSource {
  private inputs: MIDIInput[] = [];
  private readonly active = new Set<number>();
  private onsetPending = false;
  private onsetMidi: number | null = null;

  constructor(private readonly extraLatencyOffsetSec = 0) {}

  async connect(signal?: AbortSignal): Promise<void> {
    this.disconnect();
    if (!navigator.requestMIDIAccess) {
      throw new MidiError("Web MIDI is not available in this browser. Use the microphone instead.");
    }
    if (signal?.aborted) {
      throw new DOMException("MIDI startup was cancelled", "AbortError");
    }

    const access = await navigator.requestMIDIAccess({ sysex: false });
    if (signal?.aborted) {
      throw new DOMException("MIDI startup was cancelled", "AbortError");
    }
    this.inputs = [...access.inputs.values()];
    if (this.inputs.length === 0) {
      throw new MidiError("No MIDI input was found. Connect a keyboard and try again.");
    }
    for (const input of this.inputs) {
      input.onmidimessage = (event) => {
        if (event.data) {
          this.handleMessage(event.data);
        }
      };
    }
  }

  private handleMessage(data: Uint8Array): void {
    const status = (data[0] ?? 0) & 0xf0;
    const note = data[1];
    const velocity = data[2] ?? 0;
    if (note === undefined) {
      return;
    }
    if (status === 0x90 && velocity > 0) {
      this.active.add(note);
      this.onsetPending = true;
      this.onsetMidi = note;
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      this.active.delete(note);
    }
  }

  read(timeSec: number): PitchFrame {
    const highest = this.active.size > 0 ? Math.max(...this.active) : null;
    const onset = this.onsetPending;
    const onsetMidi = this.onsetPending ? (this.onsetMidi ?? undefined) : undefined;
    this.onsetPending = false;
    this.onsetMidi = null;
    return {
      timeSec: timeSec - this.extraLatencyOffsetSec,
      hz: highest === null ? 0 : midiToFrequency(highest),
      clarity: highest === null ? 0 : 1,
      level: highest === null ? 0 : 1,
      onset,
      onsetMidi,
    };
  }

  disconnect(): void {
    for (const input of this.inputs) {
      input.onmidimessage = null;
    }
    this.inputs = [];
    this.active.clear();
    this.onsetPending = false;
    this.onsetMidi = null;
  }
}
