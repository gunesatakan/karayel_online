/**
 * Seri anonslarinin web surumu.
 *
 * Kaynak: assets-src/streak/ (pakete girmiyor). Sekiz satir ATLAS'in sesi
 * (ElevenLabs, ucretli plan, telsiz zinciri uygulanmis ustalar; LEGENDARY
 * WAV), GRANTED gelistiricinin eski kaydi (streak-granted_developer.mp3).
 *
 * Cikti: apps/web/public/audio/streak-<kademe>.mp3. ATLAS telsiz satirlariyla
 * ayni kodlama (`ATLAS_ENCODING`: mono, 44,1 kHz, 64 kb/s, iki gecisli
 * loudnorm ~-18 LUFS, gercek tepe <= -1.5 dBTP): ikisi ayni seslendirme
 * kanalinda caliyor, biri digerinden yuksek kalmasin. Eski seri klipleri
 * -8..-13 LUFS idi; GRANTED da bu yuzden ayni hedefe indirildi.
 * Istemci adresleri `KILL_STREAK_VOICE_URLS` (packages/shared/src/feedback/streak.ts).
 *
 *   node tools/build-streak-voice.mjs [--ffmpeg <ffmpeg.exe>]
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ATLAS_ENCODING, measureEbur128 } from "./build-atlas-voice.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const STREAK_SOURCE_DIR = join(ROOT, "assets-src", "streak");
export const STREAK_OUTPUT_DIR = join(ROOT, "apps", "web", "public", "audio");

/** Kademe -> usta -> cikti. Sira kademe sirasi (en dusukten). */
export const STREAK_VOICE_LINES = [
  { tier: "notBad", source: "notbad-1_ATLAS.mp3", output: "streak-notbad.mp3" },
  { tier: "good", source: "good-1_ATLAS.mp3", output: "streak-good.mp3" },
  { tier: "granted", source: "streak-granted_developer.mp3", output: "streak-granted.mp3" },
  { tier: "unstoppable", source: "unstopable-1_ATLAS.mp3", output: "streak-unstoppable.mp3" },
  { tier: "rampage", source: "rampage-1_ATLAS.mp3", output: "streak-rampage.mp3" },
  { tier: "slaughter", source: "slaughter-1_ATLAS.mp3", output: "streak-slaughter.mp3" },
  { tier: "legendary", source: "legendary-only_ATLAS.wav", output: "streak-legendary.mp3" },
  { tier: "madeForThis", source: "i-made-you-for-this_ATLAS.mp3", output: "streak-made-for-this.mp3" },
  { tier: "whatAreYou", source: "what-are-you_ATLAS.mp3", output: "streak-what-are-you.mp3" }
];

function run(ffmpeg, args) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-y", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg ${args.join(" ")}\n${result.stderr}`);
  return result.stderr;
}

/** Hedeften bu kadar (LU) sapan cikti ikinci yoldan yeniden kodlaniyor. */
const LOUDNESS_TOLERANCE_LU = 0.5;
/** Ikinci yolun sinirlayici tavani (ornek tepe, dBFS); MP3 tasmasina pay. */
const LIMITER_CEILING_DB = -3;

/**
 * Once build-atlas-voice.mjs ile ayni iki gecis (olc, dogrusal loudnorm).
 * Kisa ve sessiz bir klipte tepe payi yetmezse loudnorm dinamik moda dusup
 * hedefin 1-2 LU altinda kaliyor; o zaman sabit kazanc + tepe sinirlayici
 * (yalnizca tepeleri kirpiyor, yukseklik hedefte kaliyor).
 */
export function encode(ffmpeg, source, target) {
  const { targetLufs, encodeTruePeakDb: truePeakDb, lra, sampleRate } = ATLAS_ENCODING;
  const log = run(ffmpeg, ["-i", source, "-af", `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}:print_format=json`, "-f", "null", "-"]);
  const m = JSON.parse(log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1));
  const filter = `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}`
    + `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}`
    + `:offset=${m.target_offset}:linear=true,aresample=${sampleRate}`;
  encodeWith(ffmpeg, source, target, filter);
  const first = measureEbur128(ffmpeg, target);
  if (Math.abs(first.lufs - targetLufs) <= LOUDNESS_TOLERANCE_LU) {
    return "loudnorm";
  }
  // Kazanc olculen ciktiya gore duzeltiliyor (stereo usta monoya inince
  // yukseklik degisiyor, sinirlayici da biraz yiyor); en fazla uc tur.
  let gainDb = targetLufs - Number(m.input_i);
  const ceiling = 10 ** (LIMITER_CEILING_DB / 20);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    encodeWith(ffmpeg, source, target, `aresample=${sampleRate * 4},volume=${gainDb.toFixed(2)}dB,alimiter=limit=${ceiling.toFixed(4)}:attack=2:release=40:level=disabled,aresample=${sampleRate}`);
    const measured = measureEbur128(ffmpeg, target).lufs;
    if (Math.abs(measured - targetLufs) <= LOUDNESS_TOLERANCE_LU) break;
    gainDb += targetLufs - measured;
  }
  return "gain+limiter";
}

function encodeWith(ffmpeg, source, target, filter) {
  const { sampleRate, channels, bitrateKbps } = ATLAS_ENCODING;
  run(ffmpeg, [
    "-i", source,
    "-af", filter,
    "-ac", String(channels),
    "-ar", String(sampleRate),
    "-map_metadata", "-1",
    "-fflags", "+bitexact",
    "-flags:a", "+bitexact",
    "-c:a", "libmp3lame",
    "-b:a", `${bitrateKbps}k`,
    "-id3v2_version", "0",
    "-write_id3v1", "0",
    target
  ]);
}

function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf("--ffmpeg");
  const ffmpeg = (index >= 0 ? args[index + 1] : undefined) ?? process.env.FFMPEG ?? "ffmpeg";
  for (const line of STREAK_VOICE_LINES) {
    const source = join(STREAK_SOURCE_DIR, line.source);
    if (!existsSync(source)) throw new Error(`usta yok: ${source}`);
    const target = join(STREAK_OUTPUT_DIR, line.output);
    const method = encode(ffmpeg, source, target);
    const loudness = measureEbur128(ffmpeg, target);
    process.stdout.write(`${line.tier.padEnd(12)} audio/${line.output}  ${loudness.lufs} LUFS  ${loudness.truePeak} dBTP  ${statSync(target).size} B  (${method})\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
