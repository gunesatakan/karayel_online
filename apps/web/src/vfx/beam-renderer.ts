import { GAME_SPEED_MULTIPLIER, ZEYNEP_SYNTHESIS_BURN_TICK_MS, type BeamSnapshot } from "@karayel/shared";
import { drawPressureWave, getTierEdge } from "./combat-vfx";
import { fillRayPath } from "./zeynep-signatures";
import {
  LASER_CORONA,
  LASER_GLINTS,
  LASER_MUZZLE,
  LASER_SPARKS,
  TEAMMATE_EXTRA_ALPHA,
  clamp01,
  darken,
  drawCorona,
  drawCrackle,
  drawLineSparks,
  drawMuzzleBurst,
  drawRunningGlints,
  fillDisc,
  fillJaggedPath,
  fnvHash,
  groundHueCached,
  hashNoise,
  liftToWhite,
  strokePolyline,
  strokeHardBeam,
  strokeProfile,
  whiteHot,
  strokeRing,
  type CrackleOptions,
  type VfxGraphics
} from "./kit";
import { VfxLod } from "./lod";
import { TIER_HEAT, TIER_WEIGHT, getBeamVfxProfile, getVfxTier } from "./vfx-profiles";

const clampRange = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** Kirisin kenarindan dokulen kivilcim sayisi. */
const OVERDRIVE_SPARK_COUNT = 10;
/** Onuncu seviye asiri yuklemede kiris boyunca kosan parlama sayisi. */
const OVERDRIVE_FLARE_COUNT = 7;
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
const ACCENT_OUTER = { outerWidth: 0 };
const CHAIN_CRACKLE: CrackleOptions = { seed: 0, count: 0, reach: 0, hue: 0, width: 0, alpha: 0, heading: undefined, fan: 0 };
/** Zincirin yeniden tohumlanma araligi: simsek her 60 ms'de baska yoldan. */
export const CHAIN_RESEED_MS = 60;
/** Sunucudaki zincir omru (setUcubeChainBeam). */
const CHAIN_LIFE_MS = 190;
/** Ayna mizraginin yolu: kuyruk, sekmeler, bas (havuzlu noktalar). */
const RAY_POINTS: Array<{ x: number; y: number }> = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));
const SPEAR_PROFILE = { body: 0, spread: 0 };
/** Yanik izinin hasar tiki (gercek saat): hit-sounds `AREA_BEAM_TICK_MS` ile ayni sabit. */
const BURN_TICK_MS = ZEYNEP_SYNTHESIS_BURN_TICK_MS / GAME_SPEED_MULTIPLIER;
/** Kin dalgasinin sonme suresi: sunucu dalgayi son karede siliyor, istemci son halini sonduruyor. */
export const KIN_WAVE_FADE_MS = 200;
/** Melis patlamalarinin catlaklari: sayisi ve kirilma noktasi (donmuyor, tohumlu). */
const CRACKS = 5;
/** Sunucunun gonderdigi renk yere indirilmis (kenar tonu): renk basina bir kez (kit'in onbellegi). */
const grounded = groundHueCached;

export type BeamRenderOptions = {
  /** Efekt saati (ms). */
  now: number;
  /** Sahne saati (Phaser `time.now`); lazerin dugumu ve parlamalari. */
  sceneNow: number;
  scale: number;
  /** Isini atan kule yerel oyuncunun mu; yoksa hepsi kendi sayilir. */
  isOwn?: (beam: BeamSnapshot) => boolean;
  /**
   * Hareket azaltma: kivilcimlar, akan korlar ve titreme cizilmiyor. Lazerin
   * cizimi bunu okumuyor -- HEAD'de de okumuyordu; gorunusu her ayarda ayni.
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
 * Agir, sert dil (vfx-profiles): isinlar koyu dusum -> ton -> beyaz-sicak
 * cekirdek kesitinde; Melis ve Zeynep'in tonlari kenarda. Kademe cekirdegi
 * kalinlastirip isitiyor; altin trim, serit, muhur, yaldiz ve kosan parlama
 * yok. Debug Lazer'in cizimi aynen (asagida, kimlik testiyle kilitli).
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
    // Bilinmeyen isinin rengi: notr celik (eski pembe 0xfb7185 sekerleme gibiydi).
    const color = beam.color ?? 0x9ca3af;
    if (beam.overdrive) {
      this.drawOverdriveBeam(beam, color);
    } else if (beam.definitionId === "zeynep-6" || beam.definitionId === "zeynep-3-kin-wave") {
      drawPressureWave(this.beamGraphics!, beam, this.now, this.getTowerEffectScale());
    } else if (beam.definitionId === "zeynep-3-kin-showcase") {
      this.drawKinShowcaseLight(beam, color);
    } else if (beam.definitionId === "archer-2-rage") {
      this.drawMelisRageWave(beam, grounded(color));
      this.drawBeamTierHeat(beam, grounded(color));
    } else if (beam.definitionId === "archer-3-curse" || beam.definitionId === "archer-3-curse-burst" || beam.definitionId === "archer-3-curse-pool") {
      this.drawMelisCursePulse(beam, grounded(color));
      this.drawBeamTierHeat(beam, grounded(color));
    } else if (beam.definitionId === "archer-6-whisper") {
      this.drawMelisWhisperWave(beam, grounded(color));
      this.drawBeamTierHeat(beam, grounded(color));
    } else if (beam.definitionId === "archer-6-whisper-turn") {
      this.drawMelisWhisperTurnShot(beam, grounded(color));
      this.drawBeamTierHeat(beam, grounded(color));
    } else if (beam.definitionId === "archer-6-whisper-suicide") {
      this.drawMelisWhisperSuicideBurst(beam, grounded(color));
      this.drawBeamTierHeat(beam, grounded(color));
    } else if (beam.definitionId === "archer-4-underworld-link" || beam.definitionId === "archer-4-underworld-execute" || beam.definitionId === "archer-4-undead-shot") {
      this.drawMelisUnderworldLink(beam, grounded(color));
      this.drawBeamTierHeat(beam, grounded(color));
    } else if (beam.definitionId === "archer-5-mirror") {
      this.drawMelisBrokenMirrorBurst(beam, grounded(color));
      this.drawBeamTierHeat(beam, grounded(color));
    } else if (beam.definitionId === "zeynep-3" || beam.definitionId === "zeynep-3-ray") {
      this.drawMirrorSpear(beam, color);
    } else if (beam.definitionId === "zeynep-2" || beam.definitionId === "zeynep-3-burn") {
      this.drawShowcaseBeam(beam, grounded(color));
    } else if (beam.definitionId === "zeynep-3-burn-trail") {
      this.drawSynthesisBurnTrail(beam, color);
    } else if (beam.definitionId === "warrior-6") {
      this.drawChainLightning(beam, color);
    } else if (beam.definitionId === "zeynep-ultimate-column") {
      this.drawZeynepColumnBurst(beam, grounded(color));
    } else if (beam.definitionId === "onur-sympathy") {
      this.drawSympathyLink(beam, grounded(color));
      this.drawBeamTierHeat(beam, grounded(color));
    } else if (beam.definitionId === "enemy-shot") {
      this.drawEnemyShot(beam, color);
    } else {
      this.drawLaserConnection(beam, color);
    }
  }

  /**
   * Kademenin isisi: kendi kademe dili olmayan isinlara (Melis, Sempati).
   * Isinin tonu govdede kaliyor; kademe 2-3 eksen boyunca beyaz-sicak bir
   * cekirdek ekliyor (kademe 3'te daha kalin ve beyaz). Nokta isinlarda
   * (patlama, havuz) cekirdek tek ince sicak halka. Takim arkadasininki %70.
   */
  private drawBeamTierHeat(beam: BeamSnapshot, color: number) {
    const tier = beam.tier ?? 1;
    if (tier < 2 || !this.beamGraphics) return;
    const extra = this.ownBeam || tier < 3 ? 1 : TEAMMATE_TRIM_ALPHA;
    const scale = this.getTowerEffectScale();
    const life = this.getBeamLife(beam);
    const heat = TIER_HEAT[tier - 1];
    const weight = TIER_WEIGHT[tier - 1];
    const g = this.beamGraphics;
    const length = Math.hypot(beam.x2 - beam.x1, beam.y2 - beam.y1);
    if (length > 2) {
      g.lineStyle(Math.max(0.6, 0.45 * weight * scale), whiteHot(color, heat), clamp01(0.85 * life * extra));
      g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
      return;
    }
    const radius = Math.max(6, beam.width / 2);
    g.lineStyle(Math.max(0.6, 0.5 * weight * scale), whiteHot(color, heat), clamp01(0.8 * life * extra));
    strokeRing(g, beam.x1, beam.y1, radius * 0.98);
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

  /**
   * Zeynep'in sutunu: sert, beyaz-sicak bir vurus sutunu. Koyu dusum (vurdugu
   * alan), tonun govdesi (Zeynep'in kizil-eflatunu, yere indirilmis), beyaz-
   * sicak cekirdek ve iki sert kenar. Kademe (ulti gucu) cekirdegi ve kenari
   * kalinlastiriyor. Yaldiz gibi okunan katmanlar ve dokulen cizgi kivilcimlari yok.
   */
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

    graphics.fillStyle(darken(color, 0.55), 0.24 * fade);
    graphics.fillRect(centerX - width * 0.675, top, width * 1.35, height);
    graphics.fillStyle(color, 0.36 * fade);
    graphics.fillRect(centerX - width * 0.3, top, width * 0.6, height);
    const core = width * (0.1 + tier * 0.04);
    graphics.fillStyle(whiteHot(color, TIER_HEAT[tier - 1]), 0.9 * fade);
    graphics.fillRect(centerX - core / 2, top, core, height);
    // Sert kenarlar: ultinin vurdugu alan tam bu.
    graphics.lineStyle(1.2 + tier * 0.4, getTierEdge(tier, color), 0.75 * fade);
    graphics.lineBetween(centerX - width / 2, top, centerX - width / 2, top + height);
    graphics.lineBetween(centerX + width / 2, top, centerX + width / 2, top + height);
  }

  /**
   * Catlaklar: merkezden disa bes kirik cizgi (iki parca), yonleri ve kirilma
   * noktalari isinin kimliginden. Donmuyor, titremiyor: sert bir sok izi.
   */
  private drawCracks(x: number, y: number, inner: number, outer: number, seed: number) {
    const g = this.beamGraphics!;
    for (let index = 0; index < CRACKS; index += 1) {
      const angle = (Math.PI * 2 * index) / CRACKS + (hashNoise(seed + index * 7) - 0.5) * 0.9;
      const bend = (hashNoise(seed + index * 7 + 1) - 0.5) * 0.5;
      const mid = inner + (outer - inner) * (0.45 + hashNoise(seed + index * 7 + 2) * 0.2);
      const reach = outer * (0.8 + hashNoise(seed + index * 7 + 3) * 0.2);
      const mx = x + Math.cos(angle + bend) * mid;
      const my = y + Math.sin(angle + bend) * mid;
      g.lineBetween(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, mx, my);
      g.lineBetween(mx, my, x + Math.cos(angle - bend * 0.5) * reach, y + Math.sin(angle - bend * 0.5) * reach);
    }
  }

  /** Melis'in ofke dalgasi: koyu govde, tonun sert kenari ve catlaklar. */
  private drawMelisRageWave(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(8, beam.width / 2);
    const life = clampRange((beam.ttlMs ?? 180) / 380, 0, 1);
    const scale = this.getTowerEffectScale();
    this.beamGraphics.fillStyle(darken(color, 0.7), 0.16 * life);
    fillDisc(this.beamGraphics, beam.x1, beam.y1, radius);
    this.beamGraphics.lineStyle(2.4 * scale, color, 0.8 * life);
    strokeRing(this.beamGraphics, beam.x1, beam.y1, radius * (1.02 - life * 0.18));
    this.beamGraphics.lineStyle(1.1 * scale, color, 0.6 * life);
    this.drawCracks(beam.x1, beam.y1, radius * 0.45, radius * 0.9, fnvHash(beam.id) % 997);
  }

  /** Melis'in laneti: koyu cekirdek, tonun kenari; patlamada kirik catirti. */
  private drawMelisCursePulse(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(8, beam.width / 2);
    const life = clampRange((beam.ttlMs ?? 180) / 360, 0, 1);
    const isBurst = beam.definitionId === "archer-3-curse-burst";
    const isPool = beam.definitionId === "archer-3-curse-pool";
    const scale = this.getTowerEffectScale();
    const g = this.beamGraphics;
    if (!isPool) {
      g.lineStyle(1.2 * scale, color, 0.5 * life);
      g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    }
    g.fillStyle(darken(color, 0.75), (isPool ? 0.3 : isBurst ? 0.28 : 0.16) * life);
    fillDisc(g, beam.x2, beam.y2, radius);
    if (isBurst) {
      g.fillStyle(0x020617, 0.75 * life);
      fillDisc(g, beam.x2, beam.y2, radius * 0.34);
      g.lineStyle(2.4 * scale, color, 0.85 * life);
      strokeRing(g, beam.x2, beam.y2, radius * (1.2 - life * 0.2));
      // Catirti patlamanin kimliginden: sabit kirik (titreme yok).
      CHAIN_CRACKLE.seed = fnvHash(beam.id) % 997;
      CHAIN_CRACKLE.count = 5;
      CHAIN_CRACKLE.reach = radius * 1.05;
      CHAIN_CRACKLE.hue = color;
      CHAIN_CRACKLE.width = Math.max(0.6, 0.9 * scale);
      CHAIN_CRACKLE.alpha = life;
      CHAIN_CRACKLE.heading = undefined;
      drawCrackle(g, beam.x2, beam.y2, CHAIN_CRACKLE);
      return;
    }
    g.lineStyle((isPool ? 2 : 1.6) * scale, color, 0.78 * life);
    strokeRing(g, beam.x2, beam.y2, radius * (1.05 - life * 0.22));
    g.lineStyle(1.1 * scale, isPool ? color : 0x020617, (isPool ? 0.45 : 0.36) * life);
    this.drawCracks(beam.x2, beam.y2, radius * (isPool ? 0.12 : 0.22), radius * (isPool ? 0.9 : 0.78), fnvHash(beam.id) % 997);
  }

  /** Fisilti dalgasi: koyu govdeli cizgi, tonun kenari, beyaz-sicak cekirdek; ucta tek halka. */
  private drawMelisWhisperWave(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(8, beam.width / 2);
    const life = clampRange((beam.ttlMs ?? 180) / 420, 0, 1);
    const scale = this.getTowerEffectScale();
    const g = this.beamGraphics;
    g.lineStyle(4.4 * scale, 0x020617, 0.58 * life);
    g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    g.lineStyle(2 * scale, color, 0.82 * life);
    g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    g.lineStyle(0.9 * scale, whiteHot(color, 0.3), 0.75 * life);
    g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    g.fillStyle(darken(color, 0.7), 0.2 * life);
    fillDisc(g, beam.x2, beam.y2, radius * 0.92);
    g.lineStyle(2 * scale, color, 0.8 * life);
    strokeRing(g, beam.x2, beam.y2, radius * (0.62 + (1 - life) * 0.1));
    g.lineStyle(1.1 * scale, color, 0.6 * life);
    this.drawCracks(beam.x2, beam.y2, radius * 0.25, radius * 0.95, fnvHash(beam.id) % 997);
  }

  /** Cevrilen dusmanin atisi: koyu govde, tonun cizgisi ve uc kisa enine kertik. */
  private drawMelisWhisperTurnShot(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const life = clampRange((beam.ttlMs ?? 180) / 180, 0, 1);
    const scale = this.getTowerEffectScale();
    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const g = this.beamGraphics;
    g.lineStyle(4.6 * scale, 0x020617, 0.72 * life);
    g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    g.lineStyle(2 * scale, color, 0.88 * life);
    g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    g.lineStyle(1 * scale, color, 0.72 * life);
    for (let index = 0; index < 3; index += 1) {
      const t = (index + 0.5) / 3;
      const x = lerp(beam.x1, beam.x2, t);
      const y = lerp(beam.y1, beam.y2, t);
      g.lineBetween(x - nx * 5 * scale, y - ny * 5 * scale, x + nx * 5 * scale, y + ny * 5 * scale);
    }
  }

  /** Fisilti intihari: koyu kizil govde, sert kenar ve catlaklar. */
  private drawMelisWhisperSuicideBurst(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(12, beam.width / 2);
    const life = clampRange((beam.ttlMs ?? 380) / 380, 0, 1);
    const scale = this.getTowerEffectScale();
    const g = this.beamGraphics;
    g.fillStyle(0x2a0a0a, 0.3 * life);
    fillDisc(g, beam.x1, beam.y1, radius * 0.62);
    g.lineStyle(2.4 * scale, color, 0.85 * life);
    strokeRing(g, beam.x1, beam.y1, radius * 0.52);
    g.lineStyle(1.3 * scale, color, 0.7 * life);
    this.drawCracks(beam.x1, beam.y1, radius * 0.18, radius * 0.5, fnvHash(beam.id) % 997);
  }

  private drawSympathyLink(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const scale = this.getTowerEffectScale();
    const width = Math.max(2, beam.width * scale);
    const pulse = this.still ? 0.8 : 0.72 + Math.sin(this.now / 260) * 0.14;

    this.beamGraphics.lineStyle(width, 0x0f172a, 0.5);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(Math.max(1, width * 0.55), color, pulse);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);

    this.beamGraphics.fillStyle(color, pulse * 0.6);
    fillDisc(this.beamGraphics, beam.x1, beam.y1, Math.max(1.5, width * 0.6));
    fillDisc(this.beamGraphics, beam.x2, beam.y2, Math.max(1.5, width * 0.6));
  }

  /** Oluler Bagi: koyu halat, tonun cizgisi ve kosan uc kertik; infazda cekilen halka. */
  private drawMelisUnderworldLink(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    // Taban sunucunun ttl'si: halat 120 ms gonderilip 180'e bolundugunde hic
    // tam parlakliga cikmiyordu (en fazla uc te iki).
    const life = this.getBeamLife(beam);
    const now = this.now;
    const scale = this.getTowerEffectScale();
    const width = Math.max(2, beam.width * scale);
    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const pull = beam.definitionId === "archer-4-underworld-execute";
    const g = this.beamGraphics;
    g.lineStyle((pull ? 4.4 : width) * scale, 0x020617, 0.86 * life);
    g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    g.lineStyle((pull ? 2.4 : 1.6) * scale, color, 0.72 * life);
    g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    g.lineStyle(0.9 * scale, color, 0.45 * life);
    for (let index = 0; index < 3; index += 1) {
      const t = (index + (this.still ? 0.5 : (now / 220) % 1)) / 3;
      const x = lerp(beam.x1, beam.x2, t);
      const y = lerp(beam.y1, beam.y2, t);
      g.lineBetween(x - nx * 4 * scale, y - ny * 4 * scale, x + nx * 4 * scale, y + ny * 4 * scale);
    }

    if (pull) {
      const radius = Math.max(10, beam.width / 2);
      g.fillStyle(darken(color, 0.7), 0.24 * life);
      fillDisc(g, beam.x2, beam.y2, radius);
      g.lineStyle(1.8 * scale, color, 0.75 * life);
      strokeRing(g, beam.x2, beam.y2, radius * (0.8 + life * 0.2));
    }
  }

  /** Kirik Ayna: koyu govdeli sert isin, ucta kirik cam (koyu kiymik, ince parlak kenar). */
  private drawMelisBrokenMirrorBurst(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(18, beam.width / 2);
    const life = clampRange((beam.ttlMs ?? 180) / 520, 0, 1);
    const scale = this.getTowerEffectScale();
    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const g = this.beamGraphics;

    g.lineStyle(7 * scale, 0x020617, 0.82 * life);
    g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    g.lineStyle(3 * scale, color, 0.9 * life);
    g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    g.lineStyle(1.2 * scale, whiteHot(color, 0.3), 0.95 * life);
    g.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);

    g.fillStyle(darken(color, 0.75), 0.24 * life);
    fillDisc(g, beam.x2, beam.y2, radius);
    g.lineStyle(2.4 * scale, color, 0.86 * life);
    strokeRing(g, beam.x2, beam.y2, radius * (1.1 - life * 0.16));
    g.lineStyle(1.4 * scale, color, 0.8 * life);
    this.drawCracks(beam.x2, beam.y2, radius * 0.2, radius * 0.85, fnvHash(beam.id) % 997);

    // Kirik cam: isin boyunca dort koyu kiymik.
    g.fillStyle(darken(color, 0.55), 0.8 * life);
    for (let index = 0; index < 4; index += 1) {
      const t = (index + 1) / 5;
      const x = lerp(beam.x1, beam.x2, t);
      const y = lerp(beam.y1, beam.y2, t);
      const shard = (4 + (index % 3) * 1.5) * scale;
      g.fillTriangle(
        x + nx * shard,
        y + ny * shard,
        x - nx * shard * 0.7,
        y - ny * shard * 0.7,
        x + dx / length * shard * 1.6,
        y + dy / length * shard * 1.6
      );
    }
  }

  /** Gosteri isininin bir bandi: ortasi sisik alti koseli serit ve iki uc. */
  private fillShowcaseBand(beam: BeamSnapshot, ux: number, uy: number, nx: number, ny: number, width: number, bandColor: number, alpha: number, inset: number) {
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
    graphics.fillStyle(bandColor, alpha);
    graphics.fillPoints(band, true);
    fillDisc(graphics, startX, startY, halfStart);
    fillDisc(graphics, endX, endY, halfEnd);
  }

  /**
   * Gosteri: kisa ve sert bir isin. Kesit lazerinki gibi: koyu dusum (tonun
   * koyusu), ton ve beyaz-sicak cekirdek; ilk an sert, sonra soner. Kademe
   * cekirdegi kalinlastirip isitiyor. Ikinci perde, altin kiymik ve yaldiz yok.
   * Hattaki her dusmanin isareti `ZeynepSignatureVfx`te.
   */
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
    const tier = beam.tier ?? 1;
    const heat = TIER_HEAT[tier - 1];

    this.fillShowcaseBand(beam, ux, uy, nx, ny, beam.width, darken(color, 0.45), 0.24 * afterglow, 0);
    this.fillShowcaseBand(beam, ux, uy, nx, ny, beam.width * 0.6, color, 0.5 * afterglow, 2);
    this.fillShowcaseBand(beam, ux, uy, nx, ny, beam.width * (0.16 + tier * 0.06), whiteHot(color, heat), 0.95 * flash + 0.15 * afterglow, 5);

    const g = this.beamGraphics;
    g.fillStyle(liftToWhite(color, 0.9), 0.9 * flash);
    fillDisc(g, beam.x1, beam.y1, beam.width * 0.26);
    g.fillStyle(color, 0.45 * afterglow);
    fillDisc(g, beam.x2, beam.y2, beam.width * 0.22);
  }

  /**
   * Taht'in Kin gosterisi: gercek 60 derecelik koni.
   *
   * Eskiden koni ~52 derece cizilip 60 derecede vuruyordu. Simdi yari
   * genislik isinin genisliginin yarisi (sunucu genisligi koninin gercek
   * acisindan yaziyor). Kizil kenar, koyu dolgu, uc sert isik cizgisi (ton
   * kenari, beyaz-sicak cekirdek); kademe cekirdegi kalinlastirip isitiyor.
   * Hattaki her dusmanin isareti `ZeynepSignatureVfx`te.
   */
  private drawKinShowcaseLight(beam: BeamSnapshot, rawColor: number) {
    if (!this.beamGraphics) {
      return;
    }

    const color = grounded(rawColor);
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
    const tier = beam.tier ?? 1;
    const coreWidth = Math.max(2.5, Math.min(6, beam.width * 0.06)) * TIER_WEIGHT[tier - 1];
    const scale = this.getTowerEffectScale();
    const g = this.beamGraphics;

    const cone = this.points(3);
    BeamRenderer.setPoint(cone, 0, beam.x1, beam.y1);
    BeamRenderer.setPoint(cone, 1, beam.x2 + nx * spread, beam.y2 + ny * spread);
    BeamRenderer.setPoint(cone, 2, beam.x2 - nx * spread, beam.y2 - ny * spread);
    g.fillStyle(darken(color, 0.5), 0.22 * life);
    g.fillPoints(cone, true);

    for (let index = -1; index <= 1; index += 1) {
      const endX = beam.x2 + nx * spread * index * 0.6;
      const endY = beam.y2 + ny * spread * index * 0.6;
      const width = coreWidth * (index === 0 ? 1 : 0.6);
      g.lineStyle(width + 3, color, 0.32 * life);
      g.lineBetween(beam.x1, beam.y1, endX, endY);
      g.lineStyle(Math.max(1, width * 0.45), whiteHot(color, TIER_HEAT[tier - 1]), (index === 0 ? 0.92 : 0.5) * flash);
      g.lineBetween(beam.x1, beam.y1, endX, endY);
    }
    // Koninin kenarlari: vurdugu alan tam bu.
    g.lineStyle(Math.max(1, (0.9 + tier * 0.3) * scale), getTierEdge(tier, color), 0.85 * life);
    g.lineBetween(beam.x1, beam.y1, beam.x2 + nx * spread, beam.y2 + ny * spread);
    g.lineBetween(beam.x1, beam.y1, beam.x2 - nx * spread, beam.y2 - ny * spread);

    g.fillStyle(liftToWhite(color, 0.9), 0.86 * flash);
    fillDisc(g, beam.x1, beam.y1, Math.max(3, coreWidth * 0.8));
  }

  /**
   * Taht'in ayna mizragi: sekmesi gorunen, gercek genislikte.
   *
   * Eskiden kuyruktan basa duz bir kiris ciziliyordu: isin kosede sektiginde
   * kiris koseyi kesiyordu ve sekme hic gorunmuyordu; govde ~6 birimdi, isin
   * 10 + dusman yaricapi icinde vuruyor. Simdi yol kuyruk -> sunucunun sekme
   * koseleri (`b`) -> bas; govdenin zarfi isinin genisliginde (vurdugu bant),
   * ucta mizrak basi. Kesit lazerin merdiveni (kademe 2'de omuzlar ve
   * beyaz-sicak cekirdek, 3'te genis omuzlar). Sekmenin kendi isareti
   * `ZeynepSignatureVfx`te.
   */
  private drawMirrorSpear(beam: BeamSnapshot, rawColor: number) {
    const g = this.beamGraphics;
    if (!g) return;
    const color = grounded(rawColor);
    const glow = this.glowGraphics ?? g;
    const tier = beam.tier ?? 1;
    const count = fillRayPath(beam, RAY_POINTS);
    const width = Math.max(4, beam.width);
    SPEAR_PROFILE.body = Math.max(1.6, width * 0.26);
    SPEAR_PROFILE.spread = width * 0.4;
    for (let index = 0; index + 1 < count; index += 1) {
      const a = RAY_POINTS[index];
      const b = RAY_POINTS[index + 1];
      // Zarf: isinin gercek genisligi, koyu ve soluk.
      g.lineStyle(width, darken(color, 0.4), 0.16);
      g.lineBetween(a.x, a.y, b.x, b.y);
      strokeHardBeam(g, a.x, a.y, b.x, b.y, color, tier, SPEAR_PROFILE, glow);
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
    const half = width * 0.38;
    g.fillStyle(whiteHot(color, TIER_HEAT[tier - 1]), 0.95);
    g.fillTriangle(head.x + ux * tip, head.y + uy * tip, head.x - uy * half, head.y + ux * half, head.x + uy * half, head.y - ux * half);
  }

  /**
   * Taht'in yanik izi: duz bir serit degil, yanan bir hat.
   *
   * Govde yanigin camgobegi (sunucunun rengi), hasar tikiyle (333 oyun ms)
   * nefes aliyor; hat boyunca korlar akiyor. Zarf yanigin gercek yaricapinda.
   * Kademe cekirdegi kalinlastirip isitiyor. Hareket azaltma: kor akmiyor,
   * nefes yok; yalnizca soner.
   */
  private drawSynthesisBurnTrail(beam: BeamSnapshot, rawColor: number) {
    const g = this.beamGraphics;
    if (!g) {
      return;
    }

    const color = grounded(rawColor);
    const remaining = beam.ttlMs ?? 0;
    const life = clampRange(remaining / 3000, 0, 1);
    const fadeIn = clampRange(life / 0.08, 0, 1);
    const tier = beam.tier ?? 1;
    const scale = this.getTowerEffectScale();
    const seed = fnvHash(beam.id) % 997;
    const x1 = beam.x1;
    const y1 = beam.y1;
    const x2 = beam.x2;
    const y2 = beam.y2;
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
    g.lineStyle(Math.max(1.5, width * (0.24 + tier * 0.08)), whiteHot(color, TIER_HEAT[tier - 1]), (0.35 + tick * 0.45) * alpha);
    g.lineBetween(x1, y1, x2, y2);

    if (this.lod.sparks) {
      // Akan korlar: hat boyunca ileri kayan kisa cizgiler.
      const embers = 4 + tier;
      g.lineStyle(Math.max(0.8, 1.1 * scale), whiteHot(color, 0.3), 0.7 * alpha);
      for (let index = 0; index < embers; index += 1) {
        const phase = this.still ? (index + 0.5) / embers : (index / embers + hashNoise(seed + index) * 0.08 + this.now / 1600) % 1;
        const along = phase * length;
        const side = (hashNoise(seed + index * 3 + 1) - 0.5) * width * 0.7;
        const px = x1 + ux * along + nx * side;
        const py = y1 + uy * along + ny * side;
        g.lineBetween(px, py, px - ux * 4 * scale, py - uy * 4 * scale);
      }
    }
  }

  /**
   * Ucube'nin zinciri: tek ton ailesinde, her 60 ms'de yeniden tohumlanan
   * simsek. Govde isinin kendi rengi (sunucu Ucube limonunu gonderiyor),
   * kenar tonu yere indirilmis; kademe 2'de ADD omuzlar (koyu dusum), beyaz-
   * sicak cekirdek yol ve bir catal; kademe 3'te cekirdek daha beyaz ve ucta
   * kisa bir catirti. Yesil ayrac, kosan parlama ve kod biti yok.
   *
   * Hareket azaltmada simsek yeniden tohumlanmiyor; tohum yalnizca kimlikten.
   */
  private drawChainLightning(beam: BeamSnapshot, rawColor: number) {
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
    const profile = getBeamVfxProfile(beam.definitionId, rawColor);
    const recipe = getVfxTier(profile, tier);
    const color = grounded(rawColor);
    const extra = this.ownBeam ? 1 : TEAMMATE_TRIM_ALPHA;
    const life = clamp01((beam.ttlMs ?? CHAIN_LIFE_MS) / 60);
    const glow = this.glowGraphics ?? graphics;
    const body = Math.max(1.2, (beam.width - 1) * visualScale);

    if (tier >= 2 && this.lod.smoke) {
      // Dusum ADD katmaninda, tonun kendisinde: tek renk ailesi.
      strokePolyline(glow, points, segments + 1, body + 4 * visualScale, recipe.color, 0.18 * life);
    }
    strokePolyline(graphics, points, segments + 1, body, color, 0.95 * life);
    if (tier >= 2) {
      strokePolyline(graphics, points, segments + 1, Math.max(0.6, body * 0.36), whiteHot(color, recipe.heat), 0.95 * life);
      // Catal: yolun ortasindan kisa bir kol, ayni tohumdan.
      const fork = points[3];
      const side = hashNoise(seed + 41) > 0.5 ? 1 : -1;
      const dx = beam.x2 - beam.x1;
      const dy = beam.y2 - beam.y1;
      const length = Math.max(1, Math.hypot(dx, dy));
      const reach = Math.min(18, length * 0.35) * Math.max(0.6, visualScale);
      graphics.lineStyle(Math.max(0.6, body * 0.5), color, 0.8 * life);
      graphics.lineBetween(fork.x, fork.y, fork.x + (dx / length) * reach * 0.6 - (dy / length) * reach * side, fork.y + (dy / length) * reach * 0.6 + (dx / length) * reach * side);
    }

    graphics.fillStyle(whiteHot(color, recipe.heat), 0.9 * life);
    fillDisc(graphics, beam.x2, beam.y2, (2.2 + tier * 0.5) * visualScale);

    if (tier >= 3 && !this.still && this.lod.sparks) {
      CHAIN_CRACKLE.seed = seed + 5;
      CHAIN_CRACKLE.count = 2;
      CHAIN_CRACKLE.reach = 7 * visualScale;
      CHAIN_CRACKLE.hue = color;
      CHAIN_CRACKLE.width = Math.max(0.6, 0.8 * visualScale);
      CHAIN_CRACKLE.alpha = life * extra;
      CHAIN_CRACKLE.heading = undefined;
      drawCrackle(graphics, beam.x2, beam.y2, CHAIN_CRACKLE);
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
   * Yalnizca Debug Lazer: dugum isinin cizilen dis genisligine gore
   * (`outerWidth`), sahne saatinde 620 ms'lik turla. Lazerin gorunusu
   * degismesin diye aynen.
   */
  private drawBeamTierAccent(beam: BeamSnapshot, color: number, options: { outerWidth?: number } = {}) {
    const graphics = this.beamGraphics;
    if (!graphics || (beam.tier ?? 1) < 3) {
      return;
    }

    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;

    // Dugum, isinin **cizilen** genisligine gore olculur: Debug Lazer 4
    // birimlik bir isin bildirirken ekranda 12 birim yer kapliyor.
    const outerHalf = Math.max(3, (options.outerWidth ?? beam.width) * 0.5);
    const travel = ((this.time.now % 620) / 620) * length;
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(beam.x1 + ux * travel, beam.y1 + uy * travel, Math.max(2, outerHalf * 0.5));
  }
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
