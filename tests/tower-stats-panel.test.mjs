/**
 * Kule paneli: sunucunun `tower:stats` blogu ve istemcinin paneli.
 *
 * Testler dort seyi tutuyor:
 *
 *   1. Bloktaki her sayi savasin kullandigi sayi: namlunun gercekten dondugu
 *      aci, ates konisinin gercekten tetikledigi sinir, ucan merminin hizi,
 *      merminin tasidigi hasar, kritik zarinin esigi ve kritik vurusun
 *      dusmandan dusurdugu can. Kartli ve esyali nisan alan mermi kulesi,
 *      aura kulesi, Debug Lazer ve Izolasyon.
 *   2. Ilgisiz bolum yok: duvar, kaynak binasi ve aura kulesinde saldiri,
 *      nisan ya da mermi sayisi gitmiyor.
 *   3. Istek kapisi: hiz siniri, sahiplik (takim arkadasi salt okunur),
 *      odada olmayan oturum ve var olmayan kule.
 *   4. Istemci paneli: model ilgisiz bolumu gizliyor, degisen stata "+%X"
 *      koyuyor, dokum toplami tutuyor; DOM yalnizca deger degisince yaziliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MESSAGE_RULES, MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import {
  COLD_ACCURACY_TEMPERATURE,
  GAME_SPEED_MULTIPLIER,
  ISOLATION_SLOW_FRACTION_LEVEL_1,
  ISOLATION_SLOW_FRACTION_LEVEL_10,
  TOWER_STATS_REFRESH_MS,
  WALL_TOWER_ID,
  cardCatalog,
  getShopItem
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { importWebModule } from "./helpers/web-module.mjs";

const client = { sessionId: "p1", send() {} };
const card = (id) => {
  const found = cardCatalog.find((entry) => entry.id === id);
  assert.ok(found, `${id} katalogda yok`);
  return found;
};

function oda(characterId = "warrior") {
  const room = createRoom(characterId);
  room.broadcast = () => {};
  room.clients = [client];
  room.setupPhase = false;
  const player = room.state.players.get("p1");
  Object.assign(player, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0 });
  return room;
}

function kur(room, definitionId, owner = client) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer yok`);
  room.placeTower(owner, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower.definition.id, definitionId);
  return tower;
}

function kartAl(room, cardId, towerId) {
  room.pendingCardChoices = new Map([[client.sessionId, [card(cardId)]]]);
  room.chooseCard(client, { cardId, towerId });
}

function esyaTak(room, tower, itemId) {
  const player = room.state.players.get("p1");
  assert.ok(getShopItem(itemId), `${itemId} yok`);
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
  const before = tower.equippedShopItemIds.length;
  room.equipShopItem(client, { itemId, towerId: tower.id });
  assert.equal(tower.equippedShopItemIds.length, before + 1, `${itemId} takilmadi`);
}

function dusman(room, tower, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    x: tower.x + 8, y: tower.y, hp: 1_000_000, maxHp: 1_000_000, shield: 0, maxShield: 0, armor: 0,
    damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, ...overrides
  });
  return enemy;
}

/** Namlu 0'da; hedef verilen acida. Donulen aci ve hizali mi. */
function nisanAl(room, tower, radians, seconds) {
  tower.facing = 0;
  const target = { x: tower.x + 100 * Math.cos(radians), y: tower.y + 100 * Math.sin(radians) };
  const aligned = room.aimTowerAt(tower, target, seconds);
  return { aligned, facing: tower.facing };
}

const close = (actual, expected, label, tolerance = 2e-3) => {
  assert.ok(Math.abs(actual - expected) <= Math.max(tolerance, Math.abs(expected) * tolerance), `${label}: ${actual} != ${expected}`);
};

/** Dokum kapali: `b * (1 + Σs) * Πm = v`. */
function assertRelativeBreakdown(stat, label) {
  const base = stat.b ?? stat.v;
  const sum = (stat.s ?? []).reduce((total, [, add]) => total + add, 0);
  const product = (stat.m ?? []).reduce((total, [, multiplier]) => total * multiplier, 1);
  close(base * (1 + sum) * product, stat.v, `${label} dokumu`, 1e-2);
}

/**
 * `damageEnemy`in vurus basina ortalamasi: ayni hasar, kritik zari bir kez
 * tutturulup bir kez kacirilarak; ihtimalle agirlikli. Zirhsiz, dirensiz,
 * isaretsiz bir yer hedefi. Kule paneli bunu `dps` olarak gostermeli.
 */
function ortalamaVurus(room, tower, block) {
  const vur = (zar) => {
    const target = dusman(room, tower, { x: tower.x + 30, movementKind: "ground", type: "grunt" });
    room.towerCriticalRandom = () => zar;
    room.damageEnemy(target, room.getTowerDamage(tower), 0, tower.definition.id, tower.ownerId, "true", 0, tower.level, tower.id, tower.definition.hitType);
    const kayip = 1_000_000 - target.hp;
    room.enemies.delete(target.id);
    return kayip;
  };
  const kritik = vur(0);
  const duz = vur(0.999999);
  room.towerCriticalRandom = Math.random;
  return duz * (1 - block.cc.v) + kritik * block.cc.v;
}

// ---------------------------------------------------------------- 1. Savasin sayilari

test("nisan alan mermi kulesi: kart, esya ve Epik cevrimle blok savasin sayilarini okuyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  tower.level = 4;
  kartAl(room, "serbest-yatak", tower.id); // hedefli: donus +%120, hasar -%10
  kartAl(room, "nisan-takimi", tower.id); // genel: isabet, donus, mermi hizi
  kartAl(room, "tork-aktarimi", tower.id); // Epik: donus hizindan atis hizina
  esyaTak(room, tower, "kritik-sistem"); // kritik ihtimali ve hasari
  esyaTak(room, tower, "hafif-muhimmat"); // mermi hizi
  esyaTak(room, tower, "atis-denetleyicisi"); // atis hizi
  tower.temperature = COLD_ACCURACY_TEMPERATURE + 5;

  const block = room.getTowerStatsBlock(tower, "p1");
  assert.equal(block.id, tower.id);
  assert.equal(block.ro, undefined, "sahibine salt okunur gitmemeli");
  assert.deepEqual(block.it, tower.equippedShopItemIds);
  assert.deepEqual(block.tc, tower.targetedCardIds);
  assert.equal(block.tm, tower.targetingMode);

  // Donus hizi: namlunun 0,1 sn'de gercekten dondugu aci.
  const turned = nisanAl(room, tower, Math.PI / 2, 0.1).facing;
  close(block.tr.v, turned / 0.1 * 180 / Math.PI, "donus hizi");
  assert.ok(block.tr.s.some(([source]) => source === "card:serbest-yatak"), "hedefli kart donus kaynaklarinda yok");
  assert.ok(block.tr.s.some(([source]) => source === "card:nisan-takimi"));
  assert.ok(block.tr.v > block.tr.b * 2, "donus bonusu tabana yansimiyor");
  assertRelativeBreakdown(block.tr, "donus hizi");

  // Ates konisi: kenarin hemen icinde tetik duser, hemen disinda dusmez.
  const cone = block.ac.v;
  assert.ok(cone < block.ac.b, "isabet koniyi daraltmali");
  assert.equal(nisanAl(room, tower, (cone - 0.05) * Math.PI / 180, 0).aligned, true, "koni icinde ates etmiyor");
  assert.equal(nisanAl(room, tower, (cone + 0.05) * Math.PI / 180, 0).aligned, false, "koni disinda ates ediyor");

  // Mermi hizi ve hasar: ateslenen merminin kendisi.
  const enemy = dusman(room, tower);
  const before = new Set(room.projectiles.keys());
  room.spawnTowerProjectile(tower, enemy);
  const projectile = [...room.projectiles.values()].find((entry) => !before.has(entry.id));
  assert.ok(projectile, "mermi cikmadi");
  close(block.ps.v, Math.hypot(projectile.vx, projectile.vy), "mermi hizi");
  assert.ok(block.ps.s.some(([source]) => source === "shop:hafif-muhimmat"));
  assertRelativeBreakdown(block.ps, "mermi hizi");
  close(block.d.v, projectile.damage, "vurus hasari");
  assertRelativeBreakdown(block.d, "hasar");

  // Atis hizi: kulenin dolum araligi; cevrim ve esya kaynaklarda.
  close(block.f.v, 1000 / room.getTowerFireInterval(tower), "atis hizi");
  assert.ok(block.f.s.some(([source]) => source === "shop:atis-denetleyicisi"));
  assert.ok(block.f.s.some(([source]) => source.startsWith("conversion:tork-aktarimi")), "Epik cevrim atis hizi kaynaklarinda yok");
  assertRelativeBreakdown(block.f, "atis hizi");

  // Kritik: zarin esigi ve kritik vurusun dusurdugu can.
  close(block.cc.v, room.getTowerCritChance(tower), "kritik ihtimali");
  assert.ok(block.cc.v > block.cc.b, "kritik esyasi ihtimale yansimiyor");
  const target = dusman(room, tower, { x: tower.x + 30 });
  room.towerCriticalRandom = () => block.cc.v - 1e-4;
  room.damageEnemy(target, 100, 0, "warrior-1", "p1", "true", 0, tower.level, tower.id, "projectile");
  const critLoss = 1_000_000 - target.hp;
  const plain = dusman(room, tower, { x: tower.x + 30 });
  room.towerCriticalRandom = () => block.cc.v + 1e-4;
  room.damageEnemy(plain, 100, 0, "warrior-1", "p1", "true", 0, tower.level, tower.id, "projectile");
  const plainLoss = 1_000_000 - plain.hp;
  close(critLoss / plainLoss, block.cm.v, "kritik hasar carpani", 1e-3);
  assert.ok(block.cm.v > block.cm.b, "kritik hasar esyasi carpana yansimiyor");

  // DPS: `damageEnemy`in ortalama vurusu (kritik zari iki yoluyla) x tetik/sn.
  close(block.dps, ortalamaVurus(room, tower, block) * block.f.v, "DPS", 1e-3);
  // Takipci isaretliyor: seviye 4'te tek yigin, +%20.
  assert.deepEqual(block.fe?.find(([kind]) => kind === "mark"), ["mark", 0.2, 6500]);
});

test("aura kulesi (Abarti): yalnizca etki ritmi ve etkisi; saldiri, kritik, nisan yok", () => {
  const room = oda("zeynep");
  const tower = kur(room, "zeynep-8");
  const block = room.getTowerStatsBlock(tower, "p1");
  assert.equal(block.e, 1, "aura ritmi etki araligi olarak isaretli degil");
  close(block.f.v, 1000 / room.getTowerEffectInterval(tower), "aura tiki");
  for (const key of ["d", "dps", "cc", "cm", "tr", "ac", "ps"]) assert.equal(block[key], undefined, `${key} aura kulesinde gitmemeli`);
  assert.ok(block.fe?.some(([kind]) => kind === "armorAura"), "Abarti'nin zirh kirmasi yok");
});

test("Debug Lazer: odak ritmi, nisan var, mermi hizi yok, DPS lazerin hasariyla", () => {
  const room = oda();
  const tower = kur(room, "warrior-5");
  tower.level = 6;
  const block = room.getTowerStatsBlock(tower, "p1");
  assert.equal(block.e, 1);
  close(block.f.v, 1000 / room.getTowerEffectInterval(tower), "lazer tiki");
  close(block.d.v, room.getTowerDamage(tower), "lazer hasari");
  assert.ok(block.tr && block.ac, "lazer nisan aliyor");
  assert.equal(block.ps, undefined, "lazer mermi atmiyor");
  assert.equal(block.f.s, undefined, "atis hizi kartlari etki araligina islemiyor");
  close(block.dps, ortalamaVurus(room, tower, block) * block.f.v, "lazer DPS", 1e-3);
  assert.equal(block.rg, undefined);
  tower.debugOverdriveUntil = Date.now() + 5000;
  assert.equal(room.getTowerStatsBlock(tower, "p1").rg, 1, "asiri yuklemede menzil global");
});

test("Izolasyon: seviye egrisiyle vurus ve aura yavaslatmasi, hasar ve kritik yok", () => {
  const room = oda();
  const tower = kur(room, "warrior-3");
  const at = (level) => {
    tower.level = level;
    tower.grantCache = undefined;
    return room.getTowerStatsBlock(tower, "p1");
  };
  const first = at(1);
  const slow = first.fe.find(([kind]) => kind === "slow");
  close(slow[1], ISOLATION_SLOW_FRACTION_LEVEL_1, "1. seviye vurus yavaslatmasi");
  close(slow[1], 1 - room.getTowerSlowStatus(tower).speedMultiplier, "vurus yavaslatmasi sahadaki carpan");
  const last = at(10);
  close(last.fe.find(([kind]) => kind === "slow")[1], ISOLATION_SLOW_FRACTION_LEVEL_10, "10. seviye vurus yavaslatmasi");
  const aura = last.fe.find(([kind]) => kind === "aslow");
  if (room.getTowerAuraSlowMultiplier(tower) !== undefined) {
    close(aura[1], 1 - room.getTowerAuraSlowMultiplier(tower), "aura yavaslatmasi");
  } else {
    assert.equal(aura, undefined, "kapali aura gitmemeli");
  }
  for (const key of ["d", "dps", "cc", "cm", "ps"]) assert.equal(last[key], undefined, `${key} Izolasyon'da gitmemeli`);
  assert.equal(last.e, 1);
});

test("vurus bonusu (Kan Bankasi) DPS'e damageEnemy gibi toplanarak giriyor, carpilarak degil", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  esyaTak(room, tower, "kan-bankasi");
  esyaTak(room, tower, "kritik-sistem");
  const block = room.getTowerStatsBlock(tower, "p1");
  const hit = room.getTowerHitDamageAdd(tower);
  assert.ok(hit > 0, "olcum bos: vurus bonusu yok");
  close(block.d.v, room.getTowerDamage(tower) * (1 + hit), "vurus hasari");
  assert.ok(block.d.m.some(([source]) => source === "hit"), "vurus bonusu dokumde yok");
  close(block.dps, ortalamaVurus(room, tower, block) * block.f.v, "DPS", 1e-3);
  const carpimli = room.getTowerDamage(tower) * (1 + hit) * (1 + block.cc.v * (block.cm.v - 1)) * block.f.v;
  assert.ok(block.dps < carpimli - 1e-6, "DPS vurus ve kritik paylarini carpiyor");
});

test("dokumde kart paylari ham, karakter havuzu ayri carpan: hasar ve atis hizi ayni dilde", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "serbest-yatak", tower.id); // hasar -%10
  kartAl(room, "seri-atis", tower.id); // atis hizi +%20
  const block = room.getTowerStatsBlock(tower, "p1");
  assert.ok(room.getAtakanPassiveMultiplier(tower) > 1, "olcum bos: yalnizlik pasifi yok");
  assert.deepEqual(block.d.s.find(([source]) => source === "card:serbest-yatak"), ["card:serbest-yatak", -0.1], "kart payi havuzla carpilmis gorunuyor");
  assert.ok(block.d.m.some(([source, value]) => source === "character:atakan-passive" && Math.abs(value - 1.5) < 1e-3), "pasif hasarda ayri carpan degil");
  assert.deepEqual(block.f.s.find(([source]) => source === "card:seri-atis"), ["card:seri-atis", 0.2]);
  assert.ok(block.f.m.some(([source]) => source === "character:atakan-passive"), "pasif atis hizinda ayri carpan degil");
  assertRelativeBreakdown(block.d, "hasar");
  assertRelativeBreakdown(block.f, "atis hizi");
  close(block.d.v, room.getTowerDamage(tower), "hasar");
});

test("ucan hedefe isabet payi kritigin ana sayisini titretmiyor; 'Hava hedefine' kosulu", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "goz-karari", tower.id); // isabetten kritik
  esyaTak(room, tower, "irtifa-olcer"); // ucan hedefe isabet
  tower.turnTargetId = "";
  const ground = room.getTowerStatsBlock(tower, "p1");
  close(ground.cc.v, room.getTowerCritChance(tower), "yer hedefinde kritik");
  const air = dusman(room, tower, { movementKind: "air" });
  tower.turnTargetId = air.id;
  assert.ok(room.getTowerCritChance(tower) > ground.cc.v, "olcum bos: hava payi kritige girmiyor");
  const aiming = room.getTowerStatsBlock(tower, "p1");
  assert.equal(aiming.cc.v, ground.cc.v, "namlunun hedefi ana kritik sayisini degistirdi");
  const airEntry = aiming.ccx?.find(([kind]) => kind === "air");
  assert.ok(airEntry, "hava kosulu listede yok");
  close(airEntry[1], room.getTowerCritChance(tower) - ground.cc.v, "hava kosulunun payi");
});

test("hedefe bagli hasar paylari (dx) damageEnemy ile ayni", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "gokyuzu-avcisi", tower.id);
  kartAl(room, "zayif-nokta", tower.id);
  const block = room.getTowerStatsBlock(tower, "p1");
  const dx = new Map(block.dx);
  close(dx.get("air"), 0.35, "hava");
  close(dx.get("shielded"), 0.3, "kalkan");
  close(dx.get("brute"), 0.3, "kaba");
  room.towerCriticalRandom = () => 1;
  const vur = (overrides) => {
    const target = dusman(room, tower, { x: tower.x + 30, type: "grunt", movementKind: "ground", ...overrides });
    room.damageEnemy(target, 100, 0, "warrior-1", "p1", "true", 0, tower.level, tower.id, "projectile");
    return 1_000_000 - target.hp;
  };
  close(vur({ movementKind: "air" }) / vur({}), 1 + dx.get("air"), "hava hedefinde hasar");
});

test("calisma enerjisi: kart carpani dahil, updateTowers'in harcadigi", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const plain = room.getTowerStatsBlock(tower, "p1").oe;
  assert.ok(plain > 0, "calisma enerjisi yok");
  kartAl(room, "uyku-modu", tower.id); // calisma enerjisi -%40
  const reduced = room.getTowerStatsBlock(tower, "p1").oe;
  close(reduced, plain * 0.6, "kart carpani");
  // Gercek harcama: bir oyun saniyesi, ates etmeden (hedef yok).
  room.enemies.clear();
  tower.energy = 50;
  tower.wakeReadyAt = 0;
  room.updateTowers(1000);
  close(50 - tower.energy, reduced, "updateTowers'in harcadigi", 1e-2);
});

test("getTowerStatsBlock oda ve kule durumunu degistirmiyor", () => {
  const serialize = (room) => JSON.stringify({
    towers: [...room.towers.values()],
    enemies: [...room.enemies.values()],
    projectiles: [...room.projectiles.values()],
    beams: [...(room.beams?.values?.() ?? [])],
    players: [...room.state.players.values()]
  }, (key, value) => {
    if (key === "grantCache") return undefined; // onbellek; kural degil
    if (value instanceof Map) return [...value.entries()];
    if (value instanceof Set) return [...value];
    return value;
  });
  for (const [characterId, ids] of [["warrior", ["warrior-1", "warrior-3", "warrior-5", "warrior-7"]], ["archer", ["archer-3", "archer-6"]], ["onur", ["onur-1", "onur-2"]], ["zeynep", ["zeynep-8"]]]) {
    const room = oda(characterId);
    for (const id of ids) {
      const tower = kur(room, id);
      const enemy = dusman(room, tower, { x: tower.x + 20, movementKind: "air" });
      tower.turnTargetId = enemy.id;
      tower.temperature = 55;
    }
    for (const tower of room.towers.values()) room.getTowerStatsBlock(tower, "p1");
    const before = serialize(room);
    for (const tower of room.towers.values()) {
      room.getTowerStatsBlock(tower, "p1");
      room.getTowerStatsBlock(tower, "baskasi");
    }
    assert.equal(serialize(room), before, `${characterId}: blok durumu degistirdi`);
  }
});

// ---------------------------------------------------------------- 2. Ilgisizler

test("duvar ve kaynak binasi: savas sayisi gitmiyor, ilerleme gidiyor", () => {
  const room = oda();
  const wall = kur(room, WALL_TOWER_ID);
  const wallBlock = room.getTowerStatsBlock(wall, "p1");
  for (const key of ["d", "f", "r", "cc", "tr", "ps", "hs", "tm"]) assert.equal(wallBlock[key], undefined, `duvarda ${key}`);
  const factory = kur(room, "warrior-7");
  const factoryBlock = room.getTowerStatsBlock(factory, "p1");
  for (const key of ["d", "f", "cc", "tr", "ps", "hs", "tm"]) assert.equal(factoryBlock[key], undefined, `fabrikada ${key}`);
  factory.killCount = 3;
  assert.equal(room.getTowerStatsBlock(factory, "p1").k, 3);
});

test("oldurme sayaci olduren kuleye yaziliyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const enemy = dusman(room, tower, { hp: 5, maxHp: 5 });
  room.towerCriticalRandom = () => 1;
  room.damageEnemy(enemy, 50, 0, "warrior-1", "p1", "true", 0, 1, tower.id, "projectile");
  assert.equal(tower.killCount, 1);
  assert.equal(room.getTowerStatsBlock(tower, "p1").k, 1);
});

// ---------------------------------------------------------------- 3. Istek kapisi

let roomCounter = 0;
function fakeClient(sessionId) {
  const fake = { sessionId, ref: { bufferedAmount: 0 }, sent: [], send(type, payload) { fake.sent.push({ type, payload }); } };
  return fake;
}

async function startedRoom() {
  const room = new MatchRoom();
  room.roomId = `kule-paneli-${roomCounter += 1}`;
  room.setSimulationInterval = () => {};
  room.broadcast = () => {};
  await room.onCreate({ roomName: "Test", mapScale: 1 });
  const join = (sessionId, characterId) => {
    const joined = fakeClient(sessionId);
    room.clients.push(joined);
    room.onJoin(joined, { playerName: sessionId, characterId });
    return joined;
  };
  const a = join("a", "warrior");
  const b = join("b", "zeynep");
  const handler = (type) => (who, payload) => room.onMessageHandlers[type].callback(who, payload);
  handler("lobby:setReady")(a, { ready: true });
  handler("lobby:setReady")(b, { ready: true });
  handler("lobby:start")(a);
  assert.equal(room.gameStarted, true);
  return { room, a, b, handler };
}

function cleanup(room) {
  MatchRoom.rooms.delete(room.roomId);
  MatchRoom.publicRooms.delete(room.roomId);
}

test("tower:stats kurali ve hiz siniri: kova asilinca cevap yok, istemci basina", async () => {
  const rule = MESSAGE_RULES["tower:stats"];
  assert.ok(rule, "kural yok");
  assert.deepEqual(rule.fields, { towerId: "string", q: "number" });
  assert.equal(rule.phase, "match");
  // Istemci yarim saniyede bir istiyor; kova bunu ve secim degisimini tasimali.
  assert.ok(rule.rate.perSecond >= 1000 / TOWER_STATS_REFRESH_MS, "kova istemcinin tazeleme hizini tasimiyor");
  assert.ok(rule.rate.perSecond <= 5 && rule.rate.burst <= 6, "kova gereksiz genis");

  const { room, a, b, handler } = await startedRoom();
  const realNow = Date.now;
  let now = 5_000_000;
  Date.now = () => now;
  try {
    const spot = findBuildableSpot(room, "warrior-1");
    room.placeTower(a, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
    const tower = [...room.towers.values()].find((entry) => entry.ownerId === "a");
    assert.ok(tower);
    const stats = handler("tower:stats");
    const replies = (who) => who.sent.filter((message) => message.type === "tower:stats");
    a.sent = [];
    for (let index = 0; index < 12; index += 1) stats(a, { towerId: tower.id, q: index });
    assert.equal(replies(a).length, rule.rate.burst, "hiz siniri islemiyor");
    assert.deepEqual(replies(a).map((message) => message.payload.q), [0, 1, 2, 3].slice(0, rule.rate.burst));
    stats(b, { towerId: tower.id, q: 1 });
    assert.equal(replies(b).length, 1, "kova istemci basina degil");
    now += 1000;
    stats(a, { towerId: tower.id, q: 99 });
    assert.equal(replies(a).length, rule.rate.burst + 1, "kova dolmuyor");
  } finally {
    Date.now = realNow;
    cleanup(room);
  }
});

test("tower:stats erisim: sahibi yazabilir, takim arkadasi salt okunur, yabanci ve olmayan kule cevapsiz", async () => {
  const { room, a, b, handler } = await startedRoom();
  try {
    const spot = findBuildableSpot(room, "warrior-1");
    room.placeTower(a, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
    const tower = [...room.towers.values()].find((entry) => entry.ownerId === "a");
    const stats = handler("tower:stats");
    const last = (who) => who.sent.filter((message) => message.type === "tower:stats").at(-1)?.payload;
    room.messageBuckets.clear();
    stats(a, { towerId: tower.id });
    assert.equal(last(a).id, tower.id);
    assert.equal(last(a).ro, undefined, "sahibine salt okunur");
    assert.ok(last(a).f, "sahibine savas sayilari gitmedi");
    stats(b, { towerId: tower.id });
    assert.equal(last(b).ro, 1, "takim arkadasina salt okunur isareti yok");
    assert.ok(last(b).f, "takim arkadasi da okuyabilmeli");

    const stranger = fakeClient("yabanci");
    stats(stranger, { towerId: tower.id });
    assert.equal(stranger.sent.length, 0, "odada olmayan oturuma blok gitti");
    const before = a.sent.length;
    stats(a, { towerId: "yok-boyle-kule" });
    stats(a, {});
    stats(a, undefined);
    room.messageBuckets.clear();
    stats(a, { towerId: tower.id, q: -3 });
    assert.equal(a.sent.length, before + 1, "gecersiz istege cevap gitti");
    assert.equal(last(a).q, undefined, "negatif sira yazildi");
  } finally {
    cleanup(room);
  }
});

// ---------------------------------------------------------------- 4. Istemci paneli

test("istemci modeli: ilgisiz bolum gizli, degisen stata +%X, dokum toplami tutuyor", async () => {
  const { buildTowerSheetModel } = await importWebModule("apps/web/src/tower-sheet.ts");
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "nisan-takimi", tower.id);
  esyaTak(room, tower, "kritik-sistem");
  const aimingInput = {
    towerId: tower.id, definitionId: "warrior-1", characterId: "warrior", name: "Takipçi", level: 4, color: "#22c55e",
    stats: room.getTowerStatsBlock(tower, "p1"),
    live: { temperature: 20, ammo: 10, maxAmmo: 40, energy: 30, maxEnergy: 60, damageDealt: 1234, currentDps: 12.5, performance: 0.5 },
    notes: []
  };
  const aiming = buildTowerSheetModel(aimingInput);
  const sectionIds = aiming.sections.map((section) => section.id);
  assert.ok(sectionIds.includes("attack") && sectionIds.includes("aim"), `bolumler: ${sectionIds}`);
  const figure = (model, key) => model.figures.find((entry) => entry.key === key);
  assert.ok(figure(aiming, "dps"), "DPS figuru yok");
  const turn = aiming.sections.find((section) => section.id === "aim").rows.find((row) => row.key === "tr");
  assert.match(turn.bonus ?? "", /^\+%\d+$/, "donus bonusu gosterilmiyor");
  const crit = aiming.sections.find((section) => section.id === "attack").rows.find((row) => row.key === "cc");
  assert.ok(crit.bonus, "kritik esyasi bonus gostermiyor");
  assert.ok(crit.detail.some((line) => line.label.includes("Kritik Sistem") || line.label.includes(getShopItem("kritik-sistem").name)), "dokumde esyanin adi yok");
  // Hiz gercek saatte: tetik/sn oyun saniyesinden 0,8 kat.
  const rate = figure(aiming, "f");
  assert.ok(rate.value.includes(String((aimingInput.stats.f.v * GAME_SPEED_MULTIPLIER).toFixed(2)).replace(".", ",")), `atis hizi gercek saatte degil: ${rate.value}`);

  const aura = kur(room, "warrior-3");
  const auraModel = buildTowerSheetModel({
    ...aimingInput, towerId: aura.id, definitionId: "warrior-3", name: "İzolasyon Kulesi",
    stats: room.getTowerStatsBlock(aura, "p1")
  });
  const auraSections = auraModel.sections.map((section) => section.id);
  assert.ok(!auraSections.includes("attack"), "aura kulesinde Saldiri bolumu");
  assert.ok(!auraSections.includes("aim"), "aura kulesinde Nisan bolumu");
  assert.ok(auraSections.includes("effects"), "Izolasyon'un etkileri yok");
  assert.equal(figure(auraModel, "dps"), undefined, "hasarsiz kulede DPS figuru");
  assert.equal(figure(auraModel, "d"), undefined, "hasarsiz kulede hasar figuru");
  for (const section of auraModel.sections) {
    for (const row of section.rows) assert.notEqual(row.value.trim(), "0", `${section.id}/${row.key} sifir gosteriyor`);
  }

  // Blok gelmeden: yer ayrilmis (panel blok gelince ziplamasin) ama sunucu
  // sayilari "—"; istemci kendi sayisini uydurmuyor.
  const waiting = buildTowerSheetModel({ ...aimingInput, stats: undefined });
  assert.equal(waiting.pending, true);
  const waitingAim = waiting.sections.find((section) => section.id === "aim");
  assert.ok(waitingAim, "blok yokken nisan bolumunun yeri yok");
  for (const row of waitingAim.rows) {
    assert.equal(row.value, "—", `${row.key} blok yokken sayi gosteriyor`);
    assert.equal(row.bonus, undefined);
  }
  assert.equal(figure(waiting, "d").value, "—");

  // Baska kulenin blogu bu kuleye yazilmiyor.
  const stale = buildTowerSheetModel({ ...aimingInput, stats: { ...aimingInput.stats, id: "baska-kule" } });
  assert.equal(stale.pending, true);
});

test("istemci paneli: yapi anahtari canli sayilardan bagimsiz, localStorage korumali, hareket azaltmaya uyuyor", async () => {
  const { buildTowerSheetModel, getTowerSheetStructureKey } = await importWebModule("apps/web/src/tower-sheet.ts");
  const room = oda();
  const tower = kur(room, "warrior-1");
  const input = {
    towerId: tower.id, definitionId: "warrior-1", characterId: "warrior", name: "Takipçi", level: 1, color: "#22c55e",
    stats: room.getTowerStatsBlock(tower, "p1"),
    live: { temperature: 20, ammo: 10, maxAmmo: 40, energy: 30, maxEnergy: 60, damageDealt: 10, currentDps: 1, performance: 0.5 },
    notes: []
  };
  const first = getTowerSheetStructureKey(buildTowerSheetModel(input));
  const hotter = getTowerSheetStructureKey(buildTowerSheetModel({ ...input, live: { ...input.live, temperature: 70, ammo: 3, damageDealt: 999, currentDps: 50 } }));
  assert.equal(first, hotter, "canli sayi paneli yeniden kurduruyor");

  const source = (await readFile(new URL("../apps/web/src/tower-sheet.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const storage = source.split(/\nfunction |\nexport function /).filter((chunk) => chunk.includes("localStorage"));
  assert.ok(storage.length >= 1, "bolum durumu saklanmiyor");
  for (const chunk of storage) assert.ok(/try \{[\s\S]*localStorage[\s\S]*\} catch/.test(chunk), "localStorage try/catch disinda");
  // DOM yalnizca deger degisince yaziliyor.
  assert.ok(/textContent !== /.test(source), "deger karsilastirmadan yaziliyor");

  const controls = (await readFile(new URL("../apps/web/src/game-control-ui.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(controls.includes("getTowerSheetStructureKey"), "panel anahtari canli sayilari disarida birakmiyor");
  for (const action of ["upgradeTower", "sellTower", "repairStructure", "setTowerPerformance", "setTargeting", "toggleAmmoLogistics", "toggleWallGate", "toggleTowerStandby", "setLogisticsPriority", "setUnderworldMode", "clearTowerSelection"]) {
    assert.ok(controls.includes(`action: "${action}"`), `${action} panelden kalkti`);
  }

  const css = (await readFile(new URL("../apps/web/src/style.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const sheetCss = css.slice(css.indexOf("/* Kule paneli"), css.indexOf("/* Kule paneli sonu */"));
  assert.ok(sheetCss.length > 200, "panel stili yok");
  assert.ok(sheetCss.includes("tabular-nums"), "sayilar sabit genislikte degil");
  assert.ok(sheetCss.includes("prefers-reduced-motion"), "hareket azaltma yok");
  assert.equal(/animation:|fbbf24|glow|sparkle/i.test(sheetCss), false, "panelde parilti ya da animasyon");
});

test("istemci paneli: dokum kalemleri gelip gidince panel yeniden kurulmuyor", async () => {
  const { buildTowerSheetModel, getTowerSheetStructureKey } = await importWebModule("apps/web/src/tower-sheet.ts");
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "av-refleksi", tower.id); // oldurme sonrasi kosullu donus hizi
  kartAl(room, "gokyuzu-avcisi", tower.id);
  const input = (stats) => ({
    towerId: tower.id, definitionId: "warrior-1", characterId: "warrior", name: "Takipçi", level: tower.level, color: "#22c55e",
    stats, live: { temperature: tower.temperature, ammo: 10, maxAmmo: 40, energy: 30, maxEnergy: 60, damageDealt: 10, currentDps: 1, performance: tower.performance },
    notes: []
  });
  const key = () => getTowerSheetStructureKey(buildTowerSheetModel(input(room.getTowerStatsBlock(tower, "p1"))));
  const cool = key();
  const coolModel = buildTowerSheetModel(input(room.getTowerStatsBlock(tower, "p1")));

  tower.temperature = 80; // isi freni atis hizi dokumune giriyor
  const hot = buildTowerSheetModel(input(room.getTowerStatsBlock(tower, "p1")));
  assert.notDeepEqual(
    hot.figures.find((row) => row.key === "f").detail.map((line) => line.label),
    coolModel.figures.find((row) => row.key === "f").detail.map((line) => line.label),
    "olcum bos: isi freni dokume girmedi"
  );
  assert.equal(key(), cool, "isi freni paneli yeniden kurduruyor");

  tower.performance = 0.9; // kol
  assert.equal(key(), cool, "performans kolu paneli yeniden kurduruyor");

  tower.killSnapUntil = Date.now() + 5000; // kosullu donus hizi
  assert.ok(room.getTowerStatsBlock(tower, "p1").tr.s.some(([source]) => source === "cond:turnRate"), "olcum bos: kosullu pay yok");
  assert.equal(key(), cool, "kosullu donus payi paneli yeniden kurduruyor");

  const air = dusman(room, tower, { movementKind: "air" });
  tower.turnTargetId = air.id; // namlunun hedefi degisti
  assert.equal(key(), cool, "namlu hedefi paneli yeniden kurduruyor");

  // Hedefe bagli hasar Saldiri'da, Hasar'in altinda.
  const attack = hot.sections.find((section) => section.id === "attack");
  const dx = attack.rows.find((row) => row.key === "dx");
  assert.ok(dx && dx.sub.includes("Hava +%35"), `hedefe gore hasar yok: ${dx?.sub}`);
  assert.equal(attack.rows[0].key, "dx");
});
