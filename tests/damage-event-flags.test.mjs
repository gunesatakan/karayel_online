/**
 * Vurus gercegi: hasar olayinin kritik, son vurus, sahip ve boyut alanlari.
 *
 * Istemci bir vurusun kritik mi, oldurucu mu, kimin oldugunu ancak sunucudan
 * ogrenebiliyor: sayinin kendisi bunlarin hicbirini anlatmiyor (son vurusta
 * yalnizca kalan can yaziyor). Buradaki testler o bilgilerin dogru
 * isaretlendigini ve telde varsayilanlarin hic yazilmadigini kilitliyor --
 * hasar olayi her snapshotta yeniden gittigi icin fazladan her anahtar
 * saniyede onlarca kez odeniyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DAMAGE_EVENT_NO_OWNER,
  DAMAGE_SIZE_BUCKET_RATIOS,
  ONUR_JACKPOT_MIN_LUCK,
  getDamageEventOwnerSlot,
  getDamageSizeBucket,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { toDamageEventWire } from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

function setup() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const definition = towerCatalog.warrior[0];
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: definition.id });
  const tower = [...room.towers.values()][0];
  assert.ok(tower);
  return { room, tower };
}

/** Zirhsiz, kalkansiz, direncsiz dusman: hasar birebir iner. */
function spawnPlainEnemy(room, { hp = 1000, maxHp = hp, shield = 0, maxShield = shield } = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    hp,
    maxHp,
    shield,
    maxShield,
    armor: 0,
    damageResistances: {},
    hitTypeResistances: {},
    statusResistances: {}
  });
  return enemy;
}

function hit(room, enemy, damage, { tower, ownerId = "p1" } = {}) {
  room.damageEvents.clear();
  room.damageEnemy(enemy, damage, 0, tower?.definition.id ?? "skill", ownerId, "true", 0, tower?.level ?? 1, tower?.id ?? "");
  const events = [...room.damageEvents.values()];
  assert.equal(events.length, 1, "tek vurus tek olay birakmali");
  return events[0];
}

test("kritik vurus c:1 tasir; kritik olmayan vurusta alan hic yok", () => {
  const { room, tower } = setup();
  const enemy = spawnPlainEnemy(room);

  room.towerCriticalRandom = () => 0;
  const crit = hit(room, enemy, 10, { tower });
  assert.equal(crit.c, 1);
  assert.equal(crit.amount, 20, "kritik iki kat vurur; sayi inen hasar");

  room.towerCriticalRandom = () => 1;
  const plain = hit(room, enemy, 10, { tower });
  assert.equal("c" in plain, false);
  assert.equal(plain.amount, 10);
});

test("kule disi hasar (beceri) kritik olamaz, bayrak da tasimaz", () => {
  const { room } = setup();
  const enemy = spawnPlainEnemy(room);
  room.towerCriticalRandom = () => 0;
  const event = hit(room, enemy, 10);
  assert.equal("c" in event, false);
});

test("son vurus k:1 tasir ve sayi kalan cani asmaz", () => {
  const { room, tower } = setup();
  room.towerCriticalRandom = () => 1;
  const enemy = spawnPlainEnemy(room, { hp: 30, maxHp: 1000 });

  const event = hit(room, enemy, 500, { tower });
  assert.equal(room.enemies.has(enemy.id), false, "dusman olmeli");
  assert.equal(event.k, 1);
  assert.equal(event.amount, 30, "fazlasi hicbir seye inmedi; sayi sisirilmez");

  const survivor = spawnPlainEnemy(room);
  const plain = hit(room, survivor, 10, { tower });
  assert.equal("k" in plain, false);
});

test("kritik son vurus iki bayragi birden tasir", () => {
  const { room, tower } = setup();
  room.towerCriticalRandom = () => 0;
  const enemy = spawnPlainEnemy(room, { hp: 15, maxHp: 1000 });
  const event = hit(room, enemy, 10, { tower });
  assert.equal(event.c, 1);
  assert.equal(event.k, 1);
  assert.equal(event.amount, 15);
});

test("sahip yuvasi: 0. yuva yazilmaz, digeri yazilir, sahipsiz vurus -1", () => {
  const { room } = setup();
  room.state.players.set("p2", { ...room.state.players.get("p1"), id: "p2", slot: 2 });
  const enemy = spawnPlainEnemy(room);

  const own = hit(room, enemy, 5, { ownerId: "p1" });
  assert.equal("o" in own, false);
  assert.equal(getDamageEventOwnerSlot(own), 0);

  const teammate = hit(room, enemy, 5, { ownerId: "p2" });
  assert.equal(teammate.o, 2);
  assert.equal(getDamageEventOwnerSlot(teammate), 2);

  const orphan = hit(room, enemy, 5, { ownerId: "" });
  assert.equal(orphan.o, DAMAGE_EVENT_NO_OWNER);
  assert.notEqual(getDamageEventOwnerSlot(orphan), 0, "sahipsiz vurus 0. yuvanin vurusu sayilmamali");

  const departed = hit(room, enemy, 5, { ownerId: "yok-boyle-biri" });
  assert.equal(departed.o, DAMAGE_EVENT_NO_OWNER);
});

test("boyut kovasi hasarin toplam cana (can + kalkan) oranindan", () => {
  const [small, large] = DAMAGE_SIZE_BUCKET_RATIOS;
  assert.equal(getDamageSizeBucket(small * 100 - 1, 100), 0);
  assert.equal(getDamageSizeBucket(small * 100, 100), 1);
  assert.equal(getDamageSizeBucket(large * 100 - 1, 100), 1);
  assert.equal(getDamageSizeBucket(large * 100, 100), 2);
  assert.equal(getDamageSizeBucket(0, 100), 0);
  assert.equal(getDamageSizeBucket(10, 0), 0, "cani bilinmeyen dusman buyutulmez");
  assert.equal(getDamageSizeBucket(Number.NaN, 100), 0);

  const { room } = setup();
  const enemy = spawnPlainEnemy(room, { hp: 100 });
  assert.equal("r" in hit(room, enemy, 5), false, "kucuk vurus kova 0: alan yok");
  enemy.hp = 100;
  assert.equal(hit(room, enemy, 20).r, 1);
  enemy.hp = 100;
  assert.equal(hit(room, enemy, 60).r, 2);

  // Kalkan toplam cana dahil: kalkan hasarin yarisini aliyor, 80'lik vurus
  // kalkana 40 iniyor. 200'luk havuzda %20 (kova 1); yalniz cana bakilsa %40
  // (kova 2) olurdu.
  const shielded = spawnPlainEnemy(room, { hp: 100, shield: 100 });
  const shieldHit = hit(room, shielded, 80);
  assert.equal(shieldHit.amount, 40);
  assert.equal(shieldHit.r, 1);
});

test("son vurusun boyutu gosterilen sayidan: kalan can kucukse sayi da kucuk", () => {
  const { room, tower } = setup();
  room.towerCriticalRandom = () => 1;
  const enemy = spawnPlainEnemy(room, { hp: 10, maxHp: 1000 });
  const event = hit(room, enemy, 900, { tower });
  assert.equal(event.k, 1);
  assert.equal("r" in event, false, "10/1000 kova 0; vurusun kendisi buyuk diye sayi buyumez");
});

test("telde varsayilanlar anahtar olarak da gitmez", () => {
  const { room } = setup();
  const enemy = spawnPlainEnemy(room);
  hit(room, enemy, 5);
  const [plain] = room.getSnapshot().damageEvents;
  assert.deepEqual(Object.keys(plain).sort(), ["amount", "id", "x", "y"]);

  // `undefined` degerli alan da dusmeli: msgpack anahtari yine yaziyor.
  const wire = toDamageEventWire({ id: "d1", x: 1.26, y: 2, amount: 7, c: undefined, k: undefined, o: 0, r: undefined });
  assert.deepEqual(wire, { id: "d1", x: 1.3, y: 2, amount: 7 });

  const flagged = toDamageEventWire({ id: "d2", x: 0, y: 0, amount: 9, c: 1, k: 1, o: 3, r: 2 });
  assert.deepEqual(flagged, { id: "d2", x: 0, y: 0, amount: 9, c: 1, k: 1, o: 3, r: 2 });
});

test("snapshot hasar olayinin bayraklarini tasir", () => {
  const { room, tower } = setup();
  room.state.players.set("p2", { ...room.state.players.get("p1"), id: "p2", slot: 1 });
  room.towerCriticalRandom = () => 0;
  const enemy = spawnPlainEnemy(room, { hp: 15, maxHp: 20 });
  hit(room, enemy, 10, { tower, ownerId: "p2" });
  const [event] = room.getSnapshot().damageEvents;
  assert.equal(event.c, 1);
  assert.equal(event.k, 1);
  assert.equal(event.o, 1);
  assert.equal(event.r, 2, "15/20 kova 2");
  assert.equal(event.amount, 15);
});

/** Onur'un mermili saldiri kulesi: jackpot zari atista mermiye yaziliyor. */
function onurSetup() {
  const room = createRoom("onur");
  room.broadcast = () => {};
  const definition = towerCatalog.onur.find((entry) => entry.id === "onur-2");
  assert.ok(definition);
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: definition.id });
  const tower = [...room.towers.values()][0];
  assert.ok(tower);
  return { room, tower };
}

test("Onur jackpot: kritik ve zar esigin ustundeyse j tasir, telde de; degilse anahtar yok", () => {
  assert.equal(ONUR_JACKPOT_MIN_LUCK, 1.8);
  const { room, tower } = onurSetup();
  const enemy = spawnPlainEnemy(room, { hp: 1_000_000 });

  room.towerCriticalRandom = () => 0;
  tower.lastLuckMultiplier = 1.9;
  const jackpot = hit(room, enemy, 10, { tower });
  assert.equal(jackpot.c, 1);
  assert.equal(jackpot.j, 19, "carpanin on kati");
  assert.equal(toDamageEventWire(jackpot).j, 19);
  assert.equal(room.getSnapshot().damageEvents[0].j, 19, "snapshot da tasiyor");

  tower.lastLuckMultiplier = 1.7;
  const low = hit(room, enemy, 10, { tower });
  assert.equal(low.c, 1);
  assert.equal("j" in low, false, "esigin altindaki zar damga degil");

  tower.lastLuckMultiplier = 1.9;
  room.towerCriticalRandom = () => 1;
  const plain = hit(room, enemy, 10, { tower });
  assert.equal("c" in plain, false);
  assert.equal("j" in plain, false, "kritik olmayan vurus jackpot degil");
  assert.equal("j" in toDamageEventWire(plain), false);
});

test("Onur jackpot: mermi atistaki zari tasir, kule arada yeniden zar atsa da", () => {
  const { room, tower } = onurSetup();
  const enemy = spawnPlainEnemy(room, { hp: 1_000_000 });
  room.towerCriticalRandom = () => 0;

  // Mermi yolu `damageEnemy`ye kendi zarini veriyor; kulenin son zari 1.
  tower.lastLuckMultiplier = 1;
  room.damageEvents.clear();
  room.damageEnemy(enemy, 10, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id, undefined, 1.9);
  assert.equal([...room.damageEvents.values()][0].j, 19);

  // Atis zari mermiye yaziliyor.
  room.projectiles.clear();
  room.spawnTowerProjectile(tower, enemy);
  const projectile = [...room.projectiles.values()][0];
  assert.ok(projectile, "onur-2 mermi atiyor");
  assert.equal(projectile.luck, tower.lastLuckMultiplier);

  // Baska karakterin kulesinde zar yok.
  const { room: warriorRoom, tower: warriorTower } = setup();
  const target = spawnPlainEnemy(warriorRoom, { hp: 1_000_000 });
  warriorRoom.towerCriticalRandom = () => 0;
  warriorTower.lastLuckMultiplier = 1.9;
  assert.equal("j" in hit(warriorRoom, target, 10, { tower: warriorTower }), false);
});

function lobbyRoom() {
  const room = createRoom("warrior");
  room.state.players.clear();
  room.gameStarted = false;
  room.broadcast = () => {};
  return room;
}

const client = (sessionId) => ({ sessionId, send() {} });

test("oyuncu yuvasi: katilan bos en kucuk yuvayi alir, lobiden cikanin yuvasi yeniden kullanilir", async () => {
  const room = lobbyRoom();
  room.onJoin(client("a"), { characterId: "warrior" });
  room.onJoin(client("b"), { characterId: "zeynep" });
  room.onJoin(client("c"), { characterId: "archer" });
  assert.deepEqual([...room.state.players.values()].map((player) => player.slot), [0, 1, 2]);

  await room.onLeave(client("b"), true);
  room.onJoin(client("d"), { characterId: "onur" });
  assert.equal(room.state.players.get("d").slot, 1, "bosalan yuva yeniden kullanilir; yuva 0-3 disina tasmaz");

  room.gameStarted = true;
  const players = new Map(room.getSnapshot().players.map((player) => [player.id, player]));
  assert.equal("slot" in players.get("a"), false, "0. yuva telde yazilmaz");
  assert.equal(players.get("d").slot, 1);
  assert.equal(players.get("c").slot, 2);
});

test("yeniden baglanan oyuncu yuvasini korur, maca sonradan katilan bos yuvayi alir", async () => {
  const room = lobbyRoom();
  room.onJoin(client("a"), { characterId: "warrior" });
  room.onJoin(client("b"), { characterId: "zeynep" });
  room.gameStarted = true;

  room.state.players.get("b").connected = false;
  room.onJoin(client("b2"), { characterId: "zeynep" });
  assert.equal(room.state.players.has("b"), false);
  assert.equal(room.state.players.get("b2").slot, 1, "ayni oyuncu kaydi, ayni yuva");

  room.onJoin(client("c"), { characterId: "archer" });
  assert.equal(room.state.players.get("c").slot, 2);
});
