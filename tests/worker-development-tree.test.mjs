/**
 * Isci gelisim agacinin 60 yon/derinlestirme secenegi.
 *
 * Agacin 1/2, 4/5, 7/8. hucreleri bos duruyordu. Artik her uclu sira bir yon
 * secimi, o yonun derinlestirmesi ve eski oyun degistirici ciftten olusuyor.
 * Secenekler hicbir kuleye ya da karaktere baglanmiyor: etki evrensel,
 * hangisinin hangi planla iyi gittigini oyuncu buluyor. Bu dosya o sozu,
 * metinle sayilarin uyusmasini, acma kurallarini ve etkilerin gercek odada
 * calistigini sinar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  HIRABLE_WORKER_ROLES,
  WORKER_DEVELOPMENT_CELLS,
  WORKER_DEVELOPMENT_EFFECTS,
  WORKER_DEVELOPMENT_ROWS,
  WORKER_DEVELOPMENT_UPGRADES,
  WORKER_DEVELOPMENT_XP_COSTS,
  WORKER_FULL_TANK_ENERGY_RATIO,
  WORKER_SKILL_TIERS,
  characters,
  getMapGridSize,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const CHARACTER_NAMES = characters.map((character) => character.displayName);

function setupRoom() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  return room;
}

function place(room, definitionId, spot = findBuildableSpot(room, definitionId)) {
  assert.ok(spot, `${definitionId} icin yer yok`);
  room.placeTower(client, { ...spot, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower.definition.id, definitionId);
  return tower;
}

let workerSeq = 0;
function addWorker(room, mode, skillIds, at = { x: 0, y: 0 }) {
  const worker = { id: `w${workerSeq += 1}`, ownerId: "p1", mode, skillIds, x: at.x, y: at.y, logisticsPhase: "deliver", targetTowerId: "", cargo: 0, capacity: 9, speed: 82, vx: 0, vy: 0, hp: 60, maxHp: 60 };
  room.drones.set(worker.id, worker);
  return worker;
}

function spawnEnemies(room, count) {
  for (let index = 0; index < count; index += 1) room.spawnEnemy();
  return [...room.enemies.values()];
}

const developmentOptions = () => Object.values(WORKER_DEVELOPMENT_ROWS).flatMap((rows) => rows.flatMap((row) => row.flat()));

test("her rolun 9 hucresi de dolu: yon, derinlestirme, oyun degistirici", () => {
  assert.equal(WORKER_DEVELOPMENT_XP_COSTS.length, 9);
  for (let index = 1; index < 9; index += 1) assert.ok(WORKER_DEVELOPMENT_XP_COSTS[index] > WORKER_DEVELOPMENT_XP_COSTS[index - 1]);
  // Oyun degistiricilerin bedeli degismedi.
  assert.deepEqual([2, 5, 8].map((index) => WORKER_DEVELOPMENT_XP_COSTS[index]), [120, 280, 560]);
  for (const role of HIRABLE_WORKER_ROLES) {
    const cells = WORKER_DEVELOPMENT_CELLS[role];
    assert.equal(cells.length, 9);
    for (const [index, cell] of cells.entries()) {
      assert.equal(cell.options?.length, 2, `${role} ${index + 1}. hucre bos`);
      if (index % 3 === 2) assert.deepEqual(cell.options, WORKER_SKILL_TIERS[role][Math.floor(index / 3)]);
    }
  }
  const ids = developmentOptions().map((option) => option.id);
  assert.equal(ids.length, 60);
  assert.equal(new Set(ids).size, 60, "kimlikler tekil");
  assert.deepEqual([...ids].sort(), Object.keys(WORKER_DEVELOPMENT_EFFECTS).sort(), "her secenegin sayilari var");
});

test("derinlestirme yalnizca kendi yonunu istiyor", () => {
  for (const rows of Object.values(WORKER_DEVELOPMENT_ROWS)) {
    for (const [direction, deepening] of rows) {
      for (const option of direction) assert.equal(option.requires, undefined);
      assert.equal(deepening[0].requires, direction[0].id);
      assert.equal(deepening[1].requires, direction[1].id);
      assert.equal(WORKER_DEVELOPMENT_UPGRADES[direction[0].id], deepening[0].id);
      assert.equal(WORKER_DEVELOPMENT_UPGRADES[direction[1].id], deepening[1].id);
    }
  }
});

const seconds = (ms) => `${String(ms / 1000).replace(".", ",")} sn`;

test("metin kodun sayilarini yaziyor", () => {
  for (const option of developmentOptions()) {
    const effect = WORKER_DEVELOPMENT_EFFECTS[option.id];
    const text = option.description;
    const expect = (fragment) => assert.ok(text.includes(fragment), `${option.id}: "${fragment}" yok -> ${text}`);
    if (effect.value !== undefined) {
      if (effect.unit === "%") expect(`%${Math.round(effect.value * 100)}`);
      else if (effect.unit === "°") expect(`${effect.value}°`);
      else expect(`${effect.value} `);
    }
    if (effect.durationMs !== undefined) expect(seconds(effect.durationMs));
    if (effect.shots !== undefined) expect(`${effect.shots} `);
    if (effect.count !== undefined) expect(`${effect.count} `);
    if (effect.radiusCells !== undefined) expect(`${effect.radiusCells} kare`);
    if (effect.cooldownMs !== undefined) expect(seconds(effect.cooldownMs));
  }
});

test("hicbir secenek bir kuleyi ya da karakteri anmiyor", () => {
  const towerNames = new Set(Object.values(towerCatalog).flatMap((towers) => towers.map((tower) => tower.name)));
  for (const option of developmentOptions()) {
    for (const name of [...towerNames, ...CHARACTER_NAMES]) {
      assert.ok(!option.description.includes(name) && !option.name.includes(name), `${option.id} "${name}" anıyor`);
    }
  }
});

test("hucreler sirayla, her hucreden tek secim, derinlestirme yonunu istiyor", () => {
  const room = setupRoom();
  const player = room.state.players.get("p1");
  const [direction, deepening] = WORKER_DEVELOPMENT_ROWS.energyTransport[0];
  player.experience = 10_000;

  // Sira atlanamiyor: 2. hucre 1. hucreden once acilmaz.
  room.unlockWorkerDevelopment(client, { role: "energyTransport", skillId: deepening[0].id });
  assert.deepEqual(player.workerSkillIds ?? [], []);

  room.unlockWorkerDevelopment(client, { role: "energyTransport", skillId: direction[1].id });
  assert.deepEqual(player.workerSkillIds, [direction[1].id]);
  assert.equal(player.experience, 10_000 - WORKER_DEVELOPMENT_XP_COSTS[0]);

  // Ayni hucrenin oteki secenegi artik kapali.
  room.unlockWorkerDevelopment(client, { role: "energyTransport", skillId: direction[0].id });
  assert.deepEqual(player.workerSkillIds, [direction[1].id]);

  // B'yi secen A'nin derinlestirmesini alamaz, B'ninkini alir.
  room.unlockWorkerDevelopment(client, { role: "energyTransport", skillId: deepening[0].id });
  assert.deepEqual(player.workerSkillIds, [direction[1].id]);
  room.unlockWorkerDevelopment(client, { role: "energyTransport", skillId: deepening[1].id });
  assert.deepEqual(player.workerSkillIds, [direction[1].id, deepening[1].id]);
  assert.equal(player.experience, 10_000 - WORKER_DEVELOPMENT_XP_COSTS[0] - WORKER_DEVELOPMENT_XP_COSTS[1]);

  // 3. hucre: eski oyun degistirici, ucuncu sirada.
  room.unlockWorkerDevelopment(client, { role: "energyTransport", skillId: "energy-relay" });
  assert.equal(player.workerSkillIds.at(-1), "energy-relay");

  // XP yetmezse acilmaz ve XP gitmez.
  player.experience = WORKER_DEVELOPMENT_XP_COSTS[3] - 1;
  room.unlockWorkerDevelopment(client, { role: "energyTransport", skillId: "energy-mark-guard" });
  assert.equal(player.workerSkillIds.length, 3);
  assert.equal(player.experience, WORKER_DEVELOPMENT_XP_COSTS[3] - 1);
});

test("enerji yonleri: gerilim maliyeti, bobin isiyi, depo hasari degistiriyor", () => {
  const room = setupRoom();
  const tower = place(room, "warrior-1");
  const baseCost = room.getTowerEnergyCost(tower);
  const baseRange = room.getTowerRange(tower);

  room.applyEnergyWorkerArrival(addWorker(room, "energyTransport", ["energy-high-voltage"]), tower);
  assert.ok(Math.abs(room.getTowerEnergyCost(tower) - baseCost * 0.75) < 1e-9);
  room.applyEnergyWorkerArrival(addWorker(room, "energyTransport", ["energy-high-voltage", "energy-superconductor"]), tower);
  assert.ok(Math.abs(room.getTowerEnergyCost(tower) - baseCost * 0.6) < 1e-9, "derinlestirme en guclu degeri yaziyor");

  tower.temperature = 50;
  room.applyEnergyWorkerArrival(addWorker(room, "energyTransport", ["energy-cooling-coil"]), tower);
  assert.equal(tower.temperature, 38);
  tower.temperature = 90;
  tower.heatLocked = true;
  room.applyEnergyWorkerArrival(addWorker(room, "energyTransport", ["energy-cooling-coil", "energy-cryo-coil"]), tower);
  assert.equal(tower.temperature, 70);
  assert.equal(tower.heatLocked, false);

  room.applyEnergyWorkerArrival(addWorker(room, "energyTransport", ["energy-long-line"]), tower);
  assert.ok(Math.abs(room.getTowerRange(tower) - baseRange * 1.15) < 1e-6);

  const now = Date.now();
  const before = room.getTowerHitDamageAdd(tower, now);
  room.applyEnergyWorkerArrival(addWorker(room, "energyTransport", ["energy-full-tank"]), tower);
  tower.energy = tower.maxEnergy;
  assert.ok(Math.abs(room.getTowerHitDamageAdd(tower, now) - before - 0.15) < 1e-9);
  tower.energy = tower.maxEnergy * WORKER_FULL_TANK_ENERGY_RATIO - 1;
  assert.ok(Math.abs(room.getTowerHitDamageAdd(tower, now) - before) < 1e-9, "depo dolu degilken bonus yok");
});

test("isaret koruma vurulan isaretli dusmanin isaretini bastan baslatiyor; yigini buyutmuyor, isaretsize koymuyor", () => {
  const room = setupRoom();
  const laser = place(room, "warrior-5");
  const [marked, plain] = spawnEnemies(room, 2);
  const now = Date.now();
  // Iki yuva, ikisi de bitmek uzere; ucuncu yuva bos.
  room.applyTrackingStacks(marked, now + 500, 2);
  const hit = (enemy) => room.damageEnemy(enemy, 1, 0, "warrior-5", laser.ownerId, "fire", 0, laser.level, laser.id, "focus");

  // Korumasiz vurus suresine dokunmuyor (vurus isareti tuketmiyor da).
  hit(marked);
  assert.equal(room.getTrackingStackCount(marked, now), 2);
  assert.equal(Math.max(...marked.trackingStackUntil), now + 500);

  room.applyEnergyWorkerArrival(addWorker(room, "energyTransport", ["energy-mark-guard"]), laser);
  hit(marked);
  hit(plain);
  assert.equal(room.getTrackingStackCount(marked, now), 2, "yigin buyudu ya da kuculdu");
  assert.ok(marked.trackingStackUntil.filter((until) => until > now).every((until) => until > now + 5000), "isaret bastan baslamadi");
  assert.equal(room.getTrackingStackCount(plain, now), 0, "isaretsiz dusmana isaret kondu");
});

test("hedef kilidi hedef degisince birikimi koruyor", () => {
  const room = setupRoom();
  const obsession = place(room, "warrior-4");
  const [first, second] = spawnEnemies(room, 2);
  for (let shot = 0; shot < 4; shot += 1) room.prepareTowerShot(obsession, first);
  const stacks = obsession.focusStacks;
  assert.ok(stacks > 0);
  room.prepareTowerShot(obsession, second);
  assert.equal(obsession.focusStacks, 0, "kilitsiz hedef degisimi birikimi siler");

  for (let shot = 0; shot < 4; shot += 1) room.prepareTowerShot(obsession, first);
  room.applyEnergyWorkerArrival(addWorker(room, "energyTransport", ["energy-target-lock"]), obsession);
  room.prepareTowerShot(obsession, second);
  assert.ok(obsession.focusStacks >= stacks, `kilit birikimi tutmali: ${obsession.focusStacks}`);
});

test("kristal yonleri: reaktor teslimati sahibin kulelerine isliyor", () => {
  const room = setupRoom();
  const reactor = place(room, "warrior-8");
  const near = place(room, "warrior-1");
  const far = place(room, "warrior-1");
  const nearDistance = Math.hypot(near.x - reactor.x, near.y - reactor.y);
  const farDistance = Math.hypot(far.x - reactor.x, far.y - reactor.y);
  const [closer, farther] = nearDistance <= farDistance ? [near, far] : [far, near];
  const baseCost = room.getTowerEnergyCost(closer);

  room.applyCrystalWorkerArrival(addWorker(room, "crystalCollector", ["crystal-overload"]), reactor, false);
  assert.ok(Math.abs(room.getTowerEnergyCost(closer) - baseCost * 0.85) < 1e-9);
  assert.ok(Math.abs(room.getTowerEnergyCost(farther) - baseCost * 0.85) < 1e-9);
  assert.equal(room.getTowerEnergyCost(reactor), 0, "reaktor kendisi etkilenmiyor");

  closer.temperature = 40;
  farther.temperature = 10;
  room.applyCrystalWorkerArrival(addWorker(room, "crystalCollector", ["crystal-heat-vent"]), reactor, false);
  assert.equal(closer.temperature, 25);
  assert.equal(farther.temperature, 0);

  const burst = addWorker(room, "crystalCollector", ["crystal-burst-reserve"]);
  room.applyCrystalWorkerArrival(burst, reactor, false);
  assert.ok(!(closer.energyFreeUntil > Date.now()), "reaktor dolmadan tetiklenmez");
  room.applyCrystalWorkerArrival(burst, reactor, true);
  assert.ok(closer.energyFreeUntil > Date.now());
  closer.energyFreeUntil = 0;
  room.applyCrystalWorkerArrival(burst, reactor, true);
  assert.equal(closer.energyFreeUntil, 0, "bekleme suresi");

  farther.energy = 10;
  room.applyCrystalWorkerArrival(addWorker(room, "crystalCollector", ["crystal-far-link"]), reactor, false);
  assert.equal(farther.energy, 25, "en uzak kuleye 15 enerji");
});

test("kararli akis calisma enerjisini bir sure durduruyor", () => {
  const room = setupRoom();
  const reactor = place(room, "warrior-8");
  const tower = place(room, "warrior-1");
  tower.energy = 50;
  room.updateTowers(1000);
  const drained = 50 - tower.energy;
  assert.ok(drained > 0, "calisma enerjisi normalde harcaniyor");

  tower.energy = 50;
  room.applyCrystalWorkerArrival(addWorker(room, "crystalCollector", ["crystal-steady-flow"]), reactor, false);
  room.updateTowers(1000);
  assert.equal(tower.energy, 50);
});

test("yakin alan yalnizca reaktorun cevresine hasar veriyor", () => {
  const room = setupRoom();
  const reactor = place(room, "warrior-8");
  const grid = getMapGridSize(room.activeMap);
  const towers = [place(room, "warrior-1"), place(room, "warrior-1")];
  const now = Date.now();
  const before = towers.map((tower) => room.getTowerHitDamageAdd(tower, now));
  room.applyCrystalWorkerArrival(addWorker(room, "crystalCollector", ["crystal-near-field"]), reactor, false);
  for (const [index, tower] of towers.entries()) {
    const inside = Math.hypot(tower.x - reactor.x, tower.y - reactor.y) <= grid * 2;
    const gained = room.getTowerHitDamageAdd(tower, now) - before[index];
    assert.ok(Math.abs(gained - (inside ? 0.12 : 0)) < 1e-9, `${inside ? "icerde" : "disarda"}: ${gained}`);
  }
});

test("muhimmat toplayicinin yonleri fabrikadan cikan partiyle kuleye geliyor", () => {
  const room = setupRoom();
  const tower = place(room, "warrior-1");
  const [enemy] = spawnEnemies(room, 1);
  const transport = addWorker(room, "ammoTransport", []);
  const baseAmmo = room.getTowerAmmoCost(tower);
  const baseHeat = room.getTowerShotHeat(tower);
  const baseRange = room.getTowerRange(tower);

  // Toplayici yoksa fabrika becerisi de yok.
  room.applyAmmoTransportArrival(transport, tower, false);
  assert.equal(room.getTowerAmmoCost(tower), baseAmmo);

  addWorker(room, "ammoCollector", ["ammo-light-cast", "ammo-heat-sink-casing", "ammo-piercing-core", "ammo-long-barrel", "ammo-heavy-cast"]);
  room.applyAmmoTransportArrival(transport, tower, false);
  assert.ok(Math.abs(room.getTowerAmmoCost(tower) - baseAmmo * 0.75) < 1e-9);
  assert.ok(Math.abs(room.getTowerShotHeat(tower) - baseHeat * 0.7) < 1e-9);
  assert.ok(Math.abs(room.getTowerRange(tower) - baseRange * 1.12) < 1e-6);

  const now = Date.now();
  const withShots = room.getTowerHitDamageAdd(tower, now);
  for (let shot = 0; shot < 4; shot += 1) room.consumeTowerResources(tower);
  assert.ok(Math.abs(withShots - room.getTowerHitDamageAdd(tower, Date.now()) - 0.2) < 1e-9, "4 atistan sonra Agir Dokum biter");

  room.spawnTowerProjectile(tower, enemy);
  const projectile = [...room.projectiles.values()].at(-1);
  assert.equal(projectile.pierceLimit, (tower.definition.engine?.attack.pierceCount ?? 1) + 1);
});

test("zirhli kasa ve zirh kaplama kulenin aldigi hasari kesiyor", () => {
  const room = setupRoom();
  const plain = place(room, "warrior-1");
  const armored = place(room, "warrior-1");
  addWorker(room, "ammoCollector", ["ammo-armored-crate"]);
  room.applyAmmoTransportArrival(addWorker(room, "ammoTransport", []), armored, false);
  room.damageTower(plain, 50);
  room.damageTower(armored, 50);
  const plainLoss = plain.maxHp - plain.hp;
  const armoredLoss = armored.maxHp - armored.hp;
  // Zirh carpandan sonra dusuluyor: kayip = max(1, 50 x 0,8 - zirh).
  const armor = 50 - plainLoss;
  assert.ok(Math.abs(armoredLoss - Math.max(1, 50 * 0.8 - armor)) < 1e-6, `${plainLoss} -> ${armoredLoss}`);
  assert.ok(armoredLoss < plainLoss);
});

test("muhimmat tasiyicinin yonleri: ceket, besleme, isaretli ve sarsici mermi", () => {
  const room = setupRoom();
  const tower = place(room, "warrior-1");
  const [enemy] = spawnEnemies(room, 1);
  const baseCooling = room.getTowerCoolingPerSecond(tower);
  const baseInterval = room.getTowerFireInterval(tower);

  room.applyAmmoTransportArrival(addWorker(room, "ammoTransport", ["ammo-heat-jacket", "ammo-fast-feed", "ammo-trace-rounds", "ammo-concussion-rounds"]), tower, false);
  assert.ok(Math.abs(room.getTowerCoolingPerSecond(tower) - baseCooling * 1.4) < 1e-9);
  assert.ok(Math.abs(room.getTowerFireInterval(tower) - baseInterval / 1.2) < 1e-6);

  assert.equal(room.getTrackingStackCount(enemy), 0);
  room.damageEnemy(enemy, 1, 0, tower.definition.id, "p1", "physical", 0, 1, tower.id, "projectile");
  assert.equal(room.getTrackingStackCount(enemy), 1, "vurus Takip isareti birakiyor");
  assert.ok(enemy.slowUntil > Date.now(), "vurus yavaslatiyor");
  assert.equal(tower.workerBoosts.markShots.shots, 4);
  assert.equal(tower.workerBoosts.slowShots.shots, 4);
});

test("paylasilan kasa yandaki ayni muhimmatli kuleye, yalniz kurye komsusuz kuleye isliyor", () => {
  const room = setupRoom();
  const grid = getMapGridSize(room.activeMap);
  const target = place(room, "warrior-1");
  const neighbor = place(room, "warrior-1", { x: target.x + grid, y: target.y });
  neighbor.ammo = 0;
  room.applyAmmoTransportArrival(addWorker(room, "ammoTransport", ["ammo-shared-crate"]), target, false);
  assert.equal(neighbor.ammo, 2);

  const now = Date.now();
  const before = room.getTowerHitDamageAdd(target, now);
  room.applyAmmoTransportArrival(addWorker(room, "ammoTransport", ["ammo-lone-courier"]), target, false);
  assert.equal(room.getTowerHitDamageAdd(target, now), before, "komsusu olan kuleye bonus yok");

  const lone = place(room, "warrior-1");
  if (room.isTowerIsolated(lone)) {
    const loneBefore = room.getTowerHitDamageAdd(lone, now);
    room.applyAmmoTransportArrival(addWorker(room, "ammoTransport", ["ammo-lone-courier"]), lone, false);
    assert.ok(Math.abs(room.getTowerHitDamageAdd(lone, now) - loneBefore - 0.15) < 1e-9);
  }
});

test("tamircinin yonleri onarim bitince isliyor", () => {
  const room = setupRoom();
  const tower = place(room, "warrior-1");
  const repairer = addWorker(room, "repairer", ["repair-spare-parts", "repair-coolant", "repair-tune-up"], { x: tower.x, y: tower.y });
  const baseCost = room.getTowerEnergyCost(tower);
  tower.hp = tower.maxHp - 0.5;
  tower.ammo = 0;
  tower.temperature = 80;
  tower.heatLocked = true;
  room.updateRepairWorker(repairer, 1);
  assert.equal(tower.hp, tower.maxHp);
  assert.equal(tower.ammo, tower.maxAmmo * 0.25);
  assert.equal(tower.temperature, 0);
  assert.equal(tower.heatLocked, false);
  assert.ok(Math.abs(room.getTowerEnergyCost(tower) - baseCost * 0.75) < 1e-9);

  // Zaten tam canli kuleye dokunmak bir onarim degil: etki yeniden gelmiyor.
  tower.ammo = 0;
  room.updateRepairWorker(repairer, 1);
  assert.equal(tower.ammo, 0);
});
