/**
 * Savas sesi orneklerini (vurus ve oldurme) ham paketlerden uretir.
 *
 * Kaynak: Kenney "Impact Sounds" ve "Sci-Fi Sounds" (CC0). Ham paketler
 * depoda degil; https://kenney.nl/assets/impact-sounds ve
 * https://kenney.nl/assets/sci-fi-sounds adreslerinden indirip bir klasore
 * acin:
 *
 *   <paketler>/impact/Audio/*.ogg
 *   <paketler>/scifi/Audio/*.ogg
 *
 * Calistirma:
 *
 *   node tools/build-sfx.mjs --packs <paketler> [--ffmpeg <ffmpeg.exe>]
 *   (ya da SFX_PACKS / FFMPEG ortam degiskenleri; ffmpeg yolda ise gerek yok)
 *
 * Cikti `apps/web/public/audio/sfx/`: her ornek mono 44.1 kHz MP3 ve
 * `manifest.json`. MP3, cunku her mobil tarayici (iOS Safari dahil) WebAudio
 * `decodeAudioData` ile cozuyor; AAC Linux Firefox'ta garanti degil, ogg
 * eski iOS'ta yok.
 *
 * Her ornek icin zincir:
 *  1. Kaynaktan `at` saniyesinden kes, bastaki sessizligi at.
 *  2. Hiz/perde (`rate`; <1 daha agir), alcak kesim (telefon hoparloru
 *     250 Hz altini zaten calamiyor; bas yalnizca tepe payi yiyor),
 *     istege bagli alcak geciren, EQ ve bit ezici.
 *  3. `dur` saniyeye kisalt, sondaki sessizligi at, 2 ms giris ve
 *     `fadeOut` cikis sonmesi (kesilen ses tik yapar).
 *  4. RMS'i hedefe (`rms`, varsayilan -18 dBFS) cek; tepe -1 dBFS'i asmasin.
 *  5. Denetim: 500 Hz - 5 kHz bandinda enerji var mi (telefonda duyulan
 *     bant), sure siniri, boyut butcesi. Biri tutmazsa hata.
 *
 * Seviye dengesi (aile basina kazanc) burada degil, istemcide
 * (apps/web/src/sfx-samples.ts): dosyalar ayni yuksuklukte, oyun karar veriyor.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "apps", "web", "public", "audio", "sfx");

/** Vurus orneginin en uzun suresi (sn) ve oldurmeninki. */
const MAX_HIT_SECONDS = 0.19;
const MAX_KILL_SECONDS = 0.5;
/**
 * Tik ailelerinin (odak nabzi, aura, bulasma, lanet havuzu) en uzun suresi:
 * tik araligindan (150 ms) kisa kalsinlar ki surekli isinlar vurus
 * butcesini doldurmasin.
 */
const MAX_TICK_SECONDS = 0.12;
/** Dosya basina ve toplam boyut butcesi (bayt); testler de ayni sayilari okuyor. */
export const SFX_BUDGET = { hitBytes: 8 * 1024, killBytes: 16 * 1024, totalBytes: 300 * 1024 };
/** 500 Hz - 5 kHz bandinin toplam enerjiye gore en az payi (dB). */
const MIN_MID_BAND_DB = -12;

/**
 * Tarifler. `family` istemcideki aile (sfx-samples.ts), `id` cikti dosyasinin
 * adi. Aile basina 2-3 cesit: ust uste gelen ayni vurus makineli tufek gibi
 * tinlamasin.
 */
const RECIPES = [
  // Mermi: orta agirlikta metal "tank" -- zirhli govdeye giren mermi.
  { family: "projectile", id: "projectile-1", src: "impact/impactMetal_medium_001", dur: 0.15, rate: 0.94, hp: 160, fadeOut: 0.07 },
  { family: "projectile", id: "projectile-2", src: "impact/impactMetal_medium_002", dur: 0.15, rate: 0.94, hp: 160, fadeOut: 0.07 },
  { family: "projectile", id: "projectile-3", src: "impact/impactMetal_medium_004", dur: 0.15, rate: 0.94, hp: 160, fadeOut: 0.07 },
  // Carpma: agir metal gumlemesi; telefonda okunsun diye 1.8 kHz'te biraz govde.
  { family: "impact", id: "impact-1", src: "impact/impactMetal_heavy_000", dur: 0.17, rate: 0.88, hp: 130, eq: [[1800, 4]], fadeOut: 0.08 },
  { family: "impact", id: "impact-2", src: "impact/impactMetal_heavy_002", dur: 0.17, rate: 0.88, hp: 130, eq: [[1800, 4]], fadeOut: 0.08 },
  { family: "impact", id: "impact-3", src: "impact/impactMetal_heavy_004", dur: 0.17, rate: 0.88, hp: 130, eq: [[1800, 4]], fadeOut: 0.08 },
  // Odak: kisa elektrik "tzak" -- lazerin nabzi.
  { family: "focus", id: "focus-1", src: "scifi/laserSmall_000", dur: 0.12, rate: 0.9, hp: 250, fadeOut: 0.05, tick: true },
  { family: "focus", id: "focus-2", src: "scifi/laserSmall_003", dur: 0.12, rate: 0.9, hp: 250, fadeOut: 0.05, tick: true },
  // Aura: kuvvet alaninin yumusak atakli citirtisi.
  { family: "aura", id: "aura-1", src: "scifi/forceField_002", at: 0.03, dur: 0.12, rate: 1, hp: 320, eq: [[2200, 6]], fadeIn: 0.015, fadeOut: 0.06, tick: true },
  { family: "aura", id: "aura-2", src: "scifi/forceField_004", at: 0.03, dur: 0.12, rate: 1, hp: 320, eq: [[2200, 6]], fadeIn: 0.015, fadeOut: 0.06, tick: true },
  // Bulasma: islak, kabarcikli; biraz yavas, daha koyu. Iki ayri balcik kaydi.
  { family: "contamination", id: "contamination-1", src: "scifi/slime_000", at: 0.02, dur: 0.12, rate: 0.85, hp: 200, fadeOut: 0.05, tick: true },
  { family: "contamination", id: "contamination-2", src: "scifi/slime_001", at: 0.28, dur: 0.12, rate: 0.85, hp: 200, fadeOut: 0.05, tick: true },
  // Lanet: bozulmus sinyal -- bilgisayar gurultusu cok yavas, ezilmis ve koyu.
  { family: "curse", id: "curse-1", src: "scifi/computerNoise_002", at: 0.1, dur: 0.12, rate: 0.6, hp: 200, lp: 3600, crush: true, fadeIn: 0.01, fadeOut: 0.06, tick: true },
  { family: "curse", id: "curse-2", src: "scifi/computerNoise_003", at: 0.05, dur: 0.12, rate: 0.6, hp: 200, lp: 3600, crush: true, fadeIn: 0.01, fadeOut: 0.06, tick: true },
  // Dalga: buyuk lazerin inen supurmesi, agirlastirilmis -- sok dalgasi.
  { family: "wave", id: "wave-1", src: "scifi/laserLarge_000", dur: 0.18, rate: 0.8, hp: 250, fadeOut: 0.09 },
  { family: "wave", id: "wave-2", src: "scifi/laserLarge_001", dur: 0.18, rate: 0.8, hp: 250, fadeOut: 0.09 },
  // Kesme: hafif metalin parlak, kuru cinlamasi.
  { family: "slash", id: "slash-1", src: "impact/impactMetal_light_000", dur: 0.15, rate: 0.96, hp: 400, fadeOut: 0.07 },
  { family: "slash", id: "slash-2", src: "impact/impactMetal_light_002", dur: 0.15, rate: 0.96, hp: 400, fadeOut: 0.07 },
  // Kure: enerji kuresinin camsi patlamasi, biraz agirlastirilmis.
  { family: "orb", id: "orb-1", src: "impact/impactGlass_light_000", dur: 0.12, rate: 0.85, hp: 250, fadeOut: 0.05 },
  { family: "orb", id: "orb-2", src: "impact/impactGlass_light_002", dur: 0.12, rate: 0.85, hp: 250, fadeOut: 0.05 },
  // Halka: agir metal cinlamasi, kisa kesilmis (cana donmesin).
  { family: "ring", id: "ring-1", src: "impact/impactBell_heavy_003", dur: 0.18, rate: 1, hp: 300, eq: [[2500, 5]], fadeOut: 0.1 },
  { family: "ring", id: "ring-2", src: "impact/impactBell_heavy_002", dur: 0.18, rate: 1, hp: 300, eq: [[2500, 5]], fadeOut: 0.1 },
  // Gulle: agir celik levhanin "klank"i.
  { family: "ball", id: "ball-1", src: "impact/impactPlate_heavy_000", dur: 0.18, rate: 0.92, hp: 140, fadeOut: 0.09 },
  { family: "ball", id: "ball-2", src: "impact/impactPlate_heavy_002", dur: 0.18, rate: 0.92, hp: 140, fadeOut: 0.09 },
  // Ok: ince sacin kuru tiki.
  { family: "dart", id: "dart-1", src: "impact/impactTin_medium_000", dur: 0.11, rate: 1.05, hp: 300, fadeOut: 0.05 },
  { family: "dart", id: "dart-2", src: "impact/impactTin_medium_002", dur: 0.11, rate: 1.05, hp: 300, fadeOut: 0.05 },
  // Sv 10 katmani: kisa, tok bir govde; her ailenin altina kisik ekleniyor.
  { family: "heft", id: "heft-1", src: "impact/impactPunch_heavy_003", dur: 0.14, rate: 1, hp: 220, eq: [[1200, 7]], rms: -24, fadeOut: 0.08 },
  // Kritik: zirh levhasinin parlak catlamasi; vurus sesinin ustune biniyor.
  { family: "crit", id: "crit-1", src: "impact/impactPlate_light_000", dur: 0.12, rate: 1, hp: 350, fadeOut: 0.07 },
  { family: "crit", id: "crit-2", src: "impact/impactPlate_light_003", dur: 0.12, rate: 1, hp: 350, fadeOut: 0.07 },
  // Hafif dusman: patlamanin kisa ezilmesi.
  { family: "killLight", id: "kill-light-1", src: "scifi/explosionCrunch_002", dur: 0.26, rate: 1.08, hp: 160, fadeOut: 0.15, kill: true },
  { family: "killLight", id: "kill-light-2", src: "scifi/explosionCrunch_001", dur: 0.26, rate: 1.08, hp: 160, fadeOut: 0.15, kill: true },
  // Agir dusman (brute, kusatma): tam patlama, yavas, uzun sonme.
  { family: "killHeavy", id: "kill-heavy-1", src: "scifi/explosionCrunch_000", dur: 0.48, rate: 0.9, hp: 110, fadeOut: 0.3, kill: true },
  { family: "killHeavy", id: "kill-heavy-2", src: "scifi/explosionCrunch_003", dur: 0.48, rate: 0.9, hp: 110, fadeOut: 0.3, kill: true },
  // Ucan dusman: havada parcalanan govde -- yer patlamasi yok, kirilma var.
  { family: "killAir", id: "kill-air-1", src: "impact/impactGlass_heavy_003", dur: 0.22, rate: 0.9, hp: 200, fadeOut: 0.11, kill: true },
  { family: "killAir", id: "kill-air-2", src: "impact/impactGlass_heavy_000", dur: 0.22, rate: 0.9, hp: 200, fadeOut: 0.11, kill: true }
];

const LICENSE_TEXT = `Karayel Online savas sesi ornekleri
===================================

Bu klasordeki MP3 dosyalari asagidaki paketlerden uretildi
(tools/build-sfx.mjs; hangi dosyanin hangi kaynaktan geldigi manifest.json'da):

- "Impact Sounds" (1.0) - Kenney (www.kenney.nl)
  https://kenney.nl/assets/impact-sounds
- "Sci-Fi Sounds" (1.0) - Kenney (www.kenney.nl)
  https://kenney.nl/assets/sci-fi-sounds

Lisans: Creative Commons Zero (CC0)
http://creativecommons.org/publicdomain/zero/1.0/

Kenney: "This content is free to use in personal, educational and commercial
projects. Support us by crediting Kenney or www.kenney.nl (this is not
mandatory)." Tesekkurler, Kenney.
`;

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    packs: value("--packs") ?? process.env.SFX_PACKS,
    ffmpeg: value("--ffmpeg") ?? process.env.FFMPEG ?? "ffmpeg"
  };
}

function run(ffmpeg, args) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-y", ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`ffmpeg ${args.join(" ")}\n${result.stderr}`);
  }
  return result.stderr;
}

function measure(ffmpeg, file, pre) {
  const filter = `${pre ? `${pre},` : ""}astats=measure_overall=RMS_level+Peak_level:measure_perchannel=none`;
  const log = run(ffmpeg, ["-i", file, "-af", filter, "-f", "null", "-"]);
  const rms = /RMS level dB: (-?[\d.]+|-inf)/.exec(log);
  const peak = /Peak level dB: (-?[\d.]+|-inf)/.exec(log);
  const number = (match) => (!match || match[1] === "-inf" ? -120 : Number(match[1]));
  return { rms: number(rms), peak: number(peak) };
}

/** Cozulmus sure (sn), ornek sayisindan: ffmpeg'in `time=` satiri 10 ms'ye yuvarli. */
function durationOf(ffmpeg, file) {
  const log = run(ffmpeg, ["-i", file, "-af", "aresample=44100,astats=measure_overall=Number_of_samples:measure_perchannel=none", "-f", "null", "-"]);
  const match = /Number of samples: (\d+)/.exec(log);
  if (!match) throw new Error(`sure okunamadi: ${file}`);
  return Number(match[1]) / 44100;
}

const round = (value, digits = 1) => Number(value.toFixed(digits));

function build() {
  const { packs, ffmpeg } = parseArgs();
  if (!packs || !existsSync(join(packs, "impact", "Audio")) || !existsSync(join(packs, "scifi", "Audio"))) {
    console.error("Ham paket klasoru bulunamadi. --packs <klasor> verin (icinde impact/Audio ve scifi/Audio).");
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const work = join(tmpdir(), `karayel-sfx-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const expected = new Set(RECIPES.map((recipe) => `${recipe.id}.mp3`));
  // Artik tarifte olmayan eski ciktilar kalmasin.
  for (const name of readdirSync(outDir)) {
    if (name.endsWith(".mp3") && !expected.has(name)) rmSync(join(outDir, name));
  }

  const files = [];
  const problems = [];
  try {
    for (const recipe of RECIPES) {
      const [pack, name] = recipe.src.split("/");
      const input = join(packs, pack, "Audio", `${name}.ogg`);
      if (!existsSync(input)) throw new Error(`kaynak yok: ${input}`);
      const rate = recipe.rate ?? 1;
      const stage1 = join(work, `${recipe.id}-1.wav`);
      const stage2 = join(work, `${recipe.id}-2.wav`);
      const output = join(outDir, `${recipe.id}.mp3`);

      // 1-3: kes, sessizligi at, perde, suzgec, kisalt.
      const chain = [
        "aformat=sample_fmts=fltp:channel_layouts=mono",
        "aresample=44100",
        `atrim=start=${recipe.at ?? 0}`,
        "asetpts=PTS-STARTPTS",
        "silenceremove=start_periods=1:start_threshold=-50dB",
        `asetrate=${Math.round(44100 * rate)}`,
        "aresample=44100",
        `highpass=f=${recipe.hp ?? 150}`,
        `highpass=f=${recipe.hp ?? 150}`
      ];
      if (recipe.lp) chain.push(`lowpass=f=${recipe.lp}`);
      for (const [frequency, gain] of recipe.eq ?? []) chain.push(`equalizer=f=${frequency}:t=q:w=1:g=${gain}`);
      if (recipe.crush) chain.push("acrusher=bits=7:mode=log:aa=1:samples=2:mix=0.6");
      chain.push(
        `atrim=duration=${recipe.dur}`,
        "areverse",
        "silenceremove=start_periods=1:start_threshold=-60dB",
        "areverse"
      );
      run(ffmpeg, ["-i", input, "-af", chain.join(","), "-c:a", "pcm_f32le", stage1]);
      const length = durationOf(ffmpeg, stage1);
      const fadeIn = Math.min(recipe.fadeIn ?? 0.002, length * 0.3);
      const fadeOut = Math.min(recipe.fadeOut ?? 0.05, length * 0.7);
      run(ffmpeg, ["-i", stage1, "-af", `afade=t=in:d=${fadeIn},afade=t=out:st=${Math.max(0, length - fadeOut)}:d=${fadeOut}`, "-c:a", "pcm_f32le", stage2]);

      // 4: yuksekligi esitle, tepe -1 dBFS.
      const level = measure(ffmpeg, stage2);
      const target = recipe.rms ?? -18;
      const gain = Math.min(target - level.rms, -1 - level.peak);
      run(ffmpeg, [
        "-i", stage2,
        "-af", `volume=${gain.toFixed(2)}dB`,
        "-ac", "1", "-ar", "44100",
        "-c:a", "libmp3lame", "-b:a", "96k",
        "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact",
        output
      ]);

      // 5: denetim.
      const final = measure(ffmpeg, output);
      const mid = measure(ffmpeg, output, "highpass=f=500,highpass=f=500,lowpass=f=5000,lowpass=f=5000");
      const bytes = statSync(output).size;
      const seconds = durationOf(ffmpeg, output);
      const midBandDb = round(mid.rms - final.rms);
      const limit = recipe.kill ? MAX_KILL_SECONDS : recipe.tick ? MAX_TICK_SECONDS : MAX_HIT_SECONDS;
      if (length > limit + 0.005) problems.push(`${recipe.id}: ${length.toFixed(3)} sn > ${limit}`);
      if (midBandDb < MIN_MID_BAND_DB) problems.push(`${recipe.id}: 500 Hz-5 kHz bandi ${midBandDb} dB (en az ${MIN_MID_BAND_DB})`);
      if (bytes > (recipe.kill ? SFX_BUDGET.killBytes : SFX_BUDGET.hitBytes)) problems.push(`${recipe.id}: ${bytes} bayt`);
      files.push({
        file: `${recipe.id}.mp3`,
        family: recipe.family,
        ...(recipe.tick ? { tick: true } : {}),
        source: `${recipe.src}.ogg`,
        bytes,
        durationMs: Math.round(length * 1000),
        rmsDb: round(final.rms),
        peakDb: round(final.peak),
        midBandDb
      });
      console.log(`${recipe.id.padEnd(18)} ${String(Math.round(length * 1000)).padStart(4)} ms ${String(bytes).padStart(6)} B  rms ${round(final.rms)}  tepe ${round(final.peak)}  orta bant ${midBandDb} dB  (cozulmus ${seconds.toFixed(3)} sn)`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const totalBytes = files.reduce((sum, entry) => sum + entry.bytes, 0);
  if (totalBytes > SFX_BUDGET.totalBytes) problems.push(`toplam ${totalBytes} bayt`);
  const manifest = {
    note: "tools/build-sfx.mjs uretti; elle duzenlemeyin. Lisans: LICENSE.txt (CC0, Kenney).",
    format: { codec: "mp3", channels: 1, sampleRate: 44100, bitrateKbps: 96 },
    budget: SFX_BUDGET,
    totalBytes,
    files
  };
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "LICENSE.txt"), LICENSE_TEXT, "utf8");
  console.log(`\n${files.length} dosya, toplam ${(totalBytes / 1024).toFixed(1)} KB -> ${outDir}`);
  if (problems.length > 0) {
    console.error(`\nDenetim hatalari:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  build();
}

// Testler tarifleri okuyabilsin diye (dosyayi calistirmadan).
export { RECIPES, MAX_HIT_SECONDS, MAX_KILL_SECONDS, MAX_TICK_SECONDS, MIN_MID_BAND_DB };
