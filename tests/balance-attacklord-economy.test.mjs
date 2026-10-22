/**
 * Denge gecisi: AttackLord menzilleri, yalnizlik, Takip isareti, irk
 * zaaflari, kritik hasar esyalari, altin yuzdesi kartlari ve her seviyede
 * altin isteyen gelistirme.
 *
 * Sayilar burada elle yaziliyor: degisikligin kendisi bu sayilar. Turkce
 * katalog `packages/shared`, Ingilizce metin istemcinin katalogunda; ikisi
 * de ayni sayiyi soylemeli.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  RACE_DAMAGE_AFFINITY,
  TOWER_LEVEL_GOLD_COST_RATIOS,
  TRACKING_MARK_DAMAGE_PER_STACK,
  calculateDamageTaken,
  cardCatalog,
  characters,
  enemyRaceDefinitions,
  getModifierAdd,
  getShopItem,
  getTowerBaseLevelRange,
  getTowerBuildCost,
  getTowerLevelGoldCost,
  getTowerSellRefund,
  resolveTowerRefund,
  shopCatalog,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { importWebModule } from "./helpers/web-module.mjs";

const client = { sessionId: "p1", send() {} };
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ""} ${actual} != ${expected}`);
const tower = (id) => towerCatalog.warrior.find((entry) => entry.id === id);
const card = (id) => cardCatalog.find((entry) => entry.id === id);

const { enShopItems } = await importWebModule("apps/web/src/locales/catalog/en-shop.ts");
const { enCards } = await importWebModule("apps/web/src/locales/catalog/en-cards.ts");
const { enTowers, enCharacters } = await importWebModule("apps/web/src/locales/catalog/en-units.ts");

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

function kur(room, definitionId = "warrior-1") {
  const spot = findBuildableSpot(room, definitionId);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
  return [...room.towers.values()].at(-1);
}

function kartAl(room, cardId, towerId) {
  room.pendingCardChoices = new Map([["p1", [card(cardId)]]]);
  room.chooseCard(client, { cardId, towerId });
}

// ------------------------------------------------------------ 1. Menziller

test("AttackLord kulelerinin taban menzili yariya indi; Sunucu global kaldi", () => {
  const once = { "warrior-1": 112, "warrior-3": 104, "warrior-4": 118, "warrior-5": 134, "warrior-6": 118 };
  for (const [id, eski] of Object.entries(once)) {
    assert.equal(tower(id).range, eski / 2, id);
    // 1. seviye menzili tam yarisi (seviye basina +11 ortak kural, ayni kaldi).
    close(getTowerBaseLevelRange(tower(id), 1), eski / 2 * (2 / 3), `${id} 1. seviye`);
  }
  // Izolasyon'un aurasi kulenin menzilini kullaniyor; tanimdaki yaricap da taban menzil.
  assert.equal(tower("warrior-3").engine.auras[0].radius, tower("warrior-3").range);
  // Sunucu'nun menzili kural geregi harita capinda; tanimdaki sayi kullanilmiyor.
  assert.equal(getTowerBaseLevelRange(tower("warrior-2"), 1), Infinity);
  // Kaynak binalarinin menzili yok.
  assert.equal(tower("warrior-7").range, 0);
  assert.equal(tower("warrior-8").range, 0);
});

test("oda: AttackLord kulesinin sahadaki menzili yari, yalnizlik x1,5 ustune biniyor", () => {
  const room = oda();
  const kule = kur(room, "warrior-1");
  assert.equal(room.getAtakanPassiveMultiplier(kule), 1.5, "tek kule yalniz");
  close(room.getTowerRange(kule), getTowerBaseLevelRange(tower("warrior-1"), 1) * room.getMapWorldScale() * 1.5);
});

// ------------------------------------------------------------ 2. Yalnizlik metni

test("yalnizlik metni TR ve EN: hasar ve menzil x1,5, atis hizi yok, x1,5 DPS", () => {
  const tr = characters.find((entry) => entry.id === "warrior").passive;
  const en = enCharacters.warrior.passive;
  assert.match(tr, /menzili x1\.5, hasarı x1\.5 olur, atış hızı değişmez — toplamda x1\.5 DPS/);
  assert.match(en, /range x1\.5, damage x1\.5, fire rate unchanged — x1\.5 DPS in total/);
  for (const text of [tr, en]) assert.doesNotMatch(text, /2[.,]25|0[.,]67/);
});

// ------------------------------------------------------------ 3. Takip isareti

test("Takip isareti yigin basina +%30 (eskiden +%20); motor tanimi ve metinler ayni", () => {
  assert.equal(TRACKING_MARK_DAMAGE_PER_STACK, 0.3);
  close(tower("warrior-1").engine.appliesMark.damageMultiplier, 1.3);
  assert.match(tower("warrior-1").description, /%30 fazla hasar alır \(5\. seviyede %60, 10\. seviyede %90\)/);
  assert.match(enTowers["warrior-1"].description, /takes 30% more damage .*\(60% at level 5, 90% at level 10\)/);
});

test("oda: isaretli dusman seviyeye gore x1,3 / x1,6 / x1,9 hasar aliyor", () => {
  for (const [level, beklenen] of [[1, 1.3], [5, 1.6], [10, 1.9]]) {
    const room = oda();
    const vuran = kur(room, "warrior-4");
    room.towerCriticalRandom = () => 1;
    const olc = (isaretli) => {
      room.spawnEnemy();
      const enemy = [...room.enemies.values()].at(-1);
      Object.assign(enemy, { hp: 1e6, maxHp: 1e6, shield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {} });
      if (isaretli) room.applyTrackingStacks(enemy, Date.now() + 5000, room.getTrackingStackLimit(level));
      room.damageEnemy(enemy, 100, 0, "warrior-4", "p1", "true", 0, 1, vuran.id);
      return 1e6 - enemy.hp;
    };
    close(olc(true) / olc(false), beklenen, `${level}. seviye`);
  }
});

// ------------------------------------------------------------ 4. Irk

test("irk zaafi ve direnci +-%40 (eskiden +-%20), her irkta", () => {
  assert.equal(RACE_DAMAGE_AFFINITY, 0.4);
  for (const [race, definition] of Object.entries(enemyRaceDefinitions)) {
    const values = Object.values(definition.damageResistances).sort();
    assert.deepEqual(values, [-0.4, 0.4], race);
  }
  const zayif = { armor: 0, shield: 0, damageResistances: enemyRaceDefinitions.meka.damageResistances, hitTypeResistances: {} };
  close(calculateDamageTaken({ amount: 100, damageType: "electric" }, zayif).rawDamage, 140);
  close(calculateDamageTaken({ amount: 100, damageType: "psychic" }, zayif).rawDamage, 60);
});

// ------------------------------------------------------------ 5. Kritik hasar esyalari

test("kritik hasar veren her esya yariya indi; fiyat ve oteki statlar ayni; TR ve EN metin", () => {
  // id -> [kritik hasar, fiyat, TR metin parcasi, EN metin parcasi]
  const beklenen = {
    "kritik-sistem": [0.5, 150, "kritik hasarı +%50", "crit damage +50%"],
    "agir-cekirdek": [0.6, 105, "kritik hasarı +%60", "crit damage +60%"],
    // Yeniden tasarim (isi cezasi kalkti, kritik patlamasi eklendi): +%60.
    "infilak-basligi": [0.6, 130, "kritik hasarı +%60", "crit damage +60%"],
    "yarik-mermi": [1.25, 110, "kritik hasarı +%125", "crit damage +125%"],
    // Yeniden tasarim (isabet yerine oncul nisan): +%40.
    "hassas-namlu": [0.4, 105, "kritik hasarı +%40", "crit damage +40%"],
    "tungsten-cekirdek": [0.2, 105, "kritik hasarı +%20", "crit damage +20%"]
  };
  const kritikHasarli = shopCatalog.filter((entry) => entry.effects.some((modifier) => modifier.stat === "critDamage")).map((entry) => entry.id).sort();
  assert.deepEqual(kritikHasarli, Object.keys(beklenen).sort(), "kritik hasar esyasi listesi degisti");
  for (const [id, [crit, price, tr, en]] of Object.entries(beklenen)) {
    const item = getShopItem(id);
    close(getModifierAdd(item.effects, "critDamage"), crit, id);
    assert.equal(item.price, price, id);
    assert.ok(item.description.includes(tr), `${id}: ${item.description}`);
    assert.ok(enShopItems[id].description.includes(en), `${id}: ${enShopItems[id].description}`);
  }
  // Oteki statlar dokunulmadi.
  close(getModifierAdd(getShopItem("kritik-sistem").effects, "critChance"), 0.12);
  close(getModifierAdd(getShopItem("yarik-mermi").effects, "critChance"), -0.06);
  close(getModifierAdd(getShopItem("infilak-basligi").effects, "heat"), 0);
  close(getModifierAdd(getShopItem("infilak-basligi").effects, "critSplash"), 0.5);
  close(getModifierAdd(getShopItem("hassas-namlu").effects, "leadTargeting"), 0.5);
  close(getModifierAdd(getShopItem("tungsten-cekirdek").effects, "projectileSpeed"), 0.5);
  assert.equal(getShopItem("agir-cekirdek").maxStacks, 2);
});

// ------------------------------------------------------------ 6. Altin yuzdesi kartlari

test("dusman altini yuzdesi veren kartlar yariya indi; Savas Hazinesi'nin hasari ayni", () => {
  const beklenen = { "ganimet-payi": 0.6, "kanli-kazanc": 1.4, "parali-asker": 1, "savas-hazinesi": 0.6 };
  // Altin veren kartlar (artiran); Ogrenci Bursu altini tecrubeyle takas ediyor (eksi).
  const altinKartlari = cardCatalog.filter((entry) => entry.effects.some((modifier) => modifier.stat === "goldGain" && modifier.add > 0)).map((entry) => entry.id).sort();
  assert.deepEqual(altinKartlari, Object.keys(beklenen).sort(), "altin yuzdesi kart listesi degisti");
  for (const [id, add] of Object.entries(beklenen)) {
    close(getModifierAdd(card(id).effects, "goldGain"), add, id);
    assert.ok(card(id).description.startsWith(`Düşman altını +%${Math.round(add * 100)}`), card(id).description);
    assert.ok(enCards[id].description.startsWith(`Enemy gold +${Math.round(add * 100)}%`), enCards[id].description);
  }
  // Cevrim adimi ikiye katlandi: kartin kendi +%60'i yine +%9 hasar.
  const [conversion] = card("savas-hazinesi").conversions;
  close(conversion.ratio, 0.15);
  assert.equal(conversion.cap, undefined);
  close(beklenen["savas-hazinesi"] * conversion.ratio, 0.09);
  assert.match(card("savas-hazinesi").description, /her %20'si tüm kulelerin hasarına \+%3 ekler\./);
  assert.match(enCards["savas-hazinesi"].description, /Each 20% of enemy gold bonus adds \+3%/);
});

// ------------------------------------------------------------ 7. Gelistirme altini

test("her seviye insa bedelinin artan bir payini istiyor; 5 ve 10 eski esikler", () => {
  assert.deepEqual({ ...TOWER_LEVEL_GOLD_COST_RATIOS }, { 2: 0.5, 3: 0.7, 4: 0.9, 5: 10, 6: 1.2, 7: 1.5, 8: 1.9, 9: 2.4, 10: 40 });
  // Takipci: insa 84.
  const takipci = tower("warrior-1").cost;
  const build = getTowerBuildCost(takipci);
  assert.equal(build, 84);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => getTowerLevelGoldCost(takipci, level)),
    [42, 59, 76, 840, 101, 126, 160, 202, 3360]
  );
});

test("oda: gelistirme altini oder; ayni hazirlikta geri alim insa + gelistirme altinini iade eder", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  player.experience = 1e9;
  room.setupPhase = true;
  const once = player.gold;
  const onceHarcama = player.goldSpent;
  const kule = kur(room, "warrior-1");
  const build = kule.buildGold;
  room.upgradeTower(client, { towerId: kule.id });
  room.upgradeTower(client, { towerId: kule.id });
  assert.equal(kule.level, 3);
  const gelistirme = getTowerLevelGoldCost(kule.definition.cost, 1) + getTowerLevelGoldCost(kule.definition.cost, 2);
  assert.equal(kule.upgradeGold, gelistirme);
  assert.equal(player.gold, once - build - gelistirme);
  // Tel kaydi da tasiyor: istemcinin geri alim dugmesi ayni sayiyi gosteriyor.
  const kayit = room.getSnapshot().towers.find((entry) => entry.id === kule.id);
  assert.equal(kayit.upgradeGold, gelistirme);
  const istemci = resolveTowerRefund(
    { ...kayit, buildGold: build, builtInSetupSession: kule.builtInSetupSession, cost: kule.definition.cost, definitionId: kule.definition.id },
    { setupPhase: true, setupSession: room.setupSession, refundMultiplier: 1 }
  );
  assert.deepEqual(istemci, { amount: build + gelistirme, undoable: true });

  room.sellTower(client, { towerId: kule.id });
  assert.equal(room.towers.has(kule.id), false);
  assert.equal(player.gold, once, "geri alim gelistirme altinini kaybettirdi");
  assert.equal(player.goldSpent, onceHarcama);
});

test("oda: gecmis hazirliktan kalan kulenin satisi degismedi (insa bedelinin yarisi)", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  player.experience = 1e9;
  room.setupPhase = false;
  const kule = kur(room, "warrior-1");
  room.upgradeTower(client, { towerId: kule.id });
  room.upgradeTower(client, { towerId: kule.id });
  room.setupSession += 1;
  room.setupPhase = true;
  const once = player.gold;
  room.sellTower(client, { towerId: kule.id });
  assert.equal(player.gold - once, getTowerSellRefund(kule.definition.cost, 3));
  assert.equal(getTowerSellRefund(kule.definition.cost, 3), Math.floor(getTowerBuildCost(kule.definition.cost) / 2));
});

test("oda: altini yetmeyen gelistirme yapilmiyor; Terfi Ikramiyesi her gelistirmede odemeye devam ediyor", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  player.experience = 1e9;
  const kule = kur(room, "warrior-1");
  player.gold = getTowerLevelGoldCost(kule.definition.cost, 1) - 1;
  room.upgradeTower(client, { towerId: kule.id });
  assert.equal(kule.level, 1, "altin yetmeden gelisti");

  kartAl(room, "terfi-ikramiyesi");
  player.gold = 10_000;
  room.upgradeTower(client, { towerId: kule.id });
  assert.equal(kule.level, 2);
  assert.equal(player.gold, 10_000 - getTowerLevelGoldCost(kule.definition.cost, 1) + 10);
});
