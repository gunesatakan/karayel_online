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
  FAST_TARGET_TURN_RATE,
  FINAL_WAVE,
  GLOBAL_SHOP_ITEM_IDS,
  GOLD_INTEREST_RATE,
  RISKY_INVESTMENT_GOLD,
  RISKY_INVESTMENT_NEXUS_COST,

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
  getTowerLevelGoldCost,
  getOwnedItemUnlocks,
  isCardUnlockAlreadyOwned,
  isConversionCardReady,
  getRiskyInvestmentNoticeText,
  HOT_KILL_TEMPERATURE,
  LONG_RANGE_KILL_FRACTION,
  DAMAGE_GOLD_PER_DAMAGE,
  MULTI_KILL_GOLD_COUNT,
  MULTI_KILL_GOLD_WINDOW_MS,
  LONG_RANGE_KILL_MAX_FRACTION,
  DELIVERY_GOLD_AMMO_UNIT,
  DELIVERY_GOLD_ENERGY_UNIT,
  towerHasBoundedRange,
  worldToGrid
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
  // Oyuncuya ait her kayit yeni: p1'in nesnelerini paylasan bir p2 testte
  // gorunmeyen bir baglanti kurardi.
  const player = { ...first, id, slot: 1, gold: first.gold, runModifiers: [], ownedCardIds: [], ownedShopItemIds: [], inventoryItemIds: [], goldDeposits: [], shopOffers: [], bountyLedger: undefined, critKillGold: undefined };
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

test("her epik secildigi anda kosulsuz bir stat veriyor; yalnizca kilit ya da cevrim tasiyan epik yok", () => {
  const epics = cardCatalog.filter((entry) => getCardRarity(entry) === "epic");
  assert.ok(epics.length > 0);
  for (const entry of epics) {
    const [own] = entry.effects.filter((modifier) => modifier.add > 0);
    assert.ok(own, `${entry.id}: kosulsuz stat yok`);
    const definition = allTowers.find((tower) => tower.id.startsWith("warrior-") && cardAppliesToTower(entry, tower) && towerDealsDamage(tower));
    assert.ok(definition, `${entry.id}: uyan kule yok`);
    const room = oda();
    const tower = kur(room, definition.id);
    const once = getModifierAdd(room.getTowerRunModifiers(tower), own.stat);
    kartAl(room, entry.id);
    near(getModifierAdd(room.getTowerRunModifiers(tower), own.stat) - once, own.add, `${entry.id} ${own.stat}`);
  }
});

/** Statin aciklamadaki adi; ek (isabeti, isisi, cani) serbest. */
const STAT_LABEL = {
  turnRate: "dönüş hızı", accuracy: "isabet", fireRate: "atış hızı", heat: "ısı", range: "menzil",
  projectileSpeed: "mermi hızı", operatingEnergyCost: "çalışma enerjisi tüketimi", shotFuelCost: "yakıt tüketimi",
  towerHealth: "can", damage: "hasar", critDamage: "kritik hasarı", goldGain: "Düşman altın", experienceGain: "tecrübe kazancı",
  critChance: "kritik şansı", accuracyVsAir: "hava hedeflerine isabet", projectileSpeedIsolated: "komşusuzken mermi hızı"
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
    assert.ok(entry.description.endsWith(`her düşman +${CRIT_KILL_GOLD} altın verir.`), entry.id);
    assert.doesNotMatch(entry.description, /en fazla/, entry.id);
  }
  const deposit = item("vadeli-mevduat");
  assert.ok(deposit.description.includes(`${deposit.deposit.waves} dalga tamamlanınca ${deposit.deposit.payout} altın öder`));
  assert.ok(deposit.description.includes(`en fazla ${deposit.maxStacks} kez`));
  assert.ok(deposit.description.includes(`${getShopItemLastOfferWave(deposit)}. dalgadan sonra çıkmaz`));
});

const CONVERSION_SOURCE = { turnRate: "dönüş hızı bonusunun", accuracy: "isabet bonusunun", projectileSpeed: "mermi hızı bonusunun", goldGain: "Düşman altını bonusunun" };
const CONVERSION_TARGET = { fireRate: "atış hızına", damage: "hasar", range: "menzile" };

test("epik aciklamalari once kendi kaynak bonusunu, sonra cevrim kuralini ve tavanini soyluyor", () => {
  const base = {
    "tork-aktarimi": ["turnRate", 0.5, "Nişan alan kulelerin dönüş hızı +%50. "],
    "balistik-hesaplayici": ["accuracy", 0.5, "Nişan alan mermi ve çarpma kulelerinin isabeti +%50. "],
    "kinetik-erim": ["projectileSpeed", 0.5, "Mermi atan kulelerin mermi hızı +%50. "],
    "savas-hazinesi": ["goldGain", 1.2, "Düşman altını +%120. "]
  };
  const thresholdText = { 0.3: "%30'u aşan ", 1: "%100'ü aşan " };
  const stepText = { "savas-hazinesi": [40, "'ı"] };
  for (const id of EPIC_IDS) {
    const entry = card(id);
    assert.equal(entry.conversions.length, 1, id);
    assert.equal(entry.stackable, false, id);
    const [conversion] = entry.conversions;
    const [stat, add, lead] = base[id];
    // Cevrim adimi: Savas Hazinesi'nin altin cevrimi altin dort katina cikinca
    // her %40'a gecti (oran dortte bir), oteki epikler her %10.
    const [step, stepSuffix] = stepText[id] ?? [10, "'u"];
    // Kendi kaynak bonusu: tek etki ve cevrimin kaynagi.
    assert.deepEqual(entry.effects.map((modifier) => [modifier.stat, modifier.add]), [[stat, add]], id);
    assert.equal(conversion.from, stat, id);
    assert.ok(entry.description.startsWith(lead), `${id}: ${entry.description}`);
    const rest = entry.description.slice(lead.length).toLocaleLowerCase("tr-TR");
    const threshold = conversion.threshold ? thresholdText[conversion.threshold] : "";
    assert.ok(threshold !== undefined, `${id}: esik metni yok`);
    assert.ok(rest.startsWith(`${threshold}${CONVERSION_SOURCE[conversion.from]} her %${step}${stepSuffix}`.toLocaleLowerCase("tr-TR")), `${id}: ${entry.description}`);
    assert.ok(rest.includes(CONVERSION_TARGET[conversion.to]), id);
    assert.ok(entry.description.endsWith(`+%${Math.round(conversion.ratio * step)} ekler; en fazla +%${yuzde(conversion.cap)}.`), `${id}: ${entry.description}`);
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
  // Balistik: %30'un ustu, her %10'u +%5, en fazla +%50 (isabet 1,3'te).
  const balistik = card("balistik-hesaplayici").conversions[0];
  near(getStatConversionAdd(balistik, 0.2), 0);
  near(getStatConversionAdd(balistik, 0.3), 0);
  near(getStatConversionAdd(balistik, 0.5), 0.1, "kartin kendi bonusu");
  near(getStatConversionAdd(balistik, 1), 0.35);
  near(getStatConversionAdd(balistik, 1.3), 0.5);
  near(getStatConversionAdd(balistik, 3), 0.5);
});

// ------------------------------------------------------------- 2. Kapsam

test("mermi atan kuleler: sunucunun mermi hizini okudugu atis yollari", () => {
  const expectedTrue = ["zeynep-1", "zeynep-3", "zeynep-6", "warrior-1", "warrior-4", "warrior-6", "archer-1", "archer-2", "archer-5", "archer-6", "onur-2"];
  // Sunucu (warrior-2) carpma tipinde ama hic saldirmiyor: bagliyor, ates etmiyor.
  const expectedFalse = ["zeynep-2", "zeynep-7", "zeynep-8", "warrior-2", "warrior-3", "warrior-5", "archer-3", "archer-4", "onur-1", "wall-1", "repair-depot-1", "warrior-7", "warrior-8", "zeynep-9", "archer-7"];
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

test("hasar veren kule: duvar, onarim ussu, hasarsiz auralar ve Sunucu disarida; tanimda 0 hasar yazan vurucular icerde", () => {
  for (const id of ["wall-1", "repair-depot-1", "zeynep-7", "zeynep-8", "warrior-2", "warrior-3", "warrior-7"]) assert.equal(towerDealsDamage(kule(id)), false, id);
  for (const id of ["zeynep-6", "archer-4", "warrior-1", "warrior-5", "archer-3", "onur-1"]) assert.equal(towerDealsDamage(kule(id)), true, id);
  // Kritik ve oldurme esyalari bu kurala bagli; hicbiri olu kalmiyor.
  const combatItems = shopCatalog.filter((entry) => entry.scope.kind === "tagged" && entry.scope.combat);
  assert.ok(combatItems.length >= 20, `yalnizca ${combatItems.length}`);
  for (const entry of combatItems) {
    for (const tower of allTowers) assert.equal(shopItemAppliesToTower(entry, tower), towerDealsDamage(tower) && (!entry.scope.boundedRange || towerHasBoundedRange(tower)), `${entry.id} / ${tower.id}`);
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
  assert.ok(item("darphane-modulu").description.startsWith("Takıldığı bina dalga sonunda ayaktaysa +160 altın verir;"));
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
    "manyetik-ray": [1, 90, "class"], "genlesme-odasi": [1, 105, "class"], "hafif-cekirdek": [1, 150, "class"],
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

test("epik cekilis agirligi nadirle esit: tohumlu cekiliste nadir kadar sik", () => {
  assert.equal(CARD_RARITY_WEIGHT.epic, CARD_RARITY_WEIGHT.rare);
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
  assert.ok(ratio > 0.8 && ratio < 1.25, `epik/nadir orani ${ratio.toFixed(2)}, beklenen ~1`);
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
  // Kapsam etiketi sozlukte: anahtar sahnede, Turkce metin scene bolgesinde.
  assert.ok(scene.includes(`scope.projectiles ? t("scene.scope.projectiles")`));
  const sceneText = await read("../apps/web/src/locales/areas/scene.ts");
  assert.ok(sceneText.includes(`"scene.scope.projectiles": "Mermi atan kuleler"`));
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

test("Gez ve Arpacik, Lazer Telemetre ve Hassas Namlu takildigi kulede koniyi daraltiyor, bedelsiz", () => {
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
  near(donus(room, lazerli), sade, "donus cezasi geri geldi");

  const hassas = kur(room, "warrior-6");
  const aralik = room.getTowerFireInterval(hassas);
  assert.ok(esyaTak(room, hassas, "hassas-namlu"));
  near(getModifierAdd(room.getTowerRunModifiers(hassas), "critDamage"), 0.5);
  near(room.getTowerFireInterval(hassas), aralik, "atis hizi cezasi geri geldi");

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

test("mermi hizi esyalari: hiz ve menzil takildigi kulede, bedelsiz", () => {
  const room = oda();
  const yigin = kur(room, "warrior-1");
  const sade = mermiHizi(room, yigin);
  for (let index = 0; index < 4; index += 1) assert.ok(esyaTak(room, yigin, "sabot-fisegi"));
  near(mermiHizi(room, yigin), sade * 2, "dort sabot");

  const ray = kur(room, "warrior-4");
  const raySade = mermiHizi(room, ray);
  assert.ok(esyaTak(room, ray, "manyetik-ray"));
  near(mermiHizi(room, ray), raySade * 1.9);
  near(getModifierAdd(room.getTowerRunModifiers(ray), "shotFuelCost"), 0, "yakit cezasi geri geldi");

  const oda2 = kur(room, "warrior-6");
  const odaSade = mermiHizi(room, oda2);
  const menzil = room.getTowerRange(oda2);
  assert.ok(esyaTak(room, oda2, "genlesme-odasi"));
  near(mermiHizi(room, oda2), odaSade * 1.6);
  near(room.getTowerRange(oda2), menzil * 1.08);
  near(getModifierAdd(room.getTowerRunModifiers(oda2), "heat"), 0, "isi cezasi geri geldi");

  const hafif = kur(room, "warrior-1");
  const hafifSade = mermiHizi(room, hafif);
  const hasar = room.getTowerDamage(hafif);
  assert.ok(esyaTak(room, hafif, "hafif-cekirdek"));
  near(mermiHizi(room, hafif), hafifSade * 2.5);
  near(room.getTowerDamage(hafif), hasar, "hasar cezasi geri geldi");
});

// ---------------------------------------------------- 4. Sunucu: epik cevrimler

test("Tork Aktarimi tek basina donus hizi +%50 ve atis hizi +%10 veriyor; yatirimla +%30'da duruyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sunucu = kur(room, "warrior-2");
  const sade = room.getTowerFireInterval(tower);
  const sadeDonus = donus(room, tower);
  const sunucuSade = room.getTowerFireInterval(sunucu);
  kartAl(room, "tork-aktarimi");
  near(donus(room, tower), sadeDonus * 1.5, "kendi donus bonusu");
  near(room.getTowerFireInterval(tower), sade / 1.1, "tek basina +%10 atis hizi");
  // Kartin +%50'si uzerine eklenen donus: toplam 1.0 -> +%20, 1.5 -> +%30 (tavan).
  for (const [turn, fireRate] of [[0, 0.1], [0.5, 0.2], [1, 0.3], [2.5, 0.3], [-0.9, 0]]) {
    tower.runModifiers = tower.runModifiers.filter((modifier) => modifier.source !== "test:seviye");
    tower.runModifiers.push(testMod("turnRate", turn));
    near(room.getTowerFireInterval(tower), sade / (1 + fireRate), `donus +${turn}`);
  }
  near(room.getTowerFireInterval(sunucu), sunucuSade, "nisan almayan kule");
  assert.equal(getModifierAdd(room.getTowerRunModifiers(sunucu), "turnRate"), 0, "nisan almayana donus");
});

test("Tork Aktarimi kartlardan ve esyalardan gelen donus hizini okuyor, kosullu paylar dahil", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = room.getTowerFireInterval(tower);
  kartAl(room, "tork-aktarimi");
  kartAl(room, "servo-takviyesi");
  // +%50 (kart) + %60 (Servo) = %110 -> atis hizi +%22.
  near(room.getTowerFireInterval(tower), sade / 1.22, "kart");
  assert.ok(esyaTak(room, tower, "bilyali-yatak"));
  near(room.getTowerFireInterval(tower), sade / 1.26, "kart + esya");
  kartAl(room, "av-refleksi");
  tower.killSnapUntil = Date.now() + 2000;
  near(room.getTowerFireInterval(tower), sade / 1.3, "oldurme penceresi (tavan)");
  tower.killSnapUntil = Date.now() - 1;
  near(room.getTowerFireInterval(tower), sade / 1.26, "pencere bitince");
});

test("Balistik Hesaplayici tek basina isabet +%50 ve hasar +%10 veriyor; yatirimla +%50'de duruyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = room.getTowerDamage(tower);
  assert.equal(koniIcinde(room, tower, 16), true);
  kartAl(room, "balistik-hesaplayici");
  // Kendi +%50 isabeti: koni 20 -> 10 derece.
  assert.equal(koniIcinde(room, tower, 10.5), false, "kendi isabeti koniyi daraltmadi");
  assert.equal(koniIcinde(room, tower, 9.5), true);
  near(room.getTowerDamage(tower) / sade, 1.1, "tek basina");
  for (const [accuracy, damage] of [[0, 0.1], [0.3, 0.25], [0.5, 0.35], [0.8, 0.5], [2, 0.5]]) {
    tower.runModifiers = tower.runModifiers.filter((modifier) => modifier.source !== "test:seviye");
    tower.runModifiers.push(testMod("accuracy", accuracy));
    near(room.getTowerDamage(tower) / sade, 1 + damage, `isabet +${accuracy}`);
  }
});

test("Balistik Hesaplayici soguk namlunun isabetini de sayiyor ve gercek vurusu buyutuyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = room.getTowerDamage(tower);
  kartAl(room, "balistik-hesaplayici");
  kartAl(room, "isil-kalibrasyon");
  tower.runModifiers.push(testMod("accuracy", 0.3));
  tower.temperature = 0;
  // 0,5 (kart) + 0,3 + 0,5 (soguk) = 1,3 -> +%50 (tavan).
  near(room.getTowerDamage(tower) / sade, 1.5, "soguk");
  tower.temperature = 80;
  // 0,8 -> +%25.
  near(room.getTowerDamage(tower) / sade, 1.25, "sicak namlu");
  tower.temperature = 0;
  const enemy = dusman(room, tower);
  room.spawnTowerProjectile(tower, enemy);
  const projectile = [...room.projectiles.values()].at(-1);
  near(projectile.damage, sade * 1.5, "mermi hasari");
});

test("Kinetik Erim tek basina mermi hizi +%50 ve menzil +%10 veriyor; +%20'de duruyor; isin kulesine islemiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const lazer = kur(room, "warrior-5");
  const sade = room.getTowerRange(tower);
  const sadeHiz = mermiHizi(room, tower);
  const lazerSade = room.getTowerRange(lazer);
  kartAl(room, "kinetik-erim");
  near(mermiHizi(room, tower), sadeHiz * 1.5, "kendi mermi hizi bonusu");
  near(room.getTowerRange(tower) / sade, 1.1, "tek basina");
  for (const [speed, range] of [[0, 0.1], [0.25, 0.15], [0.5, 0.2], [2, 0.2]]) {
    tower.runModifiers = tower.runModifiers.filter((modifier) => modifier.source !== "test:seviye");
    tower.runModifiers.push(testMod("projectileSpeed", speed));
    near(room.getTowerRange(tower) / sade, 1 + range, `hiz +${speed}`);
  }
  near(room.getTowerRange(lazer), lazerSade, "isin kulesi");
  const bobinli = kur(room, "warrior-4");
  const bobinSade = room.getTowerRange(bobinli);
  kartAl(room, "hizlandirici-bobin");
  // Bobin cekilmeden once de kartin +%50'si +%10 veriyordu; bobinle +%150 -> tavan.
  near(room.getTowerRange(bobinli) / (bobinSade / 1.1), 1 - 0.08 + 0.2, "bobin + cevrim");
});

test("Savas Hazinesi tek basina dusman altini +%120 ve hasar +%9 veriyor; +%30'da duruyor", () => {
  const room = oda();
  const takipci = kur(room, "warrior-1");
  const aura = kur(room, "warrior-3");
  const sade = room.getTowerDamage(takipci);
  kartAl(room, "savas-hazinesi");
  near(room.getTowerDamage(takipci) / sade, 1.09, "tek basina");
  const player = room.state.players.get("p1");
  near(getModifierAdd(player.runModifiers, "goldGain"), 1.2, "kendi altin bonusu");
  for (const [gold, damage] of [[0, 0.09], [0.8, 0.15], [2.8, 0.3], [8, 0.3]]) {
    player.runModifiers = player.runModifiers.filter((modifier) => modifier.source !== "test:seviye");
    player.runModifiers.push({ ...testMod("goldGain", gold), scope: "player" });
    near(room.getTowerDamage(takipci) / sade, 1 + damage, `altin +${gold}`);
    near(getModifierAdd(room.getTowerRunModifiers(aura), "damage"), damage, `aura altin +${gold}`);
  }
});

test("Savas Hazinesi gercek altin kartlarini okuyor ve kendi bonusu oldurme altinina isliyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = room.getTowerDamage(tower);
  kartAl(room, "savas-hazinesi");
  kartAl(room, "parali-asker");
  // +%120 (kart) + %200 = %320 -> hasar +%24 (her %40'i +%3).
  near(room.getTowerDamage(tower) / sade, 1 + 3.2 * 0.075, "iki kart");
  assert.ok(satinAl(room, "altin-elek"));
  // +%96 daha: %416 -> tavan +%30.
  near(room.getTowerDamage(tower) / sade, 1.3, "kart + esya (tavan)");
  const player = room.state.players.get("p1");
  player.gold = 0;
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  enemy.reward = 100;
  enemy.champion = undefined;
  room.damageEnemy(enemy, 1e9, 0, "warrior-1", "p1");
  near(player.gold, Math.round(100 * 1.5) * (1 + 1.2 + 2 + 0.96), "oldurme altini yalnizca kartlarin carpaniyla");
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

test("Parali Asker dusman altinini %200 artiriyor, tecrubeyi %20 azaltiyor", () => {
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
  near(kartli.gold / sade.gold, 3, "altin");
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
  near(p1.gold / p2.gold, 3, "oldurme altini takim arkadasina carpilmadi");
  const [g1, g2] = [p1.gold, p2.gold];
  room.awardWaveEndBonusGold(room.wave, false);
  assert.equal(p1.gold - g1, 160);
  assert.equal(p2.gold - g2, 0, "takim arkadasi odenek aldi");
});

test("Muharebe Odenegi oyuncu basina bir kez sayiliyor, kule sayisi kadar degil", () => {
  const room = oda();
  for (const id of ["warrior-1", "warrior-4", "warrior-6"]) kur(room, id);
  kartAl(room, "muharebe-odenegi");
  assert.equal(room.getPlayerWaveIncome("p1"), 160);
});

test("Darphane Modulu: takildigi bina ayaktayken her dalga sonu +160, uc kopya +480, yikik bina 0", () => {
  const room = oda();
  const bina = kur(room, "warrior-7");
  const savas = kur(room, "warrior-1");
  assert.equal(esyaTak(room, savas, "darphane-modulu"), false, "savas kulesine takildi");
  assert.ok(esyaTak(room, bina, "darphane-modulu"));
  assert.equal(room.getPlayerWaveIncome("p1"), 160);
  assert.ok(esyaTak(room, bina, "darphane-modulu"));
  assert.ok(esyaTak(room, bina, "darphane-modulu"));
  assert.equal(room.getPlayerWaveIncome("p1"), 480);
  const player = room.state.players.get("p1");
  const once = player.gold;
  room.awardWaveEndBonusGold(room.wave, false);
  assert.equal(player.gold - once, 480);
  bina.hp = 0;
  assert.equal(room.getPlayerWaveIncome("p1"), 0, "yikik bina gelir getirdi");
  // Dorduncu kopya vitrine cikmiyor.
  assert.equal(isShopItemAvailable(item("darphane-modulu"), 5, ["darphane-modulu", "darphane-modulu", "darphane-modulu"]), false);
});

test("Temiz Sicil gercek dalga kapanisinda sizintisiz dalgaya primini veriyor, sizintiliya vermiyor; faizden sonra", () => {
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
  const faizli = tabanli + Math.floor(tabanli * GOLD_INTEREST_RATE);
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
  test(`${ad} her kritik oldurmeye +${CRIT_KILL_GOLD} altin veriyor; tavan yok`, () => {
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
    // Eski tavan (90) cok gerilerde: 40 kritik oldurmenin hepsi oduyor.
    let toplam = CRIT_KILL_GOLD;
    for (let index = 0; index < 40; index += 1) toplam += altin(0) - duz;
    assert.equal(toplam, CRIT_KILL_GOLD * 41);
    // Oldurme olayindaki "+N" primi tasiyor.
    const events = new Set(room.killEvents.keys());
    altin(0);
    const event = [...room.killEvents.values()].find((entry) => !events.has(entry.id));
    assert.equal(event.g, Math.floor(duz + CRIT_KILL_GOLD), "olay primi gostermiyor");
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

test("Vadeli Mevduat: 150 altin baglaniyor, 4 dalga tamamlaninca 440 donuyor", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  room.wave = 5;
  player.gold = 1000;
  assert.ok(satinAl(room, "vadeli-mevduat"));
  assert.equal(player.gold, 850);
  assert.deepEqual(player.goldDeposits, [{ dueWave: 8, amount: 440 }]);
  room.awardWaveEndBonusGold(7, false);
  assert.equal(player.gold, 850, "erken odendi");
  room.awardWaveEndBonusGold(8, false);
  assert.equal(player.gold, 1290);
  assert.deepEqual(player.goldDeposits, []);
  room.awardWaveEndBonusGold(9, false);
  assert.equal(player.gold, 1290, "iki kez odendi");
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
  assert.deepEqual(odenen, [0, 0, 0, 440]);
});

// ------------------------------------- 5b. Cekilis: epik hazirligi ve sahip olunan kilit

/** Kaynak girdisi: oyuncu ve kule basina sabit bonuslar. */
function kaynaklar({ player = {}, towers = [] } = {}) {
  return {
    player: (stat) => player[stat] ?? 0,
    towers: towers.map(([id, bonuses]) => ({ tower: kule(id), bonus: (stat) => bonuses[stat] ?? 0 }))
  };
}

test("epik kart kendi kaynak bonusuyla hazir; kaynak bonusu olmayan cevrim karti yatirim istiyor", () => {
  // Dort epik de bos kurulusta hazir: kendi kaynak bonusunu veriyor.
  for (const id of EPIC_IDS) assert.equal(isConversionCardReady(card(id), kaynaklar({ towers: [["warrior-1", {}]] })), true, id);
  assert.equal(isConversionCardReady(card("savas-hazinesi"), kaynaklar()), true, "kulesiz");
  // Genel kural yerinde: kaynak bonusu tasimayan bir cevrim karti yatirim istiyor.
  const ciplak = { ...card("tork-aktarimi"), effects: [] };
  assert.equal(isConversionCardReady(ciplak, kaynaklar({ towers: [["warrior-1", {}]] })), false, "yatirimsiz");
  assert.equal(isConversionCardReady(ciplak, kaynaklar({ towers: [["warrior-1", { turnRate: 0.3 }]] })), true);
  assert.equal(isConversionCardReady(ciplak, kaynaklar({ towers: [["warrior-2", { turnRate: 0.5 }]] })), false, "nisan almayan kulenin donusu sayilmiyor");
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

test("cekilis: epik kart yatirimsiz kurulusta da tam agirlikta; uymayan kule kurali yerinde", () => {
  const hazir = cekilisSay("tork-aktarimi", { sourceBonuses: kaynaklar({ towers: [["warrior-1", { turnRate: 0.6 }]] }) });
  const bos = cekilisSay("tork-aktarimi", { sourceBonuses: kaynaklar({ towers: [["warrior-1", {}]] }) });
  assert.ok(hazir > 40, `ornek kucuk: ${hazir}`);
  assert.ok(Math.abs(bos - hazir) < hazir * 0.35, `yatirimsiz geri cekildi: ${bos} / ${hazir}`);
  // Nisan almayan tek kuleli kurulusta Tork Aktarimi hala olu agirlik.
  let state = 5;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
  let uymayan = 0;
  for (let index = 0; index < 30_000; index += 1) {
    const [drawn] = drawCards({ count: 1, preferredAxes: ["dps", "economy"], towers: [kule("warrior-2")], ownedCardIds: [], random });
    if (drawn.id === "tork-aktarimi") uymayan += 1;
  }
  assert.ok(uymayan < hazir * 0.3, `uymayan kulede geri cekilmedi: ${uymayan} / ${hazir}`);
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

test("sunucu cekilisi kilidi esyadan gelen karti geri cekiyor, yatirimsiz epigi cekmiyor", () => {
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
  // Epik artik yatirimsiz da tam agirlikta (kendi kaynak bonusunu veriyor).
  const yatirimsiz = say(() => {}, "tork-aktarimi");
  const servolu = say((room) => kartAl(room, "servo-takviyesi"), "tork-aktarimi");
  assert.ok(servolu > 40, "ornek kucuk: " + servolu);
  assert.ok(yatirimsiz > servolu * 0.65, `yatirimsiz epik geri cekildi: ${yatirimsiz} / ${servolu}`);
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
  assert.deepEqual(player.goldDeposits, [{ dueWave: 6, amount: 440 }]);
  room.creativeToggleItem(client, { itemId: "vadeli-mevduat", on: true });
  assert.equal(player.goldDeposits.length, 2);
  room.creativeToggleItem(client, { itemId: "vadeli-mevduat", on: false });
  assert.equal(player.goldDeposits.length, 1);
  const once = player.gold;
  room.awardWaveEndBonusGold(6, false);
  assert.equal(player.gold - once, 440);
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

// ------------------------------------- 6. Altin kazanimi: iki kat, sonra dort kat

test("altin kazanimini artiran her kart ve esya dort kat (oldurme ve dalga altini): deger, metin ve sabit ayni", () => {
  const goldGain = {
    "ganimet-payi": 1.2, "kanli-kazanc": 2.8, "parali-asker": 2, "savas-hazinesi": 1.2,
    "ganimet-kesesi": 1.6, "altin-elek": 0.96
  };
  for (const [id, add] of Object.entries(goldGain)) {
    const entry = cardCatalog.find((candidate) => candidate.id === id) ?? item(id);
    near(getModifierAdd(entry.effects, "goldGain"), add, id);
    assert.ok(entry.description.startsWith(`Düşman altını +%${Math.round(add * 100)}`), `${id}: ${entry.description}`);
  }
  // Bedeller degismedi.
  near(getModifierAdd(card("kanli-kazanc").effects, "towerHealth"), -0.2);
  near(getModifierAdd(card("parali-asker").effects, "experienceGain"), -0.2);
  for (const id of ["muharebe-odenegi"]) near(getModifierAdd(card(id).effects, "waveIncome"), 160, id);
  near(getModifierAdd(item("darphane-modulu").effects, "waveIncome"), 160);
  assert.equal(CLEAN_WAVE_GOLD, 360);
  assert.equal(CRIT_KILL_GOLD, 24);
  assert.equal(GOLD_INTEREST_RATE, 0.16);
  assert.equal(RISKY_INVESTMENT_GOLD, 400);
  assert.equal(RISKY_INVESTMENT_NEXUS_COST, 10);
  assert.deepEqual(item("vadeli-mevduat").deposit, { payout: 440, waves: 4 });
  // Fiyatlar degismedi.
  const prices = { "ganimet-kesesi": 110, "altin-elek": 85, "sigorta-policesi": 120, "darphane-modulu": 80, "kelle-defteri": 70, "faiz-hesabi": 140, "vadeli-mevduat": 150, "riskli-yatirim": 0 };
  for (const [id, price] of Object.entries(prices)) assert.equal(item(id).price, price, id);
  assert.equal(item("faiz-hesabi").description, `Dalga sonunda altının %${Math.round(GOLD_INTEREST_RATE * 100)}'sını kazandırır.`);
  assert.equal(item("riskli-yatirim").description, `Dalga başına takımda 1 kez alınabilir: ${RISKY_INVESTMENT_NEXUS_COST} nexus canı karşılığı ${RISKY_INVESTMENT_GOLD} altın verir.`);
});

test("Faiz Hesabi gercek dalga kapanisinda %16 veriyor; tavan yok", () => {
  const kapanis = (gold) => {
    const room = oda();
    kur(room, "warrior-1");
    assert.ok(satinAl(room, "faiz-hesabi"));
    room.wave = 3;
    const player = room.state.players.get("p1");
    player.gold = gold;
    dalgayiKapat(room);
    return player.gold - gold - getWaveCompletionGold(3);
  };
  assert.equal(kapanis(300), Math.floor((300 + getWaveCompletionGold(3)) * 0.16));
  assert.equal(kapanis(5000), Math.floor((5000 + getWaveCompletionGold(3)) * 0.16), "eski 120 tavani kalkti");
});

/** Tohumlu Math.random ile `fn`'i calistirir (magaza yenilemesi zari). */
function tohumlu(seed, fn) {
  let state = seed;
  const gercek = Math.random;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  try {
    return fn();
  } finally {
    Math.random = gercek;
  }
}

/** Gercek yenileme yolundan `count` kez; Riskli Yatirim kac yenilemede sunuldu. */
function yenile(room, count, owner = client) {
  const player = room.state.players.get(owner.sessionId);
  let sunuldu = 0;
  room.setupPhase = true;
  for (let index = 0; index < count; index += 1) {
    player.shopRerolls = 0;
    room.rerollShop(owner);
    if (player.shopOffers.some((offer) => offer.id === "riskli-yatirim")) sunuldu += 1;
  }
  room.setupPhase = false;
  return sunuldu;
}

test("Riskli Yatirim 10 nexus cani karsiliginda 400 altin veriyor", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  room.teamHealth = 100;
  player.gold = 0;
  assert.ok(satinAl(room, "riskli-yatirim"));
  assert.equal(player.gold, RISKY_INVESTMENT_GOLD);
  assert.equal(room.teamHealth, 100 - RISKY_INVESTMENT_NEXUS_COST);
  assert.equal(room.riskyInvestmentWave, room.wave);
  // Nexus 10 ya da altindayken satilmiyor (yeni dalgada bile).
  room.wave += 1;
  room.teamHealth = RISKY_INVESTMENT_NEXUS_COST;
  assert.equal(satinAl(room, "riskli-yatirim"), false);
});

test("Riskli Yatirim dalga basina bir kez: yenileme onu geri getirmiyor, getirse de ikinci alim reddediliyor", () => {
  // Kontrol: alinmamisken ayni tohumla yenileme onu sunuyor (yani yenileme
  // gercekten geri getirebiliyordu).
  const kontrol = oda();
  kontrol.teamHealth = 100;
  kontrol.state.players.get("p1").gold = 1e12;
  const kontrolSayisi = tohumlu(17, () => yenile(kontrol, 300));
  assert.ok(kontrolSayisi > 0, "kontrol: yenileme Riskli Yatirim'i hic sunmadi, tohum degistir");

  const room = oda();
  const player = room.state.players.get("p1");
  room.teamHealth = 100;
  player.gold = 1e12;
  assert.ok(satinAl(room, "riskli-yatirim"));
  const altin = player.gold;
  assert.equal(tohumlu(17, () => yenile(room, 300)), 0, "alindiktan sonra yenileme yine sundu");
  // Vitrine elle konsa da (eski istemci, yaris) ikinci alim reddediliyor.
  assert.equal(satinAl(room, "riskli-yatirim"), false, "ikinci alim");
  assert.equal(room.teamHealth, 100 - RISKY_INVESTMENT_NEXUS_COST);
  // Hazirligin yeniden acilan vitrini de (kart secimi sonrasi) sunmuyor.
  tohumlu(17, () => {
    for (let index = 0; index < 200; index += 1) {
      room.openPlayerSetupShop("p1", player);
      assert.equal(player.shopOffers.some((offer) => offer.id === "riskli-yatirim"), false);
    }
  });
  assert.ok(player.gold <= altin, "ikinci alim altin verdi");

  // Sonraki dalgada yeniden alinabiliyor.
  room.wave += 1;
  assert.ok(tohumlu(17, () => yenile(room, 300)) > 0, "yeni dalgada sunulmuyor");
  assert.ok(satinAl(room, "riskli-yatirim"), "yeni dalgada alinamiyor");
});

test("Riskli Yatirim kaydi odada: yuva devri dalga sinirini sifirlamiyor", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  room.teamHealth = 100;
  assert.ok(satinAl(room, "riskli-yatirim"));
  room.transferPlayerSession("p1", "p9", player, player.name);
  const yeni = { sessionId: "p9", send() {} };
  assert.equal(room.state.players.get("p9"), player);
  assert.equal(room.riskyInvestmentWave, room.wave);
  assert.equal(satinAl(room, "riskli-yatirim", yeni), false, "devralan oturum ikinci kez aldi");
});

// ------------------------------------- 7. Isabet ve mermi hizi esyalari: bedelsiz, uc yeni sekil

const NEW_AIM_ITEMS = ["atalet-dengeleyici", "optik-hedefleyici", "irtifa-olcer"];
const NEW_SPEED_ITEMS = ["tungsten-cekirdek", "sessiz-mevzi", "gauss-bobini"];
const AIM_SPEED_STATS = new Set(["accuracy", "projectileSpeed", "accuracyVsAir", "projectileSpeedIsolated"]);

test("isabet ya da mermi hizi veren hicbir esya bir bedel tasimiyor", () => {
  const aimSpeedItems = shopCatalog.filter((entry) => entry.effects.some((modifier) => AIM_SPEED_STATS.has(modifier.stat) && modifier.add > 0));
  assert.ok(aimSpeedItems.length >= 16, `yalnizca ${aimSpeedItems.length}`);
  for (const entry of aimSpeedItems) {
    for (const modifier of entry.effects) assert.ok(modifier.add > 0, `${entry.id}: ${modifier.stat} ${modifier.add}`);
    assert.doesNotMatch(entry.description, /-%/, entry.id);
  }
  // Bedeli kaldirilan alti esya: yalnizca olumlu etkiler, fiyat ve kapsam ayni.
  const expected = {
    "nisan-durbunu": [["accuracy", 0.45]],
    "lazer-telemetre": [["accuracy", 0.5], ["range", 0.1]],
    "hassas-namlu": [["accuracy", 0.35], ["critDamage", 0.5]],
    "manyetik-ray": [["projectileSpeed", 0.9]],
    "genlesme-odasi": [["projectileSpeed", 0.6], ["range", 0.08]],
    "hafif-cekirdek": [["projectileSpeed", 1.5]]
  };
  for (const [id, effects] of Object.entries(expected)) {
    assert.deepEqual(item(id).effects.map((modifier) => [modifier.stat, modifier.add]), effects, id);
  }
  // Tema sayilari: isabet 9 esya (Termal Kilif kosullu, kilitle), mermi hizi 8.
  const aimItems = shopCatalog.filter((entry) => entry.id === "termal-kilif" || entry.effects.some((modifier) => (modifier.stat === "accuracy" || modifier.stat === "accuracyVsAir") && modifier.add > 0));
  const speedItems = shopCatalog.filter((entry) => entry.effects.some((modifier) => (modifier.stat === "projectileSpeed" || modifier.stat === "projectileSpeedIsolated") && modifier.add > 0));
  assert.equal(aimItems.length, 9, aimItems.map((entry) => entry.id).join(", "));
  assert.equal(speedItems.length, 8, speedItems.map((entry) => entry.id).join(", "));
});

test("yeni isabet ve mermi hizi esyalari: kapsam butun katalogda, yigin, fiyat, metin", () => {
  const expected = {
    "atalet-dengeleyici": [1, 120], "optik-hedefleyici": [1, 100], "irtifa-olcer": [2, 65],
    "tungsten-cekirdek": [1, 105], "sessiz-mevzi": [1, 70], "gauss-bobini": [3, 55]
  };
  for (const [id, [maxStacks, price]] of Object.entries(expected)) {
    const entry = item(id);
    assert.equal(entry.target, "tower", id);
    assert.equal(entry.category, "class", id);
    assert.equal(entry.price, price, id);
    assert.equal(entry.repeatable ? entry.maxStacks : 1, maxStacks, id);
    const owned = Array.from({ length: maxStacks }, () => id);
    assert.equal(isShopItemAvailable(entry, 5, owned.slice(0, -1)), true, id);
    assert.equal(isShopItemAvailable(entry, 5, owned), false, id);
    if (maxStacks > 1) assert.ok(entry.description.includes(`bir kuleye en fazla ${maxStacks} kez takılır`), id);
    for (const tower of allTowers) {
      const want = NEW_AIM_ITEMS.includes(id) ? towerFiresAlongFacing(tower) && !tower.resourceProvider : towerFiresProjectiles(tower);
      assert.equal(canEquipShopItem(entry, tower, []).ok, want, `${id} / ${tower.id}`);
    }
    assert.match(entry.description, NEW_AIM_ITEMS.includes(id) ? /; yalnızca nişan alan mermi ve çarpma kulelerine takılır\.$/ : /; yalnızca mermi atan kulelere takılır\.$/, id);
    for (const modifier of entry.effects) {
      const pattern = new RegExp(`${STAT_LABEL[modifier.stat]}\\S*\\s\\+%${yuzde(modifier.add)}(?!\\d)`, "i");
      assert.match(entry.description, pattern, `${id}: ${modifier.stat}`);
    }
  }
  // Isin kulelerine takilmiyor.
  for (const id of [...NEW_AIM_ITEMS, ...NEW_SPEED_ITEMS]) assert.equal(canEquipShopItem(item(id), kule("warrior-5"), []).ok, false, id);
});

test("Atalet Dengeleyici ve Optik Hedefleyici koniyi daraltiyor, ikincil stat kuleye ulasiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "atalet-dengeleyici"));
  // %60: 20 derece -> 8 derece.
  assert.equal(koniIcinde(room, tower, 8.5), false);
  assert.equal(koniIcinde(room, tower, 7.5), true);
  const optikli = kur(room, "warrior-4");
  const kritik = room.getTowerCritChance(optikli);
  assert.ok(esyaTak(room, optikli, "optik-hedefleyici"));
  assert.equal(koniIcinde(room, optikli, 14.5), false);
  assert.equal(koniIcinde(room, optikli, 13.5), true);
  near(room.getTowerCritChance(optikli) - kritik, 0.08, "kritik sansi");
});

test("Irtifa Olcer yalnizca ucan hedefe donuk namluda koniyi daraltiyor; iki kopya toplaniyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "irtifa-olcer"));
  /** Namlu 0'da, hedef verilen acida ve verilen turde; donmeden hizali mi. */
  const hizali = (aci, overrides) => {
    const enemy = dusman(room, tower, { x: tower.x + 100 * Math.cos(derece(aci)), y: tower.y + 100 * Math.sin(derece(aci)), ...overrides });
    tower.facing = 0;
    return room.aimTowerAt(tower, enemy, 0);
  };
  assert.equal(hizali(10, { movementKind: "ground" }), true, "yer hedefinde koni daraldi");
  // %60: 20 -> 8 derece.
  assert.equal(hizali(8.5, { movementKind: "air" }), false, "ucan hedefte koni daralmadi");
  assert.equal(hizali(7.5, { movementKind: "air" }), true);
  assert.ok(esyaTak(room, tower, "irtifa-olcer"));
  // %120 -> isabet tavani 1.0: koni tabanina (0,5 derece) iniyor.
  assert.equal(hizali(1, { movementKind: "air" }), false);
  // Epik cevrim ucan hedefte gercek isabeti okuyor: 1,2 -> %100 ustu 0,2.
  kartAl(room, "balistik-hesaplayici");
  room.aimTowerAt(tower, dusman(room, tower, { x: tower.x, y: tower.y + 100, movementKind: "ground" }), 0);
  const sade = room.getTowerDamage(tower);
  const enemy = dusman(room, tower, { x: tower.x, y: tower.y + 100, movementKind: "air" });
  room.aimTowerAt(tower, enemy, 0);
  // Yerde 0,5 (kart) -> +%10; ucanda 0,5 + 1,2 = 1,7 -> +%50 (tavan).
  near(room.getTowerDamage(tower) / sade, 1.5 / 1.1, "ucan hedefte Balistik");
});

test("Tungsten Cekirdek ve Gauss Bobini mermiyi hizlandiriyor, ikincil stat kuleye ulasiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = mermiHizi(room, tower);
  assert.ok(esyaTak(room, tower, "tungsten-cekirdek"));
  near(mermiHizi(room, tower), sade * 1.5);
  near(getModifierAdd(room.getTowerRunModifiers(tower), "critDamage"), 0.4);
  const bobinli = kur(room, "warrior-4");
  const bobinSade = mermiHizi(room, bobinli);
  const menzil = room.getTowerRange(bobinli);
  for (let index = 0; index < 3; index += 1) assert.ok(esyaTak(room, bobinli, "gauss-bobini"));
  near(mermiHizi(room, bobinli), bobinSade * 1.6, "uc bobin");
  near(room.getTowerRange(bobinli), menzil * 1.09, "uc bobin menzil");
});

test("Sessiz Mevzi yalnizca komsusuz kulede mermiyi %120 hizlandiriyor; Kin dalgasi ve Kinetik Erim de goruyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = mermiHizi(room, tower);
  assert.ok(esyaTak(room, tower, "sessiz-mevzi"));
  room.isTowerIsolated = () => true;
  near(mermiHizi(room, tower), sade * 2.2, "komsusuz");
  room.isTowerIsolated = () => false;
  near(mermiHizi(room, tower), sade, "komsulu");
  // Kinetik Erim gercek (kosullu) hizi okuyor: +%120 -> menzil +%20 (tavan).
  // (Atakan pasifi de komsusuzlukta menzili buyuttugu icin olcum hep komsusuzken.)
  room.isTowerIsolated = () => true;
  const menzil = room.getTowerRange(tower);
  kartAl(room, "kinetik-erim");
  near(room.getTowerRange(tower) / menzil, 1.2, "komsusuzken Kinetik Erim");

  const zeynep = oda("zeynep");
  const kin = kur(zeynep, "zeynep-6");
  const kinSade = mermiHizi(zeynep, kin);
  assert.ok((() => {
    const player = zeynep.state.players.get("p1");
    player.ownedShopItemIds.push("sessiz-mevzi");
    player.inventoryItemIds.push("sessiz-mevzi");
    zeynep.equipShopItem(client, { itemId: "sessiz-mevzi", towerId: kin.id });
    return kin.equippedShopItemIds.includes("sessiz-mevzi");
  })());
  zeynep.isTowerIsolated = () => true;
  near(mermiHizi(zeynep, kin), kinSade * 2.2, "Kin dalgasi");
});

test("Sessiz Mevzi gercek yerlesimde komsuluk kuralini kullaniyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.equal(room.isTowerIsolated(tower), true, "tek kule komsusuz degil");
  const sade = (() => { const enemy = dusman(room, tower); room.spawnTowerProjectile(tower, enemy); const p = [...room.projectiles.values()].at(-1); return Math.hypot(p.vx, p.vy); })();
  assert.ok(esyaTak(room, tower, "sessiz-mevzi"));
  near(mermiHizi(room, tower), sade * 2.2);
});

test("yalnizca esyalarla en yuksek isabet: Balistik tavani esyayla uc pahali yuva istiyor (kartlar haric)", () => {
  const facingItems = shopCatalog.filter((entry) => entry.target === "tower" && entry.effects.some((modifier) => modifier.stat === "accuracy"));
  // Kule basina 5 yuva; kosulsuz isabetin en buyuk bes esyasi (kopyalar dahil).
  const slots = facingItems.flatMap((entry) => Array.from({ length: entry.repeatable ? entry.maxStacks : 1 }, () => getModifierAdd(entry.effects, "accuracy"))).sort((a, b) => b - a);
  const best = (count) => slots.slice(0, count).reduce((sum, value) => sum + value, 0);
  near(best(5), 2.2, "bes yuvada kosulsuz isabet");
  assert.ok(best(2) < 1.5, "kartsiz iki esya Balistik tavanina ulasmamali");
  assert.ok(best(3) >= 1.5, "kartsiz uc esyayla ulasilabilmeli");
  // Kartlar da isabet veriyor: esya yuku buradaki sayidan az olabilir. Iddia
  // yalnizca esya tarafi icin.
});

test("isabetten kritik ucan hedef payini vurulan dusmandan okuyor, namlunun o anki yonunden degil", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "goz-karari");
  assert.ok(esyaTak(room, tower, "irtifa-olcer"));
  /** Namluyu bir dusmana cevirir, sonra baska bir dusmani vurur; kritik geldi mi. */
  const kritikMi = (namlu, vurulan, zar) => {
    room.aimTowerAt(tower, dusman(room, tower, { x: tower.x, y: tower.y + 100, movementKind: namlu }), 0);
    const olc = (value) => {
      const enemy = dusman(room, tower, { movementKind: vurulan, type: "grunt" });
      room.towerCriticalRandom = () => value;
      const once = enemy.hp;
      room.damageEnemy(enemy, 100, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
      return once - enemy.hp;
    };
    return olc(zar) > olc(1) + 1e-6;
  };
  // Ucan hedefe +%60 isabet -> kritik +%18; taban %1. Zar 0,15 yalnizca payla gelir.
  assert.equal(kritikMi("ground", "air", 0.15), true, "namlu yere donukken ucana vurus payi almadi");
  assert.equal(kritikMi("air", "ground", 0.15), false, "namlu ucana donukken yere vurus payi aldi");
  assert.equal(kritikMi("air", "air", 0.15), true);
  assert.equal(kritikMi("ground", "ground", 0.15), false);
  // Ates konisi ates anindaki namlu hedefine bakmaya devam ediyor (Irtifa Olcer testi).
});

// ------------------------------------- 8. Riskli Yatirim: takimda dalga basina bir kez

test("co-op: Riskli Yatirim'i takimda bir kisi aliyor; oteki reddediliyor, vitrininden ve yenilemelerinden dusuyor", () => {
  const room = oda();
  const yayinlar = [];
  room.broadcast = (type, payload) => yayinlar.push({ type, payload });
  const p2 = ikinciOyuncu(room);
  const ikinci = { sessionId: "p2", send() {} };
  room.clients = [client, ikinci];
  room.teamHealth = 100;
  const p1 = room.state.players.get("p1");
  p1.gold = 1e12;
  p2.gold = 1e12;
  // Ikinci oyuncunun vitrininde de var.
  p2.shopOffers = [item("riskli-yatirim"), item("altin-elek")];
  assert.ok(satinAl(room, "riskli-yatirim"));
  assert.equal(room.teamHealth, 100 - RISKY_INVESTMENT_NEXUS_COST);
  // Bildirim: kim aldi, bedel ve kazanc.
  const notice = yayinlar.find((entry) => entry.type === "shop:risky-investment");
  assert.deepEqual(notice?.payload, { buyerId: "p1", nexusCost: RISKY_INVESTMENT_NEXUS_COST, gold: RISKY_INVESTMENT_GOLD });
  // Ikincinin vitrininden dustu, oteki teklif yerinde.
  assert.deepEqual(p2.shopOffers.map((offer) => offer.id), ["altin-elek"]);
  // Sunucu ikinci alimi reddediyor (vitrine elle konsa da).
  const altin = p2.gold;
  assert.equal(satinAl(room, "riskli-yatirim", ikinci), false);
  assert.equal(p2.gold, altin);
  assert.equal(room.teamHealth, 100 - RISKY_INVESTMENT_NEXUS_COST, "takim iki kez odedi");
  // Yenilemeler de sunmuyor (kontrol ayni tohumla sunuyordu; bkz. yukaridaki test).
  assert.equal(tohumlu(17, () => yenile(room, 300, ikinci)), 0);
  // Sonraki dalgada ikinci oyuncu alabiliyor.
  room.wave += 1;
  const yenilemeSonrasi = p2.gold;
  assert.ok(satinAl(room, "riskli-yatirim", ikinci));
  assert.equal(p2.gold, yenilemeSonrasi + RISKY_INVESTMENT_GOLD);
});

test("solo: Riskli Yatirim dalga basina bir kez, sonraki dalga yine aliniyor", () => {
  const room = oda();
  room.teamHealth = 100;
  assert.ok(satinAl(room, "riskli-yatirim"));
  assert.equal(satinAl(room, "riskli-yatirim"), false);
  room.wave += 1;
  assert.ok(satinAl(room, "riskli-yatirim"));
  assert.equal(room.teamHealth, 100 - 2 * RISKY_INVESTMENT_NEXUS_COST);
});

test("Riskli Yatirim bildirimi: metin ve istemci kablosu", async () => {
  assert.deepEqual(getRiskyInvestmentNoticeText("Atakan", 10, 400), { title: "Atakan Riskli Yatırım aldı", detail: "nexus −10, +400 altın" });
  assert.equal(getRiskyInvestmentNoticeText(undefined, 10, 400).title, "Takım arkadaşın Riskli Yatırım aldı");
  const scene = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(scene.includes(`room.onMessage("shop:risky-investment"`), "istemci mesaji dinlemiyor");
  const handler = scene.slice(scene.indexOf("  private receiveRiskyInvestment("), scene.indexOf("  private receiveServerLinkJoined("));
  assert.ok(handler.includes("message.buyerId === this.localSessionId"), "alan kendi bildirimini goruyor");
  assert.ok(handler.includes(`this.game.events.emit("game:hud-team-notice"`), "takim bildirimi kanali kullanilmiyor");
});

// ------------------------------------- 9. Ayni ailede baskin esya yok

/**
 * A, B'yi baskilar: A'nin isledigi etkili kuleler B'ninkileri kapsiyor, A her
 * etkide (ve kilitte) en az B kadar veriyor ve ilk alim fiyati en fazla
 * B'ninki kadar. Yigin sayisi bilerek sayilmiyor: kule basina 5 yuva var ve
 * yuva basina daha iyi olan esya, yigilabilen zayif esyayi da bosa cikariyor. Etkili kule: statin is gordugu kule
 * (isabet: namlu yonunde atan, mermi hizi: mermi atan); Nisangah ve Hafif
 * Muhimmat her kuleye takiliyor ama ancak orada bir sey yapiyor.
 */
function baskinCiftler(items, etkili) {
  const towers = allTowers.filter(etkili);
  const applies = (entry) => new Set(towers.filter((tower) => canEquipShopItem(entry, tower, []).ok).map((tower) => tower.id));
  const values = (entry) => {
    const map = new Map();
    for (const modifier of entry.effects) map.set(modifier.stat, (map.get(modifier.stat) ?? 0) + modifier.add);
    for (const unlock of entry.unlocks ?? []) map.set(`unlock:${unlock}`, 1);
    // Vadeli altin etki listesinde degil, kendi alaninda.
    if (entry.deposit) map.set("deposit", entry.deposit.payout);
    return map;
  };
  const pairs = [];
  for (const a of items) {
    for (const b of items) {
      if (a === b) continue;
      const [ta, tb] = [applies(a), applies(b)];
      if (![...tb].every((id) => ta.has(id))) continue;
      const [va, vb] = [values(a), values(b)];
      const covers = [...vb].every(([stat, value]) => (va.get(stat) ?? 0) >= value);
      if (covers && a.price <= b.price) pairs.push(`${a.id} > ${b.id}`);
    }
  }
  return pairs;
}

test("isabet ve mermi hizi ailelerinde hicbir esya bir digerince baskilanmiyor", () => {
  const aim = shopCatalog.filter((entry) => entry.id === "termal-kilif" || entry.effects.some((modifier) => (modifier.stat === "accuracy" || modifier.stat === "accuracyVsAir") && modifier.add > 0));
  const speed = shopCatalog.filter((entry) => entry.effects.some((modifier) => (modifier.stat === "projectileSpeed" || modifier.stat === "projectileSpeedIsolated") && modifier.add > 0));
  assert.equal(aim.length, 9);
  assert.equal(speed.length, 8);
  assert.deepEqual(baskinCiftler(aim, (tower) => towerFiresAlongFacing(tower) && !tower.resourceProvider), []);
  assert.deepEqual(baskinCiftler(speed, (tower) => towerFiresProjectiles(tower)), []);
  // Kontrol: eski fiyatlarla bulunan iki baskin cift gercekten yakalaniyor.
  const eski = (id, price) => ({ ...item(id), price });
  assert.deepEqual(baskinCiftler([eski("nisan-durbunu", 90), eski("nisangah", 95)], (tower) => towerFiresAlongFacing(tower)).sort(), ["nisan-durbunu > nisangah"]);
  assert.ok(baskinCiftler([eski("hafif-cekirdek", 85), eski("manyetik-ray", 90)], (tower) => towerFiresProjectiles(tower)).includes("hafif-cekirdek > manyetik-ray"));
});

// ------------------------------------- 10. Altin primleri

const BOUNTY_ITEMS = ["odul-fermani", "dusurme-primi", "savas-tazminati", "toplu-imha-primi", "artik-enerji-toplayici"];

test("altin primleri: metin = etki, tavan yok, bedelsiz, kapsam", () => {
  const text = {
    "odul-fermani": `Bir şampiyon düşman öldüğünde (kim öldürürse öldürsün) +${getModifierAdd(item("odul-fermani").effects, "championGold")} altın.`,
    "dusurme-primi": `Takıldığı kulenin öldürdüğü her uçan düşman +${getModifierAdd(item("dusurme-primi").effects, "airKillGold")} altın verir.`,
    "savas-tazminati": `Takıldığı kule dalga sonunda o dalga verdiği her ${DAMAGE_GOLD_PER_DAMAGE} hasar için +${getModifierAdd(item("savas-tazminati").effects, "damageGold")} altın kazandırır.`,
    "toplu-imha-primi": `Takıldığı kule ${MULTI_KILL_GOLD_WINDOW_MS / 1000} saniye içinde ${MULTI_KILL_GOLD_COUNT} düşman öldürdüğünde +${getModifierAdd(item("toplu-imha-primi").effects, "multiKillGold")} altın verir.`,
    "artik-enerji-toplayici": `Takıldığı kulenin öldürücü vuruşlarında hedefin canını aşan hasarın %${Math.round(getModifierAdd(item("artik-enerji-toplayici").effects, "overkillGold") * 100)}'si altına dönüşür.`
  };
  const prices = { "odul-fermani": 120, "dusurme-primi": 75, "savas-tazminati": 90, "toplu-imha-primi": 85, "artik-enerji-toplayici": 70 };
  for (const id of BOUNTY_ITEMS) {
    const entry = item(id);
    assert.equal(entry.description, text[id], id);
    assert.equal(entry.price, prices[id], id);
    assert.equal(entry.category, "utility", id);
    assert.equal(entry.repeatable, false, id);
    assert.ok(entry.effects.length === 1 && entry.effects[0].add > 0, `${id}: tek, olumlu etki`);
  }
  assert.equal(item("odul-fermani").target, "global");
  assert.ok(GLOBAL_SHOP_ITEM_IDS.includes("odul-fermani"));
  for (const id of BOUNTY_ITEMS.slice(1)) {
    assert.equal(item(id).target, "tower", id);
    for (const tower of allTowers) assert.equal(canEquipShopItem(item(id), tower, []).ok, towerDealsDamage(tower), `${id} / ${tower.id}`);
  }
  const names = shopCatalog.map((entry) => entry.name);
  for (const id of BOUNTY_ITEMS) assert.equal(names.filter((name) => name === item(id).name).length, 1, id);
});

test("hicbir altin karti ya da esyasi dalga basina tavan yazmiyor", () => {
  for (const entry of [...cardCatalog, ...shopCatalog]) assert.doesNotMatch(entry.description, /dalga başına en fazla \d+ altın/, entry.id);
});

test("altin ailesinde baskin esya yok (karsilastirilabilir olanlar)", () => {
  const gold = shopCatalog.filter((entry) => ["altin-elek", "ganimet-kesesi", "sigorta-policesi", "darphane-modulu", "kelle-defteri", "faiz-hesabi", "vadeli-mevduat", ...BOUNTY_ITEMS, ...BOUNTY_ITEMS_2].includes(entry.id));
  assert.equal(gold.length, 16);
  assert.deepEqual(baskinCiftler(gold, () => true), []);
  // Altin kartlari: ayni olcu (yigin yok, kuresel; fiyat yerine nadirlik).
  const rank = { common: 0, uncommon: 1, rare: 2, epic: 3 };
  const goldCards = cardCatalog.filter((entry) => ["ganimet-payi", "kanli-kazanc", "parali-asker", "muharebe-odenegi", "temiz-sicil", "kelle-parasi", ...BOUNTY_CARDS].includes(entry.id));
  assert.equal(goldCards.length, 10);
  const asItems = goldCards.map((entry) => ({ ...entry, target: "global", price: rank[getCardRarity(entry)], repeatable: entry.stackable }));
  assert.deepEqual(baskinCiftler(asItems, () => true), []);
});

/** Sampiyon dusman: yerine gectigi tek dogumun altini ve tecrubesiyle. */
function sampiyon(room, tower) {
  const enemy = dusman(room, tower, { hp: 1, maxHp: 1, type: "brute", movementKind: "ground" });
  enemy.champion = { type: "brute", gold: 50, exp: 5, reputation: 0, replaced: 1, leadSlots: 0, hpMultiple: 1, leakDamage: 1, spawnedAt: Date.now() };
  return enemy;
}

test("Odul Fermani: her sampiyon olunce +600, tavan yok; co-op'ta yalnizca sahibine", () => {
  const room = oda();
  const p2 = ikinciOyuncu(room);
  const tower = kur(room, "warrior-4");
  assert.ok(satinAl(room, "odul-fermani"));
  const p1 = room.state.players.get("p1");
  const oldurSampiyon = () => {
    const [a, b] = [p1.gold, p2.gold];
    room.towerCriticalRandom = () => 1;
    const enemy = sampiyon(room, tower);
    assert.equal(room.damageEnemy(enemy, 1e6, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id), true);
    return [p1.gold - a, p2.gold - b];
  };
  const [ilk, arkadas] = oldurSampiyon();
  assert.equal(ilk - arkadas, 600, "sahibi takim arkadasindan 600 fazla almadi");
  const [ikinci, arkadas2] = oldurSampiyon();
  assert.equal(ikinci - arkadas2, 600, "ayni dalgadaki ikinci sampiyon da oduyor (tavan yok)");
  room.wave += 1;
  const [yeni, arkadas3] = oldurSampiyon();
  assert.equal(yeni - arkadas3, 600, "yeni dalgada prim yok");
  // Sampiyonu takim arkadasinin kulesi oldurse de sahibi aliyor.
  room.wave += 1;
  const ikinciKule = kur(room, "warrior-6", { sessionId: "p2", send() {} });
  const once = p1.gold;
  const enemy = sampiyon(room, ikinciKule);
  room.damageEnemy(enemy, 1e6, 0, ikinciKule.definition.id, "p2", "true", 0, ikinciKule.level, ikinciKule.id);
  assert.equal(p1.gold - once, 600 + 50, "takim arkadasinin oldurdugu sampiyonda prim yok");
});

test("Dusurme Primi: her ucan oldurme +32, tavan yok, yalnizca takildigi kule", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const oteki = kur(room, "warrior-4");
  assert.ok(esyaTak(room, tower, "dusurme-primi"));
  const player = room.state.players.get("p1");
  const altin = (kule, movementKind) => {
    const once = player.gold;
    room.towerCriticalRandom = () => 1;
    const enemy = dusman(room, kule, { hp: 1, maxHp: 1, reward: 20, type: "grunt", movementKind });
    assert.equal(room.damageEnemy(enemy, 1e6, 0, kule.definition.id, "p1", "true", 0, kule.level, kule.id), true);
    return player.gold - once;
  };
  const yer = altin(tower, "ground");
  assert.equal(altin(tower, "air") - yer, 32);
  assert.equal(altin(oteki, "air") - altin(oteki, "ground"), 0, "baska kuleye isledi");
  let toplam = 32;
  for (let index = 0; index < 30; index += 1) toplam += altin(tower, "air") - yer;
  assert.equal(toplam, 32 * 31, "eski 80 tavani kalkti");
});

test("Savas Tazminati: dalga sonunda her 1000 hasara +40, tavan yok, sayac sifirlaniyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const oteki = kur(room, "warrior-4");
  assert.ok(esyaTak(room, tower, "savas-tazminati"));
  const player = room.state.players.get("p1");
  const vur = (kule, hasar) => {
    room.towerCriticalRandom = () => 1;
    const enemy = dusman(room, kule);
    room.damageEnemy(enemy, hasar, 0, kule.definition.id, "p1", "true", 0, kule.level, kule.id);
  };
  const kapanis = () => {
    const once = player.gold;
    room.awardWaveEndBonusGold(room.wave, false);
    return player.gold - once;
  };
  vur(tower, 2500);
  vur(oteki, 9000);
  assert.equal(kapanis(), 80, "2500 hasar -> 2 x 40; oteki kule odenmemeli");
  assert.equal(tower.waveDamageDealt, 0);
  assert.equal(oteki.waveDamageDealt, 0, "primsiz kulenin sayaci da sifirlanmali");
  assert.equal(kapanis(), 0, "sayac sifirlanmadi");
  vur(tower, 50_000);
  assert.equal(kapanis(), 2000, "eski 60 tavani kalkti");
});

test("Toplu Imha Primi: 2 saniyede 3 oldurme +60, iki oldurme hicbir sey, tavan yok", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "toplu-imha-primi"));
  const player = room.state.players.get("p1");
  const gercekNow = Date.now;
  let simdi = gercekNow();
  Date.now = () => simdi;
  try {
    const oldur1 = () => {
      room.towerCriticalRandom = () => 1;
      const enemy = dusman(room, tower, { hp: 1, maxHp: 1, reward: 20, type: "grunt", movementKind: "ground" });
      room.damageEnemy(enemy, 1e6, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
    };
    const tekOldurme = (() => { const once = player.gold; oldur1(); return player.gold - once; })();
    simdi += MULTI_KILL_GOLD_WINDOW_MS + 1;
    // Pencere disinda iki, sonra pencere icinde uc.
    let once = player.gold;
    oldur1(); simdi += 1500; oldur1(); simdi += 1500; oldur1();
    assert.equal(player.gold - once - 3 * tekOldurme, 0, "pencere disi oldurmeler prim verdi");
    simdi += MULTI_KILL_GOLD_WINDOW_MS + 1;
    once = player.gold;
    oldur1(); simdi += 500; oldur1(); simdi += 500; oldur1();
    assert.equal(player.gold - once - 3 * tekOldurme, 60);
    // Ucuncuden sonra sayac sifirlaniyor: dorduncu tek basina prim degil.
    once = player.gold;
    simdi += 100;
    oldur1();
    assert.equal(player.gold - once - tekOldurme, 0);
    // Tavan yok: 30 oldurmede (bir artikla) 10 uclu, hepsi oduyor.
    once = player.gold;
    for (let index = 0; index < 30; index += 1) { simdi += 10; oldur1(); }
    assert.equal(player.gold - once - 30 * tekOldurme, 10 * 60);
  } finally {
    Date.now = gercekNow;
  }
});

test("Artik Enerji Toplayici: tasan hasarin %20'si, tavan yok; oldurmeyen vurus hicbir sey", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "artik-enerji-toplayici"));
  const player = room.state.players.get("p1");
  const vur = (hp, hasar) => {
    room.towerCriticalRandom = () => 1;
    const enemy = dusman(room, tower, { hp, maxHp: hp, reward: 20, type: "grunt", movementKind: "ground" });
    const once = player.gold;
    const oldu = room.damageEnemy(enemy, hasar, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
    return { oldu, altin: player.gold - once };
  };
  const tam = vur(100, 100);
  assert.equal(tam.oldu, true);
  const tasan = vur(400, 600);
  near(tasan.altin - tam.altin, 200 * 0.2, "200 tasan hasar");
  assert.equal(vur(1000, 300).altin, 0, "oldurmeyen vurus");
  let toplam = 40;
  for (let index = 0; index < 10; index += 1) toplam += vur(1000, 2000).altin - tam.altin;
  near(toplam, 40 + 10 * 200, "eski 50 tavani kalkti");
});

test("Artik Enerji Toplayici: tasan hasar vurus basina azami canla sinirli; infaz sayilmiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "artik-enerji-toplayici"));
  const player = room.state.players.get("p1");
  const vur = (hp, hasar, kaynak = tower.definition.id) => {
    room.towerCriticalRandom = () => 1;
    const enemy = dusman(room, tower, { hp, maxHp: hp, reward: 20, type: "grunt", movementKind: "ground" });
    const once = player.gold;
    room.damageEnemy(enemy, hasar, 0, kaynak, "p1", "true", 0, tower.level, tower.id);
    return player.gold - once;
  };
  const tam = vur(100, 100);
  // Zayif hedefe dev vurus: tasan hasar 100 (azami can) sayiliyor, 999.900 degil.
  near(vur(100, 1_000_000) - tam, 100 * 0.2, "vurus basina sinir");
  // Oluler Bagi'nin infazi: yapay hasar, prim yok.
  const infaz = room.state.players.get("p1").gold;
  room.towerCriticalRandom = () => 1;
  const enemy = dusman(room, tower, { hp: 100, maxHp: 100, reward: 20, type: "grunt", movementKind: "ground" });
  room.damageEnemy(enemy, enemy.hp + enemy.shield + enemy.maxHp + 1, 0, "archer-4-underworld-execute", "p1", "true", 0, tower.level, tower.id, "focus");
  near(player.gold - infaz, tam, "infaz tasan hasar primi verdi");
});

test("Savas Tazminati sayaci eksiye dusmuyor: cani bitmis hedefe vurus sayilmiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "savas-tazminati"));
  const enemy = dusman(room, tower);
  enemy.hp = -50;
  room.towerCriticalRandom = () => 1;
  room.damageEnemy(enemy, 10, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
  assert.equal(tower.waveDamageDealt, 0);
  const canli = dusman(room, tower);
  room.damageEnemy(canli, 1500, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
  assert.equal(tower.waveDamageDealt, 1500);
});

test("yuva devrinden sonra kule primi kulenin yeni sahibine; Melis'in dusman sahipleri de tasiniyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "dusurme-primi"));
  const player = room.state.players.get("p1");
  const lanetli = dusman(room, tower);
  Object.assign(lanetli, { melisCurseOwnerId: "p1", melisUndeadOwnerId: "p1", melisWhisperTurnedOwnerId: "p1" });
  room.transferPlayerSession("p1", "p9", player, player.name);
  assert.equal(tower.ownerId, "p9");
  assert.deepEqual([lanetli.melisCurseOwnerId, lanetli.melisUndeadOwnerId, lanetli.melisWhisperTurnedOwnerId], ["p9", "p9", "p9"]);
  // Oldurme eski kimlikle gelse de (devirden once baslamis bir etki) prim kulenin sahibine.
  const once = player.gold;
  room.towerCriticalRandom = () => 1;
  const ucan = dusman(room, tower, { hp: 1, maxHp: 1, reward: 20, type: "grunt", movementKind: "air" });
  room.damageEnemy(ucan, 1e6, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
  assert.ok(player.gold - once >= 32, "prim kayboldu");
  const ikinci = player.gold;
  const yer = dusman(room, tower, { hp: 1, maxHp: 1, reward: 20, type: "grunt", movementKind: "ground" });
  room.damageEnemy(yer, 1e6, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
  near((ikinci - once) - (player.gold - ikinci), 32, "ucan ile yer farki 32 degil");
});

test("co-op: kule primleri yalnizca kulenin sahibine", () => {
  const room = oda();
  const p2 = ikinciOyuncu(room);
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "dusurme-primi"));
  const p1 = room.state.players.get("p1");
  const [a, b] = [p1.gold, p2.gold];
  room.towerCriticalRandom = () => 1;
  const enemy = dusman(room, tower, { hp: 1, maxHp: 1, reward: 20, type: "grunt", movementKind: "air" });
  room.damageEnemy(enemy, 1e6, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
  assert.equal((p1.gold - a) - (p2.gold - b), 32);
});

// ------------------------------------- 11. Altin primleri, ikinci tur

const BOUNTY_CARDS = ["garnizon-maasi", "terfi-ikramiyesi", "agir-hedef-odulu", "yavas-olum-primi"];
const BOUNTY_ITEMS_2 = ["ates-hatti-primi", "soguk-av-kaydi", "ikmal-senedi", "uzak-menzil-primi"];

test("ikinci tur altin primleri: metin = etki, tavan yok, bedelsiz, kapsam", () => {
  const add = (entry, stat) => getModifierAdd(entry.effects, stat);
  const texts = {
    "garnizon-maasi": (e) => `Dalga sonunda ayakta olan her hasar veren kulen için +${add(e, "garrisonGold")} altın.`,
    "terfi-ikramiyesi": (e) => `Her kule geliştirmende +${add(e, "upgradeGold")} altın.`,
    "agir-hedef-odulu": (e) => `Öldürdüğün her brute ve kuşatma düşmanı +${add(e, "heavyKillGold")} altın verir.`,
    "yavas-olum-primi": (e) => `Yanma ve kanamanla ölen her düşman +${add(e, "statusKillGold")} altın verir.`,
    "ates-hatti-primi": (e) => `Takıldığı kule sıcaklığı ${HOT_KILL_TEMPERATURE} derece ya da üstündeyken öldürdüğü her düşman için (yanma ve kanamasıyla ölenler dahil) +${add(e, "hotKillGold")} altın verir.`,
    "soguk-av-kaydi": (e) => `Takıldığı kulenin öldürdüğü her yavaşlamış düşman (yanma ve kanamasıyla ölenler dahil) +${add(e, "slowedKillGold")} altın verir.`,
    "ikmal-senedi": (e) => `Takıldığı kuleye teslim edilen her ${DELIVERY_GOLD_AMMO_UNIT} mühimmat ya da ${DELIVERY_GOLD_ENERGY_UNIT} enerji için +${add(e, "deliveryGold")} altın verir.`,
    "uzak-menzil-primi": (e) => `Takıldığı kulenin menzilinin dış dörtte birinde vurarak öldürdüğü her düşman +${add(e, "longRangeKillGold")} altın verir; menzili haritayı kaplayan kulelere takılmaz.`
  };
  assert.equal(LONG_RANGE_KILL_FRACTION, 0.75, "metin 'dis dortte bir' diyor");
  for (const id of BOUNTY_CARDS) {
    const entry = card(id);
    assert.equal(entry.description, texts[id](entry), id);
    assert.equal(entry.scope.kind, "global", id);
    assert.equal(entry.stackable, false, id);
    assert.equal(getCardTowerReach(entry), "none", id);
    assert.ok(entry.effects.length === 1 && entry.effects[0].add > 0, id);
  }
  assert.equal(getCardRarity(card("garnizon-maasi")), "common");
  assert.equal(getCardRarity(card("terfi-ikramiyesi")), "common");
  assert.equal(getCardRarity(card("agir-hedef-odulu")), "uncommon");
  assert.equal(getCardRarity(card("yavas-olum-primi")), "uncommon");
  const prices = { "ates-hatti-primi": 70, "soguk-av-kaydi": 70, "ikmal-senedi": 75, "uzak-menzil-primi": 75 };
  for (const id of BOUNTY_ITEMS_2) {
    const entry = item(id);
    assert.equal(entry.description, texts[id](entry), id);
    assert.equal(entry.price, prices[id], id);
    assert.equal(entry.target, "tower", id);
    assert.equal(entry.category, "utility", id);
    assert.equal(entry.repeatable, false, id);
    assert.ok(entry.effects.length === 1 && entry.effects[0].add > 0, id);
    const fits = (tower) => towerDealsDamage(tower) && (id !== "uzak-menzil-primi" || towerHasBoundedRange(tower));
    for (const tower of allTowers) assert.equal(canEquipShopItem(entry, tower, []).ok, fits(tower), `${id} / ${tower.id}`);
  }
  // Menzili haritayi kaplayan Sunucu'ya Uzak Menzil takilmiyor; Debug Lazer'e takiliyor (asiri yukleme calisirken ayiklaniyor).
  assert.equal(canEquipShopItem(item("uzak-menzil-primi"), kule("warrior-2"), []).ok, false);
  assert.equal(canEquipShopItem(item("uzak-menzil-primi"), kule("warrior-5"), []).ok, true);
  const names = [...cardCatalog, ...shopCatalog].map((entry) => entry.name);
  for (const entry of [...BOUNTY_CARDS.map(card), ...BOUNTY_ITEMS_2.map(item)]) assert.equal(names.filter((name) => name === entry.name).length, 1, entry.id);
});

/** Odayi ve oyuncuyu hazirlayip bir kulenin tek vurusta oldurmesi; kazanilan altin. */
function oldurAltin(room, tower, overrides = {}, kaynak = tower.definition.id, owner = tower.ownerId) {
  const player = room.state.players.get(owner);
  const once = player.gold;
  room.towerCriticalRandom = () => 1;
  const enemy = dusman(room, tower, { hp: 1, maxHp: 1, reward: 20, type: "grunt", movementKind: "ground", ...overrides });
  room.damageEnemy(enemy, 1e6, 0, kaynak, owner, "true", 0, tower.level, tower.id);
  return player.gold - once;
}

test("Garnizon Maasi: dalga sonunda ayakta olan hasar veren kule basina +16, tavan yok; yikik kule ve aura sayilmiyor", () => {
  const room = oda();
  const kuleler = [kur(room, "warrior-1"), kur(room, "warrior-4"), kur(room, "warrior-6")];
  kur(room, "warrior-3"); // hasarsiz aura: sayilmiyor
  kartAl(room, "garnizon-maasi");
  const player = room.state.players.get("p1");
  const kapanis = () => { const once = player.gold; room.awardWaveEndBonusGold(room.wave, false); return player.gold - once; };
  assert.equal(kapanis(), 48);
  kuleler[0].hp = 0;
  assert.equal(kapanis(), 32, "yikik kule sayildi");
  // Tavan yok: kule basina pay buyurse (test), toplam da buyuyor.
  player.runModifiers.push({ source: "test:seviye", scope: "player", stat: "garrisonGold", add: 34 });
  assert.equal(kapanis(), 2 * 50, "eski 40 tavani kalkti");
});

test("Terfi Ikramiyesi: her gelistirme +10, tavan yok; duvar ve hasarsiz yapi odemiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "terfi-ikramiyesi");
  const player = room.state.players.get("p1");
  player.experience = 1e9;
  const gelistir = (kule) => {
    const gold = player.gold;
    const level = kule.level;
    const bedel = getTowerLevelGoldCost(kule.definition.cost, level);
    room.upgradeTower(client, { towerId: kule.id });
    assert.equal(kule.level, level + 1, "gelismedi");
    return player.gold - gold + bedel;
  };
  const kazanc = [];
  for (let index = 0; index < 8; index += 1) kazanc.push(gelistir(tower));
  assert.deepEqual(kazanc, Array(8).fill(10), "eski 40 tavani kalkti");
  // Duvar: kontenjan tutmuyor, hasar vermiyor -- ucuz ve tam iadeyle geri
  // alinabildigi icin altin pompasi olurdu.
  const duvar = kur(room, "wall-1");
  assert.equal(gelistir(duvar), 0, "duvar gelistirmesi prim verdi");
  const aura = kur(room, "warrior-3");
  assert.equal(gelistir(aura), 0, "hasarsiz aura prim verdi");
});

test("Terfi Ikramiyesi: ayni hazirlikta kurulup gelistirilip geri alinan kulenin primi geri aliniyor", () => {
  const room = oda();
  kartAl(room, "terfi-ikramiyesi");
  const player = room.state.players.get("p1");
  player.experience = 1e9;
  room.setupPhase = true;
  const once = player.gold;
  const tower = kur(room, "warrior-1");
  room.upgradeTower(client, { towerId: tower.id });
  room.upgradeTower(client, { towerId: tower.id });
  assert.equal(tower.upgradeBonusGold, 20);
  room.sellTower(client, { towerId: tower.id });
  assert.equal(room.towers.has(tower.id), false, "satilmadi");
  assert.equal(player.gold, once, "kur-gelistir-geri al dongusu altin birakti");
  // Gecmis hazirlikta kurulan kule: satis kismi iade, prim kaliyor.
  room.setupPhase = false;
  const eski = kur(room, "warrior-1");
  room.upgradeTower(client, { towerId: eski.id });
  const sonra = player.gold;
  room.setupSession += 1;
  room.setupPhase = true;
  room.sellTower(client, { towerId: eski.id });
  assert.ok(player.gold >= sonra, "kismi iadede prim geri alindi");
});

test("Agir Hedef Odulu: her brute ve kusatma oldurmesi +24, tavan yok", () => {
  const room = oda();
  const a = kur(room, "warrior-1");
  const b = kur(room, "warrior-4");
  kartAl(room, "agir-hedef-odulu");
  const piyade = oldurAltin(room, a);
  assert.equal(oldurAltin(room, a, { type: "brute" }) - oldurAltin(room, a, { type: "grunt" }), 24);
  assert.equal(oldurAltin(room, b, { type: "siege" }) - piyade, 24);
  let toplam = 48;
  for (let index = 0; index < 20; index += 1) toplam += oldurAltin(room, index % 2 ? a : b, { type: "brute" }) - piyade;
  assert.equal(toplam, 24 * 22, "eski 60 tavani kalkti");
});

test("Yavas Olum Primi: oyuncunun yanma ve kanamasiyla olen dusman +16, vurusla olen degil; tavan yok", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "yavas-olum-primi");
  const vurus = oldurAltin(room, tower);
  assert.equal(oldurAltin(room, tower, {}, "status:burn") - vurus, 16);
  assert.equal(oldurAltin(room, tower, {}, "status:bleed") - vurus, 16);
  let toplam = 32;
  for (let index = 0; index < 20; index += 1) toplam += oldurAltin(room, tower, {}, "status:bleed") - vurus;
  assert.equal(toplam, 16 * 22);
});

test("co-op: kart primleri yalnizca kartin sahibine; takim arkadasinin oldurmesi saymiyor", () => {
  const room = oda();
  const p2 = ikinciOyuncu(room);
  const ikinci = { sessionId: "p2", send() {} };
  const benim = kur(room, "warrior-1");
  const onun = kur(room, "warrior-4", ikinci);
  kartAl(room, "agir-hedef-odulu");
  const p1 = room.state.players.get("p1");
  const [a, b] = [p1.gold, p2.gold];
  oldurAltin(room, onun, { type: "brute" });
  assert.equal(p1.gold - a, p2.gold - b, "takim arkadasinin oldurmesi bana prim verdi");
  const [c, d] = [p1.gold, p2.gold];
  oldurAltin(room, benim, { type: "brute" });
  assert.equal((p1.gold - c) - (p2.gold - d), 24);
});

test("Ates Hatti Primi: kule 50 derece ya da ustundeyken oldurme +12 (yanma ve kanama dahil), tavan yok", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "ates-hatti-primi"));
  tower.temperature = 49;
  const soguk = oldurAltin(room, tower);
  tower.temperature = HOT_KILL_TEMPERATURE;
  assert.equal(oldurAltin(room, tower) - soguk, 12);
  // Kulenin yanmasiyla olen dusman da kulenin oldurmesi.
  assert.equal(oldurAltin(room, tower, {}, "status:burn") - soguk, 12, "yanma oldurmesi");
  let toplam = 24;
  for (let index = 0; index < 20; index += 1) toplam += oldurAltin(room, tower) - soguk;
  assert.equal(toplam, 12 * 22);
});

test("Soguk Av Kaydi: yavaslamis dusman oldurmesi +12 (vurus yavaslatmasi, Sogutma Kanali, hareket yavaslatmasi), tavan yok", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "soguk-av-kaydi"));
  const hizli = oldurAltin(room, tower);
  const now = Date.now();
  const yavas = (enemy) => room.applyEnemyStatusEffect(enemy, { type: "slow", magnitude: 0.3, durationMs: 5000, stacking: "refresh" }, now, {});
  const durumla = (() => {
    const player = room.state.players.get("p1");
    const once = player.gold;
    room.towerCriticalRandom = () => 1;
    const enemy = dusman(room, tower, { hp: 1, maxHp: 1, reward: 20, type: "grunt", movementKind: "ground" });
    yavas(enemy);
    room.damageEnemy(enemy, 1e6, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
    return player.gold - once;
  })();
  assert.equal(durumla - hizli, 12, "durum yavaslatmasi");
  assert.equal(oldurAltin(room, tower, { coolantSlowUntil: Date.now() + 5000 }) - hizli, 12, "Sogutma Kanali");
  // Hareket hesabinin son tikte yazdigi carpan (aura, Zeynep, supheler, zift...).
  assert.equal(oldurAltin(room, tower, { movementSlowMultiplier: 0.8 }) - hizli, 12, "hareket yavaslatmasi");
  let toplam = 36;
  for (let index = 0; index < 20; index += 1) toplam += oldurAltin(room, tower, { coolantSlowUntil: Date.now() + 5000 }) - hizli;
  assert.equal(toplam, 12 * 23, "tavan yok");
});

test("Ikmal Senedi: teslim edilen miktar basina oduyor (5 muhimmat / 15 enerji = +2), kesir birikiyor, tavan yok", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const oteki = kur(room, "warrior-4");
  assert.ok(esyaTak(room, tower, "ikmal-senedi"));
  const player = room.state.players.get("p1");
  const once = player.gold;
  room.awardDeliveryGold(oteki, 50, "ammo");
  assert.equal(player.gold, once, "esyasiz kule");
  assert.equal(room.awardDeliveryGold(tower, DELIVERY_GOLD_AMMO_UNIT, "ammo"), 2, "bir muhimmat birimi");
  assert.equal(room.awardDeliveryGold(tower, DELIVERY_GOLD_ENERGY_UNIT, "energy"), 2, "bir enerji birimi");
  // Kucuk yukler olayi cogaltip altini cogaltamiyor: 10 x 0,5 muhimmat = 1 birim = +2.
  let kucuk = 0;
  for (let index = 0; index < 10; index += 1) kucuk += room.awardDeliveryGold(tower, 0.5, "ammo");
  assert.equal(kucuk, 2, "kucuk yukler birim basindan fazla odedi");
  // Tavan yok: 100 birim -> +200.
  assert.equal(room.awardDeliveryGold(tower, 100 * DELIVERY_GOLD_AMMO_UNIT, "ammo"), 200);
});

test("Ikmal Senedi gercek isci teslimatinda miktar kadar oduyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "ikmal-senedi"));
  room.ensureLogisticsWorkers();
  const worker = room.drones.get("logistics-p1-ammoTransport");
  assert.ok(worker, "muhimmat iscisi yok");
  const player = room.state.players.get("p1");
  tower.ammo = tower.maxAmmo - 5;
  Object.assign(worker, { x: tower.x, y: tower.y, cargo: 5, cargoAmmoType: tower.ammoType, logisticsPhase: "deliver", targetTowerId: tower.id });
  const once = player.gold;
  room.updateLogisticsWorker(worker, 0.1);
  assert.equal(tower.ammo, tower.maxAmmo, "teslim edilmedi");
  assert.equal(player.gold - once, 5 / DELIVERY_GOLD_AMMO_UNIT * 2, "5 muhimmat -> +2");
});

test("Ikmal Senedi teslimat noktalari: miktar ve kaynak turuyla", async () => {
  const { readFile: read } = await import("node:fs/promises");
  const server = (await read(new URL("../apps/server/src/rooms/MatchRoom.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  // Iki teslimat noktasi: muhimmat ve enerji; ikisi de teslim edilen miktar > 0 iken.
  assert.ok(server.includes(`this.awardDeliveryGold(target, delivered, "energy")`), "enerji teslimati");
  assert.ok(server.includes(`this.awardDeliveryGold(target, delivered, "ammo")`), "muhimmat teslimati");
});

test("Uzak Menzil Primi: menzilin dis dortte biri ile %110'u arasindaki vurusla oldurme +16; tavan yok", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "uzak-menzil-primi"));
  const range = room.getTowerRange(tower);
  const yakin = oldurAltin(room, tower, { x: tower.x + range * 0.5, y: tower.y });
  assert.equal(oldurAltin(room, tower, { x: tower.x + range * 0.8, y: tower.y }) - yakin, 16);
  assert.equal(oldurAltin(room, tower, { x: tower.x + range * 1.05, y: tower.y }) - yakin, 16, "menzilden yeni cikmis");
  assert.equal(oldurAltin(room, tower, { x: tower.x + range * 0.74, y: tower.y }) - yakin, 0);
  assert.equal(oldurAltin(room, tower, { x: tower.x + range * (LONG_RANGE_KILL_MAX_FRACTION + 0.05), y: tower.y }) - yakin, 0, "ust sinir");
  assert.equal(oldurAltin(room, tower, { x: tower.x + range * 3, y: tower.y }) - yakin, 0, "haritanin obur ucu");
  // Yanma ve kanama tikleri sayilmiyor (dusman her yerde olabilir).
  assert.equal(oldurAltin(room, tower, { x: tower.x + range * 0.8, y: tower.y }, "status:burn") - yakin, 0, "durum tiki");
  let toplam = 16;
  for (let index = 0; index < 20; index += 1) toplam += oldurAltin(room, tower, { x: tower.x, y: tower.y + range * 0.9 }) - yakin;
  assert.equal(toplam, 16 * 21, "tavan yok");
});

test("Uzak Menzil Primi Debug Lazer'in asiri yuklemesinde odemiyor", () => {
  const room = oda();
  const lazer = kur(room, "warrior-5");
  assert.ok(esyaTak(room, lazer, "uzak-menzil-primi"));
  const range = room.getTowerRange(lazer);
  const yakin = oldurAltin(room, lazer, { x: lazer.x + range * 0.3, y: lazer.y });
  assert.equal(oldurAltin(room, lazer, { x: lazer.x + range * 0.9, y: lazer.y }) - yakin, 16, "normal kiris");
  lazer.debugOverdriveUntil = Date.now() + 10_000;
  assert.equal(oldurAltin(room, lazer, { x: lazer.x + range * 0.9, y: lazer.y }) - yakin, 0, "asiri yukleme");
  assert.equal(towerHasBoundedRange(kule("warrior-2")), false);
});

test("Soguk Av Kaydi hareket hesabinin yavaslatmalarini goruyor: Zeynep, supheler ve zift", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "soguk-av-kaydi"));
  const hizli = oldurAltin(room, tower);
  const tik = (hazirla) => {
    const player = room.state.players.get("p1");
    room.towerCriticalRandom = () => 1;
    const enemy = dusman(room, tower, { hp: 1, maxHp: 1, reward: 20, type: "grunt", movementKind: "ground" });
    hazirla(enemy);
    room.updateEnemies(0.016);
    assert.ok(room.enemies.has(enemy.id), "dusman tikte kayboldu");
    const once = player.gold;
    room.damageEnemy(enemy, 1e6, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
    return player.gold - once;
  };
  assert.equal(tik(() => {}) - hizli, 0, "yavaslatmasiz tik");
  const gercek = { until: room.zeynepSlowUntil, multiplier: room.zeynepSlowMultiplier };
  assert.equal(tik(() => { room.zeynepSlowUntil = Date.now() + 5000; room.zeynepSlowMultiplier = 0.6; }) - hizli, 12, "Zeynep'in kuresel yavaslatmasi");
  room.zeynepSlowUntil = gercek.until ?? 0;
  room.zeynepSlowMultiplier = gercek.multiplier ?? 1;
  assert.equal(tik((enemy) => { enemy.melisDoubtUntil = Date.now() + 5000; enemy.melisDoubtStacks = 2; }) - hizli, 12, "supheler");
  assert.equal(tik((enemy) => {
    const cell = worldToGrid(enemy.x, enemy.y, room.activeMap);
    room.tarredCells.add(`${cell.col}:${cell.row}`);
  }) - hizli, 12, "zift");
});

test("co-op: ikinci tur kule primleri yalnizca kulenin sahibine", () => {
  const room = oda();
  const p2 = ikinciOyuncu(room);
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "ates-hatti-primi"));
  tower.temperature = 80;
  const p1 = room.state.players.get("p1");
  const [a, b] = [p1.gold, p2.gold];
  oldurAltin(room, tower);
  assert.equal((p1.gold - a) - (p2.gold - b), 12);
});
