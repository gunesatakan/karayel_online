import { GAME_SPEED_MULTIPLIER, ZEYNEP_SYNTHESIS_BURN_TICK_MS, type BeamSnapshot } from "@karayel/shared";
import { drawPressureWave, getZeynepTrim } from "./combat-vfx";
import { drawChevron, drawCrownSigil, drawWaxSeal, fillRayPath } from "./zeynep-signatures";
import { getCourtTier } from "./vfx-profiles";
import {
  ATAKAN_ACCENT,
  LASER_CORONA,
  LASER_GLINTS,
  LASER_MUZZLE,
  LASER_SPARKS,
  TEAMMATE_EXTRA_ALPHA,
  clamp01,
  drawBracketCorners,
  drawCodeSparks,
  fillJaggedPath,
  strokePolyline,
  drawCorona,
  drawLineSparks,
  drawMotes,
  drawMuzzleBurst,
  drawPointCorona,
  drawRunningGlints,
  fillDisc,
  strokeRing,
  fnvHash,
  fnvUnit,
  hashNoise,
  liftToWhite,
  strokeProfile,
  strokeRingProfile,
  type VfxGraphics
} from "./kit";
import { VfxLod } from "./lod";
import { getBeamVfxProfile, getVfxTier } from "./vfx-profiles";

const clampRange = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** Onuncu seviyede Zeynep isinindan dokulen zerre sayisi. */
const SHOWCASE_MOTE_COUNT = 9;
/** Onuncu seviye asiri yuklemede kiris boyunca kosan parlama sayisi. */
const OVERDRIVE_FLARE_COUNT = 7;
/** Kirisin kenarindan dokulen kivilcim sayisi. */
const OVERDRIVE_SPARK_COUNT = 10;
/** Halenin kac katmanda sondugu; az katman duz kenarli bir bant birakiyor. */
const OVERDRIVE_HALO_LAYERS = 6;
/** Bir kivilcimin dogup sonme suresi. */
const OVERDRIVE_SPARK_LIFE_MS = 520;

/** Takim arkadasinin kademe 3 eklentileri bu alfada (kit'in tek kaynagi). */
const TEAMMATE_TRIM_ALPHA = TEAMMATE_EXTRA_ALPHA;

/**
 * Lazerin asiri yukleme sayilari kitin `LASER_*` degerleri; karede nesne
 * uretilmesin diye bir kez kuruluyor, isina bagli iki alan cizimde yaziliyor.
 */
const OVERDRIVE_CORONA = { ...LASER_CORONA, layers: OVERDRIVE_HALO_LAYERS, base: 0 };
const OVERDRIVE_GLINTS = { ...LASER_GLINTS, count: OVERDRIVE_FLARE_COUNT };
const OVERDRIVE_SPARKS = { ...LASER_SPARKS, count: OVERDRIVE_SPARK_COUNT, lifeMs: OVERDRIVE_SPARK_LIFE_MS, offset: 0 };

/**
 * Kare basina cizim secenekleri icin bir kez kurulan, cizimde yerinde
 * yazilan nesneler: isinlar her karede cizildigi icin cagri basina nesne
 * literali saniyede binlerce cop nesne demekti.
 */
const TRIM_GLINTS = { ...LASER_GLINTS, count: 3, armBase: 4, armRange: 3, armWidth: 1, crossWidth: 0.8, haloRadius: 2.6, coreRadius: 1.2, cheapDiscs: true };
const COLUMN_GLINTS = { ...LASER_GLINTS, count: 4, haloColor: 0xfde68a, cheapDiscs: true };
const COLUMN_SPARKS = { ...LASER_SPARKS, count: 8, color: 0xfde68a, offset: 0, rise: 0 };
const TRIM_PROFILE = { body: 0, spread: 0 };
const TRIM_RING = { width: 0, spread: 0 };
const TRIM_CORONA = { radius: 0, layers: 3, step: 0, color: 0, alpha: 0, period: 170 };
const TRIM_MOTES = { seed: 0, count: 6, radius: 0, color: 0, size: 0, alpha: 0, lifeMs: 520 };
const ACCENT_OUTER = { outerWidth: 0 };
const ACCENT_AXIS = { axisWidth: 0, lifeMs: 260 };
/** Ucube zincirinin kosan parlamalari ve kod kivilcimlari (kademe 3). */
const CHAIN_GLINTS = { ...LASER_GLINTS, count: 2, armBase: 3, armRange: 2, armWidth: 0.9, crossWidth: 0.7, haloRadius: 2.2, coreRadius: 1, cheapDiscs: true };
const CHAIN_CODE = { seed: 0, count: 4, radius: 0, rise: 0, color: 0, accent: ATAKAN_ACCENT, size: 0, alpha: 0, lifeMs: 380 };
/** Zincirin yeniden tohumlanma araligi: simsek her 60 ms'de baska yoldan. */
export const CHAIN_RESEED_MS = 60;
/** Sunucudaki zincir omru (setUcubeChainBeam). */
const CHAIN_LIFE_MS = 190;
/** Zeynep sutununun ic ice katmanlari (genislik orani). */
const COLUMN_LAYERS = [1.35, 1, 0.62] as const;
/** Ayna mizraginin yolu: kuyruk, sekmeler, bas (havuzlu noktalar). */
const RAY_POINTS: Array<{ x: number; y: number }> = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));
const SPEAR_PROFILE = { body: 0, spread: 0 };
const SPEAR_GLINTS = { ...LASER_GLINTS, count: 2, armBase: 3, armRange: 2, armWidth: 0.9, crossWidth: 0.7, haloRadius: 2.2, coreRadius: 1, cheapDiscs: true };
const BURN_MOTES = { seed: 0, count: 4, radius: 0, color: 0, size: 0, alpha: 0, lifeMs: 900 };
/** Yanik izinin hasar tiki (gercek saat): hit-sounds `AREA_BEAM_TICK_MS` ile ayni sabit. */
const BURN_TICK_MS = ZEYNEP_SYNTHESIS_BURN_TICK_MS / GAME_SPEED_MULTIPLIER;
/** Kin gosterisinin iki kenari ve kenardaki seritlerin yerleri (karede dizi yok). */
const CONE_SIDES = [1, -1] as const;
const CONE_CHEVRON_STOPS = [0.4, 0.68, 0.94] as const;
/** Kin dalgasinin sonme suresi: sunucu dalgayi son karede siliyor, istemci son halini sonduruyor. */
export const KIN_WAVE_FADE_MS = 200;

export type BeamRenderOptions = {
  /** Efekt saati (ms). */
  now: number;
  /** Sahne saati (Phaser `time.now`); lazerin dugumu ve parlamalari. */
  sceneNow: number;
  scale: number;
  /** Isini atan kule yerel oyuncunun mu; yoksa hepsi kendi sayilir. */
  isOwn?: (beam: BeamSnapshot) => boolean;
  /**
   * Hareket azaltma: kademe trimlerinin kosan parlamalari, zerreleri ve
   * kivilcimlari cizilmiyor. Lazerin cizimi bunu okumuyor -- HEAD'de de
   * okumuyordu; gorunusu her ayarda ayni.
   */
  reducedMotion?: boolean;
};

/**
 * Isinlarin cizimi: lazer, Zeynep'in gosterileri, Melis'in dalgalari, ultiler.
 *
 * Bu yontemler eskiden GameScene'in icindeydi ve yalnizca snapshot geldiginde
 * (saniyede ~15 kez) calisiyordu. Simdi ayri bir sinif: sahne her karede
 * ara degerlenmis isinlari veriyor (`BeamInterpolator`), galeri ayni sinifi
 * sahte isinlarla besliyor.
 *
 * Saatler disaridan: `now` efekt saati (performance.now ya da galerinin
 * yavas saati), `time.now` sahnenin saati (lazerin dugumu ve parlamalari bu
 * saate bagliydi; ayni kalmasi icin ayri tutuluyor).
 */
export class BeamRenderer {
  protected readonly time = { now: 0 };
  protected now = 0;
  private effectScale = 1;
  private ownBeam = true;
  private still = false;
  /** fillPoints icin yeniden kullanilan nokta dizileri; karede nesne uretilmiyor. */
  private readonly pointLists: Array<Array<{ x: number; y: number }>> = [];
  private pointCursor = 0;
  /** Kin dalgalarinin son hali (kimlikle, havuzlu): kaybolunca sonduruluyor. */
  private readonly kinLast = new Map<string, { beam: BeamSnapshot; seenAt: number; frame: number }>();
  private readonly kinPool: Array<{ beam: BeamSnapshot; seenAt: number; frame: number }> = [];
  private renderFrame = 0;

  constructor(
    protected readonly beamGraphics: (VfxGraphics & { clear(): unknown }) | undefined,
    private readonly glowGraphics?: VfxGraphics & { clear(): unknown },
    private readonly lod: VfxLod = new VfxLod()
  ) {}

  /** Karenin isinlari; yuzeyler bastan ciziliyor. */
  render(beams: readonly BeamSnapshot[], options: BeamRenderOptions) {
    this.beamGraphics?.clear();
    this.glowGraphics?.clear();
    if (!this.beamGraphics) {
      return;
    }
    this.now = options.now;
    this.time.now = options.sceneNow;
    this.effectScale = options.scale;
    this.still = options.reducedMotion ?? false;
    this.pointCursor = 0;

    this.renderFrame += 1;
    for (const beam of beams) {
      this.ownBeam = options.isOwn ? options.isOwn(beam) : true;
      this.drawBeam(beam);
      if (beam.definitionId === "zeynep-6" || beam.definitionId === "zeynep-3-kin-wave") this.rememberKinWave(beam, this.ownBeam);
    }
    this.fadeVanishedKinWaves();
  }

  /** Kin dalgasinin son hali: alanlar havuzdaki kendi nesnesine kopyalaniyor. */
  private rememberKinWave(beam: BeamSnapshot, own: boolean) {
    let entry = this.kinLast.get(beam.id);
    if (!entry) {
      entry = this.kinPool.pop() ?? { beam: { ...beam }, seenAt: 0, frame: 0 };
      this.kinLast.set(beam.id, entry);
    }
    const copy = entry.beam;
    copy.id = beam.id;
    copy.definitionId = beam.definitionId;
    copy.tier = beam.tier;
    copy.x1 = beam.x1;
    copy.y1 = beam.y1;
    copy.x2 = beam.x2;
    copy.y2 = beam.y2;
    copy.width = beam.width;
    copy.color = beam.color;
    copy.overdrive = own;
    entry.seenAt = this.now;
    entry.frame = this.renderFrame;
  }

  /**
   * Kin dalgasi sonmeden kayboluyordu: sunucu dalgayi menzilin ucunda siliyor
   * ve son karede omur hala doluydu. Kaybolan dalga son halinde 200 ms'de
   * soner (omur `drawPressureWave`in son 40 ms'lik sonmesine esleniyor).
   * Hareket azaltmada da soner: sonme hareket degil.
   */
  private fadeVanishedKinWaves() {
    for (const [id, entry] of this.kinLast) {
      if (entry.frame === this.renderFrame) continue;
      const since = this.now - entry.seenAt;
      if (since >= KIN_WAVE_FADE_MS || since < 0) {
        this.kinLast.delete(id);
        this.kinPool.push(entry);
        continue;
      }
      const ghost = entry.beam;
      const own = Boolean(ghost.overdrive);
      ghost.overdrive = false;
      ghost.ttlMs = 40 * (1 - since / KIN_WAVE_FADE_MS);
      this.ownBeam = own;
      drawPressureWave(this.beamGraphics!, ghost, this.now, this.getTowerEffectScale());
      ghost.overdrive = own;
    }
  }

  protected getTowerEffectScale() {
    return this.effectScale;
  }

  /**
   * Havuzdan `count` noktalik bir dizi.
   *
   * Ayni karede her cagri ayri bir dizi aliyor (imlec karenin basinda
   * sifirlaniyor); diziler ve noktalar kareden kareye yeniden kullaniliyor.
   * Isinlar artik her karede ciziliyor: eskisi gibi her bant icin alti yeni
   * `Phaser.Geom.Point` uretmek saniyede binlerce cop nesne demekti.
   */
  private points(count: number) {
    let list = this.pointLists[this.pointCursor];
    if (!list) {
      list = [];
      this.pointLists[this.pointCursor] = list;
    }
    this.pointCursor += 1;
    while (list.length < count) list.push({ x: 0, y: 0 });
    if (list.length > count) list.length = count;
    return list;
  }

  private static setPoint(list: Array<{ x: number; y: number }>, index: number, x: number, y: number) {
    const point = list[index];
    point.x = x;
    point.y = y;
  }

  private drawBeam(beam: BeamSnapshot) {
    const color = beam.color ?? 0xfb7185;
    if (beam.overdrive) {
      this.drawOverdriveBeam(beam, color);
    } else if (beam.definitionId === "zeynep-6" || beam.definitionId === "zeynep-3-kin-wave") {
      drawPressureWave(this.beamGraphics!, beam, this.now, this.getTowerEffectScale());
    } else if (beam.definitionId === "zeynep-3-kin-showcase") {
      this.drawKinShowcaseLight(beam, color);
    } else if (beam.definitionId === "archer-2-rage") {
      this.drawMelisRageWave(beam, color);
      this.drawBeamTierTrim(beam, color);
    } else if (beam.definitionId === "archer-3-curse" || beam.definitionId === "archer-3-curse-burst" || beam.definitionId === "archer-3-curse-pool") {
      this.drawMelisCursePulse(beam, color);
      this.drawBeamTierTrim(beam, color);
    } else if (beam.definitionId === "archer-6-whisper") {
      this.drawMelisWhisperWave(beam, color);
      this.drawBeamTierTrim(beam, color);
    } else if (beam.definitionId === "archer-6-whisper-turn") {
      this.drawMelisWhisperTurnShot(beam, color);
      this.drawBeamTierTrim(beam, color);
    } else if (beam.definitionId === "archer-6-whisper-suicide") {
      this.drawMelisWhisperSuicideBurst(beam, color);
      this.drawBeamTierTrim(beam, color);
    } else if (beam.definitionId === "archer-4-underworld-link" || beam.definitionId === "archer-4-underworld-execute" || beam.definitionId === "archer-4-undead-shot") {
      this.drawMelisUnderworldLink(beam, color);
      this.drawBeamTierTrim(beam, color);
    } else if (beam.definitionId === "archer-5-mirror") {
      this.drawMelisBrokenMirrorBurst(beam, color);
      this.drawBeamTierTrim(beam, color);
    } else if (beam.definitionId === "zeynep-3" || beam.definitionId === "zeynep-3-ray") {
      this.drawMirrorSpear(beam, color);
    } else if (beam.definitionId === "zeynep-2" || beam.definitionId === "zeynep-3-burn") {
      this.drawShowcaseBeam(beam, color);
    } else if (beam.definitionId === "zeynep-3-burn-trail") {
      this.drawSynthesisBurnTrail(beam, color);
    } else if (beam.definitionId === "warrior-6") {
      this.drawChainLightning(beam, color);
    } else if (beam.definitionId === "zeynep-ultimate-column") {
      this.drawZeynepColumnBurst(beam, color);
    } else if (beam.definitionId === "onur-sympathy") {
      this.drawSympathyLink(beam, color);
      this.drawBeamTierTrim(beam, color);
    } else if (beam.definitionId === "enemy-shot") {
      this.drawEnemyShot(beam, color);
    } else {
      this.drawLaserConnection(beam, color);
    }
  }

  /**
   * Kademe trimi: kendi kademe dili olmayan isinlara (Melis, Sempati) genel
   * uc perde. Isinin rengi govdede kaliyor; kademe yalnizca trim ekliyor.
   *
   * - Kademe 2: rampanin ikinci duraginda omuzlar (ADD) ve beyaza cekilmis file.
   * - Kademe 3: ucuncu durakta genis omuzlar, kosan parlamalar ve zerreler.
   *
   * Cizgi isinlarda (iki ucu ayri) kesit eksen boyunca, nokta isinlarda
   * (patlama, havuz) halka olarak. Takim arkadasininki %70.
   */
  private drawBeamTierTrim(beam: BeamSnapshot, color: number) {
    const tier = beam.tier ?? 1;
    if (tier < 2 || !this.beamGraphics) return;
    const profile = getBeamVfxProfile(beam.definitionId, color);
    const recipe = getVfxTier(profile, tier);
    const extra = this.ownBeam ? 1 : TEAMMATE_TRIM_ALPHA;
    const scale = this.getTowerEffectScale();
    const life = this.getBeamLife(beam);
    const glow = this.glowGraphics ?? this.beamGraphics;
    const length = Math.hypot(beam.x2 - beam.x1, beam.y2 - beam.y1);
    if (length > 2) {
      // Govdeyi kaplamayan ince bir kesit: omuzlar ADD'de trim renginde, file beyaza yakin.
      TRIM_PROFILE.body = Math.max(0.8, 1.1 * scale);
      TRIM_PROFILE.spread = Math.max(3, Math.min(10, beam.width * 0.6)) * scale;
      strokeProfile(this.beamGraphics, beam.x1, beam.y1, beam.x2, beam.y2, recipe.color, tier, TRIM_PROFILE, glow, 0.75 * life * (tier >= 3 ? extra : 1));
      if (tier >= 3 && this.lod.corona && !this.still) {
        TRIM_GLINTS.armBase = 4 * scale;
        TRIM_GLINTS.armRange = 3 * scale;
        TRIM_GLINTS.haloColor = recipe.color;
        TRIM_GLINTS.haloRadius = 2.6 * scale;
        TRIM_GLINTS.coreRadius = 1.2 * scale;
        TRIM_GLINTS.seedOffset = fnvHash(beam.id) % 997;
        drawRunningGlints(this.beamGraphics, beam.x1, beam.y1, beam.x2, beam.y2, this.now, TRIM_GLINTS, life * extra);
      }
      return;
    }
    const radius = Math.max(6, beam.width / 2);
    TRIM_RING.width = Math.max(0.8, 1.2 * scale);
    TRIM_RING.spread = 3.2 * scale;
    // Hareket azaltmada halka yerinde: omurle disa acilmiyor.
    const drift = this.still ? 0 : (1 - life) * 0.12;
    strokeRingProfile(this.beamGraphics, beam.x1, beam.y1, radius * (1.02 + drift), recipe.color, tier, TRIM_RING, glow, 0.8 * life * (tier >= 3 ? extra : 1));
    if (tier >= 3 && !this.still) {
      if (this.lod.corona) {
        TRIM_CORONA.radius = radius * 0.3;
        TRIM_CORONA.step = radius * 0.18;
        TRIM_CORONA.color = recipe.color;
        TRIM_CORONA.alpha = 0.05 * life * extra;
        drawPointCorona(glow, beam.x1, beam.y1, this.now, TRIM_CORONA);
      }
      if (this.lod.sparks) {
        TRIM_MOTES.seed = fnvHash(beam.id) % 9973;
        TRIM_MOTES.radius = radius * 0.9;
        TRIM_MOTES.color = recipe.color;
        TRIM_MOTES.size = Math.max(0.8, 1.1 * scale);
        TRIM_MOTES.alpha = 0.85 * life * extra;
        drawMotes(glow, beam.x1, beam.y1, this.now, TRIM_MOTES);
      }
    }
  }

  /**
   * Isinin kalan omru, 0..1. Taban degerler sunucunun ttl'leri: ikisi
   * ayrisinca isin hic tam parlakliga cikmiyordu (Oluler Bagi'nin halati
   * 120 ms gonderilip 180 ms'ye bolunuyordu: en fazla uc te iki).
   */
  private getBeamLife(beam: BeamSnapshot) {
    const base = BEAM_LIFE_BASE_MS[beam.definitionId] ?? 260;
    return clamp01((beam.ttlMs ?? base) / base);
  }

  private drawZeynepColumnBurst(beam: BeamSnapshot, color: number) {
    const graphics = this.beamGraphics;
    if (!graphics) {
      return;
    }

    const width = Math.max(6, beam.width);
    const centerX = (beam.x1 + beam.x2) / 2;
    const top = Math.min(beam.y1, beam.y2);
    const height = Math.abs(beam.y2 - beam.y1);
    // Sonme isinin kendi omrunden: eskiden `performance.now() % 620` idi, yani
    // sutun rastgele bir parlaklikta dogup ortasinda birden parlayabiliyordu.
    const fade = this.getBeamLife(beam);
    const tier = beam.tier ?? 1;

    for (const layer of COLUMN_LAYERS) {
      graphics.fillStyle(color, 0.12 * fade * layer);
      graphics.fillRect(centerX - (width * layer) / 2, top, width * layer, height);
    }

    graphics.fillStyle(0xfffbeb, 0.55 * fade);
    graphics.fillRect(centerX - width * 0.12, top, width * 0.24, height);
    // Rutbe trimi (ulti gucu): kenar 1'de acik altin, 2'de altin, 3'te beyaz altin.
    graphics.lineStyle(tier >= 2 ? 2.6 : 2, tier >= 2 ? getZeynepTrim(tier, color) : 0xfef3c7, 0.7 * fade);
    graphics.strokeRect(centerX - width / 2, top, width, height);
    if (tier >= 3 && !this.still) {
      const extra = this.ownBeam ? 1 : TEAMMATE_TRIM_ALPHA;
      const seedOffset = fnvHash(beam.id) % 997;
      if (this.lod.corona) {
        COLUMN_GLINTS.armBase = width * 0.3;
        COLUMN_GLINTS.armRange = width * 0.15;
        COLUMN_GLINTS.seedOffset = seedOffset;
        drawRunningGlints(graphics, centerX, top, centerX, top + height, this.now, COLUMN_GLINTS, fade * extra);
      }
      if (this.lod.sparks) {
        COLUMN_SPARKS.offset = width * 0.5;
        COLUMN_SPARKS.rise = width * 0.6;
        COLUMN_SPARKS.seedOffset = seedOffset;
        drawLineSparks(graphics, centerX, top, centerX, top + height, this.now, COLUMN_SPARKS, fade * extra);
      }
    }
  }

  private drawMelisRageWave(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(8, beam.width / 2);
    const life = clampRange((beam.ttlMs ?? 180) / 380, 0, 1);
    const pulse = 1 + Math.sin(this.now / 42) * 0.08;
    this.beamGraphics.fillStyle(color, 0.08 * life);
    fillDisc(this.beamGraphics, beam.x1, beam.y1, radius * pulse);
    this.beamGraphics.lineStyle(3 * this.getTowerEffectScale(), color, 0.75 * life);
    strokeRing(this.beamGraphics, beam.x1, beam.y1, radius * (1.02 - life * 0.18));
    this.beamGraphics.lineStyle(1.4 * this.getTowerEffectScale(), 0xfdf2f8, 0.62 * life);
    for (let index = 0; index < 10; index += 1) {
      const angle = (Math.PI * 2 * index) / 10 + this.now / 480;
      const inner = radius * 0.45;
      const outer = radius * (0.82 + (index % 3) * 0.04);
      this.beamGraphics.lineBetween(
        beam.x1 + Math.cos(angle) * inner,
        beam.y1 + Math.sin(angle) * inner,
        beam.x1 + Math.cos(angle) * outer,
        beam.y1 + Math.sin(angle) * outer
      );
    }
  }

  private drawMelisCursePulse(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(8, beam.width / 2);
    const life = clampRange((beam.ttlMs ?? 180) / 360, 0, 1);
    const isBurst = beam.definitionId === "archer-3-curse-burst";
    const isPool = beam.definitionId === "archer-3-curse-pool";
    const pulse = 1 + Math.sin(this.now / 58) * 0.06;
    if (!isPool) {
      this.beamGraphics.lineStyle(1.2 * this.getTowerEffectScale(), 0xf5d0fe, 0.48 * life);
      this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    }
    this.beamGraphics.fillStyle(color, isPool ? 0.18 * life : isBurst ? 0.13 * life : 0.08 * life);
    fillDisc(this.beamGraphics, beam.x2, beam.y2, radius * pulse);
    if (isBurst) {
      const now = this.now;
      this.beamGraphics.fillStyle(0x020617, 0.7 * life);
      fillDisc(this.beamGraphics, beam.x2, beam.y2, radius * 0.34);
      this.beamGraphics.lineStyle(5.2 * this.getTowerEffectScale(), 0xf0abfc, 0.78 * life);
      strokeRing(this.beamGraphics, beam.x2, beam.y2, radius * (1.34 - life * 0.24));
      this.beamGraphics.lineStyle(2.2 * this.getTowerEffectScale(), 0x7f1dff, 0.95 * life);
      for (let index = 0; index < 16; index += 1) {
        const angle = (Math.PI * 2 * index) / 16 + now / 380;
        const inner = radius * (0.2 + (index % 3) * 0.06);
        const mid = radius * (0.62 + (index % 4) * 0.09);
        const outer = radius * (1.08 + (index % 2) * 0.16);
        this.beamGraphics.lineBetween(
          beam.x2 + Math.cos(angle) * inner,
          beam.y2 + Math.sin(angle) * inner,
          beam.x2 + Math.cos(angle + 0.12) * mid,
          beam.y2 + Math.sin(angle + 0.12) * mid
        );
        this.beamGraphics.lineBetween(
          beam.x2 + Math.cos(angle + 0.12) * mid,
          beam.y2 + Math.sin(angle + 0.12) * mid,
          beam.x2 + Math.cos(angle - 0.08) * outer,
          beam.y2 + Math.sin(angle - 0.08) * outer
        );
      }
      this.beamGraphics.lineStyle(1.4 * this.getTowerEffectScale(), 0xfdf4ff, 0.72 * life);
      strokeRing(this.beamGraphics, beam.x2, beam.y2, radius * (0.54 + Math.sin(now / 40) * 0.05));
      return;
    }
    this.beamGraphics.lineStyle((isBurst || isPool ? 3 : 2) * this.getTowerEffectScale(), color, 0.78 * life);
    strokeRing(this.beamGraphics, beam.x2, beam.y2, radius * (1.05 - life * 0.22));
    this.beamGraphics.lineStyle(1.4 * this.getTowerEffectScale(), isPool ? 0xf0abfc : 0x020617, isPool ? 0.52 * life : 0.36 * life);
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8 + this.now / 520;
      const inner = radius * (isPool ? 0.12 : 0.22);
      const outer = radius * (isPool ? 0.9 : 0.72 + (index % 2) * 0.12);
      this.beamGraphics.lineBetween(
        beam.x2 + Math.cos(angle) * inner,
        beam.y2 + Math.sin(angle) * inner,
        beam.x2 + Math.cos(angle) * outer,
        beam.y2 + Math.sin(angle) * outer
      );
    }
    if (isPool) {
      this.beamGraphics.lineStyle(1 * this.getTowerEffectScale(), 0xd8b4fe, 0.38 * life);
      strokeRing(this.beamGraphics, beam.x2, beam.y2, radius * (0.58 + Math.sin(this.now / 94) * 0.04));
    }
  }

  private drawMelisWhisperWave(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(8, beam.width / 2);
    const life = clampRange((beam.ttlMs ?? 180) / 420, 0, 1);
    const now = this.now;
    const scale = this.getTowerEffectScale();
    const pulse = 1 + Math.sin(now / 34) * 0.07;
    this.beamGraphics.lineStyle(4.8 * scale, 0x020617, 0.58 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(2.2 * scale, 0xccfbf1, 0.82 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(1.1 * scale, 0xf0abfc, 0.62 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.fillStyle(0x14b8a6, 0.14 * life);
    fillDisc(this.beamGraphics, beam.x2, beam.y2, radius * 0.92 * pulse);
    this.beamGraphics.fillStyle(0x7c3aed, 0.075 * life);
    fillDisc(this.beamGraphics, beam.x2, beam.y2, radius * 1.26 * pulse);

    for (let ring = 0; ring < 3; ring += 1) {
      const ringRadius = radius * (0.48 + ring * 0.24 + Math.sin(now / 80 + ring) * 0.035);
      this.beamGraphics.lineStyle((3 - ring * 0.55) * scale, ring === 1 ? 0xf0abfc : color, (0.82 - ring * 0.18) * life);
      strokeRing(this.beamGraphics, beam.x2, beam.y2, ringRadius);
    }

    this.beamGraphics.lineStyle(1.5 * scale, 0xccfbf1, 0.74 * life);
    for (let index = 0; index < 14; index += 1) {
      const angle = (Math.PI * 2 * index) / 14 + Math.sin(now / 220 + index) * 0.32;
      const inner = radius * (0.22 + (index % 2) * 0.08);
      const outer = radius * (0.92 + (index % 4) * 0.09);
      this.beamGraphics.lineBetween(
        beam.x2 + Math.cos(angle) * inner,
        beam.y2 + Math.sin(angle) * inner,
        beam.x2 + Math.cos(angle) * outer,
        beam.y2 + Math.sin(angle) * outer
      );
    }
  }

  private drawMelisWhisperTurnShot(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const life = clampRange((beam.ttlMs ?? 180) / 180, 0, 1);
    const scale = this.getTowerEffectScale();
    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const wobble = Math.sin(this.now / 35) * 4 * scale;
    this.beamGraphics.lineStyle(5.2 * scale, 0x020617, 0.72 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(2.4 * scale, 0xc4b5fd, 0.88 * life);
    this.beamGraphics.lineBetween(beam.x1 + nx * wobble, beam.y1 + ny * wobble, beam.x2 - nx * wobble, beam.y2 - ny * wobble);
    this.beamGraphics.lineStyle(1.2 * scale, color, 0.72 * life);
    for (let index = 0; index < 5; index += 1) {
      const t = (index + 0.5) / 5;
      const x = lerp(beam.x1, beam.x2, t);
      const y = lerp(beam.y1, beam.y2, t);
      this.beamGraphics.lineBetween(x - nx * 7 * scale - ux * 3, y - ny * 7 * scale - uy * 3, x + nx * 7 * scale + ux * 3, y + ny * 7 * scale + uy * 3);
    }
  }

  private drawMelisWhisperSuicideBurst(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(12, beam.width / 2);
    const life = clampRange((beam.ttlMs ?? 380) / 380, 0, 1);
    const scale = this.getTowerEffectScale();
    const now = this.now;
    this.beamGraphics.fillStyle(0x7f1d1d, 0.16 * life);
    fillDisc(this.beamGraphics, beam.x1, beam.y1, radius * (0.62 + Math.sin(now / 40) * 0.04));
    this.beamGraphics.lineStyle(3.2 * scale, 0xef4444, 0.82 * life);
    strokeRing(this.beamGraphics, beam.x1, beam.y1, radius * 0.52);
    this.beamGraphics.lineStyle(1.8 * scale, color, 0.72 * life);
    for (let index = 0; index < 12; index += 1) {
      const angle = (Math.PI * 2 * index) / 12 + now / 300;
      const inner = radius * 0.18;
      const outer = radius * (0.42 + (index % 3) * 0.1);
      this.beamGraphics.lineBetween(
        beam.x1 + Math.cos(angle) * inner,
        beam.y1 + Math.sin(angle) * inner,
        beam.x1 + Math.cos(angle) * outer,
        beam.y1 + Math.sin(angle) * outer
      );
    }
  }

  private drawSympathyLink(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const scale = this.getTowerEffectScale();
    const width = Math.max(2, beam.width * scale);
    const pulse = 0.72 + Math.sin(this.now / 260) * 0.14;

    this.beamGraphics.lineStyle(width, 0x0f172a, 0.5);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(Math.max(1, width * 0.55), color, pulse);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);

    this.beamGraphics.fillStyle(color, pulse * 0.6);
    fillDisc(this.beamGraphics, beam.x1, beam.y1, Math.max(1.5, width * 0.6));
    fillDisc(this.beamGraphics, beam.x2, beam.y2, Math.max(1.5, width * 0.6));
  }

  private drawMelisUnderworldLink(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    // Taban sunucunun ttl'si: halat 120 ms gonderilip 180'e bolundugunde hic
    // tam parlakliga cikmiyordu (en fazla uc te iki).
    const life = this.getBeamLife(beam);
    const now = this.now;
    const width = Math.max(2, beam.width * this.getTowerEffectScale());
    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const pull = beam.definitionId === "archer-4-underworld-execute";
    this.beamGraphics.lineStyle((pull ? 4.4 : width) * this.getTowerEffectScale(), 0x020617, 0.86 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle((pull ? 2.4 : 1.6) * this.getTowerEffectScale(), color, 0.72 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(0.9 * this.getTowerEffectScale(), 0xf0fdfa, 0.38 * life);
    for (let index = 0; index < 5; index += 1) {
      const t = (index + ((now / 220) % 1)) / 5;
      const x = lerp(beam.x1, beam.x2, t);
      const y = lerp(beam.y1, beam.y2, t);
      const wave = Math.sin(now / 70 + index * 1.8) * 4 * this.getTowerEffectScale();
      this.beamGraphics.lineBetween(x - nx * (5 + wave), y - ny * (5 + wave), x + nx * (5 - wave), y + ny * (5 - wave));
    }

    if (pull) {
      const radius = Math.max(10, beam.width / 2);
      this.beamGraphics.fillStyle(color, 0.18 * life);
      fillDisc(this.beamGraphics, beam.x2, beam.y2, radius * (1.05 + Math.sin(now / 48) * 0.08));
      this.beamGraphics.lineStyle(2.2 * this.getTowerEffectScale(), 0xf0fdfa, 0.7 * life);
      strokeRing(this.beamGraphics, beam.x2, beam.y2, radius * (0.8 + life * 0.2));
    }
  }

  private drawMelisBrokenMirrorBurst(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(18, beam.width / 2);
    const life = clampRange((beam.ttlMs ?? 180) / 520, 0, 1);
    const now = this.now;
    const scale = this.getTowerEffectScale();
    const pulse = 1 + Math.sin(now / 32) * 0.05;
    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;

    this.beamGraphics.lineStyle(9 * scale, 0x020617, 0.82 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(5.4 * scale, 0xfdf4ff, 0.64 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(2.6 * scale, color, 0.92 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);

    this.beamGraphics.fillStyle(0xfdf4ff, 0.18 * life);
    fillDisc(this.beamGraphics, beam.x2, beam.y2, radius * 0.92 * pulse);
    this.beamGraphics.fillStyle(0xe879f9, 0.12 * life);
    fillDisc(this.beamGraphics, beam.x2, beam.y2, radius * 1.35 * pulse);
    this.beamGraphics.lineStyle(4.2 * scale, 0xfdf4ff, 0.92 * life);
    strokeRing(this.beamGraphics, beam.x2, beam.y2, radius * (0.82 - life * 0.1));
    this.beamGraphics.lineStyle(2.5 * scale, color, 0.86 * life);
    strokeRing(this.beamGraphics, beam.x2, beam.y2, radius * (1.18 - life * 0.16));

    this.beamGraphics.lineStyle(2.2 * scale, 0xf0abfc, 0.92 * life);
    for (let index = 0; index < 14; index += 1) {
      const angle = (Math.PI * 2 * index) / 14 + now / 260;
      const inner = radius * (0.18 + (index % 2) * 0.08);
      const outer = radius * (0.76 + (index % 5) * 0.13);
      this.beamGraphics.lineBetween(
        beam.x2 + Math.cos(angle) * inner,
        beam.y2 + Math.sin(angle) * inner,
        beam.x2 + Math.cos(angle) * outer,
        beam.y2 + Math.sin(angle) * outer
      );
    }

    this.beamGraphics.fillStyle(0xfdf4ff, 0.74 * life);
    for (let index = 0; index < 6; index += 1) {
      const t = (index + 1) / 7;
      const x = lerp(beam.x1, beam.x2, t);
      const y = lerp(beam.y1, beam.y2, t);
      const shard = (5 + (index % 3) * 2) * scale;
      this.beamGraphics.fillTriangle(
        x + nx * shard,
        y + ny * shard,
        x - nx * shard * 0.7,
        y - ny * shard * 0.7,
        x + dx / length * shard * 1.6,
        y + dy / length * shard * 1.6
      );
    }
  }

  /**
   * Zeynep'in kademe dili: renk degil, **rutbe** -- ve rutbe trimdir.
   *
   * Eskiden kademe 5'ten itibaren bandin tamami altina boyaniyordu; sunucunun
   * rengi (Gosteri pembesi, yanigin camgobegi, Abarti'nin karartmasi)
   * kayboluyor, kombo normal bir Gosteri atisi gibi gorunuyordu. Simdi govde
   * bantlari isinin kendi renginden (beyaza dogru acilarak), kademe yalnizca
   * trimi degistiriyor: ikinci perde, kiymiklar ve zerreler altin (5) ya da
   * beyaz altin (10).
   */
  private getZeynepTierPalette(tier: number, base: number) {
    const trim = getZeynepTrim(tier, base);
    if (tier >= 3) return { band: base, mid: liftToWhite(base, 0.5), inner: liftToWhite(base, 0.86), core: 0xffffff, shard: 0xfffbeb, trim };
    if (tier >= 2) return { band: base, mid: liftToWhite(base, 0.38), inner: liftToWhite(base, 0.8), core: 0xffffff, shard: trim, trim };
    return { band: base, mid: liftToWhite(base, 0.3), inner: liftToWhite(base, 0.85), core: 0xffffff, shard: liftToWhite(base, 0.85), trim };
  }

  private drawShowcaseMotes(beam: BeamSnapshot, tone: number, life: number) {
    const graphics = this.beamGraphics;
    if (!graphics) {
      return;
    }

    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    // Isin sonerken zerreler aciliyor: omur 1'den 0'a inerken acilma 0'dan 1'e.
    const drift = 1 - life;
    const scale = this.getTowerEffectScale();

    // Tohum kimligin FNV ozeti: eskiden `beam.id.length` idi ve ayni uzunluktaki
    // her isin ayni zerreleri ayni yere dokuyordu.
    for (let index = 0; index < SHOWCASE_MOTE_COUNT; index += 1) {
      const a = fnvUnit(beam.id, index * 2 + 1);
      const b = fnvUnit(beam.id, index * 2 + 2);
      const along = (0.06 + a * 0.88) * length;
      const side = index % 2 === 0 ? 1 : -1;
      const spread = beam.width * (0.4 + b * 0.34) + drift * (9 + b * 15) * scale;
      const x = beam.x1 + ux * along + nx * side * spread;
      const y = beam.y1 + uy * along + ny * side * spread;
      graphics.fillStyle(index % 3 === 0 ? 0xffffff : tone, 0.7 * life * (1 - drift * 0.45));
      fillDisc(graphics, x, y, Math.max(0.7, 1.9 * (1 - drift * 0.5) * scale));
    }
  }

  /** Gosteri isininin bir bandi: ortasi sisik alti koseli serit ve iki uc. */
  private fillShowcaseBand(beam: BeamSnapshot, ux: number, uy: number, nx: number, ny: number, pulse: number, width: number, bandColor: number, alpha: number, inset: number) {
    const graphics = this.beamGraphics;
    if (!graphics) return;
    const startX = beam.x1 + ux * inset;
    const startY = beam.y1 + uy * inset;
    const endX = beam.x2 - ux * inset;
    const endY = beam.y2 - uy * inset;
    const clampedWidth = Math.min(width, beam.width);
    const halfStart = clampedWidth * 0.42;
    const halfMid = width * 0.5;
    const halfEnd = clampedWidth * 0.42;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;

    const band = this.points(6);
    BeamRenderer.setPoint(band, 0, startX + nx * halfStart, startY + ny * halfStart);
    BeamRenderer.setPoint(band, 1, midX + nx * halfMid, midY + ny * halfMid);
    BeamRenderer.setPoint(band, 2, endX + nx * halfEnd, endY + ny * halfEnd);
    BeamRenderer.setPoint(band, 3, endX - nx * halfEnd, endY - ny * halfEnd);
    BeamRenderer.setPoint(band, 4, midX - nx * halfMid, midY - ny * halfMid);
    BeamRenderer.setPoint(band, 5, startX - nx * halfStart, startY - ny * halfStart);
    graphics.fillStyle(bandColor, alpha * pulse);
    graphics.fillPoints(band, true);
    fillDisc(graphics, startX, startY, halfStart);
    fillDisc(graphics, endX, endY, halfEnd);
  }

  private drawShowcaseBeam(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const life = clampRange((beam.ttlMs ?? 130) / 260, 0, 1);
    const flash = clampRange((life - 0.22) / 0.78, 0, 1);
    const afterglow = clampRange(life / 0.82, 0, 1);
    const pulse = 0.9 + Math.sin(this.now / 34) * 0.08;

    const tier = beam.tier ?? 1;
    const palette = this.getZeynepTierPalette(tier, color);

    // Kademe 5: gosterinin ikinci perdesi.
    //
    // Ilk vurus sonmeye baslarken arkasindan daha genis ve cok daha soluk bir
    // bant geciyor -- ayni isin degil, ayni isin bir daha. Kademeyi zamanla
    // anlatmak, isini kalinlastirmadan ona bir agirlik veriyor.
    if (tier >= 2) {
      const encore = clampRange((0.74 - life) / 0.52, 0, 1) * clampRange(life / 0.22, 0, 1);
      if (encore > 0) {
        // Ikinci perde rutbe renginde: govde isinin rengi, perde trim.
        this.fillShowcaseBand(beam, ux, uy, nx, ny, pulse, beam.width * (1 + 0.3 * encore), palette.trim, 0.24 * encore, 0);
      }
    }

    this.fillShowcaseBand(beam, ux, uy, nx, ny, pulse, beam.width, palette.band, 0.2 * afterglow, 0);
    this.fillShowcaseBand(beam, ux, uy, nx, ny, pulse, beam.width * 0.74, palette.mid, 0.36 * afterglow, 2);
    this.fillShowcaseBand(beam, ux, uy, nx, ny, pulse, beam.width * 0.48, palette.inner, 0.62 * flash + 0.18 * afterglow, 5);
    this.fillShowcaseBand(beam, ux, uy, nx, ny, pulse, beam.width * 0.24, palette.core, 0.96 * flash, 8);

    for (let index = 0; index < 7; index += 1) {
      const t = (index + 1) / 8;
      const normalizedHash = fnvUnit(beam.id, 101 + index);
      const side = index % 2 === 0 ? 1 : -1;
      const centerX = beam.x1 + dx * t;
      const centerY = beam.y1 + dy * t;
      const halfHeight = beam.width * (0.18 + normalizedHash * 0.18);
      const halfLength = 3 + normalizedHash * 7;
      const offset = side * Math.min(beam.width * 0.28, beam.width * (0.12 + normalizedHash * 0.16));
      this.beamGraphics.fillStyle(index % 3 === 0 ? palette.core : palette.shard, 0.5 * flash);
      const shard = this.points(4);
      BeamRenderer.setPoint(shard, 0, centerX - ux * halfLength + nx * offset, centerY - uy * halfLength + ny * offset);
      BeamRenderer.setPoint(shard, 1, centerX + nx * (offset + side * halfHeight), centerY + ny * (offset + side * halfHeight));
      BeamRenderer.setPoint(shard, 2, centerX + ux * halfLength + nx * offset, centerY + uy * halfLength + ny * offset);
      BeamRenderer.setPoint(shard, 3, centerX + nx * (offset - side * halfHeight * 0.55), centerY + ny * (offset - side * halfHeight * 0.55));
      this.beamGraphics.fillPoints(shard, true);
    }

    this.beamGraphics.fillStyle(palette.core, 0.88 * flash);
    fillDisc(this.beamGraphics, beam.x1, beam.y1, beam.width * 0.32);
    this.beamGraphics.fillStyle(palette.shard, 0.42 * afterglow);
    fillDisc(this.beamGraphics, beam.x2, beam.y2, beam.width * 0.28);
    if (tier >= 3 && this.lod.sparks && !this.still) {
      this.drawShowcaseMotes(beam, palette.trim, afterglow);
    }
    // Dugum cekirdek bandinin kalinliginda ve isinin omrunde bir tur.
    ACCENT_AXIS.axisWidth = beam.width * 0.24;
    ACCENT_AXIS.lifeMs = 260;
    this.drawBeamTierAccent(beam, color, ACCENT_AXIS);
  }

  /**
   * Taht'in Kin gosterisi: gercek 60 derecelik koni.
   *
   * Eskiden koni ~52 derece cizilip 60 derecede vuruyordu ve kademe 5'te
   * hicbir sey degismiyordu. Simdi yari genislik isinin genisliginin yarisi
   * (sunucu genisligi koninin gercek acisindan yaziyor). Kizil govde kaliyor:
   * - Ferman (1): kizil koni ve bes isik cizgisi.
   * - Nisan (2): koninin iki kenarinda disa bakan altin seritler ve
   *   gecikmeli altin ikinci kenar (encore).
   * - Regalya (3): koninin ucunda mum muhur, yaldiz zerreler, eksen dugumu.
   * Hattaki her dusmanin spot isigi `ZeynepSignatureVfx`te.
   */
  private drawKinShowcaseLight(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const life = clampRange((beam.ttlMs ?? 260) / 260, 0, 1);
    const flash = clampRange((life - 0.18) / 0.82, 0, 1);
    // Gercek koni: yari genislik isinin genisliginin yarisi.
    const spread = beam.width / 2;
    const coreWidth = Math.max(5, Math.min(18, beam.width * 0.18));
    const pulse = this.still ? 1 : 0.92 + Math.sin(this.now / 30) * 0.08;
    const tier = beam.tier ?? 1;
    const trim = getZeynepTrim(tier, color);
    const court = getCourtTier(getBeamVfxProfile(beam.definitionId, color), tier);
    const extra = this.ownBeam ? 1 : TEAMMATE_TRIM_ALPHA;
    const scale = this.getTowerEffectScale();

    const cone = this.points(3);
    BeamRenderer.setPoint(cone, 0, beam.x1, beam.y1);
    BeamRenderer.setPoint(cone, 1, beam.x2 + nx * spread, beam.y2 + ny * spread);
    BeamRenderer.setPoint(cone, 2, beam.x2 - nx * spread, beam.y2 - ny * spread);
    this.beamGraphics.fillStyle(color, 0.18 * life);
    this.beamGraphics.fillPoints(cone, true);

    for (let index = -2; index <= 2; index += 1) {
      const ratio = index / 2;
      const endX = beam.x2 + nx * spread * ratio * 0.92;
      const endY = beam.y2 + ny * spread * ratio * 0.92;
      const width = coreWidth * (index === 0 ? 1.35 : 0.72);
      const alpha = (index === 0 ? 0.88 : 0.42) * flash * pulse;
      this.beamGraphics.lineStyle(width + 4, color, 0.3 * life);
      this.beamGraphics.lineBetween(beam.x1, beam.y1, endX, endY);
      this.beamGraphics.lineStyle(Math.max(2, width), index === 0 ? 0xfff1f2 : 0xfca5a5, alpha);
      this.beamGraphics.lineBetween(beam.x1, beam.y1, endX, endY);
    }
    // Koninin kenarlari: vurdugu alan tam bu.
    this.beamGraphics.lineStyle(Math.max(1, 1.4 * scale), liftToWhite(color, 0.35), 0.85 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2 + nx * spread, beam.y2 + ny * spread);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2 - nx * spread, beam.y2 - ny * spread);

    if (court?.chevrons) {
      // Nisan: kenarlarda disa bakan altin seritler.
      for (const side of CONE_SIDES) {
        const ex = beam.x2 + nx * spread * side;
        const ey = beam.y2 + ny * spread * side;
        const edgeAngle = Math.atan2(ey - beam.y1, ex - beam.x1);
        const out = edgeAngle + side * Math.PI / 2;
        for (const t of CONE_CHEVRON_STOPS) {
          drawChevron(this.beamGraphics, beam.x1 + (ex - beam.x1) * t, beam.y1 + (ey - beam.y1) * t, out, Math.max(3, 3.6 * scale), Math.max(1, 1.1 * scale), trim, 0.95 * life);
        }
      }
      if (court.encore && this.lod.secondBeatRing && life < 0.7) {
        // Ikinci perde: biraz daha genis, soluk altin kenar.
        const encore = clamp01((0.7 - life) / 0.5) * clamp01(life / 0.2);
        const wide = spread * 1.12;
        const glow = this.glowGraphics ?? this.beamGraphics;
        glow.lineStyle(Math.max(1, 1.6 * scale), trim, 0.5 * encore);
        glow.lineBetween(beam.x1, beam.y1, beam.x2 + nx * wide, beam.y2 + ny * wide);
        glow.lineBetween(beam.x1, beam.y1, beam.x2 - nx * wide, beam.y2 - ny * wide);
      }
    }

    this.beamGraphics.fillStyle(0xfff1f2, 0.86 * flash);
    fillDisc(this.beamGraphics, beam.x1, beam.y1, Math.max(5, coreWidth * 0.7));
    if (court?.seal) {
      // Regalya: koninin ucunda muhur; yaldiz zerreler koninin icinde.
      drawWaxSeal(this.beamGraphics, beam.x2, beam.y2, 3 * scale, darkenColor(color), trim, life * extra);
      if (this.lod.sparks && !this.still) {
        TRIM_MOTES.seed = fnvHash(beam.id) % 9973;
        TRIM_MOTES.radius = spread * 0.6;
        TRIM_MOTES.color = trim;
        TRIM_MOTES.size = Math.max(0.8, 1 * scale);
        TRIM_MOTES.alpha = 0.85 * life * extra;
        drawMotes(this.glowGraphics ?? this.beamGraphics, beam.x1 + dx * 0.7, beam.y1 + dy * 0.7, this.now, TRIM_MOTES);
      }
    } else {
      this.beamGraphics.fillStyle(0xffe4e6, 0.48 * life);
      fillDisc(this.beamGraphics, beam.x2, beam.y2, Math.max(4, Math.min(8, spread * 0.08)));
    }
    // Kin gosterisi de disa acilir: eksen filamani evet, kenar raylari hayir.
    // Dugum koninin genisligine degil eksen cizgisine gore: eskiden 20-30
    // birimlik beyaz bir disk oluyordu.
    ACCENT_AXIS.axisWidth = coreWidth * 0.6;
    ACCENT_AXIS.lifeMs = 260;
    this.drawBeamTierAccent(beam, color, ACCENT_AXIS);
  }

  /**
   * Taht'in ayna mizragi: sekmesi gorunen, gercek genislikte.
   *
   * Eskiden kuyruktan basa duz bir kiris ciziliyordu: isin kosede sektiginde
   * kiris koseyi kesiyordu ve sekme hic gorunmuyordu; govde ~6 birimdi, isin
   * 10 + dusman yaricapi icinde vuruyor. Simdi yol kuyruk -> sunucunun sekme
   * koseleri (`b`) -> bas; govdenin zarfi isinin genisliginde (vurdugu bant),
   * ucta mizrak basi. Isinin rengi sunucudan (Abarti koyulastirmasi dahil).
   * - Ferman (1): duz govde, zarf ve mizrak basi.
   * - Nisan (2): omuzlar ADD'de, govde boyunca basa kosan altin seritler.
   * - Regalya (3): beyaza cekilmis file (ton omuzlarda), kosan parlamalar.
   * Sekmenin kendi isareti (duvarda parlama, nisan, muhur) `ZeynepSignatureVfx`te.
   */
  private drawMirrorSpear(beam: BeamSnapshot, color: number) {
    const g = this.beamGraphics;
    if (!g) return;
    const glow = this.glowGraphics ?? g;
    const tier = beam.tier ?? 1;
    const scale = this.getTowerEffectScale();
    const extra = this.ownBeam ? 1 : TEAMMATE_TRIM_ALPHA;
    const trim = getZeynepTrim(tier, color);
    const count = fillRayPath(beam, RAY_POINTS);
    const width = Math.max(4, beam.width);
    SPEAR_PROFILE.body = Math.max(1.6, width * 0.3);
    SPEAR_PROFILE.spread = width * 0.45;
    let total = 0;
    for (let index = 0; index + 1 < count; index += 1) {
      const a = RAY_POINTS[index];
      const b = RAY_POINTS[index + 1];
      total += Math.hypot(b.x - a.x, b.y - a.y);
      // Zarf: isinin gercek genisligi, soluk.
      g.lineStyle(width, color, 0.14);
      g.lineBetween(a.x, a.y, b.x, b.y);
      strokeProfile(g, a.x, a.y, b.x, b.y, color, tier, SPEAR_PROFILE, glow);
    }
    // Sekme koselerinde birlesme: kirik cizgi kopuk durmasin.
    g.fillStyle(color, 0.82);
    for (let index = 1; index + 1 < count; index += 1) fillDisc(g, RAY_POINTS[index].x, RAY_POINTS[index].y, SPEAR_PROFILE.body * 0.5);

    // Mizrak basi: son parcanin yonunde.
    const head = RAY_POINTS[count - 1];
    const neck = RAY_POINTS[count - 2];
    const hx = head.x - neck.x;
    const hy = head.y - neck.y;
    const hl = Math.max(1, Math.hypot(hx, hy));
    const ux = hx / hl;
    const uy = hy / hl;
    const tip = width * 0.85;
    const half = width * 0.42;
    g.fillStyle(tier >= 2 ? liftToWhite(color, 0.45) : liftToWhite(color, 0.2), 0.95);
    g.fillTriangle(head.x + ux * tip, head.y + uy * tip, head.x - uy * half, head.y + ux * half, head.x + uy * half, head.y - ux * half);

    if (tier >= 2 && total > 4) {
      // Nisan: govde boyunca basa kosan altin seritler (hareket azaltmada yerinde).
      const chevrons = 3;
      for (let index = 0; index < chevrons; index += 1) {
        const phase = this.still ? (index + 0.5) / chevrons : (index / chevrons + this.now / 600) % 1;
        const point = this.pointAlong(count, total * phase);
        drawChevron(g, point.x, point.y, point.angle, Math.max(3, width * 0.45), Math.max(1, 1.1 * scale), trim, 0.9);
      }
    }
    if (tier >= 3 && !this.still && this.lod.corona) {
      SPEAR_GLINTS.haloColor = color;
      SPEAR_GLINTS.armBase = 3 * scale;
      SPEAR_GLINTS.armRange = 2 * scale;
      SPEAR_GLINTS.seedOffset = fnvHash(beam.id) % 997;
      for (let index = 0; index + 1 < count; index += 1) {
        drawRunningGlints(glow, RAY_POINTS[index].x, RAY_POINTS[index].y, RAY_POINTS[index + 1].x, RAY_POINTS[index + 1].y, this.now, SPEAR_GLINTS, extra);
      }
    }
  }

  /** Mizrak yolunda `distance` uzakliktaki nokta ve yon; karede nesne yok. */
  private readonly along = { x: 0, y: 0, angle: 0 };
  private pointAlong(count: number, distance: number) {
    let remaining = distance;
    for (let index = 0; index + 1 < count; index += 1) {
      const a = RAY_POINTS[index];
      const b = RAY_POINTS[index + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (remaining <= length || index + 2 === count) {
        const t = length > 0 ? Math.min(1, remaining / length) : 0;
        this.along.x = a.x + (b.x - a.x) * t;
        this.along.y = a.y + (b.y - a.y) * t;
        this.along.angle = Math.atan2(b.y - a.y, b.x - a.x);
        return this.along;
      }
      remaining -= length;
    }
    this.along.x = RAY_POINTS[0].x;
    this.along.y = RAY_POINTS[0].y;
    this.along.angle = 0;
    return this.along;
  }

  /**
   * Taht'in yanik izi: duz bir serit degil, yanan bir hat.
   *
   * Eskiden kahverengi uc cizgilik sabit bir seritti ve tek degisimi
   * sv 10'da uzerinde kayan beyaz bir topti. Govde yanigin camgobegi
   * (sunucunun rengi), hasar tikiyle (333 oyun ms) nefes aliyor; hat
   * boyunca korlar akiyor. Zarf yanigin gercek yaricapinda.
   * - Ferman (1): camgobegi govde, tikle parlayan cekirdek, akan korlar.
   * - Nisan (2): iki kenarda altin seritler; tikte ikinci parlama.
   * - Regalya (3): iki ucta mum muhur, yaldiz zerreler; son 320 ms'de hat
   *   uclarindan ortasina kapanir (ferman muhurlenir).
   * Hareket azaltma: kor akmiyor, nefes yok, kapanma yok; yalnizca soner.
   */
  private drawSynthesisBurnTrail(beam: BeamSnapshot, color: number) {
    const g = this.beamGraphics;
    if (!g) {
      return;
    }

    const remaining = beam.ttlMs ?? 0;
    const life = clampRange(remaining / 3000, 0, 1);
    const fadeIn = clampRange(life / 0.08, 0, 1);
    const tier = beam.tier ?? 1;
    const court = getCourtTier(getBeamVfxProfile(beam.definitionId, color), tier);
    const trim = getZeynepTrim(tier, color);
    const extra = this.ownBeam ? 1 : TEAMMATE_TRIM_ALPHA;
    const scale = this.getTowerEffectScale();
    const seed = fnvHash(beam.id) % 997;
    let x1 = beam.x1;
    let y1 = beam.y1;
    let x2 = beam.x2;
    let y2 = beam.y2;
    // Regalya: son 320 ms'de hat uclarindan ortasina kapaniyor.
    const snap = court?.snap && !this.still ? clamp01(1 - remaining / 320) : 0;
    if (snap > 0) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const k = snap * snap;
      x1 += (mx - x1) * k;
      y1 += (my - y1) * k;
      x2 += (mx - x2) * k;
      y2 += (my - y2) * k;
    }
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const width = Math.max(5, beam.width * 0.34);
    // Tik nabzi: hasar tiki ritminde parlayip soner. Ortak saat: N iz ayni anda
    // nabiz atiyor (saniyede ~2.4), her izin kendi fazinda 2.4N degil.
    const tick = this.still ? 0 : Math.pow(1 - ((this.now % BURN_TICK_MS) / BURN_TICK_MS), 3);
    const alpha = fadeIn * Math.max(0.25, life);

    // Zarf: yanigin gercek alani (soluk).
    g.lineStyle(Math.max(width, beam.width * 0.9), color, 0.07 * alpha);
    g.lineBetween(x1, y1, x2, y2);
    g.lineStyle(width + 4, 0x082f49, 0.32 * alpha);
    g.lineBetween(x1, y1, x2, y2);
    g.lineStyle(width, color, (0.5 + tick * 0.2) * alpha);
    g.lineBetween(x1, y1, x2, y2);
    g.lineStyle(Math.max(1.5, width * 0.38), liftToWhite(color, 0.55), (0.35 + tick * 0.45) * alpha);
    g.lineBetween(x1, y1, x2, y2);

    if (this.lod.corona) {
      // Akan korlar: hat boyunca ileri kayan kisa cizgiler.
      const embers = 6;
      g.lineStyle(Math.max(0.8, 1.1 * scale), liftToWhite(color, 0.75), 0.7 * alpha);
      for (let index = 0; index < embers; index += 1) {
        const phase = this.still ? (index + 0.5) / embers : (index / embers + hashNoise(seed + index) * 0.08 + this.now / 1600) % 1;
        const along = phase * length;
        const side = (hashNoise(seed + index * 3 + 1) - 0.5) * width * 0.7;
        const px = x1 + ux * along + nx * side;
        const py = y1 + uy * along + ny * side;
        g.lineBetween(px, py, px - ux * 4 * scale, py - uy * 4 * scale);
      }
    }

    if (court?.chevrons) {
      // Nisan: iki kenarda altin seritler; tikte ikinci parlama.
      const count = Math.max(2, Math.min(8, Math.floor(length / 22)));
      const edge = width * 0.5 + 3 * scale;
      const chevronAlpha = (0.75 + (court.encore ? tick * 0.25 : 0)) * alpha;
      const angle = Math.atan2(uy, ux);
      for (let index = 0; index < count; index += 1) {
        const t = (index + 0.5) / count;
        const px = x1 + dx * t;
        const py = y1 + dy * t;
        drawChevron(g, px + nx * edge, py + ny * edge, angle, Math.max(3, 3.4 * scale), Math.max(1, 1 * scale), trim, chevronAlpha);
        drawChevron(g, px - nx * edge, py - ny * edge, angle, Math.max(3, 3.4 * scale), Math.max(1, 1 * scale), trim, chevronAlpha);
      }
    }
    if (court?.seal) {
      const sealAlpha = alpha * extra;
      drawWaxSeal(g, x1, y1, 3 * scale, darkenColor(color), trim, sealAlpha);
      drawWaxSeal(g, x2, y2, 3 * scale, darkenColor(color), trim, sealAlpha);
      if (this.lod.sparks && !this.still) {
        BURN_MOTES.seed = seed;
        BURN_MOTES.radius = Math.min(length * 0.45, 40 * scale);
        BURN_MOTES.color = trim;
        BURN_MOTES.size = Math.max(0.7, 0.9 * scale);
        BURN_MOTES.alpha = 0.8 * sealAlpha;
        drawMotes(this.glowGraphics ?? g, (x1 + x2) / 2, (y1 + y2) / 2, this.now, BURN_MOTES);
      }
    }
  }

  /**
   * Ucube'nin zinciri: tek ton ailesinde (limon -> yesil -> beyaza yakin
   * limon), her 60 ms'de yeniden tohumlanan simsek.
   *
   * Eskiden govdesi gok mavisi ve beyazdi (mermi limon, kule mavi-siyah:
   * uc ayri kimlik). Govde isinin kendi rengi (sunucu Ucube limonunu
   * gonderiyor); kademe trim ekliyor:
   * - Ham (sv 1-4): tek duz kirikli yol, uc noktasi.
   * - Derlenmis (sv 5-9): rampanin ikinci duraginda omuzlar (ADD), beyaza
   *   cekilmis cekirdek yol, bir catal ve ucta terminal yesili ayraclar.
   * - Asiri yukleme (sv 10): beyaz-sicak cekirdek, yol boyunca kosan
   *   parlamalar ve uctan dokulen kod kivilcimlari.
   *
   * Hareket azaltmada simsek yeniden tohumlanmiyor; tohum yalnizca kimlikten.
   */
  private drawChainLightning(beam: BeamSnapshot, color: number) {
    const graphics = this.beamGraphics;
    if (!graphics) {
      return;
    }

    const segments = 7;
    const points = this.points(segments + 1);
    // Tohum kimligin FNV ozeti ve 60 ms'lik bir kusak: eskiden tohum
    // `beam.id.length` idi ve her zincir ayni sabit zikzagi ciziyordu.
    const seed = (fnvHash(beam.id) % 9973) + (this.still ? 0 : Math.floor(this.now / CHAIN_RESEED_MS) * 17);
    const visualScale = this.getTowerEffectScale();
    fillJaggedPath(points, beam.x1, beam.y1, beam.x2, beam.y2, segments, seed, 13 * Math.max(0.6, visualScale));

    const tier = beam.tier ?? 1;
    const profile = getBeamVfxProfile(beam.definitionId, color);
    const recipe = getVfxTier(profile, tier);
    const extra = this.ownBeam ? 1 : TEAMMATE_TRIM_ALPHA;
    const life = clamp01((beam.ttlMs ?? CHAIN_LIFE_MS) / 60);
    const glow = this.glowGraphics ?? graphics;
    const body = Math.max(1.2, (beam.width - 1) * visualScale);

    if (tier >= 2) {
      // Omuzlar ADD katmaninda, rampanin duraginda: tek renk ailesi.
      strokePolyline(glow, points, segments + 1, body + 7 * visualScale, recipe.color, 0.14 * life);
      strokePolyline(glow, points, segments + 1, body + 3 * visualScale, recipe.color, 0.3 * life);
    }
    strokePolyline(graphics, points, segments + 1, body, color, 0.95 * life);
    if (tier >= 2) {
      strokePolyline(graphics, points, segments + 1, Math.max(0.6, body * 0.36), liftToWhite(recipe.color, tier >= 3 ? 0.9 : 0.6), 0.95 * life);
      // Catal: yolun ortasindan kisa bir kol, ayni tohumdan.
      const fork = points[3];
      const side = hashNoise(seed + 41) > 0.5 ? 1 : -1;
      const dx = beam.x2 - beam.x1;
      const dy = beam.y2 - beam.y1;
      const length = Math.max(1, Math.hypot(dx, dy));
      const reach = Math.min(18, length * 0.35) * Math.max(0.6, visualScale);
      graphics.lineStyle(Math.max(0.6, body * 0.5), recipe.color, 0.8 * life);
      graphics.lineBetween(fork.x, fork.y, fork.x + (dx / length) * reach * 0.6 - (dy / length) * reach * side, fork.y + (dy / length) * reach * 0.6 + (dx / length) * reach * side);
      drawBracketCorners(graphics, beam.x2, beam.y2, 5 * visualScale, 5 * visualScale, 2.2 * visualScale, Math.max(0.6, 0.8 * visualScale), ATAKAN_ACCENT, 0.85 * life);
    }

    graphics.fillStyle(tier >= 2 ? liftToWhite(recipe.color, 0.6) : color, 0.9 * life);
    fillDisc(graphics, beam.x2, beam.y2, (tier >= 3 ? 3.4 : 2.8) * visualScale);

    if (tier >= 3 && !this.still) {
      if (this.lod.corona) {
        CHAIN_GLINTS.armBase = 3 * visualScale;
        CHAIN_GLINTS.armRange = 2 * visualScale;
        CHAIN_GLINTS.haloColor = recipe.color;
        CHAIN_GLINTS.haloRadius = 2.2 * visualScale;
        CHAIN_GLINTS.coreRadius = 1 * visualScale;
        CHAIN_GLINTS.seedOffset = fnvHash(beam.id) % 997;
        drawRunningGlints(graphics, beam.x1, beam.y1, beam.x2, beam.y2, this.now, CHAIN_GLINTS, life * extra);
      }
      if (this.lod.sparks) {
        CHAIN_CODE.seed = fnvHash(beam.id) % 7919;
        CHAIN_CODE.radius = 6 * visualScale;
        CHAIN_CODE.rise = 7 * visualScale;
        CHAIN_CODE.color = recipe.color;
        CHAIN_CODE.size = Math.max(0.8, 1.3 * visualScale);
        CHAIN_CODE.alpha = 0.9 * life * extra;
        drawCodeSparks(glow, beam.x2, beam.y2, this.now, CHAIN_CODE);
      }
    }
  }

  private drawEnemyShot(beam: BeamSnapshot, color: number) {
    const graphics = this.beamGraphics;
    if (!graphics) {
      return;
    }
    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.hypot(dx, dy);
    if (length < 1) {
      return;
    }
    const stepLength = 9;
    const steps = Math.max(1, Math.floor(length / stepLength));
    graphics.lineStyle(Math.max(1, beam.width), color, 0.85);
    for (let i = 0; i < steps; i += 2) {
      const from = i / steps;
      const to = Math.min(1, (i + 1) / steps);
      graphics.lineBetween(
        beam.x1 + dx * from,
        beam.y1 + dy * from,
        beam.x1 + dx * to,
        beam.y1 + dy * to
      );
    }
    // Carpma noktasi: hasarin nereye dustugunu tek isaret eden sey.
    graphics.fillStyle(color, 0.9);
    fillDisc(graphics, beam.x2, beam.y2, 3);
  }


  /* ---------------------------------------------------------------- */
  /* Debug Lazer: ortak kitin ustunde, eskisinden ayirt edilemez.       */
  /* tests/vfx-kit-laser-identity.test.mjs her cagriyi karsilastiriyor. */
  /* ---------------------------------------------------------------- */

  /**
   * Govde renginin beyaza cekilmis hali (kit: `liftToWhite`).
   *
   * Tumuyle beyaz bir cekirdek isini beyaz gosteriyor; tumuyle renkli bir
   * cekirdek ise sicakligi kaybediyor. Aradaki karisim ikisini de veriyor --
   * kirmizi isinin ortasi acik kirmizi, mavininki acik mavi, beyazinki beyaz.
   */
  private getBeamCoreColor(color: number, whiteness = 0.5) {
    return liftToWhite(color, whiteness);
  }

  /**
   * Isinin kesiti (kit: `strokeProfile`). Kademe yukseldikce yumusuyor ve
   * genisliyor: kirmizi duz, mavide hare ve isinan merkez, beyazda ayni hare
   * daha genis. Yumusaklik katman sayisindan geliyor; rengi omuzlar ve govde
   * tasiyor, beyaz olan yalnizca en icteki ince file.
   */
  private strokeBeamProfile(beam: BeamSnapshot, color: number, options: { spread: number; body: number }) {
    const graphics = this.beamGraphics;
    if (!graphics) {
      return;
    }
    strokeProfile(graphics, beam.x1, beam.y1, beam.x2, beam.y2, color, beam.tier ?? 1, options);
  }

  /** Vurus noktasinin rengi: kirmizi kademede duz govde rengi, ustunde sicak. */
  private getBeamImpactColor(beam: BeamSnapshot, color: number) {
    return (beam.tier ?? 1) < 2 ? color : this.getBeamCoreColor(color, 0.86);
  }

  private drawLaserConnection(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    this.strokeBeamProfile(beam, color, { spread: 8, body: Math.max(2, beam.width) });
    // Carpma noktasi kirisin en sicak yeri, ama yalnizca nokta: cevresine
    // renkli bir bulut konmuyor. Bulut kirisin ucunu kalinlastirip vurusun
    // nereye dustugunu bulaniklastiriyordu.
    //
    // Kirmizi kademede nokta da duz: govdenin gradyani yokken ucunda beyaz bir
    // parlama olsa, kaldirilan gecis oradan geri girerdi.
    this.beamGraphics.fillStyle(this.getBeamImpactColor(beam, color), 0.95);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, 3.4);
    this.beamGraphics.fillStyle(color, 0.22);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, 13);
    // Dis hale govdeden 8 birim genis; vurgu onun disina oturmali.
    ACCENT_OUTER.outerWidth = beam.width + 8;
    this.drawBeamTierAccent(beam, color, ACCENT_OUTER);
  }

  private drawOverdriveBeam(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const core = this.getBeamCoreColor(color, 0.86);
    this.strokeBeamProfile(beam, color, { spread: 14, body: Math.max(3, beam.width) });
    this.beamGraphics.lineStyle(1, color, 0.65);
    this.beamGraphics.strokeCircle(beam.x1, beam.y1, 19);
    this.beamGraphics.fillStyle(color, 0.35);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, 11);
    this.beamGraphics.fillStyle(core, 1);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, 5.5);
    // Ucta hare yok, yalnizca sicak nokta; kural asiri yuklemede de ayni.
    this.beamGraphics.fillStyle(this.getBeamImpactColor(beam, color), 0.9);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, 4);
    const tier = beam.tier ?? 1;
    ACCENT_OUTER.outerWidth = beam.width + 14;
    this.drawBeamTierAccent(beam, color, ACCENT_OUTER);
    if (tier >= 3) {
      this.drawOverdriveFlare(beam);
    }
  }

  /**
   * Onuncu seviyede asiri yuklemenin cevresi: hale, kosan parlamalar,
   * kenardan dokulen kivilcimlar ve namlu cakmasi -- hepsi kitten, lazerin
   * kendi sayilariyla (`LASER_*`). Kiris kalinlasmiyor; "en ust seviye"
   * hissi ayni cizginin daha canli, daha katmanli olmasindan geliyor.
   *
   * Hicbirinin durumu tutulmuyor: her sey sahne saatinden ve indeksten
   * tureyen deterministik bir gurultuyle ciziliyor.
   */
  private drawOverdriveFlare(beam: BeamSnapshot) {
    const graphics = this.beamGraphics;
    if (!graphics) {
      return;
    }
    const now = this.time.now;
    OVERDRIVE_CORONA.base = beam.width + 6;
    drawCorona(graphics, beam.x1, beam.y1, beam.x2, beam.y2, now, OVERDRIVE_CORONA);
    drawRunningGlints(graphics, beam.x1, beam.y1, beam.x2, beam.y2, now, OVERDRIVE_GLINTS);
    OVERDRIVE_SPARKS.offset = beam.width * 0.5 + 4;
    drawLineSparks(graphics, beam.x1, beam.y1, beam.x2, beam.y2, now, OVERDRIVE_SPARKS);
    drawMuzzleBurst(graphics, beam.x1, beam.y1, now, LASER_MUZZLE);
  }

  /**
   * Kademe vurgusu: yalnizca onuncu seviyede, isin boyunca kosan tek bir dugum.
   *
   * Kademe 2'nin paralel kil hatlari ve kademe 3'un dik kil cizgileri
   * kirisi bir borunun icinden geciyormus gibi gosteriyordu; kalan dugum bir
   * cerceve degil, bir hareket.
   *
   * Iki kip:
   * - `outerWidth` (Debug Lazer): dugum isinin cizilen dis genisligine gore,
   *   sahne saatinde 620 ms'lik turla. Lazerin gorunusu degismesin diye aynen.
   * - `axisWidth` (kisa isinlar): dugum eksenin kendi kalinligina gore
   *   olculuyor -- koninin genisligine gore olculdugunde Kin gosterisinde
   *   20-30 birimlik beyaz bir disk oluyordu -- ve yolunu isinin omrunde bir
   *   kez katediyor (`lifeMs`): kisa isinda dugum basta dogup sonda varir.
   */
  private drawBeamTierAccent(beam: BeamSnapshot, color: number, options: { outerWidth?: number; axisWidth?: number; lifeMs?: number } = {}) {
    const graphics = this.beamGraphics;
    if (!graphics || (beam.tier ?? 1) < 3) {
      return;
    }

    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;

    if (options.axisWidth !== undefined) {
      const lifeMs = options.lifeMs ?? 260;
      // Hareket azaltmada dugum kosmuyor, eksenin ortasinda duruyor.
      const progress = this.still ? 0.5 : 1 - clamp01((beam.ttlMs ?? lifeMs) / lifeMs);
      const travel = progress * length;
      const radius = Math.max(1.6, Math.min(4, options.axisWidth * 0.5));
      graphics.fillStyle(liftToWhite(color, 0.7), 0.5 * (1 - progress * 0.5));
      graphics.fillCircle(beam.x1 + ux * travel, beam.y1 + uy * travel, radius * 1.9);
      graphics.fillStyle(0xffffff, 0.92);
      graphics.fillCircle(beam.x1 + ux * travel, beam.y1 + uy * travel, radius);
      return;
    }

    // Dugum, isinin **cizilen** genisligine gore olculur: Debug Lazer 4
    // birimlik bir isin bildirirken ekranda 12 birim yer kapliyor.
    const outerHalf = Math.max(3, (options.outerWidth ?? beam.width) * 0.5);
    const travel = ((this.time.now % 620) / 620) * length;
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(beam.x1 + ux * travel, beam.y1 + uy * travel, Math.max(2, outerHalf * 0.5));
  }
}

/** Mumun rengi: kombonun tonu koyulastirilmis (muhur hicbir zaman beyaz bir disk degil). */
function darkenColor(color: number) {
  const channel = (shift: number) => Math.round(((color >> shift) & 0xff) * 0.55);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Isinlarin sunucudaki ttl'si: omur orani bununla. */
const BEAM_LIFE_BASE_MS: Record<string, number> = {
  "archer-2-rage": 380,
  "archer-3-curse": 320,
  "archer-3-curse-burst": 360,
  "archer-3-curse-pool": 360,
  "archer-6-whisper": 420,
  "archer-6-whisper-turn": 180,
  "archer-6-whisper-suicide": 380,
  "archer-4-underworld-link": 120,
  "archer-4-underworld-execute": 420,
  "archer-4-undead-shot": 180,
  "archer-5-mirror": 520,
  "onur-sympathy": 180,
  "zeynep-ultimate-column": 620,
  "zeynep-2": 260,
  "zeynep-3-burn": 260,
  "zeynep-3-kin-showcase": 260
};

/**
 * Isinlari snapshot'lar arasinda kare kare ara degerler.
 *
 * Isinlar eskiden yalnizca snapshot geldiginde (60 ms) ve bir sonraki
 * snapshot'in uc noktalariyla ciziliyordu: lazerin ucu dusmanin bir adim
 * onune firliyor, sonra ziplayip yetisiyordu; 260 ms'lik bir flas 4-5
 * basamakli kareye bolunuyordu. Simdi her isin kimligiyle eslesiyor:
 *
 * - Iki snapshot'ta da varsa uclar ve kalan omur ara degerleniyor. Cikis
 *   noktasi ayniysa (kuleden cikan isin) aci ve boy ara degerleniyor; supuren
 *   lazer kirisi kirisi kesen bir kiris (chord) degil, bir yay ciziyor.
 * - Yalnizca sonrakinde varsa (iki snapshot arasinda dogdu) omur yerelde
 *   ttl'den uzatiliyor: isin snapshot'in gosterdiginden daha genc.
 *
 * Nesneler havuzda: karede yeni isin nesnesi uretilmiyor.
 */
export class BeamInterpolator {
  private readonly previousById = new Map<string, BeamSnapshot>();
  private readonly pool: BeamSnapshot[] = [];
  private readonly out: BeamSnapshot[] = [];

  interpolate(previous: readonly BeamSnapshot[], next: readonly BeamSnapshot[], alpha: number, snapshotDeltaMs: number) {
    this.previousById.clear();
    for (const beam of previous) this.previousById.set(beam.id, beam);
    this.out.length = 0;
    for (let index = 0; index < next.length; index += 1) {
      const target = next[index];
      const beam = this.pool[index] ?? (this.pool[index] = { ...target });
      // Alanlarin tamami yeniden yaziliyor: havuzdaki nesne baska bir isindan kalmis olabilir.
      beam.id = target.id;
      beam.definitionId = target.definitionId;
      beam.tier = target.tier;
      beam.width = target.width;
      beam.color = target.color;
      beam.overdrive = target.overdrive;
      beam.scanX = target.scanX;
      beam.scanY = target.scanY;
      // Ayna isininin sekme koseleri: sabit dunya noktalari, ara deger yok. Havuzdaki
      // nesne baska bir isindan kose tasiyabilir; yoksa silinmeli.
      beam.b = target.b;
      const from = this.previousById.get(target.id);
      if (from && alpha < 1 && !BeamInterpolator.shouldSnap(from, target)) {
        const sameOrigin = Math.abs(from.x1 - target.x1) + Math.abs(from.y1 - target.y1) < 0.5;
        beam.x1 = lerp(from.x1, target.x1, alpha);
        beam.y1 = lerp(from.y1, target.y1, alpha);
        if (sameOrigin) {
          const fromAngle = Math.atan2(from.y2 - from.y1, from.x2 - from.x1);
          const toAngle = Math.atan2(target.y2 - target.y1, target.x2 - target.x1);
          let turn = toAngle - fromAngle;
          if (turn > Math.PI) turn -= Math.PI * 2;
          if (turn < -Math.PI) turn += Math.PI * 2;
          const angle = fromAngle + turn * alpha;
          const length = lerp(Math.hypot(from.x2 - from.x1, from.y2 - from.y1), Math.hypot(target.x2 - target.x1, target.y2 - target.y1), alpha);
          beam.x2 = beam.x1 + Math.cos(angle) * length;
          beam.y2 = beam.y1 + Math.sin(angle) * length;
        } else {
          beam.x2 = lerp(from.x2, target.x2, alpha);
          beam.y2 = lerp(from.y2, target.y2, alpha);
        }
        if (from.scanX !== undefined && target.scanX !== undefined && from.scanY !== undefined && target.scanY !== undefined) {
          beam.scanX = lerp(from.scanX, target.scanX, alpha);
          beam.scanY = lerp(from.scanY, target.scanY, alpha);
        }
        beam.ttlMs = from.ttlMs !== undefined && target.ttlMs !== undefined ? lerp(from.ttlMs, target.ttlMs, alpha) : target.ttlMs;
      } else {
        beam.x1 = target.x1;
        beam.y1 = target.y1;
        beam.x2 = target.x2;
        beam.y2 = target.y2;
        // Iki snapshot arasinda dogan isin biraz daha genc; ama baglanti
        // takilip snapshot'lar seyreldiginde uzatma bir aralikla sinirli.
        beam.ttlMs = target.ttlMs === undefined ? undefined : target.ttlMs + (1 - alpha) * Math.min(Math.max(0, snapshotDeltaMs), NEWBORN_TTL_CAP_MS);
      }
      this.out.push(beam);
    }
    return this.out;
  }

  /**
   * Ara deger yerine kesme: ayni kimlik baska bir sey anlatiyorsa.
   *
   * Isin kimligi yeniden kullaniliyor (`beam-<kule>` lazer, `melis-curse-<kule>`).
   * Hedef degistirmede ara deger kirisi 60 ms boyunca bir yay boyunca
   * savuruyordu; lazer ise hedefler arasinda kesmeli. Kesme:
   * - normal <-> asiri yukleme gecisi,
   * - asiri yukleme disinda 0.35 radyandan buyuk donus,
   * - asiri yukleme disinda bir kareden (~34 birim) buyuk uc sicramasi.
   * Asiri yuklemenin supurmesi ara degerleniyor: uzak ucu her snapshot'ta
   * bir kareden fazla yol aliyor ama surekli donuyor.
   */
  static shouldSnap(from: BeamSnapshot, target: BeamSnapshot) {
    if (Boolean(from.overdrive) !== Boolean(target.overdrive)) return true;
    if (target.overdrive) return false;
    const fromAngle = Math.atan2(from.y2 - from.y1, from.x2 - from.x1);
    const toAngle = Math.atan2(target.y2 - target.y1, target.x2 - target.x1);
    let turn = Math.abs(toAngle - fromAngle);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    const fromLength = Math.hypot(from.x2 - from.x1, from.y2 - from.y1);
    const toLength = Math.hypot(target.x2 - target.x1, target.y2 - target.y1);
    if (fromLength > 2 && toLength > 2 && turn > SNAP_TURN_RADIANS) return true;
    return Math.hypot(target.x2 - from.x2, target.y2 - from.y2) > SNAP_JUMP_UNITS;
  }

  clear() {
    this.previousById.clear();
    this.out.length = 0;
  }
}

/** Kesme esikleri (BeamInterpolator.shouldSnap). */
export const SNAP_TURN_RADIANS = 0.35;
export const SNAP_JUMP_UNITS = 34;
/** Yeni dogan isinin omur uzatmasi en fazla bir snapshot araligi. */
const NEWBORN_TTL_CAP_MS = 60;
