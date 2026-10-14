/**
 * Esya uyumlulugu ve "kodu aciklamaya uydur" duzeltmeleri.
 *
 * - Esya yalnizca is gordugu kuleye takilir (`isShopItemUsefulOnTower`):
 *   kule yetenekleri tanimdan ve motordan, esyanin ihtiyaclari statlarindan,
 *   kilitlerinden ve motor eklerinden turetiliyor. Sunucu reddediyor, vitrin
 *   kurulabilir hicbir kulede is gormeyen esyayi sunmuyor.
 * - Kan Bankasi bedeli kopya basina; nexus dusukken o dalga bonus yok.
 * - Nexus Kalkani'nin kullanilmayan haklari dalga sonunda siliniyor.
 * - Durum etkisi gucu yavaslatmayi da olcekliyor (Izolasyon, Kin, aura).
 * - Sure esyalari isareti, Termal Funye yanmasini ve aurayi da uzatiyor.
 * - Ucaksavar Kiti havayi zaten vuran kulede ceza degil bonus.
 * - S kademesindeki altin esyalari yariya indi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BLOOD_BANK_NEXUS_COST,
  CLEAN_WAVE_GOLD,
  GAME_SPEED_MULTIPLIER,
  INSURANCE_CLEAN_WAVE_GOLD,
  KIN_SLOW_FAR_FRACTION,
  PLAYABLE_CHARACTER_IDS,
  SERVER_TEXT,
  SHOP_ITEM_NEEDS,
  canEquipShopItem,
  describeShopItemNeed,
  drawShopOffers,
  getAuraSlowLingerMs,
  getIsolationSlowFraction,
  getModifierAdd,
  getShopItem,
  getShopItemNeeds,
  getShopItemTowerEffects,
  getShopItemTowerMismatch,
  getTowerItemCapabilities,
  isShopItemUsefulOnTower,
  scaleSlowFraction,
  shopCatalog,
  shopItemAppliesToTower,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const allTowers = [...new Map(Object.values(towerCatalog).flat().map((tower) => [tower.id, tower])).values()];
const kule = (id) => allTowers.find((tower) => tower.id === id);
/** Oynanabilir operatorlerin kurabildigi her yapi: kadrolari ve ortak yapilar. */
const playableTowers = [...new Map(PLAYABLE_CHARACTER_IDS.flatMap((id) => towerCatalog[id]).map((tower) => [tower.id, tower])).values()];
const towerItems = shopCatalog.filter((item) => item.target === "tower");
const item = (id) => {
  const entry = getShopItem(id);
  assert.ok(entry, `${id} katalogda yok`);
  return entry;
};

function recordingClient(sessionId = "p1") {
  const sent = [];
  return { sessionId, sent, send(type, payload) { sent.push({ type, payload }); } };
}

function oda(characterId = "warrior") {
  const room = createRoom(characterId);
  room.broadcast = () => {};
  const client = recordingClient();
  room.clients = [client];
  const player = room.state.players.get("p1");
  Object.assign(player, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0 });
  return { room, client, player };
}

function kur(room, client, definitionId) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer yok`);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower.definition.id, definitionId);
  return tower;
}

/** Esyayi hazirlik fazinda takar (Kan Bankasi dalga ortasinda takilinca hemen oduyor). */
function esyaTak(room, client, tower, itemId) {
  const player = room.state.players.get(client.sessionId);
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
  const before = tower.equippedShopItemIds.length;
  const wasSetup = room.setupPhase;
  room.setupPhase = true;
  room.equipShopItem(client, { itemId, towerId: tower.id });
  room.setupPhase = wasSetup;
  return tower.equippedShopItemIds.length === before + 1;
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

function sabitSaat(run) {
  const gercek = Date.now;
  const simdi = gercek();
  Date.now = () => simdi;
  try {
    return run(simdi);
  } finally {
    Date.now = gercek;
  }
}

/** Hazirlik bitiyor, dalga basliyor (bedeller burada odeniyor). */
function dalgayiBaslat(room) {
  room.setupPhase = true;
  room.setupReadyPlayerIds.add("p1");
  room.tryFinishSetupPhase();
  assert.equal(room.setupPhase, false, "dalga baslamadi");
}

/** Dalga temizlendi: kapanis yolu (primler, isi sifirlama, sonraki hazirlik). */
function dalgayiKapat(room) {
  room.setupPhase = false;
  room.pendingCardChoices.clear();
  room.enemies.clear();
  room.waveSpawned = room.waveTarget;
  room.waveClearedAt = 0;
  const gercek = Date.now;
  let simdi = gercek();
  Date.now = () => simdi;
  try {
    room.updateSpawning(16);
    simdi += 3000;
    room.updateSpawning(16);
  } finally {
    Date.now = gercek;
  }
}

const near = (actual, expected, message, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) < epsilon, `${message}: ${actual} != ${expected}`);

// ------------------------------------------------------------ 1. Kural

test("kule yetenekleri tanimdan ve motordan turetiliyor", () => {
  const caps = (id) => getTowerItemCapabilities(kule(id));
  // Ates eden ve hasar veren mermi kulesi.
  assert.equal(caps("warrior-1").projectiles, true);
  assert.equal(caps("warrior-1").pierce, true);
  assert.equal(caps("warrior-1").aims, true);
  // Isin/odak: mermi yok, delme yok, ama isiniyor.
  assert.equal(caps("warrior-5").projectiles, false);
  assert.equal(caps("warrior-5").pierce, false);
  assert.equal(caps("warrior-5").beam, true);
  assert.equal(caps("warrior-5").heat, true);
  // Gosteri'nin isini hattaki herkese vuruyor: delme sayisini okumuyor.
  assert.equal(caps("zeynep-2").pierce, false);
  // Izolasyon hasar vermiyor ama dusmana etki ediyor (yavaslatma).
  assert.equal(caps("warrior-3").attacks, true);
  assert.equal(caps("warrior-3").damage, false);
  assert.equal(caps("warrior-3").appliesStatus, true);
  // Yalnizca kulelere aura veren yapilar ve hic saldirmayan Sunucu saldirmiyor.
  for (const id of ["zeynep-7", "zeynep-8", "warrior-2"]) assert.equal(caps(id).attacks, false, id);
  assert.equal(caps("zeynep-8").edge, true);
  assert.equal(caps("zeynep-8").support, true);
  // Kaynak binalari turuyle.
  assert.equal(caps("warrior-7").resource, "ammunition");
  assert.equal(caps("warrior-7").ammoFactory, true);
  assert.equal(caps("warrior-8").resource, "energy");
  assert.equal(caps("warrior-8").ammoFactory, false);
  assert.equal(caps("repair-depot-1").resource, "repairDepot");
  assert.equal(caps("warehouse-1").resource, "warehouse");
  assert.equal(caps("wall-1").wall, true);
  assert.equal(caps("wall-1").attacks, false);
  // Hava: tanimdan.
  assert.equal(caps("warrior-1").hitsAir, true);
  assert.equal(caps("warrior-5").hitsAir, false);
});

/**
 * Tablo: oynanabilir iki operatorun kurabildigi her yapi (kadro + ortak
 * yapilar) icin esyanin takilabildigi kuleler. Belgedeki ornekler burada.
 */
const AIMING = ["warrior-1", "warrior-4", "warrior-5", "warrior-6", "zeynep-1", "zeynep-2", "zeynep-3", "zeynep-6"];
const DAMAGE = AIMING;
const HEAT = ["warrior-1", "warrior-3", "warrior-4", "warrior-5", "warrior-6", "zeynep-1", "zeynep-2", "zeynep-3", "zeynep-6"];
const ATTACKS = HEAT;
const PROJECTILES = ["warrior-1", "warrior-4", "warrior-6", "zeynep-1", "zeynep-3", "zeynep-6"];
const STRUCTURES = ["warrior-1", "warrior-2", "warrior-3", "warrior-4", "warrior-5", "warrior-6", "wall-1", "repair-depot-1", "warehouse-1", "zeynep-1", "zeynep-2", "zeynep-3", "zeynep-6", "zeynep-7", "zeynep-8"];
const EXPECTED_FIT = {
  // Uretim carpanlari yalnizca cephane fabrikasinda okunuyor.
  "verim-hatti": ["warrior-7", "zeynep-9"],
  "seri-cephane-hatti": ["warrior-7", "zeynep-9"],
  // "Her kuleye" takilan stat esyalari artik statin is gordugu kuleye.
  "hafif-muhimmat": PROJECTILES,
  "namlu-yatagi": AIMING,
  "hedef-kilidi": AIMING,
  "sogutucu-kanatlar": HEAT,
  "sogutma-sivisi": HEAT,
  // Delme sayisini okuyan balistik tek hedef/hat kuleleri; Gosteri ve Abarti disarida.
  "delici-uc": ["warrior-1", "warrior-4", "warrior-6", "zeynep-1"],
  // Durum etkisi esyalari: dusmana etki eden kule.
  "uzun-fitil": ATTACKS,
  "kalici-iz": ATTACKS,
  "agir-metabolizma": ATTACKS,
  "yanki-odasi": ["warrior-3", "zeynep-6"],
  "buz-cekirdegi": ["warrior-3", "zeynep-6"],
  "koni-yayici": ["zeynep-6"],
  "termal-funye": ["warrior-5"],
  "ucaksavar-kiti": DAMAGE,
  "kan-bankasi": DAMAGE,
  "avci-protokolu": ATTACKS,
  "dusuk-guc-modu": [...STRUCTURES.filter((id) => !["wall-1", "repair-depot-1", "warehouse-1"].includes(id))],
  "celik-dokum": STRUCTURES,
  "darphane-modulu": ["warrior-7", "warrior-8", "repair-depot-1", "warehouse-1", "zeynep-9", "zeynep-10"]
};

test("uyumluluk tablosu: oynanabilir operatorlerin kuleleri ve ortak yapilar", () => {
  for (const [id, expected] of Object.entries(EXPECTED_FIT)) {
    const fit = playableTowers.filter((tower) => isShopItemUsefulOnTower(item(id), tower)).map((tower) => tower.id);
    assert.deepEqual(fit.sort(), [...expected].sort(), id);
  }
});

test("butun esyalar x butun oynanabilir yapilar: takma, kapsam ve sebep ayni kurali okuyor", () => {
  for (const entry of towerItems) {
    for (const tower of playableTowers) {
      const useful = isShopItemUsefulOnTower(entry, tower);
      const check = canEquipShopItem(entry, tower, []);
      assert.equal(check.ok, useful, `${entry.id} / ${tower.id}`);
      assert.equal(shopItemAppliesToTower(entry, tower), useful, `${entry.id} / ${tower.id}`);
      if (useful) continue;
      assert.equal(check.reason, "incompatibleTower", `${entry.id} / ${tower.id}`);
      assert.ok(SHOP_ITEM_NEEDS.includes(check.need), `${entry.id} / ${tower.id}: ${check.need}`);
      assert.equal(check.need, getShopItemTowerMismatch(entry, tower));
      assert.ok(SERVER_TEXT[`equip.incompatible.${check.need}`], `${check.need} sunucu metni yok`);
      // Istenen yetenek kulede gercekten yok.
      const caps = getTowerItemCapabilities(tower);
      if (check.need in caps) assert.equal(caps[check.need], false, `${entry.id} / ${tower.id}: ${check.need}`);
    }
  }
});

test("statin istedigi yetenek: hicbir esya statinin is gormedigi yapiya takilmiyor (butun katalog)", () => {
  const rules = [
    [["projectileSpeed", "projectileSpeedIsolated"], "projectiles"],
    [["turnRate", "targetLockMs"], "aims"],
    [["heat", "cooling"], "heat"],
    [["resourceProduction", "ammoProduction"], "ammoFactory"],
    [["damage", "critChance", "critDamage", "markAmplification", "airDamage", "experienceGain"], "damage"],
    [["statusDuration", "statusMagnitude", "fireRate"], "attacks"]
  ];
  for (const entry of towerItems) {
    for (const [stats, need] of rules) {
      if (!entry.effects.some((modifier) => stats.includes(modifier.stat))) continue;
      assert.ok(getShopItemNeeds(entry).includes(need), `${entry.id} ${need} istemiyor`);
      for (const tower of allTowers) {
        if (isShopItemUsefulOnTower(entry, tower)) assert.equal(getTowerItemCapabilities(tower)[need], true, `${entry.id} / ${tower.id}`);
      }
    }
  }
  // Ates etmeyen yapilara (duvar, kaynak binalari, Saray Arsivi, Abarti, Sunucu)
  // hicbir isi, mermi, nisan ya da hasar esyasi takilmiyor.
  for (const id of ["wall-1", "repair-depot-1", "warehouse-1", "warrior-7", "warrior-8", "zeynep-7", "zeynep-8", "warrior-2"]) {
    for (const entry of ["hafif-muhimmat", "namlu-yatagi", "sogutucu-kanatlar", "sogutma-sivisi", "hedef-kilidi", "uzun-fitil", "delici-uc", "kan-bankasi"]) {
      assert.equal(isShopItemUsefulOnTower(item(entry), kule(id)), false, `${entry} / ${id}`);
    }
  }
});

test("kisa sebep iki dilde; sunucu metni ayni Turkceyi tasiyor", () => {
  for (const need of SHOP_ITEM_NEEDS) {
    const text = describeShopItemNeed(need);
    assert.ok(text.length > 5, need);
    assert.equal(SERVER_TEXT[`equip.incompatible.${need}`], `Bu eşya bu kuleye takılamaz: ${text}.`, need);
  }
});

// ------------------------------------------------------------ 2. Sunucu reddi

test("sunucu uyumsuz kuleye takmayi reddediyor: anahtar, Turkce metin ve ihtiyac; esya envanterde kaliyor", () => {
  const { room, client, player } = oda("warrior");
  // Izolasyon once: yalniz kurulmak istiyor.
  const izolasyon = kur(room, client, "warrior-3");
  const lazer = kur(room, client, "warrior-5");
  const reaktor = kur(room, client, "warrior-8");
  const fabrika = kur(room, client, "warrior-7");
  const durumlar = [
    [lazer, "hafif-muhimmat", "projectiles"],
    [reaktor, "verim-hatti", "ammoFactory"],
    [izolasyon, "hedef-kilidi", "aims"],
    [lazer, "delici-uc", "class"]
  ];
  for (const [tower, itemId, need] of durumlar) {
    client.sent.length = 0;
    player.inventoryItemIds.push(itemId);
    room.equipShopItem(client, { itemId, towerId: tower.id });
    const rejected = client.sent.find((entry) => entry.type === "inventory:equip-rejected");
    assert.ok(rejected, `${itemId} reddedilmedi`);
    assert.equal(rejected.payload.reason, "incompatibleTower");
    assert.equal(rejected.payload.need, need, itemId);
    assert.equal(rejected.payload.key, `equip.incompatible.${need}`);
    assert.equal(rejected.payload.message, SERVER_TEXT[`equip.incompatible.${need}`]);
    assert.ok(player.inventoryItemIds.includes(itemId), `${itemId} envanterden dustu`);
    assert.equal(tower.equippedShopItemIds.includes(itemId), false);
  }
  // Uyan kuleye takiliyor.
  room.equipShopItem(client, { itemId: "verim-hatti", towerId: fabrika.id });
  assert.deepEqual(fabrika.equippedShopItemIds, ["verim-hatti"]);
});

test("Delici Uc Gosteri'ye ve Abarti'ya takilmiyor; Hiza Emri'ne takiliyor", () => {
  const { room, client, player } = oda("zeynep");
  const gosteri = kur(room, client, "zeynep-2");
  const hiza = kur(room, client, "zeynep-1");
  player.inventoryItemIds.push("delici-uc", "delici-uc");
  room.equipShopItem(client, { itemId: "delici-uc", towerId: gosteri.id });
  assert.equal(client.sent.find((entry) => entry.type === "inventory:equip-rejected")?.payload.need, "pierce");
  room.equipShopItem(client, { itemId: "delici-uc", towerId: hiza.id });
  assert.deepEqual(hiza.equippedShopItemIds, ["delici-uc"]);
  assert.equal(getShopItemTowerMismatch(item("delici-uc"), kule("zeynep-8")), "pierce");
});

test("onizleme de ayni sebebi soyluyor", () => {
  const { room, client, player } = oda("warrior");
  const lazer = kur(room, client, "warrior-5");
  player.inventoryItemIds.push("hafif-muhimmat");
  room.previewRequestTimes = new Map();
  room.sendTowerPreview(client, { requestId: "1", towerId: lazer.id, itemId: "hafif-muhimmat" });
  const preview = client.sent.find((entry) => entry.type === "tower:preview")?.payload;
  assert.ok(preview?.error, "onizleme reddetmedi");
  assert.equal(preview.errorParams.need, "projectiles");
  assert.ok(preview.error.includes("yalnızca mermi atan kulelere takılır"), preview.error);
});

test("eski kayitta uyumsuz takili esya yerinde kaliyor ve isliyor", () => {
  const { room, client } = oda("warrior");
  const lazer = kur(room, client, "warrior-5");
  lazer.equippedShopItemIds.push("hafif-muhimmat");
  room.invalidateTowerGrants();
  assert.deepEqual(lazer.equippedShopItemIds, ["hafif-muhimmat"]);
  // Kural yeni takmalar icin: yeniden kurulum ya da cozumleme onu dusurmuyor.
  room.getTowerEngine(lazer);
  assert.deepEqual(lazer.equippedShopItemIds, ["hafif-muhimmat"]);
});

// ------------------------------------------------------------ 3. Vitrin

/** Tohumlu zar (mulberry32): ayni tohum ayni vitrin. */
function zar(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

test("vitrin: oynanabilir operatorde hicbir kulede is gormeyen esya cikmiyor; tohumlu cekilis ayni", () => {
  for (const characterId of PLAYABLE_CHARACTER_IDS) {
    const buildable = towerCatalog[characterId];
    const useless = new Set(towerItems.filter((entry) => !buildable.some((tower) => isShopItemUsefulOnTower(entry, tower))).map((entry) => entry.id));
    assert.ok(useless.size > 0, `${characterId}: suzgecin eleyecegi esya yok, test bir sey olcmuyor`);
    let unfiltered = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const options = { wave: 10, preferredAxes: [], towers: [], ownedItemIds: [], count: 5 };
      const offers = drawShopOffers({ ...options, buildableTowers: buildable, random: zar(seed) });
      assert.equal(offers.length, 5);
      for (const offer of offers) assert.equal(useless.has(offer.id), false, `${characterId}: ${offer.id} vitrine cikti`);
      // Determinizm: ayni tohum ayni teklif.
      assert.deepEqual(drawShopOffers({ ...options, buildableTowers: buildable, random: zar(seed) }).map((entry) => entry.id), offers.map((entry) => entry.id));
      // Suzgecsiz cekilis bu esyalari sunuyordu.
      unfiltered += drawShopOffers({ ...options, random: zar(seed) }).filter((offer) => useless.has(offer.id)).length;
    }
    assert.ok(unfiltered > 0, `${characterId}: suzgecsiz cekilis de onlari hic sunmadi`);
  }
});

test("sunucu vitrini ve yenilemesi operatorun kurabildigi yapilara bakiyor", () => {
  for (const characterId of PLAYABLE_CHARACTER_IDS) {
    const { room, client, player } = oda(characterId);
    const buildable = towerCatalog[characterId];
    room.setupPhase = true;
    for (let round = 0; round < 40; round += 1) {
      if (round % 2 === 0) room.openPlayerSetupShop("p1", player);
      else room.rerollShop(client);
      for (const offer of player.shopOffers) {
        if (offer.target !== "tower") continue;
        assert.ok(buildable.some((tower) => isShopItemUsefulOnTower(offer, tower)), `${characterId}: ${offer.id}`);
      }
    }
  }
});

// ------------------------------------------------------------ 4. Kan Bankasi

test("Kan Bankasi: bedel takili her kopya icin, dalga basinda", () => {
  const { room, client } = oda("warrior");
  const a = kur(room, client, "warrior-1");
  const b = kur(room, client, "warrior-4");
  assert.ok(esyaTak(room, client, a, "kan-bankasi"));
  assert.ok(esyaTak(room, client, b, "kan-bankasi"));
  room.teamHealth = 100;
  dalgayiBaslat(room);
  assert.equal(room.teamHealth, 100 - 2 * BLOOD_BANK_NEXUS_COST, "iki kopya iki bedel");
  near(room.getTowerHitDamageAdd(a), 0.2, "a bonusu");
  near(room.getTowerHitDamageAdd(b), 0.2, "b bonusu");
});

test("Kan Bankasi: nexus bedeli kaldiramiyorsa kopya o dalga odenmiyor ve bonus islemiyor", () => {
  const { room, client } = oda("warrior");
  const a = kur(room, client, "warrior-1");
  const b = kur(room, client, "warrior-4");
  assert.ok(esyaTak(room, client, a, "kan-bankasi"));
  assert.ok(esyaTak(room, client, b, "kan-bankasi"));
  room.teamHealth = BLOOD_BANK_NEXUS_COST + 2;
  dalgayiBaslat(room);
  // Ilk kopya odedi (7 -> 2); ikincisi nexusu oldurecekti, odenmedi.
  assert.equal(room.teamHealth, 2);
  near(room.getTowerHitDamageAdd(a), 0.2, "odeyen kopya");
  near(room.getTowerHitDamageAdd(b), 0, "odemeyen kopya bonus verdi");
  // Hazirlikta onizleme bonusu gosteriyor; sonraki dalga ikisi de odeyemiyor.
  room.wave += 1;
  room.setupPhase = true;
  near(room.getTowerHitDamageAdd(b), 0.2, "hazirlikta bonus");
  dalgayiBaslat(room);
  assert.equal(room.teamHealth, 2, "nexus olduruldu");
  near(room.getTowerHitDamageAdd(a), 0, "a odemeden bonus aldi");
  near(room.getTowerHitDamageAdd(b), 0, "b odemeden bonus aldi");
});

test("Kan Bankasi: dalga ortasinda takilan kopya bu dalganin bedelini hemen oduyor", () => {
  const { room, client, player } = oda("warrior");
  const a = kur(room, client, "warrior-1");
  room.teamHealth = 50;
  room.setupPhase = false;
  player.inventoryItemIds.push("kan-bankasi");
  room.equipShopItem(client, { itemId: "kan-bankasi", towerId: a.id });
  assert.equal(room.teamHealth, 50 - BLOOD_BANK_NEXUS_COST);
  near(room.getTowerHitDamageAdd(a), 0.2, "bonus");
});

test("Kan Bankasi metni kopya basina bedeli ve dusuk nexus kuralini soyluyor", () => {
  const text = item("kan-bankasi").description;
  assert.match(text, /her Kan Bankası için 5 nexus/);
  assert.match(text, /5 ya da altındaysa bedel alınmaz ve o dalga bonus işlemez/);
});

// ------------------------------------------------------------ 5. Nexus Kalkani

test("Nexus Kalkani: kullanilmayan haklar dalga sonunda siliniyor", () => {
  const { room, client, player } = oda("warrior");
  kur(room, client, "warrior-1");
  room.setupPhase = true;
  player.shopOffers = [item("nexus-kalkani")];
  room.buyShopItem(client, { itemId: "nexus-kalkani" });
  assert.equal(player.nexusShieldCharges, 3);
  const wave = room.wave;
  dalgayiKapat(room);
  assert.equal(room.wave, wave + 1, "dalga kapanmadi");
  assert.equal(player.nexusShieldCharges, 0, "haklar sonraki dalgaya tasindi");
});

// ------------------------------------------------------------ 6. Durum etkisi gucu yavaslatmada

function vurusYavaslatmasi(room, tower, enemy) {
  return sabitSaat((now) => {
    room.applyConfiguredTowerStatus(tower, enemy, "slow", now);
    return room.getEnemySlowSpeedMultiplier(enemy, now);
  });
}

test("Buz Cekirdegi ve Agir Metabolizma Izolasyon'un vurus yavaslatmasini olcekliyor", () => {
  const level1 = getIsolationSlowFraction(1);
  for (const [itemId, multiplier] of [[undefined, 1], ["buz-cekirdegi", 1.4], ["yanki-odasi", 1.25], ["agir-metabolizma", 0.75]]) {
    const { room, client } = oda("warrior");
    const tower = kur(room, client, "warrior-3");
    if (itemId) assert.ok(esyaTak(room, client, tower, itemId), itemId);
    const enemy = dusman(room, tower);
    near(vurusYavaslatmasi(room, tower, enemy), 1 - level1 * multiplier, itemId ?? "sade");
  }
});

test("Koni Yayici Kin yavaslatmasini olcekliyor; etki anahtari ayni (Kin kendisiyle yiginlanmiyor)", () => {
  const { room, client } = oda("zeynep");
  const tower = kur(room, client, "zeynep-6");
  assert.ok(esyaTak(room, client, tower, "koni-yayici"));
  const enemy = dusman(room, tower);
  const range = 100;
  const speed = sabitSaat((now) => {
    room.applyKinSlow(enemy, tower, range, range, 1150);
    room.applyKinSlow(enemy, tower, range, range, 1150);
    return room.getEnemySlowSpeedMultiplier(enemy, now);
  });
  near(speed, 1 - KIN_SLOW_FAR_FRACTION * 1.45, "menzil ucunda");
});

test("olceklenmis yavaslatma tavanli: dusman durmuyor", () => {
  near(scaleSlowFraction(0.5, 10), 0.9, "tavan");
  near(scaleSlowFraction(0.1, 0), 0, "sifir guc");
  const { room, client } = oda("warrior");
  const tower = kur(room, client, "warrior-3");
  tower.runModifiers.push({ source: "test", scope: "tower", stat: "statusMagnitude", add: 20 });
  room.invalidateTowerGrants();
  const enemy = dusman(room, tower);
  near(vurusYavaslatmasi(room, tower, enemy), 0.1, "taban 0,1");
});

function auraHazirla(room, tower) {
  Object.assign(tower, { auraExpiresAt: Date.now() + 60_000, wakeReadyAt: 0, offlineUntil: 0, standby: false, energy: tower.maxEnergy ?? 100 });
}

test("Izolasyon aurasi: guc kesri olcekliyor, sure esyasi auradan cikinca kalan bir iz veriyor", () => {
  const level1 = getIsolationSlowFraction(1);
  const { room, client } = oda("warrior");
  const tower = kur(room, client, "warrior-3");
  assert.ok(esyaTak(room, client, tower, "buz-cekirdegi"));
  assert.ok(esyaTak(room, client, tower, "uzun-fitil"));
  auraHazirla(room, tower);
  const enemy = dusman(room, tower, { x: tower.x, y: tower.y });
  sabitSaat((now) => {
    room.resetAuraSlows();
    room.applyTowerEnemyAuras(tower);
    near(enemy.auraSlowMultiplier, 1 - level1 * 1.4, "aura gucu");
    const floor = enemy.slowSpeedFloors?.[`${tower.id}:aura`];
    assert.ok(floor, "aura izi yazilmadi");
    near(floor.expiresAt - now, getAuraSlowLingerMs(1.35) / GAME_SPEED_MULTIPLIER, "iz suresi", 1e-3);
    near(floor.speedMultiplier, 1 - level1 * 1.4, "iz gucu");
    // Dusman auradan cikti: aura bitti, iz suruyor; ayni etki oldugu icin carpilmiyor.
    enemy.x += 10_000;
    room.resetAuraSlows();
    room.applyTowerEnemyAuras(tower);
    near(room.getEnemySlowSpeedMultiplier(enemy, now + 1), 1 - level1 * 1.4, "iz");
    assert.equal(room.getEnemySlowSpeedMultiplier(enemy, now + getAuraSlowLingerMs(1.35) / GAME_SPEED_MULTIPLIER + 1), 1, "iz bitmedi");
  });
  // Sure esyasi yoksa iz de yok.
  const sade = oda("warrior");
  const sadeKule = kur(sade.room, sade.client, "warrior-3");
  auraHazirla(sade.room, sadeKule);
  const sadeDusman = dusman(sade.room, sadeKule, { x: sadeKule.x, y: sadeKule.y });
  sade.room.applyTowerEnemyAuras(sadeKule);
  assert.equal(sadeDusman.slowSpeedFloors?.[`${sadeKule.id}:aura`], undefined);
});

// ------------------------------------------------------------ 7. Sure esyalari: isaret, yanma

test("Uzun Fitil Takipci isaretini uzatiyor", () => {
  const sure = (itemId) => {
    const { room, client } = oda("warrior");
    const tower = kur(room, client, "warrior-1");
    if (itemId) assert.ok(esyaTak(room, client, tower, itemId));
    const enemy = dusman(room, tower);
    return sabitSaat((now) => {
      room.towerCriticalRandom = () => 1;
      room.damageEnemy(enemy, 1, 0, "warrior-1", "p1", "physical", 0, tower.level, tower.id);
      return { iz: enemy.trackingStackUntil[0] - now, isaret: (enemy.statusEffects.mark?.expiresAt ?? now) - now };
    });
  };
  const sade = sure();
  const fitilli = sure("uzun-fitil");
  assert.ok(sade.iz > 0, "isaret yazilmadi");
  near(fitilli.iz / sade.iz, 1.35, "takip yigini", 1e-3);
  if (sade.isaret > 0) near(fitilli.isaret / sade.isaret, 1.35, "isaret durumu", 1e-3);
});

test("Termal Funye yanmasi sure ve guc carpanlarini aliyor", () => {
  const yanma = (items) => {
    const { room, client } = oda("warrior");
    const tower = kur(room, client, "warrior-5");
    for (const itemId of items) assert.ok(esyaTak(room, client, tower, itemId), itemId);
    const enemy = dusman(room, tower);
    return sabitSaat((now) => {
      room.towerCriticalRandom = () => 1;
      room.damageEnemy(enemy, 1, 0, "warrior-5", "p1", "fire", 0, tower.level, tower.id);
      const burn = enemy.statusEffects.burn;
      assert.ok(burn, "yanma yazilmadi");
      return { sure: burn.expiresAt - now, guc: burn.magnitude };
    });
  };
  const sade = yanma(["termal-funye"]);
  near(sade.guc, 0.015, "taban guc");
  const fitilli = yanma(["termal-funye", "uzun-fitil"]);
  near(fitilli.sure / sade.sure, 1.35, "sure", 1e-3);
  const metabolik = yanma(["termal-funye", "agir-metabolizma"]);
  near(metabolik.sure / sade.sure, 1.7, "sure", 1e-3);
  near(metabolik.guc, 0.015 * 0.75, "guc");
});

// ------------------------------------------------------------ 8. Ucaksavar Kiti

test("Ucaksavar Kiti: havayi vurmayan kuleye hava atisi ve -%50, vuran kuleye +%50", () => {
  const kit = item("ucaksavar-kiti");
  near(getModifierAdd(getShopItemTowerEffects(kit, kule("warrior-5")), "airDamage"), -0.5, "lazer");
  near(getModifierAdd(getShopItemTowerEffects(kit, kule("warrior-1")), "airDamage"), 0.5, "takipci");
  const { room, client } = oda("warrior");
  const lazer = kur(room, client, "warrior-5");
  const takipci = kur(room, client, "warrior-1");
  assert.ok(esyaTak(room, client, lazer, "ucaksavar-kiti"));
  assert.ok(esyaTak(room, client, takipci, "ucaksavar-kiti"));
  near(getModifierAdd(room.getTowerRunModifiers(lazer), "airDamage"), -0.5, "lazer kulede");
  near(getModifierAdd(room.getTowerRunModifiers(takipci), "airDamage"), 0.5, "takipci kulede");
  const ucan = { movementKind: "air", dominatedUntil: 0, melisUndeadUntil: 0, melisWhisperTurnedUntil: 0 };
  assert.equal(room.canTowerTargetEnemy(lazer, ucan), true, "lazer havayi vurmuyor");
  assert.match(kit.description, /zaten vuruyorsa hava hasarı \+%50/);
});

// ------------------------------------------------------------ 9. Altin

test("S kademesindeki altin esyalari yariya indi; fiyatlar ayni; Temiz Sicil karti ayni", () => {
  const table = [
    ["ganimet-kesesi", "goldGain", 0.8, 110],
    ["altin-elek", "goldGain", 0.48, 85],
    ["artik-enerji-toplayici", "overkillGold", 0.1, 70],
    ["savas-tazminati", "damageGold", 20, 90],
    ["odul-fermani", "championGold", 300, 120],
    ["darphane-modulu", "waveIncome", 80, 80]
  ];
  for (const [id, stat, value, price] of table) {
    near(getModifierAdd(item(id).effects, stat), value, id);
    assert.equal(item(id).price, price, `${id} fiyati`);
  }
  assert.equal(INSURANCE_CLEAN_WAVE_GOLD, 180);
  assert.equal(CLEAN_WAVE_GOLD, 360, "Temiz Sicil karti degismemeli");
  assert.equal(item("sigorta-policesi").price, 120);
  assert.equal(item("sigorta-policesi").description, "Sızıntısız biten her dalga sonunda +180 altın.");
  assert.equal(item("ganimet-kesesi").description, "Düşman altını +%80.");
  assert.ok(item("altin-elek").description.startsWith("Düşman altını +%48;"));
});
