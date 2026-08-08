import { pathToFileURL } from "node:url";
import {
  FINAL_WAVE,
  calculateTowerScaledBaseDamage,
  cardCatalog,
  drawCards,
  getEnemyCombatDefinition,
  getModifierMultiplier,
  getTowerBuildCost,
  getTowerUpgradeCost,
  getWaveCompletionGold,
  getWaveEnemyCount,
  getWaveEnemyMaxHp,
  towerCatalog
} from "../packages/shared/dist/index.js";

const START_GOLD = 360;
const BASE_TOWER_CAPACITY = 10;
const ENEMY_REWARD_MULTIPLIER = 0.55;
const enemyTypes = ["grunt", "grunt", "runner", "shooter", "brute"];

export const botStrategies = {
  balanced: { characterId: "warrior", axes: ["dps", "amplify"], buildBias: 1, upgradeBias: 1, combatSeconds: 54 },
  builder: { characterId: "warrior", axes: ["economy", "dps"], buildBias: 1.3, upgradeBias: 0.75, combatSeconds: 68 },
  upgrader: { characterId: "zeynep", axes: ["dps", "amplify"], buildBias: 0.75, upgradeBias: 1.3, combatSeconds: 64 }
};

export function createSeededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function simulateRun({ seed = 1, strategy = "balanced" } = {}) {
  const random = createSeededRandom(seed);
  const config = botStrategies[strategy] ?? botStrategies.balanced;
  const definitions = towerCatalog[config.characterId].filter((tower) => !tower.resourceProvider && tower.damage > 0);
  const towers = [];
  const playerModifiers = [];
  const ownedCardIds = [];
  const cardHistory = [];
  let gold = START_GOLD;
  let nexusHealth = 100;
  let reachedWave = 0;

  for (let wave = 1; wave <= FINAL_WAVE; wave += 1) {
    spendGold({ towers, definitions, playerModifiers, config, goldRef: { get value() { return gold; }, set value(value) { gold = value; } } });
    const count = getWaveEnemyCount(wave);
    let totalHealth = 0;
    let totalReward = 0;
    for (let index = 0; index < count; index += 1) {
      const enemy = getEnemyCombatDefinition(enemyTypes[Math.floor(random() * enemyTypes.length)]);
      const airMultiplier = (wave === 5 || wave === 10 || ((wave === 15 || wave === 20) && index % 2 === 0)) ? 0.25 : 1;
      totalHealth += getWaveEnemyMaxHp(enemy.maxHp, wave, airMultiplier) + Math.round(enemy.shield * airMultiplier);
      totalReward += Math.round(enemy.reward * ENEMY_REWARD_MULTIPLIER);
    }
    const execution = 0.82 + random() * 0.36;
    const damageBudget = towers.reduce((sum, tower) => sum + getTowerDps(tower, playerModifiers), 0) * config.combatSeconds * execution;
    const dealt = Math.min(totalHealth, damageBudget);
    distributeDamage(towers, dealt);
    if (damageBudget < totalHealth) {
      nexusHealth -= Math.ceil((1 - damageBudget / totalHealth) * 42);
      if (nexusHealth <= 0) {
        return result(false, reachedWave, towers, cardHistory, nexusHealth, seed, strategy);
      }
    }
    reachedWave = wave;
    gold += totalReward + (wave < FINAL_WAVE ? getWaveCompletionGold(wave) : 0);
    if (wave < FINAL_WAVE) {
      const choices = drawCards({ preferredAxes: config.axes, towers: definitions, ownedCardIds, random });
      const card = chooseCard(choices, config.axes, towers);
      if (card) {
        ownedCardIds.push(card.id);
        cardHistory.push({ wave, id: card.id, name: card.name });
        const target = card.scope.kind === "targeted" ? [...towers].filter((tower) => tower.targetedCardIds.length < 3).sort((a, b) => getTowerDps(b, playerModifiers) - getTowerDps(a, playerModifiers))[0] : undefined;
        if (target) target.targetedCardIds.push(card.id);
        (target?.modifiers ?? playerModifiers).push(...card.effects);
      }
    }
  }
  return result(true, reachedWave, towers, cardHistory, nexusHealth, seed, strategy);
}

export function simulateMany({ runs = 100, seed = 1, strategy = "balanced" } = {}) {
  const results = Array.from({ length: runs }, (_, index) => simulateRun({ seed: seed + index, strategy }));
  const wins = results.filter(({ result }) => result === "victory").length;
  const waveDistribution = Object.fromEntries([...new Set(results.map(({ reachedWave }) => reachedWave))].sort((a, b) => a - b).map((wave) => [wave, results.filter((run) => run.reachedWave === wave).length]));
  return { runs, strategy, wins, losses: runs - wins, winRate: wins / runs, waveDistribution, sample: results[0] };
}

function spendGold({ towers, definitions, playerModifiers, config, goldRef }) {
  const capacity = BASE_TOWER_CAPACITY + Math.floor(playerModifiers.filter(({ stat }) => stat === "towerCapacity").reduce((sum, mod) => sum + mod.add, 0));
  let safety = 40;
  while (safety-- > 0) {
    const build = definitions.map((definition) => ({ definition, cost: getTowerBuildCost(definition.cost), score: definition.damage / Math.max(1, definition.fireIntervalMs) / getTowerBuildCost(definition.cost) * config.buildBias })).filter(({ cost }) => cost <= goldRef.value && towers.length < capacity).sort((a, b) => b.score - a.score)[0];
    const upgrade = towers.filter(({ level }) => level < 10).map((tower) => ({ tower, cost: getTowerUpgradeCost(tower.definition, tower.level), score: tower.definition.damage / Math.max(1, tower.definition.fireIntervalMs) / getTowerUpgradeCost(tower.definition, tower.level) * config.upgradeBias })).filter(({ cost }) => cost <= goldRef.value).sort((a, b) => b.score - a.score)[0];
    if (!build && !upgrade) break;
    if (build && (!upgrade || build.score >= upgrade.score)) {
      towers.push({ id: `t${towers.length + 1}`, definition: build.definition, level: 1, modifiers: [], targetedCardIds: [], damageDealt: 0 });
      goldRef.value -= build.cost;
    } else {
      upgrade.tower.level += 1;
      goldRef.value -= upgrade.cost;
    }
  }
}

function getTowerDps(tower, playerModifiers) {
  const modifiers = [...playerModifiers, ...tower.modifiers];
  const damage = calculateTowerScaledBaseDamage(tower.definition, tower.level) * getModifierMultiplier(modifiers, "damage");
  const fireRate = getModifierMultiplier(modifiers, "fireRate");
  return damage * 1000 / Math.max(80, tower.definition.fireIntervalMs / fireRate);
}

function chooseCard(cards, preferredAxes, towers) {
  return cards.filter((card) => card.scope.kind !== "targeted" || towers.some((tower) => tower.targetedCardIds.length < 3))
    .sort((a, b) => cardScore(b, preferredAxes) - cardScore(a, preferredAxes))[0];
}

function cardScore(card, axes) {
  const effectScore = card.effects.reduce((sum, effect) => sum + ({ damage: 5, fireRate: 4, towerCapacity: 3, range: 1.5, cooling: 1, towerHealth: 1 }[effect.stat] ?? 0.4) * effect.add, 0);
  return effectScore + (card.axes.some((axis) => axes.includes(axis)) ? 0.5 : 0);
}

function distributeDamage(towers, total) {
  const weights = towers.map((tower) => getTowerDps(tower, []));
  const sum = weights.reduce((value, weight) => value + weight, 0) || 1;
  towers.forEach((tower, index) => { tower.damageDealt += total * weights[index] / sum; });
}

function result(victory, reachedWave, towers, cardHistory, nexusHealth, seed, strategy) {
  const axisContribution = {};
  for (const tower of towers) {
    for (const axis of tower.definition.axes ?? ["dps"]) axisContribution[axis] = (axisContribution[axis] ?? 0) + tower.damageDealt / Math.max(1, tower.definition.axes?.length ?? 1);
  }
  return {
    seed, strategy, reachedWave, result: victory ? "victory" : "defeat", nexusHealth: Math.max(0, nexusHealth),
    towerDamage: towers.map((tower) => ({ id: tower.id, definitionId: tower.definition.id, level: tower.level, damage: Math.round(tower.damageDealt) })),
    axisContribution: Object.fromEntries(Object.entries(axisContribution).map(([axis, damage]) => [axis, Math.round(damage)])),
    cardHistory
  };
}

function parseArgs(args) {
  const read = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  return { runs: Number(read("--runs", 100)), seed: Number(read("--seed", 1)), strategy: read("--strategy", "balanced") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(simulateMany(parseArgs(process.argv.slice(2))), null, 2));
}
