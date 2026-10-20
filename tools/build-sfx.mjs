/**
 * Savas sesi orneklerini (vurus ve oldurme) ham paketlerden uretir.
 *
 * Kaynaklar (hepsi CC0; ham paketler depoda degil, indirip bir klasore acin):
 *
 *   <paketler>/impact/Audio/*.ogg   Kenney "Impact Sounds"   https://kenney.nl/assets/impact-sounds
 *   <paketler>/scifi/Audio/*.ogg    Kenney "Sci-Fi Sounds"   https://kenney.nl/assets/sci-fi-sounds
 *   <paketler>/oga/bang/*.ogg       rubberduck "25 CC0 bang / firework SFX"  https://opengameart.org/content/25-cc0-bang-firework-sfx
 *   <paketler>/oga/scifi50/*.ogg    rubberduck "50 CC0 Sci-Fi SFX"           https://opengameart.org/content/50-cc0-sci-fi-sfx
 *   <paketler>/oga/scifi60/*.ogg    rubberduck "60 CC0 Sci-Fi SFX"           https://opengameart.org/content/60-cc0-sci-fi-sfx
 *
 * Vuruslar sinematik bilim kurgu (sahibin karari, 2026-10-20: kisa metal/cam
 * tikirtilari "futuristik Candy Crush gibi"): gercek patlama ve top atisi
 * kayitlarindan tok darbe, Kenney metal govdesi, kisa metalik yanki kuyrugu
 * (`tail`). Cam, zil ve ince teneke tinilari kaldirildi.
 *
 * Vuruslar sert, mekanik bilim kurgu. Dusman oldurmesi bir "portal" sesi:
 * yarik acilip dusmani yutuyor (tools/sfx-portal.mjs; iki tarz x uc boy).
 * Eski organik oldurme (ezilme + yaratik sesi) kaldirildi.
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
 *  0. Katmanli tarifte (`layers`) kaynaklar once kendi gecikmeleriyle
 *     (`delay` ms) ust uste karistiriliyor; asagidaki adimlar karisima.
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
 * Portal tariflerinin (`portal`) zinciri ayri: katmanli karisim, sonra
 * RMS degil EBU R128 yuksekligi (-20 LUFS, tepe -3 dBFS); sahibin dinledigi
 * adaylarla ayni. Ayrinti tools/sfx-portal.mjs'de.
 *
 * Seviye dengesi (aile basina kazanc) burada degil, istemcide
 * (apps/web/src/sfx-samples.ts): dosyalar ayni yuksuklukte, oyun karar veriyor.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PORTAL_SIZES, PORTAL_STYLES, PORTAL_TARGET_LUFS, getPortalDesign, measurePortalLoudness, normalizePortal, renderPortalMix } from "./sfx-portal.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "apps", "web", "public", "audio", "sfx");

/** Vurus orneginin en uzun suresi (sn): darbe + kisa yanki kuyrugu. */
const MAX_HIT_SECONDS = 0.34;
/**
 * Oldurme portal sesinin boy basina en uzun suresi (sn): sisme + kuyruk.
 * small 0.15 + 0.234, normal 0.30 + 0.30 (D), large 1.45 x 0.60 (D) = 0.87.
 */
const MAX_PORTAL_SECONDS = Object.freeze({ small: 0.39, normal: 0.6, large: 0.87 });
/** Kucuk boyun darbe oncesi sismesinin ust siniri (sn): sik oldurme gec kalmasin. */
const MAX_SMALL_SWELL_SECONDS = 0.15;
/**
 * Tik ailelerinin (odak nabzi, aura, bulasma, lanet havuzu) en uzun suresi:
 * tik araligindan (150 ms) kisa kalsinlar ki surekli isinlar vurus
 * butcesini doldurmasin.
 */
const MAX_TICK_SECONDS = 0.12;
/**
 * Beceri isaretlerinin (`cue`: Execute infazi) en uzun suresi: oyuncunun
 * kendi sectigi seyrek bir an; kilit tiki + agir darbe sigsin, uzamasin.
 */
const MAX_CUE_SECONDS = 0.4;
/**
 * Atis seslerinin (`fire`) en uzun suresi: namlunun kisa vurusu. Hizli atan
 * kulelerde (Takipci) bir sonraki atisa tasmasin; vurus sesinden kisa.
 */
const MAX_FIRE_SECONDS = 0.24;
/** Dosya basina ve toplam boyut butcesi (bayt); testler de ayni sayilari okuyor. */
export const SFX_BUDGET = { hitBytes: 8 * 1024, killBytes: 12 * 1024, totalBytes: 400 * 1024 };
/** 500 Hz - 5 kHz bandinin toplam enerjiye gore en az payi (dB). */
const MIN_MID_BAND_DB = -12;

/**
 * Tarifler. `family` istemcideki aile (sfx-samples.ts), `id` cikti dosyasinin
 * adi. Aile basina 2-3 cesit: ust uste gelen ayni vurus makineli tufek gibi
 * tinlamasin.
 */
const RECIPES = [
  // ---- Vuruslar: sinematik bilim kurgu. Tok darbe (gercek patlama ve top
  // atisi kayitlari) + Kenney metal govdesi + kisa metalik yanki (`tail`).
  // Mermi: kisa sert patlama catlamasi, zirhli govdeye giren mermi.
  { family: "projectile", id: "projectile-1", src: "bang/bang_02", layers: [{ src: "impact/impactMetal_heavy_001", gain: -9 }], dur: 0.24, rate: 1.05, hp: 110, eq: [[1600, 3]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, drive: 0.9, fadeOut: 0.12 },
  { family: "projectile", id: "projectile-2", src: "bang/bang_04", layers: [{ src: "impact/impactMetal_heavy_003", gain: -9 }], dur: 0.24, rate: 1.05, hp: 110, eq: [[1600, 3]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, drive: 0.9, fadeOut: 0.12 },
  { family: "projectile", id: "projectile-3", src: "bang/bang_07", layers: [{ src: "impact/impactMetal_heavy_001", gain: -9 }], dur: 0.24, rate: 1.05, hp: 110, eq: [[1600, 3]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, drive: 0.9, fadeOut: 0.12 },
  // Carpma: top atisinin gumlemesi + agir yumruk; buyuk yanki.
  { family: "impact", id: "impact-1", src: "bang/cannon_04", layers: [{ src: "impact/impactPunch_heavy_002", gain: -5 }], dur: 0.3, rate: 0.85, hp: 90, eq: [[1100, 4]], tail: { delays: [27, 61, 109], decays: [0.4, 0.26, 0.15], wet: 0.55 }, drive: 0.85, fadeOut: 0.16 },
  { family: "impact", id: "impact-2", src: "bang/cannon_01", layers: [{ src: "impact/impactPunch_heavy_004", gain: -5 }], dur: 0.3, rate: 0.85, hp: 90, eq: [[1100, 4]], tail: { delays: [27, 61, 109], decays: [0.4, 0.26, 0.15], wet: 0.55 }, drive: 0.85, fadeOut: 0.16 },
  { family: "impact", id: "impact-3", src: "bang/bang_10", layers: [{ src: "impact/impactPunch_heavy_002", gain: -5 }], dur: 0.3, rate: 0.85, hp: 90, eq: [[1100, 4]], tail: { delays: [27, 61, 109], decays: [0.4, 0.26, 0.15], wet: 0.55 }, drive: 0.85, fadeOut: 0.16 },
  // Odak: lazerin nabzi -- kisa, kalin bir enerji catirtisi (tik).
  { family: "focus", id: "focus-1", src: "scifi60/sfx_09a", dur: 0.12, rate: 0.82, hp: 160, lp: 7000, eq: [[1400, 4]], fadeOut: 0.05, tick: true },
  { family: "focus", id: "focus-2", src: "scifi60/sfx_09b", dur: 0.12, rate: 0.82, hp: 160, lp: 7000, eq: [[1400, 4]], fadeOut: 0.05, tick: true },
  // Aura: kuvvet alaninin yumusak atakli citirtisi.
  { family: "aura", id: "aura-1", src: "scifi/forceField_002", at: 0.03, dur: 0.12, rate: 1, hp: 320, eq: [[2200, 6]], fadeIn: 0.015, fadeOut: 0.06, tick: true },
  { family: "aura", id: "aura-2", src: "scifi/forceField_004", at: 0.03, dur: 0.12, rate: 1, hp: 320, eq: [[2200, 6]], fadeIn: 0.015, fadeOut: 0.06, tick: true },
  // Bulasma: islak, kabarcikli; biraz yavas, daha koyu. Iki ayri balcik kaydi.
  { family: "contamination", id: "contamination-1", src: "scifi/slime_000", at: 0.02, dur: 0.12, rate: 0.85, hp: 200, fadeOut: 0.05, tick: true },
  { family: "contamination", id: "contamination-2", src: "scifi/slime_001", at: 0.28, dur: 0.12, rate: 0.85, hp: 200, fadeOut: 0.05, tick: true },
  // Lanet: bozulmus sinyal -- bilgisayar gurultusu cok yavas, ezilmis ve koyu.
  { family: "curse", id: "curse-1", src: "scifi/computerNoise_002", at: 0.1, dur: 0.12, rate: 0.6, hp: 200, lp: 3600, crush: true, fadeIn: 0.01, fadeOut: 0.06, tick: true },
  { family: "curse", id: "curse-2", src: "scifi/computerNoise_003", at: 0.05, dur: 0.12, rate: 0.6, hp: 200, lp: 3600, crush: true, fadeIn: 0.01, fadeOut: 0.06, tick: true },
  // Dalga: alcak patlamanin basinci -- sok dalgasi.
  { family: "wave", id: "wave-1", src: "scifi50/explosion_02", dur: 0.32, rate: 0.9, hp: 80, eq: [[1000, 5]], tail: { delays: [27, 61, 109], decays: [0.4, 0.26, 0.15], wet: 0.55 }, drive: 0.85, fadeOut: 0.16 },
  { family: "wave", id: "wave-2", src: "bang/bang_06", layers: [{ src: "impact/impactPunch_heavy_004", gain: -6 }], dur: 0.32, rate: 0.82, hp: 80, eq: [[1000, 5]], tail: { delays: [27, 61, 109], decays: [0.4, 0.26, 0.15], wet: 0.55 }, drive: 0.85, fadeOut: 0.16 },
  // Kesme: kuru patlama catlamasi + celik levha; cinlama degil.
  { family: "slash", id: "slash-1", src: "bang/shot_03", layers: [{ src: "impact/impactPlate_medium_001", gain: -8 }], dur: 0.22, rate: 1.1, hp: 160, eq: [[2400, 3]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.1 },
  { family: "slash", id: "slash-2", src: "bang/bang_08", layers: [{ src: "impact/impactPlate_medium_003", gain: -8 }], dur: 0.22, rate: 1.1, hp: 160, eq: [[2400, 3]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.1 },
  // Kure: enerji gullesinin boguk patlamasi + kuvvet alani citirtisi (cam degil).
  { family: "orb", id: "orb-1", src: "bang/bang_05", layers: [{ src: "scifi/forceField_000", at: 0.12, gain: -10 }], dur: 0.26, rate: 0.92, hp: 110, eq: [[1300, 4]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, drive: 0.9, fadeOut: 0.12 },
  { family: "orb", id: "orb-2", src: "bang/fw_03", layers: [{ src: "scifi/forceField_001", at: 0.12, gain: -10 }], dur: 0.26, rate: 0.92, hp: 110, eq: [[1300, 4]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, drive: 0.9, fadeOut: 0.12 },
  // Halka: top atisi + agir metal govde; zil yok.
  { family: "ring", id: "ring-1", src: "bang/cannon_05", layers: [{ src: "impact/impactMetal_heavy_000", gain: -7 }], dur: 0.28, rate: 0.95, hp: 110, eq: [[1500, 3]], tail: { delays: [27, 61, 109], decays: [0.4, 0.26, 0.15], wet: 0.55 }, fadeOut: 0.14 },
  { family: "ring", id: "ring-2", src: "bang/cannon_03", layers: [{ src: "impact/impactMetal_heavy_002", gain: -7 }], dur: 0.28, rate: 0.95, hp: 110, eq: [[1500, 3]], tail: { delays: [27, 61, 109], decays: [0.4, 0.26, 0.15], wet: 0.55 }, fadeOut: 0.14 },
  // Gulle: agir celik levhanin "klank"i + top atisinin govdesi; buyuk yanki.
  { family: "ball", id: "ball-1", src: "impact/impactPlate_heavy_000", layers: [{ src: "bang/cannon_02", gain: -6 }], dur: 0.3, rate: 0.88, hp: 100, eq: [[1300, 3]], tail: { delays: [27, 61, 109], decays: [0.4, 0.26, 0.15], wet: 0.55 }, fadeOut: 0.15 },
  { family: "ball", id: "ball-2", src: "impact/impactPlate_heavy_002", layers: [{ src: "bang/cannon_02", gain: -6 }], dur: 0.3, rate: 0.88, hp: 100, eq: [[1300, 3]], tail: { delays: [27, 61, 109], decays: [0.4, 0.26, 0.15], wet: 0.55 }, fadeOut: 0.15 },
  // Ok: kisa kuru atis catlamasi (teneke degil).
  { family: "dart", id: "dart-1", src: "bang/shot_02", dur: 0.18, rate: 1.0, hp: 180, lp: 9000, eq: [[2000, 3]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.08 },
  { family: "dart", id: "dart-2", src: "scifi50/shoot_01", dur: 0.18, rate: 0.9, hp: 180, lp: 9000, eq: [[2000, 3]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.08 },
  // Sv 10 katmani: alcak patlamanin tok govdesi; her ailenin altina kisik.
  { family: "heft", id: "heft-1", src: "scifi50/explosion_01", dur: 0.34, rate: 0.85, hp: 70, eq: [[900, 6]], rms: -24, drive: 0.8, fadeOut: 0.16 },
  // Kritik: sert patlama catlamasi + agir metal; vurusun ustune biniyor.
  { family: "crit", id: "crit-1", src: "bang/bang_09", layers: [{ src: "impact/impactMetal_heavy_004", gain: -6 }], dur: 0.2, rate: 1.08, hp: 200, eq: [[2600, 4]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.1 },
  { family: "crit", id: "crit-2", src: "bang/bang_01", layers: [{ src: "impact/impactMetal_heavy_000", gain: -6 }], dur: 0.2, rate: 1.08, hp: 200, eq: [[2600, 4]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.1 },
  // Execute (AttackLord infazi): once nisangahin kuru kilit tiki (hafif metal,
  // `layers`), ~50 ms sonra agir, tok bir darbe (agir yumruk) -- biraz
  // yavaslatilmis. Parilti ya da nota yok; kisa ve sert.
  { family: "execute", id: "execute-1", src: "impact/impactPunch_heavy_000", delay: 50, layers: [{ src: "impact/impactMetal_light_001", gain: -9 }], dur: 0.32, rate: 0.9, hp: 140, eq: [[1500, 4]], fadeOut: 0.14, cue: true },
  { family: "execute", id: "execute-2", src: "impact/impactPunch_heavy_001", delay: 50, layers: [{ src: "impact/impactMetal_light_003", gain: -9 }], dur: 0.32, rate: 0.9, hp: 140, eq: [[1500, 4]], fadeOut: 0.14, cue: true },
  // ---- Atis: namlunun sesi (vfx/weapon-feel.ts). Vurus seslerinden kisa ve
  // kisik; kulenin kutlesini soyluyor. Kaynaklar vurus ailelerinden ayri.
  // Hafif (Takipci): gercek atis catlamasi, kisa yanki.
  { family: "fireLight", id: "fire-light-1", src: "bang/shot_01", dur: 0.14, rate: 1.1, hp: 140, eq: [[2400, 3]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.07, fire: true },
  { family: "fireLight", id: "fire-light-2", src: "bang/fw_01", dur: 0.14, rate: 1.15, hp: 140, eq: [[2400, 3]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.07, fire: true },
  // Agir (topcu): top atisi + alcak patlama govdesi, buyuk yanki.
  { family: "fireHeavy", id: "fire-heavy-1", src: "bang/cannon_02", layers: [{ src: "scifi/lowFrequency_explosion_001", gain: -3 }], dur: 0.24, rate: 0.82, hp: 80, eq: [[1100, 5]], tail: { delays: [27, 61, 109], decays: [0.4, 0.26, 0.15], wet: 0.55 }, drive: 0.85, fadeOut: 0.12, fire: true },
  { family: "fireHeavy", id: "fire-heavy-2", src: "scifi/explosionCrunch_003", layers: [{ src: "scifi/lowFrequency_explosion_000", at: 0.12, gain: -3 }], dur: 0.24, rate: 0.72, hp: 80, eq: [[1100, 5]], tail: { delays: [27, 61, 109], decays: [0.4, 0.26, 0.15], wet: 0.55 }, drive: 0.85, fadeOut: 0.12, fire: true },
  // Gudum (Izolasyon): roket ateslemesinin nefesi + firlatma tiki.
  { family: "fireHoming", id: "fire-homing-1", src: "scifi50/rocket_01", at: 0.3, layers: [{ src: "impact/impactGeneric_light_000", gain: -6 }], dur: 0.2, rate: 1.1, hp: 160, lp: 7000, fadeIn: 0.01, fadeOut: 0.1, fire: true },
  { family: "fireHoming", id: "fire-homing-2", src: "impact/impactMetal_light_004", layers: [{ src: "scifi/thrusterFire_002", at: 1, gain: -7 }], dur: 0.16, rate: 0.85, hp: 300, lp: 7000, fadeOut: 0.08, fire: true },
  // Cokus (Obsesyon): ters cevrilmis patlama -- hava ice cekiliyor, atis
  // aninda kesiliyor (`reverse`: kaynagin ilk N saniyesi tersten).
  { family: "fireCollapse", id: "fire-collapse-1", src: "bang/bang_03", reverse: 0.18, dur: 0.22, rate: 0.9, hp: 320, eq: [[1500, 9]], drive: 0.85, fadeIn: 0.03, fadeOut: 0.03, fire: true },
  { family: "fireCollapse", id: "fire-collapse-2", src: "bang/fw_06", reverse: 0.18, dur: 0.22, rate: 0.9, hp: 120, eq: [[1200, 6]], drive: 0.85, fadeIn: 0.03, fadeOut: 0.03, fire: true },
  // Elektrik (Ucube): ezilmis kisa catirti, kisa yanki.
  { family: "fireBolt", id: "fire-bolt-1", src: "scifi/explosionCrunch_004", at: 0.03, dur: 0.14, rate: 1.25, hp: 300, crush: true, tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.07, fire: true },
  { family: "fireBolt", id: "fire-bolt-2", src: "scifi/laserSmall_004", dur: 0.14, rate: 1.05, hp: 300, crush: true, tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.07, fire: true },
  // Mizrak (Hiza, Taht): kuru catlama + celik levha; parlak lazer "sink"i yok.
  { family: "fireLance", id: "fire-lance-1", src: "bang/fw_05", layers: [{ src: "impact/impactPlate_medium_002", gain: -8 }], dur: 0.16, rate: 1.15, hp: 200, eq: [[2600, 3]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.08, fire: true },
  { family: "fireLance", id: "fire-lance-2", src: "scifi50/misc_04", layers: [{ src: "impact/impactPlate_medium_004", gain: -8 }], dur: 0.16, rate: 1.0, hp: 200, eq: [[2600, 3]], tail: { delays: [19, 41, 73], decays: [0.34, 0.22, 0.12] }, fadeOut: 0.08, fire: true },
  // ---- Oldurme: portal (tools/sfx-portal.mjs). Boy basina bir aile, iki
  // cesit: A "rift whoosh" ve D "pulse thrum"; istemci ikisini sirayla caliyor.
  // small: siradan ve ucan dusman, normal: agir (kaba, kusatma), large: sampiyon.
  ...PORTAL_SIZES.flatMap((size) => PORTAL_STYLES.map((style) => ({
    family: `portal${size.id[0].toUpperCase()}${size.id.slice(1)}`,
    id: `death-portal-${style.id}-${size.id}`,
    portal: { style: style.id, size: size.id },
    kill: "portal"
  })))
];

/**
 * LICENSE.txt. Oldurme (portal) seslerinin kullandigi kaynak dosyalar tek tek
 * yaziliyor (`portalSources`: cikti dosyasi -> `paket/ad.uzanti` listesi).
 */
function licenseText(portalSources) {
  const lines = portalSources.map(({ file, sources }) => [`- ${file}:`, ...sources.map((source) => `    ${source}`)].join("\n")).join("\n");
  const used = [...new Set(portalSources.flatMap(({ sources }) => sources))].sort();
  return `Nexhold savas sesi ornekleri
============================

Bu klasordeki MP3 dosyalari asagidaki CC0 paketlerden uretildi
(tools/build-sfx.mjs ve tools/sfx-portal.mjs; hangi dosyanin hangi kaynaktan
geldigi manifest.json'da):

- "Impact Sounds" (1.0) - Kenney (www.kenney.nl)
  https://kenney.nl/assets/impact-sounds
- "Sci-Fi Sounds" (1.0) - Kenney (www.kenney.nl)
  https://kenney.nl/assets/sci-fi-sounds
- "25 CC0 bang / firework SFX" - rubberduck (OpenGameArt)
  https://opengameart.org/content/25-cc0-bang-firework-sfx
- "50 CC0 Sci-Fi SFX" - rubberduck (OpenGameArt)
  https://opengameart.org/content/50-cc0-sci-fi-sfx
- "60 CC0 Sci-Fi SFX" - rubberduck (OpenGameArt)
  https://opengameart.org/content/60-cc0-sci-fi-sfx

Vurus, atis, kritik ve beceri (Execute infazi) sesleri bu paketlerden kesilip
katmanlandi (bang/, scifi50/, scifi60/ = rubberduck'in OpenGameArt paketleri).

Dusman oldurme sesleri ("portal"; death-portal-*.mp3) bu iki paketin su
dosyalarinin katmanli karisimi (impact/ = Impact Sounds, scifi/ = Sci-Fi
Sounds; paketlerin Audio/ klasorunden):

${lines}

Oldurme seslerinde kullanilan kaynak dosyalarin tamami:
${used.map((source) => `- ${source}`).join("\n")}

Lisans: Creative Commons Zero (CC0 1.0)
http://creativecommons.org/publicdomain/zero/1.0/

CC0 atif istemiyor; yine de tesekkurler: Kenney ve rubberduck.
`;
}

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

/** Paket adindan klasore: Kenney paketleri `Audio/` altinda. */
const PACK_DIRS = {
  impact: join("impact", "Audio"),
  scifi: join("scifi", "Audio"),
  bang: join("oga", "bang"),
  scifi50: join("oga", "scifi50"),
  scifi60: join("oga", "scifi60")
};

/** `paket/ad` -> dosya yolu; uzanti .ogg ya da .mp3 (paket neyse). */
function resolveSource(packs, src) {
  const [pack, name] = src.split("/");
  const dir = PACK_DIRS[pack];
  if (!dir) throw new Error(`bilinmeyen paket: ${src}`);
  for (const extension of [".ogg", ".mp3"]) {
    const file = join(packs, dir, `${name}${extension}`);
    if (existsSync(file)) return file;
  }
  return join(packs, dir, `${name}.ogg`);
}

/** Tarifin kaynak dosyasinin adi (manifest icin): `paket/ad.uzanti`. */
function sourceName(packs, src) {
  const file = resolveSource(packs, src);
  return `${src}${file.slice(file.lastIndexOf("."))}`;
}

/** Kaynagin suresi (sn), mono cozulmus ornek sayisindan (portal katmanlarinin `len` siniri). */
function monoSeconds(ffmpeg, file) {
  const log = run(ffmpeg, ["-i", file, "-af", "aresample=44100,aformat=channel_layouts=mono,astats=measure_overall=Number_of_samples:measure_perchannel=none", "-f", "null", "-"]);
  const match = /Number of samples: (\d+)/.exec(log);
  if (!match) throw new Error(`sure okunamadi: ${file}`);
  return Number(match[1]) / 44100;
}

/** WAV -> mono 44.1 kHz 96 kbps MP3; ust veri yok, bayt bayt tekrarlanabilir. */
function encodeMp3(ffmpeg, wav, output) {
  run(ffmpeg, [
    "-i", wav,
    "-ac", "1", "-ar", "44100",
    "-c:a", "libmp3lame", "-b:a", "96k",
    "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact",
    output
  ]);
}

/**
 * Ciktinin denetimi ve manifest satiri: telefon bandi, sure siniri, boyut
 * butcesi. Tutmayan `problems`a yaziliyor.
 */
function audit(ffmpeg, recipe, output, length, limit, problems, fields) {
  const final = measure(ffmpeg, output);
  const mid = measure(ffmpeg, output, "highpass=f=500,highpass=f=500,lowpass=f=5000,lowpass=f=5000");
  const bytes = statSync(output).size;
  const seconds = durationOf(ffmpeg, output);
  const midBandDb = round(mid.rms - final.rms);
  if (length > limit + 0.005) problems.push(`${recipe.id}: ${length.toFixed(3)} sn > ${limit}`);
  if (midBandDb < MIN_MID_BAND_DB) problems.push(`${recipe.id}: 500 Hz-5 kHz bandi ${midBandDb} dB (en az ${MIN_MID_BAND_DB})`);
  if (bytes > (recipe.kill ? SFX_BUDGET.killBytes : SFX_BUDGET.hitBytes)) problems.push(`${recipe.id}: ${bytes} bayt`);
  console.log(`${recipe.id.padEnd(24)} ${String(Math.round(length * 1000)).padStart(4)} ms ${String(bytes).padStart(6)} B  rms ${round(final.rms)}  tepe ${round(final.peak)}  orta bant ${midBandDb} dB  (cozulmus ${seconds.toFixed(3)} sn)`);
  return {
    file: `${recipe.id}.mp3`,
    family: recipe.family,
    ...fields,
    bytes,
    durationMs: Math.round(length * 1000),
    rmsDb: round(final.rms),
    peakDb: round(final.peak),
    midBandDb
  };
}

function build() {
  const { packs, ffmpeg } = parseArgs();
  if (!packs || Object.values(PACK_DIRS).some((dir) => !existsSync(join(packs, dir)))) {
    console.error(`Ham paket klasoru bulunamadi. --packs <klasor> verin (icinde ${Object.values(PACK_DIRS).join(", ")}).`);
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
  const portalSources = [];
  const portalTools = {
    run: (args) => run(ffmpeg, args),
    resolveSource: (src) => {
      const file = resolveSource(packs, src);
      if (!existsSync(file)) throw new Error(`kaynak yok: ${file}`);
      return file;
    },
    sourceSeconds: (file) => monoSeconds(ffmpeg, file)
  };
  try {
    for (const recipe of RECIPES) {
      if (recipe.portal) {
        // Oldurme portal sesi: katmanli karisim, -20 LUFS, MP3 (tools/sfx-portal.mjs).
        const design = getPortalDesign(recipe.portal.style, recipe.portal.size);
        const raw = join(work, `${recipe.id}-raw.wav`);
        const wav = join(work, `${recipe.id}.wav`);
        const output = join(outDir, `${recipe.id}.mp3`);
        renderPortalMix(portalTools, design, raw);
        normalizePortal(portalTools.run, raw, wav, work);
        encodeMp3(ffmpeg, wav, output);
        const length = durationOf(ffmpeg, wav);
        const sources = design.layers.map((layer) => sourceName(packs, layer.src));
        portalSources.push({ file: `${recipe.id}.mp3`, sources });
        const loudness = measurePortalLoudness(portalTools.run, output);
        const limit = MAX_PORTAL_SECONDS[recipe.portal.size];
        if (recipe.portal.size === "small" && design.swell > MAX_SMALL_SWELL_SECONDS + 1e-9) problems.push(`${recipe.id}: sisme ${design.swell} sn > ${MAX_SMALL_SWELL_SECONDS}`);
        if (Math.abs(loudness.lufs - PORTAL_TARGET_LUFS) > 1) problems.push(`${recipe.id}: ${loudness.lufs} LUFS`);
        files.push(audit(ffmpeg, recipe, output, length, limit, problems, {
          kill: "portal",
          style: recipe.portal.style,
          size: recipe.portal.size,
          swellMs: Math.round(design.swell * 1000),
          source: sources[0],
          layers: sources.slice(1),
          lufs: round(loudness.lufs)
        }));
        continue;
      }
      let input = resolveSource(packs, recipe.src);
      if (!existsSync(input)) throw new Error(`kaynak yok: ${input}`);
      const rate = recipe.rate ?? 1;
      const stage1 = join(work, `${recipe.id}-1.wav`);
      const stage2 = join(work, `${recipe.id}-2.wav`);
      const output = join(outDir, `${recipe.id}.mp3`);
      let start = recipe.at ?? 0;

      // 0: katmanli tarif (`layers`): her kaynak kendi basindan kesilip
      // gecikmesiyle (`delay` ms) ust uste karistiriliyor; zincir karisimdan devam.
      if (recipe.layers) {
        const parts = [{ src: recipe.src, at: recipe.at, delay: recipe.delay, gain: 0 }, ...recipe.layers];
        const inputs = parts.flatMap((part) => {
          const file = resolveSource(packs, part.src);
          if (!existsSync(file)) throw new Error(`kaynak yok: ${file}`);
          return ["-i", file];
        });
        const graph = parts.map((part, index) => [
          `[${index}:a]aformat=sample_fmts=fltp:channel_layouts=mono`,
          "aresample=44100",
          `atrim=start=${part.at ?? 0}`,
          "asetpts=PTS-STARTPTS",
          "silenceremove=start_periods=1:start_threshold=-50dB",
          `volume=${part.gain ?? 0}dB`,
          `adelay=${Math.round(part.delay ?? 0)}[p${index}]`
        ].join(",")).join(";");
        const mixed = join(work, `${recipe.id}-0.wav`);
        run(ffmpeg, [...inputs, "-filter_complex", `${graph};${parts.map((_, index) => `[p${index}]`).join("")}amix=inputs=${parts.length}:normalize=0:duration=longest[out]`, "-map", "[out]", "-c:a", "pcm_f32le", mixed]);
        input = mixed;
        start = 0;
      }

      // 1-3: kes, sessizligi at, perde, suzgec, kisalt.
      const chain = [
        "aformat=sample_fmts=fltp:channel_layouts=mono",
        "aresample=44100",
        `atrim=start=${start}`,
        "asetpts=PTS-STARTPTS",
        "silenceremove=start_periods=1:start_threshold=-50dB",
        // Ters tarif: kaynagin ilk `reverse` saniyesi tersten (patlama -> emme).
        ...(recipe.reverse ? [`atrim=duration=${recipe.reverse}`, "areverse"] : []),
        `asetrate=${Math.round(44100 * rate)}`,
        "aresample=44100",
        `highpass=f=${recipe.hp ?? 150}`,
        `highpass=f=${recipe.hp ?? 150}`
      ];
      if (recipe.lp) chain.push(`lowpass=f=${recipe.lp}`);
      for (const [frequency, gain] of recipe.eq ?? []) chain.push(`equalizer=f=${frequency}:t=q:w=1:g=${gain}`);
      if (recipe.crush) chain.push("acrusher=bits=7:mode=log:aa=1:samples=2:mix=0.6");
      // Kisa metalik yanki (hangar / zirh govdesi): darbeyi tok ve buyuk
      // duyuruyor; kuyruk `dur` icinde kaliyor, sonumu `fadeOut`.
      if (recipe.tail) chain.push(`aecho=0.85:${recipe.tail.wet ?? 0.5}:${recipe.tail.delays.join("|")}:${recipe.tail.decays.join("|")}`);
      // Hafif doyum: darbenin gövdesi kalinlasiyor, tepe yumusuyor.
      if (recipe.drive) chain.push(`asoftclip=type=tanh:threshold=${recipe.drive}`);
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
      const limit = recipe.tick ? MAX_TICK_SECONDS : recipe.cue ? MAX_CUE_SECONDS : recipe.fire ? MAX_FIRE_SECONDS : MAX_HIT_SECONDS;
      files.push(audit(ffmpeg, recipe, output, length, limit, problems, {
        ...(recipe.tick ? { tick: true } : {}),
        ...(recipe.cue ? { cue: true } : {}),
        ...(recipe.fire ? { fire: true } : {}),
        source: sourceName(packs, recipe.src),
        ...(recipe.layers ? { layers: recipe.layers.map((part) => sourceName(packs, part.src)) } : {})
      }));
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const totalBytes = files.reduce((sum, entry) => sum + entry.bytes, 0);
  if (totalBytes > SFX_BUDGET.totalBytes) problems.push(`toplam ${totalBytes} bayt`);
  const manifest = {
    note: "tools/build-sfx.mjs uretti; elle duzenlemeyin. Lisans: LICENSE.txt (CC0: Kenney, rubberduck).",
    sources: {
      impact: { title: "Impact Sounds", author: "Kenney", url: "https://kenney.nl/assets/impact-sounds", license: "CC0-1.0" },
      scifi: { title: "Sci-Fi Sounds", author: "Kenney", url: "https://kenney.nl/assets/sci-fi-sounds", license: "CC0-1.0" },
      bang: { title: "25 CC0 bang / firework SFX", author: "rubberduck", url: "https://opengameart.org/content/25-cc0-bang-firework-sfx", license: "CC0-1.0" },
      scifi50: { title: "50 CC0 Sci-Fi SFX", author: "rubberduck", url: "https://opengameart.org/content/50-cc0-sci-fi-sfx", license: "CC0-1.0" },
      scifi60: { title: "60 CC0 Sci-Fi SFX", author: "rubberduck", url: "https://opengameart.org/content/60-cc0-sci-fi-sfx", license: "CC0-1.0" }
    },
    format: { codec: "mp3", channels: 1, sampleRate: 44100, bitrateKbps: 96 },
    budget: SFX_BUDGET,
    totalBytes,
    files
  };
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "LICENSE.txt"), licenseText(portalSources), "utf8");
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
export { RECIPES, MAX_HIT_SECONDS, MAX_PORTAL_SECONDS, MAX_SMALL_SWELL_SECONDS, MAX_TICK_SECONDS, MAX_CUE_SECONDS, MAX_FIRE_SECONDS, MIN_MID_BAND_DB };
