/**
 * Saldirilarin profil gudumlu cizimi: mermi govdesi ve izi, namlu, carpma.
 *
 * Her saldiran kule ayni uc perdeyi profilinden okuyor (vfx-profiles.ts):
 * duz -> acilmis -> canli. Burada kuleye ozel tek bir dal yok; kule
 * farklari profilin siluetinden, carpma dilinden ve rampasindan geliyor.
 *
 * Mimari combat-vfx'in sinirli olay tamponu: olaylar sabit bir havuzda,
 * her karede yaslarina gore saf fonksiyonlarla yeniden ciziliyor. Parcacik
 * nesnesi, tween ya da `Math.random` yok; tohumlar olay kimliginin FNV
 * ozetinden. Takimdaki herkes ayni seyi goruyor.
 *
 * Katmanlar:
 * - `body`: mermi govdeleri ve izleri (mermi dokularinin hemen altinda).
 * - `glow`: ADD karisimli omuzlar ve haleler.
 * - `events`: namlu ve carpma; kule govdesinin USTUNDE (namlu eskiden
 *   kulenin altinda kaliyordu).
 * - `flashes`: pisirilmis dokulu ADD parlamalari (havuzlu).
 */
import type { ProjectileSnapshot } from "@karayel/shared";
import { drawCombatProjectile } from "./combat-vfx";
import {
  clamp01,
  darken,
  drawHotDot,
  drawMotes,
  drawMuzzleBurst,
  drawPointCorona,
  drawPointSparks,
  drawTaperedRibbon,
  fillDisc,
  strokeRing,
  fnvHash,
  hashNoise,
  liftToWhite,
  strokePointProfile,
  strokeProfile,
  strokeRingProfile,
  toTier,
  TrailBuffer,
  type VfxGraphics,
  type VfxTier
} from "./kit";
import type { FlashSink, GlowStampSink } from "./flash-pool";
import { VfxLod } from "./lod";
import { getVfxProfile, getVfxTier, type VfxImpactStyle, type VfxProfile, type VfxTierRecipe } from "./vfx-profiles";

/** Takim arkadasinin kademe 3 eklentileri bu alfada; kendi kulen tam. */
export const TEAMMATE_EXTRA_ALPHA = 0.7;
/** Canli olay ust siniri; dolunca en eski olay yerini veriyor. */
export const MAX_ATTACK_EVENTS = 192;
/** Ikinci vurusun gecikmesi: sahne saatinde, oynatma gecikmesinden bagimsiz. */
export const SECOND_BEAT_DELAY_MS = 80;
/** Namlu cakmasinin omru. */
export const MUZZLE_MS = 140;

type AttackEventKind = "muzzle" | "anticipation" | "impact";

type AttackEvent = {
  kind: AttackEventKind;
  live: boolean;
  x: number;
  y: number;
  angle: number;
  profile: VfxProfile;
  recipe: VfxTierRecipe;
  tier: VfxTier;
  bornAt: number;
  durationMs: number;
  seed: number;
  own: boolean;
  /** Alan hasarinin gercek yaricapi; yoksa 0. */
  radius: number;
};

export type AttackEventInput = {
  x: number;
  y: number;
  angle: number;
  definitionId: string;
  tier?: number;
  own?: boolean;
  bornAt: number;
  /** Tohum kaynagi: olayin kimligi (mermi kimligi). */
  key?: string;
  radius?: number;
  /** Bilinmeyen kimlikte profilin rengi. */
  fallbackColor?: number;
};

export type AttackVfxOptions = {
  lod: VfxLod;
  /** Hareket azaltma: donme, sacilma ve titreme yok; sekil yerinde soner. */
  reducedMotion?: () => boolean;
  /** Agir tek vurus (yalnizca yerel, kademe 3): yonetilen mikro sarsinti. */
  onHeavyImpact?: (x: number, y: number) => void;
  /**
   * Omuz ve haleler icin tek dortgenlik ADD damgalar. Verilmezse ayni sey
   * `glow` Graphics'ine ic ice dairelerle ciziliyor (testler ve yedek).
   */
  stamps?: GlowStampSink;
};

/** Cagrilari yutan yuzey: omuzlar damgaya gittiginde dairelerin cizilmemesi icin. */
const SWALLOW: VfxGraphics = {
  lineStyle() {}, lineBetween() {}, fillStyle() {}, fillCircle() {}, strokeCircle() {}, fillTriangle() {},
  fillRect() {}, strokeRect() {}, fillEllipse() {}, strokeEllipse() {}, beginPath() {}, moveTo() {}, lineTo() {},
  closePath() {}, strokePath() {}, fillPath() {}, arc() {}, fillPoints() {}, strokePoints() {}
};

/**
 * Halkanin hafif kesiti: tek ince ve parlak govde. Halkanin yumusak omzu
 * ADD parlama havuzunun halka dokusu (tek dortgen); burada 6 daire yerine 1.
 */
function softRing(g: VfxGraphics, x: number, y: number, radius: number, color: number, width: number, alpha: number) {
  if (radius <= 0.5 || alpha <= 0) return;
  g.lineStyle(Math.max(0.6, width * 1.2), liftToWhite(color, 0.35), clamp01(0.92 * alpha));
  strokeRing(g, x, y, radius);
}

const NO_FLASHES: FlashSink = { flash() {} };

/**
 * Tek karelik beyaz igne ucunun genel siniri: saniyede en fazla 3 (isiga
 * duyarlilik siniri; dusmanin vurus flasiyla ayni kural). Kalabalik dalgada
 * yirmi kademe-3 kule ayni saniyede vurunca ekran yanip sonmesin.
 */
export const PINPOINT_GAP_MS = 334;

/**
 * Karede cagrilan cizim secenekleri: bir kez kuruluyor, yerinde yaziliyor.
 * Mermi ve olay basina nesne literali her karede cop uretiyordu.
 */
const RIBBON_CORE = { color: 0, ratio: 0.38, alpha: 0.9 };
const RIBBON = { color: 0, width: 0, alpha: 0, maxPoints: 2, core: undefined as typeof RIBBON_CORE | undefined };
const POINT_PROFILE = { radius: 0, spread: 0 };
const LINE_PROFILE = { body: 0, spread: 0 };
const RING_PROFILE = { width: 0, spread: 0 };
const CORONA = { radius: 0, layers: 4, step: 0, color: 0, alpha: 0, period: 160, phase: 0 };
const MOTES = { seed: 0, count: 3, radius: 0, color: 0, size: 0, alpha: 0, lifeMs: 420 };
const MUZZLE = { spikes: 3, reachBase: 0, reachPulse: 0, width: 0, color: 0, coreColor: 0xffffff, coreBase: 0, corePulse: 0, spin: 520, pulse: 70, cheapDiscs: true };
const SPARKS: { seed: number; count: number; reach: number; color: number; width: number; alpha: number; heading?: number; fan: number; gravity: number; tail: number } = {
  seed: 0, count: 0, reach: 0, color: 0, width: 0, alpha: 0, heading: undefined, fan: 1.6, gravity: 0, tail: 0
};
const SIGNS = [-1, 1] as const;

export class AttackVfx {
  private readonly trails = new TrailBuffer(8, 320);
  private readonly events: AttackEvent[] = [];
  private cursor = 0;
  /** Bu karede cizilen imza carpmasi; LOD 2-3'te sinirli. */
  private signaturesThisFrame = 0;
  /** Son beyaz igne ucu (olay saati); genel 3/sn siniri icin. */
  private lastPinpointAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly body: VfxGraphics & { clear(): unknown },
    private readonly glow: VfxGraphics & { clear(): unknown },
    private readonly eventsLayer: VfxGraphics & { clear(): unknown },
    private readonly flashes: FlashSink = NO_FLASHES,
    private readonly options: AttackVfxOptions = { lod: new VfxLod() }
  ) {}

  get lod() {
    return this.options.lod;
  }

  private get still() {
    return this.options.reducedMotion?.() ?? false;
  }

  /* ---------------------------------------------------------------- */
  /* Mermiler                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Karedeki mermiler: iz, govde ve kademe eklentileri.
   *
   * `isOwn` mermiyi atan kulenin yerel oyuncuya ait olup olmadigini soyluyor;
   * takim arkadasinin kademe 3 eklentileri soluk. Govde katmanlari (body ve
   * glow) her karede bastan; cagiran `clear` etmiyor.
   */
  renderProjectiles(projectiles: readonly ProjectileSnapshot[], now: number, scale: number, isOwn?: (projectile: ProjectileSnapshot) => boolean) {
    this.body.clear();
    this.glow.clear();
    const stamps = this.options.stamps;
    stamps?.beginFrame();
    const shoulders = stamps ? SWALLOW : this.glow;
    const lod = this.options.lod;
    const still = this.still;
    for (const projectile of projectiles) {
      if (projectile.source !== "tower") continue;
      const profile = getVfxProfile(projectile.definitionId);
      if (profile.silhouette === "none") continue;
      const tier = toTier(projectile.tier);
      const recipe = getVfxTier(profile, tier);
      const own = isOwn ? isOwn(projectile) : true;
      const extra = own ? 1 : TEAMMATE_EXTRA_ALPHA;
      const vx = projectile.vx ?? 0;
      const vy = projectile.vy ?? 0;
      const moving = Math.abs(vx) + Math.abs(vy) > 0.01;
      const angle = moving ? Math.atan2(vy, vx) : 0;

      // Iz: en son dusen ayrinti, ama tamamen degil (en az iki nokta).
      const entry = this.trails.record(projectile.id, projectile.x, projectile.y);
      if (entry && moving) {
        RIBBON.color = recipe.color;
        RIBBON.width = recipe.trail.width * scale;
        RIBBON.alpha = tier === 1 ? 0.5 : 0.62;
        RIBBON.maxPoints = Math.max(2, Math.round(recipe.trail.points * lod.trailScale));
        RIBBON_CORE.color = recipe.core;
        RIBBON.core = recipe.trail.hotCore ? RIBBON_CORE : undefined;
        drawTaperedRibbon(this.body, entry, this.trails.bufferCapacity, projectile.x, projectile.y, RIBBON);
      }

      const radius = (recipe.silhouette / 2) * scale;
      if (profile.silhouette === "combat") {
        // combat-vfx'in hareketli govdesi: kelime ayni, olcek 1.4 kat, renk profilden.
        drawCombatProjectile(this.body, projectile, now, scale * 1.4, recipe.color);
        if (recipe.shoulders > 0) {
          POINT_PROFILE.radius = radius * 0.4;
          POINT_PROFILE.spread = radius * 0.7;
          strokePointProfile(shoulders, projectile.x, projectile.y, recipe.color, tier, POINT_PROFILE, shoulders, 0.7);
          stamps?.stamp(projectile.x, projectile.y, recipe.color, radius * (tier >= 3 ? 4.2 : 3.2), tier >= 3 ? 0.7 : 0.55);
        }
      } else if (profile.silhouette === "sprite") {
        // Govde kulenin cizilmis dokusu; burada yalnizca arkasindaki parlama.
        if (recipe.shoulders > 0) {
          POINT_PROFILE.radius = radius * 0.42;
          POINT_PROFILE.spread = radius * 0.75;
          strokePointProfile(shoulders, projectile.x, projectile.y, recipe.color, tier, POINT_PROFILE, shoulders, 0.65);
          stamps?.stamp(projectile.x, projectile.y, recipe.color, radius * (tier >= 3 ? 4.4 : 3.4), tier >= 3 ? 0.7 : 0.55);
        } else if (stamps) {
          stamps.stamp(projectile.x, projectile.y, recipe.color, radius * 2.2, 0.3);
        } else {
          this.glow.fillStyle(recipe.color, 0.22);
          fillDisc(this.glow, projectile.x, projectile.y, radius * 0.9);
        }
      } else {
        this.drawSilhouette(profile, recipe, tier, projectile.x, projectile.y, angle, radius, shoulders);
        if (stamps && recipe.shoulders > 0) {
          stamps.stamp(projectile.x, projectile.y, recipe.color, radius * (tier >= 3 ? 4 : 3), tier >= 3 ? 0.7 : 0.55);
        }
      }

      if (tier >= 3) {
        if (lod.corona && !still && stamps) {
          // Nefes alan hale: tek damga, boyu ve alfasi nefesle.
          const breath = 0.5 + Math.sin(now / 160 + hashNoise(fnvHash(projectile.id) % 997) * 6) * 0.5;
          stamps.stamp(projectile.x, projectile.y, recipe.color, radius * (5 + breath * 1.4), (0.22 + breath * 0.12) * extra);
        } else if (lod.corona && !still) {
          CORONA.radius = radius * 0.8;
          CORONA.step = radius * 0.3;
          CORONA.color = recipe.color;
          CORONA.alpha = 0.05 * extra;
          CORONA.phase = hashNoise(fnvHash(projectile.id) % 997);
          drawPointCorona(this.glow, projectile.x, projectile.y, now, CORONA);
        }
        if (lod.sparks && !still && recipe.alive.motes) {
          MOTES.seed = fnvHash(projectile.id) % 9973;
          MOTES.radius = radius * 1.6;
          MOTES.color = recipe.color;
          MOTES.size = Math.max(0.7, 0.9 * scale);
          MOTES.alpha = 0.8 * extra;
          drawMotes(this.glow, projectile.x, projectile.y, now, MOTES);
        }
      }
    }
    this.trails.endFrame();
    stamps?.endFrame();
  }

  /**
   * Profilin silueti: kulenin tonunda, 12-16 birim, kesit kademeyle.
   *
   * Ok kisa bir lazer kesiti ve ucgen bir uc: kademe 2'de omuzlar ADD
   * katmanina, cekirdek ve file govdeye; kademe 3'te omuzlar genisliyor.
   */
  private drawSilhouette(profile: VfxProfile, recipe: VfxTierRecipe, tier: VfxTier, x: number, y: number, angle: number, radius: number, shoulders: VfxGraphics) {
    const g = this.body;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const nx = -uy;
    const ny = ux;
    const color = recipe.color;
    switch (profile.silhouette) {
      case "dart": {
        const tailX = x - ux * radius * 1.1;
        const tailY = y - uy * radius * 1.1;
        LINE_PROFILE.body = radius * 0.42;
        LINE_PROFILE.spread = radius * 0.6;
        strokeProfile(g, tailX, tailY, x + ux * radius * 0.2, y + uy * radius * 0.2, color, tier, LINE_PROFILE, this.glow);
        const tip = radius * 0.95;
        const half = radius * 0.42;
        g.fillStyle(tier >= 2 ? recipe.core : color, 0.96);
        g.fillTriangle(x + ux * tip, y + uy * tip, x - ux * radius * 0.25 + nx * half, y - uy * radius * 0.25 + ny * half, x - ux * radius * 0.25 - nx * half, y - uy * radius * 0.25 - ny * half);
        return;
      }
      case "ball": {
        g.fillStyle(darken(color, 0.55), 0.92);
        fillDisc(g, x, y, radius * 0.86);
        POINT_PROFILE.radius = radius * 0.62;
        POINT_PROFILE.spread = radius * 0.55;
        strokePointProfile(g, x, y, color, tier, POINT_PROFILE, shoulders);
        return;
      }
      case "ring": {
        RING_PROFILE.width = Math.max(1, radius * 0.3);
        RING_PROFILE.spread = radius * 0.45;
        strokeRingProfile(g, x, y, radius * 0.62, color, tier, RING_PROFILE, shoulders);
        drawHotDot(g, x, y, recipe.core, Math.max(0.8, radius * 0.18), 0.9);
        return;
      }
      case "orb":
      default: {
        POINT_PROFILE.radius = radius * 0.6;
        POINT_PROFILE.spread = radius * 0.6;
        strokePointProfile(g, x, y, color, tier, POINT_PROFILE, shoulders);
        g.lineStyle(Math.max(0.7, radius * 0.14), liftToWhite(color, 0.35), 0.75);
        strokeRing(g, x, y, radius * 0.85);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Olaylar                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Namlu cakmasi; kademe 2+ icin `anticipationMs` once hazirlik vurusu da.
   *
   * Hazirlik vurusu sahte bir gecikme degil: sunucunun atis mesaji
   * oynatmadan ~500 ms once geliyor, yani cagiran cakmayi oynatmadan once
   * hazirligi zaten gosterebiliyor (`emitAnticipation`).
   */
  emitMuzzle(input: AttackEventInput) {
    const event = this.push("muzzle", input);
    if (!event) return;
    const recipe = event.recipe;
    const lifted = liftToWhite(recipe.color, 0.55);
    this.flashes.flash({
      x: input.x,
      y: input.y,
      texture: "glow",
      tint: lifted,
      alpha: (event.tier >= 2 ? 0.95 : 0.8) * (event.own ? 1 : 0.8),
      sizeFrom: 10 + event.tier * 3,
      // Hareket azaltmada parlama boy degistirmeden soner.
      sizeTo: this.still ? 10 + event.tier * 3 : 4,
      durationMs: 110,
      bornAt: input.bornAt
    });
  }

  /** Kademe 2+ namlusunun hazirlik vurusu; kademe 1'de hicbir sey yapmiyor. */
  emitAnticipation(input: AttackEventInput) {
    const profile = getVfxProfile(input.definitionId, input.fallbackColor);
    const recipe = getVfxTier(profile, input.tier);
    if (recipe.muzzle.anticipationMs <= 0) return;
    this.push("anticipation", input, recipe.muzzle.anticipationMs);
  }

  /** Carpma: kademe 1 tek darbe, 2 ikinci vurus, 3 imza ve igne ucu. */
  emitImpact(input: AttackEventInput) {
    const event = this.push("impact", input);
    if (!event) return;
    const recipe = event.recipe;
    const extra = event.own ? 1 : TEAMMATE_EXTRA_ALPHA;
    const still = this.still;
    this.flashes.flash({
      x: input.x,
      y: input.y,
      texture: "glow",
      tint: recipe.color,
      alpha: 0.75,
      sizeFrom: 14 + event.tier * 4,
      sizeTo: still ? 14 + event.tier * 4 : 22 + event.tier * 6,
      durationMs: 150 + event.tier * 30,
      bornAt: input.bornAt
    });
    if (recipe.impact.secondBeat && !still) {
      // Ikinci vurusun parlamasi: gecikmeli, tek dortgenlik bir ADD halka.
      // Hareket azaltmada yok: genisleyen halkanin kendisi hareket.
      const outer = event.radius > 0 ? event.radius : 13 * recipe.impact.scale * 0.6;
      this.flashes.flash({
        x: input.x,
        y: input.y,
        texture: "ring",
        tint: recipe.color,
        alpha: 0.7,
        sizeFrom: outer * 0.8,
        sizeTo: outer * 2.1,
        durationMs: event.durationMs - SECOND_BEAT_DELAY_MS,
        bornAt: input.bornAt + SECOND_BEAT_DELAY_MS
      });
    }
    if (recipe.impact.pinpoint && !still && input.bornAt - this.lastPinpointAt >= PINPOINT_GAP_MS) {
      // Tek karelik igne ucu: beyaz cekirdek ve dik bir kivilcim cizgisi.
      // Genel olarak saniyede en fazla 3; hareket azaltmada hic.
      this.lastPinpointAt = input.bornAt;
      this.flashes.flash({ x: input.x, y: input.y, texture: "glow", tint: 0xffffff, alpha: extra, sizeFrom: 9, sizeTo: 9, durationMs: 34, bornAt: input.bornAt });
      this.flashes.flash({
        x: input.x,
        y: input.y,
        texture: "spark",
        tint: liftToWhite(recipe.color, 0.7),
        alpha: extra,
        sizeFrom: 30,
        sizeTo: 34,
        stretch: 6,
        rotation: input.angle + Math.PI / 2,
        durationMs: 50,
        bornAt: input.bornAt
      });
    }
    if (recipe.shake && event.own && event.profile.heavy) {
      this.options.onHeavyImpact?.(input.x, input.y);
    }
  }

  get liveEvents() {
    let count = 0;
    for (const event of this.events) if (event.live) count += 1;
    return count;
  }

  get trailCount() {
    return this.trails.size;
  }

  clear() {
    for (const event of this.events) event.live = false;
    this.trails.clear();
  }

  /** Olaylari yaslarina gore ciz; biten olay havuza doner. */
  render(now: number, scale: number) {
    const g = this.eventsLayer;
    g.clear();
    const still = this.still;
    this.signaturesThisFrame = 0;
    for (const event of this.events) {
      if (!event.live) continue;
      const elapsed = now - event.bornAt;
      if (elapsed < 0) continue;
      if (elapsed >= event.durationMs) {
        event.live = false;
        continue;
      }
      const age = elapsed / event.durationMs;
      if (event.kind === "anticipation") this.drawAnticipation(g, event, age, scale, still);
      else if (event.kind === "muzzle") this.drawMuzzle(g, event, age, now, scale, still);
      else this.drawImpact(g, event, age, elapsed, now, scale, still);
    }
  }

  private push(kind: AttackEventKind, input: AttackEventInput, durationOverride?: number) {
    const profile = getVfxProfile(input.definitionId, input.fallbackColor);
    const recipe = getVfxTier(profile, input.tier);
    let event: AttackEvent | undefined;
    for (const candidate of this.events) {
      if (!candidate.live) {
        event = candidate;
        break;
      }
    }
    if (!event) {
      if (this.events.length < MAX_ATTACK_EVENTS) {
        event = {} as AttackEvent;
        this.events.push(event);
      } else {
        event = this.events[this.cursor % this.events.length];
        this.cursor += 1;
      }
    }
    event.kind = kind;
    event.live = true;
    event.x = input.x;
    event.y = input.y;
    event.angle = input.angle;
    event.profile = profile;
    event.recipe = recipe;
    event.tier = recipe.tier;
    event.bornAt = input.bornAt;
    event.durationMs = durationOverride ?? (kind === "muzzle" ? MUZZLE_MS + recipe.tier * 20 : recipe.impact.durationMs);
    event.seed = input.key ? fnvHash(input.key) % 100003 : fnvHash(`${Math.round(input.x)}:${Math.round(input.y)}:${Math.round(input.bornAt)}`) % 100003;
    event.own = input.own ?? true;
    event.radius = input.radius ?? 0;
    return event;
  }

  private drawAnticipation(g: VfxGraphics, event: AttackEvent, age: number, scale: number, still: boolean) {
    // Namluya toplanan halka ve buyuyen cekirdek: "simdi atiyor".
    const color = event.recipe.color;
    const radius = (still ? 6 : 12 - age * 9) * scale;
    g.lineStyle(Math.max(0.8, 1.4 * scale), liftToWhite(color, 0.3), 0.35 + age * 0.55);
    strokeRing(g, event.x, event.y, radius);
    g.fillStyle(liftToWhite(color, 0.6), 0.25 + age * 0.6);
    fillDisc(g, event.x, event.y, (1.2 + age * 2.2) * scale);
  }

  private drawMuzzle(g: VfxGraphics, event: AttackEvent, age: number, now: number, scale: number, still: boolean) {
    const recipe = event.recipe;
    const fade = 1 - age;
    const ux = Math.cos(event.angle);
    const uy = Math.sin(event.angle);
    const lifted = liftToWhite(recipe.color, 0.55);
    // Namlunun en parlak noktasi: ileri dogru kisa bir alev dili.
    const reach = (9 + event.tier * 3) * scale * (still ? 1 : 1 - age * 0.6);
    LINE_PROFILE.body = (2.6 - age * 1.6) * scale;
    LINE_PROFILE.spread = 3 * scale;
    strokeProfile(g, event.x, event.y, event.x + ux * reach, event.y + uy * reach, recipe.color, event.tier, LINE_PROFILE, undefined, fade);
    g.fillStyle(lifted, 0.95 * fade);
    fillDisc(g, event.x, event.y, (2.2 + event.tier * 0.5) * scale * (1 - age * 0.4));
    if (recipe.muzzle.burst) {
      // Kademe 2'de donmeyen, 3'te donen diken patlamasi (lazerin namlusu).
      const clock = event.tier >= 3 && !still ? now : event.bornAt;
      MUZZLE.spikes = event.tier >= 3 ? 4 : 3;
      MUZZLE.reachBase = 6 * scale;
      MUZZLE.reachPulse = 3 * scale;
      MUZZLE.width = Math.max(0.8, 1.1 * scale);
      MUZZLE.color = lifted;
      MUZZLE.coreBase = 1.2 * scale;
      MUZZLE.corePulse = 0.8 * scale;
      drawMuzzleBurst(g, event.x, event.y, clock, MUZZLE, fade * (event.own || event.tier < 3 ? 1 : TEAMMATE_EXTRA_ALPHA));
    }
  }

  private drawImpact(g: VfxGraphics, event: AttackEvent, age: number, elapsed: number, now: number, scale: number, still: boolean) {
    const recipe = event.recipe;
    const lod = this.options.lod;
    const extra = event.own ? 1 : TEAMMATE_EXTRA_ALPHA;
    const s = scale * recipe.impact.scale;
    drawImpulse(g, event.profile.impact, event, age, s, still);

    // Ikinci vurus: ayni tonda, gecikmeli bir yanki halkasi (kademe 2+).
    if (recipe.impact.secondBeat && lod.secondBeatRing && elapsed >= SECOND_BEAT_DELAY_MS) {
      const beat = clamp01((elapsed - SECOND_BEAT_DELAY_MS) / (event.durationMs - SECOND_BEAT_DELAY_MS));
      const eased = still ? 1 : 1 - (1 - beat) * (1 - beat);
      const outer = event.radius > 0 ? event.radius : 13 * s * 0.6;
      softRing(g, event.x, event.y, outer * (0.35 + 0.65 * eased), recipe.color, Math.max(0.8, 1.2 * scale), (1 - beat) * 0.85);
    }

    if (recipe.impact.signature && this.signaturesThisFrame < lod.signatureCap) {
      this.signaturesThisFrame += 1;
      drawSignature(g, event, age, s, still, extra, now);
    }

    if (recipe.impact.sparks > 0 && lod.sparks && !still) {
      SPARKS.seed = event.seed;
      SPARKS.count = recipe.impact.sparks;
      SPARKS.reach = 20 * s * 0.6;
      SPARKS.color = recipe.color;
      SPARKS.width = Math.max(0.8, 1 * scale);
      SPARKS.alpha = 0.9 * (event.tier >= 3 ? extra : 1);
      SPARKS.heading = event.profile.impact === "fragments" || event.profile.impact === "shatter" ? event.angle : undefined;
      SPARKS.gravity = 6 * scale;
      SPARKS.tail = 3.5 * scale;
      drawPointSparks(g, event.x, event.y, age, SPARKS);
    }
  }
}

/* -------------------------------------------------------------------- */
/* Carpma dili (combat-vfx'in kelimeleri, olcekli ve renkli)              */
/* -------------------------------------------------------------------- */

function line(g: VfxGraphics, x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha: number) {
  if (alpha <= 0 || width <= 0) return;
  g.lineStyle(width, color, clamp01(alpha));
  g.lineBetween(x1, y1, x2, y2);
}

function bolt(g: VfxGraphics, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number, seed: number, width: number, jitter: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  for (let pass = 0; pass < 3; pass += 1) {
    const weight = pass === 0 ? 3.5 : pass === 1 ? 1.4 : 0.55;
    const opacity = pass === 0 ? 0.11 : pass === 1 ? 0.75 : 0.96;
    const tone = pass === 2 ? liftToWhite(color, 0.85) : color;
    g.lineStyle(width * weight, tone, clamp01(alpha * opacity));
    g.beginPath();
    g.moveTo(x1, y1);
    for (let i = 1; i <= 7; i += 1) {
      const t = i / 7;
      const offset = i === 7 ? 0 : (hashNoise(seed + i) - 0.5) * jitter;
      g.lineTo(x1 + dx * t - (dy / length) * offset, y1 + dy * t + (dx / length) * offset);
    }
    g.strokePath();
  }
}

/** Kademe 1'in tek darbesi; carpma diline gore. Her kademede ciziliyor. */
function drawImpulse(g: VfxGraphics, style: VfxImpactStyle, event: AttackEvent, age: number, s: number, still: boolean) {
  const { x, y, angle, tier, seed } = event;
  const color = event.recipe.color;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  const fade = 1 - age;
  const flash = Math.pow(1 - clamp01(age * 4), 2);
  const motion = still ? 0 : 1;

  switch (style) {
    case "collapse": {
      // Ice kapanan catlaklar, sonra kopma: hedef sikistiriliyormus gibi.
      const collapse = Math.pow(1 - clamp01(age / 0.55), 2);
      g.fillStyle(darken(color, 0.85), 0.55 * fade);
      g.fillEllipse(x, y, (12 + 8 * collapse) * s, (7 + 5 * collapse) * s);
      const arms = 4 + tier * 2;
      for (let i = 0; i < arms; i += 1) {
        const a = hashNoise(seed + i) * Math.PI * 2;
        const r = (5 + collapse * motion * (8 + tier * 3)) * s;
        const outer = r + (5 + hashNoise(seed + i + 30) * 7) * s;
        line(g, x + Math.cos(a) * outer, y + Math.sin(a) * outer, x + Math.cos(a + 0.25) * r, y + Math.sin(a + 0.25) * r, (0.8 + tier * 0.2) * s, color, fade);
        line(g, x + Math.cos(a + 0.25) * r, y + Math.sin(a + 0.25) * r, x + Math.cos(a) * 2 * s, y + Math.sin(a) * 2 * s, 0.7 * s, liftToWhite(color, 0.7), 0.7 * fade);
      }
      g.fillStyle(liftToWhite(color, 0.8), Math.max(flash, Math.max(0, 1 - Math.abs(age - 0.48) * 12)));
      fillDisc(g, x, y, (2 + tier) * s * 0.5);
      return;
    }
    case "bolt": {
      const arms = 3 + tier;
      const flicker = still ? 0 : Math.floor(age * 12);
      for (let i = 0; i < arms; i += 1) {
        const a = hashNoise(seed + i) * Math.PI * 2;
        const reach = (7 + hashNoise(seed + i + 50) * (9 + tier * 3)) * s;
        bolt(g, x, y, x + Math.cos(a) * reach, y + Math.sin(a) * reach, color, Math.pow(fade, 1.8), seed + i * 17 + flicker, (0.7 + tier * 0.15) * s, 7 * s);
      }
      g.fillStyle(liftToWhite(color, 0.85), flash);
      fillDisc(g, x, y, (4 + tier) * s * 0.5);
      return;
    }
    case "brackets": {
      // Takip imzasi: dort kose ayraci kilitleniyor, sonra eriyor.
      const r = (5 + (still ? 0 : Math.max(0, 1 - age * 5)) * 7) * s;
      const alpha = Math.min(1, age * 10) * fade;
      for (const sx of SIGNS) for (const sy of SIGNS) {
        line(g, x + sx * r, y + sy * r, x + sx * r, y + sy * (r - 3 * s), s, color, alpha);
        line(g, x + sx * r, y + sy * r, x + sx * (r - 3 * s), y + sy * r, s, color, alpha);
      }
      g.fillStyle(liftToWhite(color, 0.7), flash);
      fillDisc(g, x, y, 2.2 * s);
      return;
    }
    case "splash": {
      // Alan hasari gercek yaricapinda: eski 14 birimlik halka 42-87 birimlik patlamayi yalanliyordu.
      const outer = event.radius > 0 ? event.radius : 14 * s;
      const grow = still ? 1 : 1 - Math.pow(1 - clamp01(age * 2.2), 3);
      g.fillStyle(color, 0.16 * fade);
      fillDisc(g, x, y, outer * grow);
      g.lineStyle(Math.max(1, 1.6 * s * 0.6), color, 0.85 * fade);
      strokeRing(g, x, y, outer * grow);
      g.fillStyle(liftToWhite(color, 0.7), flash);
      fillDisc(g, x, y, 4 * s * 0.6);
      return;
    }
    case "shatter": {
      // Cam kirigi yelpazesi gelis yonune acilir.
      const shards = 3 + tier;
      const reach = (4 + 15 * age * motion + (still ? 10 : 0)) * s * 0.7;
      for (let i = 0; i < shards; i += 1) {
        const spread = (i / Math.max(1, shards - 1) - 0.5) * 1.1;
        const a = angle + spread;
        const inner = reach * 0.3;
        line(g, x + Math.cos(a) * inner, y + Math.sin(a) * inner, x + Math.cos(a) * reach, y + Math.sin(a) * reach, (tier >= 3 ? 1.5 : 1.1) * s * 0.7, i % 2 ? color : liftToWhite(color, 0.6), 0.95 * fade);
      }
      g.fillStyle(liftToWhite(color, 0.7), flash);
      fillDisc(g, x, y, 2.4 * s);
      return;
    }
    case "curse": {
      // Koyu cekirdek, parlak kenar: Melis'in dili lazerin tersi.
      const ring = (6 + 6 * age * motion) * s;
      g.fillStyle(0x020617, 0.6 * fade);
      fillDisc(g, x, y, ring * 0.55);
      g.lineStyle(Math.max(0.8, 1.3 * s * 0.7), color, 0.9 * fade);
      strokeRing(g, x, y, ring);
      for (let i = 0; i < 4 + tier; i += 1) {
        const a = (i / (4 + tier)) * Math.PI * 2 + hashNoise(seed + i) * 0.4;
        line(g, x + Math.cos(a) * ring * 0.4, y + Math.sin(a) * ring * 0.4, x + Math.cos(a) * ring * 1.15, y + Math.sin(a) * ring * 1.15, 0.8 * s * 0.7, liftToWhite(color, 0.5), 0.75 * fade);
      }
      return;
    }
    case "ripple": {
      const r = (4 + 12 * (still ? 1 : Math.pow(age, 0.6))) * s * 0.7;
      g.lineStyle(Math.max(0.8, 1.5 * s * 0.6), color, 0.85 * fade);
      strokeRing(g, x, y, r);
      g.lineStyle(Math.max(0.6, 0.8 * s * 0.6), liftToWhite(color, 0.6), 0.6 * fade);
      strokeRing(g, x, y, r * 0.6);
      g.fillStyle(liftToWhite(color, 0.7), flash);
      fillDisc(g, x, y, 2.2 * s);
      return;
    }
    case "slash": {
      // Bicak kesigi: hedefin uzerinden gecen kisa bir hilal.
      const sweep = still ? 1 : clamp01(age * 3);
      const reach = 9 * s * 0.8;
      for (let k = 0; k < 2; k += 1) {
        const offset = (k - 0.5) * 3 * s * 0.6;
        line(g,
          x - ux * reach + nx * offset, y - uy * reach + ny * offset,
          x - ux * reach + ux * reach * 2 * sweep + nx * (offset + Math.sin(sweep * Math.PI) * 3 * s), y - uy * reach + uy * reach * 2 * sweep + ny * (offset + Math.sin(sweep * Math.PI) * 3 * s),
          (k === 0 ? 1.6 : 0.8) * s * 0.7, k === 0 ? color : liftToWhite(color, 0.7), 0.95 * fade);
      }
      return;
    }
    case "fragments":
    default: {
      // Balistik vurus kiymiklari ucus yonunde atiyor, cember halinde degil.
      const count = 5 + tier * 2;
      for (let i = 0; i < count; i += 1) {
        const spread = (hashNoise(seed + i) - 0.5) * 1.2;
        const a = angle + spread;
        const speed = (12 + hashNoise(seed + i + 20) * 22) * s * 0.7;
        const travel = still ? speed * 0.4 : Math.pow(age, 0.6) * speed;
        const px = x + Math.cos(a) * travel;
        const py = y + Math.sin(a) * travel + age * age * 5 * s * motion;
        const length = (2 + hashNoise(seed + i + 40) * (3 + tier)) * s * 0.7 * fade;
        line(g, px, py, px - Math.cos(a) * length, py - Math.sin(a) * length, (i % 3 === 0 ? 1.4 : 0.7) * s * 0.7, i % 3 === 0 ? liftToWhite(color, 0.75) : color, Math.pow(fade, 1.6));
      }
      line(g, x - nx * (3 + tier) * s * 0.7, y - ny * (3 + tier) * s * 0.7, x + nx * (3 + tier) * s * 0.7, y + ny * (3 + tier) * s * 0.7, 1.5 * s * 0.7, liftToWhite(color, 0.85), flash);
      g.fillStyle(color, 0.65 * flash);
      fillDisc(g, x, y, (3 + tier) * s * 0.4);
    }
  }
}

/**
 * Kademe 3'un imza carpmasi: carpma dilinin buyuk ve "canli" hali.
 * Takim arkadasininki %70.
 */
function drawSignature(g: VfxGraphics, event: AttackEvent, age: number, s: number, still: boolean, extra: number, now: number) {
  const { x, y, angle } = event;
  const color = event.recipe.color;
  const core = event.recipe.core;
  const fade = (1 - age) * extra;
  switch (event.profile.impact) {
    case "brackets": {
      // Kilitlenen nisangah: ayraclar kapanmis kaliyor, ortada arti.
      const r = 9 * s * 0.6;
      g.lineStyle(Math.max(0.8, 1.1 * s * 0.6), core, 0.9 * fade);
      strokeRing(g, x, y, r);
      line(g, x - r * 1.5, y, x - r * 0.5, y, s * 0.6, core, fade);
      line(g, x + r * 0.5, y, x + r * 1.5, y, s * 0.6, core, fade);
      line(g, x, y - r * 1.5, x, y - r * 0.5, s * 0.6, core, fade);
      line(g, x, y + r * 0.5, x, y + r * 1.5, s * 0.6, core, fade);
      return;
    }
    case "collapse": {
      // Icine cokus, ardindan patlama halkasi.
      if (age > 0.45) {
        const burst = clamp01((age - 0.45) / 0.55);
        softRing(g, x, y, (4 + 18 * (still ? 1 : burst)) * s * 0.7, color, 1.4 * s * 0.6, (1 - burst) * extra);
      }
      return;
    }
    case "bolt": {
      // Gokten inen simsek sutunu.
      const top = y - 46 * s * 0.6;
      bolt(g, x + (hashNoise(event.seed + 90) - 0.5) * 6 * s, top, x, y, color, Math.pow(1 - age, 1.4) * extra, event.seed + (still ? 0 : Math.floor(now / 45)), 1.1 * s * 0.7, 8 * s * 0.6);
      return;
    }
    case "splash": {
      const outer = event.radius > 0 ? event.radius : 18 * s;
      const grow = still ? 1 : clamp01(age * 1.6);
      softRing(g, x, y, outer * (0.55 + 0.5 * grow), color, 1.2 * s * 0.6, (1 - age) * extra);
      return;
    }
    case "shatter": {
      // Ayna ikinci kez kiriliyor: yelpazenin tersi.
      const reach = (8 + 14 * (still ? 1 : age)) * s * 0.7;
      for (let i = 0; i < 4; i += 1) {
        const a = angle + Math.PI + (i / 3 - 0.5) * 1.3;
        line(g, x, y, x + Math.cos(a) * reach, y + Math.sin(a) * reach, 1.1 * s * 0.7, core, 0.85 * fade);
      }
      return;
    }
    case "curse": {
      // Muhur: ice yazili alti koseli yildiz.
      const r = 11 * s * 0.7;
      const spin = still ? 0 : age * 0.8;
      for (let k = 0; k < 2; k += 1) {
        g.lineStyle(Math.max(0.8, 1.1 * s * 0.6), k === 0 ? color : core, 0.85 * fade);
        g.beginPath();
        for (let i = 0; i <= 3; i += 1) {
          const a = spin + (i / 3) * Math.PI * 2 + k * (Math.PI / 3);
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.strokePath();
      }
      return;
    }
    case "fragments":
    case "ripple":
    case "slash":
    default: {
      // Genel imza: kesitli bir patlama halkasi ve beyaza cekilmis cekirdek.
      const grow = still ? 1 : 1 - Math.pow(1 - clamp01(age * 1.8), 3);
      softRing(g, x, y, (5 + 15 * grow) * s * 0.6, color, 1.2 * s * 0.6, (1 - age) * extra);
      drawHotDot(g, x, y, core, 2.4 * s * 0.6 * (1 - age), fade);
    }
  }
}
