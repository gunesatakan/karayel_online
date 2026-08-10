import assert from "node:assert/strict";
import test from "node:test";
import {
  ORBIT_BLADE_LENGTH_MAX_MULTIPLIER,
  TOWER_HEAT_BY_HIT_TYPE,
  TOWER_OPERATING_ENERGY_BY_HIT_TYPE,
  getOrbitBladeLength,
  getOrbitRotationSpeed,
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
  assert.equal(definition.engine.attack.shape, "orbit");
  assert.equal(definition.engine.attack.executor, "orbit");
  assert.equal(definition.engine.resources.shotFuel, "energy");
  assert.equal(definition.engine.targeting, undefined);
});

test("dönüş hızı efektif atış aralığıyla ters orantılı ölçeklenir", () => {
  assert.equal(getOrbitRotationSpeed(3.2, 450, 450), 3.2);
  assert.equal(getOrbitRotationSpeed(3.2, 450, 300), 4.8);
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

test("aynı düşman ardışık ticklerde yeniden vurulabilir", () => {
  const { room, tower } = createSawRoom();
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.x = tower.x;
  enemy.y = tower.y;
  room.towerDamageRandom = () => 0.5;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  const startHp = enemy.hp + enemy.shield;
  room.updateOrbitTower(tower, 0.02, Date.now());
  const firstHp = enemy.hp + enemy.shield;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  room.updateOrbitTower(tower, 0.02, Date.now());
  assert.ok(firstHp < startHp);
  assert.ok(enemy.hp + enemy.shield < firstHp);
});

test("düşman yokken taban hızda saniyede 5.6 enerji ve 9 ısı üretir", () => {
  const { room, tower } = createSawRoom();
  const startingEnergy = tower.energy;
  room.updateTowers(1000);
  assert.ok(Math.abs((startingEnergy - tower.energy) - 5.6) < 0.001);
  assert.ok(Math.abs(tower.temperature - 9) < 0.001);
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
    enemy.x = tower.x;
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
