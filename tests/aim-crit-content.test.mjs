/**
 * Donus hizi, isabet ve kritik: ikinci tur kartlar ve esyalar.
 *
 * Ilk turdaki icerik bu uc stati tek tek buyutuyordu. Bu turdaki her secenek
 * ya bir bedelle geliyor ya da sahadaki baska bir seye bagli: dusmanin
 * isaretine, kulenin isabet bonusuna, kulenin komsusuz olmasina, kulenin az
 * once oldurmesine. Testler dort seyi tutuyor:
 *
 *   1. Metin ile etki ayni cumle: aciklamadaki her yuzde bir efekte ya da
 *      kilidin sabitine karsilik geliyor.
 *   2. Kapsam: donus hizi yalnizca nisan alan kuleye, isabet yalnizca namlu
 *      yonunde ucan mermi ve carpma kulelerine ulasiyor.
 *   3. Yigin sinirlari cekiliste ve magazada tutuyor.
 *   4. Sunucu sonucu gercekten degisiyor: namlunun donusu, ates konisi,
 *      kritik zari. Zar `towerCriticalRandom` ile sabitleniyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCURACY_CRIT_RATIO,
  ISOLATED_CRIT_CHANCE,
  KILL_SNAP_DURATION_MS,
  KILL_SNAP_TURN_RATE,
  MARKED_CRIT_CHANCE,
  TOWER_BASE_CRITICAL_CHANCE,
  TOWER_TURN_RATE_RADIANS_PER_SECOND,
  canEquipShopItem,
  cardAppliesToTower,
  cardCatalog,
  cardReachesTower,
  drawCards,
  drawShopOffers,
  getAccuracyCritChance,
  getCardRarity,
  getModifierAdd,
  getShopItem,
  getTowerGrantedUnlocks,
  isMarkOnlyChoice,
  isShopItemAlreadyUnlocked,
  isShopItemUnlockRedundant,
  isShopItemAvailable,
  shopCatalog,
  shopItemAppliesToTower,
  towerAims,
  towerCatalog,
  towerFiresAlongFacing
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const allTowers = Object.values(towerCatalog).flat();
const card = (id) => {
  const found = cardCatalog.find((entry) => entry.id === id);
  assert.ok(found, `${id} katalogda yok`);
  return found;
};

const NEW_CARD_IDS = [
  "doner-kaide", "nisan-kertigi", "av-refleksi", "sicak-tetik", "agir-funye",
  "ince-uc", "keskin-nisanci-durbunu", "av-izi", "goz-karari", "gozcu-yuvasi"
];
const NEW_ITEM_IDS = ["jiroskop", "nisan-durbunu", "iz-okuyucu", "mesafe-olcer", "atesleme-pimi", "yarik-mermi"];

// ------------------------------------------------------------------ Kurulum

function oda(characterId = "warrior") {
  const room = createRoom(characterId);
  room.broadcast = () => {};
  room.clients = [client];
  room.setupPhase = false;
  return room;
}

function kur(room, definitionId) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer yok`);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower.definition.id, definitionId);
  return tower;
}

/** Karti gercek secim yolundan verir: kilit ve modifier ancak oradan geliyor. */
function kartAl(room, cardId, towerId) {
  room.pendingCardChoices = new Map([["p1", [card(cardId)]]]);
  room.chooseCard(client, { cardId, towerId });
}

/** Esyayi satin alinmis sayar ve kuleye takar. */
function esyaTak(room, tower, itemId) {
  const item = getShopItem(itemId);
  assert.ok(item, `${itemId} katalogda yok`);
  const player = room.state.players.get("p1");
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
  room.equipShopItem(client, { itemId, towerId: tower.id });
  return tower.equippedShopItemIds.includes(itemId);
}

/** Dirensiz, kalkansiz, zirhsiz ve olmeyecek kadar canli bir dusman. */
function dusman(room, tower) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  enemy.x = tower.x + 8;
  enemy.y = tower.y;
  enemy.hp = enemy.maxHp = 1_000_000;
  enemy.shield = enemy.maxShield = 0;
  enemy.armor = 0;
  enemy.damageResistances = {};
  enemy.hitTypeResistances = {};
  enemy.statusResistances = {};
  return enemy;
}

/**
 * Tek vurusun hasari, zar sabitken. Hasar yolu dogrudan `damageEnemy`:
 * kritik orada atiliyor ve kuleye ozgu atis mekanikleri (Obsesyon yigini,
 * Takipci isareti) olcume karismiyor.
 */
function vurus(room, tower, zar, hazirla = () => {}) {
  const enemy = dusman(room, tower);
  hazirla(enemy);
  room.towerCriticalRandom = () => zar;
  const once = enemy.hp;
  room.damageEnemy(enemy, 100, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
  return once - enemy.hp;
}

/** Bu zarla kritik geldi mi: kritiksiz (zar 1) olcumle karsilastirir. */
function kritikMi(room, tower, zar, hazirla) {
  return vurus(room, tower, zar, hazirla) > vurus(room, tower, 1, hazirla) + 1e-6;
}

/** Namlu 0 radyanda; hedef verilen acida. `saniye` kadar doner, hizali mi doner. */
function nisanAl(room, tower, aciRadyan, saniye) {
  tower.facing = 0;
  const hedef = { x: tower.x + 100 * Math.cos(aciRadyan), y: tower.y + 100 * Math.sin(aciRadyan) };
  const hizali = room.aimTowerAt(tower, hedef, saniye);
  return { hizali, donus: tower.facing };
}

// ------------------------------------------------------- 1. Metin = etki

/** Statin aciklamadaki adi; ek (isabeti, isisi, menzili) serbest. */
const STAT_LABEL = {
  turnRate: "dönüş hızı",
  accuracy: "isabet",
  critChance: "kritik şansı",
  critDamage: "kritik hasarı",
  fireRate: "atış hızı",
  heat: "ısı",
  range: "menzil",
  projectileSpeed: "mermi hızı"
};

const yuzde = (value) => String(Math.round(Math.abs(value) * 100));
const isaret = (value) => (value < 0 ? "-" : "\\+");

test("nisan ve kritik iceriginin her efekti aciklamada isaretiyle ve sayisiyla yaziyor", () => {
  const aimingStats = new Set(["turnRate", "accuracy", "critChance", "critDamage", "projectileSpeed"]);
  const entries = [...cardCatalog, ...shopCatalog].filter((entry) => entry.effects.some((modifier) => aimingStats.has(modifier.stat)));
  assert.ok(entries.length >= 25, `beklenenden az icerik: ${entries.length}`);
  for (const entry of entries) {
    for (const modifier of entry.effects) {
      const label = STAT_LABEL[modifier.stat];
      if (!label) continue;
      const pattern = new RegExp(`${label}\\S*\\s${isaret(modifier.add)}%${yuzde(modifier.add)}(?!\\d)`, "i");
      assert.match(entry.description, pattern, `${entry.id}: "${entry.description}" ${modifier.stat} ${modifier.add} demiyor`);
    }
  }
});

test("hicbir kart ya da esya isabet cezasi vaat etmiyor", () => {
  // Negatif isabet koniyi genisletmiyor; yazilsa sessizce hicbir sey yapmaz.
  for (const entry of [...cardCatalog, ...shopCatalog]) {
    assert.doesNotMatch(entry.description, /isabet\S*\s-%/i, `${entry.id} isabet cezasi yaziyor`);
    for (const modifier of entry.effects) {
      if (modifier.stat === "accuracy") assert.ok(modifier.add > 0, `${entry.id} eksi isabet tasiyor`);
    }
  }
});

test("kilit veren yeni icerigin sayilari sunucunun sabitleriyle ayni", () => {
  const killSnap = `${KILL_SNAP_DURATION_MS / 1000} saniye boyunca dönüş hızı +%${yuzde(KILL_SNAP_TURN_RATE)}`;
  for (const entry of [card("av-refleksi"), getShopItem("jiroskop")]) {
    assert.deepEqual(entry.unlocks, ["aim:killSnap"]);
    assert.ok(entry.description.includes(killSnap), `${entry.id}: "${entry.description}" -> ${killSnap}`);
  }
  for (const entry of [card("av-izi"), getShopItem("iz-okuyucu")]) {
    assert.deepEqual(entry.unlocks, ["crit:vsMarked"]);
    assert.match(entry.description, new RegExp(`şaretli düşmanlara kritik şansı \\+%${yuzde(MARKED_CRIT_CHANCE)}; (kulenin )?kendi koyduğu takip işareti sayılmaz\\.$`));
  }
  const accuracyText = `her %10'u kritik şansına +%${yuzde(0.1 * ACCURACY_CRIT_RATIO)} ekler; en fazla +%${yuzde(ACCURACY_CRIT_RATIO)}`;
  for (const entry of [card("goz-karari"), getShopItem("mesafe-olcer")]) {
    assert.deepEqual(entry.unlocks, ["crit:fromAccuracy"]);
    assert.ok(entry.description.includes(accuracyText), `${entry.id}: "${entry.description}" -> ${accuracyText}`);
  }
  assert.deepEqual(card("gozcu-yuvasi").unlocks, ["crit:isolated"]);
  assert.ok(card("gozcu-yuvasi").description.includes(`kritik şansı +%${yuzde(ISOLATED_CRIT_CHANCE)}`));
});

test("yeni icerik kapsamini metninde soyluyor", () => {
  for (const id of ["doner-kaide", "nisan-kertigi", "av-refleksi"]) assert.match(card(id).description, /^Nişan alan/);
  for (const id of ["jiroskop", "nisan-durbunu"]) assert.match(getShopItem(id).description, /yalnızca nişan alan (.* )?kuleler(in)?e takılır\.$/);
  assert.match(card("nisan-kertigi").description, /mermi ve çarpma kulelerinin/);
  assert.match(card("keskin-nisanci-durbunu").description, /^Bir kulenin/);
  for (const id of ["sicak-tetik", "agir-funye"]) assert.match(card(id).description, /^Tüm kulelerin/);
});

// ------------------------------------------------------------- 2. Kapsam

test("donus kartlari ve esyasi yalnizca nisan alan kuleye ulasiyor", () => {
  for (const tower of allTowers) {
    const expected = towerAims(tower.id) && !tower.resourceProvider;
    for (const id of ["doner-kaide", "av-refleksi"]) {
      assert.equal(cardAppliesToTower(card(id), tower), expected, `${id} / ${tower.id}`);
    }
    assert.equal(shopItemAppliesToTower(getShopItem("jiroskop"), tower), expected, `jiroskop / ${tower.id}`);
  }
  // Kimligi olmayan profil nisan alan kule sayilmiyor.
  const { id: _id, ...anonim } = allTowers.find((tower) => tower.id === "warrior-1");
  assert.equal(cardAppliesToTower(card("doner-kaide"), anonim), false);
});

test("isabet karti ve esyasi yalnizca namlu yonunde atan nisan kulelerine ulasiyor", () => {
  let reached = 0;
  for (const tower of allTowers) {
    const expected = towerFiresAlongFacing(tower) && !tower.resourceProvider;
    if (expected) assert.ok(towerAims(tower.id) && ["impact", "projectile"].includes(tower.hitType), tower.id);
    assert.equal(cardAppliesToTower(card("nisan-kertigi"), tower), expected, `nisan-kertigi / ${tower.id}`);
    assert.equal(shopItemAppliesToTower(getShopItem("nisan-durbunu"), tower), expected, `nisan-durbunu / ${tower.id}`);
    if (expected) reached += 1;
  }
  assert.ok(reached >= 6, `yalnizca ${reached} kule`);
  // Debug Lazer nisan aliyor ama odak kulesi: isabet orada yalnizca tetigi geciktirir.
  const lazer = allTowers.find((tower) => tower.id === "warrior-5");
  assert.equal(towerAims(lazer.id), true);
  assert.equal(cardAppliesToTower(card("nisan-kertigi"), lazer), false);
  // Gosteri Kulesi nisan alan bir carpma kulesi ama isinini en kalabalik
  // hatta kendisi seciyor: isabet orada da yalnizca tetigi geciktirirdi.
  const gosteri = allTowers.find((tower) => tower.id === "zeynep-2");
  assert.equal(towerAims(gosteri.id), true);
  assert.equal(gosteri.hitType, "impact");
  assert.equal(cardAppliesToTower(card("nisan-kertigi"), gosteri), false);
  // Taht Muhru karma (mermi kipleri namlu yonunde): kapsamda.
  assert.equal(cardAppliesToTower(card("nisan-kertigi"), allTowers.find((tower) => tower.id === "zeynep-3")), true);
});

test("Ince Uc yalnizca tek hedefe saldiran kulelere ulasiyor", () => {
  for (const tower of allTowers) {
    assert.equal(cardAppliesToTower(card("ince-uc"), tower), tower.engine?.attack.shape === "single" && !tower.resourceProvider, tower.id);
  }
});

test("kapsamli esya uymayan kuleye takilamiyor", () => {
  const sunucu = allTowers.find((tower) => tower.id === "warrior-2");
  const takipci = allTowers.find((tower) => tower.id === "warrior-1");
  assert.deepEqual(canEquipShopItem(getShopItem("jiroskop"), sunucu, []), { ok: false, reason: "incompatibleTower" });
  assert.deepEqual(canEquipShopItem(getShopItem("nisan-durbunu"), sunucu, []), { ok: false, reason: "incompatibleTower" });
  assert.deepEqual(canEquipShopItem(getShopItem("jiroskop"), takipci, []), { ok: true });
  assert.deepEqual(canEquipShopItem(getShopItem("nisan-durbunu"), takipci, []), { ok: true });
  // Kritik esyalari hasar veren her kuleye takilir (Sunucu dahil: baglanti
  // patlamasi vuruyor), duvara ve hasarsiz aura binasina takilmaz.
  const duvar = allTowers.find((tower) => tower.id === "wall-1");
  const izolasyon = allTowers.find((tower) => tower.id === "warrior-3");
  for (const id of ["iz-okuyucu", "mesafe-olcer", "atesleme-pimi", "yarik-mermi"]) {
    assert.deepEqual(getShopItem(id).scope, { kind: "tagged", combat: true }, id);
    assert.deepEqual(canEquipShopItem(getShopItem(id), sunucu, []), { ok: true }, id);
    assert.deepEqual(canEquipShopItem(getShopItem(id), duvar, []), { ok: false, reason: "incompatibleTower" }, id);
    assert.deepEqual(canEquipShopItem(getShopItem(id), izolasyon, []), { ok: false, reason: "incompatibleTower" }, id);
  }
});

test("secim ekrani donus kartini nisan almayan kuleye saymiyor", () => {
  const sunucu = allTowers.find((tower) => tower.id === "warrior-2");
  const takipci = allTowers.find((tower) => tower.id === "warrior-1");
  assert.equal(cardReachesTower(card("doner-kaide"), sunucu), false);
  assert.equal(cardReachesTower(card("doner-kaide"), takipci), true);
  // Kosullu kritikler genel: her savas kulesine sayiliyor.
  assert.equal(cardReachesTower(card("gozcu-yuvasi"), sunucu), true);
});

// ------------------------------------------------------------- 3. Yigin

test("yeni kartlarin nadirligi ve yigin siniri", () => {
  const expected = {
    "doner-kaide": ["common", 2], "sicak-tetik": ["common", 2],
    "nisan-kertigi": ["uncommon", 1], "av-refleksi": ["uncommon", 1], "agir-funye": ["uncommon", 1],
    "ince-uc": ["uncommon", 1], "av-izi": ["uncommon", 1], "gozcu-yuvasi": ["uncommon", 1],
    "keskin-nisanci-durbunu": ["rare", 1], "goz-karari": ["rare", 1]
  };
  assert.deepEqual(Object.keys(expected).sort(), [...NEW_CARD_IDS].sort());
  for (const [id, [rarity, maxStacks]] of Object.entries(expected)) {
    const entry = card(id);
    assert.equal(getCardRarity(entry), rarity, id);
    assert.equal(entry.stackable ? entry.maxStacks : 1, maxStacks, id);
    // Sinira ulasan kart cekilise bir daha girmiyor.
    const owned = Array.from({ length: maxStacks }, () => id);
    const draws = drawCards({ count: 200, preferredAxes: ["dps"], towers: allTowers, ownedCardIds: owned, random: () => 0 });
    assert.equal(draws.some((draw) => draw.id === id), false, `${id} sinirdan sonra yine cekildi`);
    if (maxStacks > 1) {
      const birKez = drawCards({ count: 200, preferredAxes: ["dps"], towers: allTowers, ownedCardIds: [id], random: () => 0 });
      assert.equal(birKez.some((draw) => draw.id === id), true, `${id} ikinci kez alinamiyor`);
    }
  }
});

test("yeni esyalar tek seferlik ve fiyatlari komsulariyla ayni bantta", () => {
  for (const id of NEW_ITEM_IDS) {
    const item = getShopItem(id);
    assert.equal(item.repeatable, false, id);
    assert.equal(item.target, "tower", id);
    assert.equal(isShopItemAvailable(item, 1, []), true, id);
    assert.equal(isShopItemAvailable(item, 1, [id]), false, `${id} ikinci kez satilabiliyor`);
    assert.ok(item.price >= 80 && item.price <= 130, `${id} fiyati ${item.price}`);
    assert.ok(["power", "class"].includes(item.category), id);
    // Kapsamli esya "class", kosulsuz olan "power": magaza ayni dili konusuyor.
    // Yalnizca "hasar veren kule" kapsami kosul sayilmiyor: her savas kulesine takiliyor.
    const restricted = item.scope.kind === "tagged" && Object.keys(item.scope).some((key) => key !== "kind" && key !== "combat");
    assert.equal(item.category, restricted ? "class" : "power", id);
  }
});

test("isarete bagli secenekler isaretsiz takimda geri cekiliyor", () => {
  assert.equal(isMarkOnlyChoice(card("av-izi")), true);
  assert.equal(isMarkOnlyChoice(getShopItem("iz-okuyucu")), true);
  assert.equal(isMarkOnlyChoice(card("gozcu-yuvasi")), false);
  assert.equal(isMarkOnlyChoice(card("nexus-tamiri")), false, "baska kilit hala sayilmiyor");
  assert.equal(isMarkOnlyChoice(card("isaretleme-agi")), true, "eski kural bozulmadi");
});

// ---------------------------------------------------- 4. Sunucu: donus

test("Doner Kaide namluyu %45 hizli dondururken atis hizindan %5 aliyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const sade = nisanAl(room, tower, Math.PI / 2, 0.1).donus;
  assert.ok(Math.abs(sade - TOWER_TURN_RATE_RADIANS_PER_SECOND * 0.1) < 1e-9, `taban donus ${sade}`);
  const sadeAralik = room.getTowerFireInterval(tower);

  kartAl(room, "doner-kaide");
  const kartli = nisanAl(room, tower, Math.PI / 2, 0.1).donus;
  assert.ok(Math.abs(kartli - sade * 1.45) < 1e-9, `donus ${kartli} / ${sade * 1.45}`);
  assert.ok(Math.abs(room.getTowerFireInterval(tower) - sadeAralik / 0.95) < 1e-6, "atis hizi cezasi yok");
});

test("Doner Kaide nisan almayan kuleye ne bonus ne ceza veriyor", () => {
  const room = oda();
  const sunucu = kur(room, "warrior-2");
  const once = room.getTowerFireInterval(sunucu);
  kartAl(room, "doner-kaide");
  assert.equal(getModifierAdd(room.getTowerRunModifiers(sunucu), "turnRate"), 0);
  assert.equal(getModifierAdd(room.getTowerRunModifiers(sunucu), "fireRate"), 0);
  assert.equal(room.getTowerFireInterval(sunucu), once);
});

test("Doner Kaide ikinci kez alindiginda toplaniyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  kartAl(room, "doner-kaide");
  kartAl(room, "doner-kaide");
  const donus = nisanAl(room, tower, Math.PI / 2, 0.1).donus;
  assert.ok(Math.abs(donus - TOWER_TURN_RATE_RADIANS_PER_SECOND * 0.1 * 1.9) < 1e-9, `donus ${donus}`);
});

for (const [ad, ver] of [
  ["Av Refleksi", (room) => kartAl(room, "av-refleksi")],
  ["Jiroskop", (room, tower) => assert.ok(esyaTak(room, tower, "jiroskop"), "jiroskop takilamadi")]
]) {
  test(`${ad} oldurmeden sonra donus hizini 2 saniye +%150 yapiyor`, () => {
    const room = oda();
    const tower = kur(room, "warrior-1");
    ver(room, tower);
    const sade = nisanAl(room, tower, Math.PI / 2, 0.1).donus;
    assert.ok(Math.abs(sade - TOWER_TURN_RATE_RADIANS_PER_SECOND * 0.1) < 1e-9, "oldurmeden once hizlanmamali");

    const enemy = dusman(room, tower);
    enemy.hp = 1;
    assert.equal(room.damageEnemy(enemy, 1000, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id), true, "dusman olmedi");
    const now = Date.now();
    assert.ok(tower.killSnapUntil >= now + KILL_SNAP_DURATION_MS - 50 && tower.killSnapUntil <= now + KILL_SNAP_DURATION_MS, "pencere 2 saniye degil");

    const hizli = nisanAl(room, tower, Math.PI / 2, 0.1).donus;
    assert.ok(Math.abs(hizli - sade * (1 + KILL_SNAP_TURN_RATE)) < 1e-9, `pencerede donus ${hizli}`);

    tower.killSnapUntil = Date.now() - 1;
    assert.ok(Math.abs(nisanAl(room, tower, Math.PI / 2, 0.1).donus - sade) < 1e-9, "pencere bitince donus normale donmedi");
  });
}

test("Jiroskop baska kulenin oldurmesiyle tetiklenmiyor ve kilitsiz kule pencere acmiyor", () => {
  const room = oda();
  const takili = kur(room, "warrior-1");
  const oldurucu = kur(room, "warrior-4");
  assert.ok(esyaTak(room, takili, "jiroskop"));
  const enemy = dusman(room, oldurucu);
  enemy.hp = 1;
  assert.equal(room.damageEnemy(enemy, 1000, 0, oldurucu.definition.id, "p1", "true", 0, oldurucu.level, oldurucu.id), true);
  assert.equal(takili.killSnapUntil, undefined, "oldurmeyen kulede pencere acildi");
  assert.equal(oldurucu.killSnapUntil, undefined, "kilitsiz kulede pencere acildi");
});

// --------------------------------------------------- 4. Sunucu: isabet

test("Nisan Kertigi ates konisini 20 dereceden 14 dereceye daraltiyor ve donusu %15 yavaslatiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const derece = (value) => value * Math.PI / 180;
  assert.equal(nisanAl(room, tower, derece(16), 0).hizali, true, "taban koni 20 derece degil");
  const sade = nisanAl(room, tower, Math.PI / 2, 0.1).donus;

  kartAl(room, "nisan-kertigi");
  assert.equal(nisanAl(room, tower, derece(16), 0).hizali, false, "koni daralmadi");
  assert.equal(nisanAl(room, tower, derece(13.5), 0).hizali, true, "koni 14 dereceden dar");
  const kartli = nisanAl(room, tower, Math.PI / 2, 0.1).donus;
  assert.ok(Math.abs(kartli - sade * 0.85) < 1e-9, `donus ${kartli}`);
});

test("Nisan Durbunu takildigi kulede koniyi 11 dereceye daraltiyor, atis hizindan %10 aliyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const derece = (value) => value * Math.PI / 180;
  const sadeAralik = room.getTowerFireInterval(tower);
  assert.ok(esyaTak(room, tower, "nisan-durbunu"));
  assert.equal(nisanAl(room, tower, derece(12), 0).hizali, false);
  assert.equal(nisanAl(room, tower, derece(10.5), 0).hizali, true);
  assert.ok(Math.abs(room.getTowerFireInterval(tower) - sadeAralik / 0.9) < 1e-6, "atis hizi cezasi yok");
});

test("Nisan Durbunu nisan almayan kuleye takilamiyor", () => {
  const room = oda();
  const sunucu = kur(room, "warrior-2");
  assert.equal(esyaTak(room, sunucu, "nisan-durbunu"), false);
  assert.equal(esyaTak(room, sunucu, "jiroskop"), false);
});

// --------------------------------------------------- 4. Sunucu: kritik

test("Sicak Tetik kritik sansini %12 artiriyor ve isiyi %15 buyutuyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-4");
  assert.equal(kritikMi(room, tower, 0.1), false, "kartsiz kritik geldi");
  kartAl(room, "sicak-tetik");
  assert.ok(Math.abs(room.getTowerCritChance(tower) - (TOWER_BASE_CRITICAL_CHANCE + 0.12)) < 1e-9);
  assert.equal(kritikMi(room, tower, 0.1), true, "kartla kritik gelmedi");
  assert.ok(Math.abs(getModifierAdd(room.getTowerRunModifiers(tower), "heat") - 0.15) < 1e-9, "isi cezasi kuleye ulasmadi");
});

test("Agir Funye kritigi kurmamis kulede kritigi siliyor, kurmus kulede buyutuyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-4");
  // Taban %1: zar 0.005 kartsiz kritik.
  assert.equal(kritikMi(room, tower, 0.005), true);
  const sadeKritik = vurus(room, tower, 0.005) / vurus(room, tower, 1);
  kartAl(room, "agir-funye");
  assert.equal(room.getTowerCritChance(tower), 0, "kritik sansi sifira inmedi");
  assert.equal(kritikMi(room, tower, 0.005), false, "kritik sansi eksiye cekilmedi");

  // Kritik kurulmus kule: %1 + %12 - %5 = %8.
  kartAl(room, "sicak-tetik");
  assert.equal(kritikMi(room, tower, 0.07), true);
  const funyeKritik = vurus(room, tower, 0.07) / vurus(room, tower, 1);
  assert.ok(Math.abs(funyeKritik - (sadeKritik + 1.5)) < 1e-6, `kritik carpani ${funyeKritik} / ${sadeKritik + 1.5}`);
});

test("Ince Uc tek hedef kulesinin kritik hasarini %70 artiriyor, isin kulesine dokunmuyor", () => {
  const room = oda();
  const takipci = kur(room, "warrior-4");
  const lazer = kur(room, "warrior-5");
  const oran = (tower) => vurus(room, tower, 0) / vurus(room, tower, 1);
  const takipciOnce = oran(takipci);
  const lazerOnce = oran(lazer);
  kartAl(room, "ince-uc");
  assert.ok(Math.abs(oran(takipci) - (takipciOnce + 0.7)) < 1e-6, `tek hedef: ${oran(takipci)}`);
  assert.ok(Math.abs(oran(lazer) - lazerOnce) < 1e-9, "isin kulesine isledi");
});

test("Keskin Nisanci Durbunu yalnizca secilen kuleye kritik, menzil ve atis hizi cezasi veriyor", () => {
  const room = oda();
  const secilen = kur(room, "warrior-4");
  const oteki = kur(room, "warrior-1");
  const menzil = room.getTowerRange(secilen);
  const aralik = room.getTowerFireInterval(secilen);
  kartAl(room, "keskin-nisanci-durbunu", secilen.id);
  assert.ok(Math.abs(room.getTowerCritChance(secilen) - (TOWER_BASE_CRITICAL_CHANCE + 0.25)) < 1e-9);
  assert.ok(Math.abs(room.getTowerCritChance(oteki) - TOWER_BASE_CRITICAL_CHANCE) < 1e-9, "oteki kuleye isledi");
  assert.ok(Math.abs(room.getTowerRange(secilen) - menzil * 1.1) < 1e-6, "menzil buyumedi");
  assert.ok(Math.abs(room.getTowerFireInterval(secilen) - aralik / 0.8) < 1e-6, "atis hizi cezasi yok");
  assert.equal(kritikMi(room, secilen, 0.2), true);
});

for (const [ad, ver] of [
  ["Av Izi", (room) => kartAl(room, "av-izi")],
  ["Iz Okuyucu", (room, tower) => assert.ok(esyaTak(room, tower, "iz-okuyucu"))]
]) {
  test(`${ad} yalnizca isaretli dusmanda kritik sansini %20 artiriyor`, () => {
    const room = oda();
    const tower = kur(room, "warrior-4");
    const isaretle = (enemy) => room.setEnemyMark(enemy, "test", 0.1, Date.now() + 5000);
    // Zar %20'nin altinda, tabanin ustunde: fark yalnizca kosuldan.
    assert.equal(kritikMi(room, tower, 0.15, isaretle), false, "kilitsiz isaretli hedefe kritik geldi");
    ver(room, tower);
    assert.equal(kritikMi(room, tower, 0.15), false, "isaretsiz hedefe kritik geldi");
    assert.equal(kritikMi(room, tower, 0.15, isaretle), true, "isaretli hedefe kritik gelmedi");
    assert.equal(kritikMi(room, tower, 0.22, isaretle), false, "ek sans %20'den buyuk");
    // Suresi dolmus isaret sayilmiyor.
    assert.equal(kritikMi(room, tower, 0.15, (enemy) => room.setEnemyMark(enemy, "test", 0.1, Date.now() - 1)), false);
  });
}

test("Iz Okuyucu yalnizca takildigi kuleye isliyor", () => {
  const room = oda();
  const takili = kur(room, "warrior-4");
  const oteki = kur(room, "warrior-6");
  assert.ok(esyaTak(room, takili, "iz-okuyucu"));
  const isaretle = (enemy) => room.setEnemyMark(enemy, "test", 0.1, Date.now() + 5000);
  assert.equal(kritikMi(room, takili, 0.15, isaretle), true);
  assert.equal(kritikMi(room, oteki, 0.15, isaretle), false);
});

for (const [ad, ver] of [
  ["Goz Karari", (room) => kartAl(room, "goz-karari")],
  ["Mesafe Olcer", (room, tower) => assert.ok(esyaTak(room, tower, "mesafe-olcer"))]
]) {
  test(`${ad} isabet bonusunun her %10'unu +%3 kritige ceviriyor, +%30'da doyuyor`, () => {
    const room = oda();
    const tower = kur(room, "warrior-4");
    ver(room, tower);
    assert.ok(Math.abs(room.getTowerCritChance(tower) - TOWER_BASE_CRITICAL_CHANCE) < 1e-9, "isabetsiz kulede kritik verdi");
    assert.ok(esyaTak(room, tower, "nisangah"), "nisangah takilamadi");
    assert.ok(Math.abs(room.getTowerCritChance(tower) - (TOWER_BASE_CRITICAL_CHANCE + 0.09)) < 1e-9, `%30 isabet: ${room.getTowerCritChance(tower)}`);
    assert.equal(kritikMi(room, tower, 0.08), true, "hasar yolunda kritik gelmedi");
    assert.equal(kritikMi(room, tower, 0.11), false);
    // Tavan: isabet 1.0'in ustu bosa gidiyor.
    tower.runModifiers.push({ source: "test", scope: "tower", stat: "accuracy", add: 2 });
    assert.ok(Math.abs(room.getTowerCritChance(tower) - (TOWER_BASE_CRITICAL_CHANCE + 0.3)) < 1e-9, `tavan: ${room.getTowerCritChance(tower)}`);
  });
}

test("isabetten gelen kritik saf bir fonksiyon: eksi isabet bir sey vermiyor", () => {
  assert.equal(getAccuracyCritChance(-0.5), 0);
  assert.ok(Math.abs(getAccuracyCritChance(0.5) - 0.15) < 1e-12);
  assert.ok(Math.abs(getAccuracyCritChance(3) - ACCURACY_CRIT_RATIO) < 1e-12);
});

test("Gozcu Yuvasi komsusuz kuleye +%15 kritik veriyor, komsulu kuleye vermiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-4");
  kartAl(room, "gozcu-yuvasi");
  room.isTowerIsolated = () => true;
  assert.ok(Math.abs(room.getTowerCritChance(tower) - (TOWER_BASE_CRITICAL_CHANCE + ISOLATED_CRIT_CHANCE)) < 1e-9);
  assert.equal(kritikMi(room, tower, 0.12), true);
  room.isTowerIsolated = () => false;
  assert.ok(Math.abs(room.getTowerCritChance(tower) - TOWER_BASE_CRITICAL_CHANCE) < 1e-9);
  assert.equal(kritikMi(room, tower, 0.12), false);
});

test("Gozcu Yuvasi gercek yerlesimde komsuluk kuralini kullaniyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-4");
  kartAl(room, "gozcu-yuvasi");
  assert.equal(room.isTowerIsolated(tower), true, "tek kule komsusuz degil");
  assert.equal(kritikMi(room, tower, 0.12), true);
});

test("Atesleme Pimi ve Yarik Mermi takildigi kulenin kritik zarini degistiriyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-4");
  const sadeKritik = vurus(room, tower, 0) / vurus(room, tower, 1);
  assert.ok(esyaTak(room, tower, "atesleme-pimi"));
  assert.ok(Math.abs(room.getTowerCritChance(tower) - (TOWER_BASE_CRITICAL_CHANCE + 0.2)) < 1e-9);
  assert.ok(Math.abs(getModifierAdd(room.getTowerRunModifiers(tower), "heat") - 0.25) < 1e-9);
  assert.ok(esyaTak(room, tower, "yarik-mermi"));
  assert.ok(Math.abs(room.getTowerCritChance(tower) - (TOWER_BASE_CRITICAL_CHANCE + 0.2 - 0.06)) < 1e-9);
  const kritik = vurus(room, tower, 0) / vurus(room, tower, 1);
  assert.ok(Math.abs(kritik - (sadeKritik + 2.5)) < 1e-6, `kritik carpani ${kritik}`);
});

test("Buz Kirigi'nin okudugu kule kritigi kulenin kendi kosullarini da iceriyor", () => {
  // Yavaslatma zari hedefe bakmiyor; isabetten ve yalnizliktan gelen pay ise
  // kulenin kendi degeri, o yuzden orada da sayiliyor.
  const room = oda();
  const tower = kur(room, "warrior-4");
  kartAl(room, "gozcu-yuvasi");
  kartAl(room, "buz-kirigi");
  room.isTowerIsolated = () => true;
  room.towerCriticalRandom = () => 0.1;
  assert.equal(room.rollSlowCrit(tower), true);
  room.isTowerIsolated = () => false;
  assert.equal(room.rollSlowCrit(tower), false);
});

// ------------------------------------- 5. Kilidi zaten acik esya

const kule = (id) => allTowers.find((tower) => tower.id === id);

test("kilidi kartlardan zaten gelen esya taninir; kilit vermeyen esya hicbir zaman", () => {
  const takipci = kule("warrior-1");
  const ciftler = [
    ["jiroskop", "av-refleksi"],
    ["iz-okuyucu", "av-izi"],
    ["mesafe-olcer", "goz-karari"],
    // Eski ciftler ayni kuraldan geciyor.
    ["zafer-serisi", "zafer-sarhoslugu"],
    ["ganimet-avcisi", "yagmaci"],
    ["yalniz-kurt", "yalniz-nisanci"],
    ["avci-protokolu", "avci-egitimi"]
  ];
  for (const [itemId, cardId] of ciftler) {
    const item = getShopItem(itemId);
    assert.equal(isShopItemAlreadyUnlocked(item, [], [takipci]), false, itemId);
    assert.equal(isShopItemAlreadyUnlocked(item, ["seri-atis"], [takipci]), false, `${itemId}: ilgisiz kart`);
    assert.equal(isShopItemAlreadyUnlocked(item, [cardId], [takipci]), true, `${itemId} + ${cardId}`);
  }
  // Kilit vermeyen esya: kart ne olursa olsun.
  assert.equal(isShopItemAlreadyUnlocked(getShopItem("atesleme-pimi"), ["sicak-tetik"], [takipci]), false);
  // Iki kilit veren esyanin tek kilidi acik: hala bir sey ekliyor.
  assert.equal(isShopItemAlreadyUnlocked(getShopItem("nobetci-protokolu"), ["avci-egitimi"], [takipci]), false);
});

test("etiketli kart kilidi yalnizca uydugu kulelerde sayiliyor", () => {
  // Atesleyici yalnizca ates kulelerinde yakiyor; Termal Funye de yalnizca
  // ates kulelerine takiliyor, yani ikisi ust uste biniyor.
  const atesKulesi = allTowers.find((tower) => tower.damageType === "fire" && !tower.resourceProvider);
  assert.ok(atesKulesi);
  assert.equal(isShopItemAlreadyUnlocked(getShopItem("termal-funye"), ["atesleyici"], [atesKulesi]), true);
  // Jiroskop takilabilecegi kule yokken etiketli kart sayilmiyor: sonra
  // kurulacak kulenin nisan alip almayacagi belli degil.
  assert.equal(isShopItemAlreadyUnlocked(getShopItem("jiroskop"), ["av-refleksi"], [kule("warrior-2")]), false);
  // Genel kart her kulede acik: kule olmasa da sayiliyor.
  assert.equal(isShopItemAlreadyUnlocked(getShopItem("iz-okuyucu"), ["av-izi"], []), true);
});

test("hedefli kart ve takili esya kule basina sayiliyor", () => {
  // Hava Savunma Kiti hedefli: vitrin onu saymiyor (esya baska kuleye
  // gidebilir), ama kartin takildigi kulede Ucaksavar Kiti bir sey eklemiyor.
  const takipci = kule("warrior-1");
  const ucaksavar = getShopItem("ucaksavar-kiti");
  assert.equal(isShopItemAlreadyUnlocked(ucaksavar, ["hava-savunma-kiti"], [takipci]), false);
  assert.equal(isShopItemUnlockRedundant(ucaksavar, getTowerGrantedUnlocks({ tower: takipci, ownedCardIds: ["hava-savunma-kiti"], targetedCardIds: ["hava-savunma-kiti"] })), true);
  assert.equal(isShopItemUnlockRedundant(ucaksavar, getTowerGrantedUnlocks({ tower: takipci, ownedCardIds: ["hava-savunma-kiti"] })), false);
  // Ayni kilidi veren bir esya kulede zaten takili.
  assert.equal(isShopItemUnlockRedundant(getShopItem("dokme-radyator"), getTowerGrantedUnlocks({ tower: takipci, ownedCardIds: [], equippedItemIds: ["dokme-radyator"] })), true);
});

test("kule kilit hesabi sunucunun kilit kumesiyle ayni", () => {
  const room = oda();
  const takipci = kur(room, "warrior-1");
  const sunucu = kur(room, "warrior-2");
  kartAl(room, "av-refleksi");
  kartAl(room, "av-izi");
  kartAl(room, "hava-savunma-kiti", sunucu.id);
  assert.ok(esyaTak(room, takipci, "mesafe-olcer"));
  const player = room.state.players.get("p1");
  for (const tower of [takipci, sunucu]) {
    const shared = getTowerGrantedUnlocks({ tower: tower.definition, ownedCardIds: player.ownedCardIds, targetedCardIds: tower.targetedCardIds, equippedItemIds: tower.equippedShopItemIds });
    assert.deepEqual([...shared].sort(), [...room.getTowerGrantState(tower).unlocks].sort(), tower.definition.id);
  }
});

test("vitrin kilidi zaten acik esyayi olu agirlikla geri cekiyor", () => {
  let state = 7;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const say = (ownedCardIds) => {
    let count = 0;
    // Ornek katalog buyudukce buyudu: vitrin 108 esyadan cekiyor.
    for (let index = 0; index < 6000; index += 1) {
      const offers = drawShopOffers({ wave: 5, preferredAxes: ["dps"], towers: [kule("warrior-1")], ownedItemIds: [], ownedCardIds, count: 1, random });
      if (offers[0]?.id === "iz-okuyucu") count += 1;
    }
    return count;
  };
  const sade = say([]);
  const acik = say(["av-izi"]);
  assert.ok(sade > 20, `ornek kucuk: ${sade}`);
  assert.ok(acik < sade * 0.3, `geri cekilmedi: ${acik} / ${sade}`);
  // Kart listesi verilmezse kural uygulanmiyor (eski cagiranlar).
  assert.ok(say(undefined) > sade * 0.7);
});

test("sunucu vitrine oyuncunun kartlarini veriyor; takma yine serbest", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = (await readFile(new URL("../apps/server/src/rooms/MatchRoom.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const calls = source.match(/drawShopOffers\(\{[^\n]*\}\)/g) ?? [];
  assert.equal(calls.length, 2);
  for (const call of calls) assert.ok(call.includes("ownedCardIds: player.ownedCardIds"), call);

  // Kart esyadan sonra alinsa da bir sey kirilmiyor: kilit tek kez acik.
  const room = oda();
  const tower = kur(room, "warrior-1");
  assert.ok(esyaTak(room, tower, "jiroskop"));
  kartAl(room, "av-refleksi");
  assert.equal(room.towerHasUnlock(tower, "aim:killSnap"), true);
  assert.deepEqual(canEquipShopItem(getShopItem("jiroskop"), tower.definition, []), { ok: true });
});

test("arayuz kilidi acik esyayi vitrinde, envanterde ve takarken soyluyor", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = async (path) => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const controls = await read("../apps/web/src/game-control-ui.ts");
  const scene = await read("../apps/web/src/scenes/GameScene.ts");
  assert.ok(controls.includes("zaten açık"), "etiket metni yok");
  assert.equal((controls.match(/item\.alreadyUnlocked \? ALREADY_UNLOCKED_TAG/g) ?? []).length, 2, "vitrin ve envanter");
  assert.equal((scene.match(/alreadyUnlocked: this\.isShopItemAlreadyUnlockedLocally\(/g) ?? []).length, 2);
  assert.ok(scene.includes("this.isShopItemAlreadyUnlockedOnTower(itemId, towerId)"), "takarken uyari yok");
});

// ------------------------------- 6. Takipci'nin kendi isareti

test("Av Izi kulenin kendi koydugu takip isaretini saymiyor, baska kulenin isaretini sayiyor", () => {
  const room = oda();
  const takipci = kur(room, "warrior-1");
  const oteki = kur(room, "warrior-1");
  kartAl(room, "av-izi");
  const takip = (kaynak) => (enemy) => {
    room.setEnemyMark(enemy, "tracking", 0.2, Date.now() + 5000);
    enemy.trackingSourceTowerId = kaynak.id;
  };
  assert.equal(kritikMi(room, takipci, 0.15, takip(takipci)), false, "kendi isaretine kritik geldi");
  assert.equal(kritikMi(room, takipci, 0.15, takip(oteki)), true, "baska Takipci'nin isaretine kritik gelmedi");
  // Baska tur isaret her zaman sayiliyor.
  assert.equal(kritikMi(room, takipci, 0.15, (enemy) => room.setEnemyMark(enemy, "underworld", 0.1, Date.now() + 5000)), true);
});

test("Takipci ayni hedefe pes pese vururken Av Izi kosulsuz kritik vermiyor", () => {
  const room = oda();
  const takipci = kur(room, "warrior-1");
  kartAl(room, "av-izi");
  const enemy = dusman(room, takipci);
  room.towerCriticalRandom = () => 1;
  room.damageEnemy(enemy, 100, 0, "warrior-1", "p1", "true", 0, takipci.level, takipci.id);
  assert.equal(enemy.activeMarkId, "tracking", "ilk vurus isaretlemedi");
  assert.equal(enemy.trackingSourceTowerId, takipci.id);
  const olc = (zar) => {
    room.towerCriticalRandom = () => zar;
    const once = enemy.hp;
    room.damageEnemy(enemy, 100, 0, "warrior-1", "p1", "true", 0, takipci.level, takipci.id);
    return once - enemy.hp;
  };
  const sade = olc(1);
  assert.ok(Math.abs(olc(0.15) - sade) < 1e-6, "kendi isaretli hedefine kritik geldi");
});
