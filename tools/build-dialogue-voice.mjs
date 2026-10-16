/**
 * ATLAS ile VESAYET (dusman yapay zeka) arasindaki oyun ici konusmalarin
 * web surumu.
 *
 * Kaynak: assets-src/dialogue/<konusma>/NN<konusmaci>-K.mp3 (pakete girmiyor).
 * Ustalar sahibin efektli kayitlari (faz, iki yanki, kisa yanki odasi; zincir
 * assets-src/dialogue/apply_effects.py'de, 44,1 kHz MONO 192 kb/s). Efektler
 * ustada pisirilmis ve ustalar zaten mono: monoya indirme hicbir seyi
 * bozmuyor, yalnizca yukseklik ve kodlama ATLAS satirlarina esitleniyor.
 * Dosya adinin basindaki sira numarasi konusmadaki sira, adindaki
 * "vesayat"/"vesayet" ya da "atlas" konusmaci.
 *
 * Cikti: apps/web/public/audio/dialogue/<konusma>/NN-<konusmaci>.mp3 ve
 * apps/web/public/audio/dialogue/manifest.json. Kodlama ATLAS telsiz
 * satirlariyla ayni (`ATLAS_ENCODING`: mono, 44,1 kHz, 64 kb/s, ~-18 LUFS,
 * gercek tepe <= -1.5 dBTP; iki gecisli loudnorm, gerekirse kazanc +
 * sinirlayici -- `encode`, tools/build-streak-voice.mjs). Ayni seslendirme
 * kanalinda caliyorlar, biri digerinden yuksek kalmasin.
 *
 * Konusmalarin hangi asama/dalgada caldigi ve satir sirasi istemcide
 * (`ATLAS_DIALOGUES`, apps/web/src/atlas-dialogue.ts); tests/atlas-dialogue
 * manifestle esitligi denetliyor.
 *
 *   node tools/build-dialogue-voice.mjs [--ffmpeg <ffmpeg.exe>]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ATLAS_ENCODING, measureEbur128 } from "./build-atlas-voice.mjs";
import { encode } from "./build-streak-voice.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DIALOGUE_SOURCE_DIR = join(ROOT, "assets-src", "dialogue");
export const DIALOGUE_OUTPUT_DIR = join(ROOT, "apps", "web", "public", "audio", "dialogue");
export const DIALOGUE_URL_PREFIX = "audio/dialogue/";

/** Konusmalar; klasor adlari. */
export const DIALOGUE_IDS = ["conv-1", "conv-2", "conv-3", "conv-4", "conv-5", "conv-6"];

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const round = (value, digits = 2) => Number(value.toFixed(digits));

/** Dosya adindan konusmaci: "vesayat" (sahibin yazimi) ve "vesayet" ikisi de VESAYET. */
export function speakerOf(fileName) {
  const name = fileName.toLowerCase();
  if (/vesay[ae]t/.test(name)) return "vesayet";
  if (name.includes("atlas")) return "atlas";
  throw new Error(`konusmaci okunamadi: ${fileName}`);
}

export function listDialogueSources(sourceDir = DIALOGUE_SOURCE_DIR) {
  const entries = [];
  for (const id of DIALOGUE_IDS) {
    const dir = join(sourceDir, id);
    if (!existsSync(dir)) throw new Error(`kaynak klasoru yok: ${dir}`);
    const files = readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".mp3")).sort();
    if (files.length === 0) throw new Error(`kaynak yok: ${dir}`);
    files.forEach((name, index) => {
      const speaker = speakerOf(name);
      const fileName = `${String(index + 1).padStart(2, "0")}-${speaker}.mp3`;
      entries.push({ dialogue: id, speaker, source: `${id}/${name}`, fileName, url: `${DIALOGUE_URL_PREFIX}${id}/${fileName}` });
    });
  }
  return entries;
}

/** Cozulmus sure (sn), ornek sayisindan. */
function durationOf(ffmpeg, file) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-i", file, "-af", "aresample=44100,astats=measure_overall=Number_of_samples:measure_perchannel=none", "-f", "null", "-"], { encoding: "utf8" });
  const match = /Number of samples: (\d+)/.exec(result.stderr ?? "");
  if (!match) throw new Error(`sure okunamadi: ${file}`);
  return Number(match[1]) / 44100;
}

// --- ATLAS'in ara sozleri (asama basina uc satir) ---------------------------
//
// Kaynak: assets-src/atlas-ambient/<ad>_ATLAS.(mp3|wav) (ElevenLabs, ATLAS'in
// telsiz/yanki zinciri uygulanmis mono ustalar). Cikti
// apps/web/public/audio/atlas-ambient/<ad>.mp3 ve manifest.json; ayni kodlama.
// Hangi asamada calacaklari istemcide (`ATLAS_AMBIENT_LINES`,
// apps/web/src/atlas-ambient.ts).

export const AMBIENT_SOURCE_DIR = join(ROOT, "assets-src", "atlas-ambient");
export const AMBIENT_OUTPUT_DIR = join(ROOT, "apps", "web", "public", "audio", "atlas-ambient");
export const AMBIENT_URL_PREFIX = "audio/atlas-ambient/";

export function listAmbientSources(sourceDir = AMBIENT_SOURCE_DIR) {
  if (!existsSync(sourceDir)) throw new Error(`kaynak klasoru yok: ${sourceDir}`);
  return readdirSync(sourceDir)
    .filter((name) => /\.(mp3|wav)$/i.test(name))
    .sort()
    .map((name) => {
      const fileName = `${name.replace(/_ATLAS\.(mp3|wav)$/i, "").replace(/\.(mp3|wav)$/i, "").toLowerCase()}.mp3`;
      return { source: name, fileName, url: `${AMBIENT_URL_PREFIX}${fileName}` };
    });
}

function encodeEntry(ffmpeg, source, target, url) {
  mkdirSync(dirname(target), { recursive: true });
  const method = encode(ffmpeg, source, target);
  const loudness = measureEbur128(ffmpeg, target);
  const sourceLoudness = measureEbur128(ffmpeg, source);
  process.stdout.write(`${url}  ${loudness.lufs} LUFS  ${loudness.truePeak} dBTP  (usta ${sourceLoudness.lufs} LUFS, ${method})\n`);
  return {
    url,
    duration: round(durationOf(ffmpeg, target), 3),
    bytes: statSync(target).size,
    lufs: round(loudness.lufs, 1),
    truePeak: round(loudness.truePeak, 1),
    sourceLufs: round(sourceLoudness.lufs, 1),
    method,
    sourceSha256: sha256(source),
    sha256: sha256(target)
  };
}

function writeManifest(dir, manifest) {
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const total = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
  console.log(`${dir}: ${manifest.files.length} dosya, ${(total / 1024).toFixed(0)} KiB`);
}

function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf("--ffmpeg");
  const ffmpeg = (index >= 0 ? args[index + 1] : undefined) ?? process.env.FFMPEG ?? "ffmpeg";
  rmSync(DIALOGUE_OUTPUT_DIR, { recursive: true, force: true });
  const files = listDialogueSources().map((entry) => ({
    dialogue: entry.dialogue,
    speaker: entry.speaker,
    source: entry.source,
    ...encodeEntry(ffmpeg, join(DIALOGUE_SOURCE_DIR, entry.source), join(DIALOGUE_OUTPUT_DIR, entry.dialogue, entry.fileName), entry.url)
  }));
  writeManifest(DIALOGUE_OUTPUT_DIR, {
    version: 1,
    generator: "tools/build-dialogue-voice.mjs",
    encoding: { ...ATLAS_ENCODING, codec: "mp3" },
    dialogues: DIALOGUE_IDS,
    files
  });

  rmSync(AMBIENT_OUTPUT_DIR, { recursive: true, force: true });
  const ambient = listAmbientSources().map((entry) => ({
    source: entry.source,
    ...encodeEntry(ffmpeg, join(AMBIENT_SOURCE_DIR, entry.source), join(AMBIENT_OUTPUT_DIR, entry.fileName), entry.url)
  }));
  writeManifest(AMBIENT_OUTPUT_DIR, {
    version: 1,
    generator: "tools/build-dialogue-voice.mjs",
    encoding: { ...ATLAS_ENCODING, codec: "mp3" },
    files: ambient
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
