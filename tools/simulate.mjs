import { pathToFileURL } from "node:url";
import {
  FINAL_WAVE,
  ENEMY_REWARD_MULTIPLIER,
  getTowerRealDps,
  canEquipShopItem,
  cardAppliesToTower,
  cardCatalog,
  drawCards,
  drawShopOffers,
  isGlobalShopItem,
  shopCatalog,
  SHOP_OFFER_COUNT,
  shopItemAppliesToTower,
  getShopItemPrice,
  getEnemyCombatDefinition,
  getModifierAdd,
  getModifierMultiplier,
  TOWER_BASE_CRITICAL_CHANCE,
  TOWER_BASE_CRITICAL_DAMAGE_MULTIPLIER,
  getEnemyExp,
  getTowerBuildCost,
  getTowerLevelExpCost,
  getWaveCompletionGold,
  getWaveEnemyCount,
  getWaveEnemyMaxHp,
  towerCatalog
} from "../packages/shared/dist/index.js";

const START_GOLD = 360;
const BASE_TOWER_CAPACITY = 10;
const enemyTypes = ["grunt", "grunt", "runner", "shooter", "brute"];

export const botStrategies = {
  balanced: { characterId: "warrior", axes: ["dps", "amplify"], buildBias: 1, upgradeBias: 1, combatSeconds: 20 },
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
  const ownedShopItemIds = [];
  let gold = START_GOLD;
  let experience = 0;
  let nexusHealth = 100;
  let reachedWave = 0;

  for (let wave = 1; wave <= FINAL_WAVE; wave += 1) {
    spendGold({ towers, definitions, playerModifiers, config, goldRef: { get value() { return gold; }, set value(value) { gold = value; } } });
    // Esyalar kule basina takildigi icin tek bir esya artik anlamli bir yatirim
    // degil; gercek oyuncu her hazirlik fazinda parasi yettigince alir. Teklif
    // listesi tukenene veya altin bitene kadar satin alinir.
    const shopOffers = drawShopOffers({ wave, preferredAxes: config.axes, towers: definitions, ownedItemIds: ownedShopItemIds, random });
    const remainingOffers = [...shopOffers];
    let shopSafety = SHOP_OFFER_COUNT;
    while (shopSafety-- > 0) {
      const purchase = remainingOffers
        .map((item) => ({ item, price: getShopItemPrice(item, ownedShopItemIds), score: shopItemScore(item) }))
        .filter(({ price, score }) => price <= gold && score > 0)
        .sort((a, b) => b.score / Math.max(1, b.price) - a.score / Math.max(1, a.price))[0];
      if (!purchase) break;

      const target = isGlobalShopItem(purchase.item)
        ? undefined
        : towers
          .filter((tower) => canEquipShopItem(purchase.item, tower.definition, tower.equippedShopItemIds).ok)
          .sort((a, b) => getTowerDps(b, playerModifiers, ownedCardIds) - getTowerDps(a, playerModifiers, ownedCardIds))[0];
      if (!isGlobalShopItem(purchase.item) && !target) {
        // Takilacak uygun kule yoksa bu esya su an ise yaramaz, atla.
        remainingOffers.splice(remainingOffers.indexOf(purchase.item), 1);
        continue;
      }

      gold -= purchase.price;
      ownedShopItemIds.push(purchase.item.id);
      remainingOffers.splice(remainingOffers.indexOf(purchase.item), 1);
      if (target) {
        target.equippedShopItemIds.push(purchase.item.id);
        target.modifiers.push(...purchase.item.effects);
      } else {
        playerModifiers.push(...purchase.item.effects);
      }
    }
    spendExperience({ towers, config, experienceRef: { get value() { return experience; }, set value(value) { experience = value; } } });
    const count = getWaveEnemyCount(wave);
    let totalHealth = 0;
    let totalReward = 0;
    let totalExperience = 0;
    for (let index = 0; index < count; index += 1) {
      const enemyType = enemyTypes[Math.floor(random() * enemyTypes.length)];
      const enemy = getEnemyCombatDefinition(enemyType);
      const isAir = wave === 5 || wave === 10 || ((wave === 15 || wave === 20) && index % 2 === 0);
      const airMultiplier = isAir ? 0.25 : 1;
      totalHealth += getWaveEnemyMaxHp(enemy.maxHp, wave, airMultiplier) + Math.round(enemy.shield * airMultiplier);
      totalReward += Math.round(enemy.reward * ENEMY_REWARD_MULTIPLIER);
      totalExperience += getEnemyExp(wave, enemyType, isAir ? "air" : "ground");
    }
    const execution = 0.82 + random() * 0.36;
    const damageBudget = towers.reduce((sum, tower) => sum + getTowerDps(tower, playerModifiers, ownedCardIds), 0) * config.combatSeconds * execution;
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
    experience += totalExperience;
    if (wave < FINAL_WAVE) {
      const choices = drawCards({ preferredAxes: config.axes, towers: definitions, ownedCardIds, random });
      const card = chooseCard(choices, config.axes, towers);
      if (card) {
        ownedCardIds.push(card.id);
        cardHistory.push({ wave, id: card.id, name: card.name });
        const target = card.scope.kind === "targeted" ? [...towers].filter((tower) => tower.targetedCardIds.length < 3).sort((a, b) => getTowerDps(b, playerModifiers, ownedCardIds) - getTowerDps(a, playerModifiers, ownedCardIds))[0] : undefined;
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
    if (!build) break;
    towers.push({ id: `t${towers.length + 1}`, definition: build.definition, level: 1, modifiers: [], targetedCardIds: [], equippedShopItemIds: [], damageDealt: 0 });
    goldRef.value -= build.cost;
  }
}

function spendExperience({ towers, config, experienceRef }) {
  let safety = 90;
  while (safety-- > 0) {
    const upgrade = towers
      .filter(({ level }) => level < 10)
      .map((tower) => {
        const cost = getTowerLevelExpCost(tower.definition.cost, tower.level);
        return { tower, cost, score: tower.definition.damage / Math.max(1, tower.definition.fireIntervalMs) / Math.max(1, cost) * config.upgradeBias };
      })
      .filter(({ cost }) => cost <= experienceRef.value)
      .sort((a, b) => b.score - a.score)[0];
    if (!upgrade) break;
    upgrade.tower.level += 1;
    experienceRef.value -= upgrade.cost;
  }
}

/**
 * Oyuncu kapsamli modifierlari kuleye gore suzer.
 *
 * MatchRoom.getTowerRunModifiers ile ayni kural: dar kapsamli bir kart yalnizca
 * uydugu kuleye isler. Bu suzgec olmadan simulator "sadece isin kulelerinde
 * +%50 hasar" gibi bir karti butun kulelere uygular ve bot gucunu birkac kat
 * fazla olcer.
 */
function modifiersForTower(tower, playerModifiers) {
  return [
    ...playerModifiers.filter((modifier) => {
      const shopId = modifier.source.startsWith("shop:") ? modifier.source.slice(5) : "";
      const shopItem = shopId ? shopCatalog.find((candidate) => candidate.id === shopId) : undefined;
      if (shopItem) return shopItem.scope.kind === "global" || shopItemAppliesToTower(shopItem, tower.definition);
      const cardId = modifier.source.startsWith("card:") ? modifier.source.slice(5) : "";
      const card = cardCatalog.find((candidate) => candidate.id === cardId);
      return !card || card.scope.kind === "global" || cardAppliesToTower(card, tower.definition);
    }),
    ...tower.modifiers
  ];
}

/**
 * Davranis kilitlerinin kaba hasar karsiligi.
 *
 * Simulator yalnizca `Modifier` okuyabiliyordu; katalogun yarisi artik sayi
 * yerine davranis verdigi icin bu, botun seceneklerinin yarisini "degersiz"
 * gormesi demekti. Buradaki degerler kesin degil, kasten kaba: amac kilitleri
 * tam modellemek degil, bir kilidin bir kartlik yer kaplamayi hak edip
 * etmedigini botun gorebilmesi.
 */
const UNLOCK_DAMAGE_ADD = {
  "heat:runHot": 0.24,
  "heat:coldCrit": 0.12,
  "heat:thermalMass": 0.15,
  "heat:overheatBurst": 0.05,
  "energy:backupLine": 0.06,
  "ammo:emptyBleed": 0.05,
  "stack:kill": 0.2,
  "stack:wave": 0.2,
  "adjacencyBonus": 0.2,
  "isolationBonus": 0.15,
  "status:burn": 0.1,
  "status:chill": 0.12,
  "canHitAir": 0.05,
  "bloodBank": 0.2
};

/** Motor eklentilerinin kaba hasar karsiligi; ayni mantik, ayni kaba olcek. */
function grantDamageAdd(grant) {
  if (!grant) return 0;
  let add = 0;
  for (const stack of grant.stacks ?? []) {
    // Yigin ortalama yarim doluluk kabul edilir: hedef degisir, dalga biter.
    if (stack.stat === "damage") add += stack.perStack * (stack.max ?? 5) * 0.5;
    if (stack.stat === "fireRate") add += stack.perStack * (stack.max ?? 5) * 0.4;
  }
  for (const status of grant.statusEffects ?? []) {
    add += status.type === "chill" ? 0.12 : 0.08;
  }
  for (const trigger of grant.triggers ?? []) {
    add += trigger.effect === "surge" ? 0.12 : 0.05;
  }
  if (grant.attack?.pierceCount) add += 0.15 * grant.attack.pierceCount;
  if (grant.attack?.bladeCount) add += 0.3 * grant.attack.bladeCount;
  for (const key of ["radiusMultiplier", "angleMultiplier", "widthMultiplier", "lengthMultiplier"]) {
    if (grant.attack?.[key]) add += Math.max(0, grant.attack[key] - 1) * 0.4;
  }
  return add;
}

function behaviourDamageAdd(entry) {
  const unlockAdd = (entry.unlocks ?? []).reduce((sum, unlock) => sum + (UNLOCK_DAMAGE_ADD[unlock] ?? 0.04), 0);
  return unlockAdd + grantDamageAdd(entry.grants);
}

/**
 * Kuleye isleyen kart ve esyalarin davranis katkisi.
 *
 * Toplamsal donmesi sart: MatchRoom kilit hasarlarini `damage` modifierlariyla
 * ayni havuza yaziyor ve havuz `1 + toplam` olarak cozuluyor. Ayri bir carpan
 * olarak uygulamak botu oyunun izin verdiginden gucli gosterirdi.
 */
function behaviourDamageAddForTower(tower, ownedCardIds) {
  let add = 0;
  for (const itemId of tower.equippedShopItemIds) {
    const item = shopCatalog.find((candidate) => candidate.id === itemId);
    if (item) add += behaviourDamageAdd(item);
  }
  for (const cardId of ownedCardIds) {
    const card = cardCatalog.find((candidate) => candidate.id === cardId);
    if (!card || card.scope.kind === "targeted") continue;
    if (card.scope.kind === "global" || cardAppliesToTower(card, tower.definition)) add += behaviourDamageAdd(card);
  }
  for (const cardId of tower.targetedCardIds) {
    const card = cardCatalog.find((candidate) => candidate.id === cardId);
    if (card) add += behaviourDamageAdd(card);
  }
  return add;
}

/**
 * Kulenin saniye basina hasari.
 *
 * Taban DPS `getTowerRealDps` ile aliniyor cunku seviye egrisi kule basina
 * farkli: hasar adimi ortak ama atis araligi Takipci, Hiza Emri, Kin ve Debug
 * Lazer'de elle yazilmis egrilerden, `impact` kulelerinde ise hasar telafisinden
 * geliyor. Simulator bunu kendi basina hesapliyordu ve seviyenin atis hizina
 * etkisini hic gormuyordu; seviye egrisi degistiginde bot gucunu ters yonde
 * olcup dengeyi yanlis gosterdi.
 */
function getTowerDps(tower, playerModifiers, ownedCardIds = []) {
  const modifiers = modifiersForTower(tower, playerModifiers);
  const damageAdd = getModifierAdd(modifiers, "damage") + behaviourDamageAddForTower(tower, ownedCardIds);
  const fireRate = getModifierMultiplier(modifiers, "fireRate");
  // Kritik, MatchRoom'daki gibi beklenen deger olarak katilir; aksi halde kritik
  // kartlari simulasyonda hicbir sey yapmiyor gibi gorunur.
  const critChance = Math.max(0, TOWER_BASE_CRITICAL_CHANCE + getModifierAdd(modifiers, "critChance"));
  const critDamage = Math.max(0, TOWER_BASE_CRITICAL_DAMAGE_MULTIPLIER - 1 + getModifierAdd(modifiers, "critDamage"));
  const critMultiplier = 1 + Math.min(1, critChance) * critDamage;
  return getTowerRealDps(tower.definition, tower.level)
    * Math.max(0, 1 + damageAdd)
    * fireRate
    * critMultiplier;
}

/** Esyalar da artik kilit ve motor eklentisi tasiyor; puanlama ikisini de gorur. */
function shopItemScore(item) {
  const effectScore = item.effects.reduce((sum, modifier) => sum + (STAT_SCORE[modifier.stat] ?? 0.3) * modifier.add, 0);
  return effectScore + behaviourDamageAdd(item) * STAT_SCORE.damage;
}

function chooseCard(cards, preferredAxes, towers) {
  return cards.filter((card) => card.scope.kind !== "targeted" || towers.some((tower) => tower.targetedCardIds.length < 3))
    .sort((a, b) => cardScore(b, preferredAxes, towers) - cardScore(a, preferredAxes, towers))[0];
}

/**
 * Statlarin kaba "bir kartlik deger" agirliklari.
 *
 * Acikca yazilmalari sart: eskiden bilinmeyen statlar 0.4 ile carpiliyordu ve
 * `targetLockMs: 3000` gibi milisaniye tasiyan bir alan 1200 puan uretip her
 * seceneği eziyordu. Yuzdelik olmayan her stat kendi olceginde tanimlanir.
 */
const STAT_SCORE = {
  damage: 5, fireRate: 4, critChance: 3, critDamage: 1.5, towerCapacity: 3,
  airDamage: 1, damageVsShielded: 1, damageVsBrute: 1, markAmplification: 1.5,
  range: 1.5, accuracy: 1, turnRate: 0.6, projectileSpeed: 0.5,
  shotFuelCost: -1.5, ammoCost: -1, energyCost: -1, operatingEnergyCost: -0.8,
  cooling: 1, heat: -0.8, towerHealth: 1, goldGain: 2,
  statusDuration: 0.8, statusMagnitude: 0.8, armorBreak: 0.15,
  ammoEmptyDamage: 0.3, ultimateCharge: 1, skillCooldown: -1,
  targetLockMs: 0.0002, resourceProduction: 0.5, ammoProduction: 0.5,
  workerGatherSpeed: 0.4, workerSpeed: 0.3
};

/**
 * Katalog dar kapsamli kartlarla buyudugu icin puanlama kapsami hesaba katmak
 * zorunda: "sadece isin kulelerinde +%50 hasar" karti, isin kulesi olmayan bir
 * kurulumda sifir degerindedir. Kapsami yok sayan bir bot, gercek bir oyuncunun
 * asla yapmayacagi secimler yapip dengeyi oldugundan kotu gosterir.
 */
function cardScore(card, axes, towers) {
  const effectScore = card.effects.reduce((sum, effect) => sum + (STAT_SCORE[effect.stat] ?? 0.3) * effect.add, 0);
  // Davranis kartlarinin efekt listesi bostur; degerleri kilit ve motor
  // eklentilerinden gelir ve hasar carpani olcegine tasinir.
  const behaviourScore = behaviourDamageAdd(card) * STAT_SCORE.damage;
  const total = effectScore + behaviourScore;
  const axisBonus = card.axes.some((axis) => axes.includes(axis)) ? 0.5 : 0;
  if (towers.length === 0) return total + axisBonus;

  const matching = towers.filter((tower) => cardAppliesToTower(card, tower.definition)).length;
  // Hedefli kart tek kuleye gider; kapsam orani yerine tek kule payi kullanilir.
  const reach = card.scope.kind === "targeted"
    ? (matching > 0 ? 1 / towers.length : 0)
    : matching / towers.length;
  return total * reach + axisBonus * (reach > 0 ? 1 : 0);
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
