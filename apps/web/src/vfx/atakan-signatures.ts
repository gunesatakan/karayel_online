/**
 * Atakan kulelerinin dunya ici isaretleri: mekanigi gosteren canli katman.
 *
 * Saldiri efektleri (mermi, namlu, carpma) `AttackVfx`te; burada kulenin
 * **durumu** -- sunucunun bildigi ama ekranda olmayan sey:
 *
 * - Takipci (warrior-1): dusmanin uzerinde isaret nisangahi. Yigin basina
 *   daraliyor ve yigin sayisi kadar kertik tasiyor (renk gormeyen oyuncu da
 *   sayiyi okuyor); agirlik ve sicaklik isareti koyan Takipci'nin kademesinden.
 * - Sunucu (warrior-2): bagli kuleye giden ince, surekli gorunen bag.
 * - Izolasyon (warrior-3): yalnizken kapatma alani ve 3x3 karantina karesi;
 *   komsu varken karenin koselerinden komsuya uzanan ihlal isareti.
 * - Obsesyon (warrior-4): kuleden hedefe yiginla kalinlasan ip; hedef
 *   degisince kopup geri cekiliyor.
 * - Ucube (warrior-6): tavan kadar dilimli yigin gostergesi.
 *
 * Agir, sert dil (vfx-profiles): isaretler HUD gibi -- ince cizgi, kertik,
 * ayrac. Kademe sus degil yogunluk: cizgi kalinlasiyor, kademe 3'te beyaz-
 * sicak bir cekirdek cizgisi ekleniyor. Terminal yesili aksan, veri paketi,
 * kod kivilcimi ve kosan parlama yok.
 *
 * Kurallar kitle ayni: `Math.random` yok (tohumlar kimligin FNV ozetinden),
 * karede nesne yok (secenekler bir kez kuruluyor, durum havuzda), daire yok
 * (kitin ucuz halka ve diski). LOD: duman basamaginda (2) ADD omuzlar ve
 * kademe 3'un cekirdek cizgisi, en son (VFX_LOD_MAX) kertikler tek serit; renk ve govde (nisangah, ip, gosterge
 * dilimleri, yigin sayisi) hic dusmuyor. Takim arkadasinin kademe 3 cekirdegi %70.
 */
import { findIsolationBlockers, towerCatalog, type EnemySnapshot, type SynergyMap, type TowerDefinition, type TowerSnapshot } from "@karayel/shared";
import {
  TEAMMATE_EXTRA_ALPHA,
  clamp01,
  darken,
  drawBracketCorners,
  fillDisc,
  fnvHash,
  whiteHot,
  strokeHex,
  strokeHardBeam,
  type VfxGraphics,
  type VfxTier
} from "./kit";
import { VfxLod } from "./lod";
import { getVfxProfile, type VfxProfile } from "./vfx-profiles";

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
/** Ihlal isaretinin rengi: kehribar uyari (islevsel), kulenin tonundan ayri. */
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
          if (tower.linkedTowerIds && tower.linkedTowerIds.length > 0 && !tower.disabled) this.drawServerLinks(tower, frame);
          break;
        case "warrior-3":
          if (!tower.disabled) this.drawContainment(tower, frame);
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
      // Agirlik ve sicaklik isareti koyan kulenin kademesinden; kule bilinmiyorsa
      // (eski sunucu, satilmis kule) kademe 1 ve tam alfa.
      const source = enemy.k ? this.findTower(frame, enemy.k) : undefined;
      const tier = source ? levelTier(source.level) : 1;
      const extra = source && frame.isOwn && !frame.isOwn(source) ? TEAMMATE_EXTRA_ALPHA : 1;
      this.drawMarkReticle(enemy.x, enemy.y, stacks, tier, extra, size, scale);
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
   * - **Kademe** (isareti koyan Takipci'nin seviyesi, `k` alani): cizginin
   *   agirligi ve sicakligi. Kademe 3'te ayraclarin icinde beyaz-sicak bir
   *   cekirdek cizgisi (takim arkadasinin isaretinde %70).
   *
   * LOD: 2'de cekirdek cizgisi; en son (VFX_LOD_MAX) kertikler tek dikdortgenlik serit (boyu
   * yigini soyluyor). Renk, ayraclar ve yigin sayisi hic dusmuyor.
   */
  private drawMarkReticle(x: number, y: number, stacks: number, tier: VfxTier, extra: number, size: number, scale: number) {
    const g = this.marks;
    const lod = this.options.lod;
    const s = Math.max(1, Math.min(MARK_MAX_STACK, Math.round(stacks)));
    const color = this.tracker.ramp[tier - 1];
    const half = getMarkReticleHalf(size, s);
    const arm = Math.max(2.5 * scale, half * 0.42);
    const width = Math.max(0.8, (0.75 + tier * 0.25) * scale);

    drawBracketCorners(g, x, y, half, half, arm, width, color, 0.95);
    if (tier >= 3 && lod.smoke) {
      drawBracketCorners(g, x, y, half, half, arm * 0.8, Math.max(0.5, width * 0.4), whiteHot(color, 1), 0.95 * extra);
    }

    // Yigin kertikleri: solda dikey sutun, yigin kadar.
    const pip = Math.max(MARK_PIP_SIZE, MARK_PIP_SIZE * scale);
    const gap = Math.max(MARK_PIP_GAP, MARK_PIP_GAP * scale);
    const column = s * pip + (s - 1) * gap;
    const left = x - half - gap - pip;
    const top = y - column / 2;
    g.fillStyle(color, 0.95);
    if (lod.compactMarks) {
      g.fillRect(left, top, pip, column);
      return;
    }
    for (let index = 0; index < s; index += 1) {
      g.fillRect(left, top + index * (pip + gap), pip, pip);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sunucu: gorunen bag                                                */
  /* ---------------------------------------------------------------- */

  /**
   * Bag haritanin obur ucuna gidebiliyor (global menzil): ince ve soluk
   * kaliyor. Ucunda bagli kuleyi saran ince ayrac (hangi kule bagli).
   * Kademe cizgiyi kalinlastiriyor; kademe 3'te beyaz-sicak cekirdek cizgisi.
   */
  private drawServerLinks(tower: SignatureTower, frame: SignatureFrame) {
    const tier = levelTier(tower.level);
    const profile = getVfxProfile(tower.definitionId);
    const own = frame.isOwn ? frame.isOwn(tower) : true;
    const extra = own ? 1 : TEAMMATE_EXTRA_ALPHA;
    const quiet = tower.status === "Hararet" || tower.status === "Tukenmis" ? 0.45 : 1;
    const base = 0.32 * quiet;
    const color = profile.ramp[tier - 1];
    const scale = frame.scale;
    const lod = this.options.lod;
    const linkedIds = tower.linkedTowerIds;
    if (!linkedIds) return;
    for (const linkedId of linkedIds) {
      const linked = this.findTower(frame, linkedId);
      if (!linked) continue;
      const g = this.links;
      g.lineStyle(Math.max(0.6, (0.5 + tier * 0.3) * scale), color, base);
      g.lineBetween(tower.x, tower.y, linked.x, linked.y);
      if (tier >= 3 && lod.smoke) {
        g.lineStyle(Math.max(0.5, 0.45 * scale), whiteHot(color, 1), base * 1.6 * extra);
        g.lineBetween(tower.x, tower.y, linked.x, linked.y);
      }
      const half = Math.max(6 * scale, frame.cellSize * 0.42);
      drawBracketCorners(g, linked.x, linked.y, half, half, half * 0.3, Math.max(0.6, 0.8 * scale), color, base * 2);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Izolasyon: kapatma alani ve karantina karesi                        */
  /* ---------------------------------------------------------------- */

  /**
   * Yalnizken (`auraActive`) alan: gercek yaricapta (`range`) ince bir
   * altigen sinir ve koyu bir dolgu; kademe siniri kalinlastiriyor, kademe 3'te
   * beyaz-sicak cekirdek cizgisi. Donen tarama ve akan zerre yok.
   *
   * Yalnizlik kosulu ayrica 3x3 karantina karesiyle: yalnizken tam ayraclar,
   * komsu varken soluk ve her komsuya uzanan kehribar ihlal cizgisiyle.
   * Sunucunun karari `auraActive`; komsu isareti sunucunun kuralindan.
   */
  private drawContainment(tower: SignatureTower, frame: SignatureFrame) {
    const tier = levelTier(tower.level);
    const profile = getVfxProfile(tower.definitionId);
    const own = frame.isOwn ? frame.isOwn(tower) : true;
    const extra = own ? 1 : TEAMMATE_EXTRA_ALPHA;
    const color = profile.ramp[tier - 1];
    const { scale, cellSize } = frame;
    const lod = this.options.lod;
    const g = this.ground;
    const quarantine = cellSize * 1.5;
    const spin = (fnvHash(tower.id) % 997) / 997 * (Math.PI / 3);

    if (tower.auraActive) {
      const radius = Math.max(12, tower.range ?? 0);
      g.fillStyle(darken(color, 0.7), 0.06 + tier * 0.012);
      fillDisc(g, tower.x, tower.y, radius);
      g.lineStyle(Math.max(0.7, (0.6 + tier * 0.3) * scale), color, 0.5);
      strokeHex(g, tower.x, tower.y, radius, spin);
      if (tier >= 3 && lod.smoke) {
        g.lineStyle(Math.max(0.5, 0.45 * scale), whiteHot(color, 1), 0.6 * extra);
        strokeHex(g, tower.x, tower.y, radius, spin);
      }
      // Karantina: yalnizlik saglandi.
      drawBracketCorners(this.marks, tower.x, tower.y, quarantine, quarantine, quarantine * 0.3, Math.max(0.7, (0.6 + tier * 0.2) * scale), color, 0.6);
      return;
    }

    // Komsu var: karantina acik ve soluk; komsulara ihlal isareti.
    drawBracketCorners(this.marks, tower.x, tower.y, quarantine, quarantine, quarantine * 0.22, Math.max(0.6, 0.8 * scale), color, 0.26);
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
   * Yigin kadar sayac kertigi kulenin yaninda; hedefte yiginla daralan ince
   * ayrac. Kesit lazerin merdiveni (kademe 2'de omuzlar, 3'te beyaz-sicak
   * cekirdek); paket, kosan parlama ya da kod biti yok.
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
    const own = frame.isOwn ? frame.isOwn(tower) : true;
    const extra = own ? 1 : TEAMMATE_EXTRA_ALPHA;
    const color = profile.ramp[tier - 1];

    const snapAge = (now - state.snapAt) / TETHER_SNAP_MS;
    if (snapAge >= 0 && snapAge < 1) this.drawTetherSnap(tower, state, snapAge, color, scale, still);

    if (!target) return;
    state.x2 = target.x;
    state.y2 = target.y;
    this.drawTetherBody(this.links, tower.x, tower.y, target.x, target.y, stack, tier, color, extra, scale);
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
    extra: number,
    scale: number
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
    LINE.spread = (2 + 3 * ratio) * scale;
    strokeHardBeam(g, x1, y1, x2, y2, color, tier, LINE, lod.smoke ? this.glow : undefined, alpha * (tier >= 3 ? extra : 1));

    // Sayac: yigin kadar dik kertik, kulenin yaninda (renk gormeyen de sayar).
    const half = (2 + ratio * 1.5) * scale;
    const step = Math.min(4 * scale, (length * 0.45) / OBSESSION_MAX_STACK);
    g.lineStyle(Math.max(0.6, 0.9 * scale), whiteHot(color, 0.3), 0.9);
    for (let index = 0; index < stack; index += 1) {
      const along = 9 * scale + index * step;
      if (along > length - 6 * scale) break;
      const px = x1 + ux * along;
      const py = y1 + uy * along;
      g.lineBetween(px - uy * half, py + ux * half, px + uy * half, py - ux * half);
    }
    // Hedefte yiginla daralan ince ayrac: ip kime bagli.
    const bracket = (10 - 4 * ratio) * scale;
    drawBracketCorners(g, x2, y2, bracket, bracket, bracket * 0.4, Math.max(0.6, 0.8 * scale), color, 0.45 + 0.45 * ratio);
  }

  private drawTetherSnap(tower: SignatureTower, state: TetherState, age: number, color: number, scale: number, still: boolean) {
    const g = this.links;
    const fade = 1 - age;
    const width = getTetherWidth(state.snapStack, scale) * (still ? 1 : 1 - age * 0.6);
    const mx = (tower.x + state.snapX2) / 2;
    const my = (tower.y + state.snapY2) / 2;
    // Iki yari uclarina geri cekiliyor; hareket azaltmada yerinde soner.
    const keep = still ? 0.45 : 0.5 * (1 - age);
    g.lineStyle(Math.max(0.6, width), color, 0.85 * fade);
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
   * Tavan kadar dilim (10 / 15 / 20), yigin kadari yanik; tepede tavanin
   * basladigi ve bittigi yeri gosteren kertik. Kademe yanik dilimleri
   * kalinlastiriyor; kademe 3'te uzerlerinde beyaz-sicak cekirdek cizgisi.
   * Tavanda dilimler nabiz atiyor (hareket azaltmada sabit).
   */
  private drawUcubeGauge(tower: SignatureTower, frame: SignatureFrame, still: boolean) {
    const tier = levelTier(tower.level);
    const profile = getVfxProfile(tower.definitionId);
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
    g.lineStyle(Math.max(0.6, 0.9 * scale), darken(color, 0.45), 0.32);
    for (let index = stack; index < limit; index += 1) {
      const a0 = -Math.PI / 2 + index * step + gap;
      const a1 = -Math.PI / 2 + (index + 1) * step - gap;
      g.lineBetween(tower.x + Math.cos(a0) * radius, tower.y + Math.sin(a0) * radius, tower.x + Math.cos(a1) * radius, tower.y + Math.sin(a1) * radius);
    }
    g.lineStyle(Math.max(1, (1.4 + tier * 0.35) * scale), color, 0.95 * pulse);
    for (let index = 0; index < stack; index += 1) this.gaugeSegment(g, tower, index, step, gap, radius);
    if (tier >= 3 && lod.smoke) {
      g.lineStyle(Math.max(0.5, 0.7 * scale), whiteHot(color, 1), 0.95 * extra);
      for (let index = 0; index < stack; index += 1) this.gaugeSegment(g, tower, index, step, gap, radius);
    }
    // Tavan kertigi: tepede, dilimlerin basladigi ve bittigi yer.
    g.lineStyle(Math.max(0.7, 1 * scale), whiteHot(color, 0.3), 0.9);
    g.lineBetween(tower.x, tower.y - radius - 3 * scale, tower.x, tower.y - radius + 2 * scale);
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
