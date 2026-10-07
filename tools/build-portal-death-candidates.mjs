/**
 * Olum sesi ADAYLARI: "portal / yarik acilip dusmani yutuyor" -- 4 tarz x 3 boy.
 *
 * Oyuna bagli DEGIL: yalnizca dinleme icin `ses-adaylari/olum-portal/`
 * klasorune (git'e girmiyor) OGG + MP3 yaziyor ve bir karsilastirma dosyasi
 * (`karsilastirma.mp3`: simdiki olum sesi, sonra A..D'nin 2. cesidi) uretiyor.
 * Sahip A ve D'yi secti: ikisinin tarifi tools/sfx-portal.mjs'e tasindi ve
 * build-sfx.mjs oradan uretiyor (kucuk boyun sismesi orada kisaltildi). Bu
 * dosya yalnizca yeni aday denemeleri icin.
 *
 * Kaynaklar build-sfx.mjs ile ayni CC0 paketler (Kenney Sci-Fi + Impact).
 *
 * Calistirma:
 *   node tools/build-portal-death-candidates.mjs --packs <paketler> [--ffmpeg <ffmpeg.exe>] [--out <klasor>]
 *
 * Her aday:
 *  1. Katmanlar: kaynaktan `at` saniyeden kes, istenirse ters cevir
 *     (`reverse`), hiz/perde (`rate`), suzgecler (`fx`; `sweep()` ile zamanla
 *     kayan bant/frekans), giris/cikis sonmesi, kazanc, gecikme.
 *  2. Karisim -> alcak kesim -> hafif kompresor -> toplam sureye kes.
 *  3. Yukseklik: EBU R128 entegre yuksekligi TARGET_LUFS'a, tepe <= -3 dBFS
 *     (lookahead sinirlayici). Simdiki olum sesleri ~-19..-23 LUFS / -18.5 dBFS
 *     RMS; adaylar -20 LUFS.
 *  4. Mono 44.1 kHz; MP3 96 kbps (oyunun bicimi) ve OGG Vorbis.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Hedef entegre yukseklik (LUFS) ve ornek tepe siniri (dBFS). */
const TARGET_LUFS = -20;
const PEAK_DB = -3;

const PACK_DIRS = { impact: join("impact", "Audio"), scifi: join("scifi", "Audio"), squish: "squish", creature1: "creature1", creature2: "creature2" };

/** Boy: k zaman olcegi, p perde/hiz carpani, i kaynak cesidi. */
const SIZES = [
  { n: 1, name: "kucuk", k: 0.78, p: 1.1, i: 0 },
  { n: 2, name: "normal", k: 1, p: 1, i: 1 },
  { n: 3, name: "buyuk", k: 1.45, p: 0.8, i: 2 }
];

const pick = (list, i) => list[i % list.length];
const r3 = (value) => Number(value.toFixed(4));

/**
 * Zamanla kayan suzgec parametresi (asendcmd). `curve` "exp" (oransal; from,to > 0)
 * ya da "lin". `from`/`to` katmanin kendi zamaninda [start, end] araliginda.
 */
function sweep(target, param, from, to, start, end, curve = "exp") {
  const expr = curve === "exp"
    ? `${r3(from)}*exp(${r3(Math.log(to / from))}*TI)`
    : `${r3(from)}+(${r3(to - from)})*TI`;
  return `asendcmd=c='${r3(start)}-${r3(end)} [expr] ${target} ${param} ${expr}'`;
}

/**
 * Tarzlar. Her biri boy (`SIZES`) alip katman listesi ve toplam sure donduruyor.
 * Katman: { src, at, len (cikis suresi, sn), reverse, rate, fx[], fadeIn,
 * fadeInCurve, fadeOut, gain (dB), delay (sn) }. Tasarim: { hp (alcak kesim Hz),
 * eq ([[Hz, dB, Q]]; telefon hoparlorunun bandi icin), total (sn), layers }.
 */
const STYLES = [
  {
    id: "A",
    slug: "rift-whoosh",
    // Yarik uguldamasi: genis bant gurultu (patlama citirtisi + itici ates)
    // yukari kayan bir bant geciren ve flanger'dan geciyor -- emerek yukselen
    // "vuuuup"; altinda kuvvet alani ugultusu; yukselisin tepesinde yumusak,
    // tok bir "thwomp" (yumusak agir darbe + orta yumruk).
    build({ k, p, i }) {
      const w = 0.26 * k;
      const tail = 0.3 * k;
      return {
        hp: p < 1 ? 95 : 120,
        eq: [[1400, 3, 0.7]],
        total: w + tail,
        layers: [
          { src: "scifi/explosionCrunch_002", at: 0.15, len: w, rate: 0.9 * p, gain: 3, fadeIn: w * 0.95, fadeInCurve: "cub", fadeOut: 0.012,
            fx: [sweep("bandpass@a0", "f", 300 * p, 3000 * p, 0, w), "bandpass@a0=f=300:width_type=q:w=1", "flanger=delay=1:depth=4:regen=40:width=70:speed=3"] },
          { src: "scifi/thrusterFire_002", at: 0.5, len: w, rate: 0.85 * p, gain: 0, fadeIn: w * 0.9, fadeInCurve: "cub", fadeOut: 0.012,
            fx: [sweep("bandpass@a1", "f", 200 * p, 1600 * p, 0, w), "bandpass@a1=f=200:width_type=q:w=1"] },
          { src: "scifi/forceField_000", at: 0.08, len: w + 0.1 * k, rate: 0.78 * p, gain: -11, fadeIn: w * 0.8, fadeOut: 0.1 * k,
            fx: ["lowpass=f=1200"] },
          { src: `impact/${pick(["impactSoft_heavy_000", "impactSoft_heavy_001", "impactSoft_heavy_003"], i)}`, delay: w - 0.015, len: tail, rate: 0.85 * p, gain: -2, fadeOut: 0.18 * k,
            fx: ["equalizer=f=280:t=q:w=1:g=5"] },
          { src: `impact/${pick(["impactPunch_medium_000", "impactPunch_medium_001", "impactPunch_medium_002"], i)}`, delay: w - 0.01, len: 0.16 * k, rate: 0.75 * p, gain: -3, fadeOut: 0.09 * k,
            fx: ["lowpass=f=2400"] }
        ]
      };
    }
  },
  {
    id: "B",
    slug: "reverse-implosion",
    // Ters emme: dusuk frekans patlamasi ve citirtili patlama TERS caliniyor
    // (ses kendi icine cekiliyor, bas yukseliyor), phaser ile bukuluyor; tepe
    // noktasinda agir yumruk darbesi (yumusatilmis, kisa yanki cebi) ve kisa
    // bir alt bas cokmesi.
    build({ k, p, i }) {
      const w = 0.24 * k;
      const tail = 0.3 * k;
      return {
        hp: p < 1 ? 95 : 120,
        eq: [[1200, 3, 0.7]],
        total: w + tail,
        layers: [
          { src: "scifi/lowFrequency_explosion_001", at: 0, len: w, reverse: true, rate: 0.95 * p, gain: -2, fadeIn: w * 0.55, fadeInCurve: "cub", fadeOut: 0.008,
            fx: ["lowpass=f=2500", "equalizer=f=220:t=q:w=1:g=3"] },
          { src: `scifi/${pick(["explosionCrunch_000", "explosionCrunch_001", "explosionCrunch_003"], i)}`, at: 0, len: w, reverse: true, rate: 0.8 * p, gain: 0, fadeIn: w * 0.55, fadeInCurve: "cub", fadeOut: 0.008,
            fx: ["highpass=f=300", "aphaser=in_gain=0.6:out_gain=0.9:delay=3:decay=0.5:speed=1.5:type=t"] },
          { src: `impact/${pick(["impactPunch_heavy_000", "impactPunch_heavy_002", "impactPunch_heavy_004"], i)}`, delay: w - 0.005, len: tail, rate: 0.78 * p, fadeOut: 0.15 * k,
            fx: ["lowpass=f=2800", "aecho=in_gain=0.8:out_gain=0.75:delays=35|70:decays=0.35|0.18"] },
          { src: "scifi/lowFrequency_explosion_000", at: 0, delay: w, len: 0.22 * k, rate: 0.8 * p, gain: -8, fadeOut: 0.16 * k,
            fx: ["lowpass=f=500"] }
        ]
      };
    }
  },
  {
    id: "C",
    slug: "warp-field",
    // Bukulme alani: kuvvet alani ugultusu frekans kaydirici ile yukari
    // "bukuluyor" (armonik olmayan, nota degil), flanger; altinda ters
    // calinan, cok yavaslatilmis buyuk lazer yukselen bir supurme olarak.
    // Sonda alcak geciren kapanip ses "yutuluyor", yumusak darbe ile bitiyor.
    // Bas aninda duyuluyor (on sisme yok).
    build({ k, p, i }) {
      const body = 0.55 * k;
      const rise = 0.6 * body;
      const tail = 0.28 * k;
      return {
        hp: p < 1 ? 95 : 120,
        eq: [[1000, 2, 0.7]],
        total: rise + tail,
        layers: [
          { src: `scifi/${pick(["forceField_002", "forceField_003", "forceField_004"], i)}`, at: 0.1, len: body, rate: 0.85 * p, fadeIn: 0.02, fadeOut: 0.12 * k,
            fx: [
              sweep("afreqshift@c0", "shift", -40, 320 * p, 0, rise, "lin"),
              "afreqshift@c0=shift=-40",
              "flanger=delay=2:depth=3:regen=30:width=70:speed=4",
              sweep("lowpass@c1", "f", 8000, 350, rise, body),
              "lowpass@c1=f=8000"
            ] },
          { src: `scifi/${pick(["laserLarge_000", "laserLarge_001", "laserLarge_002"], i)}`, at: 0, len: rise, reverse: true, rate: 0.55 * p, gain: -5, fadeIn: rise * 0.7, fadeInCurve: "cub", fadeOut: 0.02,
            fx: ["afreqshift=shift=-90", "aphaser=in_gain=0.7:out_gain=0.9:delay=2:decay=0.4:speed=2:type=t"] },
          { src: `impact/${pick(["impactSoft_heavy_002", "impactSoft_heavy_004", "impactSoft_heavy_000"], i)}`, delay: rise - 0.01, len: tail, rate: 0.8 * p, gain: -3, fadeOut: 0.15 * k,
            fx: ["equalizer=f=300:t=q:w=1:g=4"] },
          { src: `impact/${pick(["impactPunch_medium_001", "impactPunch_medium_002", "impactPunch_medium_000"], i)}`, delay: rise - 0.008, len: 0.15 * k, rate: 0.72 * p, gain: -6, fadeOut: 0.09 * k,
            fx: ["lowpass=f=2200"] }
        ]
      };
    }
  },
  {
    id: "D",
    slug: "pulse-thrum",
    // Enerji gumburtusu: kuvvet alani cok alcaltilmis, hizli titresimle
    // (pulsator) "vuvuvu" atan bir enerji ugultusu; bant geciren yukari
    // aciliyor; altinda itici ates gurlemesi. Sonda derin, koyu bir darbe ve
    // alcak frekans patlamasinin kisa kuyrugu. En karanlik ve en agir tarz.
    build({ k, p, i }) {
      const w = 0.3 * k;
      const tail = 0.3 * k;
      return {
        hp: p < 1 ? 90 : 110,
        eq: [[900, 4, 0.8]],
        total: w + tail,
        layers: [
          { src: `scifi/${pick(["forceField_000", "forceField_001", "forceField_003"], i)}`, at: 0.05, len: w + 0.04, rate: 0.62 * p, gain: 2, fadeIn: w * 0.5, fadeInCurve: "qsin", fadeOut: 0.04,
            fx: [
              "apulsator=mode=sine:hz=22:amount=0.75",
              sweep("bandpass@d0", "f", 250 * p, 1600 * p, 0, w),
              "bandpass@d0=f=250:width_type=q:w=0.9",
              "equalizer=f=900:t=q:w=1:g=6"
            ] },
          { src: "scifi/thrusterFire_001", at: 1.0, len: w + 0.2 * k, rate: 0.7 * p, gain: -8, fadeIn: w * 0.8, fadeOut: 0.18 * k,
            fx: ["lowpass=f=1200"] },
          { src: `impact/${pick(["impactPunch_heavy_001", "impactPunch_heavy_003", "impactPunch_heavy_000"], i)}`, delay: w, len: tail, rate: 0.65 * p, fadeOut: 0.18 * k,
            fx: ["lowpass=f=2000", "equalizer=f=600:t=q:w=1:g=4"] },
          { src: "scifi/lowFrequency_explosion_001", at: 0, delay: w, len: 0.28 * k, rate: 0.75 * p, gain: -8, fadeOut: 0.2 * k,
            fx: ["lowpass=f=450"] }
        ]
      };
    }
  }
];

/**
 * Karsilastirmadaki "simdiki" olum sesi. Sahip A ve D'yi secti; ikisi artik
 * tools/sfx-portal.mjs'de ve oyunda (death-portal-*). Eski ezilme + yaratik
 * sesi dosyalari silindi; simdiki ses oyundaki kucuk A portali.
 */
const CURRENT_KILL = [
  { file: join(root, "apps", "web", "public", "audio", "sfx", "death-portal-a-small.mp3"), gain: 0 }
];

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    packs: value("--packs") ?? process.env.SFX_PACKS,
    ffmpeg: value("--ffmpeg") ?? process.env.FFMPEG ?? "ffmpeg",
    out: value("--out") ?? join(root, "ses-adaylari", "olum-portal")
  };
}

let FFMPEG = "ffmpeg";

function run(args) {
  const result = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-y", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg ${args.join(" ")}\n${result.stderr.slice(-2000)}`);
  return result.stderr;
}

/** Entegre yukseklik (LUFS; kisa dosyalar icin sona 0.5 sn sessizlik), ornek tepe, RMS, sure. */
function measure(file) {
  const log = run(["-i", file, "-af", "aresample=44100,aformat=channel_layouts=mono,astats=measure_overall=RMS_level+Peak_level+Number_of_samples:measure_perchannel=none,apad=pad_dur=0.5,ebur128", "-f", "null", "-"]);
  const number = (re) => {
    const match = re.exec(log);
    return !match ? Number.NaN : match[1] === "-inf" ? -120 : Number(match[1]);
  };
  let lufs = Number.NaN;
  for (const match of log.matchAll(/I:\s+(-?[\d.]+) LUFS/g)) lufs = Number(match[1]);
  const mid = run(["-i", file, "-af", "aresample=44100,aformat=channel_layouts=mono,highpass=f=500,highpass=f=500,lowpass=f=5000,lowpass=f=5000,astats=measure_overall=RMS_level:measure_perchannel=none", "-f", "null", "-"]);
  const midRms = /RMS level dB: (-?[\d.]+|-inf)/.exec(mid);
  const rms = number(/RMS level dB: (-?[\d.]+|-inf)/);
  return {
    lufs,
    rms,
    peak: number(/Peak level dB: (-?[\d.]+|-inf)/),
    seconds: number(/Number of samples: (\d+)/) / 44100,
    midBandDb: midRms ? Number(midRms[1]) - rms : Number.NaN
  };
}

function resolveSource(packs, src) {
  const [pack, name] = src.split("/");
  for (const extension of [".ogg", ".mp3"]) {
    const file = join(packs, PACK_DIRS[pack], `${name}${extension}`);
    if (existsSync(file)) return file;
  }
  throw new Error(`kaynak yok: ${src}`);
}

const durationCache = new Map();
function sourceSeconds(file) {
  if (!durationCache.has(file)) durationCache.set(file, measure(file).seconds);
  return durationCache.get(file);
}

/** Katmanlari karistirip ham (normalize edilmemis) WAV yaz. */
function renderMix(packs, design, out) {
  const inputs = [];
  const chains = design.layers.map((layer, index) => {
    const file = resolveSource(packs, layer.src);
    inputs.push("-i", file);
    const rate = layer.rate ?? 1;
    const available = Math.max(0.01, (sourceSeconds(file) - (layer.at ?? 0)) / rate);
    const len = Math.min(layer.len, available);
    const fadeIn = Math.min(layer.fadeIn ?? 0.004, len * 0.95);
    const fadeOut = Math.min(layer.fadeOut ?? 0.03, len - fadeIn);
    const steps = [
      `[${index}:a]aresample=44100`,
      "aformat=sample_fmts=fltp:channel_layouts=mono",
      `atrim=start=${r3(layer.at ?? 0)}:duration=${r3(len * rate)}`,
      "asetpts=PTS-STARTPTS",
      // Bastaki sessizlik (ters cevrilen katmanda sondaki) atiliyor.
      "silenceremove=start_periods=1:start_threshold=-50dB",
      ...(layer.reverse ? ["areverse"] : []),
      `asetrate=${Math.round(44100 * rate)}`,
      "aresample=44100",
      "asetpts=PTS-STARTPTS",
      // Kucuk cerceveler: asendcmd supurmeleri ~6 ms adimla.
      "asetnsamples=n=256:p=0",
      ...(layer.fx ?? []),
      `afade=t=in:d=${r3(fadeIn)}${layer.fadeInCurve ? `:curve=${layer.fadeInCurve}` : ""}`,
      `afade=t=out:st=${r3(Math.max(0, len - fadeOut))}:d=${r3(fadeOut)}`,
      `volume=${layer.gain ?? 0}dB`,
      `adelay=${Math.max(0, Math.round((layer.delay ?? 0) * 1000))}`
    ];
    return `${steps.join(",")}[l${index}]`;
  });
  const n = design.layers.length;
  const master = [
    `${design.layers.map((_, index) => `[l${index}]`).join("")}amix=inputs=${n}:normalize=0:duration=longest`,
    `highpass=f=${design.hp}`,
    `highpass=f=${design.hp}`,
    ...(design.eq ?? []).map(([f, g, w]) => `equalizer=f=${f}:t=q:w=${w ?? 1}:g=${g}`),
    "acompressor=threshold=0.125:ratio=3:attack=4:release=80:makeup=1",
    `atrim=duration=${r3(design.total)}`,
    `afade=t=out:st=${r3(design.total - 0.02)}:d=0.02[out]`
  ].join(",");
  run([...inputs, "-filter_complex", `${chains.join(";")};${master}`, "-map", "[out]", "-ac", "1", "-ar", "44100", "-c:a", "pcm_f32le", out]);
}

/** Yuksekligi hedefe cek, tepeyi sinirla (iki tur), WAV yaz. */
function normalize(input, out, work) {
  let current = input;
  for (let pass = 0; pass < 3; pass += 1) {
    const level = measure(current);
    const gain = TARGET_LUFS - level.lufs;
    if (Math.abs(gain) < 0.15 && level.peak <= PEAK_DB + 0.05) break;
    const next = join(work, `norm-${pass}-${Date.now()}.wav`);
    // Sinirlayici -3.3 dBFS'te (MP3 kodlamasi tepeyi biraz oynatiyor);
    // gecikmesi telafi ediliyor, otomatik seviye kapali.
    run(["-i", current, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=${Math.pow(10, (PEAK_DB - 0.3) / 20).toFixed(4)}:attack=3:release=40:level=0:latency=1`, "-c:a", "pcm_f32le", next]);
    current = next;
  }
  run(["-i", current, "-c:a", "pcm_f32le", out]);
}

function encode(wav, base) {
  run(["-i", wav, "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", `${base}.mp3`]);
  run(["-i", wav, "-ac", "1", "-ar", "44100", "-c:a", "libvorbis", "-q:a", "5", "-map_metadata", "-1", `${base}.ogg`]);
}

function build() {
  const { packs, ffmpeg, out } = parseArgs();
  FFMPEG = ffmpeg;
  if (!packs || Object.values(PACK_DIRS).some((dir) => !existsSync(join(packs, dir)))) {
    console.error(`Ham paket klasoru bulunamadi. --packs <klasor> verin (icinde ${Object.values(PACK_DIRS).join(", ")}).`);
    process.exit(1);
  }
  mkdirSync(out, { recursive: true });
  const work = join(tmpdir(), `karayel-portal-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const rows = [];
  const compare = [];
  try {
    // Simdiki olum sesi (karsilastirma icin, ayni yukseklige cekilmis).
    const currentRaw = join(work, "current-raw.wav");
    run([
      ...CURRENT_KILL.flatMap((part) => ["-i", part.file]),
      "-filter_complex",
      `${CURRENT_KILL.map((part, index) => `[${index}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono,volume=${part.gain.toFixed(2)}dB[c${index}]`).join(";")};${CURRENT_KILL.map((_, index) => `[c${index}]`).join("")}amix=inputs=${CURRENT_KILL.length}:normalize=0:duration=longest[out]`,
      "-map", "[out]", "-c:a", "pcm_f32le", currentRaw
    ]);
    const current = join(work, "current.wav");
    normalize(currentRaw, current, work);
    compare.push(current);

    for (const style of STYLES) {
      for (const size of SIZES) {
        const name = `${style.id}-${style.slug}-${size.n}`;
        const raw = join(work, `${name}-raw.wav`);
        const wav = join(work, `${name}.wav`);
        renderMix(packs, style.build(size), raw);
        normalize(raw, wav, work);
        encode(wav, join(out, name));
        if (size.n === 2) compare.push(wav);
        const level = measure(join(out, `${name}.mp3`));
        const bytes = statSync(join(out, `${name}.mp3`)).size;
        rows.push({ name, ...level, bytes });
        console.log(`${name.padEnd(26)} ${String(Math.round(level.seconds * 1000)).padStart(5)} ms  ${String(bytes).padStart(6)} B  ${level.lufs.toFixed(1)} LUFS  rms ${level.rms.toFixed(1)}  tepe ${level.peak.toFixed(1)}  orta bant ${level.midBandDb.toFixed(1)} dB`);
      }
    }

    // Karsilastirma: simdiki, A2, B2, C2, D2; aralarda 0.6 sn sessizlik.
    const gap = 0.6;
    run([
      ...compare.flatMap((file) => ["-i", file]),
      "-filter_complex",
      `${compare.map((_, index) => `[${index}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono,apad=pad_dur=${gap}[k${index}]`).join(";")};${compare.map((_, index) => `[k${index}]`).join("")}concat=n=${compare.length}:v=0:a=1[out]`,
      "-map", "[out]", "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", join(out, "karsilastirma.mp3")
    ]);
    const currentLevel = measure(current);
    console.log(`\nsimdiki olum sesi (karsilastirmada) ${currentLevel.lufs.toFixed(1)} LUFS, tepe ${currentLevel.peak.toFixed(1)}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const bad = rows.filter((row) => row.peak > PEAK_DB + 0.3 || Math.abs(row.lufs - TARGET_LUFS) > 1);
  if (bad.length > 0) console.warn(`\nUyari, seviye disi: ${bad.map((row) => row.name).join(", ")}`);
  console.log(`\n${rows.length} aday + karsilastirma.mp3 -> ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  build();
}

export { STYLES, SIZES, TARGET_LUFS, PEAK_DB };
