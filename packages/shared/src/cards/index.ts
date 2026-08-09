import type { DamageType, HitType } from "../combat.js";
import type { AmmoType, TowerAttackShape, TowerAxis, TowerDefinition } from "../characters/common/types.js";
import type { Modifier } from "../modifiers/index.js";

export type CardScope =
  | { kind: "global" }
  | { kind: "targeted" }
  | { kind: "tagged"; axes?: TowerAxis[]; hitTypes?: HitType[]; damageTypes?: DamageType[]; shapes?: TowerAttackShape[]; ammoTypes?: AmmoType[] };

export type CardDefinition = {
  id: string;
  name: string;
  description: string;
  axes: TowerAxis[];
  scope: CardScope;
  stackable: boolean;
  maxStacks?: number;
  effects: Modifier[];
};

const effect = (source: string, stat: Modifier["stat"], add: number, scope: Modifier["scope"] = "player"): Modifier => ({ source: `card:${source}`, scope, stat, add });

export const cardCatalog: CardDefinition[] = [
  { id: "namlu-asinmasi", name: "Namlu Aşınması", description: "Hasar +%25, ısı +%20.", axes: ["dps"], scope: { kind: "global" }, stackable: true, effects: [effect("namlu-asinmasi", "damage", 0.25), effect("namlu-asinmasi", "heat", 0.2)] },
  { id: "kalibre-artisi", name: "Kalibre Artışı", description: "Bir kulenin hasarı +%40, atış hızı -%15.", axes: ["dps"], scope: { kind: "targeted" }, stackable: true, effects: [effect("kalibre-artisi", "damage", 0.4, "tower"), effect("kalibre-artisi", "fireRate", -0.15, "tower")] },
  { id: "seri-atis", name: "Seri Atış", description: "Bir kulenin atış hızı +%20, mühimmat tüketimi +%35.", axes: ["dps"], scope: { kind: "targeted" }, stackable: true, effects: [effect("seri-atis", "fireRate", 0.2, "tower"), effect("seri-atis", "ammoCost", 0.35, "tower")] },
  { id: "sogutma-sistemi", name: "Soğutma Sistemi", description: "Tüm kulelerin soğuması +%50.", axes: ["economy"], scope: { kind: "global" }, stackable: true, effects: [effect("sogutma-sistemi", "cooling", 0.5)] },
  { id: "verimli-namlu", name: "Verimli Namlu", description: "Tüm kulelerin mühimmat tüketimi -%30.", axes: ["economy"], scope: { kind: "global" }, stackable: false, effects: [effect("verimli-namlu", "ammoCost", -0.3)] },
  { id: "nisan-kulesi", name: "Nişan Kulesi", description: "Menzil +%30, hasar -%15.", axes: ["barricade"], scope: { kind: "global" }, stackable: true, effects: [effect("nisan-kulesi", "range", 0.3), effect("nisan-kulesi", "damage", -0.15)] },
  { id: "kalin-zirh", name: "Kalın Zırh", description: "Tüm kulelerin canı +%80.", axes: ["barricade"], scope: { kind: "global" }, stackable: true, effects: [effect("kalin-zirh", "towerHealth", 0.8)] },
  { id: "zirh-kirma", name: "Zırh Kırma", description: "Büyütme kuleleri vuruşta 3 zırh azaltır.", axes: ["amplify"], scope: { kind: "tagged", axes: ["amplify"] }, stackable: false, effects: [effect("zirh-kirma", "armorBreak", 3)] },
  { id: "isaretleme-agi", name: "İşaretleme Ağı", description: "İşaretli düşmana hasar +%15, tavan +%100.", axes: ["amplify"], scope: { kind: "global" }, stackable: true, effects: [effect("isaretleme-agi", "markAmplification", 0.15)] },
  { id: "yanki", name: "Yankı", description: "Kontrol kulelerinde yavaşlatma süresi +%60, gücü -%25.", axes: ["cc"], scope: { kind: "tagged", axes: ["cc"] }, stackable: false, effects: [effect("yanki", "statusDuration", 0.6), effect("yanki", "statusMagnitude", -0.25)] },
  { id: "son-atis", name: "Son Atış", description: "Mühimmatı biten kulenin son atışı 3x hasar verir.", axes: ["dps"], scope: { kind: "targeted" }, stackable: false, effects: [effect("son-atis", "ammoEmptyDamage", 2, "tower")] }
];

export type CardTowerProfile = Pick<TowerDefinition, "axes" | "hitType" | "damageType" | "resourceProvider"> & { engine?: TowerDefinition["engine"] };

export function cardAppliesToTower(card: CardDefinition, tower: CardTowerProfile) {
  if (tower.resourceProvider) return false;
  if (card.scope.kind !== "tagged") return true;
  const { axes, hitTypes, damageTypes, shapes, ammoTypes } = card.scope;
  return (!axes?.length || axes.some((axis) => tower.axes?.includes(axis)))
    && (!hitTypes?.length || (!!tower.hitType && hitTypes.includes(tower.hitType)))
    && (!damageTypes?.length || (!!tower.damageType && damageTypes.includes(tower.damageType)))
    && (!shapes?.length || (!!tower.engine?.attack.shape && shapes.includes(tower.engine.attack.shape)))
    && (!ammoTypes?.length || (!!tower.engine?.resources.ammoType && ammoTypes.includes(tower.engine.resources.ammoType)));
}

export function drawCards(options: { count?: number; preferredAxes: TowerAxis[]; towers: CardTowerProfile[]; ownedCardIds: string[]; random?: () => number }) {
  const count = options.count ?? 3;
  const random = options.random ?? Math.random;
  const ownedCounts = new Map<string, number>();
  for (const id of options.ownedCardIds) ownedCounts.set(id, (ownedCounts.get(id) ?? 0) + 1);
  const pool = cardCatalog.filter((card) => card.stackable ? (ownedCounts.get(card.id) ?? 0) < (card.maxStacks ?? Infinity) : !ownedCounts.has(card.id));
  const result: CardDefinition[] = [];
  while (result.length < count && pool.length > 0) {
    const weights = pool.map((card) => {
      const axisWeight = card.axes.some((axis) => options.preferredAxes.slice(0, 2).includes(axis)) ? 2 : 1;
      const deadWeight = card.scope.kind === "tagged" && !options.towers.some((tower) => cardAppliesToTower(card, tower)) ? 0.15 : 1;
      return axisWeight * deadWeight;
    });
    let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
    let index = 0;
    for (; index < weights.length - 1; index += 1) {
      roll -= weights[index];
      if (roll < 0) break;
    }
    result.push(pool[index]);
    pool.splice(index, 1);
  }
  return result;
}
