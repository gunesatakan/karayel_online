import assert from "node:assert/strict";
import test from "node:test";
import {
  ORBIT_BLADE_LENGTH_MAX_MULTIPLIER,
  TOWER_HEAT_BY_HIT_TYPE,
  TOWER_OPERATING_ENERGY_BY_HIT_TYPE,
  calculateTowerScaledBaseDamage,
  getTowerBuildCost,
  getOrbitBladeLength,
  getOrbitRotationSpeed,
  getOrbitRotationSpeedForInterval,
  getOrbitTargetHitCooldownMs,
  getTowerShotFuel,
  selectOrbitSweepTargets,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

function createSawRoom() {
  const room = createRoom("onur");
  const definition = towerCatalog.onur.find((tower) => tower.id === "onur-1");
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: definition.id });
  return { room, tower: [...room.towers.values()][0], definition };
}

test("slash ısı, çalışma enerjisi ve enerji yakıtı tablolarına bağlıdır", () => {
  assert.equal(TOWER_HEAT_BY_HIT_TYPE.slash, 1.2);
  assert.equal(TOWER_OPERATING_ENERGY_BY_HIT_TYPE.slash, 1.4);
  assert.equal(getTowerShotFuel("slash"), "energy");
});

test("Testere ortak orbit profilini ve enerji yakıtını kullanır", () => {
  const definition = towerCatalog.onur.find((tower) => tower.id === "onur-1");
  assert.equal(definition.name, "Testere");
  assert.equal(definition.cost, 75);
  assert.equal(definition.damage, 24);
  assert.equal(calculateTowerScaledBaseDamage(definition, 1), 48);
  assert.equal(getTowerBuildCost(definition.cost), 150);
  assert.equal(definition.engine.attack.shape, "orbit");
  assert.equal(definition.engine.attack.executor, "orbit");
  assert.equal(definition.engine.resources.shotFuel, "energy");
  assert.equal(definition.engine.targeting, undefined);
  assert.deepEqual(definition.engine.statusEffects, [
    { type: "bleed", magnitude: 0.01, durationMs: 3000, stacking: "refresh" }
  ]);
});

test("dönüş hızı efektif atış aralığıyla ters orantılı ölçeklenir", () => {
  assert.equal(getOrbitRotationSpeed(1.6, 450, 450), 1.6);
  assert.equal(getOrbitRotationSpeed(1.6, 450, 300), 2.4);
});

test("bıçak uzunluğu menzil çarpanının kareköküyle büyür ve tavana uyar", () => {
  assert.equal(getOrbitBladeLength(46, 4), 92);
  assert.equal(getOrbitBladeLength(46, 100), 46 * ORBIT_BLADE_LENGTH_MAX_MULTIPLIER);
});

test("süpürülen yay yüksek hızda arada kalan düşmanı kaçırmaz", () => {
  const target = { id: "middle", x: Math.cos(Math.PI / 4) * 40, y: Math.sin(Math.PI / 4) * 40, radius: 2, movementKind: "ground" };
  const hits = selectOrbitSweepTargets({ x: 0, y: 0, previousAngle: 0, nextAngle: Math.PI / 2, bladeCount: 1, bladeLength: 50, bladeWidth: 4 }, [target]);
  assert.deepEqual(hits.map(({ id }) => id), ["middle"]);
});

test("aynı düşman soğuma süresinde tekrar vurulmaz, sıradaki bıçak geçişinde vurulabilir", () => {
  const { room, tower } = createSawRoom();
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.maxHp = 10_000;
  enemy.hp = enemy.maxHp;
  enemy.x = tower.x + 30;
  enemy.y = tower.y;
  room.towerDamageRandom = () => 0.5;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  const startHp = enemy.hp + enemy.shield;
  const now = 1_000;
  room.updateOrbitTower(tower, 0.02, now);
  const firstHp = enemy.hp + enemy.shield;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  room.updateOrbitTower(tower, 0.02, now + 1);
  assert.ok(firstHp < startHp);
  assert.equal(enemy.hp + enemy.shield, firstHp);

  tower.bladeAngle = Math.PI - 0.01;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  const cooldownMs = getOrbitTargetHitCooldownMs(2, 1.6);
  room.updateOrbitTower(tower, 0.02, now + cooldownMs);
  assert.ok(enemy.hp + enemy.shield < firstHp);
});

test("sabit düşman mesafeden bağımsız olarak tam turda iki kez vurulur", () => {
  for (const distance of [15, 25, 35, 45]) {
    const { room, tower } = createSawRoom();
    room.spawnEnemy();
    const enemy = [...room.enemies.values()][0];
    enemy.x = tower.x + distance;
    enemy.y = tower.y;
    enemy.maxHp = 100_000;
    enemy.hp = enemy.maxHp;
    room.enemySpatialGrid.rebuild(room.enemies.values());

    let hits = 0;
    room.damageEnemyFromTower = () => { hits += 1; };
    const tickSeconds = 1 / 60;
    // Tam tur suresi donme hizindan gelir; hiz ates araligindan turetildigi icin
    // buraya sabit yazmak testi kulenin gercek hizindan koparirdi.
    const rotationSpeed = getOrbitRotationSpeedForInterval(
      tower.definition.engine.attack.bladeCount,
      tower.definition.fireIntervalMs
    );
    const fullRotationSeconds = Math.PI * 2 / rotationSpeed;
    const ticks = Math.floor(fullRotationSeconds / tickSeconds);
    let now = 10_000;
    for (let tick = 0; tick < ticks; tick += 1) {
      room.updateOrbitTower(tower, tickSeconds, now);
      now += tickSeconds * 1000;
    }
    assert.equal(hits, 2, `distance=${distance}`);
  }
});

test("ölen düşmanın orbit vuruş kaydı temizlenir", () => {
  const { room, tower } = createSawRoom();
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.x = tower.x + 30;
  enemy.y = tower.y;
  enemy.hp = enemy.maxHp = 10_000;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  room.updateOrbitTower(tower, 0.02, 1_000);
  assert.equal(tower.orbitLastHitAt.has(enemy.id), true);

  room.enemies.delete(enemy.id);
  room.enemySpatialGrid.rebuild(room.enemies.values());
  room.updateOrbitTower(tower, 0.02, 1_020);
  assert.equal(tower.orbitLastHitAt.has(enemy.id), false);
});

test("düşman yokken taban hızda saniyede 2.4 enerji ve 9 ısı üretir", () => {
  const { room, tower } = createSawRoom();
  const startingEnergy = tower.energy;
  room.updateTowers(1000);
  assert.ok(Math.abs((startingEnergy - tower.energy) - 2.4) < 0.001);
  assert.ok(Math.abs(tower.temperature - 9) < 0.001);
});

test("Testere enerji tüketimi performansla dönüş hızına göre ölçeklenir", () => {
  const low = createSawRoom();
  low.tower.performance = 0.25;
  const lowStart = low.tower.energy;
  low.room.updateTowers(1000);
  assert.ok(Math.abs((lowStart - low.tower.energy) - 1.9) < 0.001);

  const maximum = createSawRoom();
  maximum.tower.performance = 1;
  const maximumStart = maximum.tower.energy;
  maximum.room.updateTowers(1000);
  assert.ok(Math.abs((maximumStart - maximum.tower.energy) - 3.4) < 0.001);
});

test("standby Testere enerji ve ısı tüketmez", () => {
  const { room, tower } = createSawRoom();
  tower.standby = true;
  const startingEnergy = tower.energy;
  room.updateTowers(1000);
  assert.equal(tower.energy, startingEnergy);
  assert.equal(tower.temperature, 0);
});

test("orbit yürütmesi hedef seçme hattına girmez", () => {
  const { room } = createSawRoom();
  room.findTowerTarget = () => { throw new Error("orbit hedef seçmemeli"); };
  assert.doesNotThrow(() => room.updateTowers(16));
});

test("aynı tickteki her temas ayrı Onur zarı atar", () => {
  const { room, tower } = createSawRoom();
  room.spawnEnemy();
  room.spawnEnemy();
  for (const enemy of room.enemies.values()) {
    enemy.x = tower.x + 30;
    enemy.y = tower.y;
  }
  let rolls = 0;
  room.towerDamageRandom = () => [0, 1][rolls++] ?? 0.5;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  room.updateOrbitTower(tower, 0.02, Date.now());
  assert.equal(rolls, 2);
  assert.ok(tower.misfortune > 0);
  assert.equal(tower.lastLuckMultiplier, 1.5);
});

test("bicak gecis periyodu kulenin ates araligina esittir", () => {
  // Yorunge kulesinde hasari veren sey ates araligi degil, bicagin hedefin
  // uzerinden gecmesi. Ikisi ayri yazilirsa kule ilan ettigi hizda vurmaz ve
  // kodeksin gosterdigi DPS gercek olmaz.
  const definition = towerCatalog.onur.find((tower) => tower.id === "onur-1");
  const bladeCount = definition.engine.attack.bladeCount;
  const speed = getOrbitRotationSpeedForInterval(bladeCount, definition.fireIntervalMs);

  assert.equal(
    Math.round(getOrbitTargetHitCooldownMs(bladeCount, speed)),
    definition.fireIntervalMs,
    "bicak gecis periyodu ates araligindan sapiyor"
  );
});

test("karttan gelen ek bicak vurus sikligini artirir", () => {
  // Ek bicak hizi degistirmez, ayni hizda daha sik gecis demektir: kart gercek
  // bir hasar artisi olmali, yalnizca kapsama genislemesi degil.
  const definition = towerCatalog.onur.find((tower) => tower.id === "onur-1");
  const speed = getOrbitRotationSpeedForInterval(definition.engine.attack.bladeCount, definition.fireIntervalMs);
  const iki = getOrbitTargetHitCooldownMs(2, speed);
  const uc = getOrbitTargetHitCooldownMs(3, speed);

  assert.ok(uc < iki, "ucuncu bicak vurus araligini kisaltmiyor");
  assert.ok(Math.abs(uc - iki * 2 / 3) < 0.001, "vurus araligi bicak sayisiyla ters orantili degil");
});

test("ayni dusman bicak her donusunde yeniden hasar alir", () => {
  const { room, tower } = createSawRoom();
  tower.maxEnergy = 100_000;
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.maxHp = 10_000_000;
  enemy.hp = enemy.maxHp;

  const step = 0.016;
  const seconds = 10;
  let now = Date.now();
  let hits = 0;
  let lastHp = enemy.hp;

  for (let tick = 0; tick < seconds / step; tick += 1) {
    now += step * 1000;
    // Dusman bicak yolunda sabit dursun; olculen sey yalnizca vurus sikligi.
    enemy.x = tower.x + 30;
    enemy.y = tower.y;
    tower.energy = tower.maxEnergy;
    tower.temperature = 0;
    tower.heatLocked = false;
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateOrbitTower(tower, step, now);
    if (enemy.hp < lastHp) {
      hits += 1;
      lastHp = enemy.hp;
    }
  }

  assert.ok(hits > 1, "bicak ayni dusmana yalnizca bir kez vurdu");
  // Vurus sikligi ates araligini takip etmeli; olcum tick kuantizasyonu yuzunden
  // birkac vurus sapabilir.
  const beklenen = (seconds * 1000) / tower.definition.fireIntervalMs;
  assert.ok(
    hits >= beklenen * 0.8,
    `bicak ${seconds} saniyede yalnizca ${hits} kez vurdu, beklenen ~${beklenen.toFixed(0)}`
  );
});
