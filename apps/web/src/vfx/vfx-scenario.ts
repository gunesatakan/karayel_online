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
 */
import { towerCatalog, type BeamSnapshot, type ProjectileSnapshot } from "@karayel/shared";
import { fnvUnit, toTier, type VfxTier } from "./kit";
import { getVfxProfile, getVfxTier, isAttackingDefinition, type VfxDelivery } from "./vfx-profiles";

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
};

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
  | { type: "contact"; x: number; y: number; angle: number; definitionId: string; tier: VfxTier; own: boolean; key: string; at: number; radius?: number; walker: number };

export type ScenarioFrame = {
  projectiles: ProjectileSnapshot[];
  beams: BeamSnapshot[];
  events: ScenarioEvent[];
};

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
  constructor(readonly towers: readonly ScenarioTower[], readonly walkers: readonly ScenarioWalker[]) {}

  /** `now` anindaki mermi ve isinlar, ve (since, now] araligindaki olaylar. */
  frame(now: number, since: number): ScenarioFrame {
    const frame: ScenarioFrame = { projectiles: [], beams: [], events: [] };
    for (const tower of this.towers) {
      const profile = getVfxProfile(tower.definitionId, tower.color);
      const tier = toTier(levelTier(tower.level));
      const walker = this.walkers[tower.walker % this.walkers.length];
      const phase = fnvUnit(tower.id) * tower.intervalMs;
      this.deliver(profile.delivery, tower, tier, walker, phase, now, since, frame);
    }
    return frame;
  }

  private deliver(delivery: VfxDelivery, tower: ScenarioTower, tier: VfxTier, walker: ScenarioWalker, phase: number, now: number, since: number, frame: ScenarioFrame) {
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
        return;
      }
      case "showcase":
      case "curse":
      case "kin":
      case "underworld":
      case "orbit":
        this.deliverBeams(delivery, tower, tier, walker, phase, now, since, frame);
        return;
      default:
        this.deliverProjectiles(tower, tier, walker, phase, now, since, frame);
    }
  }

  /** Dogrusal mermiler: atis anindaki hedefe, sabit hizla; temasi ucusun sonunda. */
  private deliverProjectiles(tower: ScenarioTower, tier: VfxTier, walker: ScenarioWalker, phase: number, now: number, since: number, frame: ScenarioFrame) {
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
          walker: tower.walker
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
      color: 0x38bdf8,
      overdrive: false,
      ttlMs: 190 - age
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

function levelTier(level: number) {
  return level >= 10 ? 3 : level >= 5 ? 2 : 1;
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
export function createStressScenario(width = 390, top = 90, height = 640) {
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
      intervalMs: getScenarioIntervalMs(definitionId)
    });
  }
  return new VfxScenario(towers, walkers);
}
