/**
 * Dusman olum sesi: "portal / yarik acilip dusmani yutuyor".
 *
 * tools/build-sfx.mjs bu modulle `death-portal-*` dosyalarini uretiyor.
 * Tarifler sahibin dinleyip sectigi iki aday tarz (bkz.
 * tools/build-portal-death-candidates.mjs; A ve D):
 *
 *  - A "rift whoosh" (yarik uguldamasi): genis bant gurultu yukari kayan bir
 *    bant geciren ve flanger'dan geciyor -- emerek yukselen "vuuuup"; tepesinde
 *    yumusak, tok bir "thwomp".
 *  - D "pulse thrum" (enerji gumburtusu): cok alcaltilmis kuvvet alani hizli
 *    titresimle (pulsator) "vuvuvu" atiyor, bant geciren aciliyor; sonda derin
 *    bir darbe ve alcak frekans patlamasinin kisa kuyrugu.
 *
 * Kaynaklar Kenney "Sci-Fi Sounds" ve "Impact Sounds" (CC0).
 *
 * Her tarzin uc boyu var (`PORTAL_SIZES`): small (siradan dusman), normal
 * (agir: kaba, kusatma), large (sampiyon). Boy zaman olcegi `k`, perde/hiz
 * `p` ve darbe kaydinin cesidi `i` ile degisiyor.
 *
 * Sisme (`swell`): darbeden onceki emme/uguldama, saniye. Darbe tam bu anda
 * geliyor; yani dusman oldugunde "tok" ses bu kadar gecikiyor. Tarzin kendi
 * sismesi `style.swell * k` (A 0.26 sn, D 0.30 sn x boy olcegi). Siradan
 * oldurme cok sik oldugu icin KUCUK boyda sisme sabit `PORTAL_SMALL_SWELL`
 * (0.15 sn; adayda A 0.20, D 0.23 sn): darbe oldurmeye yakin dussun. Kuyruk
 * (`0.3 * k`) ve darbe katmanlari degismiyor, yani karakter ayni; yalnizca on
 * sisme kisa (ve alcak kesim biraz yuksek, bkz. `PORTAL_SMALL_HIGHPASS`).
 * Normal ve buyuk boy sahibin dinledigi adaylarla bire bir ayni.
 *
 * Zincir (adaylarla ayni):
 *  1. Katmanlar: kaynaktan `at` saniyeden kes, bastaki sessizligi at, hiz/perde
 *     (`rate`), suzgecler (`fx`; `sweep()` ile zamanla kayan bant/frekans),
 *     giris/cikis sonmesi, kazanc, gecikme.
 *  2. Karisim -> alcak kesim -> EQ -> hafif kompresor -> toplam sureye kes.
 *  3. Yukseklik: EBU R128 entegre yuksekligi `PORTAL_TARGET_LUFS`a, tepe
 *     <= `PORTAL_PEAK_DB` (lookahead sinirlayici).
 */
import { join } from "node:path";

/** Hedef entegre yukseklik (LUFS) ve ornek tepe siniri (dBFS). */
export const PORTAL_TARGET_LUFS = -20;
export const PORTAL_PEAK_DB = -3;

/** Kucuk boyun darbe oncesi sismesi (sn); bkz. dosya basi. */
export const PORTAL_SMALL_SWELL = 0.15;

/**
 * Kucuk boyun alcak kesimi (Hz; tarzinki 110-120). Kisa sismede yukselen
 * gurultu daha az enerji tasiyor ve darbenin basi one cikiyor: A'nin telefon
 * bandi (500 Hz - 5 kHz) payi -12.9 dB'e dusuyordu (denetim siniri -12).
 * Telefon hoparloru 250 Hz altini zaten calamiyor; 150 Hz kesim payi
 * -11.2 dB'e cekiyor, sisme katmanlarina dokunmadan.
 */
export const PORTAL_SMALL_HIGHPASS = 150;

/**
 * Boylar: `k` zaman olcegi, `p` perde/hiz carpani, `i` darbe kaydinin cesidi,
 * `swell` verilirse tarzin sismesinin yerine (sn), `hp` verilirse tarzin alcak
 * kesiminin yerine (Hz).
 */
export const PORTAL_SIZES = Object.freeze([
  Object.freeze({ id: "small", k: 0.78, p: 1.1, i: 0, swell: PORTAL_SMALL_SWELL, hp: PORTAL_SMALL_HIGHPASS }),
  Object.freeze({ id: "normal", k: 1, p: 1, i: 1 }),
  Object.freeze({ id: "large", k: 1.45, p: 0.8, i: 2 })
]);

const pick = (list, i) => list[i % list.length];
const r3 = (value) => Number(value.toFixed(4));

/**
 * Zamanla kayan suzgec parametresi (asendcmd). `curve` "exp" (oransal; from,to > 0)
 * ya da "lin". `from`/`to` katmanin kendi zamaninda [start, end] araliginda.
 */
export function sweep(target, param, from, to, start, end, curve = "exp") {
  const expr = curve === "exp"
    ? `${r3(from)}*exp(${r3(Math.log(to / from))}*TI)`
    : `${r3(from)}+(${r3(to - from)})*TI`;
  return `asendcmd=c='${r3(start)}-${r3(end)} [expr] ${target} ${param} ${expr}'`;
}

/**
 * Tarzlar. `swell` boy olcegi 1'deki sisme (sn); `build(size, w)` sisme `w` ile
 * tasarimi donduruyor. Katman: { src, at, len (cikis suresi, sn), reverse,
 * rate, fx[], fadeIn, fadeInCurve, fadeOut, gain (dB), delay (sn) }. Tasarim:
 * { hp (alcak kesim Hz), eq ([[Hz, dB, Q]]), total (sn), layers }.
 */
export const PORTAL_STYLES = Object.freeze([
  {
    id: "a",
    slug: "rift-whoosh",
    swell: 0.26,
    build({ k, p, i }, w) {
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
    id: "d",
    slug: "pulse-thrum",
    swell: 0.3,
    build({ k, p, i }, w) {
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
].map((style) => Object.freeze(style)));

export function getPortalStyle(id) {
  const style = PORTAL_STYLES.find((entry) => entry.id === id);
  if (!style) throw new Error(`bilinmeyen portal tarzi: ${id}`);
  return style;
}

export function getPortalSize(id) {
  const size = PORTAL_SIZES.find((entry) => entry.id === id);
  if (!size) throw new Error(`bilinmeyen portal boyu: ${id}`);
  return size;
}

/** Darbeden onceki sisme (sn): boyun sabiti ya da tarzin sismesi x boy olcegi. */
export function getPortalSwell(style, size) {
  return size.swell ?? style.swell * size.k;
}

/** Tarz x boy tasarimi (katmanlar, alcak kesim, toplam sure, sisme). */
export function getPortalDesign(styleId, sizeId) {
  const style = getPortalStyle(styleId);
  const size = getPortalSize(sizeId);
  const swell = getPortalSwell(style, size);
  const design = style.build(size, swell);
  return { ...design, hp: size.hp ?? design.hp, swell };
}

/**
 * Katmanlari karistirip ham (normalize edilmemis) WAV yaz.
 * `tools`: { run(args) (ffmpeg), resolveSource(src) -> dosya, sourceSeconds(file) }.
 */
export function renderPortalMix(tools, design, out) {
  const inputs = [];
  const chains = design.layers.map((layer, index) => {
    const file = tools.resolveSource(layer.src);
    inputs.push("-i", file);
    const rate = layer.rate ?? 1;
    const available = Math.max(0.01, (tools.sourceSeconds(file) - (layer.at ?? 0)) / rate);
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
  tools.run([...inputs, "-filter_complex", `${chains.join(";")};${master}`, "-map", "[out]", "-ac", "1", "-ar", "44100", "-c:a", "pcm_f32le", out]);
}

/** Entegre yukseklik (LUFS; kisa dosyalar icin sona 0.5 sn sessizlik) ve ornek tepe (dBFS). */
export function measurePortalLoudness(run, file) {
  const log = run(["-i", file, "-af", "aresample=44100,aformat=channel_layouts=mono,astats=measure_overall=Peak_level:measure_perchannel=none,apad=pad_dur=0.5,ebur128", "-f", "null", "-"]);
  let lufs = Number.NaN;
  for (const match of log.matchAll(/I:\s+(-?[\d.]+) LUFS/g)) lufs = Number(match[1]);
  const peak = /Peak level dB: (-?[\d.]+|-inf)/.exec(log);
  return { lufs, peak: !peak ? Number.NaN : peak[1] === "-inf" ? -120 : Number(peak[1]) };
}

let normalizeSerial = 0;

/** Yuksekligi hedefe cek, tepeyi sinirla (en fazla uc tur), WAV yaz. */
export function normalizePortal(run, input, out, work) {
  let current = input;
  for (let pass = 0; pass < 3; pass += 1) {
    const level = measurePortalLoudness(run, current);
    const gain = PORTAL_TARGET_LUFS - level.lufs;
    if (Math.abs(gain) < 0.15 && level.peak <= PORTAL_PEAK_DB + 0.05) break;
    normalizeSerial += 1;
    const next = join(work, `norm-${normalizeSerial}-${pass}.wav`);
    // Sinirlayici -3.3 dBFS'te (MP3 kodlamasi tepeyi biraz oynatiyor);
    // gecikmesi telafi ediliyor, otomatik seviye kapali.
    run(["-i", current, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=${Math.pow(10, (PORTAL_PEAK_DB - 0.3) / 20).toFixed(4)}:attack=3:release=40:level=0:latency=1`, "-c:a", "pcm_f32le", next]);
    current = next;
  }
  run(["-i", current, "-c:a", "pcm_f32le", out]);
}
