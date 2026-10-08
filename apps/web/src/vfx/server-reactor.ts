/**
 * Sunucu'nun reaktoru: cekirdegin cevresine sizan elektrik arklari.
 *
 * Arklar gorselde boyaliydi ve oyunda donuk duruyordu. Dokudan silindiler
 * (`images/towers/tower-warrior-2-*`); burada canli ciziliyorlar. Kokler ve
 * uclar gorselden olculdu: alti ark, cekirdegi tutan dort kelepcenin
 * arasindaki bosluklardan (ustte iki, solda, sagda, altta iki) disa siziyor.
 * Cekirdek tam merkezde degil, kadranin yari boyunun 0,138'i kadar asagida.
 * Uc kademenin gorselinde de yerleri ayni.
 *
 * Hareket hafif: her arkin kirik noktalari kendi yavas dalgasiyla yana
 * kayiyor, uc biraz uzayip kisaliyor, parlaklik nefes aliyor. Ani yeniden
 * cizim (titreme) yok. Hareket azaltmada bicim ve parlaklik sabit.
 *
 * Olculer dokunun ekrandaki yari boyuna gore: secim ve inis olcegiyle
 * buyuyup kuculuyor, doku donerse bicim de donuyor. Maliyet: ark basina iki
 * yol cizgisi (6 parca); kademe 3'te ark basina bir `lineBetween` catal.
 */
import { hashNoise, whiteHot, type VfxGraphics, type VfxTier } from "./kit";

export type ServerReactorInput = {
  /** Dokunun merkezi. */
  x: number;
  y: number;
  /** Dokunun ekrandaki yari boyu: secim, inis ve nabiz olcegi dahil. */
  half: number;
  /** Dokunun donusu (radyan). */
  rotation: number;
  tier: VfxTier;
  now: number;
  /** Hareket azaltma: bicim ve parlaklik sabit. */
  still: boolean;
  /** Kendi kulende 1, takim arkadasinda soluk. */
  alpha: number;
};

/** Reaktor cekirdeginin merkezi, dokunun yari boyu biriminde (gorselden olculdu). */
export const SERVER_REACTOR_CORE = { x: 0.003, y: 0.138 } as const;

/**
 * Arklar, cekirdege gore: kokun ve ucun acisi (derece, saat yonu; 0 sag) ve
 * cekirdekten uzakligi (yari boy biriminde). Gorseldeki boyali arklardan.
 */
export const SERVER_REACTOR_ARCS: ReadonlyArray<{ from: number; to: number; root: number; tip: number }> = [
  { from: -8, to: -17, root: 0.178, tip: 0.317 },
  { from: 75, to: 74, root: 0.18, tip: 0.3 },
  { from: 105, to: 107, root: 0.178, tip: 0.3 },
  { from: -171, to: -163, root: 0.182, tip: 0.318 },
  { from: -105, to: -110, root: 0.168, tip: 0.274 },
  { from: -73, to: -69, root: 0.168, tip: 0.274 }
];

/** Reaktorun mavisi (Sunucu'nun VFX tonu). */
export const SERVER_REACTOR_HUE = 0x58d9ff;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
/** Arkin kirik parca sayisi. */
const SEGMENTS = 6;
/** Kiriklarin sabit zikzagi ve yana kayma genligi (yari boy biriminde). */
const JAG = 0.015;
const SWAY = 0.018;
/** Yana kaymanin bir dalgasi (ms); nokta basina 0,8-1,25 kati. */
const SWAY_MS = 950;
/** Ucun uzayip kisalmasi (oran) ve bir dalgasi (ms). */
const REACH = 0.06;
const REACH_MS = 1300;
/** Parlakligin bir nefesi (ms). */
const BREATH_MS = 1700;

const XS = new Float64Array(SEGMENTS + 1);
const YS = new Float64Array(SEGMENTS + 1);

/** Yavas dalga, -1..1; periyodu ve evresi tohumdan. Hareket azaltmada 0. */
function wave(now: number, period: number, seed: number, still: boolean) {
  if (still) return 0;
  return Math.sin((TAU * now) / (period * (0.8 + 0.45 * hashNoise(seed))) + TAU * hashNoise(seed + 0.5));
}

function strokeArc(g: VfxGraphics, width: number, color: number, alpha: number) {
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(XS[0], YS[0]);
  for (let index = 1; index <= SEGMENTS; index += 1) g.lineTo(XS[index], YS[index]);
  g.strokePath();
}

export function drawServerReactorArcs(g: VfxGraphics, input: ServerReactorInput) {
  const { half, still, now } = input;
  if (!(half > 0) || !(input.alpha > 0)) return;
  const cos = Math.cos(input.rotation);
  const sin = Math.sin(input.rotation);
  const coreX = input.x + (SERVER_REACTOR_CORE.x * cos - SERVER_REACTOR_CORE.y * sin) * half;
  const coreY = input.y + (SERVER_REACTOR_CORE.x * sin + SERVER_REACTOR_CORE.y * cos) * half;
  const glowWidth = half * (input.tier >= 3 ? 0.056 : 0.05);
  const coreWidth = half * (input.tier >= 3 ? 0.019 : input.tier >= 2 ? 0.017 : 0.015);
  const hot = whiteHot(SERVER_REACTOR_HUE, input.tier >= 3 ? 0.9 : input.tier >= 2 ? 0.6 : 0.3);

  for (let arc = 0; arc < SERVER_REACTOR_ARCS.length; arc += 1) {
    const spec = SERVER_REACTOR_ARCS[arc];
    const seed = arc * 17.3 + 3.1;
    const from = spec.from * DEG + input.rotation;
    const to = spec.to * DEG + input.rotation;
    const reach = spec.tip * (1 + REACH * wave(now, REACH_MS, seed + 1, still)) * half;
    const rootX = coreX + Math.cos(from) * spec.root * half;
    const rootY = coreY + Math.sin(from) * spec.root * half;
    const dx = coreX + Math.cos(to) * reach - rootX;
    const dy = coreY + Math.sin(to) * reach - rootY;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    for (let index = 0; index <= SEGMENTS; index += 1) {
      let offset = 0;
      if (index > 0) {
        // Kok kelepceye bagli; kiriklar zikzaginda salinip, uc en serbest.
        // Kirik boylari ve yerleri tohumdan: duzenli bir testere disi degil.
        const jag = index < SEGMENTS ? (index % 2 === 1 ? 1 : -1) * JAG * (0.35 + 0.65 * hashNoise(seed + index)) : 0;
        const sway = SWAY * wave(now, SWAY_MS, seed + index * 2.7, still) * (index === SEGMENTS ? 1.2 : 1);
        offset = (jag + sway) * half;
      }
      const along = index === 0 || index === SEGMENTS ? index / SEGMENTS : (index + (hashNoise(seed + index * 5.1) - 0.5) * 0.5) / SEGMENTS;
      XS[index] = rootX + dx * along + nx * offset;
      YS[index] = rootY + dy * along + ny * offset;
    }
    const breath = still ? 1 : 0.85 + 0.15 * wave(now, BREATH_MS, seed + 9, false);
    strokeArc(g, glowWidth, SERVER_REACTOR_HUE, 0.42 * breath * input.alpha);
    strokeArc(g, coreWidth, hot, 0.95 * breath * input.alpha);

    if (input.tier >= 3) {
      // Ikinci kiriktan disa kisa bir catal; yavasca belirip sonuyor.
      const side = arc % 2 === 0 ? 1 : -1;
      const fork = 0.055 * half;
      const ux = dx / length;
      const uy = dy / length;
      const turn = (0.6 + 0.12 * wave(now, SWAY_MS, seed + 21, still)) * side;
      const endX = XS[2] + (ux * Math.cos(turn) - uy * Math.sin(turn)) * fork;
      const endY = YS[2] + (ux * Math.sin(turn) + uy * Math.cos(turn)) * fork;
      const fade = still ? 0.7 : 0.45 + 0.35 * wave(now, BREATH_MS, seed + 33, false);
      g.lineStyle(coreWidth * 0.85, hot, fade * breath * input.alpha);
      g.lineBetween(XS[2], YS[2], endX, endY);
    }
  }
}
