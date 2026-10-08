/**
 * Ucube'nin susmasi.
 *
 * Sahibin sikayeti: Ucube cogu zaman ates etmiyordu. Olcum (gercek oda
 * dongusu, sinirsiz muhimmat ve enerji): 120 sn'de 4 atis; Obsesyon 27,
 * Takipci 21. Uc sebep vardi, ucu de burada kilitli:
 * - Atis isisi 28,6 (carpma x elektrik): surekli atis isiyla sinirli oldugu
 *   icin Ucube diger hasar kulelerinin ucte biri hizda atabiliyordu.
 * - Isi freni araligi atis anindaki sicakliktan hesapliyordu: kuleyi ~100
 *   dereceye cikaran atis ~100 kat uzun bir bekleme biraktiriyor, kule
 *   sogudugu halde dakikaya yakin susuyordu.
 * - Ucube'nin ritmi (hiz yigini ve 20 sn'lik zorunlu soguma) kule ates
 *   edemezken de ilerliyordu.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { calculateTowerShotHeat, towerCatalog } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const definitions = Array.isArray(towerCatalog) ? towerCatalog : Object.values(towerCatalog).flat();
const definition = (id) => definitions.find((entry) => entry.id === id);

function setup(definitionId = "warrior-6") {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.lastSnapshotBroadcastAt = Infinity;
  room.lastPerfBroadcastAt = Infinity;
  room.clients = [client];
  const spot = findBuildableSpot(room, definitionId);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
  return { room, tower: [...room.towers.values()].at(-1) };
}

test("Ucube'nin atış ısısı Takipçi düzeyinde: ısı bütçesi öteki hasar kuleleriyle aynı bantta", () => {
  const heat = (id) => calculateTowerShotHeat(definition(id), 0.5);
  assert.ok(Math.abs(heat("warrior-6") - 10) < 0.1, `Ucube ${heat("warrior-6")}`);
  assert.ok(heat("warrior-6") <= heat("warrior-1") * 1.05);
});

test("ısı kilidi açılınca bekleme normal aralığa iniyor: soğuyan kule susmaya devam etmiyor", () => {
  const { room, tower } = setup("warrior-6");
  tower.heatLocked = true;
  tower.temperature = room.getTowerHeatReleaseThreshold(tower) + 0.01;
  // Kilide sokan atisin ~100 derecede frenlenmis araligi.
  tower.cooldownMs = 48_000;
  room.update(50);
  assert.equal(tower.heatLocked, false, "kilit acilmadi");
  assert.ok(tower.cooldownMs <= room.getTowerFireInterval(tower), `bekleme ${tower.cooldownMs}`);
});

test("Ucube'nin ritmi yalnızca ateş edebilirken ilerliyor; kilitliyken yığın birikmiyor ama silinmiyor", () => {
  const { room, tower } = setup("warrior-6");
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x: tower.x + 40, y: tower.y });
  tower.activeMs = 3000;
  tower.heatLocked = true;
  for (let tick = 0; tick < 40; tick += 1) room.updateUcubeRhythm(tower, enemy, 50);
  assert.equal(tower.activeMs, 3000, "kilitliyken ritim ilerledi");
  tower.heatLocked = false;
  tower.ammo = tower.maxAmmo;
  tower.energy = tower.maxEnergy;
  room.updateUcubeRhythm(tower, enemy, 50);
  assert.equal(tower.activeMs, 3050);
  assert.equal(tower.focusStacks, 3);
});

test("sürekli dalgada Ucube öteki hasar kuleleri kadar sık ateş ediyor", () => {
  const originalNow = Date.now;
  let clock = 1_800_000_000_000;
  Date.now = () => clock;
  try {
    const shots = {};
    for (const definitionId of ["warrior-6", "warrior-1"]) {
      const { room, tower } = setup(definitionId);
      let count = 0;
      const spawn = room.spawnTowerProjectile.bind(room);
      room.spawnTowerProjectile = (source, target) => { if (source === tower) count += 1; return spawn(source, target); };
      room.waveTarget = 100_000;
      room.spawnCooldownMs = 0;
      for (let tick = 0; tick < 120 * 20; tick += 1) {
        tower.hp = tower.maxHp;
        tower.ammo = tower.maxAmmo;
        tower.energy = tower.maxEnergy;
        clock += 50;
        room.update(50);
      }
      shots[definitionId] = count;
    }
    assert.ok(shots["warrior-6"] >= 15, `Ucube 120 sn'de ${shots["warrior-6"]} atis (eskiden 4)`);
    assert.ok(shots["warrior-6"] >= shots["warrior-1"] * 0.7, `Ucube ${shots["warrior-6"]}, Takipci ${shots["warrior-1"]}`);
  } finally {
    Date.now = originalNow;
  }
});
