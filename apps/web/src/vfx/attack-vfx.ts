/**
 * Saldirilarin profil gudumlu cizimi: mermi govdesi ve izi, namlu, carpma.
 *
 * Dil agir ve sert (vfx-profiles): az renk, beyaz-sicak cekirdek, kisa sert
 * parlama, yercekimiyle dusen kivilcimlar, kinetik vuruslarda metal
 * kirintisi ve duman, enerji vuruslarinda catirti ve kisa bir isi; kademe
 * yogunluk (cekirdek, agirlik, vurusun gucu), sus degil. Kuleye ozel tek
 * dal mekanigi tasiyan carpmalarda (Sunucu'nun gercek alani, Izolasyon'un
 * kafesi, Hiza'nin kertigi); gerisi profilin siluetinden ve maddesinden.
 *
 * Mimari sinirli olay tamponu: olaylar sabit bir havuzda, her karede
 * yaslarina gore saf fonksiyonlarla yeniden ciziliyor. Parcacik nesnesi,
 * tween ya da `Math.random` yok; tohumlar olay kimliginin FNV ozetinden.
 * Takimdaki herkes ayni seyi goruyor.
 *
 * Katmanlar:
 * - `body`: mermi govdeleri ve izleri (mermi dokularinin hemen altinda).
 * - `glow`: ADD isi (yalnizca damga havuzu yokken).
 * - `events`: namlu ve carpma; kule govdesinin USTUNDE.
 * - `ground` (secenek): yanik izleri, dusmanlarin altinda.
 * - `flashes`: pisirilmis dokulu ADD parlamalari (havuzlu).
 */
import type { ProjectileSnapshot } from "@karayel/shared";
import { drawCombatProjectile } from "./combat-vfx";
import {
  SCORCH,
  SMOKE,
  STEEL,
  TEAMMATE_EXTRA_ALPHA,
  clamp01,
  darken,
  drawBallisticSparks,
  drawCrackle,
  drawDebris,
  drawScorch,
  drawSlug,
  drawSmoke,
  drawTaperedRibbon,
  fillDisc,
  fillJaggedPath,
  fnvHash,
  hashNoise,
  liftToWhite,
  whiteHot,
  strokeHex,
  strokePolyline,
  strokeRing,
  toTier,
  TrailBuffer,
  type BallisticSparkOptions,
  type CrackleOptions,
  type DebrisOptions,
  type SmokeOptions,
  type VfxGraphics,
  type VfxTier
} from "./kit";
import type { FlashSink, GlowStampSink } from "./flash-pool";
import { VfxLod } from "./lod";
import { getVfxProfile, getVfxTier, type VfxProfile, type VfxTierRecipe } from "./vfx-profiles";
import { COURT_FLASH_GAP_MS, LANCE_OPTIONS, drawDecreeTick, drawZeynepLance, getLanceMode, getZeynepBodyColor } from "./zeynep-signatures";

/** Takim arkadasinin kademe 3 eklentileri (tek kaynak kit'te). */
export { TEAMMATE_EXTRA_ALPHA };
/** Canli olay ust siniri; dolunca en eski olay yerini veriyor. */
export const MAX_ATTACK_EVENTS = 192;
/** Namlu cakmasinin omru (kademe basina +10 ms). */
export const MUZZLE_MS = 90;
/** Sert parlamanin omru: 1-3 kare. */
export const HARD_FLASH_MS = 50;
/** Yanik izinin omru. */
export const IMPACT_DECAL_MS = 900;

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
  /** Ana cizimin omru (parlama, kivilcim, duman). */
  durationMs: number;
  /** Olayin tam omru: yanik izi varsa ondan uzun. */
  lifeMs: number;
  seed: number;
  own: boolean;
  /** Alan hasarinin gercek yaricapi; yoksa 0. */
  radius: number;
  /** Delme kertiginin beyaz cekirdegi bu olayda mi (saniyede en fazla 3; hareket azaltmada hic). */
  flash: boolean;
  /** Vurulan dusmanin ekrandaki capi (Zeynep kertigi govdeyi sariyor); yoksa 0. */
  size: number;
  /** Kimlik tonu: Zeynep'te mizragin kipi, digerlerinde kademenin tonu. */
  body: number;
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
  /** Vurulan dusmanin ekrandaki capi (sprite'in tam boyu); Zeynep kertigi icin. */
  size?: number;
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
   * Kozmetik itme (yalnizca yerel oyuncunun agir ya da kinetik kademe 2+
   * vurusu; hareket azaltmada hic): vurulan dusman `px` piksel, vurus yonunde.
   */
  onKnock?: (x: number, y: number, angle: number, px: number) => void;
  /**
   * Mermilerin isisi icin tek dortgenlik ADD damgalar. Verilmezse ayni sey
   * `glow` Graphics'ine tek daireyle ciziliyor (testler ve yedek).
   */
  stamps?: GlowStampSink;
  /** Yanik izlerinin yuzeyi (dusmanlarin altinda); yoksa iz cizilmiyor. */
  ground?: VfxGraphics & { clear(): unknown };
};

/**
 * Gudumlu atisin namlusu nereden cikiyor.
 *
 * Sunucu gudumlu mermi (Izolasyon Kulesi) icin atis mesaji gondermiyor;
 * istemci mermiyi ilk kez snapshot'ta goruyor, kulesinin birkac birim
 * onunde. Namlu o snapshot'taki, ayni tanimdan, `reach` icindeki en yakin
 * kulede. Profili gudumlu olmayan mermide ya da kulesinden uzakta ilk kez
 * gorulen mermide (yeniden baglanma) `undefined`: namlu yok. Kule nesnesinin
 * kendisini donduruyor; nesne uretmiyor.
 */
export function findHomingMuzzleOrigin<T extends { definitionId: string; x: number; y: number }>(
  projectile: Pick<ProjectileSnapshot, "x" | "y" | "definitionId" | "source">,
  towers: readonly T[],
  reach: number
): T | undefined {
  if (projectile.source !== "tower") return undefined;
  const profile = getVfxProfile(projectile.definitionId);
  if (profile.delivery !== "homing") return undefined;
  let best = reach * reach;
  let origin: T | undefined;
  for (const tower of towers) {
    if (tower.definitionId !== profile.id) continue;
    const gap = (tower.x - projectile.x) ** 2 + (tower.y - projectile.y) ** 2;
    if (gap <= best) {
      best = gap;
      origin = tower;
    }
  }
  return origin;
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
const RIBBON_CORE = { color: 0, ratio: 0.42, alpha: 0.9 };
const RIBBON = { color: 0, width: 0, alpha: 0, maxPoints: 2, core: RIBBON_CORE as typeof RIBBON_CORE | undefined };
const SPARKS: BallisticSparkOptions = { seed: 0, count: 0, speed: 0, heading: undefined, fan: 0, gravity: 0, lifeMs: 0, hue: 0, width: 0, alpha: 0, streak: 0.03 };
const DEBRIS: DebrisOptions = { seed: 0, count: 0, speed: 0, heading: undefined, fan: 0, gravity: 0, lifeMs: 0, color: STEEL, edge: 0, size: 0, alpha: 0, floor: 0 };
const SMOKE_PUFF: SmokeOptions = { seed: 0, count: 0, radius: 0, grow: 0, rise: 0, lifeMs: 0, color: SMOKE, alpha: 0, still: false };
const CRACKLE: CrackleOptions = { seed: 0, count: 0, reach: 0, hue: 0, width: 0, alpha: 0, heading: undefined, fan: 0 };
const SIDES = [-1, 1] as const;
/** Metal kirintisinin parlak yuzu. */
const STEEL_EDGE = 0xe4e4e7;
/** Ucube'nin kirikli govdesi: bes nokta, karede yeniden yaziliyor. */
const ARC_SEGMENTS = 4;
const ARC_POINTS: Array<{ x: number; y: number }> = Array.from({ length: ARC_SEGMENTS + 1 }, () => ({ x: 0, y: 0 }));
/** Ucube govdesinin yeniden tohumlanma araligi (ms): simsek kendini yeniden ciziyor. */
export const ARC_RESEED_MS = 50;
/** Enerji catirtisinin omru ve yeniden tohumlanma araligi. */
const CRACKLE_MS = 130;
const CRACKLE_RESEED_MS = 40;

export class AttackVfx {
  private readonly trails = new TrailBuffer(8, 320);
  private readonly events: AttackEvent[] = [];
  private cursor = 0;
  /** Bu karede cizilen gercek yaricapli alan halkasi; LOD 2-3'te sinirli. */
  private areaRingsThisFrame = 0;
  /** Agir sok halkalarinin kare penceresi: ayni karede en fazla `lod.shockRingCap`. */
  private shockWindowAt = Number.NEGATIVE_INFINITY;
  private shockRingsInWindow = 0;
  /** Son beyaz igne ucu (olay saati); genel 3/sn siniri icin. */
  private lastPinpointAt = Number.NEGATIVE_INFINITY;
  /** Son delme kertigi cekirdegi (olay saati); ayni 3/sn siniri. */
  private lastDecreeFlashAt = Number.NEGATIVE_INFINITY;

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
   * Karedeki mermiler: kisa sert iz, yogun govde, beyaz-sicak cekirdek.
   *
   * Kademe 2-3'te govdenin arkasinda tek bir ADD isi damgasi (tonun kendisi,
   * kucuk): enerjinin dusumu. Takim arkadasinin kademe 3 isisi %70. Govde
   * katmanlari (body ve glow) her karede bastan; cagiran `clear` etmiyor.
   */
  renderProjectiles(projectiles: readonly ProjectileSnapshot[], now: number, scale: number, isOwn?: (projectile: ProjectileSnapshot) => boolean) {
    this.body.clear();
    this.glow.clear();
    const stamps = this.options.stamps;
    stamps?.beginFrame();
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
      // Zeynep: govde ve iz mizragin kipinin tonunda.
      const hue = profile.court ? getZeynepBodyColor(projectile.definitionId, recipe.color) : recipe.color;

      // Iz: kisa ve sert; LOD'da en son kisalan (en az iki nokta).
      const entry = this.trails.record(projectile.id, projectile.x, projectile.y);
      if (entry && moving && profile.silhouette !== "sprite") {
        RIBBON.color = darken(hue, 0.2);
        RIBBON.width = recipe.trail.width * scale;
        RIBBON.alpha = 0.5;
        RIBBON.maxPoints = Math.max(2, Math.round(recipe.trail.points * lod.trailScale));
        RIBBON_CORE.color = whiteHot(hue, recipe.heat);
        RIBBON.core = RIBBON_CORE;
        drawTaperedRibbon(this.body, entry, this.trails.bufferCapacity, projectile.x, projectile.y, RIBBON);
      }

      const radius = (recipe.silhouette / 2) * scale;
      if (profile.silhouette === "lance") {
        // Mizrak (zeynep-signatures): kipin tonu, Taht'ta dizilim kertikleri.
        LANCE_OPTIONS.mode = getLanceMode(projectile.definitionId);
        LANCE_OPTIONS.tier = tier;
        LANCE_OPTIONS.heat = recipe.heat;
        LANCE_OPTIONS.weight = recipe.weight;
        LANCE_OPTIONS.radius = radius;
        LANCE_OPTIONS.scale = scale;
        drawZeynepLance(this.body, projectile.x, projectile.y, angle, LANCE_OPTIONS);
      } else if (profile.silhouette === "combat") {
        drawCombatProjectile(this.body, projectile, scale * 1.4, hue, recipe.heat);
      } else if (profile.silhouette !== "sprite") {
        // Tohum yalnizca kirikli govdede (Ucube) gerekiyor: her mermiyi her karede ozetlemek bosa is.
        const arcSeed = profile.silhouette === "arc" ? fnvHash(projectile.id) % 997 + (still ? 0 : Math.floor(now / ARC_RESEED_MS) * 7) : 0;
        this.drawSilhouette(profile, recipe, tier, projectile.x, projectile.y, angle, radius, hue, arcSeed);
      }

      // Isi: kademe 2-3'te tek, kucuk ADD damga (Melis'in dokulu mermisinde her kademede).
      if (tier >= 2 || profile.silhouette === "sprite") {
        const size = radius * (tier >= 3 ? 3.2 : tier >= 2 ? 2.6 : 2);
        const alpha = (tier >= 3 ? 0.42 * extra : tier >= 2 ? 0.32 : 0.22);
        if (stamps) {
          stamps.stamp(projectile.x, projectile.y, hue, size, alpha);
        } else {
          this.glow.fillStyle(hue, alpha * 0.4);
          fillDisc(this.glow, projectile.x, projectile.y, size * 0.4);
        }
      }
    }
    this.trails.endFrame();
    stamps?.endFrame();
  }

  /**
   * Profilin silueti: yogun ve okunur, 12-16 birim. Kademe govdeyi
   * kalinlastiriyor (`weight`) ve cekirdegi beyaza cekiyor (`heat`).
   */
  private drawSilhouette(profile: VfxProfile, recipe: VfxTierRecipe, tier: VfxTier, x: number, y: number, angle: number, radius: number, hue: number, seed: number) {
    const g = this.body;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const nx = -uy;
    const ny = ux;
    const weight = recipe.weight;
    const core = whiteHot(hue, recipe.heat);
    switch (profile.silhouette) {
      case "packet": {
        // Sunucu: agir koseli govde (elmas), icinde beyaz-sicak kare cekirdek.
        const r = radius * 0.8;
        g.fillStyle(darken(hue, 0.15), 0.95);
        g.fillTriangle(x + ux * r, y + uy * r, x + nx * r * 0.7, y + ny * r * 0.7, x - nx * r * 0.7, y - ny * r * 0.7);
        g.fillTriangle(x - ux * r * 0.8, y - uy * r * 0.8, x + nx * r * 0.7, y + ny * r * 0.7, x - nx * r * 0.7, y - ny * r * 0.7);
        const half = radius * 0.17 * weight;
        g.fillStyle(core, 1);
        g.fillRect(x - half, y - half, half * 2, half * 2);
        return;
      }
      case "cell": {
        // Izolasyon: kisa yogun govde ve ince altigen kabuk (gudumlu kapatma atisi).
        drawSlug(g, x, y, ux, uy, radius * 1.2, radius * 0.3 * weight, hue, recipe.heat);
        g.lineStyle(Math.max(0.6, radius * 0.1 * weight), hue, 0.75);
        strokeHex(g, x, y, radius * 0.8, angle);
        return;
      }
      case "arc": {
        // Ucube: kendi kendini yeniden cizen kirikli kivilcim oku; ton kenarda,
        // cekirdek beyaz-sicak. Kademe 3'te ikinci kol (daha guclu bosalma).
        const tailX = x - ux * radius * 1.6;
        const tailY = y - uy * radius * 1.6;
        fillJaggedPath(ARC_POINTS, tailX, tailY, x, y, ARC_SEGMENTS, seed, radius * 0.9);
        strokePolyline(g, ARC_POINTS, ARC_SEGMENTS + 1, radius * 0.26 * weight, hue, 0.9);
        strokePolyline(g, ARC_POINTS, ARC_SEGMENTS + 1, radius * 0.1 * weight, core, 1);
        if (tier >= 3) {
          const fork = ARC_POINTS[2];
          const side = hashNoise(seed + 5) > 0.5 ? 1 : -1;
          g.lineStyle(Math.max(0.6, radius * 0.12), core, 0.9);
          g.lineBetween(fork.x, fork.y, fork.x - ux * radius * 0.6 + nx * side * radius * 0.7, fork.y - uy * radius * 0.6 + ny * side * radius * 0.7);
        }
        g.fillStyle(core, 1);
        const head = Math.max(0.7, radius * 0.16 * weight);
        g.fillRect(x - head, y - head, head * 2, head * 2);
        return;
      }
      case "dart": {
        // Ok: sert iz mermisi ve sivri uc.
        drawSlug(g, x, y, ux, uy, radius * 1.7, radius * 0.3 * weight, hue, recipe.heat);
        const tip = radius * 0.75;
        const half = radius * 0.24 * weight;
        g.fillStyle(core, 1);
        g.fillTriangle(x + ux * tip, y + uy * tip, x - ux * radius * 0.1 + nx * half, y - uy * radius * 0.1 + ny * half, x - ux * radius * 0.1 - nx * half, y - uy * radius * 0.1 - ny * half);
        return;
      }
      case "ball": {
        // Agir gulle: koyu govde, ince ton kenari, kucuk beyaz-sicak cekirdek.
        g.fillStyle(hue, 0.85);
        fillDisc(g, x, y, radius * 0.72);
        g.fillStyle(darken(hue, 0.7), 0.96);
        fillDisc(g, x, y, radius * 0.58);
        g.fillStyle(core, 1);
        fillDisc(g, x, y, radius * 0.2 * weight);
        return;
      }
      case "ring": {
        // Destek atisi: ince ton halkasi ve beyaz-sicak nokta.
        g.lineStyle(Math.max(0.8, radius * 0.16 * weight), hue, 0.9);
        strokeRing(g, x, y, radius * 0.55);
        g.fillStyle(core, 1);
        fillDisc(g, x, y, Math.max(0.8, radius * 0.18 * weight));
        return;
      }
      case "orb":
      default: {
        // Enerji gullesi: yogun ton, beyaz-sicak cekirdek; halka yok.
        g.fillStyle(hue, 0.9);
        fillDisc(g, x, y, radius * 0.58);
        g.fillStyle(core, 1);
        fillDisc(g, x, y, radius * 0.24 * weight);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Olaylar                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Namlu: 1-3 karelik sert parlama ve kisa bir alev dili.
   *
   * Kademe 2+'nin namlu sarji (`emitAnticipation`) sahte bir gecikme degil:
   * sunucunun atis mesaji oynatmadan ~500 ms once geliyor.
   */
  emitMuzzle(input: AttackEventInput) {
    const event = this.push("muzzle", input);
    if (!event) return;
    const recipe = event.recipe;
    const size = (6 + event.tier * 2.5) * recipe.weight;
    this.flashes.flash({
      x: input.x,
      y: input.y,
      texture: "glow",
      tint: whiteHot(event.body, 0.6),
      alpha: event.own ? 0.9 : 0.7,
      sizeFrom: size,
      // Hareket azaltmada parlama boy degistirmeden soner.
      sizeTo: this.still ? size : size * 0.5,
      durationMs: HARD_FLASH_MS,
      bornAt: input.bornAt
    });
  }

  /** Kademe 2+ namlusunun sarji; kademe 1'de hicbir sey yapmiyor. */
  emitAnticipation(input: AttackEventInput) {
    const profile = getVfxProfile(input.definitionId, input.fallbackColor);
    const recipe = getVfxTier(profile, input.tier);
    if (recipe.muzzle.anticipationMs <= 0) return;
    this.push("anticipation", input, recipe.muzzle.anticipationMs);
  }

  /** Carpma: sert parlama, madde (kinetik / enerji), mekanik ve kademenin gucu. */
  emitImpact(input: AttackEventInput) {
    const event = this.push("impact", input);
    if (!event) return;
    const recipe = event.recipe;
    const impact = recipe.impact;
    const extra = event.own ? 1 : TEAMMATE_EXTRA_ALPHA;
    const still = this.still;
    if (event.profile.impact === "decree" && !still && input.bornAt - this.lastDecreeFlashAt >= COURT_FLASH_GAP_MS) {
      // Hiza saniyede ~6 dusman deliyor: beyaz cekirdek yalnizca saniyede 3 kez.
      event.flash = true;
      this.lastDecreeFlashAt = input.bornAt;
    }
    // Sert parlama: kucuk, beyaz-sicak (tonun izi), 1-3 kare. Buyumuyor.
    this.flashes.flash({
      x: input.x,
      y: input.y,
      texture: "glow",
      tint: whiteHot(event.body, 0.4),
      alpha: event.own ? 0.9 : 0.75,
      sizeFrom: impact.flash,
      sizeTo: impact.flash,
      durationMs: HARD_FLASH_MS,
      bornAt: input.bornAt
    });
    if (event.profile.matter === "energy" && this.options.lod.smoke) {
      // Enerji vurusunun isisi: tonun kendisi, kisa ve sonuk; soluk bir halka degil.
      this.flashes.flash({
        x: input.x,
        y: input.y,
        texture: "glow",
        tint: event.body,
        alpha: 0.38,
        sizeFrom: impact.flash * 1.5,
        sizeTo: still ? impact.flash * 1.5 : impact.flash * 1.8,
        durationMs: 140,
        bornAt: input.bornAt
      });
    }
    if (impact.shockRing && !event.profile.aoe && !still && this.takeShockRing(input.bornAt)) {
      // Agir vurusun tek siki sok halkasi (kademe 3): yakin ve kisa, ust uste binmiyor.
      const ring = 18 * recipe.weight;
      this.flashes.flash({
        x: input.x,
        y: input.y,
        texture: "ring",
        tint: whiteHot(event.body, 0.3),
        alpha: 0.7 * extra,
        sizeFrom: ring * 0.6,
        sizeTo: ring,
        durationMs: 120,
        bornAt: input.bornAt
      });
    }
    if (impact.pinpoint && !still && input.bornAt - this.lastPinpointAt >= PINPOINT_GAP_MS) {
      // Tek karelik beyaz igne ucu: genel olarak saniyede en fazla 3; hareket azaltmada hic.
      this.lastPinpointAt = input.bornAt;
      this.flashes.flash({ x: input.x, y: input.y, texture: "glow", tint: 0xffffff, alpha: extra, sizeFrom: 8, sizeTo: 8, durationMs: 34, bornAt: input.bornAt });
    }
    if (recipe.shake && event.own && event.profile.heavy) {
      this.options.onHeavyImpact?.(input.x, input.y);
    }
    if (recipe.knock > 0 && event.own && !still) {
      this.options.onKnock?.(input.x, input.y, input.angle, recipe.knock);
    }
  }

  /** Sok halkasinin kare siniri (LOD 2'de dort, 3+'te iki); ayni kare = 1/60 sn. */
  private takeShockRing(at: number) {
    if (at - this.shockWindowAt > 1000 / 60) {
      this.shockWindowAt = at;
      this.shockRingsInWindow = 0;
    }
    if (this.shockRingsInWindow >= this.options.lod.shockRingCap) return false;
    this.shockRingsInWindow += 1;
    return true;
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
    this.options.ground?.clear();
  }

  /** Olaylari yaslarina gore ciz; biten olay havuza doner. */
  render(now: number, scale: number) {
    const g = this.eventsLayer;
    g.clear();
    this.options.ground?.clear();
    const still = this.still;
    this.areaRingsThisFrame = 0;
    for (const event of this.events) {
      if (!event.live) continue;
      const elapsed = now - event.bornAt;
      if (elapsed < 0) continue;
      if (elapsed >= event.lifeMs) {
        event.live = false;
        continue;
      }
      if (event.kind === "anticipation") this.drawAnticipation(g, event, elapsed / event.durationMs, scale, still);
      else if (event.kind === "muzzle") this.drawMuzzle(g, event, elapsed, scale, still);
      else this.drawImpact(g, event, elapsed, scale, still);
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
    event.durationMs = durationOverride ?? (kind === "muzzle" ? MUZZLE_MS + recipe.tier * 10 : recipe.impact.durationMs);
    // Yer izi cizilecekse (zemin yuzeyi var, LOD izin veriyor) olay iz kadar yasiyor; yoksa ana cizim kadar.
    event.lifeMs = kind === "impact" && recipe.impact.scorch && this.options.ground && this.options.lod.decals ? Math.max(event.durationMs, IMPACT_DECAL_MS) : event.durationMs;
    event.seed = input.key ? fnvHash(input.key) % 100003 : fnvHash(`${Math.round(input.x)}:${Math.round(input.y)}:${Math.round(input.bornAt)}`) % 100003;
    event.own = input.own ?? true;
    event.radius = input.radius ?? 0;
    event.size = input.size ?? 0;
    event.flash = false;
    event.body = profile.court ? getZeynepBodyColor(input.definitionId, recipe.color) : recipe.color;
    return event;
  }

  /** Namlu sarji: namluya cekilen uc kisa cizgi ve buyuyen beyaz-sicak nokta. */
  private drawAnticipation(g: VfxGraphics, event: AttackEvent, age: number, scale: number, still: boolean) {
    const hue = event.body;
    const reach = (still ? 6 : 10 - age * 6) * scale;
    g.lineStyle(Math.max(0.6, 0.9 * scale), hue, clamp01(0.3 + age * 0.5));
    for (let index = -1; index <= 1; index += 1) {
      const a = event.angle + Math.PI + index * 0.9;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      g.lineBetween(event.x + cx * reach, event.y + cy * reach, event.x + cx * reach * 0.5, event.y + cy * reach * 0.5);
    }
    const dot = (0.8 + age * 1.6) * scale * event.recipe.weight;
    g.fillStyle(whiteHot(hue, event.recipe.heat), clamp01(0.4 + age * 0.6));
    g.fillRect(event.x - dot / 2, event.y - dot / 2, dot, dot);
  }

  /** Namlu alevi: ileri dogru kisa bir dil (ton) ve beyaz-sicak cekirdegi; kademe 2+ yan nefesler. */
  private drawMuzzle(g: VfxGraphics, event: AttackEvent, elapsed: number, scale: number, still: boolean) {
    const recipe = event.recipe;
    const age = clamp01(elapsed / event.durationMs);
    const fade = 1 - age;
    const ux = Math.cos(event.angle);
    const uy = Math.sin(event.angle);
    const nx = -uy;
    const ny = ux;
    const hue = event.body;
    const reach = recipe.muzzle.reach * scale * (still ? 1 : 1 - age * 0.5);
    const half = (0.9 + event.tier * 0.4) * scale * recipe.weight * (still ? 1 : fade);
    g.fillStyle(hue, clamp01(0.85 * fade));
    g.fillTriangle(event.x + ux * reach, event.y + uy * reach, event.x + nx * half, event.y + ny * half, event.x - nx * half, event.y - ny * half);
    g.lineStyle(Math.max(0.6, half * 0.7), whiteHot(hue, recipe.heat), clamp01(fade));
    g.lineBetween(event.x, event.y, event.x + ux * reach * 0.7, event.y + uy * reach * 0.7);
    if (event.tier >= 2) {
      // Yan nefesler: agir atisin namlusu iki yana gaz veriyor.
      g.lineStyle(Math.max(0.6, 0.8 * scale), hue, clamp01(0.6 * fade));
      for (const side of SIDES) {
        const a = event.angle + side * 1.15;
        g.lineBetween(event.x, event.y, event.x + Math.cos(a) * reach * 0.4, event.y + Math.sin(a) * reach * 0.4);
      }
    }
    if (event.tier >= 3 && !still && this.options.lod.sparks) {
      SPARKS.seed = event.seed;
      SPARKS.count = 3;
      SPARKS.speed = 120 * scale;
      SPARKS.heading = event.angle;
      SPARKS.fan = 0.9;
      SPARKS.gravity = 220 * scale;
      SPARKS.lifeMs = event.durationMs;
      SPARKS.hue = hue;
      SPARKS.width = Math.max(0.6, 0.8 * scale);
      SPARKS.alpha = 0.9 * (event.own ? 1 : TEAMMATE_EXTRA_ALPHA);
      drawBallisticSparks(g, event.x, event.y, elapsed, SPARKS);
    }
  }

  private drawImpact(g: VfxGraphics, event: AttackEvent, elapsed: number, scale: number, still: boolean) {
    const recipe = event.recipe;
    const impact = recipe.impact;
    const lod = this.options.lod;
    const extra = event.own ? 1 : TEAMMATE_EXTRA_ALPHA;
    const tierExtra = event.tier >= 3 ? extra : 1;
    const hue = event.body;
    const { x, y } = event;
    const weight = recipe.weight;

    // Yer izi: yanik, dusmanlarin altinda; LOD ucuncu basamakta.
    const ground = this.options.ground;
    if (impact.scorch && ground && lod.decals && elapsed < IMPACT_DECAL_MS) {
      const rx = event.radius > 0 ? event.radius * 0.42 : (3 + event.tier * 1.4) * scale * weight;
      drawScorch(ground, x, y + 2 * scale, elapsed / IMPACT_DECAL_MS, rx, rx * 0.5, SCORCH, 0.5, event.seed);
    }
    if (elapsed >= event.durationMs) return;
    const age = elapsed / event.durationMs;

    // Cekirdek: 1-3 karelik beyaz-sicak nokta.
    if (elapsed < 50) {
      g.fillStyle(liftToWhite(hue, 0.9), clamp01(1 - elapsed / 50));
      fillDisc(g, x, y, (1.4 + event.tier * 0.6) * scale);
    }

    this.drawMechanic(g, event, age, elapsed, scale, still);

    if (event.profile.matter === "kinetic") {
      if (elapsed < 40) {
        // Sert vurus: govdenin icinden gecen kisa beyaz-sicak bir cizgi (1-2 kare).
        const ux = Math.cos(event.angle);
        const uy = Math.sin(event.angle);
        const reach = (5 + event.tier * 2) * scale * weight;
        g.lineStyle(Math.max(0.8, 1.1 * scale * weight), liftToWhite(hue, 0.9), clamp01(1 - elapsed / 40));
        g.lineBetween(x - ux * reach, y - uy * reach, x + ux * reach * 0.5, y + uy * reach * 0.5);
      }
      if (!still && lod.sparks) {
        SPARKS.seed = event.seed;
        SPARKS.count = impact.sparks;
        SPARKS.speed = impact.force * scale;
        SPARKS.heading = event.angle;
        SPARKS.fan = 1.5;
        SPARKS.gravity = 420 * scale;
        SPARKS.lifeMs = 280 + event.tier * 50;
        SPARKS.hue = hue;
        SPARKS.width = Math.max(0.8, (0.9 + event.tier * 0.15) * scale);
        SPARKS.alpha = 0.95 * tierExtra;
        drawBallisticSparks(g, x, y, elapsed, SPARKS);
        DEBRIS.seed = event.seed + 7;
        DEBRIS.count = impact.debris;
        DEBRIS.speed = impact.force * 0.6 * scale;
        DEBRIS.heading = event.angle;
        DEBRIS.fan = 1.9;
        DEBRIS.gravity = 420 * scale;
        DEBRIS.lifeMs = 360 + event.tier * 30;
        DEBRIS.color = STEEL;
        DEBRIS.edge = STEEL_EDGE;
        DEBRIS.size = 1.4 * scale * weight;
        DEBRIS.alpha = 0.95 * tierExtra;
        DEBRIS.floor = 9 * scale;
        // Yere inen kirinti zeminde (kulelerin ve dusmanlarin altinda).
        drawDebris(g, x, y, elapsed, DEBRIS, ground);
      }
    } else {
      if (elapsed < CRACKLE_MS) {
        // Enerji: kisa elektrik catirtisi; hareket azaltmada yeniden tohumlanmiyor.
        CRACKLE.seed = event.seed + (still ? 0 : Math.floor(elapsed / CRACKLE_RESEED_MS) * 19);
        CRACKLE.count = impact.crackle + (event.profile.impact === "bolt" ? 1 : 0);
        CRACKLE.reach = (6 + event.tier * 2.5) * scale * (event.profile.impact === "bolt" ? 1.4 : 1);
        CRACKLE.hue = hue;
        CRACKLE.width = Math.max(0.6, 0.85 * scale);
        CRACKLE.alpha = 1 - elapsed / CRACKLE_MS;
        CRACKLE.heading = undefined;
        drawCrackle(g, x, y, CRACKLE);
      }
      if (!still && lod.sparks) {
        SPARKS.seed = event.seed + 3;
        SPARKS.count = impact.sparks;
        SPARKS.speed = impact.force * 0.8 * scale;
        SPARKS.heading = undefined;
        SPARKS.fan = 0;
        SPARKS.gravity = 260 * scale;
        SPARKS.lifeMs = 220 + event.tier * 30;
        SPARKS.hue = hue;
        SPARKS.width = Math.max(0.7, (0.8 + event.tier * 0.15) * scale);
        SPARKS.alpha = 0.9 * tierExtra;
        drawBallisticSparks(g, x, y, elapsed, SPARKS);
      }
    }

    if (impact.smoke && lod.smoke) {
      SMOKE_PUFF.seed = event.seed + 11;
      SMOKE_PUFF.count = event.profile.aoe ? 2 + (event.tier >= 3 ? 1 : 0) : 1 + (event.tier >= 3 ? 1 : 0);
      SMOKE_PUFF.radius = (event.profile.aoe ? Math.max(4, event.radius * 0.18) : 3 * weight) * scale;
      SMOKE_PUFF.grow = 1.2;
      SMOKE_PUFF.rise = 10 * scale;
      SMOKE_PUFF.lifeMs = event.durationMs * 0.95;
      // Enerji alani: isinmis koyu buhar (tonun karanligi); kinetik: notr duman.
      SMOKE_PUFF.color = event.profile.matter === "energy" ? darken(hue, 0.72) : SMOKE;
      SMOKE_PUFF.alpha = event.profile.matter === "energy" ? 0.26 : 0.32;
      SMOKE_PUFF.still = still;
      drawSmoke(g, x, y, elapsed, SMOKE_PUFF);
    }
  }

  /** Mekanigi tasiyan carpma: alanin gercek yaricapi, kafes, kertik, kesik, cokus. */
  private drawMechanic(g: VfxGraphics, event: AttackEvent, age: number, elapsed: number, scale: number, still: boolean) {
    const { x, y, angle, tier } = event;
    const recipe = event.recipe;
    const hue = event.body;
    const fade = 1 - age;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const nx = -uy;
    const ny = ux;
    switch (event.profile.impact) {
      case "decree": {
        // Delme kertigi: govdeyi kesen cizgi, dusmanin ekrandaki capinda.
        drawDecreeTick(g, x, y, angle, event.size > 0 ? event.size : 34 * scale, hue, age, scale, still, event.flash, recipe.heat);
        return;
      }
      case "uplink":
      case "splash": {
        // Alan: gercek yaricapta tek ince sert halka (buyumuyor) -- vurusun
        // nereye kadar gittigini soyleyen sey. Sunucu'da yukaridan inen vurus.
        const outer = event.radius > 0 ? event.radius : 14 * scale;
        const ringLife = clamp01(elapsed / 260);
        if (ringLife < 1 && this.areaRingsThisFrame < this.options.lod.shockRingCap) {
          this.areaRingsThisFrame += 1;
          g.lineStyle(Math.max(0.8, (0.9 + tier * 0.35) * scale), hue, clamp01(0.9 * (1 - ringLife)));
          strokeRing(g, x, y, outer * (still ? 1 : 0.94 + 0.06 * Math.min(1, elapsed / 60)));
        }
        if (event.profile.impact === "uplink" && elapsed < 110) {
          const top = y - (24 + tier * 6) * scale;
          const drop = still ? 1 : clamp01(elapsed / 50);
          const strike = clamp01(1 - elapsed / 110);
          g.lineStyle(Math.max(1, (1.2 + tier * 0.6) * scale), hue, 0.85 * strike);
          g.lineBetween(x, top, x, top + (y - top) * drop);
          g.lineStyle(Math.max(0.6, (0.5 + tier * 0.3) * scale), whiteHot(hue, recipe.heat), strike);
          g.lineBetween(x, top, x, top + (y - top) * drop);
        }
        return;
      }
      case "contain": {
        // Izolasyon: hedefin cevresinde kapanan ince altigen kafes.
        const close = still ? 0.5 : Math.pow(1 - clamp01(age / 0.5), 2);
        const r = (5 + close * 8) * scale;
        g.lineStyle(Math.max(0.7, (0.7 + tier * 0.25) * scale), hue, clamp01(0.9 * fade));
        strokeHex(g, x, y, r, hashNoise(event.seed) * Math.PI);
        return;
      }
      case "slash": {
        // Bicak kesigi: hedefin uzerinden gecen sert bir cizgi (ton kenari, beyaz cekirdek).
        if (elapsed > 140) return;
        const sweep = still ? 1 : clamp01(elapsed / 60);
        const reach = 8 * scale * recipe.weight;
        const sx = x - ux * reach + nx * reach * 0.4;
        const sy = y - uy * reach + ny * reach * 0.4;
        const ex = sx + (ux * 2 * reach - nx * reach * 0.8) * sweep;
        const ey = sy + (uy * 2 * reach - ny * reach * 0.8) * sweep;
        const life = clamp01(1 - elapsed / 140);
        g.lineStyle(Math.max(0.8, 1.6 * scale * recipe.weight), hue, 0.85 * life);
        g.lineBetween(sx, sy, ex, ey);
        g.lineStyle(Math.max(0.6, 0.6 * scale * recipe.weight), whiteHot(hue, recipe.heat), life);
        g.lineBetween(sx, sy, ex, ey);
        return;
      }
      case "collapse": {
        // Obsesyon: ice cokus -- kisa cizgiler merkeze cekiliyor, koyu cekirdek kaliyor.
        const pull = still ? 0.5 : clamp01(age / 0.45);
        if (pull < 1) {
          const arms = 3 + tier;
          g.lineStyle(Math.max(0.6, (0.7 + tier * 0.2) * scale), hue, clamp01(0.85 * (1 - pull)));
          for (let index = 0; index < arms; index += 1) {
            const a = hashNoise(event.seed + index) * Math.PI * 2;
            const r = (4 + (1 - pull) * (8 + tier * 2)) * scale;
            g.lineBetween(x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45);
          }
        }
        g.fillStyle(0x07040c, clamp01(0.7 * fade));
        fillDisc(g, x, y, (2 + tier * 0.6) * scale);
        return;
      }
      case "curse": {
        // Melis: koyu cekirdek; catirti tonu kenarda tasiyor.
        g.fillStyle(0x05030a, clamp01(0.7 * fade));
        fillDisc(g, x, y, (2.4 + tier * 0.6) * scale);
        return;
      }
      default:
    }
  }
}
