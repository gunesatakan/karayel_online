/**
 * Vurus turunun imzasi: her vurus turu dusmana kendi "tatmin fiiliyle"
 * degiyor (sahibin istegi, 2026-10-20: "her vurus turu icin farkli tarzda bir
 * tatmin; oyuncu kule vurdukca farkli hislere kapilmali").
 *
 * - Mermi -> delip gecme: giris cakmasi, govdenin arkasindan mermi yonunde
 *   fiskiran sicak parca demeti, giris noktasinda sonen kor deligi.
 * - Carpma -> ezme: govdeyi saran sok halkasi, merkezden catlak yildizi,
 *   yerde toz halkasi.
 * - Odak -> eritme: isindikca buyuyen erimis nokta, asagi damlayan erimis
 *   parcalar, yukselen duman (isin temasi, `emitBeamContact`).
 * - Aura -> kilitleme: govde boyunda kapanan altigen kafes, kenarda statik.
 * - Dalga -> supurme: govdenin onunde ilerleyen basinc yayi, arkada toz.
 * - Lanet -> curutme: ice cekilen koyu zerreler, koyu cekirdek.
 * - Kesme -> bicme: govdeyi boydan kesen sert cizgi, uclardan kivilcim.
 * - Bulasma -> yayilma: govdeden disari kirikli koyu damarlar.
 *
 * Dil ayni (vfx-profiles): az renk, beyaz-sicak cekirdek -> kulenin tonu ->
 * koyu; parilti, yaldiz, muzikal pirilti yok. Olcu dusmanin govdesinden
 * (`size`, dunya px): telefonda okunuyor. Kivilcim, kirinti ve duman LOD'un
 * kapilarinda; hareket azaltmada yalnizca yerinde sonen sekiller.
 *
 * Hepsi saf: olayin yasindan cizim, tohum olay kimliginden. Kare basina
 * nesne yok (secenek nesneleri modul duzeyinde yeniden yaziliyor).
 */
import { towerCatalog, type HitType } from "@karayel/shared";
import {
  SMOKE,
  clamp01,
  darken,
  drawBallisticSparks,
  drawCrackle,
  drawDebris,
  drawSmoke,
  fillDisc,
  groundHue,
  hashNoise,
  strokeHex,
  strokeRing,
  whiteHot,
  type BallisticSparkOptions,
  type CrackleOptions,
  type DebrisOptions,
  type SmokeOptions,
  type VfxGraphics
} from "./kit";
import { getProfileDefinitionId, getVfxProfile } from "./vfx-profiles";

export type HitSignature = "pierce" | "crush" | "melt" | "lock" | "sweep" | "decay" | "cleave" | "spread";

/** Imzanin cizim suresi (ms): olay en az bu kadar yasiyor. */
export const HIT_SIGNATURE_MS: Readonly<Record<HitSignature, number>> = Object.freeze({
  pierce: 320,
  crush: 340,
  melt: 420,
  lock: 260,
  sweep: 280,
  decay: 300,
  cleave: 220,
  spread: 320
});

const HIT_TYPE_SIGNATURE: Readonly<Record<Exclude<HitType, "none">, HitSignature>> = Object.freeze({
  projectile: "pierce",
  impact: "crush",
  focus: "melt",
  aura: "lock",
  wave: "sweep",
  curse: "decay",
  slash: "cleave",
  contamination: "spread"
});

/** Kulenin kendi hissi vurus turundan farkli olanlar: Kin bir aura ama dalga gibi itiyor. */
const SIGNATURE_OVERRIDES: Readonly<Record<string, HitSignature>> = Object.freeze({
  "zeynep-6": "sweep"
});

const hitTypes = new Map<string, HitType>();
for (const towers of Object.values(towerCatalog)) {
  for (const tower of towers) if (!hitTypes.has(tower.id) && tower.hitType) hitTypes.set(tower.id, tower.hitType);
}
const signatures = new Map<string, HitSignature>();

/** Kimligin (mermi, isin, kule) vurus imzasi; vurus turu yoksa profilin maddesinden. */
export function getHitSignature(definitionId: string | undefined): HitSignature {
  const id = getProfileDefinitionId(definitionId);
  const cached = signatures.get(id);
  if (cached) return cached;
  let signature = SIGNATURE_OVERRIDES[id];
  if (!signature) {
    const hitType = hitTypes.get(id);
    if (hitType && hitType !== "none") signature = HIT_TYPE_SIGNATURE[hitType];
    else signature = getVfxProfile(id).matter === "kinetic" ? "pierce" : "crush";
  }
  signatures.set(id, signature);
  return signature;
}

export type HitSignatureInput = {
  x: number;
  y: number;
  angle: number;
  /** Govdenin ekrandaki capi (dunya px). */
  size: number;
  tier: 1 | 2 | 3;
  seed: number;
  /** Kulenin tonu (kademe), cekirdegin sicakligi ve govdenin agirligi. */
  hue: number;
  heat: number;
  weight: number;
  /** Takim arkadasi: eklentiler soluk. */
  extra: number;
  /** Lazerin dusmanda biriktirdigi isi (0-1); yalnizca eritme. */
  beamHeat: number;
};

export type HitSignatureGates = { sparks: boolean; smoke: boolean; still: boolean };

const SPARKS: BallisticSparkOptions = { seed: 0, count: 0, speed: 0, heading: undefined, fan: 0, gravity: 0, lifeMs: 0, hue: 0, width: 0, alpha: 0, streak: 0.03 };
const DEBRIS: DebrisOptions = { seed: 0, count: 0, speed: 0, heading: undefined, fan: 0, gravity: 0, lifeMs: 0, color: 0, edge: 0, size: 0, alpha: 0, floor: 0 };
const SMOKE_PUFF: SmokeOptions = { seed: 0, count: 0, radius: 0, grow: 0, rise: 0, lifeMs: 0, color: SMOKE, alpha: 0, still: false };
const CRACKLE: CrackleOptions = { seed: 0, count: 0, reach: 0, hue: 0, width: 0, alpha: 0, heading: undefined, fan: 0 };
/** Erimis metalin rengi: sicak turuncu, yere indirilmis (pirilti yok). */
const MOLTEN = groundHue(0xff8a3d);
const STEEL = 0x52525b;
const STEEL_EDGE = 0xe4e4e7;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** Imzayi ciz; `elapsed` olayin yasi (ms). */
export function drawHitSignature(g: VfxGraphics, signature: HitSignature, input: HitSignatureInput, elapsed: number, scale: number, gates: HitSignatureGates, ground?: VfxGraphics) {
  if (elapsed < 0 || elapsed >= HIT_SIGNATURE_MS[signature]) return;
  switch (signature) {
    case "pierce": return drawPierce(g, input, elapsed, scale, gates, ground);
    case "crush": return drawCrush(g, input, elapsed, scale, gates);
    case "melt": return drawMelt(g, input, elapsed, scale, gates);
    case "lock": return drawLock(g, input, elapsed, scale, gates);
    case "sweep": return drawSweep(g, input, elapsed, scale, gates);
    case "decay": return drawDecay(g, input, elapsed, scale, gates);
    case "cleave": return drawCleave(g, input, elapsed, scale, gates);
    case "spread": return drawSpread(g, input, elapsed, scale, gates);
    default:
  }
}

/** Mermi: govdeyi delip gecen iz, arkadan fiskiran demet, kor deligi. */
function drawPierce(g: VfxGraphics, input: HitSignatureInput, elapsed: number, scale: number, gates: HitSignatureGates, ground?: VfxGraphics) {
  const { x, y, angle, size, tier, hue, extra } = input;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const through = size * 0.85;
  const exitX = x + ux * through;
  const exitY = y + uy * through;
  // Delip gecen iz: girisle cikis arasinda 2-3 karelik beyaz-sicak cizgi.
  if (elapsed < 55) {
    const fade = 1 - elapsed / 55;
    g.lineStyle(Math.max(0.8, (1.1 + tier * 0.35) * scale * input.weight), whiteHot(hue, 0.85), clamp01(fade));
    g.lineBetween(x - ux * size * 0.15, y - uy * size * 0.15, exitX + ux * size * 0.25, exitY + uy * size * 0.25);
  }
  // Cikista sert parlama: arka tarafta, giristen biraz sonra.
  if (elapsed >= 10 && elapsed < 70) {
    g.fillStyle(whiteHot(hue, 0.75), clamp01((1 - (elapsed - 10) / 60) * extra));
    fillDisc(g, exitX, exitY, (2 + tier * 0.8) * scale);
  }
  // Kor deligi: giris noktasinda sicak, yavas sonen nokta.
  if (elapsed > 40) {
    const ember = 1 - (elapsed - 40) / 280;
    if (ember > 0) {
      g.fillStyle(whiteHot(MOLTEN, 0.35), clamp01(ember * 0.85));
      fillDisc(g, x + ux * size * 0.05, y + uy * size * 0.05, (0.9 + tier * 0.35) * scale);
    }
  }
  if (gates.still || !gates.sparks) return;
  // Arkadan fiskiran demet: dar yelpaze, uzun cizgi, mermi yonunde.
  SPARKS.seed = input.seed + 41;
  SPARKS.count = 4 + tier * 2;
  SPARKS.speed = (230 + tier * 45) * scale;
  SPARKS.heading = angle;
  SPARKS.fan = 0.55;
  SPARKS.gravity = 240 * scale;
  SPARKS.lifeMs = 200 + tier * 40;
  SPARKS.hue = hue;
  SPARKS.width = Math.max(0.7, (0.85 + tier * 0.2) * scale);
  SPARKS.alpha = 0.95 * extra;
  SPARKS.streak = 0.045;
  drawBallisticSparks(g, exitX, exitY, elapsed - 8, SPARKS);
  // Govdeden kopan kucuk parcalar.
  DEBRIS.seed = input.seed + 43;
  DEBRIS.count = 1 + tier;
  DEBRIS.speed = (120 + tier * 20) * scale;
  DEBRIS.heading = angle;
  DEBRIS.fan = 0.9;
  DEBRIS.gravity = 420 * scale;
  DEBRIS.lifeMs = 300;
  DEBRIS.color = STEEL;
  DEBRIS.edge = STEEL_EDGE;
  DEBRIS.size = 1.3 * scale * input.weight;
  DEBRIS.alpha = 0.9 * extra;
  DEBRIS.floor = size * 0.4;
  drawDebris(g, exitX, exitY, elapsed - 8, DEBRIS, ground);
}

/** Carpma: govdeyi saran sok halkasi, catlak yildizi, yerde toz. */
function drawCrush(g: VfxGraphics, input: HitSignatureInput, elapsed: number, scale: number, gates: HitSignatureGates) {
  const { x, y, size, tier, hue, extra, seed } = input;
  const radius = size * 0.5;
  // Sok halkasi: govdenin kenarindan disari, hizla sonen kalin cizgi.
  const ringT = clamp01(elapsed / 230);
  if (ringT < 1) {
    const r = radius * (gates.still ? 1.1 : 0.8 + easeOut(ringT) * 0.75);
    g.lineStyle(Math.max(0.8, (2.6 + tier * 0.7) * scale * (1 - ringT * 0.7)), whiteHot(hue, 0.3), clamp01(0.9 * (1 - ringT)));
    strokeRing(g, x, y, r);
  }
  // Ikinci, ice yakin halka: darbenin govdeye gecisi (gecikmeli, koyu ton).
  const innerT = clamp01((elapsed - 35) / 200);
  if (innerT > 0 && innerT < 1) {
    g.lineStyle(Math.max(0.6, (1.4 + tier * 0.4) * scale), hue, clamp01(0.7 * (1 - innerT) * extra));
    strokeRing(g, x, y, radius * (gates.still ? 0.8 : 0.55 + easeOut(innerT) * 0.5));
  }
  // Catlak yildizi: merkezden disari kalin, kisa cizgiler (1-3 kare buyuyor, sonra soner).
  if (elapsed < 170) {
    const grow = gates.still ? 1 : clamp01(elapsed / 45);
    const fade = 1 - clamp01((elapsed - 45) / 125);
    const arms = 5 + tier * 2;
    g.lineStyle(Math.max(0.8, (1.5 + tier * 0.35) * scale * input.weight), whiteHot(hue, 0.7), clamp01(fade));
    for (let index = 0; index < arms; index += 1) {
      const a = (index / arms) * Math.PI * 2 + (hashNoise(seed + index * 5) - 0.5) * 0.6;
      const length = radius * (0.45 + hashNoise(seed + index * 7) * 0.5) * grow;
      const inner = radius * 0.12;
      g.lineBetween(x + Math.cos(a) * inner, y + Math.sin(a) * inner, x + Math.cos(a) * (inner + length), y + Math.sin(a) * (inner + length));
    }
  }
  if (!gates.smoke) return;
  // Yerde toz halkasi: govdenin ayagindan yayilan yatik halka.
  const dustT = clamp01(elapsed / 340);
  if (dustT < 1) {
    const spread = gates.still ? 1 : 0.7 + easeOut(dustT) * 0.8;
    g.lineStyle(Math.max(0.8, 2.2 * scale), SMOKE, clamp01(0.4 * (1 - dustT) * extra));
    g.strokeEllipse(x, y + radius * 0.55, size * 1.1 * spread, size * 0.32 * spread, 18);
  }
}

/** Odak: erimis nokta (isiyla buyuyor), asagi damlayan erimis parca, duman. */
function drawMelt(g: VfxGraphics, input: HitSignatureInput, elapsed: number, scale: number, gates: HitSignatureGates) {
  const { x, y, tier, hue, extra, beamHeat } = input;
  const heat = clamp01(beamHeat);
  // Erimis nokta: isin uzerinde kaldikca buyuyen sicak leke.
  const pool = 1 - clamp01(elapsed / 260);
  if (pool > 0) {
    g.fillStyle(darken(MOLTEN, 0.35), clamp01((0.35 + heat * 0.4) * pool * extra));
    fillDisc(g, x, y, (2.2 + tier * 0.6 + heat * 3.2) * scale);
    g.fillStyle(whiteHot(MOLTEN, 0.55), clamp01((0.45 + heat * 0.45) * pool));
    fillDisc(g, x, y, (1 + tier * 0.3 + heat * 1.4) * scale);
  }
  if (gates.still) return;
  if (gates.sparks) {
    // Damlayan erimis parca: asagi, agir; isi arttikca coğaliyor.
    SPARKS.seed = input.seed + 61;
    SPARKS.count = 1 + tier + Math.round(heat * 3);
    SPARKS.speed = (40 + heat * 40) * scale;
    SPARKS.heading = Math.PI / 2;
    SPARKS.fan = 1.4;
    SPARKS.gravity = 520 * scale;
    SPARKS.lifeMs = 360;
    SPARKS.hue = MOLTEN;
    SPARKS.width = Math.max(0.8, (1.1 + heat * 0.5) * scale);
    SPARKS.alpha = 0.95 * extra;
    SPARKS.streak = 0.025;
    drawBallisticSparks(g, x, y, elapsed, SPARKS);
  }
  if (gates.smoke) {
    // Yukselen ince duman: eriyen yuzeyden.
    SMOKE_PUFF.seed = input.seed + 67;
    SMOKE_PUFF.count = 1 + (heat > 0.5 ? 1 : 0);
    SMOKE_PUFF.radius = (2.2 + heat * 1.6) * scale;
    SMOKE_PUFF.grow = 1.4;
    SMOKE_PUFF.rise = (14 + heat * 10) * scale;
    SMOKE_PUFF.lifeMs = 420;
    SMOKE_PUFF.color = darken(hue, 0.78);
    SMOKE_PUFF.alpha = 0.22 + heat * 0.14;
    SMOKE_PUFF.still = false;
    drawSmoke(g, x, y - 2 * scale, elapsed, SMOKE_PUFF);
  }
}

/** Aura: govde boyunda kapanan altigen kafes, kosede kenetlenme, kenarda statik. */
function drawLock(g: VfxGraphics, input: HitSignatureInput, elapsed: number, scale: number, gates: HitSignatureGates) {
  const { x, y, size, tier, hue, extra, seed } = input;
  const radius = size * 0.5;
  const close = gates.still ? 1 : easeOut(clamp01(elapsed / 90));
  const fade = 1 - clamp01((elapsed - 120) / 140);
  const r = radius * (1.35 - close * 0.4);
  const rotation = hashNoise(seed) * Math.PI;
  g.lineStyle(Math.max(0.8, (1.2 + tier * 0.35) * scale), hue, clamp01(0.9 * fade));
  strokeHex(g, x, y, r, rotation);
  // Kenetlenme: kafes kapandigi anda kose basina ice bakan kisa cizgi.
  if (elapsed >= 70 && elapsed < 200) {
    const clamp = 1 - (elapsed - 70) / 130;
    g.lineStyle(Math.max(0.8, (1.4 + tier * 0.3) * scale), whiteHot(hue, 0.6), clamp01(clamp));
    for (let corner = 0; corner < 6; corner += 1) {
      const a = rotation + (corner / 6) * Math.PI * 2;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      g.lineBetween(x + cx * r, y + cy * r, x + cx * r * 0.78, y + cy * r * 0.78);
    }
  }
  // Statik: govdenin kenarinda kisa catirti (45 ms'de bir yeniden tohumlaniyor).
  if (!gates.still && gates.sparks && elapsed < 200) {
    CRACKLE.seed = seed + Math.floor(elapsed / 45) * 13;
    CRACKLE.count = 2 + tier;
    CRACKLE.reach = radius * 0.7;
    CRACKLE.hue = hue;
    CRACKLE.width = Math.max(0.6, 0.8 * scale);
    CRACKLE.alpha = clamp01(0.7 * (1 - elapsed / 200) * extra);
    CRACKLE.heading = undefined;
    CRACKLE.fan = 0;
    drawCrackle(g, x, y, CRACKLE);
  }
}

/** Dalga: govdenin onunde ilerleyen basinc yayi, arkada toz. */
function drawSweep(g: VfxGraphics, input: HitSignatureInput, elapsed: number, scale: number, gates: HitSignatureGates) {
  const { x, y, angle, size, tier, hue, extra } = input;
  const radius = size * 0.5;
  const t = clamp01(elapsed / 240);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const travel = gates.still ? 0 : (-0.4 + easeOut(t) * 1.1) * radius;
  const cx = x + ux * travel - ux * radius * 0.6;
  const cy = y + uy * travel - uy * radius * 0.6;
  const span = 1.0;
  g.lineStyle(Math.max(0.8, (2.2 + tier * 0.6) * scale * (1 - t * 0.6)), whiteHot(hue, 0.35), clamp01(0.85 * (1 - t)));
  g.beginPath();
  g.arc(cx, cy, radius * 1.15, angle - span, angle + span, false);
  g.strokePath();
  g.lineStyle(Math.max(0.6, (1 + tier * 0.3) * scale), hue, clamp01(0.6 * (1 - t) * extra));
  g.beginPath();
  g.arc(cx - ux * radius * 0.25, cy - uy * radius * 0.25, radius * 1.0, angle - span * 0.8, angle + span * 0.8, false);
  g.strokePath();
  if (gates.still || !gates.smoke) return;
  SMOKE_PUFF.seed = input.seed + 71;
  SMOKE_PUFF.count = 2;
  SMOKE_PUFF.radius = radius * 0.35;
  SMOKE_PUFF.grow = 1.2;
  SMOKE_PUFF.rise = 6 * scale;
  SMOKE_PUFF.lifeMs = 280;
  SMOKE_PUFF.color = SMOKE;
  SMOKE_PUFF.alpha = 0.28 * extra;
  SMOKE_PUFF.still = false;
  drawSmoke(g, x - ux * radius * 0.7, y - uy * radius * 0.7 + radius * 0.4, elapsed, SMOKE_PUFF);
}

/** Lanet: ice cekilen koyu zerreler ve koyu cekirdek. */
function drawDecay(g: VfxGraphics, input: HitSignatureInput, elapsed: number, scale: number, gates: HitSignatureGates) {
  const { x, y, size, tier, hue, seed } = input;
  const radius = size * 0.5;
  const t = clamp01(elapsed / 280);
  const motes = 5 + tier * 2;
  for (let index = 0; index < motes; index += 1) {
    const local = clamp01(t * 1.2 - hashNoise(seed + index * 3) * 0.2);
    if (local >= 1) continue;
    const a = (index / motes) * Math.PI * 2 + hashNoise(seed + index) * 0.8 + (gates.still ? 0 : local * 1.4);
    const r = radius * 1.3 * (gates.still ? 0.6 : 1 - easeOut(local));
    g.fillStyle(local < 0.5 ? darken(hue, 0.2) : darken(hue, 0.6), clamp01(0.85 * (1 - local)));
    fillDisc(g, x + Math.cos(a) * r, y + Math.sin(a) * r, (1 + tier * 0.25) * scale);
  }
  g.fillStyle(0x05030a, clamp01(0.75 * (1 - t)));
  fillDisc(g, x, y, radius * 0.22 * (gates.still ? 1 : 0.6 + t * 0.6));
}

/** Kesme: govdeyi boydan kesen sert cizgi; uclardan kivilcim. */
function drawCleave(g: VfxGraphics, input: HitSignatureInput, elapsed: number, scale: number, gates: HitSignatureGates) {
  const { x, y, angle, size, tier, hue, extra } = input;
  const a = angle + 0.7;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const half = size * 0.7;
  const sweep = gates.still ? 1 : clamp01(elapsed / 45);
  const life = 1 - clamp01((elapsed - 45) / 160);
  const sx = x - ux * half;
  const sy = y - uy * half;
  const ex = sx + ux * half * 2 * sweep;
  const ey = sy + uy * half * 2 * sweep;
  g.lineStyle(Math.max(0.8, (2.4 + tier * 0.5) * scale), hue, clamp01(0.8 * life));
  g.lineBetween(sx, sy, ex, ey);
  g.lineStyle(Math.max(0.6, (0.9 + tier * 0.2) * scale), whiteHot(hue, 0.85), clamp01(life));
  g.lineBetween(sx, sy, ex, ey);
  if (gates.still || !gates.sparks) return;
  SPARKS.seed = input.seed + 83;
  SPARKS.count = 2 + tier;
  SPARKS.speed = (160 + tier * 30) * scale;
  SPARKS.heading = a;
  SPARKS.fan = 0.8;
  SPARKS.gravity = 360 * scale;
  SPARKS.lifeMs = 200;
  SPARKS.hue = hue;
  SPARKS.width = Math.max(0.7, 0.9 * scale);
  SPARKS.alpha = 0.9 * extra;
  SPARKS.streak = 0.035;
  drawBallisticSparks(g, ex, ey, elapsed - 30, SPARKS);
}

/** Bulasma: govdeden disari kirikli koyu damarlar ve kabarciklar. */
function drawSpread(g: VfxGraphics, input: HitSignatureInput, elapsed: number, scale: number, gates: HitSignatureGates) {
  const { x, y, size, tier, hue, extra, seed } = input;
  const radius = size * 0.5;
  const t = clamp01(elapsed / 300);
  CRACKLE.seed = seed + 97;
  CRACKLE.count = 3 + tier;
  CRACKLE.reach = radius * (gates.still ? 1 : 0.5 + easeOut(t) * 0.8);
  CRACKLE.hue = darken(hue, 0.35);
  CRACKLE.width = Math.max(0.7, 1.1 * scale);
  CRACKLE.alpha = clamp01(0.8 * (1 - t) * extra);
  CRACKLE.heading = undefined;
  CRACKLE.fan = 0;
  drawCrackle(g, x, y, CRACKLE);
  if (gates.still) return;
  for (let index = 0; index < 2 + tier; index += 1) {
    const local = clamp01(t * 1.3 - hashNoise(seed + index * 11) * 0.3);
    if (local <= 0 || local >= 1) continue;
    const a = hashNoise(seed + index * 13) * Math.PI * 2;
    const r = radius * (0.3 + hashNoise(seed + index * 17) * 0.5);
    g.lineStyle(Math.max(0.6, 0.8 * scale), hue, clamp01(0.7 * (1 - local)));
    strokeRing(g, x + Math.cos(a) * r, y + Math.sin(a) * r - local * 6 * scale, (1 + local * 2) * scale);
  }
}
