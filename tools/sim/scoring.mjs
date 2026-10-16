/**
 * Kart ve esya puanlari (botun "zevki").
 *
 * Bunlar kural degil, karar sezgisi: gercek odadaki etki odanin kendisinden
 * geliyor. Puan yalnizca "hangi karti/esyayi alayim" sorusuna cevap. Hizli
 * kip (`quick.mjs`) de ayni puanlari kullaniyor.
 */
import { shared } from "./match.mjs";

const { cardAppliesToTower } = shared;

/**
 * Davranis kilitlerinin kaba hasar karsiligi (bir kartlik deger olcegi).
 * Kesin degil, kasten kaba: amac bir kilidin bir kartlik yeri hak edip
 * etmedigini gormek.
 */
export const UNLOCK_DAMAGE_ADD = {
  "heat:runHot": 0.24,
  "heat:coldCrit": 0.12,
  "heat:thermalMass": 0.15,
  "heat:overheatBurst": 0.05,
  "heat:radiator": 0.12,
  "heat:quickRelease": 0.08,
  "heat:killVent": 0.1,
  "heat:chillVent": 0.14,
  "heat:exchange": 0.1,
  "heat:chargedCooling": 0.12,
  "heat:emptyVent": 0.07,
  "energy:backupLine": 0.06,
  "ammo:emptyBleed": 0.05,
  "stack:kill": 0.2,
  "stack:wave": 0.2,
  "adjacencyBonus": 0.2,
  "isolationBonus": 0.15,
  "status:burn": 0.1,
  "status:chill": 0.12,
  "canHitAir": 0.3,
  "bloodBank": 0.2,
  "crit:vsMarked": 0.08,
  "crit:isolated": 0.06,
  "crit:fromAccuracy": 0.05,
  "aim:killSnap": 0.03,
  "aim:fastTargets": 0.03,
  "aim:coldAccuracy": 0.03,
  "gold:cleanWave": 0,
  "gold:critKill": 0,
  "nexus:mend": 0.25
};

/** Altin kilitlerinin secim puani (hasar olcegine cevrilmis). */
export const GOLD_UNLOCK_SCORE = { "gold:cleanWave": 0.6, "gold:critKill": 0.3, goldInterest: 0.5 };

/** Statlarin kaba "bir kartlik deger" agirliklari; her stat kendi olceginde. */
export const STAT_SCORE = {
  damage: 5, fireRate: 4, critChance: 3, critDamage: 1.5, towerCapacity: 3,
  airDamage: 1, damageVsShielded: 1, damageVsBrute: 1, markAmplification: 1.5,
  range: 1.5, accuracy: 1, turnRate: 0.6, projectileSpeed: 0.5,
  shotFuelCost: -1.5, ammoCost: -1, energyCost: -1, operatingEnergyCost: -0.8,
  cooling: 1, heat: -0.8, towerHealth: 1, goldGain: 2,
  statusDuration: 0.8, statusMagnitude: 0.8, armorBreak: 0.15,
  ammoEmptyDamage: 0.3, ultimateCharge: 1, skillCooldown: -1,
  targetLockMs: 0.0002, resourceProduction: 0.5, ammoProduction: 0.5,
  workerGatherSpeed: 0.4, workerSpeed: 0.3,
  waveIncome: 0.02,
  accuracyVsAir: 0.5, projectileSpeedIsolated: 0.25,
  championGold: 0.003, airKillGold: 0.04, damageGold: 0.04, multiKillGold: 0.025, overkillGold: 6,
  garrisonGold: 0.08, upgradeGold: 0.03, heavyKillGold: 0.05, statusKillGold: 0.06,
  hotKillGold: 0.08, slowedKillGold: 0.08, deliveryGold: 0.15, longRangeKillGold: 0.06,
  // Atis hizi, soguma ve isi, ucuncu tur: kosullu, yaklasik yarisi kadar.
  woundedFireRate: 1.5, idleCooling: 0.4, critVent: 0.8, crowdFireRate: 12, lockCooling: 0.3, chilledHeatRelief: 0.8,
  // Efsanevi ihtimaller (temas saniyesi basina): 0,1 ihtimal kabaca +%30
  // hasarlik bir kart. Dondurma ve cekim hasar vermiyor; yarisi.
  chainChance: 15, blastChance: 15, executeChance: 12, shatterChance: 12, chronoChance: 15, linkChance: 15,
  freezeChance: 7, gravityChance: 7,
  // Menzil turu: kosullu; ortalama payin menzil puaniyla karsiligi (Kenetlenme
  // ~+%12, Termal Mercek ~+%6, iki duvar, ~3 oldurme, bir direk). Duz kare
  // kisa menzilde orani buyuk: ortalama ~+%15.
  focusRange: 3.6, heatRange: 0.45, wallRange: 3, rangeFlat: 0.9, killRange: 5, neighborRange: 2,
  // Ikinci kisim: uzun oldurme sayaci ~8 oldurmede; pusu yalnizca menzile ilk girista.
  killRangeLong: 12, ambushRange: 0.5
};

function grantDamageAdd(grant) {
  if (!grant) return 0;
  let add = 0;
  for (const stack of grant.stacks ?? []) {
    if (stack.stat === "damage") add += stack.perStack * (stack.max ?? 5) * 0.5;
    if (stack.stat === "fireRate") add += stack.perStack * (stack.max ?? 5) * 0.4;
  }
  for (const status of grant.statusEffects ?? []) add += status.type === "chill" ? 0.12 : 0.08;
  for (const trigger of grant.triggers ?? []) add += trigger.effect === "surge" ? 0.12 : 0.05;
  if (grant.attack?.pierceCount) add += 0.15 * grant.attack.pierceCount;
  if (grant.attack?.bladeCount) add += 0.3 * grant.attack.bladeCount;
  for (const key of ["radiusMultiplier", "angleMultiplier", "widthMultiplier", "lengthMultiplier"]) {
    if (grant.attack?.[key]) add += Math.max(0, grant.attack[key] - 1) * 0.4;
  }
  return add;
}

export function behaviourDamageAdd(entry) {
  const unlockAdd = (entry.unlocks ?? []).reduce((sum, unlock) => sum + (UNLOCK_DAMAGE_ADD[unlock] ?? 0.04), 0);
  return unlockAdd + grantDamageAdd(entry.grants);
}

export const goldUnlockScore = (entry) => (entry.unlocks ?? []).reduce((sum, unlock) => sum + (GOLD_UNLOCK_SCORE[unlock] ?? 0), 0);

export function effectScore(effects) {
  return (effects ?? []).reduce((sum, modifier) => sum + (STAT_SCORE[modifier.stat] ?? 0.3) * (modifier.add ?? 0), 0);
}

/** Kartin bu kurulustaki degeri: kapsam (kac kuleye isliyor) dahil. */
export function cardScore(card, axes, towerDefinitions) {
  const conversionScore = (card.conversions ?? []).reduce((sum, conversion) => sum + conversion.cap * 0.5, 0) * STAT_SCORE.damage;
  const total = effectScore(card.effects) + (behaviourDamageAdd(card) + goldUnlockScore(card)) * STAT_SCORE.damage + conversionScore;
  const axisBonus = (card.axes ?? []).some((axis) => axes.includes(axis)) ? 0.5 : 0;
  if (towerDefinitions.length === 0) return total + axisBonus;
  const matching = towerDefinitions.filter((definition) => cardAppliesToTower(card, definition)).length;
  const reach = card.scope.kind === "targeted"
    ? (matching > 0 ? 1 / Math.max(1, Math.sqrt(towerDefinitions.length)) : 0)
    : card.scope.kind === "global" ? 1 : matching / towerDefinitions.length;
  return total * reach + axisBonus * (reach > 0 ? 1 : 0);
}

export function shopItemScore(item) {
  const depositScore = item.deposit ? 1 : 0;
  // Cevrim esyalari: hedef statin tavaninin yarisi kadar (kartlardaki gibi kaba).
  const conversionScore = (item.conversions ?? []).reduce((sum, conversion) => sum + conversion.cap * 0.5 * (STAT_SCORE[conversion.to] ?? 0.3), 0);
  return effectScore(item.effects) + depositScore + (behaviourDamageAdd(item) + goldUnlockScore(item)) * STAT_SCORE.damage + conversionScore;
}
