import { Buffer } from "node:buffer";

export interface MidiNote {
  startTick: number;
  endTick: number;
  midi: number;
  channel: number;
  velocity: number;
}

export interface TempoEvent {
  tick: number;
  microsecondsPerQuarter: number;
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface ParsedMidi {
  format: number;
  division: number;
  trackCount: number;
  trackNames: string[];
  notes: MidiNote[];
  tempos: TempoEvent[];
  timeSignature: TimeSignature | null;
  endTick: number;
}

export interface WriteNote {
  midi: number;
  startBeats: number;
  durationBeats: number;
  velocity?: number;
}

export interface WriteTrack {
  name: string;
  channel: number;
  program?: number;
  notes: WriteNote[];
}

export interface WriteMidiOptions {
  tempoBpm: number;
  timeSignature?: [number, number];
  division?: number;
  tracks: WriteTrack[];
}

function readUInt32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32BE(offset);
}

function readUInt16(buffer: Buffer, offset: number): number {
  return buffer.readUInt16BE(offset);
}

function readVlq(data: Buffer, offset: number): { value: number; offset: number } {
  let value = 0;
  let cursor = offset;
  while (true) {
    const byte = data[cursor];
    if (byte === undefined) {
      throw new Error("Unexpected end of MIDI while reading a variable-length quantity");
    }
    cursor += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return { value, offset: cursor };
    }
  }
}

function writeVlq(value: number): Buffer {
  if (value < 0 || !Number.isFinite(value)) {
    throw new Error(`Invalid variable-length quantity: ${value}`);
  }
  const bytes = [value & 0x7f];
  let remaining = value >> 7;
  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>= 7;
  }
  return Buffer.from(bytes);
}

function trackChunks(buffer: Buffer): Buffer[] {
  if (buffer.subarray(0, 4).toString("ascii") !== "MThd") {
    throw new Error("Not a MIDI file: missing MThd header");
  }
  const headerLength = readUInt32(buffer, 4);
  const chunkCount = readUInt16(buffer, 10);
  const chunks: Buffer[] = [];
  let offset = 8 + headerLength;

  for (let index = 0; index < chunkCount; index += 1) {
    if (buffer.subarray(offset, offset + 4).toString("ascii") !== "MTrk") {
      throw new Error(`Expected MTrk chunk at offset ${offset}`);
    }
    const length = readUInt32(buffer, offset + 4);
    chunks.push(buffer.subarray(offset, offset + 8 + length));
    offset += 8 + length;
  }

  return chunks;
}

export function parseMidi(buffer: Buffer): ParsedMidi {
  if (buffer.subarray(0, 4).toString("ascii") !== "MThd") {
    throw new Error("Not a MIDI file: missing MThd header");
  }

  const headerLength = readUInt32(buffer, 4);
  const format = readUInt16(buffer, 8);
  const trackCount = readUInt16(buffer, 10);
  const division = readUInt16(buffer, 12);
  const notes: MidiNote[] = [];
  const tempos: TempoEvent[] = [];
  const trackNames: string[] = [];
  let timeSignature: TimeSignature | null = null;
  let endTick = 0;
  let offset = 8 + headerLength;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (buffer.subarray(offset, offset + 4).toString("ascii") !== "MTrk") {
      throw new Error(`Expected MTrk chunk at offset ${offset}`);
    }
    const length = readUInt32(buffer, offset + 4);
    const track = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;

    let cursor = 0;
    let tick = 0;
    let runningStatus: number | null = null;
    const active = new Map<string, number[]>();
    trackNames[trackIndex] = "";

    while (cursor < track.length) {
      const delta = readVlq(track, cursor);
      tick += delta.value;
      cursor = delta.offset;

      let status = track[cursor];
      if (status === undefined) {
        break;
      }

      if (status & 0x80) {
        cursor += 1;
      } else if (runningStatus !== null) {
        status = runningStatus;
      } else {
        throw new Error(`Missing running status at track ${trackIndex}, tick ${tick}`);
      }

      if (status === 0xff) {
        const metaType = track[cursor];
        cursor += 1;
        const metaLength = readVlq(track, cursor);
        cursor = metaLength.offset;
        const payload = track.subarray(cursor, cursor + metaLength.value);
        cursor += metaLength.value;

        if (metaType === 0x03) {
          trackNames[trackIndex] = payload.toString("utf8");
        } else if (metaType === 0x51 && payload.length === 3) {
          tempos.push({
            tick,
            microsecondsPerQuarter: (payload[0] << 16) | (payload[1] << 8) | (payload[2] ?? 0),
          });
        } else if (metaType === 0x58 && payload.length >= 2) {
          timeSignature = {
            numerator: payload[0] ?? 4,
            denominator: 2 ** (payload[1] ?? 2),
          };
        }

        if (metaType === 0x2f) {
          cursor = track.length;
        }
        runningStatus = null;
      } else if (status === 0xf0 || status === 0xf7) {
        const lengthValue = readVlq(track, cursor);
        cursor = lengthValue.offset + lengthValue.value;
        runningStatus = null;
      } else {
        runningStatus = status;
        const kind = status & 0xf0;
        const channel = status & 0x0f;

        if (kind === 0xc0 || kind === 0xd0) {
          cursor += 1;
        } else {
          const note = track[cursor];
          const velocity = track[cursor + 1] ?? 0;
          cursor += 2;
          if (note === undefined) {
            throw new Error(`Malformed note event in track ${trackIndex}`);
          }

          const key = `${channel}:${note}`;
          if (kind === 0x90 && velocity > 0) {
            const starts = active.get(key);
            if (starts) {
              starts.push(tick);
            } else {
              active.set(key, [tick]);
            }
          } else if (kind === 0x80 || (kind === 0x90 && velocity === 0)) {
            const starts = active.get(key);
            const startTick = starts?.shift();
            if (startTick !== undefined) {
              notes.push({
                startTick,
                endTick: tick,
                midi: note,
                channel,
                velocity,
              });
              endTick = Math.max(endTick, tick);
            }
          }
        }
      }

      endTick = Math.max(endTick, tick);
    }
  }

  tempos.sort((a, b) => a.tick - b.tick);
  notes.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi || a.channel - b.channel);

  return {
    format,
    division,
    trackCount,
    trackNames,
    notes,
    tempos,
    timeSignature,
    endTick,
  };
}

export function tickToSeconds(
  parsed: ParsedMidi,
  tick: number,
  tempoEvents = parsed.tempos,
): number {
  const nonNegativeTick = Math.max(0, tick);
  const tempos =
    tempoEvents.length > 0 ? tempoEvents : [{ tick: 0, microsecondsPerQuarter: 500000 }];
  let seconds = 0;
  let previousTick = 0;
  let microseconds = 500000;

  for (const tempo of tempos) {
    if (tempo.tick > nonNegativeTick) {
      break;
    }
    seconds += ((tempo.tick - previousTick) * microseconds) / 1_000_000 / parsed.division;
    previousTick = tempo.tick;
    microseconds = tempo.microsecondsPerQuarter;
  }

  seconds += ((nonNegativeTick - previousTick) * microseconds) / 1_000_000 / parsed.division;
  return seconds;
}

export function noteStartSeconds(parsed: ParsedMidi, note: MidiNote): number {
  return tickToSeconds(parsed, note.startTick);
}

export function noteEndSeconds(parsed: ParsedMidi, note: MidiNote): number {
  return tickToSeconds(parsed, note.endTick);
}

/** Keep only the requested raw track chunks, preserving their order. */
export function extractTracks(buffer: Buffer, indices: number[]): Buffer {
  const originalChunks = trackChunks(buffer);
  const headerLength = readUInt32(buffer, 4);
  const format = readUInt16(buffer, 8);
  const division = readUInt16(buffer, 12);
  const indicesToKeep = [...new Set(indices)].sort((a, b) => a - b);

  for (const index of indicesToKeep) {
    if (index < 0 || index >= originalChunks.length) {
      throw new Error(`Track index ${index} is out of range`);
    }
  }

  const header = Buffer.alloc(8 + headerLength);
  header.write("MThd", 0, "ascii");
  header.writeUInt32BE(headerLength, 4);
  header.writeUInt16BE(format, 8);
  header.writeUInt16BE(indicesToKeep.length, 10);
  header.writeUInt16BE(division, 12);

  const chunksToKeep = indicesToKeep.map((index) => {
    const chunk = originalChunks[index];
    if (!chunk) {
      throw new Error(`Track index ${index} is missing from the MIDI file`);
    }
    return chunk;
  });

  return Buffer.concat([header, ...chunksToKeep]);
}

function metaText(type: number, text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  return Buffer.concat([Buffer.from([0xff, type]), writeVlq(payload.length), payload]);
}

function tempoMeta(microsecondsPerQuarter: number): Buffer {
  const value = Math.round(microsecondsPerQuarter);
  return Buffer.from([0xff, 0x51, 0x03, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}

function timeSignatureMeta(numerator: number, denominator: number): Buffer {
  let power = 0;
  while (2 ** power < denominator) {
    power += 1;
  }
  return Buffer.from([0xff, 0x58, 0x04, numerator, power, 24, 8]);
}

interface TimedEvent {
  tick: number;
  order: number;
  bytes: Buffer;
}

function assembleTrack(events: TimedEvent[], endTick: number): Buffer {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const parts: Buffer[] = [];
  let previousTick = 0;

  for (const event of events) {
    parts.push(writeVlq(event.tick - previousTick), event.bytes);
    previousTick = event.tick;
  }

  parts.push(writeVlq(Math.max(0, endTick - previousTick)), Buffer.from([0xff, 0x2f, 0x00]));
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.write("MTrk", 0, "ascii");
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

export function writeMidi(options: WriteMidiOptions): Buffer {
  const division = options.division ?? 480;
  const tempoBpm = options.tempoBpm;
  if (!Number.isFinite(tempoBpm) || tempoBpm <= 0) {
    throw new Error(`Invalid tempo: ${tempoBpm}`);
  }

  const [numerator, denominator] = options.timeSignature ?? [4, 4];
  const allTicks = options.tracks.flatMap((track) =>
    track.notes.map((note) => Math.round((note.startBeats + note.durationBeats) * division)),
  );
  const endTick = Math.max(0, ...allTicks) + 1;

  const controlEvents: TimedEvent[] = [
    { tick: 0, order: 0, bytes: metaText(0x03, "control track") },
    { tick: 0, order: 1, bytes: tempoMeta(60_000_000 / tempoBpm) },
    { tick: 0, order: 2, bytes: timeSignatureMeta(numerator, denominator) },
  ];

  const chunks: Buffer[] = [assembleTrack(controlEvents, endTick)];

  for (const track of options.tracks) {
    const events: TimedEvent[] = [
      { tick: 0, order: 0, bytes: metaText(0x03, track.name) },
      {
        tick: 0,
        order: 1,
        bytes: Buffer.from([0xc0 | (track.channel & 0x0f), track.program ?? 0]),
      },
    ];

    for (const note of track.notes) {
      const startTick = Math.max(0, Math.round(note.startBeats * division));
      const endTickForNote = Math.max(
        startTick + 1,
        Math.round((note.startBeats + note.durationBeats) * division),
      );
      events.push({
        tick: startTick,
        order: 2,
        bytes: Buffer.from([0x90 | (track.channel & 0x0f), note.midi & 0x7f, note.velocity ?? 90]),
      });
      events.push({
        tick: endTickForNote,
        order: 1,
        bytes: Buffer.from([0x80 | (track.channel & 0x0f), note.midi & 0x7f, 0]),
      });
    }

    chunks.push(assembleTrack(events, endTick));
  }

  const header = Buffer.alloc(14);
  header.write("MThd", 0, "ascii");
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(chunks.length, 10);
  header.writeUInt16BE(division, 12);

  return Buffer.concat([header, ...chunks]);
}
