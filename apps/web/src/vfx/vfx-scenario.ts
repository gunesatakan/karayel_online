/**
 * Sahte ama deterministik bir savas: VFX galerisi ve olcum icin.
 *
 * Sunucu yok. Her kule, profilindeki teslim bicimine (`delivery`) gore
 * sunucunun gonderdigi seyin aynisini uretiyor: dogrusal mermi ve onun atis
 * ve temas olaylari, ya da isin kayitlari (lazer, Gosteri, Kin dalgasi, Melis
 * lanetleri...). Hepsi zamanin saf fonksiyonu: ayni `now` ayni kareyi veriyor,
 * yavas cekimde ve duraklatmada da. `Math.random` yok; faz kaymalari kule
 * kimliginin FNV ozetinden.
 *
 * Gercek oyundaki cizicilere (AttackVfx, BeamRenderer) besleniyor; galeri
 * yeni bir cizim yazmiyor, oyunun kendi cizimini gosteriyor.
 *
 * Zeynep sahneleri (`court`): galeride Zeynep satirlari mekanigi gosteren
 * duzende -- delinecek bir dusman sirasi, kurulup bozulan dizilim, ayna
 * isininin sektigi duvar, yanik izi, Kin dalgasinin yakin/orta/uzak
 * dusmanlari, Abarti rayi. Spot isigi, damga, gecis, dizilim ve sekme
 * olaylari oyundaki gibi `ZeynepReceiptTracker`dan turuyor (`ScenarioCourtFeed`).
 */
import { towerCatalog, type BeamSnapshot, type ProjectileSnapshot, type TowerSnapshot } from "@karayel/shared";
import type { SignatureEnemy, SignatureTower } from "./atakan-signatures";
import { fnvUnit, toTier, type VfxTier } from "./kit";
import { getVfxProfile, getVfxTier, isAttackingDefinition, type VfxDelivery } from "./vfx-profiles";
import { TAHT_COPY_ID, ZeynepReceiptTracker, type CourtEventInput, type ReceiptContext, type ZeynepSignatureVfx } from "./zeynep-signatures";

export type ScenarioTower = {
  id: string;
  definitionId: string;
  level: number;
  x: number;
  y: number;
  color: number;
  own: boolean;
  /** Hedef yuruyucunun sirasi. */
  walker: number;
  /** Atis araligi (ms). */
  intervalMs: number;
  /** Galeride gosterilen menzil/alan yaricapi (Izolasyon alani); oyunun menzili hucreye sigmiyor. */
  displayRange?: number;
  /** Sunucu bagi ve Izolasyon komsusu icin hucre ici yan kule konumu. */
  anchor?: { x: number; y: number };
  /**
   * Zeynep sahnesi (galeri): mekanigi gosteren duzen. Yoksa teslim profilden.
   * - pierce: Hiza, sira halindeki dusmanlari deliyor.
   * - lances: Taht, dizilim kipleri (cift Hiza, Kin, kopya) ve bozulan dizilim.
   * - ray / burn / kin-showcase: Taht'in ayna, yanik ve Kin gosterisi kipleri.
   * - kin: Kin dalgasi yakin, orta ve uzak dusmanda.
   * - abarti: Abarti rayi; yardimci Hiza rayin icinden atiyor.
   */
  court?: CourtScene;
  /** Sahnenin dusmanlari (yuruyucu sirasi); ilk eleman hedef. */
  walkers?: number[];
  /** Ayna isininin sektigi hucre siniri. */
  bounds?: { left: number; right: number; top: number; bottom: number };
};

export type CourtScene = "pierce" | "lances" | "ray" | "burn" | "kin-showcase" | "kin" | "abarti";

export type ScenarioWalker = {
  id: string;
  /** Elips yolun merkezi ve yaricaplari. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  periodMs: number;
  phase: number;
};

export type ScenarioEvent =
  | { type: "anticipation" | "muzzle"; x: number; y: number; angle: number; definitionId: string; tier: VfxTier; own: boolean; key: string; at: number }
  | {
    type: "contact"; x: number; y: number; angle: number; definitionId: string; tier: VfxTier; own: boolean; key: string; at: number; radius?: number; walker: number;
    /** Delen merminin kimligi: ayni merminin temaslari tek ferman cizgisi. */
    projectile?: string;
  }
  /** Dogrudan saray olayi (yuk testi: butun dusmanlar Kin damgali). */
  | { type: "court"; input: CourtEventInput; at: number };

export type ScenarioFrame = {
  projectiles: ProjectileSnapshot[];
  beams: BeamSnapshot[];
  events: ScenarioEvent[];
  /**
   * Kule durumlari (Atakan imzalari): Takipci isareti, Sunucu bagi, Izolasyon
   * alani, Obsesyon yigini, Ucube yigini ve tavani -- sunucunun snapshot'ta
   * gonderdigi alanlarin aynisi, zamanin saf fonksiyonu. Yan kuleler (bag ve
   * komsu) de burada; galeri onlari soluk sprite olarak ciziyor.
   */
  signatureTowers: SignatureTower[];
  signatureEnemies: SignatureEnemy[];
};

/** Izolasyon dongusu: once yalniz (alan acik, atis yok), sonra komsulu (atis var). */
export const ISOLATION_CYCLE_MS = 6000;
/** Obsesyon dongusu: 13 atista bir hedef degisiyor (yigin 0 -> 10, tavanda bekliyor). */
export const OBSESSION_CYCLE_SHOTS = 13;
/** Galerideki Ucube yigin hizi (sn basina): oyunda 1, galeride tavan gorulsun diye 2.5. */
export const GALLERY_UCUBE_STACKS_PER_SECOND = 2.5;
/** Takipci isaretinin galerideki omru (son temastan). */
export const GALLERY_MARK_MS = 2600;

/** Galerideki mermi hizi (dunya birimi / sn): ucus gorulecek kadar yavas. */
export const SCENARIO_PROJECTILE_SPEED = 230;
const DEBUG_LASER_COLORS: Record<VfxTier, { beam: number; overdrive: number }> = {
  1: { beam: 0xef4444, overdrive: 0xfbbf24 },
  2: { beam: 0x60a5fa, overdrive: 0x60a5fa },
  3: { beam: 0xffffff, overdrive: 0xffffff }
};

export function walkerPosition(walker: ScenarioWalker, now: number) {
  const angle = (now / walker.periodMs) * Math.PI * 2 + walker.phase;
  return { x: walker.cx + Math.cos(angle) * walker.rx, y: walker.cy + Math.sin(angle) * walker.ry };
}

export class VfxScenario {
  /**
   * @param options.teamMarkEvery Yuk testi: her N. yuruyucu takimin Takipci'leriyle
   *   uc yigin isaretli (4 oyunculu macta 2-3 Takipci ~15 dusmani isaretli tutuyor).
   */
  /**
   * @param options.kinBrandEvery Yuk testi: her N. yuruyucu Kin damgali (1 = hepsi,
   *   kalabalik dalgada iki Kin kulesinin gercekci en kotu durumu).
   */
  constructor(readonly towers: readonly ScenarioTower[], readonly walkers: readonly ScenarioWalker[], readonly options: { teamMarkEvery?: number; kinBrandEvery?: number } = {}) {}

  /** `now` anindaki mermi ve isinlar, ve (since, now] araligindaki olaylar. */
  frame(now: number, since: number): ScenarioFrame {
    const frame: ScenarioFrame = { projectiles: [], beams: [], events: [], signatureTowers: [], signatureEnemies: [] };
    const markEvery = this.options.teamMarkEvery ?? 0;
    // Takimin isaretleri sahnedeki ilk Takipci'den (kademesi ve sahibi oradan).
    const marker = this.towers.find((tower) => tower.definitionId === "warrior-1")?.id;
    this.walkers.forEach((walker, index) => {
      const position = walkerPosition(walker, now);
      const marked = markEvery > 0 && index % markEvery === 0;
      frame.signatureEnemies.push({ id: walker.id, x: position.x, y: position.y, trackingStacks: marked ? 3 : undefined, k: marked ? marker : undefined });
    });
    for (const tower of this.towers) {
      const profile = getVfxProfile(tower.definitionId, tower.color);
      const tier = toTier(levelTier(tower.level));
      const walker = this.walkers[tower.walker % this.walkers.length];
      const phase = fnvUnit(tower.id) * tower.intervalMs;
      if (tower.court) {
        this.deliverCourt(tower, tier, phase, now, since, frame);
        continue;
      }
      const lastContact = this.deliver(profile.delivery, tower, tier, walker, phase, now, since, frame);
      this.signature(tower, tier, phase, now, lastContact, frame);
    }
    this.brandAll(now, since, frame);
    return frame;
  }

  /**
   * Yuk testi: her N. yuruyucu saniyede bir yeniden Kin damgasi aliyor
   * (1.3 sn omurlu; damga hic dusmuyor). Guc yuruyucunun sirasindan (1-3).
   */
  private brandAll(now: number, since: number, frame: ScenarioFrame) {
    const every = this.options.kinBrandEvery ?? 0;
    if (every <= 0) return;
    this.walkers.forEach((walker, index) => {
      if (index % every !== 0) return;
      const offset = fnvUnit(walker.id, 9) * 1000;
      const beat = Math.floor((now + offset) / 1000);
      const at = beat * 1000 - offset;
      if (!(at > since && at <= now)) return;
      const position = walkerPosition(walker, at);
      frame.events.push({
        type: "court",
        at,
        input: { kind: "brand", key: walker.id, x: position.x, y: position.y, color: 0x7f1d1d, tier: 3, own: index % 4 !== 0, durationMs: 1300, strength: (index % 3) + 1, angle: 0 }
      });
    });
  }

  /** Izolasyon kulesi su an yalniz mi (alan acik, atis yok). */
  isIsolated(tower: ScenarioTower, at: number) {
    if (tower.definitionId !== "warrior-3") return false;
    const phase = fnvUnit(tower.id, 7) * ISOLATION_CYCLE_MS;
    return ((at + phase) % ISOLATION_CYCLE_MS) < ISOLATION_CYCLE_MS / 2;
  }

  /**
   * Kulenin snapshot durumu: sunucunun gonderecegi alanlar.
   *
   * - Takipci: hedef yuruyucu son temastan 2.6 sn isaretli; `k` isaretleyen
   *   kule. Yigin sunucudaki canli yuva sayisi: sv 1-4 Takipci vurusta 1,
   *   5-9 iki, 10 uc yuvayi doldurur (Debug Lazer tuketince oyunda duser).
   * - Sunucu: hucredeki yan kuleye bagli.
   * - Izolasyon: yalnizken `auraActive`, komsuluyken yan kule hucrede.
   * - Obsesyon: son atisa gore yigin (`o`) ve hedef (`t`); 13 atista bir
   *   hedef degisiyor ve yigin sifirlaniyor.
   * - Ucube: yigin saniyede 2.5 artiyor, tavanda 2 sn bekliyor, asiri isinip
   *   1 sn sifirda kaliyor. Tavan sutuna gore 10 / 15 / 20 (`m`).
   */
  private signature(tower: ScenarioTower, tier: VfxTier, phase: number, now: number, lastContact: number, frame: ScenarioFrame) {
    const state: SignatureTower = { id: tower.id, definitionId: tower.definitionId, x: tower.x, y: tower.y, level: tower.level, ownerId: tower.own ? undefined : "teammate" };
    frame.signatureTowers.push(state);
    const walker = this.walkers[tower.walker % this.walkers.length];
    switch (tower.definitionId) {
      case "warrior-1": {
        if (now - lastContact >= GALLERY_MARK_MS) return;
        const enemy = frame.signatureEnemies[this.walkers.indexOf(walker)];
        if (enemy) {
          enemy.trackingStacks = Math.max(enemy.trackingStacks ?? 0, tier);
          enemy.k = tower.id;
        }
        return;
      }
      case "warrior-2": {
        if (!tower.anchor) return;
        const anchorId = `${tower.id}-bag`;
        state.linkedTowerIds = [anchorId];
        frame.signatureTowers.push({ id: anchorId, definitionId: "warrior-1", x: tower.anchor.x, y: tower.anchor.y, level: 1 });
        return;
      }
      case "warrior-3": {
        state.range = tower.displayRange ?? 34;
        state.auraActive = this.isIsolated(tower, now);
        if (!state.auraActive && tower.anchor) {
          frame.signatureTowers.push({ id: `${tower.id}-komsu`, definitionId: "warrior-1", x: tower.anchor.x, y: tower.anchor.y, level: 1 });
        }
        return;
      }
      case "warrior-4": {
        const shot = Math.floor((now - phase) / tower.intervalMs);
        if (shot < 0) return;
        const stack = Math.min(10, shot % OBSESSION_CYCLE_SHOTS);
        if (stack > 0) {
          state.o = stack;
          state.t = walker.id;
        }
        return;
      }
      case "warrior-6": {
        const cap = tower.level >= 10 ? 20 : tower.level >= 5 ? 15 : 10;
        const riseMs = (cap / GALLERY_UCUBE_STACKS_PER_SECOND) * 1000;
        const cycle = riseMs + 3000;
        const t = (now + phase * 3) % cycle;
        const stack = t < riseMs ? Math.floor((t / 1000) * GALLERY_UCUBE_STACKS_PER_SECOND) : t < riseMs + 2000 ? cap : 0;
        if (stack > 0) state.u = stack;
        if (cap !== 10) state.m = cap;
        return;
      }
      default:
    }
  }

  /** Teslim; donen deger son temasin ani (mermili teslimlerde), yoksa -Infinity. */
  private deliver(delivery: VfxDelivery, tower: ScenarioTower, tier: VfxTier, walker: ScenarioWalker, phase: number, now: number, since: number, frame: ScenarioFrame): number {
    const target = walkerPosition(walker, now);
    const tierField = tier === 1 ? undefined : tier;
    switch (delivery) {
      case "laser": {
        // Surekli isin; kademe 3'te her 4 sn'de 1.5 sn asiri yukleme supurmesi.
        const cycle = (now + phase) % 4000;
        const overdrive = tier === 3 && cycle > 2500;
        let x2 = target.x;
        let y2 = target.y;
        if (overdrive) {
          const sweep = Math.atan2(target.y - tower.y, target.x - tower.x) + Math.sin((cycle - 2500) / 240) * 0.6;
          x2 = tower.x + Math.cos(sweep) * 150;
          y2 = tower.y + Math.sin(sweep) * 150;
        }
        frame.beams.push({
          id: `beam-${tower.id}`,
          definitionId: tower.definitionId,
          tier: tierField,
          x1: tower.x,
          y1: tower.y,
          x2,
          y2,
          width: overdrive ? 8 : 4,
          color: overdrive ? DEBUG_LASER_COLORS[tier].overdrive : DEBUG_LASER_COLORS[tier].beam,
          overdrive,
          ttlMs: 260
        });
        return Number.NEGATIVE_INFINITY;
      }
      case "showcase":
      case "curse":
      case "kin":
      case "underworld":
      case "orbit":
        this.deliverBeams(delivery, tower, tier, walker, phase, now, since, frame);
        return Number.NEGATIVE_INFINITY;
      default:
        return this.deliverProjectiles(tower, tier, walker, phase, now, since, frame);
    }
  }

  /** Dogrusal mermiler: atis anindaki hedefe, sabit hizla; temasi ucusun sonunda. */
  private deliverProjectiles(tower: ScenarioTower, tier: VfxTier, walker: ScenarioWalker, phase: number, now: number, since: number, frame: ScenarioFrame) {
    let lastContact = Number.NEGATIVE_INFINITY;
    const profile = getVfxProfile(tower.definitionId, tower.color);
    const recipe = getVfxTier(profile, tier);
    const definitionId = tower.definitionId === "archer-6" ? "archer-6-whisper" : tower.definitionId;
    const interval = tower.intervalMs;
    const latest = Math.floor((now + recipe.muzzle.anticipationMs - phase) / interval);
    for (let shot = latest; shot >= latest - 6 && shot >= 0; shot -= 1) {
      const firedAt = phase + shot * interval;
      const aim = walkerPosition(walker, firedAt + 200);
      const dx = aim.x - tower.x;
      const dy = aim.y - tower.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const flightMs = (length / SCENARIO_PROJECTILE_SPEED) * 1000;
      const arrivesAt = firedAt + flightMs;
      // Yalniz Izolasyon Kulesi atmiyor: alan acik.
      if (this.isIsolated(tower, firedAt)) continue;
      if (arrivesAt <= now && arrivesAt > lastContact) lastContact = arrivesAt;
      if (arrivesAt < since - 1) break;
      const angle = Math.atan2(dy, dx);
      const key = `${tower.id}-p${shot}`;
      const tierField = tier === 1 ? undefined : tier;
      const anticipateAt = firedAt - recipe.muzzle.anticipationMs;
      if (recipe.muzzle.anticipationMs > 0 && anticipateAt > since && anticipateAt <= now) {
        frame.events.push({ type: "anticipation", x: tower.x, y: tower.y, angle, definitionId, tier, own: tower.own, key, at: anticipateAt });
      }
      if (firedAt > since && firedAt <= now) {
        frame.events.push({ type: "muzzle", x: tower.x, y: tower.y, angle, definitionId, tier, own: tower.own, key, at: firedAt });
      }
      if (arrivesAt > since && arrivesAt <= now) {
        frame.events.push({
          type: "contact", x: aim.x, y: aim.y, angle, definitionId, tier, own: tower.own, key, at: arrivesAt,
          radius: profile.aoe ? 26 + (tower.level - 1) * 3 : undefined,
          walker: tower.walker,
          projectile: key
        });
      }
      // Hiza deliyor: ayni dogrultuda bir dusman daha (ferman cizgisi olculsun).
      const pierceAt = arrivesAt + (16 / SCENARIO_PROJECTILE_SPEED) * 1000;
      if (tower.definitionId === "zeynep-1" && pierceAt > since && pierceAt <= now) {
        frame.events.push({
          type: "contact", x: aim.x + (dx / length) * 16, y: aim.y + (dy / length) * 16, angle, definitionId, tier, own: tower.own, key: `${key}-2`, at: pierceAt,
          walker: tower.walker,
          projectile: key
        });
      }
      if (now >= firedAt && now < arrivesAt) {
        const t = (now - firedAt) / flightMs;
        frame.projectiles.push({
          id: key,
          kind: "tower",
          source: "tower",
          definitionId,
          hitType: "projectile",
          x: tower.x + dx * t,
          y: tower.y + dy * t,
          vx: (dx / length) * SCENARIO_PROJECTILE_SPEED,
          vy: (dy / length) * SCENARIO_PROJECTILE_SPEED,
          tier: tierField
        });
      }
      // Temastan sonra kisa omurlu isinlar.
      const since2 = now - arrivesAt;
      if (since2 >= 0 && since2 < 520) {
        if (tower.definitionId === "warrior-6" && since2 < 190) this.pushChain(tower, tier, aim, shot, since2, frame);
        if (tower.definitionId === "archer-5" && shot % 3 === 0) {
          frame.beams.push({ id: `${key}-mirror`, definitionId: "archer-5-mirror", tier: tierField, x1: tower.x, y1: tower.y, x2: aim.x, y2: aim.y, width: 36, color: tower.color, overdrive: false, ttlMs: 520 - since2 });
        }
        if (tower.definitionId === "archer-2" && shot % 4 === 0 && since2 < 380) {
          frame.beams.push({ id: `${key}-rage`, definitionId: "archer-2-rage", tier: tierField, x1: tower.x, y1: tower.y, x2: tower.x, y2: tower.y, width: 64, color: 0xdb2777, overdrive: false, ttlMs: 380 - since2 });
        }
      }
    }
    return lastContact;
  }

  private pushChain(tower: ScenarioTower, tier: VfxTier, from: { x: number; y: number }, shot: number, age: number, frame: ScenarioFrame) {
    if (age < 0 || age >= 190) return;
    const angle = fnvUnit(`${tower.id}-${shot}`) * Math.PI * 2;
    frame.beams.push({
      id: `chain-${tower.id}-${shot}`,
      definitionId: "warrior-6",
      tier: tier === 1 ? undefined : tier,
      x1: from.x,
      y1: from.y,
      x2: from.x + Math.cos(angle) * 34,
      y2: from.y + Math.sin(angle) * 34,
      width: 5,
      // Sunucunun zincir rengi: Ucube limonu.
      color: 0xadf765,
      overdrive: false,
      ttlMs: 190 - age
    });
  }

  /* ---------------------------------------------------------------- */
  /* Zeynep sahneleri                                                    */
  /* ---------------------------------------------------------------- */

  private deliverCourt(tower: ScenarioTower, tier: VfxTier, phase: number, now: number, since: number, frame: ScenarioFrame) {
    const state: SignatureTower & { characterId?: TowerSnapshot["characterId"]; orientation?: "horizontal" | "vertical" } = {
      id: tower.id, definitionId: tower.definitionId, x: tower.x, y: tower.y, level: tower.level, ownerId: tower.own ? undefined : "teammate", characterId: "zeynep"
    };
    frame.signatureTowers.push(state);
    const walkers = (tower.walkers ?? [tower.walker]).map((index) => this.walkers[index % this.walkers.length]);
    switch (tower.court) {
      case "pierce":
        this.courtPierce(tower, tier, walkers, phase, now, since, frame, tower.definitionId, tower.x, tower.y);
        return;
      case "lances":
        this.courtLances(tower, tier, walkers, phase, now, since, frame);
        return;
      case "ray":
        this.courtPartners(tower, frame, ["zeynep-1", "zeynep-2"]);
        this.courtRay(tower, tier, walkers[0], phase, now, frame);
        return;
      case "burn":
        this.courtPartners(tower, frame, ["zeynep-2", "zeynep-2"]);
        this.courtBurn(tower, tier, walkers, phase, now, frame);
        return;
      case "kin-showcase":
        this.courtPartners(tower, frame, ["zeynep-2", "zeynep-6"]);
        this.courtKinShowcase(tower, tier, walkers, phase, now, frame);
        return;
      case "kin":
        state.range = tower.displayRange ?? 88;
        this.deliverBeams("kin", tower, tier, walkers[Math.min(1, walkers.length - 1)], phase, now, since, frame);
        return;
      case "abarti": {
        // Ray dikey; yardimci Hiza rayin solunda, sabit seviyede (nabzin kademesi Abarti'nin).
        state.orientation = "vertical";
        const helper = { ...tower, id: `${tower.id}-hiza`, definitionId: "zeynep-1", level: 1, x: tower.anchor?.x ?? tower.x - 22, y: tower.anchor?.y ?? tower.y, court: "pierce" as const };
        frame.signatureTowers.push({ id: helper.id, definitionId: "zeynep-1", x: helper.x, y: helper.y, level: 1, ownerId: state.ownerId, characterId: "zeynep" } as SignatureTower);
        this.courtPierce(helper, 1, walkers, phase, now, since, frame, "zeynep-1", helper.x, helper.y);
        return;
      }
      default:
    }
  }

  /** Dizilim uyeleri: Taht'in ust ve sag ustunde (galerinin karesi 22). */
  private courtPartners(tower: ScenarioTower, frame: ScenarioFrame, ids: readonly string[]) {
    const cell = GALLERY_COURT_CELL;
    const spots = [{ x: tower.x, y: tower.y - cell }, { x: tower.x + cell, y: tower.y - cell }];
    ids.forEach((definitionId, index) => {
      frame.signatureTowers.push({
        id: `${tower.id}-uye${index}`, definitionId, x: spots[index].x, y: spots[index].y, level: tower.level,
        ownerId: tower.own ? undefined : "teammate", characterId: "zeynep"
      } as SignatureTower);
    });
  }

  /**
   * Delen atis: ilk dusmana nisan, ayni dogrultuda arkasindaki dusmani da
   * deliyor (Hiza 2 dusman), ikinci temasta mermi bitiyor.
   */
  private courtPierce(tower: ScenarioTower, tier: VfxTier, walkers: readonly ScenarioWalker[], phase: number, now: number, since: number, frame: ScenarioFrame, definitionId: string, originX: number, originY: number, salvo = 0) {
    const recipe = getVfxTier(getVfxProfile(definitionId), tier);
    const interval = tower.intervalMs;
    const latest = Math.floor((now + recipe.muzzle.anticipationMs - phase) / interval);
    for (let shot = latest; shot >= latest - 4 && shot >= 0; shot -= 1) {
      const firedAt = phase + shot * interval;
      const first = walkerPosition(walkers[0], firedAt + 200);
      const dx = first.x - originX;
      const dy = first.y - originY;
      const length = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / length;
      const uy = dy / length;
      const angle = Math.atan2(dy, dx);
      const key = `${tower.id}-p${shot}${salvo ? `s${salvo}` : ""}`;
      // Temaslar: ilk dusman ve dogrultudaki ikinci (izdusumu).
      const hits: Array<{ along: number; walker: number }> = [{ along: length, walker: this.walkers.indexOf(walkers[0]) }];
      if (walkers.length > 1) {
        const second = walkerPosition(walkers[1], firedAt + 200);
        const along = (second.x - originX) * ux + (second.y - originY) * uy;
        if (along > length + 4) hits.push({ along, walker: this.walkers.indexOf(walkers[1]) });
      }
      const end = hits[hits.length - 1].along;
      const endAt = firedAt + (end / SCENARIO_PROJECTILE_SPEED) * 1000;
      if (endAt < since - 1) break;
      const tierField = tier === 1 ? undefined : tier;
      const anticipateAt = firedAt - recipe.muzzle.anticipationMs;
      if (recipe.muzzle.anticipationMs > 0 && anticipateAt > since && anticipateAt <= now) {
        frame.events.push({ type: "anticipation", x: originX, y: originY, angle, definitionId, tier, own: tower.own, key, at: anticipateAt });
      }
      if (firedAt > since && firedAt <= now) {
        frame.events.push({ type: "muzzle", x: originX, y: originY, angle, definitionId, tier, own: tower.own, key, at: firedAt });
      }
      hits.forEach((hit, index) => {
        const at = firedAt + (hit.along / SCENARIO_PROJECTILE_SPEED) * 1000;
        if (at > since && at <= now) {
          frame.events.push({
            type: "contact", x: originX + ux * hit.along, y: originY + uy * hit.along, angle, definitionId, tier, own: tower.own,
            key: `${key}-c${index}`, at, walker: hit.walker, projectile: key
          });
        }
      });
      if (now >= firedAt && now < endAt) {
        const travelled = ((now - firedAt) / 1000) * SCENARIO_PROJECTILE_SPEED;
        frame.projectiles.push({
          id: key, kind: "tower", source: "tower", definitionId, hitType: "projectile",
          x: originX + ux * travelled, y: originY + uy * travelled,
          vx: ux * SCENARIO_PROJECTILE_SPEED, vy: uy * SCENARIO_PROJECTILE_SPEED, tier: tierField
        });
      }
    }
  }

  /**
   * Taht'in mizraklari: 16 sn'lik dongu. Cift Hiza (iki mizrak), Hiza + Kin
   * (Kin mizragi), iki Taht + Hiza (kopya), sonra dizilim bozuluyor (uye
   * gidiyor, Taht susuyor).
   */
  private courtLances(tower: ScenarioTower, tier: VfxTier, walkers: readonly ScenarioWalker[], phase: number, now: number, since: number, frame: ScenarioFrame) {
    const mode = getCourtLanceMode(now);
    if (mode === "broken") {
      this.courtPartners(tower, frame, ["zeynep-1"]);
      return;
    }
    const partners = mode === "dual" ? ["zeynep-1", "zeynep-1"] : mode === "kin" ? ["zeynep-1", "zeynep-6"] : ["zeynep-3", "zeynep-1"];
    this.courtPartners(tower, frame, partners);
    const definitionId = mode === "dual" ? "zeynep-3" : mode === "kin" ? "zeynep-3-kin-projectile" : TAHT_COPY_ID;
    // Atislar yalnizca bu kipin araliginda (kip degisince eski mizrak yolda biter).
    const start = Math.floor(now / COURT_LANCE_CYCLE_MS) * COURT_LANCE_CYCLE_MS + COURT_LANCE_MODES.indexOf(mode) * COURT_LANCE_PHASE_MS;
    const local = Math.max(phase, start);
    this.courtPierce(tower, tier, walkers.slice(0, 1), local, now, Math.max(since, start), frame, definitionId, tower.x, tower.y);
    if (mode === "dual" && walkers.length > 1) {
      this.courtPierce(tower, tier, walkers.slice(1, 2), local, now, Math.max(since, start), frame, definitionId, tower.x, tower.y, 2);
    }
  }

  /** Ayna isini: hucrenin kenarindan sekiyor; gorunen parca kuyruk -> sekme -> bas. */
  private courtRay(tower: ScenarioTower, tier: VfxTier, walker: ScenarioWalker, phase: number, now: number, frame: ScenarioFrame) {
    const interval = tower.intervalMs;
    const shot = Math.floor((now - phase) / interval);
    if (shot < 0) return;
    const firedAt = phase + shot * interval;
    const bounds = tower.bounds ?? { left: tower.x - 30, right: tower.x + 100, top: tower.y - 30, bottom: tower.y + 34 };
    const target = walkerPosition(walker, firedAt);
    const segments = getCourtRaySegments(tower.x, tower.y, target.x, target.y, 2, bounds);
    let total = 0;
    for (const segment of segments) total += segment.length;
    const head = ((now - firedAt) / 1000) * COURT_RAY_SPEED;
    if (head > total) return;
    const tail = Math.max(0, head - COURT_RAY_LENGTH);
    const headPoint = pointOnSegments(segments, head);
    const tailPoint = pointOnSegments(segments, tail);
    const bounces: number[] = [];
    let travelled = 0;
    for (let index = 0; index < segments.length - 1; index += 1) {
      travelled += segments[index].length;
      if (travelled > tail && travelled < head) bounces.push(Math.round(segments[index].x2 * 100) / 100, Math.round(segments[index].y2 * 100) / 100);
    }
    frame.beams.push({
      id: `zeynep-ray-${tower.id}-${shot}`,
      definitionId: "zeynep-3-ray",
      tier: tier === 1 ? undefined : tier,
      x1: tailPoint.x, y1: tailPoint.y, x2: headPoint.x, y2: headPoint.y,
      width: 14,
      color: headPoint.segment === 0 ? 0xe879f9 : 0xf0abfc,
      overdrive: false,
      ttlMs: 140,
      ...(bounces.length > 0 ? { b: bounces } : {})
    });
  }

  /** Yanik: flas hattin uzerinde, iz 500 ms sonra; iz 3 sn yaniyor. */
  private courtBurn(tower: ScenarioTower, tier: VfxTier, walkers: readonly ScenarioWalker[], phase: number, now: number, frame: ScenarioFrame) {
    const interval = tower.intervalMs;
    const tierField = tier === 1 ? undefined : tier;
    for (let shot = Math.floor((now - phase) / interval); shot >= 0 && shot >= Math.floor((now - phase) / interval) - 1; shot -= 1) {
      const firedAt = phase + shot * interval;
      const age = now - firedAt;
      const aim = walkerPosition(walkers[Math.min(1, walkers.length - 1)], firedAt);
      const angle = Math.atan2(aim.y - tower.y, aim.x - tower.x);
      const reach = 88;
      const x2 = tower.x + Math.cos(angle) * reach;
      const y2 = tower.y + Math.sin(angle) * reach;
      if (age >= 0 && age < 260) {
        frame.beams.push({ id: `zeynep-burn-${tower.id}-${shot}`, definitionId: "zeynep-3-burn", tier: tierField, x1: tower.x, y1: tower.y, x2, y2, width: 18, color: 0x22d3ee, overdrive: false, ttlMs: 260 - age });
      }
      if (age >= 500 && age < 3500) {
        frame.beams.push({ id: `zeynep-burn-trail-${tower.id}-${shot}`, definitionId: "zeynep-3-burn-trail", tier: tierField, x1: tower.x, y1: tower.y, x2, y2, width: 22, color: 0x0e7490, overdrive: false, ttlMs: 3500 - age });
      }
    }
  }

  /** Taht'in Kin gosterisi: gercek 60 derecelik koni, dusman kumesinin uzerinde. */
  private courtKinShowcase(tower: ScenarioTower, tier: VfxTier, walkers: readonly ScenarioWalker[], phase: number, now: number, frame: ScenarioFrame) {
    const interval = tower.intervalMs;
    const shot = Math.floor((now - phase) / interval);
    if (shot < 0) return;
    const firedAt = phase + shot * interval;
    const age = now - firedAt;
    if (age >= 260) return;
    const aim = walkerPosition(walkers[Math.min(1, walkers.length - 1)], firedAt);
    const angle = Math.atan2(aim.y - tower.y, aim.x - tower.x);
    const range = 76;
    frame.beams.push({
      id: `kin-showcase-${tower.id}-${shot}`,
      definitionId: "zeynep-3-kin-showcase",
      tier: tier === 1 ? undefined : tier,
      x1: tower.x, y1: tower.y, x2: tower.x + Math.cos(angle) * range, y2: tower.y + Math.sin(angle) * range,
      width: Math.tan(Math.PI / 6) * range * 2,
      color: 0xef4444,
      overdrive: false,
      ttlMs: 260 - age
    });
  }

  /** Isin teslimleri: sunucunun isin kayitlarinin zaman icindeki hali. */
  private deliverBeams(delivery: VfxDelivery, tower: ScenarioTower, tier: VfxTier, walker: ScenarioWalker, phase: number, now: number, since: number, frame: ScenarioFrame) {
    const tierField = tier === 1 ? undefined : tier;
    const interval = tower.intervalMs;
    const shot = Math.floor((now - phase) / interval);
    const firedAt = phase + shot * interval;
    const age = now - firedAt;
    const target = walkerPosition(walker, firedAt);
    const key = `${tower.id}-b${shot}`;
    const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    const contact = (at: number, x: number, y: number) => {
      if (at > since && at <= now) {
        frame.events.push({ type: "contact", x, y, angle, definitionId: tower.definitionId, tier, own: tower.own, key: `${key}-c`, at, walker: tower.walker });
      }
    };
    switch (delivery) {
      case "showcase":
        if (age < 260) {
          const reach = 120;
          frame.beams.push({ id: key, definitionId: tower.definitionId, tier: tierField, x1: tower.x, y1: tower.y, x2: tower.x + Math.cos(angle) * reach, y2: tower.y + Math.sin(angle) * reach, width: 18, color: tower.color, overdrive: false, ttlMs: 260 - age });
        }
        contact(firedAt, target.x, target.y);
        return;
      case "kin": {
        // Dalga 600 ms'de menziline yuruyor, sonra 120 ms'de soner.
        const travel = Math.min(1, age / 600);
        if (age < 720) {
          const distance = 18 + travel * 70;
          frame.beams.push({ id: key, definitionId: tower.definitionId, tier: tierField, x1: tower.x, y1: tower.y, x2: tower.x + Math.cos(angle) * distance, y2: tower.y + Math.sin(angle) * distance, width: distance * 1.1, color: 0x7f1d1d, overdrive: false, ttlMs: age < 600 ? 120 : 720 - age });
        }
        return;
      }
      case "curse":
        if (age < 320) {
          frame.beams.push({ id: `melis-curse-${tower.id}`, definitionId: "archer-3-curse", tier: tierField, x1: tower.x, y1: tower.y, x2: target.x, y2: target.y, width: 34, color: 0x7f1dff, overdrive: false, ttlMs: 320 - age });
        }
        if (shot % 3 === 0 && age >= 200 && age < 560) {
          frame.beams.push({ id: `${key}-burst`, definitionId: "archer-3-curse-burst", tier: tierField, x1: target.x, y1: target.y, x2: target.x, y2: target.y, width: 52, color: 0xa855f7, overdrive: false, ttlMs: 560 - age });
        }
        contact(firedAt + 120, target.x, target.y);
        return;
      case "underworld": {
        const live = walkerPosition(walker, now);
        frame.beams.push({ id: `melis-underworld-link-${tower.id}`, definitionId: "archer-4-underworld-link", tier: tierField, x1: tower.x, y1: tower.y, x2: live.x, y2: live.y, width: 8, color: 0x2dd4bf, overdrive: false, ttlMs: 120 });
        if (shot % 3 === 0 && age < 420) {
          frame.beams.push({ id: `${key}-exec`, definitionId: "archer-4-underworld-execute", tier: tierField, x1: tower.x, y1: tower.y, x2: live.x, y2: live.y, width: 34, color: 0x2dd4bf, overdrive: false, ttlMs: 420 - age });
        }
        return;
      }
      case "orbit":
        // Testere bicaklari kulenin ustunde (oyunda kule katmani); galeride
        // yalnizca bicagin dusmana degdigi an.
        contact(firedAt, target.x, target.y);
        return;
      default:
    }
  }
}

export function levelTier(level: number) {
  return level >= 10 ? 3 : level >= 5 ? 2 : 1;
}

/** Galerinin harita karesi (VfxGalleryScene `GALLERY_CELL`): dizilim komsulugu bununla. */
export const GALLERY_COURT_CELL = 22;
/** Taht mizrak sahnesinin dongusu: dort kip, her biri 4 sn. */
export const COURT_LANCE_PHASE_MS = 4000;
export const COURT_LANCE_MODES = ["dual", "kin", "copy", "broken"] as const;
export const COURT_LANCE_CYCLE_MS = COURT_LANCE_PHASE_MS * COURT_LANCE_MODES.length;
/** Galerideki ayna isini: gorunen boy ve hiz (oyunda 4 kare, 930 birim/sn). */
const COURT_RAY_LENGTH = 36;
const COURT_RAY_SPEED = 260;

export function getCourtLanceMode(now: number) {
  return COURT_LANCE_MODES[Math.floor((((now % COURT_LANCE_CYCLE_MS) + COURT_LANCE_CYCLE_MS) % COURT_LANCE_CYCLE_MS) / COURT_LANCE_PHASE_MS)];
}

type CourtRaySegment = { x1: number; y1: number; x2: number; y2: number; length: number };

/** Sunucunun `getMirrorBeamSegments`i: hucre sinirindan sekme. */
function getCourtRaySegments(x1: number, y1: number, tx: number, ty: number, bounces: number, bounds: { left: number; right: number; top: number; bottom: number }) {
  const length = Math.max(1, Math.hypot(tx - x1, ty - y1));
  let nx = (tx - x1) / length;
  let ny = (ty - y1) / length;
  let sx = x1;
  let sy = y1;
  const segments: CourtRaySegment[] = [];
  for (let index = 0; index <= bounces; index += 1) {
    const tX = nx > 0 ? (bounds.right - sx) / nx : nx < 0 ? (bounds.left - sx) / nx : Number.POSITIVE_INFINITY;
    const tY = ny > 0 ? (bounds.bottom - sy) / ny : ny < 0 ? (bounds.top - sy) / ny : Number.POSITIVE_INFINITY;
    const t = Math.max(0, Math.min(tX, tY));
    const ex = sx + nx * t;
    const ey = sy + ny * t;
    segments.push({ x1: sx, y1: sy, x2: ex, y2: ey, length: Math.hypot(ex - sx, ey - sy) });
    if (tX < tY) nx = -nx;
    else ny = -ny;
    sx = ex + nx * 0.01;
    sy = ey + ny * 0.01;
  }
  return segments;
}

function pointOnSegments(segments: readonly CourtRaySegment[], distance: number) {
  let remaining = Math.max(0, distance);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (remaining <= segment.length) {
      const t = segment.length > 0 ? remaining / segment.length : 1;
      return { x: segment.x1 + (segment.x2 - segment.x1) * t, y: segment.y1 + (segment.y2 - segment.y1) * t, segment: index };
    }
    remaining -= segment.length;
  }
  const last = segments[segments.length - 1];
  return { x: last.x2, y: last.y2, segment: segments.length - 1 };
}

/** Galeri satiri: bir kule tanimi ve (Zeynep'te) gosterdigi sahne. */
export type GalleryRow = { key: string; definitionId: string; court?: CourtScene; label?: string; death?: GalleryDeathRow };

/** Olum satirinin bir hucresi: dusman tipi (doku ve agirlik), ucan mi. */
export type GalleryDeathCell = { type: "grunt" | "runner" | "shooter" | "brute" | "siege"; air?: boolean; label: string };
export type GalleryDeathRow = { race: "meka" | "spaceBug" | "fourthDimensional" | "holyGuardian" | "fallen" | "golem"; cells: readonly [GalleryDeathCell, GalleryDeathCell, GalleryDeathCell] };

/**
 * Galerinin olum satirlari: her irk (malzeme) siradan, kosucu ve agir
 * dusmanla; mekanin ek satiri nisanci, kusatma ve ucan dusman. Boylece her
 * dusman tipi ve agirligi yan yana gorunuyor.
 */
export const GALLERY_DEATH_ROWS: readonly GalleryDeathRow[] = [
  ...(["meka", "holyGuardian", "spaceBug", "fourthDimensional", "golem", "fallen"] as const).map((race) => ({
    race,
    cells: [
      { type: "grunt", label: "grunt" },
      { type: "runner", label: "koşucu" },
      { type: "brute", label: "brute (ağır)" }
    ] as const
  })),
  {
    race: "meka",
    cells: [
      { type: "shooter", label: "nişancı" },
      { type: "siege", label: "kuşatma (ağır)" },
      { type: "grunt", air: true, label: "ucan" }
    ]
  }
];

/** Olum satirinin dokusu (GameScene `getEnemyTextureKey` ile ayni kural). */
export function getGalleryDeathTexture(race: GalleryDeathRow["race"], type: GalleryDeathCell["type"]) {
  const art = type === "siege" ? "brute" : type;
  return race === "meka" ? `enemy-${art}` : `enemy-${race}-${art}`;
}

/**
 * Galerinin satirlari: saldiran kuleler katalog sirasiyla; Zeynep'in Taht'i
 * kiplerine bolunuyor (mizrak + dizilim, ayna, yanik, Kin gosterisi) ve
 * Abarti (ates etmiyor, saldiri sayilmiyor) gecis nabziyla ekleniyor.
 */
export function getGalleryRows(): GalleryRow[] {
  const rows: GalleryRow[] = [];
  for (const id of getAttackingDefinitionIds()) {
    switch (id) {
      case "zeynep-1":
        rows.push({ key: id, definitionId: id, court: "pierce" });
        break;
      case "zeynep-2":
        rows.push({ key: id, definitionId: id });
        break;
      case "zeynep-3":
        rows.push({ key: id, definitionId: id, court: "lances", label: "mızrak + dizilim" });
        rows.push({ key: `${id}:ayna`, definitionId: id, court: "ray", label: "ayna sekmesi" });
        rows.push({ key: `${id}:yanik`, definitionId: id, court: "burn", label: "yanık izi" });
        rows.push({ key: `${id}:kin`, definitionId: id, court: "kin-showcase", label: "Kin gösterisi" });
        break;
      case "zeynep-6":
        rows.push({ key: id, definitionId: id, court: "kin" });
        rows.push({ key: "zeynep-8", definitionId: "zeynep-8", court: "abarti", label: "geçiş nabzı" });
        break;
      default:
        rows.push({ key: id, definitionId: id });
    }
  }
  GALLERY_DEATH_ROWS.forEach((death, index) => {
    rows.push({ key: `death-${index}`, definitionId: "", death, label: death.race });
  });
  return rows;
}

/**
 * Senaryonun Zeynep olaylarini oyundaki yoldan geciriyor: temas -> ferman
 * cizgisi, atis -> dizilim ve Abarti gecisi (`noteProjectileSpawn`), kare ->
 * spot isigi, damga, gecis ve sekme (`noteSnapshot`). Galeri ve olcum ayni
 * besleyiciyi kullaniyor; gecikme yok (galeride "alindigi an" karenin ani).
 */
export class ScenarioCourtFeed {
  readonly tracker: ZeynepReceiptTracker;
  private at = 0;

  constructor(private readonly vfx: ZeynepSignatureVfx, private readonly context: ReceiptContext) {
    this.tracker = new ZeynepReceiptTracker((event, delayMs) => this.vfx.emit(event, this.at + delayMs));
  }

  feed(frame: ScenarioFrame, now: number) {
    for (const event of frame.events) {
      if (event.type === "court") {
        this.vfx.emit(event.input, event.at);
        continue;
      }
      if (getVfxProfile(event.definitionId).silhouette !== "lance") continue;
      if (event.type === "muzzle") {
        this.at = event.at;
        this.tracker.noteProjectileSpawn({
          id: event.key, definitionId: event.definitionId, x: event.x, y: event.y,
          vx: Math.cos(event.angle) * SCENARIO_PROJECTILE_SPEED, vy: Math.sin(event.angle) * SCENARIO_PROJECTILE_SPEED, tier: event.tier
        }, frame.signatureTowers, this.context, event.at);
      } else if (event.type === "contact") {
        this.vfx.emit({ kind: "pierce", key: event.projectile ?? event.key, x: event.x, y: event.y, angle: event.angle, definitionId: event.definitionId, tier: event.tier, own: event.own }, event.at);
      }
    }
    this.at = now;
    this.tracker.noteSnapshot(frame.beams, frame.signatureEnemies, frame.signatureTowers, this.context, now);
  }

  clear() {
    this.tracker.clear();
  }
}

/** Galeri ve olcum: katalogdaki saldiran kuleler, katalog sirasiyla. */
export function getAttackingDefinitionIds() {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const towers of Object.values(towerCatalog)) {
    for (const tower of towers) {
      if (seen.has(tower.id) || !isAttackingDefinition(tower)) continue;
      seen.add(tower.id);
      ids.push(tower.id);
    }
  }
  return ids;
}

function getDefinition(id: string) {
  for (const towers of Object.values(towerCatalog)) {
    const found = towers.find((tower) => tower.id === id);
    if (found) return found;
  }
  return undefined;
}

/** Atis araligi: katalogdan, galeride okunacak kadar sinirli. */
export function getScenarioIntervalMs(definitionId: string) {
  const definition = getDefinition(definitionId);
  return Math.max(450, Math.min(2400, definition?.fireIntervalMs ?? 900));
}

export function getScenarioColor(definitionId: string) {
  return getDefinition(definitionId)?.color ?? 0x94a3b8;
}

/**
 * Yuk testi: 20 kademe-3 kule ve 60 dusman, 390 birimlik dunyada.
 *
 * Kuleler saldiran tanimlar arasinda sirayla; dortte biri takim arkadasinin
 * (soluk eklentiler de olculsun). Galerinin yuk kipi ve `tools/vfx-bench.mjs`
 * ayni sahneyi kullaniyor.
 */
export function createStressScenario(width = 390, top = 90, height = 640, options: { teamMarkEvery?: number; kinBrandEvery?: number } = {}) {
  const ids = getAttackingDefinitionIds();
  const towers: ScenarioTower[] = [];
  const walkers: ScenarioWalker[] = [];
  const columns = 4;
  const rows = 5;
  const cellW = width / columns;
  const cellH = height / rows;
  for (let index = 0; index < 60; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns) % rows;
    walkers.push({
      id: `w${index}`,
      cx: cellW * (column + 0.5) + (fnvUnit(`w${index}`, 1) - 0.5) * 30,
      cy: top + cellH * (row + 0.5) + (fnvUnit(`w${index}`, 2) - 0.5) * 30,
      rx: 26 + fnvUnit(`w${index}`, 3) * 18,
      ry: 18 + fnvUnit(`w${index}`, 4) * 14,
      periodMs: 2600 + fnvUnit(`w${index}`, 5) * 2400,
      phase: fnvUnit(`w${index}`, 6) * Math.PI * 2
    });
  }
  for (let index = 0; index < 20; index += 1) {
    const definitionId = ids[index % ids.length];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = cellW * (column + 0.5) - 22;
    const y = top + cellH * (row + 0.5) - 20;
    // Hedef menzil icindeki (80 birimden uzak) en yakin yuruyucu: ucus gorulsun.
    let walker = 0;
    let best = Number.POSITIVE_INFINITY;
    walkers.forEach((candidate, candidateIndex) => {
      const gap = Math.hypot(candidate.cx - x, candidate.cy - y) + candidateIndex * 0.01;
      if (gap < best && gap > 80) {
        best = gap;
        walker = candidateIndex;
      }
    });
    towers.push({
      id: `stress-${index}`,
      definitionId,
      level: 10,
      x,
      y,
      color: getScenarioColor(definitionId),
      own: index % 4 !== 0,
      walker,
      intervalMs: getScenarioIntervalMs(definitionId),
      // Sunucu bir kuleye bagli, Izolasyon alani menzilinde (sahneye sigan boyda).
      displayRange: definitionId === "warrior-3" ? 70 : undefined,
      anchor: definitionId === "warrior-2" ? { x: x + 70, y: y + 50 } : definitionId === "warrior-3" ? { x: x + 26, y } : undefined
    });
  }
  return new VfxScenario(towers, walkers, { teamMarkEvery: options.teamMarkEvery ?? 4, kinBrandEvery: options.kinBrandEvery ?? 0 });
}
