/**
 * Zirh turu: dort kart (Takviye Levhasi, Tam Govde, Katmanli Zirh, Dehset
 * Zirhi) ve dort esya (Agir Plaka, Kompozit Govde, Reaktif Zirh, Kutle
 * Telemetresi).
 *
 * Sahibin istegi (2026-10-24): yapilara can ya da zirh veren kart ve esya
 * sayisi artsin; kulenin cani arttikca menzilini de artiran bir esya
 * (secim: azami can); kuleye biraz zirh ve korkutma veren, zirh degeri
 * arttikca korkutmasi da artan, tek kuleye uygulanan bir kart: her saniye
 * altili zar atiliyor, 6 gelince kulenin sonraki vurusu korkutuyor.
 * Hepsi gercek odada `damageTower`, `getTowerArmor`, dalga sonu buyumesi,
 * `getTowerRange` ve `damageEnemy` uzerinden olculuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ARMOR_FEAR_DIE_FACES,
  ARMOR_FEAR_MAX_MS,
  ARMOR_FEAR_ROLL_INTERVAL_MS,
  GAME_SPEED_MULTIPLIER,
  HIGH_HEALTH_ARMOR_HP_RATIO,
  VETERAN_ARMOR_MAX_WAVES,
  WOUNDED_ARMOR_HP_RATIO,
  canEquipShopItem,
  canTargetedCardGoToTower,
  cardCatalog,
  cardReachesTower,
  getArmorFearDurationMs,
  getCardTowerReach,
  getHealthRangeAdd,
  getModifierAdd,
  getShopItem,
  getStructureArmor,
  rollArmorFearDie,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { importWebModule } from "./helpers/web-module.mjs";
import { clearBuildZones, createRoom, findBuildableSpot, findEdgeSpot } from "./helpers/match-room-harness.mjs";

const { enCards } = await importWebModule("apps/web/src/locales/catalog/en-cards.ts");
const { enShopItems } = await importWebModule("apps/web/src/locales/catalog/en-shop.ts");

const client = { sessionId: "p1", send() {} };
const near = (actual, expected, label = "", epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${label} ${actual} != ${expected}`);
const item = (id) => getShopItem(id);
const itemAdd = (itemId, stat) => getModifierAdd(item(itemId).effects, stat);
const card = (id) => cardCatalog.find((entry) => entry.id === id);
const cardAdd = (cardId, stat) => getModifierAdd(card(cardId).effects, stat);
const allTowers = Object.values(towerCatalog).flat();
const kule = (id) => allTowers.find((tower) => tower.id === id);
const wall = (gameMs) => gameMs / GAME_SPEED_MULTIPLIER;
const BASE_ARMOR = 3;

const CARD_IDS = ["takviye-levhasi", "tam-govde", "katmanli-zirh", "dehset-zirhi"];
const ITEM_IDS = ["agir-plaka", "kompozit-govde", "reaktif-zirh", "kutle-telemetresi"];

function oda() {
  const room = clearBuildZones(createRoom("warrior"));
  room.broadcast = () => {};
  room.setupPhase = false;
  room.towerCriticalRandom = () => 1;
  // Zar 1: test istemedikce dolmuyor.
  room.armorFearRandom = () => 0;
  return room;
}

function kur(room, definitionId = "warrior-4") {
  const spot = findBuildableSpot(room, definitionId);
  room.placeTower(client, { ...spot, definitionId });
  return [...room.towers.values()].at(-1);
}

function duvarKur(room) {
  const spot = findEdgeSpot(room, "vertical", "wall-1");
  assert.ok(spot, "duvar icin kenar yok");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "wall-1" });
  const built = [...room.towers.values()].at(-1);
  assert.equal(built.definition.id, "wall-1");
  return built;
}

function esyaVer(room, itemId) {
  const player = room.state.players.get("p1");
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
}

function esyaTak(room, tower, itemId) {
  esyaVer(room, itemId);
  room.equipShopItem(client, { itemId, towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes(itemId), `${itemId} takilamadi`);
}

function kartAl(room, cardId, towerId) {
  room.pendingCardChoices.set("p1", [card(cardId)]);
  room.chooseCard(client, towerId ? { cardId, towerId } : { cardId });
  assert.ok(room.state.players.get("p1").ownedCardIds.includes(cardId), `${cardId} secilemedi`);
}

/** Bir vurusun yapidan dusurdugu can. */
function vurus(room, tower, damage) {
  const before = tower.hp;
  room.damageTower(tower, damage);
  return before - tower.hp;
}

function dusman(room, x, y, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x, y, hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, armor: 0, type: "grunt", movementKind: "ground",
    damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, fearUntil: 0, ...overrides });
  room.enemySpatialGrid.rebuild(room.enemies.values());
  return enemy;
}

/** Kulenin dogrudan vurusu (`damageEnemy`, mermi vurusu). */
const vur = (room, tower, enemy, damage = 10) => room.damageEnemy(enemy, damage, 0, tower.definition.id, "p1", "true", 0, 1, tower.id, "projectile");

/** Sahte saat: testin sonunda geri aliniyor. */
function saat(t) {
  const real = Date.now;
  let clock = 1_900_000_000_000;
  Date.now = () => clock;
  t.after(() => { Date.now = real; });
  return {
    get now() { return clock; },
    ilerle(gameMs) { clock += wall(gameMs); }
  };
}

// ------------------------------------------------------------------ katalog

test("katalog: dort kart ve dort esya, nadirlik, kapsam, fiyat ve Ingilizce metin", () => {
  assert.deepEqual(CARD_IDS.map((id) => card(id)?.rarity), ["common", "uncommon", "rare", "rare"]);
  assert.deepEqual(CARD_IDS.map((id) => card(id).scope.kind), ["global", "global", "global", "targeted"]);
  assert.equal(card("takviye-levhasi").maxStacks, 2);
  assert.equal(card("dehset-zirhi").stackable, false, "tek kuleye: alininca destede bir daha cikmiyor");
  for (const id of CARD_IDS) assert.ok(enCards[id]?.name && /\d/.test(enCards[id].description), `${id} Ingilizcesi yok`);
  for (const id of ITEM_IDS) {
    const entry = item(id);
    assert.ok(entry, `${id} yok`);
    assert.equal(entry.target, "tower");
    assert.equal(entry.rarity, undefined);
    assert.ok(entry.price >= 60 && entry.price <= 200, `${id} fiyati ${entry.price}`);
    assert.ok(enShopItems[id]?.name && /\d/.test(enShopItems[id].description), `${id} Ingilizcesi yok`);
  }
  // Can ya da zirh veren kart ve esya sayisi artti: zirh artik kartta da var.
  const armorCards = cardCatalog.filter((entry) => ["armorFlat", "highHealthArmor", "veteranArmor"].some((stat) => getModifierAdd(entry.effects, stat) > 0));
  assert.ok(armorCards.length >= 3, `zirh veren kart ${armorCards.length}`);
});

test("uyumluluk: zirh esyalari her kuleye ve duvara, Kutle Telemetresi yalnizca menzili sinirli kuleye; kartlar her yapiya", () => {
  const resource = allTowers.find((tower) => tower.resourceProvider);
  for (const id of ["agir-plaka", "kompozit-govde", "reaktif-zirh"]) {
    for (const towerId of ["warrior-4", "wall-1", "warrior-2"]) assert.equal(canEquipShopItem(item(id), kule(towerId), []).ok, true, `${id} ${towerId}`);
    assert.equal(canEquipShopItem(item(id), resource, []).ok, false, `${id} kaynak binasi`);
  }
  assert.equal(canEquipShopItem(item("kutle-telemetresi"), kule("warrior-4"), []).ok, true);
  assert.equal(canEquipShopItem(item("kutle-telemetresi"), kule("warrior-2"), []).ok, false, "haritayi kaplayan menzil");
  assert.equal(canEquipShopItem(item("kutle-telemetresi"), kule("wall-1"), []).ok, false, "menzilsiz duvar");
  for (const id of ["takviye-levhasi", "tam-govde", "katmanli-zirh"]) {
    assert.equal(getCardTowerReach(card(id)), "structure", id);
    assert.equal(cardReachesTower(card(id), kule("wall-1")), true, `${id} duvar`);
    assert.equal(cardReachesTower(card(id), resource), true, `${id} kaynak binasi`);
  }
});

// ------------------------------------------------------------------ zirh

test("Takviye Levhasi: butun yapilarin zirhi +2, iki kez alinir; vurustan dusuluyor (en az 1)", () => {
  const room = oda();
  const tower = kur(room);
  const barrier = duvarKur(room);
  kartAl(room, "takviye-levhasi");
  const per = cardAdd("takviye-levhasi", "armorFlat");
  assert.equal(room.getTowerArmor(tower), BASE_ARMOR + per);
  assert.equal(room.getTowerArmor(barrier), BASE_ARMOR + per, "duvar da");
  assert.equal(vurus(room, tower, 20), 20 - BASE_ARMOR - per);
  kartAl(room, "takviye-levhasi");
  assert.equal(room.getTowerArmor(tower), BASE_ARMOR + per * 2);
  assert.equal(vurus(room, tower, 4), 1, "vurus en az 1");
});

test("Tam Govde: cani %75 ve ustundeki yapinin zirhi +4; esigin altinda kalkiyor, onarilinca geri", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "tam-govde");
  const bonus = cardAdd("tam-govde", "highHealthArmor");
  assert.equal(room.getTowerArmor(tower), BASE_ARMOR + bonus, "tam canda");
  tower.hp = tower.maxHp * HIGH_HEALTH_ARMOR_HP_RATIO;
  assert.equal(room.getTowerArmor(tower), BASE_ARMOR + bonus, "tam esikte");
  tower.hp = tower.maxHp * HIGH_HEALTH_ARMOR_HP_RATIO - 1;
  assert.equal(room.getTowerArmor(tower), BASE_ARMOR, "esigin altinda");
  tower.hp = tower.maxHp;
  assert.equal(vurus(room, tower, 20), 20 - BASE_ARMOR - bonus, "vurustan onceki cana bakiyor");
});

test("Katmanli Zirh: ayakta biten her dalga +1 zirh, tavan 5 dalga; yikik yapi ve sonra kurulan yapi sifirdan", () => {
  const room = oda();
  const tower = kur(room);
  const fallen = kur(room, "warrior-1");
  kartAl(room, "katmanli-zirh");
  assert.equal(room.getTowerArmor(tower), BASE_ARMOR, "kart aninda zirh degismiyor");
  fallen.hp = 0;
  room.advanceWaveGrowth();
  assert.equal(room.getTowerArmor(tower), BASE_ARMOR + 1, "bir dalga");
  assert.equal(fallen.veteranArmorWaves ?? 0, 0, "yikik yapi saymiyor");
  for (let wave = 0; wave < VETERAN_ARMOR_MAX_WAVES + 3; wave += 1) room.advanceWaveGrowth();
  assert.equal(room.getTowerArmor(tower), BASE_ARMOR + VETERAN_ARMOR_MAX_WAVES * cardAdd("katmanli-zirh", "veteranArmor"), "tavan");
  const late = kur(room, "warrior-4");
  room.advanceWaveGrowth();
  assert.equal(room.getTowerArmor(late), BASE_ARMOR + 1, "sonra kurulan yapi");
});

test("Agir Plaka: zirh +6, onarim bedeli +%30", () => {
  const room = oda();
  const tower = kur(room);
  const twin = kur(room);
  tower.hp = tower.maxHp / 2;
  twin.hp = twin.maxHp / 2;
  esyaTak(room, tower, "agir-plaka");
  assert.equal(room.getTowerArmor(tower), BASE_ARMOR + itemAdd("agir-plaka", "armorFlat"));
  near(room.getTowerRepairCostMultiplier(tower), 1 + itemAdd("agir-plaka", "repairCost"), "bedel carpani");
  assert.ok(room.getStructureRepairCost(tower) > room.getStructureRepairCost(twin), "onarim pahalilasmadi");
});

test("Kompozit Govde: can +%45 (oranli) ve zirh +2", () => {
  const room = oda();
  const tower = kur(room);
  const base = tower.maxHp;
  tower.hp = base / 2;
  esyaTak(room, tower, "kompozit-govde");
  near(tower.maxHp, base * (1 + itemAdd("kompozit-govde", "towerHealth")), "azami can");
  near(tower.hp / tower.maxHp, 0.5, "can orani korunuyor");
  assert.equal(room.getTowerArmor(tower), BASE_ARMOR + itemAdd("kompozit-govde", "armorFlat"));
});

test("Reaktif Zirh: cani %50'nin altindaki yapinin zirhi iki katina; duz puanlar da katlaniyor, Tam Govde ile cakismiyor", () => {
  const room = oda();
  const barrier = duvarKur(room);
  esyaTak(room, barrier, "reaktif-zirh");
  esyaTak(room, barrier, "percinli-kaplama");
  const flat = BASE_ARMOR + itemAdd("percinli-kaplama", "armorFlat");
  assert.equal(room.getTowerArmor(barrier), flat, "saglam");
  barrier.hp = barrier.maxHp * WOUNDED_ARMOR_HP_RATIO;
  assert.equal(room.getTowerArmor(barrier), flat, "tam esikte");
  barrier.hp = barrier.maxHp * WOUNDED_ARMOR_HP_RATIO - 1;
  assert.equal(room.getTowerArmor(barrier), flat * 2, "yarali");
  assert.equal(vurus(room, barrier, 20), 20 - flat * 2);
  // Paylasilan formul: iki bant ayni anda islemiyor.
  const input = { base: 3, flat: 0, highHealth: 4, veteran: 0, veteranWaves: 0, wounded: 1, hp: 100, maxHp: 100 };
  assert.equal(getStructureArmor(input), 7);
  assert.equal(getStructureArmor({ ...input, hp: 40 }), 6);
});

test("onizleme: can da olcekleniyor; zirh satiri canla kosullu zirhi takilacagi gibi gosteriyor", () => {
  const preview = (room, towerId, itemId) => {
    const sent = [];
    esyaVer(room, itemId);
    room.sendTowerPreview({ sessionId: "p1", send: (type, payload) => sent.push([type, payload]) }, { requestId: "r", towerId, itemId });
    const [, payload] = sent.at(-1);
    assert.equal(payload.error, undefined, payload.error);
    const index = payload.lineKeys.indexOf("preview.stat.armor");
    assert.ok(index >= 0, `${itemId}: zirh satiri yok`);
    return payload.lines[index];
  };
  // Tam Govde'li tam canli kule: Kompozit Govde'nin cani orani bozmuyor (3 + 4 + 2).
  const room = oda();
  const tower = kur(room);
  kartAl(room, "tam-govde");
  const healthy = BASE_ARMOR + cardAdd("tam-govde", "highHealthArmor");
  assert.match(preview(room, tower.id, "kompozit-govde"), new RegExp(`${healthy.toFixed(2)} → ${(healthy + itemAdd("kompozit-govde", "armorFlat")).toFixed(2)}`));
  // Reaktif Zirh yarali kulede zirhin katlanmasini gosteriyor (hiz siniri oyuncu basina: ayri oda).
  const room2 = oda();
  const hurt = kur(room2);
  hurt.hp = hurt.maxHp * 0.3;
  assert.match(preview(room2, hurt.id, "reaktif-zirh"), new RegExp(`${BASE_ARMOR.toFixed(2)} → ${(BASE_ARMOR * 2).toFixed(2)}`));
});

test("Dehset Zirhi yalnizca hasar veren kuleye gidiyor; oteki hedefli kartlar degismedi", () => {
  const terror = card("dehset-zirhi");
  for (const id of ["warrior-2", "warrior-3"]) assert.equal(canTargetedCardGoToTower(terror, kule(id)), false, `${id} vurmuyor`);
  assert.equal(canTargetedCardGoToTower(terror, kule("warrior-4")), true);
  assert.equal(canTargetedCardGoToTower(card("zirhli-govde"), kule("warrior-3")), true, "can karti aura kulesine gidebiliyor");
  const room = oda();
  const aura = kur(room, "warrior-3");
  const sent = [];
  room.pendingCardChoices.set("p1", [terror]);
  room.chooseCard({ sessionId: "p1", send: (type, payload) => sent.push([type, payload]) }, { cardId: "dehset-zirhi", towerId: aura.id });
  assert.ok(sent.some(([type]) => type === "card:rejected"), "vurmayan kuleye gitti");
  assert.equal(room.state.players.get("p1").ownedCardIds.includes("dehset-zirhi"), false);
});

// ------------------------------------------------------------- menzil

test("Kutle Telemetresi: azami can tabani her %100 astiginda menzil +%12; kendi cani, can esyalari ve buyume sayiliyor", () => {
  const room = oda();
  const tower = kur(room);
  const baseHp = tower.maxHp;
  const baseRange = room.getTowerRange(tower);
  const per = itemAdd("kutle-telemetresi", "healthRange");
  esyaTak(room, tower, "kutle-telemetresi");
  near(tower.maxHp, baseHp * 1.4, "kendi cani");
  near(room.getTowerRange(tower), baseRange * (1 + per * 0.4), "kendi caniyla");
  esyaTak(room, tower, "celik-dokum");
  near(room.getTowerRange(tower), baseRange * (1 + per * (tower.maxHp / baseHp - 1)), "can esyasiyla");
  assert.ok(room.getTowerRange(tower) > baseRange * (1 + per * 0.9), "can buyudukce menzil buyumedi");
  // Hasar menzili dusurmuyor: azami cana bakiyor.
  const full = room.getTowerRange(tower);
  tower.hp = tower.maxHp * 0.2;
  near(room.getTowerRange(tower), full, "yarali kule");
  // Sertlesen Govde'nin buyumesi de azami can.
  kartAl(room, "sertlesen-govde");
  room.advanceWaveGrowth();
  assert.ok(room.getTowerRange(tower) > full, "buyume menzile yansimadi");
  // Panel: menzil dokumunde esyanin kendi adiyla.
  const block = room.getTowerStatsBlock(tower, "p1");
  assert.ok(JSON.stringify(block.r).includes("shop:kutle-telemetresi"), "menzil dokumunde Kutle Telemetresi yok");
  // Paylasilan formul.
  near(getHealthRangeAdd(0.12, 300, 100), 0.24);
  assert.equal(getHealthRangeAdd(0.12, 80, 100), 0, "tabanin altinda pay yok");
});

// -------------------------------------------------------------- korkutma

test("Dehset Zirhi: tek kuleye zirh +3; dalgada her oyun saniyesi zar, yalnizca 6 doldurur; kurulumda zar yok", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  const other = kur(room);
  kartAl(room, "dehset-zirhi", tower.id);
  assert.equal(room.getTowerArmor(tower), BASE_ARMOR + cardAdd("dehset-zirhi", "armorFlat"));
  assert.equal(room.getTowerArmor(other), BASE_ARMOR, "obur kule almiyor");
  assert.ok(tower.targetedCardIds.includes("dehset-zirhi"));

  // Zar: yalnizca en buyuk yuz.
  assert.equal(rollArmorFearDie(() => 0), false);
  assert.equal(rollArmorFearDie(() => (ARMOR_FEAR_DIE_FACES - 1) / ARMOR_FEAR_DIE_FACES - 1e-9), false, "5");
  assert.equal(rollArmorFearDie(() => 0.999), true, "6");

  // Kurulumda ve dalga sonu duraklamasinda zar yok; 1 doldurmuyor.
  room.armorFearRandom = () => 0.999;
  room.setupPhase = true;
  room.rollTowerArmorFear(tower, clock.now, 5000);
  assert.notEqual(tower.armorFearArmed, true, "kurulumda zar atildi");
  room.setupPhase = false;
  room.waveClearedAt = clock.now;
  room.rollTowerArmorFear(tower, clock.now, 5000);
  assert.notEqual(tower.armorFearArmed, true, "dalga sonu duraklamasinda zar atildi");
  room.waveClearedAt = 0;
  room.armorFearRandom = () => 0;
  room.rollTowerArmorFear(tower, clock.now, 10_000);
  assert.notEqual(tower.armorFearArmed, true, "1 doldurdu");

  room.armorFearRandom = () => 0.999;
  room.rollTowerArmorFear(tower, clock.now, ARMOR_FEAR_ROLL_INTERVAL_MS - 1);
  assert.notEqual(tower.armorFearArmed, true, "saniye dolmadan zar yok");
  room.rollTowerArmorFear(tower, clock.now, 1);
  assert.equal(tower.armorFearArmed, true, "6 doldurdu");
  room.rollTowerArmorFear(other, clock.now, 5000);
  assert.notEqual(other.armorFearArmed, true, "kartsiz kule zar atmiyor");
});

test("Dehset Zirhi: dolu kulenin sonraki vurusu korkutuyor (zirh basina 0,25 sn); ayni vurusun obur dusmani da; hak sonra kapaniyor", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  kartAl(room, "dehset-zirhi", tower.id);
  const first = dusman(room, tower.x + 20, tower.y);
  const second = dusman(room, tower.x + 24, tower.y);
  const later = dusman(room, tower.x + 28, tower.y);

  vur(room, tower, first);
  assert.equal(first.fearUntil, 0, "dolu degilken korku yok");

  room.armorFearRandom = () => 0.999;
  room.rollTowerArmorFear(tower, clock.now, ARMOR_FEAR_ROLL_INTERVAL_MS);
  assert.equal(tower.armorFearArmed, true);
  room.armorFearRandom = () => 0;
  const armor = room.getTowerArmor(tower);
  const durationMs = getArmorFearDurationMs(cardAdd("dehset-zirhi", "armorFear"), armor);
  near(durationMs, armor * 250, "zirh basina 0,25 sn");
  vur(room, tower, first);
  vur(room, tower, second);
  near(first.fearUntil, clock.now + wall(durationMs), "ilk dusman", 1);
  near(second.fearUntil, clock.now + wall(durationMs), "ayni vurusun alanindaki dusman", 1);

  // Kulenin sonraki tick'i hakki kapatiyor: yeni vurus korkutmuyor.
  room.rollTowerArmorFear(tower, clock.now, 16);
  assert.equal(tower.armorFearArmed, false);
  vur(room, tower, later);
  assert.equal(later.fearUntil, 0, "harcanan hak yeniden korkuttu");
});

test("Dehset Zirhi: harcanan hak yikilan ya da beklemeye alinan kulede de kapaniyor", (t) => {
  const clock = saat(t);
  for (const state of ["yikik", "beklemede"]) {
    const room = oda();
    const tower = kur(room);
    kartAl(room, "dehset-zirhi", tower.id);
    const first = dusman(room, tower.x + 20, tower.y);
    const later = dusman(room, tower.x + 24, tower.y);
    room.armorFearRandom = () => 0.999;
    room.rollTowerArmorFear(tower, clock.now, ARMOR_FEAR_ROLL_INTERVAL_MS);
    room.armorFearRandom = () => 0;
    vur(room, tower, first);
    assert.ok(first.fearUntil > clock.now, `${state}: ilk vurus korkutmadi`);
    if (state === "yikik") tower.hp = 0;
    else tower.standby = true;
    room.updateTowers(16);
    assert.equal(tower.armorFearArmed, false, `${state}: hak acik kaldi`);
    // Havadaki mermisi ya da yanma cizgisi sonra vuruyor: korkutmuyor.
    vur(room, tower, later);
    assert.equal(later.fearUntil, 0, `${state}: harcanan hak yeniden korkuttu`);
  }
});

test("Dehset Zirhi: zirh buyudukce korku uzuyor, tavan 6 sn; kaba direnci isliyor; panelde satiri var", async (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  kartAl(room, "dehset-zirhi", tower.id);
  const per = cardAdd("dehset-zirhi", "armorFear");
  const before = getArmorFearDurationMs(per, room.getTowerArmor(tower));
  esyaTak(room, tower, "agir-plaka");
  const after = getArmorFearDurationMs(per, room.getTowerArmor(tower));
  near(after - before, itemAdd("agir-plaka", "armorFlat") * per * 1000, "zirh puani basina");
  assert.equal(getArmorFearDurationMs(per, 1000), ARMOR_FEAR_MAX_MS, "tavan");

  // Kaba (brute) korkuya %25 direncli.
  const brute = dusman(room, tower.x + 20, tower.y, { type: "brute", statusResistances: { fear: 0.25 } });
  room.armorFearRandom = () => 0.999;
  room.rollTowerArmorFear(tower, clock.now, ARMOR_FEAR_ROLL_INTERVAL_MS);
  vur(room, tower, brute);
  near(brute.fearUntil, clock.now + wall(after) * 0.75, "direnc", 1);

  const block = room.getTowerStatsBlock(tower, "p1");
  const row = block.fe?.find(([kind]) => kind === "armorFear");
  assert.ok(row, "panelde Dehset satiri yok");
  near(row[1], per, "zirh basina saniye");
  assert.equal(row[2], Math.round(after), "bugunku zirhla sure");

  const { buildTowerSheetModel } = await importWebModule("apps/web/src/tower-sheet.ts");
  const model = buildTowerSheetModel({
    towerId: tower.id, definitionId: tower.definition.id, characterId: "warrior", name: tower.definition.name, level: 1, color: "#22c55e",
    stats: block, live: { temperature: 0, ammo: 0, maxAmmo: 0, energy: 0, maxEnergy: 0, damageDealt: 0, currentDps: 0, performance: 1 }, notes: []
  });
  const effectRow = model.sections.find((section) => section.id === "effects")?.rows.find((entry) => entry.key === "fx:armorFear");
  assert.ok(effectRow, "istemci panelinde Dehset satiri yok");
  assert.notEqual(effectRow.label, "armorFear", "satir adi cevrilmemis");
  assert.ok(effectRow.sub && /\d/.test(effectRow.sub), "zar ve zirh basina pay yazmiyor");

  // Tavan durum suresi bonusundan sonra: kart "en fazla 6 saniye" diyor.
  assert.equal(getArmorFearDurationMs(per, 20, 2), ARMOR_FEAR_MAX_MS);
  kartAl(room, "takviye-levhasi");
  kartAl(room, "takviye-levhasi");
  esyaTak(room, tower, "agir-metabolizma");
  assert.ok(room.getTowerArmor(tower) * per * 1000 * 1.7 > ARMOR_FEAR_MAX_MS, "test tavani asmiyor");
  const capped = room.getTowerStatsBlock(tower, "p1").fe.find(([kind]) => kind === "armorFear");
  assert.equal(capped[2], ARMOR_FEAR_MAX_MS, "panel tavani asiyor");
  room.settleArmorFearCharge(tower);
  const grunt = dusman(room, tower.x + 30, tower.y);
  room.armorFearRandom = () => 0.999;
  room.rollTowerArmorFear(tower, clock.now, ARMOR_FEAR_ROLL_INTERVAL_MS + 16);
  vur(room, tower, grunt);
  near(grunt.fearUntil, clock.now + wall(ARMOR_FEAR_MAX_MS), "korku tavani asti", 1);
});
