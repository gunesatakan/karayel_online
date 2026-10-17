/**
 * Ulti kendi oldurdugu ile dolmuyor.
 *
 * Her oldurme odadaki herkese ulti sarji veriyordu; ultinin kendi oldurmeleri
 * de. Sahibinin karari: ultinin oldurmesi (dogrudan vurusu ya da uyguladigi
 * durumun tiki) ne atana ne takim arkadasina sarj veriyor. Buradaki sozler:
 * - Zeynep sutunu, Mage, Tank, AttackLord drone'u ve Sempati kanamasi
 *   oldurunce kimsenin sarji artmiyor; oldurmenin geri kalani (altin, sayac)
 *   aynen;
 * - kulenin oldurmesi herkese eskisi gibi; ultinin guclendirdigi kulenin
 *   (Gotik Kabus) ve ultinin degdigi dusmanin olum zincirinin (hasar bagi)
 *   oldurmesi de -- onlar ultinin degil;
 * - kulenin kanamasi Sempati kanamasinin yerine gecerse tik kulenin;
 * - her ultinin kulesiz hasari ulti kaynagi olarak taniniyor (yeni bir ulti
 *   yolu adsiz eklenirse bu test yakaliyor).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isUltimateDamageSource } from "../apps/server/dist/rooms/MatchRoom.js";
import { ATAKAN_EXECUTE_SOURCE_ID, characters, getMapGridSize, getMapOrigin } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

/** Oldurme basina sarj (`finishEnemyKill`: 7; AttackLord'da 1/3). */
const KILL_CHARGE = 7;

function setup(characterId) {
  const room = createRoom(characterId);
  const owner = { sessionId: "p1", send() {} };
  room.clients = [owner];
  room.broadcast = () => {};
  const p1 = room.state.players.get("p1");
  // Takim arkadasi: ulti sarji karakter carpani olmadan (Mage).
  const p2 = { ...p1, id: "p2", characterId: "mage", ultimateCharge: 10, runModifiers: [], ownedCardIds: [], ownedShopItemIds: [] };
  room.state.players.set("p2", p2);
  return { room, owner, p1, p2 };
}

function placeTowers(room, definitionId, count) {
  const towers = [];
  for (let index = 0; index < count; index += 1) {
    const spot = findBuildableSpot(room, definitionId);
    assert.ok(spot, `${definitionId} icin yer yok`);
    room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId });
    towers.push([...room.towers.values()].at(-1));
  }
  return towers;
}

function enemyAt(room, x, y, hp = 30) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x, y, hp, maxHp: hp, shield: 0, maxShield: 0, armor: 0, movementKind: "ground", damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
  return enemy;
}

function enemyInColumn(room, column, hp = 30) {
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  return enemyAt(room, origin.x + column * gridSize + gridSize / 2, origin.y + gridSize * 3, hp);
}

/** Kulenin oldurmesi: kontrol icin, herkese sarj vermeli. */
function towerKill(room, tower, enemy) {
  return room.damageEnemy(enemy, 1_000_000, 0, tower.definition.id, tower.ownerId, "true", 0, tower.level, tower.id);
}

test("isUltimateDamageSource: ulti kaynaklari ve adlandirma kurali", () => {
  for (const id of ["ultimate", "warrior-ultimate-drone", "ultimate:sympathy", "ultimate:healer", "ultimate:gelecek"]) {
    assert.equal(isUltimateDamageSource(id), true, id);
  }
  for (const id of [undefined, "", "skill", "status:bleed", "status:burn", "legendary:chain", "legendary:link", "warrior-1", "archer-skill-bully", ATAKAN_EXECUTE_SOURCE_ID, "zeynep-ultimate-column-x"]) {
    assert.equal(isUltimateDamageSource(id), false, String(id));
  }
});

test("Zeynep sutunu: ultinin oldurmesi kimseye sarj vermiyor; kule oldurmesi herkese", () => {
  const { room, owner, p1, p2 } = setup("zeynep");
  const [tower] = placeTowers(room, "zeynep-1", 1);
  const victim = enemyInColumn(room, 3);
  const killsBefore = room.kills;
  const goldBefore = p1.gold;
  p1.ultimateCharge = 100;

  room.useUltimate(owner, { column: 3 });

  assert.equal(room.enemies.has(victim.id), false, "sutun dusmani oldurmedi");
  assert.equal(p1.ultimateCharge, 0, "atan kendi oldurmesiyle doldu");
  assert.equal(p2.ultimateCharge, 10, "takim arkadasi ultinin oldurmesiyle doldu");
  // Oldurmenin geri kalani aynen: sayac ve altin.
  assert.equal(room.kills, killsBefore + 1);
  assert.ok(p1.gold > goldBefore, "ulti oldurmesi altin vermedi");

  const other = enemyAt(room, tower.x, tower.y);
  assert.equal(towerKill(room, tower, other), true);
  assert.equal(p1.ultimateCharge, KILL_CHARGE);
  assert.equal(p2.ultimateCharge, 10 + KILL_CHARGE);
});

test("Mage meteoru ve Tank kilit alani (`ultimate`): oldurme sarj vermiyor", () => {
  for (const characterId of ["mage", "tank"]) {
    const { room, owner, p1, p2 } = setup(characterId);
    const enemies = [enemyAt(room, 100, 100, 5), enemyAt(room, 160, 120, 5)];
    p1.ultimateCharge = 100;
    room.useUltimate(owner, {});
    assert.ok(enemies.every((enemy) => !room.enemies.has(enemy.id)), `${characterId} ultisi oldurmedi`);
    assert.equal(p1.ultimateCharge, 0, characterId);
    assert.equal(p2.ultimateCharge, 10, characterId);
  }
});

test("AttackLord drone'larinin oldurmesi sarj vermiyor", () => {
  const { room, owner, p1, p2 } = setup("warrior");
  const towers = placeTowers(room, "warrior-1", 2);
  const targets = towers.map((tower) => enemyAt(room, tower.x, tower.y));
  p1.ultimateCharge = 100;
  room.useUltimate(owner, { mode: "attack" });
  for (let tick = 0; tick < 100 && (room.pendingAtakanDrones.length > 0 || [...room.drones.values()].some((drone) => drone.mode === "attack")); tick += 1) {
    room.updateDrones(50, 0.05);
    room.settleUltimateReports();
  }
  assert.ok(targets.every((enemy) => !room.enemies.has(enemy.id)), "drone'lar oldurmedi");
  assert.equal(p1.ultimateCharge, 0);
  assert.equal(p2.ultimateCharge, 10);

  // Ayni kulenin kendi oldurmesi sarj veriyor (AttackLord'da 1/3).
  towerKill(room, towers[0], enemyAt(room, towers[0].x, towers[0].y));
  assert.ok(Math.abs(p1.ultimateCharge - KILL_CHARGE / 3) < 1e-9);
  assert.equal(p2.ultimateCharge, 10 + KILL_CHARGE);
});

test("Sempati kanamasinin oldurmesi sarj vermiyor; kulenin kanamasi veriyor ve yerine gecerse tik kulenin", () => {
  const { room, owner, p1, p2 } = setup("onur");
  const towers = placeTowers(room, "onur-3", 2);
  p1.ultimateCharge = 100;
  room.useUltimate(owner, {});

  const midX = (towers[0].x + towers[1].x) / 2;
  const midY = (towers[0].y + towers[1].y) / 2;
  // Can 0,5; kanama tiki azami canin %1'i (1): ilk tik olduruyor.
  const bled = enemyAt(room, midX, midY, 100);
  const refreshed = enemyAt(room, midX, midY, 100);
  room.resetAuraSlows();
  room.updateSympathy();
  assert.equal(bled.statusEffects.bleed?.originSourceId, "ultimate:sympathy");
  assert.equal(refreshed.statusEffects.bleed?.originSourceId, "ultimate:sympathy");

  const now = Date.now();
  bled.hp = 0.5;
  assert.equal(room.updateEnemyEngineStatusOutcomes(bled, now), false, "kanama oldurmedi");
  assert.equal(p1.ultimateCharge, 0, "Sempati kanamasi atana sarj verdi");
  assert.equal(p2.ultimateCharge, 10, "Sempati kanamasi takim arkadasina sarj verdi");

  // Kulenin kanamasi Sempati'ninkinin yerine geciyor: tik ve oldurme kulenin.
  room.applyEnemyStatusEffect(refreshed, { type: "bleed", magnitude: 0.01, durationMs: 3000, stacking: "refresh" }, now, { sourceTowerId: towers[0].id, sourceOwnerId: "p1" });
  assert.equal(refreshed.statusEffects.bleed.originSourceId, undefined);
  refreshed.hp = 0.5;
  assert.equal(room.updateEnemyEngineStatusOutcomes(refreshed, now), false);
  assert.equal(p1.ultimateCharge, KILL_CHARGE);
  assert.equal(p2.ultimateCharge, 10 + KILL_CHARGE);

  // Sempati'ye hic degmemis kule kanamasi da sarj veriyor.
  const plain = enemyAt(room, towers[0].x + 500, towers[0].y + 500, 100);
  room.applyEnemyStatusEffect(plain, { type: "bleed", magnitude: 0.01, durationMs: 3000, stacking: "refresh" }, now, { sourceTowerId: towers[0].id, sourceOwnerId: "p1" });
  plain.hp = 0.5;
  assert.equal(room.updateEnemyEngineStatusOutcomes(plain, now), false);
  assert.equal(p1.ultimateCharge, 2 * KILL_CHARGE);
  assert.equal(p2.ultimateCharge, 10 + 2 * KILL_CHARGE);
});

test("Gotik Kabus guclendiriyor, oldurmuyor: guclenen Melis kulesinin oldurmesi sarj veriyor", () => {
  const { room, owner, p1, p2 } = setup("archer");
  const [tower] = placeTowers(room, "archer-1", 1);
  p1.ultimateCharge = 100;
  room.useUltimate(owner, {});
  assert.equal(room.isMelisGothicNightmareActiveForTower(tower), true);

  const enemy = enemyAt(room, tower.x, tower.y);
  assert.equal(room.damageEnemyFromTower(tower, enemy, 1_000_000, 0), true);
  assert.equal(p1.ultimateCharge, KILL_CHARGE);
  assert.equal(p2.ultimateCharge, 10 + KILL_CHARGE);
});

test("ultinin degdigi dusmanin olum zinciri ultinin degil: hasar baginin oldurmesi sarj veriyor", () => {
  const { room, owner, p1, p2 } = setup("mage");
  const struck = enemyAt(room, 100, 100, 1_000_000);
  const partner = enemyAt(room, 900, 900, 1);
  // Efsanevi hasar bagi: vurulanin aldigi hasarin payi ortagina gidiyor.
  struck.legendary = { linkUntil: Date.now() + 10_000, linkPartnerId: partner.id, linkOwnerId: "p2" };
  p1.ultimateCharge = 100;
  room.useUltimate(owner, {});

  assert.equal(room.enemies.has(struck.id), true);
  assert.equal(room.enemies.has(partner.id), false, "bag ortagi oldurmedi");
  assert.equal(p1.ultimateCharge, KILL_CHARGE, "bagin oldurmesi sarj vermeli");
  assert.equal(p2.ultimateCharge, 10 + KILL_CHARGE);
});

test("her ultinin kulesiz hasari ulti kaynagi sayiliyor (yeni ulti yolu adsiz kalmasin)", () => {
  const towerFor = { warrior: "warrior-1", onur: "onur-3" };
  const damaging = new Set();
  for (const { id: characterId } of characters) {
    const { room, owner, p1 } = setup(characterId);
    const towers = towerFor[characterId] ? placeTowers(room, towerFor[characterId], 2) : [];
    const anchor = towers[0] ?? { x: 200, y: 200 };
    enemyAt(room, anchor.x, anchor.y, 1_000_000);
    if (towers.length === 2) enemyAt(room, (towers[0].x + towers[1].x) / 2, (towers[0].y + towers[1].y) / 2, 1_000_000);
    enemyInColumn(room, 3, 1_000_000);

    const calls = [];
    const original = room.damageEnemy.bind(room);
    room.damageEnemy = (enemy, damage, slowMs, source = "", ownerId = "", damageType, ratio, level, towerId = "", ...rest) => {
      calls.push({ enemy, source, towerId });
      return original(enemy, damage, slowMs, source, ownerId, damageType, ratio, level, towerId, ...rest);
    };

    p1.ultimateCharge = 100;
    room.useUltimate(owner, { column: 3, mode: "attack" });
    for (let tick = 0; tick < 60; tick += 1) {
      room.resetAuraSlows();
      room.updateSympathy();
      room.updateDrones(50, 0.05);
      for (const enemy of [...room.enemies.values()]) room.updateEnemyEngineStatusOutcomes(enemy, Date.now());
      room.settleUltimateReports();
    }

    for (const call of calls) {
      if (call.towerId) continue;
      const kind = call.source.startsWith("status:") ? call.source.slice("status:".length) : undefined;
      const recognized = isUltimateDamageSource(call.source) || (kind !== undefined && isUltimateDamageSource(call.enemy.statusEffects[kind]?.originSourceId));
      assert.ok(recognized, `${characterId}: ulti kaynagi taninmiyor: ${call.source}`);
      damaging.add(characterId);
    }
  }
  // Hasar veren ultiler gercekten hasar verdi (test bos gecmesin).
  for (const characterId of ["zeynep", "warrior", "mage", "tank", "onur"]) {
    assert.ok(damaging.has(characterId), `${characterId} ultisi hasar vermedi`);
  }
});
