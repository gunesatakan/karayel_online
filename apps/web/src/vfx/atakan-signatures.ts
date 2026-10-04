/**
 * Atakan kulelerinin dunya ici imzalari: mekanigi gosteren canli katman.
 *
 * Saldiri efektleri (mermi, namlu, carpma) `AttackVfx`te; burada kulenin
 * **durumu** -- sunucunun bildigi ama ekranda olmayan sey:
 *
 * - Takipci (warrior-1): dusmanin uzerinde isaret nisangahi. Yigin basina
 *   daraliyor ve yigin sayisi kadar kertik tasiyor (renk gormeyen oyuncu da
 *   sayiyi okuyor; eski "T/T2/T3" yazisinin yerine); renk ve perde isareti
 *   koyan Takipci'nin kademesinden.
 * - Sunucu (warrior-2): bagli kuleye giden ince, surekli gorunen bag.
 * - Izolasyon (warrior-3): yalnizken kapatma alani ve muhurlu 3x3 karantina
 *   karesi; komsu varken karenin koselerinden komsuya uzanan ihlal isareti.
 * - Obsesyon (warrior-4): kuleden hedefe yiginla kalinlasan ip; hedef
 *   degisince kopup geri cekiliyor.
 * - Ucube (warrior-6): tavan kadar dilimli yigin gostergesi.
 *
 * Her biri Atakan'in uc perdesinde (vfx-profiles `signature`): ham sinyal ->
 * derlenmis (terminal yesili ayrac, paket, izgara/altigen) -> asiri yukleme
 * (beyaz-sicak cekirdek, kosan parlama, kod kivilcimi). Kademe tonu kulenin
 * kendi rampasindan.
 *
 * Kurallar kitle ayni: `Math.random` yok (tohumlar kimligin FNV ozetinden),
 * karede nesne yok (secenekler bir kez kuruluyor, durum havuzda), daire yok
 * (kitin ucuz halka ve diski). LOD sirasi: once kivilcim, sonra parlama ve
 * ADD omuzlar, en son paket sayisi; renk ve govde (nisangah, ip, gosterge
 * dilimleri) hic dusmuyor. Takim arkadasinin kademe 3 eklentileri %70.
 */
import { findIsolationBlockers, towerCatalog, type EnemySnapshot, type SynergyMap, type TowerDefinition, type TowerSnapshot } from "@karayel/shared";
import {
  ATAKAN_ACCENT,
  LASER_GLINTS,
  clamp01,
  darken,
  drawBracketCorners,
  drawCodeSparks,
  drawDataPackets,
  drawHotDot,
  drawRunningGlints,
  fillDisc,
  fnvHash,
  hashNoise,
  hexCorner,
  liftToWhite,
  strokeHex,
  strokePointProfile,
  strokeProfile,
  strokeRing,
  type VfxGraphics,
  type VfxTier
} from "./kit";
import { VfxLod } from "./lod";
import { getSignatureTier, getVfxProfile, type VfxProfile, type VfxSignatureTier } from "./vfx-profiles";

/** Takim arkadasinin kademe 3 eklentileri bu alfada. */
const TEAMMATE_EXTRA_ALPHA = 0.7;
/** Obsesyon yiginin tavani (engine.ts: `max: 10`). */
export const OBSESSION_MAX_STACK = 10;
/** Ucube yigin tavaninin varsayilani; sunucu yalnizca 15 ve 20'yi yaziyor. */
export const UCUBE_DEFAULT_STACK_LIMIT = 10;
/** Ip koptugunda iki yarinin geri cekilme suresi. */
export const TETHER_SNAP_MS = 260;
/** Takipci yiginin tavani (sv 10'da 3). */
export const MARK_MAX_STACK = 3;

/**
 * Isaret nisangahinin yari boyu: yigin basina daraliyor.
 *
 * `size` dusmanin ekrandaki **capi** (sprite'in tam boyu: grunt 34, iri
 * brute ~56 birim). Oran capin; ayraclar govdeyi sariyor: 1 yigin govdenin
 * hemen disinda (grunt'ta yari boy ~14), 3 yigin govdeye kilitli (~10).
 */
const MARK_HALF_RATIO = [0.42, 0.36, 0.3] as const;
export function getMarkReticleHalf(size: number, stacks: number) {
  const index = Math.max(1, Math.min(MARK_MAX_STACK, Math.round(stacks))) - 1;
  return size * MARK_HALF_RATIO[index];
}

/**
 * Yigin kertikleri: nisangahin solunda dikey bir sutun. Ust (durum yazisi:
 * AIR / SLOW / KORKU, Melis isaretleri, sampiyon taci) ve alt (can cubugu)
 * dolu; sag ust kosede zirh kirigi simgesi var. Kertik en az 3, aralik en az
 * 2 birim: 375 piksellik telefonda ~3 piksellik kareler, renk gormeden sayiliyor.
 */
export const MARK_PIP_SIZE = 3;
export const MARK_PIP_GAP = 2;

/** Obsesyon ipinin govde kalinligi: yigin 0 -> 10 boyunca ince -> kalin. */
export function getTetherWidth(stack: number, scale: number) {
  return (0.8 + 2.2 * clamp01(stack / OBSESSION_MAX_STACK)) * scale;
}

/** Ucube gostergesinin yaricapi: kule govdesinin hemen disinda. */
export function getUcubeGaugeRadius(scale: number, cellSize: number) {
  return Math.max(13 * scale, cellSize * 0.56);
}

export type SignatureTower = Pick<TowerSnapshot, "id" | "definitionId" | "x" | "y" | "level"> &
  Partial<Pick<TowerSnapshot, "ownerId" | "range" | "auraActive" | "disabled" | "linkedTowerIds" | "status" | "o" | "t" | "u" | "m">>;

export type SignatureEnemy = Pick<EnemySnapshot, "id" | "x" | "y"> & Partial<Pick<EnemySnapshot, "trackingStacks" | "isTracked" | "k">>;

export type SignatureFrame = {
  towers: readonly SignatureTower[];
  enemies: readonly SignatureEnemy[];
  now: number;
  scale: number;
  /** Harita karesinin boyu: yalnizlik karesi 3x3 kare. */
  cellSize: number;
  /** Kule yerel oyuncunun mu; yoksa hepsi kendi sayilir. */
  isOwn?: (tower: SignatureTower) => boolean;
  /** Dusmanin ekrandaki capi (sprite'in tam boyu); yoksa 34 * olcek (grunt). */
  enemySize?: (enemy: SignatureEnemy) => number;
  /**
   * Oyunun haritasi: Izolasyon'un komsu isareti sunucunun kuralindan
   * (`findIsolationBlockers`, kare kare). Yoksa (galeri) kare mesafesi tahmini.
   */
  map?: SynergyMap;
};

export type AtakanSignatureOptions = {
  lod: VfxLod;
  /** Hareket azaltma: donme, akis ve kivilcim yok; sekiller yerinde. */
  reducedMotion?: () => boolean;
};

type Surface = VfxGraphics & { clear(): unknown };

type TetherState = {
  target: string;
  stack: number;
  x2: number;
  y2: number;
  /** Kopma ani; kopma yoksa -Infinity. */
  snapAt: number;
  snapStack: number;
  snapX2: number;
  snapY2: number;
  seen: number;
};

/* Karede yerinde yazilan secenekler: cagri basina nesne literali yok. */
const LINE = { body: 0, spread: 0 };
const POINT = { radius: 0, spread: 0 };
const PACKETS = { count: 0, size: 0, color: 0, alpha: 0, speed: 0, seed: 0, still: false };
const CODE = { seed: 0, count: 0, radius: 0, rise: 0, color: 0, accent: ATAKAN_ACCENT, size: 0, alpha: 0, lifeMs: 520 };
const GLINTS = { ...LASER_GLINTS, count: 1, armBase: 3, armRange: 2, armWidth: 0.9, crossWidth: 0.7, haloRadius: 2.2, coreRadius: 1, cheapDiscs: true };
/** Izolasyon alanindaki ice akan cizgiler; kademe 1 seyrek. */
const FIELD_DRIFT = [8, 11, 14] as const;
/** Ihlal isaretinin rengi: kehribar uyari, kulenin tonundan ayri. */
const BREACH_COLOR = 0xf59e0b;

const levelTier = (level: number): VfxTier => (level >= 10 ? 3 : level >= 5 ? 2 : 1);

export class AtakanSignatureVfx {
  private readonly tethers = new Map<string, TetherState>();
  /** Izolasyon komsulari: kule kimligi basina, kule dizisi degisene kadar. */
  private readonly blockerCache = new Map<string, { towers: readonly SignatureTower[]; blockers: readonly SignatureTower[] }>();
  private readonly tetherPool: TetherState[] = [];
  private frameNo = 0;
  private readonly tracker: VfxProfile = getVfxProfile("warrior-1");
  /** Kimlikten kuleye: kule dizisi degistiginde (snapshot hizinda) yeniden kuruluyor. */
  private readonly towerIndex = new Map<string, SignatureTower>();
  private indexedTowers?: readonly SignatureTower[];

  /**
   * @param ground dusmanlarin altinda: kapatma alani ve karantina karesi.
   * @param links mermilerin altinda: Sunucu bagi ve Obsesyon ipi.
   * @param glow ADD: omuzlar ve parlamalar.
   * @param marks dusman ve kule govdesinin ustunde: nisangah ve gosterge.
   */
  constructor(
    private readonly ground: Surface,
    private readonly links: Surface,
    private readonly glow: Surface,
    private readonly marks: Surface,
    private readonly options: AtakanSignatureOptions = { lod: new VfxLod() }
  ) {}

  private get still() {
    return this.options.reducedMotion?.() ?? false;
  }

  get liveTethers() {
    return this.tethers.size;
  }

  clear() {
    for (const state of this.tethers.values()) this.tetherPool.push(state);
    this.tethers.clear();
    this.blockerCache.clear();
    this.towerIndex.clear();
    this.indexedTowers = undefined;
    this.ground.clear();
    this.links.clear();
    this.glow.clear();
    this.marks.clear();
  }

  render(frame: SignatureFrame) {
    this.ground.clear();
    this.links.clear();
    this.glow.clear();
    this.marks.clear();
    this.frameNo += 1;
    const still = this.still;
    const { towers, now, scale } = frame;
    if (this.indexedTowers !== towers) {
      // Yeni snapshot: dizin yeniden kuruluyor, giden kulelerin komsu kaydi siliniyor.
      this.findTower(frame, "");
      for (const id of this.blockerCache.keys()) if (!this.towerIndex.has(id)) this.blockerCache.delete(id);
    }

    for (const tower of towers) {
      switch (tower.definitionId) {
        case "warrior-2":
          if (tower.linkedTowerIds && tower.linkedTowerIds.length > 0 && !tower.disabled) this.drawServerLinks(tower, frame, still);
          break;
        case "warrior-3":
          if (!tower.disabled) this.drawContainment(tower, frame, still);
          break;
        case "warrior-4":
          this.drawTether(tower, frame, still);
          break;
        case "warrior-6":
          if ((tower.u ?? 0) > 0 && !tower.disabled) this.drawUcubeGauge(tower, frame, still);
          break;
        default:
      }
    }
    this.pruneTethers(now);

    for (const enemy of frame.enemies) {
      const stacks = enemy.trackingStacks ?? (enemy.isTracked ? 1 : 0);
      if (stacks <= 0) continue;
      const size = frame.enemySize ? frame.enemySize(enemy) : 34 * scale;
      // Renk ve perde isareti koyan kulenin kademesinden; kule bilinmiyorsa
      // (eski sunucu, satilmis kule) ham kademe ve tam alfa.
      const source = enemy.k ? this.findTower(frame, enemy.k) : undefined;
      const tier = source ? levelTier(source.level) : 1;
      const extra = source && frame.isOwn && !frame.isOwn(source) ? TEAMMATE_EXTRA_ALPHA : 1;
      this.drawMarkReticle(enemy.x, enemy.y, stacks, tier, extra, size, now, scale, still, fnvHash(enemy.id) % 4999);
    }
  }

  /** Kimlikle kule; dizin kule dizisi her degistiginde bir kez kuruluyor. */
  private findTower(frame: SignatureFrame, id: string) {
    if (this.indexedTowers !== frame.towers) {
      this.towerIndex.clear();
      for (const tower of frame.towers) this.towerIndex.set(tower.id, tower);
      this.indexedTowers = frame.towers;
    }
    return this.towerIndex.get(id);
  }

  /* ---------------------------------------------------------------- */
  /* Takipci: isaret nisangahi                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Isaret nisangahi.
   *
   * Iki ayri eksen, karistirilmiyor:
   * - **Yigin** (sunucudaki canli isaret yuvasi sayisi, 1-3; Debug Lazer
   *   isaret tuketince dusuyor): yalnizca darlik ve kertik sayisi.
   * - **Kademe** (isareti koyan Takipci'nin seviyesi, `k` alani): renk ve perde.
   *   Ham: rampanin ilk tonunda duz ayraclar. Derlenmis: ADD dusumlu ayraclar
   *   ve terminal yesili ic kertikler. Asiri yukleme: beyaz-sicak kose
   *   dugumleri, kutunun cevresinde kosan parlama, kod kivilcimi.
   *
   * Isaret takimin ortak sinyali (her kulenin hasarini artiriyor), ama
   * kademe 3 eklentileri isaretleyen kulenin sahibine gore: takim
   * arkadasinin isaretinde %70.
   *
   * LOD: 1'de kivilcim; 2'de parlama, ic kertikler ve kose dugumleri; 3'te
   * yalnizca ayraclar ve tek dikdortgenlik kertik seridi (boyu yigini
   * soyluyor). Renk, ayraclar ve yigin sayisi hic dusmuyor.
   */
  private drawMarkReticle(x: number, y: number, stacks: number, tier: VfxTier, extra: number, size: number, now: number, scale: number, still: boolean, seed: number) {
    const g = this.marks;
    const lod = this.options.lod;
    const s = Math.max(1, Math.min(MARK_MAX_STACK, Math.round(stacks)));
    const color = this.tracker.ramp[tier - 1];
    const breath = still || tier < 2 || !lod.corona ? 0 : (0.5 + Math.sin(now / 260 + seed) * 0.5) * 0.05;
    const half = getMarkReticleHalf(size, s) * (1 - breath);
    const arm = Math.max(2.5 * scale, half * 0.42);
    const width = Math.max(0.8, (tier >= 2 ? 1.25 : 1) * scale);

    // Ayraclar: kademe 2+ ADD katmaninda (siyah zeminde dusumlu); ham kademede duz.
    drawBracketCorners(tier >= 2 && lod.corona ? this.glow : g, x, y, half, half, arm, width, color, 0.95);

    // Yigin kertikleri: solda dikey sutun, yigin kadar.
    const pip = Math.max(MARK_PIP_SIZE, MARK_PIP_SIZE * scale);
    const gap = Math.max(MARK_PIP_GAP, MARK_PIP_GAP * scale);
    const column = s * pip + (s - 1) * gap;
    const left = x - half - gap - pip;
    const top = y - column / 2;
    g.fillStyle(tier >= 2 ? ATAKAN_ACCENT : color, 0.95);
    if (lod.level >= 3) {
      g.fillRect(left, top, pip, column);
      return;
    }
    for (let index = 0; index < s; index += 1) {
      g.fillRect(left, top + index * (pip + gap), pip, pip);
    }
    if (lod.level >= 2) return;

    if (tier >= 2) {
      // Derlenmis: kenar ortalarindan ice dort kertik (nisangah artisi).
      const tick = half * 0.32;
      g.lineStyle(Math.max(0.6, 0.85 * scale), ATAKAN_ACCENT, 0.85);
      g.lineBetween(x - half, y, x - half + tick, y);
      g.lineBetween(x + half, y, x + half - tick, y);
      g.lineBetween(x, y + half, x, y + half - tick);
      g.lineBetween(x, y - half, x, y - half + tick);
    }

    if (tier >= 3) {
      // Asiri yukleme: beyaz-sicak kose dugumleri; ton ayraclarda kaliyor.
      const node = Math.max(1, 1.3 * scale);
      g.fillStyle(liftToWhite(color, 0.9), extra);
      g.fillRect(x - half - node / 2, y - half - node / 2, node, node);
      g.fillRect(x + half - node / 2, y - half - node / 2, node, node);
      g.fillRect(x - half - node / 2, y + half - node / 2, node, node);
      g.fillRect(x + half - node / 2, y + half - node / 2, node, node);
      if (!still && lod.corona) {
        // Kutunun cevresinde kosan tek parlama.
        const lap = ((now / 900 + hashNoise(seed)) % 1) * 4;
        const side = Math.floor(lap);
        const t = lap - side;
        const px = side === 0 ? x - half + t * half * 2 : side === 1 ? x + half : side === 2 ? x + half - t * half * 2 : x - half;
        const py = side === 0 ? y - half : side === 1 ? y - half + t * half * 2 : side === 2 ? y + half : y + half - t * half * 2;
        drawHotDot(this.glow, px, py, 0xffffff, Math.max(1, 1.4 * scale), 0.9 * extra);
      }
      if (!still && lod.sparks) {
        CODE.seed = seed;
        CODE.count = 1;
        CODE.radius = half;
        CODE.rise = 8 * scale;
        CODE.color = color;
        CODE.size = Math.max(0.8, 1.1 * scale);
        CODE.alpha = 0.85 * extra;
        CODE.lifeMs = 640;
        drawCodeSparks(this.glow, x, y, now, CODE);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sunucu: gorunen bag                                                */
  /* ---------------------------------------------------------------- */

  /**
   * Bag haritanin obur ucuna gidebiliyor (global menzil): ince ve soluk
   * kaliyor. Ham: tek cizgi. Derlenmis: bagli kuleye akan veri paketleri ve
   * ucunda terminal yesili ayrac. Asiri yukleme: bag boyunca kosan parlama.
   */
  private drawServerLinks(tower: SignatureTower, frame: SignatureFrame, still: boolean) {
    const tier = levelTier(tower.level);
    const profile = getVfxProfile(tower.definitionId);
    const signature = getSignatureTier(profile, tier);
    const own = frame.isOwn ? frame.isOwn(tower) : true;
    const extra = own ? 1 : TEAMMATE_EXTRA_ALPHA;
    const quiet = tower.status === "Hararet" || tower.status === "Tukenmis" ? 0.45 : 1;
    const base = 0.3 * quiet;
    const color = profile.ramp[tier - 1];
    const scale = frame.scale;
    const lod = this.options.lod;
    const linkedIds = tower.linkedTowerIds;
    if (!linkedIds) return;
    for (const linkedId of linkedIds) {
      const linked = this.findTower(frame, linkedId);
      if (!linked) continue;
      const g = this.links;
      g.lineStyle(Math.max(0.6, 0.8 * scale), color, base);
      g.lineBetween(tower.x, tower.y, linked.x, linked.y);
      g.fillStyle(color, base * 2);
      fillDisc(g, linked.x, linked.y, Math.max(1, 1.6 * scale));
      if (!signature?.accent) continue;
      const length = Math.hypot(linked.x - tower.x, linked.y - tower.y);
      PACKETS.count = Math.max(1, Math.min(5, Math.round((length / 70) * (lod.trailScale))));
      PACKETS.size = Math.max(1, 1.7 * scale);
      PACKETS.color = liftToWhite(color, 0.4);
      PACKETS.alpha = Math.min(1, base * 2.6);
      PACKETS.speed = 140 / Math.max(60, length);
      PACKETS.seed = fnvHash(tower.id) % 997;
      PACKETS.still = still;
      drawDataPackets(g, tower.x, tower.y, linked.x, linked.y, frame.now, PACKETS);
      const half = Math.max(6 * scale, frame.cellSize * 0.42);
      drawBracketCorners(g, linked.x, linked.y, half, half, half * 0.35, Math.max(0.6, 0.8 * scale), ATAKAN_ACCENT, base * 1.8);
      if (signature.glints && !still && lod.corona) {
        GLINTS.seedOffset = fnvHash(linkedId) % 997;
        GLINTS.haloColor = color;
        GLINTS.armBase = 3 * scale;
        GLINTS.armRange = 2 * scale;
        drawRunningGlints(this.glow, tower.x, tower.y, linked.x, linked.y, frame.now, GLINTS, 0.8 * extra * quiet);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Izolasyon: kapatma alani ve karantina karesi                        */
  /* ---------------------------------------------------------------- */

  /**
   * Yalnizken (`auraActive`) alan: ham kademede ince halka ve ice akan
   * cizgiler; derlenmiste altigen sinir, terminal yesili kose dugumleri ve
   * donen tarama; asiri yuklemede beyaz-sicak cekirdek, sinirda kosan
   * dugumler ve icten yukselen kod bitleri. Yaricap her zaman gercek
   * (`range`).
   *
   * Yalnizlik kosulu ayrica 3x3 karantina karesiyle: yalnizken muhurlu
   * (yesil, tam), komsu varken soluk ve her komsuya uzanan kehribar ihlal
   * cizgisiyle. Sunucunun karari `auraActive`; komsu isareti istemcinin
   * kare mesafesi tahmini, yalnizca yon gostermek icin.
   */
  private drawContainment(tower: SignatureTower, frame: SignatureFrame, still: boolean) {
    const tier = levelTier(tower.level);
    const profile = getVfxProfile(tower.definitionId);
    const signature = getSignatureTier(profile, tier);
    const own = frame.isOwn ? frame.isOwn(tower) : true;
    const extra = own ? 1 : TEAMMATE_EXTRA_ALPHA;
    const color = profile.ramp[tier - 1];
    const { now, scale, cellSize } = frame;
    const lod = this.options.lod;
    const g = this.ground;
    const quarantine = cellSize * 1.5;
    const seed = fnvHash(tower.id) % 997;

    if (tower.auraActive) {
      const radius = Math.max(12, tower.range ?? 0);
      g.fillStyle(darken(color, 0.65), 0.05 + tier * 0.012);
      fillDisc(g, tower.x, tower.y, radius);
      if (tier === 1) {
        g.lineStyle(Math.max(0.7, 0.9 * scale), color, 0.42);
        strokeRing(g, tower.x, tower.y, radius);
      } else {
        // Derlenmis sinir: altigen; yavas donuyor (hareket azaltmada sabit).
        const spin = still ? 0 : now / 9000;
        g.lineStyle(Math.max(0.8, 1.1 * scale), color, 0.55);
        strokeHex(g, tower.x, tower.y, radius, spin);
        g.fillStyle(ATAKAN_ACCENT, 0.85);
        const node = Math.max(1.2, 1.8 * scale);
        for (let index = 0; index < 6; index += 1) {
          g.fillRect(hexCorner(tower.x, tower.y, radius, spin, index, 0) - node / 2, hexCorner(tower.x, tower.y, radius, spin, index, 1) - node / 2, node, node);
        }
        // Tarama: merkezden sinira donen tek cizgi.
        const sweep = still ? -Math.PI / 2 : now / 1400 + seed;
        g.lineStyle(Math.max(0.6, 0.8 * scale), ATAKAN_ACCENT, 0.32);
        g.lineBetween(tower.x, tower.y, tower.x + Math.cos(sweep) * radius * 0.96, tower.y + Math.sin(sweep) * radius * 0.96);
      }
      // Ice akan agir surukleme: alanin yaptigi is. Yerler tohumdan.
      const drift = FIELD_DRIFT[tier - 1];
      for (let index = 0; index < drift; index += 1) {
        const a = hashNoise(seed + index + 5) * Math.PI * 2;
        const phase = still ? 0.35 : (now / (2600 + hashNoise(seed + index) * 1500) + hashNoise(seed + index + 10)) % 1;
        const r = radius * (1 - phase * 0.65);
        const length = (2 + tier) * scale;
        g.lineStyle(Math.max(0.6, 0.8 * scale), tier >= 3 && index % 4 === 0 ? liftToWhite(color, 0.85) : liftToWhite(color, 0.4), Math.sin(phase * Math.PI) * 0.4);
        g.lineBetween(tower.x + Math.cos(a) * r, tower.y + Math.sin(a) * r, tower.x + Math.cos(a) * (r - length), tower.y + Math.sin(a) * (r - length));
      }
      if (signature?.whiteCore) {
        POINT.radius = 2.4 * scale;
        POINT.spread = 4 * scale;
        strokePointProfile(this.links, tower.x, tower.y, color, 3, POINT, lod.corona ? this.glow : this.links, extra);
        if (!still && lod.corona) {
          // Sinirda kosan uc dugum.
          for (let index = 0; index < 3; index += 1) {
            const angle = now / 2400 + (index / 3) * Math.PI * 2 + seed;
            drawHotDot(this.glow, tower.x + Math.cos(angle) * radius, tower.y + Math.sin(angle) * radius, liftToWhite(color, 0.85), Math.max(1, 1.5 * scale), 0.85 * extra);
          }
        }
        if (!still && lod.sparks) {
          CODE.seed = seed;
          CODE.count = 4;
          CODE.radius = radius * 0.7;
          CODE.rise = 12 * scale;
          CODE.color = color;
          CODE.size = Math.max(0.9, 1.3 * scale);
          CODE.alpha = 0.75 * extra;
          CODE.lifeMs = 900;
          drawCodeSparks(this.glow, tower.x, tower.y, now, CODE);
        }
      }
      // Muhurlu karantina: yalnizlik saglandi.
      drawBracketCorners(this.marks, tower.x, tower.y, quarantine, quarantine, quarantine * 0.3, Math.max(0.7, 1 * scale), signature?.accent ? ATAKAN_ACCENT : color, 0.6);
      return;
    }

    // Komsu var: karantina acik ve soluk; komsulara ihlal isareti.
    drawBracketCorners(this.marks, tower.x, tower.y, quarantine, quarantine, quarantine * 0.22, Math.max(0.6, 0.8 * scale), signature?.accent ? ATAKAN_ACCENT : color, 0.26);
    for (const other of this.isolationBlockers(tower, frame)) {
      const dx = other.x - tower.x;
      const dy = other.y - tower.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const ex = tower.x + (dx / length) * Math.min(length, quarantine * 0.55);
      const ey = tower.y + (dy / length) * Math.min(length, quarantine * 0.55);
      this.marks.lineStyle(Math.max(0.6, 0.9 * scale), BREACH_COLOR, 0.6);
      this.marks.lineBetween(ex, ey, other.x - (dx / length) * cellSize * 0.32, other.y - (dy / length) * cellSize * 0.32);
      const cross = Math.max(2, 2.4 * scale);
      this.marks.lineBetween(other.x - cross, other.y - cross, other.x + cross, other.y + cross);
      this.marks.lineBetween(other.x - cross, other.y + cross, other.x + cross, other.y - cross);
    }
  }

  /**
   * Yalnizligi bozan komsular.
   *
   * Harita biliniyorsa sunucunun kuralinin aynisi (`findIsolationBlockers`:
   * kare kare, kosegenler dahil, sahibi kim olursa olsun; duvar ve kenar
   * yapisi sayilmiyor). Liste kule dizisi degistiginde (snapshot hizinda)
   * bir kez kuruluyor. Harita yoksa (galeri) kare mesafesi tahmini.
   */
  private isolationBlockers(tower: SignatureTower, frame: SignatureFrame): readonly SignatureTower[] {
    let cached = this.blockerCache.get(tower.id);
    if (cached && cached.towers === frame.towers) return cached.blockers;
    let blockers: SignatureTower[];
    if (frame.map) {
      const structures = frame.towers.map(toBlockerStructure);
      blockers = findIsolationBlockers(toBlockerStructure(tower), structures, frame.map).map((entry) => entry.tower);
    } else {
      const reach = frame.cellSize * 1.5;
      blockers = frame.towers.filter((other) => other.id !== tower.id && !other.definitionId.startsWith("wall")
        && Math.abs(other.x - tower.x) <= reach && Math.abs(other.y - tower.y) <= reach);
    }
    cached ??= { towers: frame.towers, blockers };
    cached.towers = frame.towers;
    cached.blockers = blockers;
    this.blockerCache.set(tower.id, cached);
    return blockers;
  }

  /* ---------------------------------------------------------------- */
  /* Obsesyon: ip                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Kuleden hedefe ip: kalinligi ve parlakligi yiginla (0 -> 10) buyuyor.
   * Yigin kadar sayac kertigi kulenin yaninda. Ham kademede duz cizgi;
   * derlenmiste omuzlar, hedefe akan paketler (sayi ve hiz yiginla) ve
   * yiginla daralan yesil ayrac; asiri yuklemede beyaz-sicak cekirdek,
   * kosan parlamalar ve tam yiginda hedeften dokulen kod bitleri.
   *
   * Hedef degisince (ya da yigin dusunce) ip kopuyor: iki yari 260 ms'de
   * uclarina geri cekiliyor. Sunucu sifirladigi icin bir sonraki ip ince
   * basliyor.
   */
  private drawTether(tower: SignatureTower, frame: SignatureFrame, still: boolean) {
    const { now, scale } = frame;
    let state = this.tethers.get(tower.id);
    const stack = tower.disabled ? 0 : Math.max(0, Math.min(OBSESSION_MAX_STACK, tower.o ?? 0));
    const target = stack > 0 && tower.t ? findEnemy(frame.enemies, tower.t) : undefined;
    if (!state) {
      if (!target) return;
      state = this.tetherPool.pop() ?? { target: "", stack: 0, x2: 0, y2: 0, snapAt: Number.NEGATIVE_INFINITY, snapStack: 0, snapX2: 0, snapY2: 0, seen: 0 };
      state.target = "";
      state.stack = 0;
      state.snapAt = Number.NEGATIVE_INFINITY;
      this.tethers.set(tower.id, state);
    }
    state.seen = this.frameNo;

    const nextTarget = target ? tower.t ?? "" : "";
    if (state.target && state.stack >= 2 && (nextTarget !== state.target || stack < state.stack)) {
      // Kopma: onceki ipin son hali geri cekilerek soner.
      state.snapAt = now;
      state.snapStack = state.stack;
      state.snapX2 = state.x2;
      state.snapY2 = state.y2;
    }
    state.target = nextTarget;
    state.stack = target ? stack : 0;

    const tier = levelTier(tower.level);
    const profile = getVfxProfile(tower.definitionId);
    const signature = getSignatureTier(profile, tier);
    const own = frame.isOwn ? frame.isOwn(tower) : true;
    const extra = own ? 1 : TEAMMATE_EXTRA_ALPHA;
    const color = profile.ramp[tier - 1];

    const snapAge = (now - state.snapAt) / TETHER_SNAP_MS;
    if (snapAge >= 0 && snapAge < 1) this.drawTetherSnap(tower, state, snapAge, color, scale, still);

    if (!target) return;
    state.x2 = target.x;
    state.y2 = target.y;
    this.drawTetherBody(this.links, tower.x, tower.y, target.x, target.y, stack, tier, color, signature, extra, now, scale, still, fnvHash(tower.id) % 997);
  }

  private drawTetherBody(
    g: VfxGraphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stack: number,
    tier: VfxTier,
    color: number,
    signature: VfxSignatureTier | undefined,
    extra: number,
    now: number,
    scale: number,
    still: boolean,
    seed: number
  ) {
    const lod = this.options.lod;
    const ratio = clamp01(stack / OBSESSION_MAX_STACK);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const alpha = 0.35 + 0.6 * ratio;
    LINE.body = getTetherWidth(stack, scale);
    LINE.spread = (2 + 4 * ratio) * scale;
    strokeProfile(g, x1, y1, x2, y2, color, tier, LINE, lod.corona ? this.glow : undefined, alpha * (tier >= 3 ? extra : 1));

    // Sayac: yigin kadar dik kertik, kulenin yaninda (renk gormeyen de sayar).
    const half = (2 + ratio * 1.5) * scale;
    const step = Math.min(4 * scale, (length * 0.45) / OBSESSION_MAX_STACK);
    g.lineStyle(Math.max(0.6, 0.9 * scale), signature?.accent ? ATAKAN_ACCENT : liftToWhite(color, 0.4), 0.9);
    for (let index = 0; index < stack; index += 1) {
      const along = 9 * scale + index * step;
      if (along > length - 6 * scale) break;
      const px = x1 + ux * along;
      const py = y1 + uy * along;
      g.lineBetween(px - uy * half, py + ux * half, px + uy * half, py - ux * half);
    }

    if (!signature?.accent) return;
    PACKETS.count = Math.max(1, Math.round((1 + Math.floor(stack / 3)) * lod.trailScale));
    PACKETS.size = Math.max(1, (1.4 + ratio * 0.8) * scale);
    PACKETS.color = liftToWhite(color, 0.5);
    PACKETS.alpha = 0.95;
    PACKETS.speed = (0.6 + 0.14 * stack) * Math.min(2, 90 / length);
    PACKETS.seed = seed;
    PACKETS.still = still;
    drawDataPackets(g, x1, y1, x2, y2, now, PACKETS);
    // Hedefte yiginla daralan ayrac.
    const bracket = (10 - 4 * ratio) * scale;
    drawBracketCorners(g, x2, y2, bracket, bracket, bracket * 0.4, Math.max(0.6, 0.9 * scale), ATAKAN_ACCENT, 0.5 + 0.45 * ratio);

    if (!signature.glints || still) return;
    if (lod.corona) {
      GLINTS.count = 1 + Math.floor(stack / 4);
      GLINTS.seedOffset = seed;
      GLINTS.haloColor = color;
      GLINTS.armBase = 3 * scale;
      GLINTS.armRange = 2 * scale;
      drawRunningGlints(this.glow, x1, y1, x2, y2, now, GLINTS, extra);
      GLINTS.count = 1;
    }
    if (lod.sparks && stack >= OBSESSION_MAX_STACK) {
      CODE.seed = seed;
      CODE.count = 4;
      CODE.radius = bracket;
      CODE.rise = 9 * scale;
      CODE.color = color;
      CODE.size = Math.max(0.9, 1.2 * scale);
      CODE.alpha = 0.9 * extra;
      CODE.lifeMs = 520;
      drawCodeSparks(this.glow, x2, y2, now, CODE);
    }
  }

  private drawTetherSnap(tower: SignatureTower, state: TetherState, age: number, color: number, scale: number, still: boolean) {
    const g = this.links;
    const fade = 1 - age;
    const width = getTetherWidth(state.snapStack, scale) * (still ? 1 : 1 - age * 0.6);
    const mx = (tower.x + state.snapX2) / 2;
    const my = (tower.y + state.snapY2) / 2;
    // Iki yari uclarina geri cekiliyor; hareket azaltmada yerinde soner.
    const keep = still ? 0.45 : 0.5 * (1 - age);
    g.lineStyle(Math.max(0.6, width), liftToWhite(color, 0.3), 0.85 * fade);
    g.lineBetween(tower.x, tower.y, tower.x + (mx - tower.x) * keep * 2 * 0.9, tower.y + (my - tower.y) * keep * 2 * 0.9);
    g.lineBetween(state.snapX2, state.snapY2, state.snapX2 + (mx - state.snapX2) * keep * 2 * 0.9, state.snapY2 + (my - state.snapY2) * keep * 2 * 0.9);
  }

  /** Bu karede gorulmeyen kule ya da ipi ve kopmasi biten kayit havuza. */
  private pruneTethers(now: number) {
    for (const [id, state] of this.tethers) {
      const snapping = now - state.snapAt < TETHER_SNAP_MS;
      if (state.seen === this.frameNo && (state.target || snapping)) continue;
      this.tethers.delete(id);
      this.tetherPool.push(state);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Ucube: yigin gostergesi                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Tavan kadar dilim (10 / 15 / 20), yigin kadari yanik. Ham: duz dilimler.
   * Derlenmis: yanik dilimlerin ADD dusumu ve tavani isaretleyen yesil
   * kertik. Asiri yukleme: yanik dilimlerde beyaz-sicak cekirdek, yanik yay
   * boyunca kosan dugum, tavanda kod bitleri.
   */
  private drawUcubeGauge(tower: SignatureTower, frame: SignatureFrame, still: boolean) {
    const tier = levelTier(tower.level);
    const profile = getVfxProfile(tower.definitionId);
    const signature = getSignatureTier(profile, tier);
    const own = frame.isOwn ? frame.isOwn(tower) : true;
    const extra = own ? 1 : TEAMMATE_EXTRA_ALPHA;
    const color = profile.ramp[tier - 1];
    const { now, scale, cellSize } = frame;
    const lod = this.options.lod;
    const limit = Math.max(1, tower.m ?? UCUBE_DEFAULT_STACK_LIMIT);
    const stack = Math.min(limit, tower.u ?? 0);
    const full = stack >= limit;
    const radius = getUcubeGaugeRadius(scale, cellSize);
    const g = this.marks;
    const step = (Math.PI * 2) / limit;
    const gap = step * 0.22;
    const pulse = full && !still ? 0.75 + Math.sin(now / 90) * 0.25 : 1;

    // Yanmamis dilimler: tavanin kendisi, soluk.
    g.lineStyle(Math.max(0.6, 0.9 * scale), darken(color, 0.4), 0.32);
    for (let index = stack; index < limit; index += 1) {
      const a0 = -Math.PI / 2 + index * step + gap;
      const a1 = -Math.PI / 2 + (index + 1) * step - gap;
      g.lineBetween(tower.x + Math.cos(a0) * radius, tower.y + Math.sin(a0) * radius, tower.x + Math.cos(a1) * radius, tower.y + Math.sin(a1) * radius);
    }
    if (tier >= 2 && lod.corona) {
      this.glow.lineStyle(Math.max(1, 4 * scale), color, 0.22 * pulse);
      for (let index = 0; index < stack; index += 1) this.gaugeSegment(this.glow, tower, index, step, gap, radius);
    }
    g.lineStyle(Math.max(1, 2 * scale), color, 0.95 * pulse);
    for (let index = 0; index < stack; index += 1) this.gaugeSegment(g, tower, index, step, gap, radius);
    if (signature?.whiteCore) {
      g.lineStyle(Math.max(0.5, 0.8 * scale), liftToWhite(color, 0.9), 0.95 * extra);
      for (let index = 0; index < stack; index += 1) this.gaugeSegment(g, tower, index, step, gap, radius);
    }
    if (signature?.accent) {
      // Tavan kertigi: tepede, dilimlerin basladigi ve bittigi yer.
      g.lineStyle(Math.max(0.7, 1 * scale), ATAKAN_ACCENT, 0.9);
      g.lineBetween(tower.x, tower.y - radius - 3 * scale, tower.x, tower.y - radius + 2 * scale);
    }
    if (!signature?.glints || still) return;
    if (lod.corona) {
      const lit = stack * step;
      const angle = -Math.PI / 2 + ((now / 700) % 1) * lit;
      drawHotDot(this.glow, tower.x + Math.cos(angle) * radius, tower.y + Math.sin(angle) * radius, 0xffffff, Math.max(1, 1.5 * scale), 0.9 * extra);
    }
    if (lod.sparks && full) {
      CODE.seed = fnvHash(tower.id) % 997;
      CODE.count = 4;
      CODE.radius = radius;
      CODE.rise = 10 * scale;
      CODE.color = color;
      CODE.size = Math.max(0.9, 1.2 * scale);
      CODE.alpha = 0.9 * extra;
      CODE.lifeMs = 560;
      drawCodeSparks(this.glow, tower.x, tower.y, now, CODE);
    }
  }

  private gaugeSegment(g: VfxGraphics, tower: SignatureTower, index: number, step: number, gap: number, radius: number) {
    const a0 = -Math.PI / 2 + index * step + gap;
    const a1 = -Math.PI / 2 + (index + 1) * step - gap;
    g.lineBetween(tower.x + Math.cos(a0) * radius, tower.y + Math.sin(a0) * radius, tower.x + Math.cos(a1) * radius, tower.y + Math.sin(a1) * radius);
  }
}

/** Katalog tanimi: sunucunun komsu kurali tanimdan okuyor (duvar, kenar yapisi). */
const DEFINITIONS = new Map<string, TowerDefinition>();
for (const towers of Object.values(towerCatalog)) {
  for (const definition of towers) if (!DEFINITIONS.has(definition.id)) DEFINITIONS.set(definition.id, definition);
}

function toBlockerStructure(tower: SignatureTower) {
  // Katalogda olmayan kimlik kule sayiliyor: sunucunun varsayilani da bu.
  const definition = DEFINITIONS.get(tower.definitionId) ?? ({ id: tower.definitionId } as TowerDefinition);
  return { id: tower.id, x: tower.x, y: tower.y, definition, tower };
}

function findEnemy(enemies: readonly SignatureEnemy[], id: string) {
  for (const enemy of enemies) if (enemy.id === id) return enemy;
  return undefined;
}
