/**
 * ATLAS telsiz anonslarinin web surumu.
 *
 * Kaynak: assets-src/atlas/<kategori>/*.mp3 (ElevenLabs kayitlari, telsiz
 * efekt zinciri uygulanmis 192 kb/s ustalar; zincir tools/build-atlas-voices.py
 * ve tools/atlas-voice-preset.json'da). Bu klasor pakete girmiyor.
 *
 * Cikti: apps/web/public/audio/atlas/<kategori>/<kategori>-NN.mp3 ve
 * manifest.json. Her satir mono, 44,1 kHz, 64 kb/s MP3; iki gecisli loudnorm
 * ile ~-18 LUFS, gercek tepe <= -1.5 dBTP (kodlayici payi icin -2.2 hedefleniyor) (efektlerin ustunde, bagirmadan).
 * Manifestteki adresler GORELI ("audio/atlas/..."): istemci `assetUrl` ile
 * cozuyor, itch ve Bounty Board paketleri alt yoldan sunuluyor.
 *
 * Tekrar uretilebilir: dosyalar ada gore sirali, metadata yok, bitexact
 * bayraklari acik; ayni kaynak ve ayni ffmpeg ayni baytlari veriyor. Manifest
 * kaynak ve cikti SHA-256'larini tutuyor; `--check` hicbir sey yazmadan gecici
 * bir klasore yeniden uretip ozetleri karsilastiriyor.
 *
 *   node tools/build-atlas-voice.mjs [--ffmpeg <ffmpeg.exe>] [--check]
 *   (ya da FFMPEG ortam degiskeni; ffmpeg yolda ise gerek yok)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ATLAS_SOURCE_DIR = join(ROOT, "assets-src", "atlas");
export const ATLAS_OUTPUT_DIR = join(ROOT, "apps", "web", "public", "audio", "atlas");
export const ATLAS_URL_PREFIX = "audio/atlas/";

export const ATLAS_CATEGORIES = [
  "welcome",
  "wave-start",
  "wave-clear",
  "nexus-damage-lvl1",
  "nexus-damage-lvl2",
  "nexus-damage-lvl3",
  "tower-destroyed",
  "praising",
  "death",
  "ending"
];

export const ATLAS_ENCODING = Object.freeze({
  channels: 1,
  sampleRate: 44100,
  bitrateKbps: 64,
  targetLufs: -18,
  truePeakDb: -1.5,
  /** loudnorm hedefi: MP3 kodlamasi tepeyi ~0.5 dB tasirabiliyor, sinirin altinda pay. */
  encodeTruePeakDb: -2.2,
  lra: 11
});

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    ffmpeg: value("--ffmpeg") ?? process.env.FFMPEG ?? "ffmpeg",
    check: args.includes("--check")
  };
}

function run(ffmpeg, args) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-y", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg ${args.join(" ")}\n${result.stderr}`);
  return result.stderr;
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const round = (value, digits = 2) => Number(value.toFixed(digits));

/** loudnorm'un ilk gecisi: olculen degerler (ikinci gecisin dogrusal modu icin). */
function measureLoudnorm(ffmpeg, file) {
  const { targetLufs, encodeTruePeakDb: truePeakDb, lra } = ATLAS_ENCODING;
  const log = run(ffmpeg, ["-i", file, "-af", `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}:print_format=json`, "-f", "null", "-"]);
  const json = log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

/** Ciktinin olcumu: entegre yukseklik (LUFS) ve gercek tepe (dBTP), ebur128. */
export function measureEbur128(ffmpeg, file) {
  const log = run(ffmpeg, ["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const summary = log.slice(log.lastIndexOf("Summary:"));
  const integrated = /I:\s+(-?[\d.]+) LUFS/.exec(summary);
  const peak = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary);
  return {
    lufs: integrated ? Number(integrated[1]) : Number.NaN,
    truePeak: peak && peak[1] !== "-inf" ? Number(peak[1]) : -120
  };
}

/** Cozulmus sure (sn), ornek sayisindan. */
function durationOf(ffmpeg, file) {
  const log = run(ffmpeg, ["-i", file, "-af", "aresample=44100,astats=measure_overall=Number_of_samples:measure_perchannel=none", "-f", "null", "-"]);
  const match = /Number of samples: (\d+)/.exec(log);
  if (!match) throw new Error(`sure okunamadi: ${file}`);
  return Number(match[1]) / 44100;
}

function encode(ffmpeg, source, target) {
  const { targetLufs, encodeTruePeakDb: truePeakDb, lra, sampleRate, channels, bitrateKbps } = ATLAS_ENCODING;
  const m = measureLoudnorm(ffmpeg, source);
  const filter = `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}`
    + `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}`
    + `:offset=${m.target_offset}:linear=true,aresample=${sampleRate}`;
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

/** Kaynak listesi: kategori sirasi sabit, dosyalar ada gore. */
export function listAtlasSources(sourceDir = ATLAS_SOURCE_DIR) {
  const entries = [];
  for (const category of ATLAS_CATEGORIES) {
    const dir = join(sourceDir, category);
    if (!existsSync(dir)) throw new Error(`kaynak klasoru yok: ${dir}`);
    const files = readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".mp3")).sort();
    if (files.length === 0) throw new Error(`kaynak yok: ${dir}`);
    files.forEach((name, index) => {
      const fileName = `${category}-${String(index + 1).padStart(2, "0")}.mp3`;
      entries.push({ category, source: `${category}/${name}`, fileName, url: `${ATLAS_URL_PREFIX}${category}/${fileName}` });
    });
  }
  return entries;
}

function build(ffmpeg, outputDir) {
  const entries = listAtlasSources();
  const files = [];
  for (const entry of entries) {
    const source = join(ATLAS_SOURCE_DIR, entry.source);
    const target = join(outputDir, entry.category, entry.fileName);
    mkdirSync(dirname(target), { recursive: true });
    encode(ffmpeg, source, target);
    const loudness = measureEbur128(ffmpeg, target);
    files.push({
      category: entry.category,
      url: entry.url,
      duration: round(durationOf(ffmpeg, target), 3),
      bytes: statSync(target).size,
      lufs: round(loudness.lufs, 1),
      truePeak: round(loudness.truePeak, 1),
      source: entry.source,
      sourceSha256: sha256(source),
      sha256: sha256(target)
    });
    process.stdout.write(`${entry.url}  ${loudness.lufs} LUFS  ${loudness.truePeak} dBTP\n`);
  }
  return {
    version: 1,
    generator: "tools/build-atlas-voice.mjs",
    encoding: { ...ATLAS_ENCODING, codec: "mp3" },
    categories: ATLAS_CATEGORIES,
    files
  };
}

function main() {
  const { ffmpeg, check } = parseArgs();
  if (check) {
    const manifest = JSON.parse(readFileSync(join(ATLAS_OUTPUT_DIR, "manifest.json"), "utf8"));
    const temp = mkdtempSync(join(tmpdir(), "atlas-voice-"));
    try {
      const rebuilt = build(ffmpeg, temp);
      const expected = manifest.files.map((file) => `${file.url} ${file.sourceSha256} ${file.sha256}`);
      const actual = rebuilt.files.map((file) => `${file.url} ${file.sourceSha256} ${file.sha256}`);
      const mismatches = actual.filter((line, index) => line !== expected[index]);
      if (mismatches.length > 0 || expected.length !== actual.length) {
        console.error(`ATLAS: ${mismatches.length} dosya farkli\n${mismatches.join("\n")}`);
        process.exitCode = 1;
        return;
      }
      console.log(`ATLAS: ${actual.length} dosya ayni baytlarla yeniden uretildi`);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
    return;
  }
  rmSync(ATLAS_OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(ATLAS_OUTPUT_DIR, { recursive: true });
  const manifest = build(ffmpeg, ATLAS_OUTPUT_DIR);
  writeFileSync(join(ATLAS_OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const total = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
  console.log(`ATLAS: ${manifest.files.length} dosya, ${(total / 1024).toFixed(0)} KiB`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
