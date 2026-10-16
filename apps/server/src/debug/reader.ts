import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { constants, createGunzip, gunzipSync } from "node:zlib";
import type { Readable } from "node:stream";

/**
 * Kayit okuyucu: sunucunun paneli ve `tools/debug/*` ayni kodu kullaniyor.
 *
 * Dosya art arda eklenmis gzip uyeleri; son uye yarim kalmis olabilir
 * (surec yazarken coktu). `Z_SYNC_FLUSH` ile sona kadar acilabilen kisim
 * okunuyor, yarim son satir atiliyor.
 */
export type RecordingLine = { k: string; [field: string]: unknown };

export type RecordingTimeline = {
  header?: RecordingLine;
  seconds: RecordingLine[];
  waves: RecordingLine[];
  spikes: RecordingLine[];
  clients: RecordingLine[];
  fingerprints: RecordingLine[];
  end?: RecordingLine;
  truncated?: RecordingLine;
  events: number;
  ticks: number;
  badLines: number;
};

function emptyTimeline(): RecordingTimeline {
  return { seconds: [], waves: [], spikes: [], clients: [], fingerprints: [], events: 0, ticks: 0, badLines: 0 };
}

function lineKind(line: string) {
  // Satirlar her zaman `{"k":"..."` ile basliyor (kaydedici boyle yaziyor).
  if (!line.startsWith("{\"k\":\"")) return "";
  const end = line.indexOf("\"", 6);
  return end > 6 ? line.slice(6, end) : "";
}

/** Zaman cizelgesine bir satir ekler; yeniden oynatma satirlari yalnizca sayiliyor. */
function addToTimeline(timeline: RecordingTimeline, line: string) {
  if (!line) return;
  const kind = lineKind(line);
  if (kind === "ev") {
    timeline.events += 1;
    return;
  }
  if (kind === "tk") {
    // Tick sayisi icin dizinin uzunlugu: ayrintili ayristirma gereksiz.
    try {
      const parsed = JSON.parse(line) as { dt?: unknown[] };
      timeline.ticks += Array.isArray(parsed.dt) ? parsed.dt.length : 0;
    } catch {
      timeline.badLines += 1;
    }
    return;
  }
  let parsed: RecordingLine;
  try {
    parsed = JSON.parse(line) as RecordingLine;
  } catch {
    timeline.badLines += 1;
    return;
  }
  switch (parsed.k) {
    case "hdr": timeline.header = parsed; break;
    case "sec": timeline.seconds.push(parsed); break;
    case "wave": timeline.waves.push(parsed); break;
    case "spike": timeline.spikes.push(parsed); break;
    case "cli": timeline.clients.push(parsed); break;
    case "fp": timeline.fingerprints.push(parsed); break;
    case "end": timeline.end = parsed; break;
    case "trunc": timeline.truncated = parsed; break;
    default: break;
  }
}

function gunzipStream(source: Readable) {
  const gunzip = createGunzip({ finishFlush: constants.Z_SYNC_FLUSH });
  source.on("error", (error) => gunzip.destroy(error));
  return source.pipe(gunzip);
}

/** Satir satir, olay dongusunu tikamadan (panel buyuk kayitta oyunu durdurmasin). */
export async function forEachRecordingLine(path: string, onLine: (line: string) => void) {
  const stream = gunzipStream(createReadStream(path));
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  let pending: string | undefined;
  try {
    for await (const line of lines) {
      if (pending !== undefined) onLine(pending);
      pending = line;
    }
  } catch {
    // Yarim son uye: okunabilen kisim islendi.
  }
  // Son satir yarim olabilir: ayristirilabiliyorsa isleniyor.
  if (pending !== undefined) {
    try {
      JSON.parse(pending);
      onLine(pending);
    } catch {
      // atildi
    }
  }
}

export async function readRecordingTimeline(path: string) {
  const timeline = emptyTimeline();
  await forEachRecordingLine(path, (line) => addToTimeline(timeline, line));
  return timeline;
}

/** Esanli: araclar ve testler icin (tum kayit bellekte). */
export function parseRecordingBuffer(buffer: Buffer): RecordingLine[] {
  let text: string;
  try {
    text = gunzipSync(buffer, { finishFlush: constants.Z_SYNC_FLUSH }).toString("utf8");
  } catch {
    text = buffer.toString("utf8");
  }
  const out: RecordingLine[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as RecordingLine);
    } catch {
      // yarim satir
    }
  }
  return out;
}

export function timelineFromLines(lines: readonly RecordingLine[]) {
  const timeline = emptyTimeline();
  for (const line of lines) {
    if (line.k === "ev") timeline.events += 1;
    else if (line.k === "tk") timeline.ticks += Array.isArray(line.dt) ? line.dt.length : 0;
    else addToTimeline(timeline, JSON.stringify(line));
  }
  return timeline;
}
