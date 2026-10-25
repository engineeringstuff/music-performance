import { PitchDetector } from "pitchy";
import type { PitchFrame } from "../../shared/scoring";

export const PITCH_WINDOW_SIZE = 4096;

export class MicrophoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicrophoneError";
  }
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

/**
 * Captures a microphone stream and turns it into pitch frames. The analyser is
 * intentionally not connected to the speakers, so there is no feedback loop.
 */
export class MicrophonePitchSource {
  private readonly detector: PitchDetector<Float32Array>;
  private readonly sampleRate: number;
  private readonly buffer = new Float32Array(PITCH_WINDOW_SIZE);
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;

  constructor(private readonly context: AudioContext) {
    this.sampleRate = context.sampleRate;
    this.detector = PitchDetector.forFloat32Array(PITCH_WINDOW_SIZE);
    this.detector.clarityThreshold = 0.8;
    this.detector.minVolumeDecibels = -50;
  }

  async connect(): Promise<void> {
    this.disconnect();
    this.stream = await requestMicrophone();
    this.source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = PITCH_WINDOW_SIZE;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
  }

  read(timeSec: number): PitchFrame {
    if (!this.analyser) {
      return { timeSec, hz: 0, clarity: 0 };
    }
    this.analyser.getFloatTimeDomainData(this.buffer);
    const [hz, clarity] = this.detector.findPitch(this.buffer, this.sampleRate);
    return {
      timeSec,
      hz: Number.isFinite(hz) ? hz : 0,
      clarity: Number.isFinite(clarity) ? Math.max(0, Math.min(1, clarity)) : 0,
    };
  }

  disconnect(): void {
    this.source?.disconnect();
    this.analyser?.disconnect();
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = null;
    this.source = null;
    this.analyser = null;
  }
}
