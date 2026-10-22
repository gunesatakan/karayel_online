/**
 * Isi, atis hizi ve nisan esyalari, ikinci tur (docs/esya-guc-siniflandirmasi.md,
 * "Yeniden tasarim").
 *
 * Olcum iki seyi gosterdi: kuleler isiyla sinirli (surekli atis `soguma /
 * atis isisi`, atis hizi bonusu yalnizca isiyi daha cabuk dolduruyordu) ve
 * iskalar ates konisinden degil merminin ucus suresinden geliyordu (isabet
 * esyalari DPS dusuruyordu). Buradaki testler yeniden tasarlanan ve yeni
 * esya/kartlarin mekaniginin gercek odada isledigini tutuyor:
 *
 *   1. Oncul nisan: namlu bulusma noktasina donuyor, mermi oraya gidiyor ve
 *      yavas mermili kule hareketli hedefi daha cok vuruyor.
 *   2. Vurus esyalari: hizli hedef, ilk atis, kritik patlamasi, uzak kritik,
 *      sicrama; kontrol kulesinin yavaslatmasina binen kanama ve kirilganlik.
 *   3. Soguma: duz, fren, vent, oldurme, komsu ve isi koprusu.
 *   4. Atis hizi: isi butcesinden de alan dort esya ve dort kart.
 *   5. Isi bedelleri yariya indi.
 *   6. Surekli ates: her yeni soguma ve atis hizi esyasi soguma/isi dengesinde
 *      tetik ya da hasar kazandiriyor (ayni olcum `heat-brake` testinde).
 *
 * Sayilar katalogdan okunuyor: denge ayari testi bozmasin, metin ile etki
 * ayni kalsin.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  COLD_SALVO_FIRE_RATE,
  HEAT_SHOCK_TEMPERATURE,
  HEAT_SHOCK_VENT,
  KILL_COOLING_DURATION_MS,
  RESTART_FIRE_RATE,
  TOWER_HEAT_BRAKE_TEMPERATURE,
  TRACK_RHYTHM_MAX_STACKS,
  VENT_TRIGGER_TEMPERATURE,
  cardCatalog,
  getModifierAdd,
  getShopItem
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const near = (actual, expected, label = "", epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) < epsilon, `${label} ${actual} != ${expected}`);
const itemAdd = (itemId, stat) => getModifierAdd(getShopItem(itemId).effects, stat);
const cardAdd = (cardId, stat) => getModifierAdd(cardCatalog.find((entry) => entry.id === cardId).effects, stat);

function oda(characterId = "warrior") {
  const room = createRoom(characterId);
  room.broadcast = () => {};
  room.setupPhase = false;
  return room;
}

function kur(room, definitionId) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer yok`);
  room.placeTower(client, { ...spot, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower.definition.id, definitionId);
  return tower;
}

function esyaTak(room, tower, itemId) {
  const player = room.state.players.get("p1");
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
  room.equipShopItem(client, { itemId, towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes(itemId), `${itemId} ${tower.definition.id} kulesine takilamadi`);
}

function kartAl(room, cardId) {
  const card = cardCatalog.find((entry) => entry.id === cardId);
  assert.ok(card, `${cardId} katalogda yok`);
  room.pendingCardChoices.set("p1", [card]);
  room.chooseCard(client, { cardId });
  assert.ok(room.state.players.get("p1").ownedCardIds.includes(cardId), `${cardId} secilemedi`);
}

/** Olmeyen, dirensiz bir dusman; verilen konumda. */
function dusman(room, x, y, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x, y, hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, armor: 0, type: "grunt", movementKind: "ground",
    damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, ...overrides });
  room.enemySpatialGrid.rebuild(room.enemies.values());
  return enemy;
}

/** Ikinci kuleyi birincinin bitisigine tasir (komsuluk konumdan). */
function bitisikKule(room, tower, definitionId) {
  const other = kur(room, definitionId);
  other.x = tower.x + 1;
  other.y = tower.y + 1;
  assert.ok(room.getAdjacentFriendlyTowers(tower).includes(other), "kuleler bitisik degil");
  return other;
}

// ------------------------------------------------------------------ 1. Oncul nisan

/**
 * Gercek odada bir dalga kosucu akisi: kac mermi atildi, kaci vurdu. Saat
 * sahte, zar tohumlu; muhimmat ve enerji her tikte dolu (olculen tek sey nisan).
 */
function isabetOrani(itemIds, { seed = 3, seconds = 40, type = "runner", speed = 90 } = {}) {
  const realNow = Date.now;
  const realRandom = Math.random;
  let clock = 1_800_000_000_000;
  let value = seed >>> 0;
  Date.now = () => clock;
  Math.random = () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
  try {
    const room = oda();
    room.lastSnapshotBroadcastAt = Infinity;
    room.lastPerfBroadcastAt = Infinity;
    const tower = kur(room, "warrior-1");
    for (const itemId of itemIds) esyaTak(room, tower, itemId);
    const spawn = room.spawnEnemy.bind(room);
    room.spawnEnemy = () => {
      spawn();
      const enemy = [...room.enemies.values()].at(-1);
      Object.assign(enemy, { type, hp: 4000, maxHp: 4000, armor: 0, shield: 0, maxShield: 0, speed: room.scaleWorldSpeed(speed),
        movementKind: "ground", damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, healthRegenPerSecond: 0 });
    };
    room.waveTarget = 30;
    room.spawnCooldownMs = 0;
    room.teamHealth = 1e6;
    let shots = 0;
    let hits = 0;
    const fire = room.spawnTowerProjectile.bind(room);
    room.spawnTowerProjectile = (source, target) => { if (source === tower) shots += 1; return fire(source, target); };
    const hit = room.damageEnemy.bind(room);
    room.damageEnemy = (enemy, amount, slowMs, sourceId, ...rest) => { if (sourceId === "warrior-1") hits += 1; return hit(enemy, amount, slowMs, sourceId, ...rest); };
    for (let tick = 0; tick < seconds * 20; tick += 1) {
      tower.ammo = tower.maxAmmo;
      tower.energy = tower.maxEnergy;
      clock += 50;
      room.update(50);
    }
    return { shots, hits, rate: hits / Math.max(1, shots) };
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
}

test("oncul nisan: yavas mermili Takipci kosucu akisini Nisan Durbunu ile belirgin daha cok vuruyor", () => {
  const topla = (itemIds) => [1, 2, 3].map((seed) => isabetOrani(itemIds, { seed, seconds: 60 }))
    .reduce((sum, run) => ({ shots: sum.shots + run.shots, hits: sum.hits + run.hits }), { shots: 0, hits: 0 });
  const oran = (run) => ({ ...run, rate: run.hits / Math.max(1, run.shots) });
  const sade = oran(topla([]));
  const oncul = oran(topla(["nisan-durbunu"]));
  assert.ok(sade.shots > 10 && oncul.shots > 10, `olcum bos: ${sade.shots} / ${oncul.shots} atis`);
  assert.ok(oncul.rate > sade.rate + 0.2, `isabet orani %${Math.round(sade.rate * 100)} -> %${Math.round(oncul.rate * 100)}`);
});

test("oncul nisan: bulusma noktasi merminin ucus suresiyle hedefin yuruyusunun kesisimi", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  // Tam ongoru: her atis bulusma noktasina (esyalar bunun bir payini veriyor).
  tower.runModifiers.push({ source: "test", scope: "tower", stat: "leadTargeting", add: 1 });
  const enemy = dusman(room, tower.x + 60, tower.y);
  enemy.moveVx = 0;
  enemy.moveVy = 40;
  const aim = room.getTowerLeadAimPoint(tower, enemy);
  const speed = room.getTowerBallisticSpeed(tower);
  const flight = Math.hypot(aim.x - tower.x, aim.y - tower.y) / speed;
  near(aim.y - enemy.y, 40 * flight, "hedef ucus suresi kadar yurumus olmali", 1e-6);
  near(aim.x, enemy.x, "yan hiz yok");
  // Mermi o noktaya firlatiliyor, namlunun konideki sapmasina degil.
  tower.facing = Math.atan2(aim.y - tower.y, aim.x - tower.x) + 0.2;
  const before = new Set(room.projectiles.keys());
  room.spawnTowerProjectile(tower, enemy);
  const projectile = [...room.projectiles.values()].find((entry) => !before.has(entry.id));
  near(Math.atan2(projectile.vy, projectile.vx), Math.atan2(aim.y - tower.y, aim.x - tower.x), "mermi bulusma noktasina", 1e-9);
});

test("oncul nisan payi ongorulu atislarin orani: yigilan esya dogrusal, dagilim deterministik", () => {
  const sayim = (itemIds, shots = 40) => {
    const room = oda();
    const tower = kur(room, "warrior-1");
    for (const itemId of itemIds) esyaTak(room, tower, itemId);
    const enemy = dusman(room, tower.x + 60, tower.y);
    let leads = 0;
    for (let shot = 0; shot < shots; shot += 1) {
      enemy.moveVx = 0;
      enemy.moveVy = 40;
      if (room.towerNextShotLeads(tower)) leads += 1;
      room.spawnTowerProjectile(tower, enemy);
    }
    return leads;
  };
  const per = itemAdd("gez-arpacik", "leadTargeting");
  assert.equal(sayim(["gez-arpacik"]), Math.floor(40 * per + 1e-9), "bir kopya");
  assert.equal(sayim(["gez-arpacik", "gez-arpacik"]), Math.floor(80 * per + 1e-9), "iki kopya iki kat");
  assert.equal(sayim(["nisan-durbunu"]), Math.floor(40 * itemAdd("nisan-durbunu", "leadTargeting") + 1e-9), "durbun");
  // Mermi namlu yonunde ucmayan kuleye oncul nisan takilmiyor.
  const room = oda();
  const laser = kur(room, "warrior-5");
  const player = room.state.players.get("p1");
  player.inventoryItemIds.push("nisan-durbunu");
  room.equipShopItem(client, { itemId: "nisan-durbunu", towerId: laser.id });
  assert.equal(laser.equippedShopItemIds.includes("nisan-durbunu"), false);
});

test("isabet ailesinde yeniden tasarlanan esyalar ates konisini daraltmiyor (isabet cezasi yok)", () => {
  for (const itemId of ["gez-arpacik", "nisangah", "nisan-durbunu", "hassas-namlu", "atalet-dengeleyici", "lazer-telemetre"]) {
    assert.equal(itemAdd(itemId, "accuracy"), 0, `${itemId} hala isabet veriyor`);
  }
});

// ------------------------------------------------------------------ 2. Vurus esyalari

test("Hafif Taret Kabugu ve Atalet Dengeleyici kosucu ve ucan hedefe fazla vuruyor, piyadeye degil", () => {
  for (const itemId of ["hafif-taret-kabugu", "atalet-dengeleyici"]) {
    const room = oda();
    const tower = kur(room, "warrior-1");
    esyaTak(room, tower, itemId);
    room.towerCriticalRandom = () => 1;
    const bonus = itemAdd(itemId, "damageVsFast");
    assert.ok(bonus > 0, itemId);
    const vur = (overrides) => {
      const enemy = dusman(room, tower.x + 20, tower.y, overrides);
      room.damageEnemy(enemy, 100, 0, "warrior-1", "p1", "true", 0, 1, tower.id, "projectile");
      return 1e9 - enemy.hp;
    };
    const piyade = vur({ type: "grunt" });
    near(vur({ type: "runner" }) / piyade, 1 + bonus, `${itemId} kosucu`, 1e-9);
    near(vur({ type: "grunt", movementKind: "air" }) / piyade, 1 + bonus, `${itemId} hava`, 1e-9);
  }
});

test("Taret Motoru hedef degistikten sonraki ilk mermiye hasar ekliyor, ayni hedefe ikinciye eklemiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  esyaTak(room, tower, "taret-motoru");
  const bonus = itemAdd("taret-motoru", "retargetDamage");
  const a = dusman(room, tower.x + 40, tower.y);
  const b = dusman(room, tower.x, tower.y + 40);
  const mermi = (target) => {
    const before = new Set(room.projectiles.keys());
    room.spawnTowerProjectile(tower, target);
    return [...room.projectiles.values()].find((entry) => !before.has(entry.id)).damage;
  };
  const base = room.getTowerDamage(tower);
  near(mermi(a), base * (1 + bonus), "ilk hedef");
  near(mermi(a), base, "ayni hedef");
  near(mermi(b), base * (1 + bonus), "yeni hedef");
});

test("Infilak Basligi kritik vurusu cevreye patlatiyor; kritiksiz vurus patlamiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  esyaTak(room, tower, "infilak-basligi");
  const target = dusman(room, tower.x + 40, tower.y);
  const side = dusman(room, tower.x + 46, tower.y);
  room.towerCriticalRandom = () => 1;
  room.damageEnemy(target, 100, 0, "warrior-1", "p1", "true", 0, 1, tower.id, "projectile");
  assert.equal(side.hp, 1e9, "kritiksiz vurus sicradi");
  room.towerCriticalRandom = () => 0;
  room.damageEnemy(target, 100, 0, "warrior-1", "p1", "true", 0, 1, tower.id, "projectile");
  const critMultiplier = 2 + itemAdd("infilak-basligi", "critDamage");
  near(1e9 - side.hp, 100 * critMultiplier * itemAdd("infilak-basligi", "critSplash"), "patlama payi", 1e-6);
});

test("Ek Bicak Yuvasi Debug Lazer vurusunu en yakin komsuya sicratiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-5");
  esyaTak(room, tower, "ek-bicak-yuvasi");
  room.towerCriticalRandom = () => 1;
  const target = dusman(room, tower.x + 30, tower.y);
  const yakin = dusman(room, tower.x + 36, tower.y);
  const uzak = dusman(room, tower.x + 42, tower.y);
  room.damageEnemy(target, 100, 0, "warrior-5", "p1", "true", 0, 1, tower.id, "focus");
  near(1e9 - yakin.hp, 100 * itemAdd("ek-bicak-yuvasi", "hitSplash"), "yakin komsu");
  assert.equal(uzak.hp, 1e9, "yalnizca en yakin komsu");
});

test("Lazer Telemetre menzilin dis yarisindaki hedefe kritik sansi ekliyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  esyaTak(room, tower, "lazer-telemetre");
  const range = room.getTowerRange(tower);
  const close = { x: tower.x + range * 0.3, y: tower.y, movementKind: "ground" };
  const far = { x: tower.x + range * 0.8, y: tower.y, movementKind: "ground" };
  near(room.getTowerOwnConditionalCritChance(tower, far) - room.getTowerOwnConditionalCritChance(tower, close), itemAdd("lazer-telemetre", "farCritChance"), "uzak kritik");
  assert.ok(room.getTowerStatsBlock(tower, "p1").ccx.some(([kind]) => kind === "far"), "panel kosulu yok");
});

test("Kriyojen Hat ve Lanet Fitili kontrol kulesinin yavaslattigi dusmana biniyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-3");
  esyaTak(room, tower, "kriyojen-hat");
  esyaTak(room, tower, "lanet-fitili");
  const enemy = dusman(room, tower.x + 20, tower.y);
  const now = Date.now();
  room.applyEnemyStatusEffect(enemy, { type: "slow", magnitude: 1, durationMs: 1000, stacking: "refresh" }, now, { slowFraction: 0.3, sourceTowerId: tower.id, sourceOwnerId: "p1" });
  assert.ok(enemy.slowVulnerableUntil > now, "kirilganlik yok");
  near(enemy.slowVulnerableAdd, itemAdd("kriyojen-hat", "slowVulnerability"), "kirilganlik payi");
  assert.ok(enemy.statusEffects.bleed, "kanama yok");
  near(enemy.statusEffects.bleed.magnitude, itemAdd("lanet-fitili", "slowBleed"), "kanama gucu", 1e-9);
  // Kirilganlik baska bir kaynagin vurusuna da isliyor.
  const other = dusman(room, tower.x + 20, tower.y + 5);
  room.damageEnemy(other, 100, 0, "skill", "p1", "true");
  const sade = 1e9 - other.hp;
  const before = enemy.hp;
  room.damageEnemy(enemy, 100, 0, "skill", "p1", "true");
  near((before - enemy.hp) / sade, 1 + itemAdd("kriyojen-hat", "slowVulnerability"), "herkesten fazla hasar", 1e-9);
});

test("Kriyojen Hat ve Lanet Fitili artik oynanabilir kontrol kulelerine takiliyor; Yorunge Rulmani nisan alan kuleye", () => {
  const room = oda();
  const izolasyon = kur(room, "warrior-3");
  esyaTak(room, izolasyon, "kriyojen-hat");
  esyaTak(room, izolasyon, "lanet-fitili");
  const takipci = kur(room, "warrior-1");
  const heat = room.getTowerShotHeat(takipci);
  esyaTak(room, takipci, "yorunge-rulmani");
  near(room.getTowerShotHeat(takipci) / heat, 1 + itemAdd("yorunge-rulmani", "heat"), "atis isisi", 1e-9);
  assert.ok(itemAdd("yorunge-rulmani", "heat") < 0 && itemAdd("yorunge-rulmani", "turnRate") > 0);
});

// ------------------------------------------------------------------ 3. Soguma

test("Peltier Plakasi carpanlardan sonra duz derece ekliyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const once = room.getTowerCoolingPerSecond(tower);
  esyaTak(room, tower, "peltier-plakasi");
  near(room.getTowerCoolingPerSecond(tower) - once, itemAdd("peltier-plakasi", "coolingFlat"), "duz soguma");
});

test("Fren Sogutucusu yalnizca isi freni devredeyken soguma veriyor; surekli hesapta kosulsuz", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  tower.temperature = 30;
  const soguk = room.getTowerCoolingPerSecond(tower);
  tower.temperature = 70;
  const sicak = room.getTowerCoolingPerSecond(tower);
  esyaTak(room, tower, "fren-sogutucusu");
  const bonus = itemAdd("fren-sogutucusu", "brakeCooling");
  tower.temperature = 30;
  near(room.getTowerCoolingPerSecond(tower), soguk, "fren disinda");
  tower.temperature = 70;
  near(room.getTowerCoolingPerSecond(tower), sicak * (1 + bonus), "frende");
  tower.temperature = 0;
  near(room.getTowerCoolingPerSecond(tower, { sustained: true }), soguk * (1 + bonus), "surekli ates");
});

test("Emniyet Ventili kuleyi 70 derecenin ustune cikaran atista dereceyi atiyor; bekleme suresi var", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  esyaTak(room, tower, "emniyet-ventili");
  const vent = itemAdd("emniyet-ventili", "ventHeat");
  const heat = room.getTowerShotHeat(tower);
  tower.temperature = VENT_TRIGGER_TEMPERATURE - heat / 2;
  const before = tower.temperature;
  room.consumeTowerResources(tower);
  near(tower.temperature, before + heat - vent, "ilk gecis");
  tower.temperature = VENT_TRIGGER_TEMPERATURE - heat / 2;
  room.consumeTowerResources(tower);
  near(tower.temperature, before + heat, "bekleme suresinde ikinci vent yok");
});

test("Kriyo Sok Kartusu oldurmeden sonra kisa sure sogumayi buyutuyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  esyaTak(room, tower, "kriyo-sok-kartusu");
  const sade = room.getTowerCoolingPerSecond(tower);
  const enemy = dusman(room, tower.x + 20, tower.y, { hp: 10, maxHp: 10 });
  room.damageEnemy(enemy, 1000, 0, "warrior-1", "p1", "true", 0, 1, tower.id, "projectile");
  assert.equal(room.enemies.has(enemy.id), false, "dusman olmedi");
  near(room.getTowerCoolingPerSecond(tower), sade * (1 + itemAdd("kriyo-sok-kartusu", "killCooling")), "oldurme penceresi");
  assert.ok(tower.killCoolingUntil > Date.now() && tower.killCoolingUntil <= Date.now() + KILL_COOLING_DURATION_MS * 2);
});

test("Rezonans Odasi bitisik kulelerin sogumasini buyutuyor; ates etmeyen yapiya da takiliyor", () => {
  const room = oda();
  const sunucu = kur(room, "warrior-2");
  esyaTak(room, sunucu, "rezonans-odasi");
  const takipci = bitisikKule(room, sunucu, "warrior-1");
  room.collectNeighborCoolingSources();
  const uzak = kur(room, "warrior-1");
  const with_ = room.getTowerCoolingPerSecond(takipci);
  const without = room.getTowerCoolingPerSecond(uzak);
  near(with_ / without, 1 + itemAdd("rezonans-odasi", "neighborCooling"), "komsu sogumasi", 1e-9);
});

test("Isi Koprusu isiyi bitisik daha soguk kuleye aktariyor; komsusuz kulede bir sey yapmiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  esyaTak(room, tower, "isi-koprusu");
  tower.temperature = 80;
  room.updateHeatBleed(1);
  near(tower.temperature, 80, "komsusuz");
  const other = bitisikKule(room, tower, "warrior-4");
  other.temperature = 10;
  room.updateHeatBleed(1);
  const moved = itemAdd("isi-koprusu", "heatBleed");
  near(tower.temperature, 80 - moved, "aktarilan");
  near(other.temperature, 10 + moved, "alan");
});

// ------------------------------------------------------------------ 4. Atis hizi

test("Senkron Tetik atis hizini artirirken atis isisini indiriyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const interval = room.getTowerFireInterval(tower);
  const heat = room.getTowerShotHeat(tower);
  esyaTak(room, tower, "senkron-tetik");
  near(interval / room.getTowerFireInterval(tower), 1 + itemAdd("senkron-tetik", "fireRate"), "atis hizi", 1e-9);
  near(room.getTowerShotHeat(tower) / heat, 1 + itemAdd("senkron-tetik", "heat"), "isi", 1e-9);
});

test("Isil Esik Rolesi atis hizini yalnizca 50 derecenin altinda veriyor; isi indirimi her zaman", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  tower.temperature = 0;
  const coldInterval = room.getTowerFireInterval(tower);
  esyaTak(room, tower, "isil-esik-rolesi");
  near(coldInterval / room.getTowerFireInterval(tower), 1 + itemAdd("isil-esik-rolesi", "coldFireRate"), "soguk namlu", 1e-9);
  tower.temperature = 70;
  assert.equal(room.getTowerConditionalFireRateAdd(tower, room.getTowerRunModifiers(tower)), 0, "frende atis hizi eki yok");
  assert.ok(itemAdd("isil-esik-rolesi", "heat") < 0, "isi indirimi yok");
});

test("Takip Ritmi ayni hedefe art arda atista atis hizi ve isi indirimi biriktiriyor, hedef degisince yariya iniyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  esyaTak(room, tower, "takip-ritmi");
  const per = itemAdd("takip-ritmi", "trackRhythm");
  const baseHeat = room.getTowerShotHeat(tower);
  for (let shot = 0; shot < TRACK_RHYTHM_MAX_STACKS + 3; shot += 1) room.updateTowerRhythm(tower, "a");
  assert.equal(tower.rhythmStacks, TRACK_RHYTHM_MAX_STACKS, "tavan");
  near(room.getTowerShotHeat(tower) / baseHeat, 1 - per * TRACK_RHYTHM_MAX_STACKS, "isi indirimi", 1e-9);
  near(room.getTowerConditionalFireRateAdd(tower, room.getTowerRunModifiers(tower)), per * TRACK_RHYTHM_MAX_STACKS, "atis hizi");
  room.updateTowerRhythm(tower, "b");
  assert.equal(tower.rhythmStacks, Math.floor(TRACK_RHYTHM_MAX_STACKS / 2), "hedef degisti: yari");
  room.updateTowerRhythm(tower, "c");
  room.updateTowerRhythm(tower, "d");
  assert.equal(tower.rhythmStacks, 0, "sik hedef degisimi yigini eritiyor");
});

test("Rejeneratif Fren isi freninin kestigi atis hizini hasara ceviriyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  esyaTak(room, tower, "rejeneratif-fren");
  const ratio = itemAdd("rejeneratif-fren", "brakeDamage");
  tower.temperature = 30;
  near(room.getTowerHitDamageAdd(tower), 0, "fren yok");
  tower.temperature = 75; // fren carpani 0,5
  near(room.getTowerHitDamageAdd(tower), ratio * 0.5, "yarim fren");
});

test("Termal Sok Halkasi 80 dereceyi gecen atista dalga ve tahliye; bekleme suresinde tekrar yok", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  esyaTak(room, tower, "termal-sok-halkasi");
  room.towerCriticalRandom = () => 1;
  const enemy = dusman(room, tower.x + 10, tower.y);
  const heat = room.getTowerShotHeat(tower);
  tower.temperature = HEAT_SHOCK_TEMPERATURE - heat / 2;
  const before = tower.temperature;
  room.consumeTowerResources(tower);
  near(tower.temperature, before + heat - HEAT_SHOCK_VENT, "tahliye");
  near(1e9 - enemy.hp, room.getTowerDamage(tower) * itemAdd("termal-sok-halkasi", "heatShock"), "sok dalgasi", 1e-6);
  const hp = enemy.hp;
  tower.temperature = HEAT_SHOCK_TEMPERATURE - heat / 2;
  room.consumeTowerResources(tower);
  assert.equal(enemy.hp, hp, "bekleme suresinde ikinci dalga");
});

test("Yeniden Atesleme Bobini frenden cikista isisiz ve hizli atis hakki veriyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  esyaTak(room, tower, "yeniden-atesleme-bobini");
  const now = Date.now();
  tower.temperature = 60;
  room.updateTowerHeatItems(tower, now);
  tower.temperature = 45;
  room.updateTowerHeatItems(tower, now);
  assert.equal(tower.restartShots, itemAdd("yeniden-atesleme-bobini", "restartShots"));
  near(room.getTowerConditionalFireRateAdd(tower, room.getTowerRunModifiers(tower)), RESTART_FIRE_RATE, "hizli");
  const before = tower.temperature;
  room.consumeTowerResources(tower);
  near(tower.temperature, before, "isisiz atis");
});

test("Isi Donusturucu son atisin isisini hasara ceviriyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "isi-donusturucu");
  room.consumeTowerResources(tower);
  near(room.getTowerHitDamageAdd(tower), tower.lastShotHeat * cardAdd("isi-donusturucu", "heatToDamage"), "isi hasari");
  assert.ok(tower.lastShotHeat > 0);
});

test("Asiri Hiz freni kaldiriyor ve sicaklikla atis hizi veriyor; kilit esigi ayni", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "asiri-hiz");
  tower.temperature = 100;
  assert.equal(room.getTowerHeatFireRateMultiplier(tower), 1, "fren kalkmadi");
  near(room.getTowerConditionalFireRateAdd(tower, room.getTowerRunModifiers(tower)), cardAdd("asiri-hiz", "overclock"), "100 derecede");
  tower.temperature = 40;
  near(room.getTowerConditionalFireRateAdd(tower, room.getTowerRunModifiers(tower)), 0, "fren altinda");
  assert.equal(room.getTowerHeatLockThreshold(tower), 100);
});

test("Soguk Salvo 0 dereceye inen kuleye isisiz ve iki kat hizli atislar veriyor; bir soguma bir salvo", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "soguk-salvo");
  const now = Date.now();
  tower.temperature = 0;
  room.updateTowerHeatItems(tower, now);
  const shots = cardAdd("soguk-salvo", "coldSalvo");
  assert.equal(tower.coldSalvoShots, shots);
  near(room.getTowerConditionalFireRateAdd(tower, room.getTowerRunModifiers(tower)), COLD_SALVO_FIRE_RATE, "salvo hizi");
  for (let shot = 0; shot < shots; shot += 1) room.consumeTowerResources(tower);
  assert.equal(tower.temperature, 0, "salvo isi uretti");
  room.updateTowerHeatItems(tower, now);
  assert.equal(tower.coldSalvoShots, 0, "isinmadan ikinci salvo");
  room.consumeTowerResources(tower);
  room.consumeTowerResources(tower);
  room.updateTowerHeatItems(tower, now);
  tower.temperature = 0;
  room.updateTowerHeatItems(tower, now);
  assert.equal(tower.coldSalvoShots, shots, "isinip sogudu: yeni salvo");
});

test("Termodinamik Denge eski yuzde 40 tavanini asar; atis isisi negatif olmaz", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const heat = room.getTowerShotHeat(tower);
  kartAl(room, "termodinamik-denge");
  const fireRate = cardAdd("termodinamik-denge", "fireRate");
  near(room.getTowerShotHeat(tower) / heat, 1 - fireRate * cardAdd("termodinamik-denge", "fireRateHeatRelief"), "kendi bonusu", 1e-9);
  tower.runModifiers.push({ source: "test", scope: "tower", stat: "fireRate", add: 1 });
  near(room.getTowerShotHeat(tower) / heat, 0.425, "yuzde 57.5 indirim", 1e-9);
  tower.runModifiers.push({ source: "test:extra", scope: "tower", stat: "fireRate", add: 2 });
  near(room.getTowerShotHeat(tower), 0, "isi sifirda durur", 1e-9);
});

// ------------------------------------------------------------------ 5. Isi bedelleri

test("isi bedeli olan kart ve esyalarin isi cezasi yariya indi", () => {
  const cards = { "namlu-asinmasi": ["heat", 0.1], "sicak-tetik": ["heat", 0.07], "bileme-tasi": ["heat", 0.07], "basincli-hazne": ["heat", 0.05],
    "isin-odagi": ["cooling", -0.1], "soguk-dus": ["cooling", -0.07], "termal-kutle": ["cooling", -0.3] };
  for (const [id, [stat, value]] of Object.entries(cards)) near(cardAdd(id, stat), value, id);
  const items = { "atesleme-pimi": ["heat", 0.1], "isin-prizmasi": ["cooling", -0.07] };
  for (const [id, [stat, value]] of Object.entries(items)) near(itemAdd(id, stat), value, id);
  // Isi bedelini kaldiran yeniden tasarimlar: artik hicbir isi cezasi yok.
  for (const id of ["infilak-basligi", "atis-denetleyicisi", "taret-motoru", "yorunge-rulmani"]) {
    assert.ok(itemAdd(id, "heat") <= 0, `${id} hala isi cezasi tasiyor`);
  }
});

// ------------------------------------------------------------------ 6. Surekli ates

/**
 * Hic tukenmeyen bir dusmana uzun ates; ikinci yarida saniyede verilen hasar.
 * Muhimmat ve enerji dolu: olculen tek sinir isi (heat-brake testindeki yontem).
 */
function surekliHasar(setup) {
  // Saat sahte: bekleme sureleri (vent, sok) duvar saatiyle olculuyor.
  const realNow = Date.now;
  let clock = 1_800_000_000_000;
  Date.now = () => clock;
  try {
    const room = oda();
    const tower = kur(room, "warrior-1");
    setup(room, tower);
    const enemy = dusman(room, tower.x + 20, tower.y);
    room.towerCriticalRandom = () => 1;
    const seconds = 120;
    let damage = 0;
    for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 50) {
      tower.ammo = tower.maxAmmo;
      tower.energy = tower.maxEnergy;
      const hp = enemy.hp;
      clock += 50;
      room.updateTowers(50);
      room.updateProjectiles(0.05);
      if (elapsed >= seconds * 500) damage += hp - enemy.hp;
      enemy.hp = 1e9;
      room.enemySpatialGrid.rebuild(room.enemies.values());
    }
    return damage;
  } finally {
    Date.now = realNow;
  }
}

test("surekli ates: her yeni soguma ve atis hizi esyasi isi tavaninda gercek hasar kazandiriyor", () => {
  const base = surekliHasar(() => {});
  assert.ok(base > 0, "olcum bos");
  for (const itemId of ["peltier-plakasi", "fren-sogutucusu", "emniyet-ventili", "senkron-tetik", "isil-esik-rolesi", "takip-ritmi", "rejeneratif-fren", "atis-denetleyicisi"]) {
    const with_ = surekliHasar((room, tower) => esyaTak(room, tower, itemId));
    assert.ok(with_ > base * 1.08, `${itemId}: surekli hasar ${Math.round(base)} -> ${Math.round(with_)}`);
  }
});
