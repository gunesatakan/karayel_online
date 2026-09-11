import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createRoom, findBuildableSpot } from "../tests/helpers/match-room-harness.mjs";
import { getMapGridSize, gridToWorld, getTowerLevelGoldCost, getTowerLevelExpCost, getUcubePerkTier } from "../packages/shared/dist/index.js";

export const recipes = [
  { id: "obsession", character: "warrior", towers: ["warrior-4", "warrior-4"], isolated: true },
  { id: "hiza", character: "zeynep", towers: ["zeynep-1", "zeynep-1", "zeynep-1"] },
  { id: "server", character: "warrior", towers: ["warrior-4", "warrior-2"], isolated: true },
  { id: "ucube", character: "warrior", towers: ["warrior-6"], isolated: true },
  { id: "control", character: "warrior", towers: ["warrior-3", "warrior-4"], isolated: true }
];
export const threats = [
  { id: "swarm", type: "grunt", hp: 80, armor: 0, shield: 0, speed: 52, count: 32 },
  { id: "armored", type: "brute", hp: 350, armor: 34, shield: 80, speed: 32, count: 18 },
  { id: "runners", type: "runner", hp: 100, armor: 0, shield: 0, speed: 95, count: 24 },
  { id: "air", type: "grunt", hp: 70, armor: 0, shield: 0, speed: 62, count: 24, air: true },
  { id: "supply", type: "grunt", hp: 130, armor: 8, shield: 0, speed: 45, count: 80 }
];
const budgetTiers = [
  { budget: 850, experienceBudget: 1800, linkAge: 0 },
  { budget: 6500, experienceBudget: 16000, linkAge: 5 },
  { budget: 26000, experienceBudget: 60000, linkAge: 10 }
];
function randomSource(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

/** Real MatchRoom loop; only clock, RNG, threat fixtures and network I/O are replaced. */
export function compareScenario(recipe, threat, { seed = 1, budget = 850, experienceBudget = 1800, maxTicks = 3600, linkAge = 0 } = {}) {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  let clock = 1_800_000_000_000;
  Date.now = () => clock;
  Math.random = randomSource(seed);
  try {
    const room = createRoom(recipe.character);
    room.broadcast = () => {};
    room.lastSnapshotBroadcastAt = Infinity;
    room.lastPerfBroadcastAt = Infinity;
    room.towerCriticalRandom = randomSource(seed + 123);
    const player = room.state.players.get("p1");
    player.gold = budget;
    player.experience = experienceBudget;
    const client = { sessionId: "p1", send() {} };
    const cell = getMapGridSize(room.activeMap);
    const anchor = findBuildableSpot(room, recipe.towers[0]);
    if (!anchor) throw new Error("No anchor");
    function place(id, x, y) {
      const count = room.towers.size;
      room.placeTower(client, { definitionId: id, x, y });
      if (room.towers.size !== count + 1) throw new Error(`Cannot place ${id} for ${recipe.id} at ${x}, ${y}; gold ${player.gold}`);
      return [...room.towers.values()].at(-1);
    }
    const combat = recipe.towers.map((id, index) => place(id,
      anchor.x + (recipe.isolated ? index * 2 : index % 2) * cell,
      anchor.y + (!recipe.isolated && index === 2 ? cell : 0)));
    const providers = recipe.character === "zeynep" ? ["zeynep-9", "zeynep-10"] : ["warrior-7", "warrior-8"];
    for (let index = 0; index < providers.length; index++) place(providers[index], anchor.x + index * cell * 2, anchor.y + cell * 3);
    room.hireWorker(client, { role: "ammoTransport" });
    room.hireWorker(client, { role: "energyTransport" });
    // Round-robin upgrades, both gold and XP constrained. Unspent resources are reported.
    for (let pass = 0; pass < 9; pass++) {
      for (const tower of combat) {
        if (tower.level >= 10 || player.gold < getTowerLevelGoldCost(tower.definition.cost, tower.level)
          || player.experience < getTowerLevelExpCost(tower.definition.cost, tower.level)) continue;
        room.upgradeTower(client, { towerId: tower.id });
        const tier = getUcubePerkTier(tower.ucubePendingLevel);
        if (tier) room.chooseUcubePerk(client, { towerId: tower.id, perkId: tier.options[0].id });
      }
    }
    const server = combat.find((tower) => tower.definition.id === "warrior-2");
    if (server) {
      room.linkServerTower(client, { serverTowerId: server.id, targetTowerId: combat[0].id });
      server.linkedTowerWaveAges[combat[0].id] = linkAge;
    }
    room.refreshZeynepFormations();
    if (recipe.id === "hiza" && combat.some((tower) => tower.zeynepFormationSize !== 3)) throw new Error("Invalid Hiza fixture");
    if (recipe.isolated && !room.isTowerIsolated(combat[0])) throw new Error("Invalid isolation fixture");
    const spent = player.goldSpent;
    const unspent = player.gold;
    const experienceSpent = experienceBudget - player.experience;
    const loadout = combat.map((tower) => `${tower.definition.id}:L${tower.level}`);
    const originalSpawn = room.spawnEnemy.bind(room);
    // Independent fixture RNG prevents attack RNG consumption from changing spawn positions.
    const spawnRandom = randomSource(seed + 987);
    room.spawnEnemy = () => {
      originalSpawn();
      const enemy = [...room.enemies.values()].at(-1);
      const position = gridToWorld(Math.floor(room.activeMap.cols / 2) + Math.floor(spawnRandom() * 3) - 1, 0, room.activeMap);
      Object.assign(enemy, position, { type: threat.type, hp: threat.hp, maxHp: threat.hp, armor: threat.armor,
        shield: threat.shield, maxShield: threat.shield, speed: room.scaleWorldSpeed(threat.speed),
        movementKind: threat.air ? "air" : "ground", damageResistances: {}, hitTypeResistances: {},
        statusResistances: {}, healthRegenPerSecond: 0 });
    };
    room.waveTarget = threat.count;
    room.spawnCooldownMs = 0;
    const initialHealth = room.teamHealth;
    let ticks = 0;
    while (ticks < maxTicks && !room.matchResult && !room.waveClearedAt) {
      clock += 50;
      room.update(50);
      ticks++;
    }
    const rows = [...room.defenseRows.values()];
    const damage = rows.reduce((sum, row) => sum + row.damage, 0);
    const waitSeconds = rows.reduce((sum, row) => sum + row.seconds.ammo + row.seconds.energy, 0);
    const observedSeconds = rows.reduce((sum, row) => sum + Object.values(row.seconds).reduce((a, b) => a + b, 0), 0);
    const complete = !room.matchResult && room.waveSpawned >= threat.count && room.enemies.size === 0;
    return { recipe: recipe.id, threat: threat.id, seed, budget, experienceBudget, linkAge, spent, unspent, experienceSpent, loadout,
      damage: +damage.toFixed(1), nexusLoss: initialHealth - room.teamHealth, kills: room.kills,
      complete, outcome: complete ? "cleared" : room.matchResult === "defeat" ? "defeat" : "timeout",
      elapsedSeconds: ticks * 0.05, clearSeconds: complete ? ticks * 0.05 : null,
      resourceWaitSeconds: +waitSeconds.toFixed(1), resourceWaitRatio: +(waitSeconds / Math.max(1, observedSeconds)).toFixed(3),
      damagePerGold: +(damage / Math.max(1, spent)).toFixed(2),
      auraEnemySeconds: +rows.reduce((sum, row) => sum + row.auraEnemySeconds, 0).toFixed(1) };
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
}

async function main() {
  const results = [];
  for (const tier of budgetTiers) {
    for (const threat of threats) {
      for (const recipe of recipes) for (const seed of [1, 2, 3]) results.push(compareScenario(recipe, threat, { ...tier, seed }));
      process.stdout.write(`Completed ${tier.budget}g / ${threat.id}\n`);
    }
  }
  await writeFile(new URL("../docs/build-comparison-results.json", import.meta.url), JSON.stringify(results, null, 2) + "\n");
  const lines = ["# Kuruluş karşılaştırması", "", "Aynı altın ve deneyim bütçesi; kurulum, yükseltme ve iki ek taşıyıcı bedelleri dahildir. Harcanmayan bütçe ayrıca gösterilir. Gerçek MatchRoom 50 ms adımlarla, üç sabit tohumla çalışır. Süreler duvar saati eşdeğeridir; bekleme ve aura süreleri oyun saatidir.", "", "Bu bir sabit kuruluş kıyaslamasıdır; en iyi yerleşim araması, insan oyun testi veya bütün kart/eşya kombinasyonlarının denge kanıtı değildir. İlk satırlar yeni bağlantı, yüksek bütçe satırları açıkça 10 dalga yaşlandırılmış Sunucu bağlantısı kullanır. Tehditler kontrollü test profilleridir; sonuçlar doğal dalga zorluğu puanı değildir.", "", "| Bütçe | Tehdit | Kuruluş | Harcanan | Kalan | Hasar | Nexus kaybı | Süre (sn) | Kaynak bekleme (kule·sn) | Hasar/altın |", "|---|---|---|---:|---:|---:|---:|---:|---:|---:|"];
  for (const { budget } of budgetTiers) for (const threat of threats) for (const recipe of recipes) {
    const group = results.filter((row) => row.budget === budget && row.threat === threat.id && row.recipe === recipe.id);
    const mean = (key) => (group.reduce((sum, row) => sum + row[key], 0) / group.length).toFixed(1);
    lines.push(`| ${budget} | ${threat.id} | ${recipe.id} | ${mean("spent")} | ${mean("unspent")} | ${mean("damage")} | ${mean("nexusLoss")} | ${mean("elapsedSeconds")}${group.every((row) => row.complete) ? "" : "*"} | ${mean("resourceWaitSeconds")} | ${mean("damagePerGold")} |`);
  }
  lines.push("", "* Süre sınırına ulaşan veya yenilgiyle biten koşular içerir; temizleme süresi sayılmaz. Ayrıntılı JSON, her koşunun bitiş durumunu, seviyelerini ve deneyim harcamasını içerir.", "", "Otomatik üstünlük taraması (eş bütçe ve tohumdaki her tehditte daha az/eşit nexus kaybı, daha çok/eşit öldürme; en az bir kesin iyileşme):");
  for (const { budget } of budgetTiers) {
    const winners = recipes.filter((candidate) => recipes.filter((other) => other.id !== candidate.id).every((other) => {
      let strict = false;
      const holds = results.filter((row) => row.budget === budget && row.recipe === candidate.id).every((row) => {
        const against = results.find((entry) => entry.budget === budget && entry.recipe === other.id && entry.threat === row.threat && entry.seed === row.seed);
        if (row.nexusLoss < against.nexusLoss || row.kills > against.kills) strict = true;
        return row.nexusLoss <= against.nexusLoss && row.kills >= against.kills;
      });
      return holds && strict;
    }));
    lines.push(`- ${budget} altın: ${winners.map((recipe) => recipe.id).join(", ") || "Bütün diğer kuruluşlara üstün gelen seçenek yok."}`);
  }
  await writeFile(new URL("../docs/build-comparison.md", import.meta.url), lines.join("\n") + "\n");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
