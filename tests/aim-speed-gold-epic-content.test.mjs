/**
 * Donus hizi, isabet, mermi hizi ve altin: ucuncu tur kartlar, esyalar ve
 * Epik cevrim kartlari.
 *
 * Testler bes seyi tutuyor:
 *
 *   1. Metin ile etki ayni cumle: aciklamadaki her sayi bir efekte, kilidin
 *      sabitine, vadeli altinin alanina ya da cevrimin oranina karsilik geliyor.
 *   2. Kapsam butun kule katalogunda: donus hizi nisan alan kuleye, isabet
 *      nisan alan mermi/carpma kulesine, mermi hizi bir sey firlatan kuleye.
 *   3. Yigin ve vitrin sinirlari; Epik nadirligin cekilis agirligi ve cizimi.
 *   4. Sunucu sonucu gercekten degisiyor: namlunun donusu, ates konisi, mermi
 *      hizi, atis araligi, hasar, menzil, oyuncunun altini. Kritik zari
 *      `towerCriticalRandom` ile, cekilis zari tohumlu bir uretecle sabit.
 *   5. Altin co-op'ta oyuncu basina: kimse takim arkadasinin kartindan almiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CARD_RARITY_WEIGHT,
  CLEAN_WAVE_GOLD,
  COLD_ACCURACY_BONUS,
  COLD_ACCURACY_TEMPERATURE,
  CRIT_KILL_GOLD,
  CRIT_KILL_GOLD_WAVE_CAP,
  FAST_TARGET_TURN_RATE,
  FINAL_WAVE,
  GLOBAL_SHOP_ITEM_IDS,
  TOWER_TURN_RATE_RADIANS_PER_SECOND,
  canEquipShopItem,
  cardAppliesToTower,
  cardCatalog,
  cardReachesTower,
  drawCards,
  getCardRarity,
  getCardTowerReach,
  getModifierAdd,
  getShopItem,
  getShopItemLastOfferWave,
  getShopItemPrice,
  getStatConversionAdd,
  getWaveCompletionGold,
  isShopItemAlreadyUnlocked,
  isShopItemAvailable,
  shopCatalog,
  shopItemAppliesToTower,
  towerAims,
  towerCatalog,
  towerDealsDamage,
  towerFiresAlongFacing,
  towerFiresProjectiles,
  getOwnedItemUnlocks,
  isCardUnlockAlreadyOwned,
  isConversionCardReady
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const allTowers = Object.values(towerCatalog).flat();
const kule = (id) => allTowers.find((tower) => tower.id === id);
const card = (id) => {
  const found = cardCatalog.find((entry) => entry.id === id);
  assert.ok(found, `${id} katalogda yok`);
  return found;
};
const item = (id) => {
  const found = getShopItem(id);
  assert.ok(found, `${id} katalogda yok`);
  return found;
};
const near = (actual, expected, label = "") => assert.ok(Math.abs(actual - expected) < 1e-6, `${label} ${actual} != ${expected}`);

const THEMES = {
  turn: { items: ["bilyali-yatak", "hafif-taret-kabugu", "taret-motoru", "hareket-ongorucu"], cards: ["servo-takviyesi", "ongorulu-takip"], epic: "tork-aktarimi" },
  accuracy: { items: ["gez-arpacik", "lazer-telemetre", "termal-kilif", "hassas-namlu"], cards: ["titresim-sonumleyici", "isil-kalibrasyon"], epic: "balistik-hesaplayici" },
  speed: { items: ["sabot-fisegi", "manyetik-ray", "genlesme-odasi", "hafif-cekirdek"], cards: ["basincli-hazne", "hizlandirici-bobin"], epic: "kinetik-erim" },
  gold: { items: ["altin-elek", "sigorta-policesi", "darphane-modulu", "kelle-defteri", "vadeli-mevduat"], cards: ["parali-asker", "muharebe-odenegi", "temiz-sicil", "kelle-parasi"], epic: "savas-hazinesi" }
};
const NEW_CARD_IDS = Object.values(THEMES).flatMap((theme) => [...theme.cards, theme.epic]);
const NEW_ITEM_IDS = Object.values(THEMES).flatMap((theme) => theme.items);
const EPIC_IDS = Object.values(THEMES).map((theme) => theme.epic);

// ------------------------------------------------------------------ Kurulum

function oda(characterId = "warrior") {
  const room = createRoom(characterId);
  room.broadcast = () => {};
  room.clients = [client];
  room.setupPhase = false;
  const player = room.state.players.get("p1");
  Object.assign(player, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0 });
  return room;
}

/** Ikinci oyuncu: ayni sablon, kendi listeleri. */
function ikinciOyuncu(room, id = "p2") {
  const first = room.state.players.get("p1");
  const player = { ...first, id, slot: 1, gold: first.gold, runModifiers: [], ownedCardIds: [], ownedShopItemIds: [], inventoryItemIds: [], goldDeposits: [], critKillGold: { wave: 0, earned: 0 } };
  room.state.players.set(id, player);
  return player;
}

function kur(room, definitionId, owner = client) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer yok`);
  room.placeTower(owner, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower.definition.id, definitionId);
  return tower;
}

/** Karti gercek secim yolundan verir: kilit, modifier ve cevrim ancak oradan geliyor. */
function kartAl(room, cardId, towerId, owner = client) {
  room.pendingCardChoices = new Map([[owner.sessionId, [card(cardId)]]]);
  room.chooseCard(owner, { cardId, towerId });
}

/** Esyayi satin alinmis sayar ve kuleye takar; takildi mi doner. */
function esyaTak(room, tower, itemId) {
  const player = room.state.players.get("p1");
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
  const before = tower.equippedShopItemIds.length;
  room.equipShopItem(client, { itemId, towerId: tower.id });
  return tower.equippedShopItemIds.length === before + 1;
}

/** Kuresel esyayi gercek magaza yolundan alir. */
function satinAl(room, itemId, owner = client) {
  const player = room.state.players.get(owner.sessionId);
  const wasSetup = room.setupPhase;
  room.setupPhase = true;
  player.shopOffers = [item(itemId)];
  const before = player.ownedShopItemIds.length;
  room.buyShopItem(owner, { itemId });
  room.setupPhase = wasSetup;
  return player.ownedShopItemIds.length === before + 1;
}

/** Dirensiz, kalkansiz, zirhsiz ve olmeyecek kadar canli bir dusman. */
function dusman(room, tower, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    x: tower.x + 8, y: tower.y, hp: 1_000_000, maxHp: 1_000_000, shield: 0, maxShield: 0, armor: 0,
    damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, ...overrides
  });
  return enemy;
}

/** Namlu 0 radyanda; hedef verilen acida. `saniye` kadar doner. */
function nisanAl(room, tower, aciRadyan, saniye) {
  tower.facing = 0;
  const hedef = { x: tower.x + 100 * Math.cos(aciRadyan), y: tower.y + 100 * Math.sin(aciRadyan) };
  const hizali = room.aimTowerAt(tower, hedef, saniye);
  return { hizali, donus: tower.facing };
}
const derece = (value) => value * Math.PI / 180;
const donus = (room, tower) => nisanAl(room, tower, Math.PI / 2, 0.1).donus;
/** Koni bu acida hedefe ates eder mi (namlu 0'da, donmeden). */
const koniIcinde = (room, tower, aci) => nisanAl(room, tower, derece(aci), 0).hizali;

/** Ateslenen merminin (ya da Kin dalgasinin) hizi. */
function mermiHizi(room, tower) {
  const enemy = dusman(room, tower);
  const projectiles = new Set(room.projectiles.keys());
  const waves = new Set(room.kinWaves.keys());
  room.spawnTowerProjectile(tower, enemy);
  const projectile = [...room.projectiles.values()].find((entry) => !projectiles.has(entry.id));
  if (projectile) return Math.hypot(projectile.vx, projectile.vy);
  const wave = [...room.kinWaves.values()].find((entry) => !waves.has(entry.id));
  return wave ? wave.speed : 0;
}

const testMod = (stat, add) => ({ source: "test:seviye", scope: "tower", stat, add });

/** Odanin kendi kapanis yolu: dusman bitti, 2 sn'lik mola sahte saatle geciyor. */
function dalgayiKapat(room) {
  room.setupPhase = false;
  room.pendingCardChoices.clear();
  room.enemies.clear();
  room.waveSpawned = room.waveTarget;
  room.waveClearedAt = 0;
  const gercekNow = Date.now;
  let simdi = gercekNow();
  Date.now = () => simdi;
  try {
    room.updateSpawning(16);
    simdi += 3000;
    room.updateSpawning(16);
  } finally {
    Date.now = gercekNow;
  }
}

/** Bir dusmani kacis dalindan nexus'a sokar (sizinti). */
function sizdir(room) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { type: "grunt", movementKind: "ground" });
  enemy.y = room.getArenaBottom() + room.getMapCellRadius() + 1;
  room.updateEnemies(0.016);
}

// ------------------------------------------------------- 1. Katalog ve metin

test("istenen sayilar: her eksende 4 esya 2 kart, altinda 5 esya 4 kart, eksen basina bir epik", () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const expected = name === "gold" ? [5, 4] : [4, 2];
    assert.equal(theme.items.length, expected[0], name);
    assert.equal(theme.cards.length, expected[1], name);
    for (const id of theme.items) item(id);
    for (const id of theme.cards) assert.notEqual(getCardRarity(card(id)), "epic", id);
    assert.equal(getCardRarity(card(theme.epic)), "epic", theme.epic);
  }
  assert.equal(new Set([...NEW_CARD_IDS, ...NEW_ITEM_IDS]).size, 31);
  assert.equal(cardCatalog.filter((entry) => getCardRarity(entry) === "epic").length, 4, "baska epik yok");
  // Yeni adlar benzersiz: ne birbiriyle ne de eski icerikle cakisiyor.
  const fresh = [...NEW_CARD_IDS.map(card), ...NEW_ITEM_IDS.map(item)];
  const freshIds = new Set(fresh.map((entry) => entry.id));
  const oldNames = new Set([...cardCatalog, ...shopCatalog].filter((entry) => !freshIds.has(entry.id)).map((entry) => entry.name));
  assert.equal(new Set(fresh.map((entry) => entry.name)).size, fresh.length, "yeni adlar arasinda yineleme");
  for (const entry of fresh) assert.equal(oldNames.has(entry.name), false, `${entry.name} eski bir adla ayni`);
});

/** Statin aciklamadaki adi; ek (isabeti, isisi, cani) serbest. */
const STAT_LABEL = {
  turnRate: "dönüş hızı", accuracy: "isabet", fireRate: "atış hızı", heat: "ısı", range: "menzil",
  projectileSpeed: "mermi hızı", operatingEnergyCost: "çalışma enerjisi tüketimi", shotFuelCost: "yakıt tüketimi",
  towerHealth: "can", damage: "hasar", critDamage: "kritik hasarı", goldGain: "Düşman altın", experienceGain: "tecrübe kazancı"
};
const yuzde = (value) => String(Math.round(Math.abs(value) * 100));
const isaret = (value) => (value < 0 ? "-" : "\\+");

test("yeni icerigin her efekti aciklamada isaretiyle ve sayisiyla yaziyor", () => {
  for (const entry of [...NEW_CARD_IDS.map(card), ...NEW_ITEM_IDS.map(item)]) {
    for (const modifier of entry.effects) {
      if (modifier.stat === "waveIncome") {
        assert.ok(entry.description.includes(`+${modifier.add} altın`), `${entry.id}: ${entry.description}`);
        continue;
      }
      const label = STAT_LABEL[modifier.stat];
      assert.ok(label, `${entry.id}: ${modifier.stat} icin etiket yok`);
      const pattern = new RegExp(`${label}\\S*\\s${isaret(modifier.add)}%${yuzde(modifier.add)}(?!\\d)`, "i");
      assert.match(entry.description, pattern, `${entry.id}: "${entry.description}" ${modifier.stat} ${modifier.add} demiyor`);
    }
    // Isabet cezasi yok: eksi isabet koniyi genisletmiyor.
    assert.doesNotMatch(entry.description, /isabet\S*\s-%/i, entry.id);
  }
});

test("kilit veren yeni icerigin sayilari sunucunun sabitleriyle ayni", () => {
  const fast = `koşucu ve hava hedeflerine dönerken dönüş hızı +%${yuzde(FAST_TARGET_TURN_RATE)} kazanır`;
  for (const entry of [card("ongorulu-takip"), item("hareket-ongorucu")]) {
    assert.deepEqual(entry.unlocks, ["aim:fastTargets"]);
    assert.ok(entry.description.includes(fast), `${entry.id}: ${entry.description}`);
  }
  for (const entry of [card("isil-kalibrasyon"), item("termal-kilif")]) {
    assert.deepEqual(entry.unlocks, ["aim:coldAccuracy"]);
    assert.ok(entry.description.includes(`${COLD_ACCURACY_TEMPERATURE} derecenin altında`), entry.id);
    assert.match(entry.description, new RegExp(`isabeti \\+%${yuzde(COLD_ACCURACY_BONUS)}[;.]`), entry.id);
  }
  for (const entry of [card("temiz-sicil"), item("sigorta-policesi")]) {
    assert.deepEqual(entry.unlocks, ["gold:cleanWave"]);
    assert.equal(entry.description, `Sızıntısız biten her dalga sonunda +${CLEAN_WAVE_GOLD} altın.`);
  }
  for (const entry of [card("kelle-parasi"), item("kelle-defteri")]) {
    assert.deepEqual(entry.unlocks, ["gold:critKill"]);
    assert.ok(entry.description.includes(`her düşman +${CRIT_KILL_GOLD} altın verir; dalga başına en fazla ${CRIT_KILL_GOLD_WAVE_CAP} altın.`), entry.id);
  }
  const deposit = item("vadeli-mevduat");
  assert.ok(deposit.description.includes(`${deposit.deposit.waves} dalga tamamlanınca ${deposit.deposit.payout} altın öder`));
  assert.ok(deposit.description.includes(`en fazla ${deposit.maxStacks} kez`));
  assert.ok(deposit.description.includes(`${getShopItemLastOfferWave(deposit)}. dalgadan sonra çıkmaz`));
});

const CONVERSION_SOURCE = { turnRate: "dönüş hızı bonusunun", accuracy: "isabet bonusunun", projectileSpeed: "mermi hızı bonusunun", goldGain: "Düşman altını bonusunun" };
const CONVERSION_TARGET = { fireRate: "atış hızına", damage: "hasar", range: "menzile" };

test("epik aciklamalari cevrim kuralini ve tavanini sayilarla soyluyor", () => {
  for (const id of EPIC_IDS) {
    const entry = card(id);
    assert.equal(entry.conversions.length, 1, id);
    assert.deepEqual(entry.effects, [], `${id}: cevrim disinda duz etki yok`);
    assert.equal(entry.stackable, false, id);
    const [conversion] = entry.conversions;
    const threshold = conversion.threshold ? `%${yuzde(conversion.threshold)}'ü aşan ` : "";
    assert.ok(entry.description.includes(`${threshold}${CONVERSION_SOURCE[conversion.from]} her %10'u`), `${id}: ${entry.description}`);
    assert.ok(entry.description.includes(CONVERSION_TARGET[conversion.to]), id);
    assert.ok(entry.description.endsWith(`+%${Math.round(conversion.ratio * 10)} ekler; en fazla +%${yuzde(conversion.cap)}.`), `${id}: ${entry.description}`);
  }
});

test("cevrimler zincirlenmiyor ve kule cozumlemesinin statlarina yazmiyor", () => {
  const conversions = cardCatalog.flatMap((entry) => entry.conversions ?? []);
  const sources = new Set(conversions.map((conversion) => conversion.from));
  // collectTowerGrants bu dort stati cevrimsiz listeden okuyor.
  const resolvedInGrantState = new Set(["repairCost", "sellRefund", "statusMagnitude", "statusDuration"]);
  for (const conversion of conversions) {
    assert.equal(sources.has(conversion.to), false, `${conversion.to} hem kaynak hem hedef`);
    assert.equal(resolvedInGrantState.has(conversion.to), false, conversion.to);
    assert.ok(conversion.cap > 0 && conversion.ratio > 0);
  }
});

test("cevrim formulu: esik, oran ve tavan; eksi kaynak hicbir sey vermiyor", () => {
  const tork = card("tork-aktarimi").conversions[0];
  near(getStatConversionAdd(tork, 0), 0);
  near(getStatConversionAdd(tork, -0.4), 0);
  near(getStatConversionAdd(tork, 0.5), 0.1);
  near(getStatConversionAdd(tork, 1), 0.2);
  near(getStatConversionAdd(tork, 1.5), 0.3);
  near(getStatConversionAdd(tork, 4), 0.3);
  const balistik = card("balistik-hesaplayici").conversions[0];
  near(getStatConversionAdd(balistik, 0.95), 0);
  near(getStatConversionAdd(balistik, 1), 0);
  near(getStatConversionAdd(balistik, 1.2), 0.2);
  near(getStatConversionAdd(balistik, 1.5), 0.5);
  near(getStatConversionAdd(balistik, 3), 0.5);
});

// ------------------------------------------------------------- 2. Kapsam

test("mermi atan kuleler: sunucunun mermi hizini okudugu atis yollari", () => {
  const expectedTrue = ["zeynep-1", "zeynep-3", "zeynep-6", "warrior-1", "warrior-2", "warrior-4", "warrior-6", "archer-1", "archer-2", "archer-5", "archer-6", "onur-2"];
  const expectedFalse = ["zeynep-2", "zeynep-7", "zeynep-8", "warrior-3", "warrior-5", "archer-3", "archer-4", "onur-1", "wall-1", "repair-depot-1", "warrior-7", "warrior-8", "zeynep-9", "archer-7"];
  for (const id of expectedTrue) assert.equal(towerFiresProjectiles(kule(id)), true, id);
  for (const id of expectedFalse) assert.equal(towerFiresProjectiles(kule(id)), false, id);
});

const scopeExpectation = {
  turn: (tower) => towerAims(tower.id) && !tower.resourceProvider,
  accuracy: (tower) => towerFiresAlongFacing(tower) && !tower.resourceProvider,
  speed: (tower) => towerFiresProjectiles(tower)
};

test("donus, isabet ve mermi hizi icerigi butun katalogda yalnizca statin is gordugu kuleye uyuyor", () => {
  for (const [theme, expected] of Object.entries(scopeExpectation)) {
    const { items, cards, epic } = THEMES[theme];
    let reached = 0;
    for (const tower of allTowers) {
      const want = expected(tower);
      if (want) reached += 1;
      for (const id of [...cards, epic]) assert.equal(cardAppliesToTower(card(id), tower), want, `${id} / ${tower.id}`);
      for (const id of items) {
        assert.equal(shopItemAppliesToTower(item(id), tower), want, `${id} / ${tower.id}`);
        assert.equal(canEquipShopItem(item(id), tower, []).ok, want, `${id} takma / ${tower.id}`);
      }
    }
    assert.ok(reached >= 8, `${theme}: yalnizca ${reached} kule`);
  }
});

test("hasar veren kule: duvar, onarim ussu ve hasarsiz auralar disarida; tanimda 0 hasar yazan vurucular icerde", () => {
  for (const id of ["wall-1", "repair-depot-1", "zeynep-7", "zeynep-8", "warrior-3", "warrior-7"]) assert.equal(towerDealsDamage(kule(id)), false, id);
  for (const id of ["warrior-2", "zeynep-6", "archer-4", "warrior-1", "warrior-5", "archer-3", "onur-1"]) assert.equal(towerDealsDamage(kule(id)), true, id);
  // Kritik ve oldurme esyalari bu kurala bagli; hicbiri olu kalmiyor.
  const combatItems = shopCatalog.filter((entry) => entry.scope.kind === "tagged" && entry.scope.combat);
  assert.ok(combatItems.length >= 20, `yalnizca ${combatItems.length}`);
  for (const entry of combatItems) {
    for (const tower of allTowers) assert.equal(shopItemAppliesToTower(entry, tower), towerDealsDamage(tower), `${entry.id} / ${tower.id}`);
  }
  assert.equal(canEquipShopItem(item("kelle-defteri"), kule("wall-1"), []).ok, false);
  assert.equal(canEquipShopItem(item("kelle-defteri"), kule("zeynep-7"), []).ok, false);
});

test("altin icerigi: kuresel esyalar oyuncuya, Darphane ekonomi binasina, Kelle Defteri savas kulesine", () => {
  for (const id of ["altin-elek", "sigorta-policesi", "vadeli-mevduat"]) {
    assert.ok(GLOBAL_SHOP_ITEM_IDS.includes(id), id);
    assert.equal(item(id).target, "global", id);
    assert.equal(item(id).effects.every((modifier) => modifier.scope === "player"), true, id);
  }
  for (const id of ["darphane-modulu", "kelle-defteri"]) assert.equal(item(id).target, "tower", id);
  for (const id of THEMES.gold.cards) assert.equal(card(id).scope.kind, "global", id);
  for (const tower of allTowers) {
    const economy = (tower.axes ?? []).includes("economy");
    assert.equal(canEquipShopItem(item("darphane-modulu"), tower, []).ok, economy, `darphane / ${tower.id}`);
  }
  assert.equal(canEquipShopItem(item("darphane-modulu"), kule("warrior-7"), []).ok, true, "Cephane Merkezi");
  assert.equal(canEquipShopItem(item("kelle-defteri"), kule("warrior-4"), []).ok, true);
  assert.equal(canEquipShopItem(item("kelle-defteri"), kule("warrior-7"), []).ok, false, "kaynak binasi oldurmuyor");
  assert.ok(item("darphane-modulu").description.startsWith("Takıldığı bina dalga sonunda ayaktaysa +20 altın verir;"));
});

test("secim ekrani: altin kartlari 'Genel', nisan kartlari yalnizca nisan alan kuleye sayiliyor", () => {
  for (const id of ["parali-asker", "muharebe-odenegi", "temiz-sicil", "kelle-parasi"]) assert.equal(getCardTowerReach(card(id)), "none", id);
  for (const id of EPIC_IDS) assert.equal(getCardTowerReach(card(id)), "combat", id);
  assert.equal(cardReachesTower(card("tork-aktarimi"), kule("warrior-2")), false);
  assert.equal(cardReachesTower(card("tork-aktarimi"), kule("warrior-1")), true);
  assert.equal(cardReachesTower(card("kinetik-erim"), kule("warrior-5")), false, "isin kulesi");
  assert.equal(cardReachesTower(card("savas-hazinesi"), kule("warrior-5")), true);
});

// ------------------------------------------------------------- 3. Yigin ve cekilis

test("yeni kartlarin nadirligi ve yigin siniri cekiliste tutuyor", () => {
  const expected = {
    "servo-takviyesi": ["common", 2], "titresim-sonumleyici": ["common", 2], "basincli-hazne": ["common", 2], "muharebe-odenegi": ["common", 1],
    "ongorulu-takip": ["uncommon", 1], "isil-kalibrasyon": ["uncommon", 1], "hizlandirici-bobin": ["uncommon", 1],
    "parali-asker": ["uncommon", 1], "temiz-sicil": ["uncommon", 1], "kelle-parasi": ["uncommon", 1],
    "tork-aktarimi": ["epic", 1], "balistik-hesaplayici": ["epic", 1], "kinetik-erim": ["epic", 1], "savas-hazinesi": ["epic", 1]
  };
  assert.deepEqual(Object.keys(expected).sort(), [...NEW_CARD_IDS].sort());
  for (const [id, [rarity, maxStacks]] of Object.entries(expected)) {
    const entry = card(id);
    assert.equal(getCardRarity(entry), rarity, id);
    assert.equal(entry.stackable ? entry.maxStacks : 1, maxStacks, id);
    const owned = Array.from({ length: maxStacks }, () => id);
    const draws = drawCards({ count: 200, preferredAxes: ["dps"], towers: allTowers, ownedCardIds: owned, random: () => 0 });
    assert.equal(draws.some((draw) => draw.id === id), false, `${id} sinirdan sonra yine cekildi`);
    if (maxStacks > 1) {
      const again = drawCards({ count: 200, preferredAxes: ["dps"], towers: allTowers, ownedCardIds: [id], random: () => 0 });
      assert.equal(again.some((draw) => draw.id === id), true, `${id} ikinci kez alinamiyor`);
    }
  }
});

test("yeni esyalar: tekrar sayisi, fiyat buyumesi ve kategori", () => {
  const expected = {
    "bilyali-yatak": [4, 40, "class"], "gez-arpacik": [4, 35, "class"], "sabot-fisegi": [4, 40, "class"],
    "hafif-taret-kabugu": [1, 80, "class"], "taret-motoru": [1, 110, "class"], "hareket-ongorucu": [1, 75, "class"],
    "lazer-telemetre": [1, 110, "class"], "termal-kilif": [1, 70, "class"], "hassas-namlu": [1, 105, "class"],
    "manyetik-ray": [1, 90, "class"], "genlesme-odasi": [1, 105, "class"], "hafif-cekirdek": [1, 85, "class"],
    "altin-elek": [3, 85, "utility"], "sigorta-policesi": [1, 120, "utility"], "darphane-modulu": [3, 80, "utility"],
    "kelle-defteri": [1, 70, "utility"], "vadeli-mevduat": [2, 150, "utility"]
  };
  assert.deepEqual(Object.keys(expected).sort(), [...NEW_ITEM_IDS].sort());
  for (const [id, [maxStacks, price, category]] of Object.entries(expected)) {
    const entry = item(id);
    assert.equal(entry.price, price, id);
    assert.equal(entry.category, category, id);
    assert.equal(entry.repeatable ? entry.maxStacks : 1, maxStacks, id);
    const owned = Array.from({ length: maxStacks }, () => id);
    assert.equal(isShopItemAvailable(entry, 5, owned.slice(0, -1)), true, `${id} sinirdan once`);
    assert.equal(isShopItemAvailable(entry, 5, owned), false, `${id} sinirdan sonra satiliyor`);
    if (maxStacks > 1 && id !== "vadeli-mevduat") assert.ok(getShopItemPrice(entry, [id]) > price, `${id} fiyati buyumuyor`);
  }
  // Mevduatin fiyati sabit: ikinci alim ayni getiriyi ayni bedelle veriyor.
  assert.equal(getShopItemPrice(item("vadeli-mevduat"), ["vadeli-mevduat"]), 150);
});

test("vadeli mevduat geri odemeye yetismeyecegi dalgadan sonra vitrine cikmiyor", () => {
  const deposit = item("vadeli-mevduat");
  const last = FINAL_WAVE - deposit.deposit.waves;
  assert.equal(getShopItemLastOfferWave(deposit), last);
  assert.equal(isShopItemAvailable(deposit, last, []), true);
  assert.equal(isShopItemAvailable(deposit, last + 1, []), false);
  // Sinirsiz esyalar etkilenmiyor.
  assert.equal(getShopItemLastOfferWave(item("altin-elek")), undefined);
  assert.equal(isShopItemAvailable(item("altin-elek"), FINAL_WAVE, []), true);
});

test("epik cekilis agirligi nadirin yarisi: tohumlu cekiliste gercekten seyrek", () => {
  assert.ok(CARD_RARITY_WEIGHT.epic < CARD_RARITY_WEIGHT.rare);
  let state = 11;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  // Ikisi de kuresel ve ekonomi ekseninde: fark yalnizca nadirlikten.
  const rare = card("genis-arama");
  assert.equal(getCardRarity(rare), "rare");
  let epicCount = 0;
  let rareCount = 0;
  for (let index = 0; index < 80_000; index += 1) {
    const [drawn] = drawCards({ count: 1, preferredAxes: ["economy"], towers: [kule("warrior-1")], ownedCardIds: [], random });
    if (drawn.id === "savas-hazinesi") epicCount += 1;
    if (drawn.id === rare.id) rareCount += 1;
  }
  assert.ok(rareCount > 200, `ornek kucuk: ${rareCount}`);
  const ratio = epicCount / rareCount;
  assert.ok(ratio > 0.38 && ratio < 0.64, `epik/nadir orani ${ratio.toFixed(2)}, beklenen ~0,5`);
  // Epik tek kopya: sahipken bir daha cekilmiyor.
  const owned = drawCards({ count: 200, preferredAxes: ["economy"], towers: allTowers, ownedCardIds: ["savas-hazinesi"], random: () => 0 });
  assert.equal(owned.some((entry) => entry.id === "savas-hazinesi"), false);
});

test("istemci epigi kart seciminde, Kart Arsivi'nde, destede ve raporda ayri ciziyor", async () => {
  const read = async (path) => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const css = await read("../apps/web/src/style.css");
  const block = (selector) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `${selector} yok`);
    return css.slice(start, css.indexOf("}", start));
  };
  for (const selector of [".run-card--epic", ".card-archive__group--epic", ".run-report__card--epic", ".owned-cards__card--epic"]) {
    const rule = block(selector);
    // Sert sci-fi koyu kirmizi: altin, eski mor, hareket yok; cift cizgi (ic hat).
    assert.equal(/fbbf24|fde68a|d946ef|f0abfc|e879f9|animation|gradient/.test(rule), false, `${selector} altin, mor ya da hareket tasiyor`);
    assert.ok(rule.includes("#b91c1c"), `${selector} koyu kirmizi degil`);
  }
  for (const selector of [".run-card--epic", ".card-archive__group--epic .card-archive__entry", ".run-report__card--epic", ".owned-cards__card--epic"]) {
    assert.match(block(selector), /inset 0 0 0 [234]px rgba\(185, 28, 28/, `${selector} cift cizgi degil`);
  }
  // Dis isik en fazla 6 px.
  for (const match of block(".run-card--epic").matchAll(/(?<!inset )0 0 (\d+)px rgba\(185, 28, 28/g)) {
    assert.ok(Number(match[1]) <= 6, `dis isik ${match[1]} px`);
  }
  const tag = block(".run-card--epic .run-card__rarity");
  assert.ok(tag.includes("background: #7f1d1d") && tag.includes("color: #fee2e2"), "etiket kirmizi zeminli acik yazi degil");
  // Tehlike kirmizisi (HUD) parlak ve tek cizgili; epik ondan ayri tonda.
  assert.equal(/#f87171|#dc2626|#ef4444/.test(block(".run-card--epic")), false);

  const codex = await read("../apps/web/src/codex.ts");
  assert.ok(codex.includes(`epic: "epik"`));
  const scene = await read("../apps/web/src/scenes/GameScene.ts");
  assert.ok(scene.includes("run-card run-card--${rarity}"), "nadirlik sinifi karttan");
  assert.ok(scene.includes(`rarity === "rare" ? " run-card--shine"`), "parilti yalnizca nadirde");
  assert.ok(scene.includes(`scope.projectiles ? "Mermi atan kuleler"`));
  const report = await read("../apps/web/src/run-report-ui.ts");
  assert.ok(report.includes(`["epic", "rare", "uncommon"]`));
  const controls = await read("../apps/web/src/game-control-ui.ts");
  assert.ok(controls.includes("owned-cards__card--epic"));
});

// ---------------------------------------------------- 4. Sunucu: donus hizi

test("Servo Takviyesi namluyu %60 hizli dondururken calisma enerjisini %20 artiriyor, nisan almayan kuleye dokunmuyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sunucu = kur(room, "warrior-2");
  const sade = donus(room, tower);
  near(sade, TOWER_TURN_RATE_RADIANS_PER_SECOND * 0.1, "taban donus");
  kartAl(room, "servo-takviyesi");
  near(donus(room, tower), sade * 1.6, "kartli donus");
  near(getModifierAdd(room.getTowerRunModifiers(tower), "operatingEnergyCost"), 0.2);
  assert.equal(getModifierAdd(room.getTowerRunModifiers(sunucu), "turnRate"), 0);
  assert.equal(getModifierAdd(room.getTowerRunModifiers(sunucu), "operatingEnergyCost"), 0, "ceza nisan almayana gitti");
  kartAl(room, "servo-takviyesi");
  near(donus(room, tower), sade * 2.2, "ikinci kopya");
});

for (const [ad, ver] of [
  ["Ongorulu Takip", (room) => kartAl(room, "ongorulu-takip")],
  ["Hareket Ongorucu", (room, tower) => assert.ok(esyaTak(room, tower, "hareket-ongorucu"))]
]) {
  test(`${ad} yalnizca kosucu ve hava hedefinde donus hizini +%100 yapiyor`, () => {
    const room = oda();
    const tower = kur(room, "warrior-1");
    ver(room, tower);
    // Namlu dusmanin kendisine donuyor (hedef secim kilidi bos): kosul
    // `aimTowerAt`'in kaydettigi gercek hedefe bakiyor.
    const hedefle = (overrides) => {
      const enemy = dusman(room, tower, { x: tower.x, y: tower.y + 100, ...overrides });
      tower.aimTargetId = "";
      tower.facing = 0;
      room.aimTowerAt(tower, enemy, 0.1);
      return tower.facing;
    };
    const sade = hedefle({ type: "grunt", movementKind: "ground" });
    near(sade, TOWER_TURN_RATE_RADIANS_PER_SECOND * 0.1, "piyadede hizlandi");
    near(hedefle({ type: "runner", movementKind: "ground" }), sade * (1 + FAST_TARGET_TURN_RATE), "kosucu");
    near(hedefle({ type: "grunt", movementKind: "air" }), sade * (1 + FAST_TARGET_TURN_RATE), "ucan");
    near(donus(room, tower), sade, "dusman olmayan nokta");
  });
}

test("Ongorulu Takip Oluler Bagi'nin baglandigi kosucuda da isliyor (gercek kule dongusu)", () => {
  const olc = (type) => {
    const room = oda("archer");
    const tower = kur(room, "archer-4");
    kartAl(room, "ongorulu-takip");
    tower.energy = tower.maxEnergy;
    tower.ammo = tower.maxAmmo;
    tower.cooldownMs = 0;
    tower.facing = 0;
    const enemy = dusman(room, tower, { x: tower.x, y: tower.y + 30, type, movementKind: "ground" });
    room.updateTowers(100);
    assert.ok(tower.melisUnderworldTargetIds.includes(enemy.id), "bag kurulmadi");
    assert.equal(tower.aimTargetId, "", "Oluler Bagi hedef kilidini yaziyor; test yolu degisti");
    assert.equal(tower.turnTargetId, enemy.id);
    return tower.facing;
  };
  const piyade = olc("grunt");
  assert.ok(piyade > 0, "namlu donmedi");
  near(olc("runner"), piyade * (1 + FAST_TARGET_TURN_RATE), "kosucuda hizlanmadi");
});

test("Bilyali Yatak dort kez takiliyor ve toplaniyor; Taret Motoru ve Hafif Taret Kabugu bedellerini ödüyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = donus(room, tower);
  for (let index = 0; index < 4; index += 1) assert.ok(esyaTak(room, tower, "bilyali-yatak"));
  near(donus(room, tower), sade * 1.8, "dort yatak");

  const motorlu = kur(room, "warrior-4");
  const motorsuz = donus(room, motorlu);
  assert.ok(esyaTak(room, motorlu, "taret-motoru"));
  near(donus(room, motorlu), motorsuz * 2.2);
  near(getModifierAdd(room.getTowerRunModifiers(motorlu), "heat"), 0.2);

  const hafif = kur(room, "warrior-6");
  const hafifSade = donus(room, hafif);
  const maxHp = hafif.maxHp;
  assert.ok(esyaTak(room, hafif, "hafif-taret-kabugu"));
  near(donus(room, hafif), hafifSade * 1.7);
  near(hafif.maxHp, maxHp * 0.8, "can tavani");

  const sunucu = kur(room, "warrior-2");
  for (const id of THEMES.turn.items) assert.equal(esyaTak(room, sunucu, id), false, `${id} Sunucu'ya takildi`);
});

// ---------------------------------------------------- 4. Sunucu: isabet

test("Titresim Sonumleyici koniyi 15 dereceye daraltiyor, atis hizindan %5 aliyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const aralik = room.getTowerFireInterval(tower);
  assert.equal(koniIcinde(room, tower, 16), true, "taban koni 20 derece degil");
  kartAl(room, "titresim-sonumleyici");
  assert.equal(koniIcinde(room, tower, 15.5), false);
  assert.equal(koniIcinde(room, tower, 14.5), true);
  near(room.getTowerFireInterval(tower), aralik / 0.95, "atis hizi");
});

for (const [ad, ver] of [
  ["Isil Kalibrasyon", (room) => kartAl(room, "isil-kalibrasyon")],
  ["Termal Kilif", (room, tower) => assert.ok(esyaTak(room, tower, "termal-kilif"))]
]) {
  test(`${ad} namlu ${COLD_ACCURACY_TEMPERATURE} derecenin altindayken koniyi 10 dereceye daraltiyor`, () => {
    const room = oda();
    const tower = kur(room, "warrior-1");
    ver(room, tower);
    tower.temperature = 0;
    assert.equal(koniIcinde(room, tower, 10.5), false, "soguk namlu daralmadi");
    assert.equal(koniIcinde(room, tower, 9.5), true);
    tower.temperature = COLD_ACCURACY_TEMPERATURE - 0.1;
    assert.equal(koniIcinde(room, tower, 10.5), false);
    tower.temperature = COLD_ACCURACY_TEMPERATURE;
    assert.equal(koniIcinde(room, tower, 10.5), true, "sicak namluda hala dar");
  });
}

test("soguk namlunun isabeti Goz Karari'nin kritik cevrimine de giriyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "isil-kalibrasyon");
  kartAl(room, "goz-karari");
  tower.temperature = 0;
  const soguk = room.getTowerCritChance(tower);
  tower.temperature = 60;
  const sicak = room.getTowerCritChance(tower);
  near(soguk - sicak, COLD_ACCURACY_BONUS * 0.3, "kritik farki");
});

test("Gez ve Arpacik, Lazer Telemetre ve Hassas Namlu takildigi kulede koniyi daraltiyor ve bedellerini ödüyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  for (let index = 0; index < 4; index += 1) assert.ok(esyaTak(room, tower, "gez-arpacik"));
  // 4 x %15 = %60: 20 derece -> 8 derece.
  assert.equal(koniIcinde(room, tower, 8.5), false);
  assert.equal(koniIcinde(room, tower, 7.5), true);

  const lazerli = kur(room, "warrior-4");
  const menzil = room.getTowerRange(lazerli);
  const sade = donus(room, lazerli);
  assert.ok(esyaTak(room, lazerli, "lazer-telemetre"));
  assert.equal(koniIcinde(room, lazerli, 10.5), false);
  assert.equal(koniIcinde(room, lazerli, 9.5), true);
  near(room.getTowerRange(lazerli), menzil * 1.1, "menzil");
  near(donus(room, lazerli), sade * 0.75, "donus cezasi");

  const hassas = kur(room, "warrior-6");
  const aralik = room.getTowerFireInterval(hassas);
  assert.ok(esyaTak(room, hassas, "hassas-namlu"));
  near(getModifierAdd(room.getTowerRunModifiers(hassas), "critDamage"), 0.5);
  near(room.getTowerFireInterval(hassas), aralik / 0.88, "atis hizi");

  // Isin kulesi nisan aliyor ama isabet orada yalnizca tetigi geciktiriyor.
  const lazer = kur(room, "warrior-5");
  for (const id of THEMES.accuracy.items) assert.equal(esyaTak(room, lazer, id), false, `${id} Debug Lazer'e takildi`);
});

// ---------------------------------------------------- 4. Sunucu: mermi hizi

test("mermi hizi kartlari mermi atan kulelerin mermisini ve Kin dalgasini gercekten hizlandiriyor", () => {
  for (const [character, id] of [["warrior", "warrior-1"], ["warrior", "warrior-4"], ["archer", "archer-1"], ["archer", "archer-6"], ["zeynep", "zeynep-6"], ["zeynep", "zeynep-1"]]) {
    const room = oda(character);
    const tower = kur(room, id);
    const sade = mermiHizi(room, tower);
    assert.ok(sade > 0, `${id}: mermi yok`);
    kartAl(room, "basincli-hazne");
    near(mermiHizi(room, tower), sade * 1.5, `${id} hazne`);
    kartAl(room, "hizlandirici-bobin");
    near(mermiHizi(room, tower), sade * 2.5, `${id} bobin`);
  }
});

test("Debug Lazer mermi atmiyor: mermi hizi karti ona ulasmiyor", () => {
  const room = oda();
  const lazer = kur(room, "warrior-5");
  const enemy = dusman(room, lazer);
  const before = room.projectiles.size;
  room.spawnTowerProjectile(lazer, enemy);
  assert.equal(room.projectiles.size, before, "isin kulesi mermi firlatti");
  kartAl(room, "basincli-hazne");
  assert.equal(getModifierAdd(room.getTowerRunModifiers(lazer), "projectileSpeed"), 0);
  assert.equal(getModifierAdd(room.getTowerRunModifiers(lazer), "heat"), 0, "bedel ulasti");
});

test("mermi hizi esyalari: hiz, bedel ve menzil takildigi kulede", () => {
  const room = oda();
  const yigin = kur(room, "warrior-1");
  const sade = mermiHizi(room, yigin);
  for (let index = 0; index < 4; index += 1) assert.ok(esyaTak(room, yigin, "sabot-fisegi"));
  near(mermiHizi(room, yigin), sade * 2, "dort sabot");

  const ray = kur(room, "warrior-4");
  const raySade = mermiHizi(room, ray);
  assert.ok(esyaTak(room, ray, "manyetik-ray"));
  near(mermiHizi(room, ray), raySade * 1.9);
  near(getModifierAdd(room.getTowerRunModifiers(ray), "shotFuelCost"), 0.3);

  const oda2 = kur(room, "warrior-6");
  const odaSade = mermiHizi(room, oda2);
  const menzil = room.getTowerRange(oda2);
  assert.ok(esyaTak(room, oda2, "genlesme-odasi"));
  near(mermiHizi(room, oda2), odaSade * 1.6);
  near(room.getTowerRange(oda2), menzil * 1.08);

  const hafif = kur(room, "warrior-1");
  const hafifSade = mermiHizi(room, hafif);
  const hasar = room.getTowerDamage(hafif);
  assert.ok(esyaTak(room, hafif, "hafif-cekirdek"));
  near(mermiHizi(room, hafif), hafifSade * 2.5);
  near(room.getTowerDamage(hafif), hasar * 0.9, "hasar cezasi");
});

// ---------------------------------------------------- 4. Sunucu: epik cevrimler

test("Tork Aktarimi: donus hizi bonusunun her %10'u atis hizina +%2, +%30'da duruyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sunucu = kur(room, "warrior-2");
  const sade = room.getTowerFireInterval(tower);
  const sunucuSade = room.getTowerFireInterval(sunucu);
  kartAl(room, "tork-aktarimi");
  near(room.getTowerFireInterval(tower), sade, "yatirimsiz kule hizlandi");
  for (const [turn, fireRate] of [[0.5, 0.1], [1, 0.2], [1.5, 0.3], [3, 0.3], [-0.4, 0]]) {
    tower.runModifiers = tower.runModifiers.filter((modifier) => modifier.source !== "test:seviye");
    tower.runModifiers.push(testMod("turnRate", turn));
    near(room.getTowerFireInterval(tower), sade / (1 + fireRate), `donus +${turn}`);
  }
  near(room.getTowerFireInterval(sunucu), sunucuSade, "nisan almayan kule");
});

test("Tork Aktarimi kartlardan ve esyalardan gelen donus hizini okuyor, kosullu paylar dahil", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = room.getTowerFireInterval(tower);
  kartAl(room, "tork-aktarimi");
  kartAl(room, "servo-takviyesi");
  // Servo: donus +%60 -> atis hizi +%12 (ve calisma enerjisi bedeli, atis araligina dokunmuyor).
  near(room.getTowerFireInterval(tower), sade / 1.12, "kart");
  assert.ok(esyaTak(room, tower, "bilyali-yatak"));
  near(room.getTowerFireInterval(tower), sade / 1.16, "kart + esya");
  // Av Refleksi'nin penceresi +%150: toplam +%230, tavan.
  kartAl(room, "av-refleksi");
  tower.killSnapUntil = Date.now() + 2000;
  near(room.getTowerFireInterval(tower), sade / 1.3, "oldurme penceresi");
  tower.killSnapUntil = Date.now() - 1;
  near(room.getTowerFireInterval(tower), sade / 1.16, "pencere bitince");
});

test("Balistik Hesaplayici: %100'u asan isabetin her %10'u hasara +%10, +%50'de duruyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = room.getTowerDamage(tower);
  kartAl(room, "balistik-hesaplayici");
  near(room.getTowerDamage(tower), sade, "isabetsiz kule");
  for (const [accuracy, damage] of [[0.8, 0], [1, 0], [1.2, 0.2], [1.45, 0.45], [1.5, 0.5], [2.5, 0.5]]) {
    tower.runModifiers = tower.runModifiers.filter((modifier) => modifier.source !== "test:seviye");
    tower.runModifiers.push(testMod("accuracy", accuracy));
    near(room.getTowerDamage(tower) / sade, 1 + damage, `isabet ${accuracy}`);
  }
});

test("Balistik Hesaplayici soguk namlunun isabetini de sayiyor ve gercek vurusu buyutuyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = room.getTowerDamage(tower);
  kartAl(room, "balistik-hesaplayici");
  kartAl(room, "isil-kalibrasyon");
  tower.runModifiers.push(testMod("accuracy", 0.8));
  tower.temperature = 0;
  near(room.getTowerDamage(tower) / sade, 1.3, "0,8 + 0,5 soguk");
  tower.temperature = 80;
  near(room.getTowerDamage(tower) / sade, 1, "sicak namlu");
  // Mermi atildigi anki hasar cevrimi tasiyor.
  tower.temperature = 0;
  const enemy = dusman(room, tower);
  room.spawnTowerProjectile(tower, enemy);
  const projectile = [...room.projectiles.values()].at(-1);
  near(projectile.damage, sade * 1.3, "mermi hasari");
});

test("Kinetik Erim: mermi hizi bonusunun her %10'u menzile +%2, +%20'de duruyor; isin kulesine islemiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const lazer = kur(room, "warrior-5");
  const sade = room.getTowerRange(tower);
  const lazerSade = room.getTowerRange(lazer);
  kartAl(room, "kinetik-erim");
  near(room.getTowerRange(tower), sade, "yatirimsiz");
  for (const [speed, range] of [[0.5, 0.1], [1, 0.2], [2, 0.2]]) {
    tower.runModifiers = tower.runModifiers.filter((modifier) => modifier.source !== "test:seviye");
    tower.runModifiers.push(testMod("projectileSpeed", speed));
    near(room.getTowerRange(tower) / sade, 1 + range, `hiz ${speed}`);
  }
  lazer.runModifiers.push(testMod("projectileSpeed", 2));
  near(room.getTowerRange(lazer), lazerSade, "isin kulesi");
  // Kart ve esya yolu: Hizlandirici Bobin +%100 hiz, -%8 menzil; cevrim +%20.
  const bobinli = kur(room, "warrior-4");
  const bobinSade = room.getTowerRange(bobinli);
  kartAl(room, "hizlandirici-bobin");
  near(room.getTowerRange(bobinli) / bobinSade, 1 - 0.08 + 0.2, "bobin + cevrim");
});

test("Savas Hazinesi: dusman altini bonusunun her %10'u tum kulelerin hasarina +%3, +%30'da duruyor", () => {
  const room = oda();
  const takipci = kur(room, "warrior-1");
  const aura = kur(room, "warrior-3");
  const sade = room.getTowerDamage(takipci);
  kartAl(room, "savas-hazinesi");
  near(room.getTowerDamage(takipci), sade, "altin bonusu yokken");
  const player = room.state.players.get("p1");
  for (const [gold, damage] of [[0.25, 0.075], [0.5, 0.15], [1, 0.3], [2, 0.3]]) {
    player.runModifiers = player.runModifiers.filter((modifier) => modifier.source !== "test:seviye");
    player.runModifiers.push({ ...testMod("goldGain", gold), scope: "player" });
    near(room.getTowerDamage(takipci) / sade, 1 + damage, `altin +${gold}`);
    // Nisan almayan, hasari motorundan gelen aura kulesine de: cevrim kulenin listesinde.
    near(getModifierAdd(room.getTowerRunModifiers(aura), "damage"), damage, `aura altin +${gold}`);
  }
});

test("Savas Hazinesi gercek altin kartlarini okuyor; altinin kendisini buyutmuyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = room.getTowerDamage(tower);
  kartAl(room, "savas-hazinesi");
  kartAl(room, "parali-asker");
  assert.ok(satinAl(room, "altin-elek"));
  // +%25 + %12 = %37 -> hasar +%11,1.
  near(room.getTowerDamage(tower) / sade, 1 + 0.37 * 0.3, "kart + esya");
  const player = room.state.players.get("p1");
  player.gold = 0;
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  enemy.reward = 100;
  room.damageEnemy(enemy, 1e9, 0, "warrior-1", "p1");
  const share = Math.max(1, Math.round(100 * 1.5));
  near(player.gold, share * 1.37, "oldurme altini yalnizca kartlarin carpaniyla");
});

test("cevrim tavanlari ayri: iki hasar cevrimi toplaniyor ama birbirini beslemiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = room.getTowerDamage(tower);
  kartAl(room, "savas-hazinesi");
  kartAl(room, "balistik-hesaplayici");
  tower.runModifiers.push(testMod("accuracy", 3));
  room.state.players.get("p1").runModifiers.push({ ...testMod("goldGain", 5), scope: "player" });
  near(room.getTowerDamage(tower) / sade, 1 + 0.5 + 0.3);
});

// ---------------------------------------------------- 4. Sunucu: altin

function oldur(room, tower, { zar = 1, reward = 20 } = {}) {
  room.towerCriticalRandom = () => zar;
  // Tur ve hareket sabit: tecrube ve altin dusman turune bagli, dogum zari olcume karismasin.
  const enemy = dusman(room, tower, { hp: 1, maxHp: 1, reward, type: "grunt", movementKind: "ground", champion: undefined });
  return room.damageEnemy(enemy, 1e9, 0, tower.definition.id, tower.ownerId, "true", 0, tower.level, tower.id);
}

test("Parali Asker dusman altinini %25 artiriyor, tecrubeyi %20 azaltiyor", () => {
  const olc = (kartli) => {
    const room = oda();
    const tower = kur(room, "warrior-1");
    if (kartli) kartAl(room, "parali-asker");
    const player = room.state.players.get("p1");
    player.gold = 0;
    player.experience = 0;
    assert.equal(oldur(room, tower, { reward: 100 }), true);
    return { gold: player.gold, experience: player.experience };
  };
  const sade = olc(false);
  const kartli = olc(true);
  near(kartli.gold / sade.gold, 1.25, "altin");
  near(kartli.experience / sade.experience, 0.8, "tecrube");
});

test("co-op: altin kartlari yalnizca sahibinin kesesine isliyor", () => {
  const room = oda();
  const p2 = ikinciOyuncu(room);
  const tower = kur(room, "warrior-1");
  kartAl(room, "parali-asker");
  kartAl(room, "muharebe-odenegi");
  const p1 = room.state.players.get("p1");
  p1.gold = 0;
  p2.gold = 0;
  oldur(room, tower, { reward: 100 });
  near(p1.gold / p2.gold, 1.25, "oldurme altini takim arkadasina carpilmadi");
  const [g1, g2] = [p1.gold, p2.gold];
  room.awardWaveEndBonusGold(room.wave, false);
  assert.equal(p1.gold - g1, 20);
  assert.equal(p2.gold - g2, 0, "takim arkadasi odenek aldi");
});

test("Muharebe Odenegi oyuncu basina bir kez sayiliyor, kule sayisi kadar degil", () => {
  const room = oda();
  for (const id of ["warrior-1", "warrior-4", "warrior-6"]) kur(room, id);
  kartAl(room, "muharebe-odenegi");
  assert.equal(room.getPlayerWaveIncome("p1"), 20);
});

test("Darphane Modulu: takildigi bina ayaktayken her dalga sonu +20, uc kopya +60, yikik bina 0", () => {
  const room = oda();
  const bina = kur(room, "warrior-7");
  const savas = kur(room, "warrior-1");
  assert.equal(esyaTak(room, savas, "darphane-modulu"), false, "savas kulesine takildi");
  assert.ok(esyaTak(room, bina, "darphane-modulu"));
  assert.equal(room.getPlayerWaveIncome("p1"), 20);
  assert.ok(esyaTak(room, bina, "darphane-modulu"));
  assert.ok(esyaTak(room, bina, "darphane-modulu"));
  assert.equal(room.getPlayerWaveIncome("p1"), 60);
  const player = room.state.players.get("p1");
  const once = player.gold;
  room.awardWaveEndBonusGold(room.wave, false);
  assert.equal(player.gold - once, 60);
  bina.hp = 0;
  assert.equal(room.getPlayerWaveIncome("p1"), 0, "yikik bina gelir getirdi");
  // Dorduncu kopya vitrine cikmiyor.
  assert.equal(isShopItemAvailable(item("darphane-modulu"), 5, ["darphane-modulu", "darphane-modulu", "darphane-modulu"]), false);
});

test("Temiz Sicil gercek dalga kapanisinda sizintisiz dalgaya +45 veriyor, sizintiliya vermiyor; faizden sonra", () => {
  const kapanis = ({ kart, esya, sizinti }) => {
    const room = oda();
    kur(room, "warrior-1");
    if (kart) kartAl(room, "temiz-sicil");
    if (esya) assert.ok(satinAl(room, "sigorta-policesi"));
    assert.ok(satinAl(room, "faiz-hesabi"));
    room.wave = 3;
    if (sizinti) sizdir(room);
    const player = room.state.players.get("p1");
    player.gold = 500;
    dalgayiKapat(room);
    assert.equal(room.wave, 4, "dalga kapanmadi");
    return player.gold;
  };
  const tabanli = 500 + getWaveCompletionGold(3);
  const faizli = tabanli + Math.min(60, Math.floor(tabanli * 0.08));
  assert.equal(kapanis({}), faizli, "kartsiz");
  assert.equal(kapanis({ kart: true }), faizli + CLEAN_WAVE_GOLD, "prim faizin tabanina girmedi");
  assert.equal(kapanis({ esya: true }), faizli + CLEAN_WAVE_GOLD, "Sigorta Policesi");
  assert.equal(kapanis({ kart: true, esya: true }), faizli + CLEAN_WAVE_GOLD, "ayni kilit iki kez odendi");
  assert.equal(kapanis({ kart: true, sizinti: true }), faizli, "sizintili dalgada prim");
});

test("co-op: temiz dalga primi yalnizca kilidi olan oyuncuya", () => {
  const room = oda();
  const p2 = ikinciOyuncu(room);
  kartAl(room, "temiz-sicil");
  const p1 = room.state.players.get("p1");
  const [g1, g2] = [p1.gold, p2.gold];
  room.awardWaveEndBonusGold(room.wave, true);
  assert.equal(p1.gold - g1, CLEAN_WAVE_GOLD);
  assert.equal(p2.gold - g2, 0);
});

for (const [ad, ver] of [
  ["Kelle Parasi", (room) => kartAl(room, "kelle-parasi")],
  ["Kelle Defteri", (room, tower) => assert.ok(esyaTak(room, tower, "kelle-defteri"))]
]) {
  test(`${ad} kritik oldurmeye +${CRIT_KILL_GOLD} altin veriyor, dalga basina en fazla ${CRIT_KILL_GOLD_WAVE_CAP}`, () => {
    const room = oda();
    const tower = kur(room, "warrior-4");
    ver(room, tower);
    const player = room.state.players.get("p1");
    const altin = (zar) => {
      const once = player.gold;
      assert.equal(oldur(room, tower, { zar }), true);
      return player.gold - once;
    };
    const duz = altin(1);
    assert.equal(altin(0) - duz, CRIT_KILL_GOLD, "kritik oldurme primi");
    let toplam = CRIT_KILL_GOLD;
    for (let index = 0; index < 20; index += 1) toplam += altin(0) - duz;
    assert.equal(toplam, CRIT_KILL_GOLD_WAVE_CAP, "dalga tavani");
    // Oldurme olayindaki "+N" primi de tasiyor (tavan dolmadan).
    room.wave += 1;
    const events = new Set(room.killEvents.keys());
    altin(0);
    const event = [...room.killEvents.values()].find((entry) => !events.has(entry.id));
    assert.equal(event.g, Math.floor(duz + CRIT_KILL_GOLD), "yeni dalgada tavan sifirlanmadi ya da olay primi gostermiyor");
  });
}

test("Kelle Defteri yalnizca takildigi kulenin oldurmesine isliyor", () => {
  const room = oda();
  const takili = kur(room, "warrior-4");
  const oteki = kur(room, "warrior-6");
  assert.ok(esyaTak(room, takili, "kelle-defteri"));
  const player = room.state.players.get("p1");
  const altin = (tower, zar) => {
    const once = player.gold;
    oldur(room, tower, { zar });
    return player.gold - once;
  };
  assert.equal(altin(oteki, 0) - altin(oteki, 1), 0, "baska kulenin oldurmesi prim verdi");
  assert.equal(altin(takili, 0) - altin(takili, 1), CRIT_KILL_GOLD);
});

test("Vadeli Mevduat: 150 altin baglaniyor, 4 dalga tamamlaninca 220 donuyor", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  room.wave = 5;
  player.gold = 1000;
  assert.ok(satinAl(room, "vadeli-mevduat"));
  assert.equal(player.gold, 850);
  assert.deepEqual(player.goldDeposits, [{ dueWave: 8, amount: 220 }]);
  room.awardWaveEndBonusGold(7, false);
  assert.equal(player.gold, 850, "erken odendi");
  room.awardWaveEndBonusGold(8, false);
  assert.equal(player.gold, 1070);
  assert.deepEqual(player.goldDeposits, []);
  room.awardWaveEndBonusGold(9, false);
  assert.equal(player.gold, 1070, "iki kez odendi");
});

test("Vadeli Mevduat gercek dalga kapanisinda odeniyor", () => {
  const room = oda();
  kur(room, "warrior-1");
  const player = room.state.players.get("p1");
  room.wave = 2;
  assert.ok(satinAl(room, "vadeli-mevduat"));
  const odenen = [];
  for (let wave = 2; wave <= 5; wave += 1) {
    const once = player.gold;
    dalgayiKapat(room);
    odenen.push(player.gold - once - getWaveCompletionGold(wave));
  }
  assert.deepEqual(odenen, [0, 0, 0, 220]);
});

// ------------------------------------- 5b. Cekilis: epik hazirligi ve sahip olunan kilit

/** Kaynak girdisi: oyuncu ve kule basina sabit bonuslar. */
function kaynaklar({ player = {}, towers = [] } = {}) {
  return {
    player: (stat) => player[stat] ?? 0,
    towers: towers.map(([id, bonuses]) => ({ tower: kule(id), bonus: (stat) => bonuses[stat] ?? 0 }))
  };
}

test("epik kart kaynagi kurulusta yoksa hazir sayilmiyor", () => {
  const tork = card("tork-aktarimi");
  assert.equal(isConversionCardReady(tork, kaynaklar({ towers: [["warrior-1", {}]] })), false, "yatirimsiz");
  assert.equal(isConversionCardReady(tork, kaynaklar({ towers: [["warrior-1", { turnRate: 0.3 }]] })), true);
  assert.equal(isConversionCardReady(tork, kaynaklar({ towers: [["warrior-1", { turnRate: -0.15 }]] })), false, "ceza yatirim degil");
  assert.equal(isConversionCardReady(tork, kaynaklar({ towers: [["warrior-2", { turnRate: 0.5 }]] })), false, "nisan almayan kulenin donusu sayilmiyor");
  const balistik = card("balistik-hesaplayici");
  assert.equal(isConversionCardReady(balistik, kaynaklar({ towers: [["warrior-1", { accuracy: 0.45 }]] })), false);
  assert.equal(isConversionCardReady(balistik, kaynaklar({ towers: [["warrior-1", { accuracy: 0.55 }]] })), true, "tavana dogru gidiyor");
  const kinetik = card("kinetik-erim");
  assert.equal(isConversionCardReady(kinetik, kaynaklar({ towers: [["warrior-5", { projectileSpeed: 1 }]] })), false, "isin kulesi");
  assert.equal(isConversionCardReady(kinetik, kaynaklar({ towers: [["warrior-4", { projectileSpeed: 0.25 }]] })), true);
  const hazine = card("savas-hazinesi");
  assert.equal(isConversionCardReady(hazine, kaynaklar()), false);
  assert.equal(isConversionCardReady(hazine, kaynaklar({ player: { goldGain: 0.15 } })), true, "kulesiz de oyuncunun altin bonusu");
  // Cevrimsiz kart her zaman hazir.
  assert.equal(isConversionCardReady(card("servo-takviyesi"), kaynaklar()), true);
});

/** Tohumlu cekiliste bir kartin tek secenekte gelme sayisi. */
function cekilisSay(cardId, extra, draws = 30_000) {
  let state = 5;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  let count = 0;
  for (let index = 0; index < draws; index += 1) {
    const [drawn] = drawCards({ count: 1, preferredAxes: ["dps", "economy"], towers: [kule("warrior-1")], ownedCardIds: [], random, ...extra });
    if (drawn.id === cardId) count += 1;
  }
  return count;
}

test("cekilis: yatirimsiz kurulusta epik kart olu agirlikla geri cekiliyor", () => {
  const hazir = cekilisSay("tork-aktarimi", { sourceBonuses: kaynaklar({ towers: [["warrior-1", { turnRate: 0.6 }]] }) });
  const bos = cekilisSay("tork-aktarimi", { sourceBonuses: kaynaklar({ towers: [["warrior-1", {}]] }) });
  const eski = cekilisSay("tork-aktarimi", {});
  assert.ok(hazir > 40, `ornek kucuk: ${hazir}`);
  assert.ok(bos < hazir * 0.3, `geri cekilmedi: ${bos} / ${hazir}`);
  assert.ok(Math.abs(eski - hazir) < hazir * 0.35, "girdi verilmezse kural uygulanmiyor");
});

test("kart kilidi esyadan zaten geliyorsa kart taniniyor; kuleye bagli kilit her kulede acik olmali", () => {
  const takipci = kule("warrior-1");
  const obsesyon = kule("warrior-4");
  const sigortali = getOwnedItemUnlocks(["sigorta-policesi"], [{ definition: takipci }]);
  assert.equal(isCardUnlockAlreadyOwned(card("temiz-sicil"), sigortali), true, "kuresel esya");
  assert.equal(isCardUnlockAlreadyOwned(card("kelle-parasi"), sigortali), false, "ilgisiz kilit");
  // Kelle Defteri tek kulede: kart oteki kuleye hala bir sey veriyor.
  const tekKule = getOwnedItemUnlocks(["kelle-defteri"], [{ definition: takipci, equippedShopItemIds: ["kelle-defteri"] }, { definition: obsesyon, equippedShopItemIds: [] }]);
  assert.equal(isCardUnlockAlreadyOwned(card("kelle-parasi"), tekKule), false);
  const herKule = getOwnedItemUnlocks(["kelle-defteri", "kelle-defteri"], [{ definition: takipci, equippedShopItemIds: ["kelle-defteri"] }, { definition: obsesyon, equippedShopItemIds: ["kelle-defteri"] }]);
  assert.equal(isCardUnlockAlreadyOwned(card("kelle-parasi"), herKule), true);
  // Ates etmeyen yapi (duvar) hesaba girmiyor; iz okuyucu her savas kulesinde.
  const duvarli = getOwnedItemUnlocks(["iz-okuyucu"], [{ definition: takipci, equippedShopItemIds: ["iz-okuyucu"] }, { definition: kule("wall-1") }]);
  assert.equal(isCardUnlockAlreadyOwned(card("av-izi"), duvarli), true);
  // Envanterde duran (takilmamis) kule esyasi kilit acmiyor.
  assert.equal(isCardUnlockAlreadyOwned(card("kelle-parasi"), getOwnedItemUnlocks(["kelle-defteri"], [{ definition: takipci }])), false);
  // Hedefli kart sayilmiyor.
  assert.equal(isCardUnlockAlreadyOwned(card("hava-savunma-kiti"), getOwnedItemUnlocks([], [{ definition: takipci, equippedShopItemIds: ["ucaksavar-kiti"] }])), false);
});

test("cekilis: kilidi esyadan gelen kart olu agirlikla geri cekiliyor", () => {
  const owned = getOwnedItemUnlocks(["sigorta-policesi"], [{ definition: kule("warrior-1") }]);
  const sade = cekilisSay("temiz-sicil", { ownedUnlocks: getOwnedItemUnlocks([], [{ definition: kule("warrior-1") }]) });
  const acik = cekilisSay("temiz-sicil", { ownedUnlocks: owned });
  assert.ok(sade > 40, `ornek kucuk: ${sade}`);
  assert.ok(acik < sade * 0.3, `geri cekilmedi: ${acik} / ${sade}`);
});

test("sunucu cekilisi kilidi esyadan gelen karti ve yatirimsiz epigi geri cekiyor", () => {
  const say = (hazirla, cardId) => {
    const room = oda();
    kur(room, "warrior-1");
    hazirla(room);
    let state = 9;
    const gercek = Math.random;
    Math.random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    let count = 0;
    try {
      for (let index = 0; index < 20_000; index += 1) {
        room.offerWaveCards();
        if (room.pendingCardChoices.get("p1").some((choice) => choice.id === cardId)) count += 1;
      }
    } finally {
      Math.random = gercek;
    }
    return count;
  };
  const temiz = say(() => {}, "temiz-sicil");
  const sigortali = say((room) => assert.ok(satinAl(room, "sigorta-policesi")), "temiz-sicil");
  assert.ok(temiz > 150, "ornek kucuk: " + temiz);
  assert.ok(sigortali < temiz * 0.3, `kilidi acik kart geri cekilmedi: ${sigortali} / ${temiz}`);
  const yatirimsiz = say(() => {}, "tork-aktarimi");
  const servolu = say((room) => kartAl(room, "servo-takviyesi"), "tork-aktarimi");
  assert.ok(servolu > 40, "ornek kucuk: " + servolu);
  assert.ok(yatirimsiz < servolu * 0.35, `yatirimsiz epik geri cekilmedi: ${yatirimsiz} / ${servolu}`);
});

test("Egitim Sahasi olduren kulenin sahibine +%50 tecrube veriyor; takim arkadasina ve baska kuleye degil", () => {
  const olc = (esyali, olduren = "takili") => {
    const room = oda();
    const p2 = ikinciOyuncu(room);
    const takili = kur(room, "warrior-1");
    const oteki = kur(room, "warrior-4");
    if (esyali) assert.ok(esyaTak(room, takili, "egitim-sahasi"));
    const p1 = room.state.players.get("p1");
    p1.experience = 0;
    p2.experience = 0;
    assert.equal(oldur(room, olduren === "takili" ? takili : oteki), true);
    return { p1: p1.experience, p2: p2.experience };
  };
  const sade = olc(false);
  const esyali = olc(true);
  near(esyali.p1 / sade.p1, 1.5, "sahibin payi");
  near(esyali.p2, sade.p2, "takim arkadasi");
  near(olc(true, "oteki").p1, sade.p1, "baska kulenin oldurmesi");
});

test("Egitim Sahasi oyuncu kartiyla ayni havuzda toplaniyor, iki kez sayilmiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const player = room.state.players.get("p1");
  player.experience = 0;
  oldur(room, tower);
  const sade = player.experience;
  kartAl(room, "saha-egitimi");
  assert.ok(esyaTak(room, tower, "egitim-sahasi"));
  player.experience = 0;
  oldur(room, tower);
  near(player.experience / sade, 1 + 0.35 + 0.5, "kart + esya");
});

test("yaratici mod: Vadeli Mevduat eklenince vade aciliyor, cikarilinca kapaniyor", () => {
  const room = oda();
  room.creativeMode = true;
  const player = room.state.players.get("p1");
  room.getCreativePlayer = () => player;
  room.rebuildCreativeLoadout = () => {};
  room.sendCreativeLoadout = () => {};
  room.wave = 3;
  room.creativeToggleItem(client, { itemId: "vadeli-mevduat", on: true });
  assert.deepEqual(player.goldDeposits, [{ dueWave: 6, amount: 220 }]);
  room.creativeToggleItem(client, { itemId: "vadeli-mevduat", on: true });
  assert.equal(player.goldDeposits.length, 2);
  room.creativeToggleItem(client, { itemId: "vadeli-mevduat", on: false });
  assert.equal(player.goldDeposits.length, 1);
  const once = player.gold;
  room.awardWaveEndBonusGold(6, false);
  assert.equal(player.gold - once, 220);
});

// ------------------------------------- 5. Kilidi zaten acik esya

test("kilidi kartlardan zaten gelen yeni esyalar taniniyor", () => {
  const takipci = kule("warrior-1");
  for (const [itemId, cardId] of [
    ["hareket-ongorucu", "ongorulu-takip"],
    ["termal-kilif", "isil-kalibrasyon"],
    ["sigorta-policesi", "temiz-sicil"],
    ["kelle-defteri", "kelle-parasi"]
  ]) {
    assert.equal(isShopItemAlreadyUnlocked(item(itemId), [], [takipci]), false, itemId);
    assert.equal(isShopItemAlreadyUnlocked(item(itemId), ["seri-atis"], [takipci]), false, `${itemId}: ilgisiz kart`);
    assert.equal(isShopItemAlreadyUnlocked(item(itemId), [cardId], [takipci]), true, `${itemId} + ${cardId}`);
  }
  // Etiketli nisan karti nisan almayan kulede kilidi acmiyor: esya oraya zaten takilamiyor,
  // takilabilecegi kule yokken etiketli kart sayilmiyor.
  assert.equal(isShopItemAlreadyUnlocked(item("hareket-ongorucu"), ["ongorulu-takip"], [kule("warrior-2")]), false);
  // Kuresel esya kule olmadan da: genel kart her yerde acik.
  assert.equal(isShopItemAlreadyUnlocked(item("sigorta-policesi"), ["temiz-sicil"], []), true);
});

test("sunucu kilitleri tek kez aciyor: kart ve esya birlikte primi ikiye katlamiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-4");
  kartAl(room, "kelle-parasi");
  assert.ok(esyaTak(room, tower, "kelle-defteri"));
  const player = room.state.players.get("p1");
  const altin = (zar) => {
    const once = player.gold;
    oldur(room, tower, { zar });
    return player.gold - once;
  };
  assert.equal(altin(0) - altin(1), CRIT_KILL_GOLD);
});
