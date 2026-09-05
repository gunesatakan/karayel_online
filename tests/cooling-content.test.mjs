/**
 * Sogutma kartlari ve esyalari.
 *
 * Isi egrisinin iki ucu var. Var olan kartlar isinin **ne zaman** urediginiyle
 * pazarlik ediyordu: Kizgin Namlu sicakken hasar verdiriyor, Termal Kutle atis
 * hizi cezasini kaldirip sogumayi kesiyor. Buradaki uc kilit obur uc: birikeni
 * nasil attigin.
 *
 * Ucu de duz "soguma +%X" olsaydi ayni cumlenin uc cesitlemesi olurdu. Bu yuzden
 * yalnizca Isi Perdesi sayi buyutuyor; digerleri egrinin seklini degistiriyor.
 *
 * Testler kilitlerin **davrandigini** olcer, tanimda yazili olmasini degil: bir
 * kilit tanimlanip sunucuda karsiligi olmadan durabilir ve oyunda hicbir sey
 * yapmaz -- magaza esyalarinda tam olarak bu bir kez oldu.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cardCatalog, getShopItem, shopCatalog } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

/** Isinan bir kule kurar; sogutma davranisi bunun uzerinde olculur. */
function towerRoom(cardIds = [], itemIds = []) {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-5");
  assert.ok(spot, "Debug Lazer icin yer bulunamadi");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "warrior-5" });
  const tower = [...room.towers.values()][0];
  const player = room.state.players.get("p1");

  for (const cardId of cardIds) {
    const card = cardCatalog.find((entry) => entry.id === cardId);
    assert.ok(card, `${cardId} katalogda yok`);
    player.ownedCardIds.push(card.id);
    player.runModifiers.push(...card.effects);
  }
  for (const itemId of itemIds) {
    const item = getShopItem(itemId);
    assert.ok(item, `${itemId} katalogda yok`);
    player.ownedShopItemIds.push(item.id);
    player.inventoryItemIds.push(item.id);
    room.equipShopItem(client, { itemId: item.id, towerId: tower.id });
    assert.ok(tower.equippedShopItemIds.includes(item.id), `${itemId} takilamadi`);
  }

  return { room, tower, player };
}

/** Verilen sicakliktan bir saniye sogutur ve kac derece dustugunu doner. */
function coolOneSecond(room, tower, startTemperature) {
  tower.temperature = startTemperature;
  room.updateTowers(1000);
  return startTemperature - tower.temperature;
}

test("Isı Perdesi soğumayı hızlandırır ve menzili kısar", () => {
  // Basit olani: sayilari buyutur, karsiliginda bir sey alir.
  const kart = cardCatalog.find((entry) => entry.id === "isi-perdesi");
  assert.ok(kart, "Isi Perdesi katalogda yok");
  assert.deepEqual(
    kart.effects.map((modifier) => [modifier.stat, modifier.add]),
    [["cooling", 0.4], ["range", -0.1]]
  );

  const sade = towerRoom();
  const kartli = towerRoom(["isi-perdesi"]);

  const sadeDusus = coolOneSecond(sade.room, sade.tower, 80);
  const kartliDusus = coolOneSecond(kartli.room, kartli.tower, 80);
  assert.ok(kartliDusus > sadeDusus, `soguma artmadi: ${kartliDusus} <= ${sadeDusus}`);
  assert.ok(
    Math.abs(kartliDusus / sadeDusus - 1.4) < 0.05,
    `beklenen x1.4, olculen x${(kartliDusus / sadeDusus).toFixed(2)}`
  );

  assert.ok(
    sade.room.getTowerRange(kartli.tower) < sade.room.getTowerRange(sade.tower) + 0.001,
    "menzil cezasi uygulanmamis"
  );
});

test("Radyatör soğumayı sıcaklığa bağlar: sıcakken hızlı, soğukken normal", () => {
  // Ilginc olani: seviyeyi degil egrinin seklini degistirir. Kisa patlamalar
  // serbest kalir, surekli ates yine cezalanir.
  const sade = towerRoom();
  const radyatorlu = towerRoom(["radyator"]);

  const sicakSade = coolOneSecond(sade.room, sade.tower, 100);
  const sicakRadyator = coolOneSecond(radyatorlu.room, radyatorlu.tower, 100);
  const soqukSade = coolOneSecond(sade.room, sade.tower, 10);
  const soqukRadyator = coolOneSecond(radyatorlu.room, radyatorlu.tower, 10);

  assert.ok(
    Math.abs(sicakRadyator / sicakSade - 2) < 0.1,
    `100 derecede iki kat olmali, olculen x${(sicakRadyator / sicakSade).toFixed(2)}`
  );
  assert.ok(
    Math.abs(soqukRadyator / soqukSade - 1) < 0.15,
    `soguktayken fark olmamali, olculen x${(soqukRadyator / soqukSade).toFixed(2)}`
  );
});

test("Soğuk Duş kilidi erken açar ama soğumayı yavaşlatır", () => {
  const sade = towerRoom();
  const dusluAlan = towerRoom(["soguk-dus"]);

  // Kilit: ikisini de kilitle, 60 dereceye getir, bir tick sur.
  for (const { room, tower } of [sade, dusluAlan]) {
    tower.heatLocked = true;
    tower.temperature = 59;
    room.updateTowers(16);
  }

  assert.equal(sade.tower.heatLocked, true, "sade kule 59 derecede acilmamali");
  assert.equal(dusluAlan.tower.heatLocked, false, "Soguk Dus 60 derecede acmali");

  // Bedeli: soguma yavaslar, yani kule genelde daha sicak gezer.
  const sadeDusus = coolOneSecond(sade.room, sade.tower, 50);
  const dusluDusus = coolOneSecond(dusluAlan.room, dusluAlan.tower, 50);
  assert.ok(dusluDusus < sadeDusus, `soguma cezasi yok: ${dusluDusus} >= ${sadeDusus}`);
});

test("Buhar Tahliyesi öldürdüğü her düşman için ısı atar", () => {
  const { room, tower } = towerRoom([], ["buhar-tahliyesi"]);
  tower.temperature = 70;

  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.hp = 1;
  enemy.shield = 0;
  enemy.armor = 0;
  enemy.damageResistances = {};
  enemy.hitTypeResistances = {};
  enemy.statusResistances = {};

  const oldu = room.damageEnemy(enemy, 1000, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
  assert.equal(oldu, true, "dusman olmedi");
  assert.equal(tower.temperature, 64, "oldurme isiyi atmadi");
});

test("Buhar Tahliyesi kilitli kuleyi kurtarabilir", () => {
  // Kilitli kule ates edemez ama birakigi yanik hasariyla oldurebilir; o
  // oldurme kilidi kaldirabilmeli, yoksa esik yalnizca bir yerde bakiliyor
  // demektir.
  const { room, tower } = towerRoom([], ["buhar-tahliyesi"]);
  tower.temperature = 33;
  tower.heatLocked = true;

  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.hp = 1;
  enemy.shield = 0;
  enemy.armor = 0;
  enemy.damageResistances = {};
  enemy.hitTypeResistances = {};
  enemy.statusResistances = {};
  room.damageEnemy(enemy, 1000, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);

  assert.equal(tower.temperature, 27);
  assert.equal(tower.heatLocked, false, "tahliye kilidi kaldirmadi");
});

test("Kurşun Radyatör kart karşılığıyla aynı davranışı tek kuleye verir", () => {
  // Esya ile kart ayni kilidi paylasiyor: fark kapsamda, davranista degil.
  const { room, tower } = towerRoom([], ["kursun-radyator"]);
  const sade = towerRoom();

  const sicak = coolOneSecond(room, tower, 100);
  const sicakSade = coolOneSecond(sade.room, sade.tower, 100);
  assert.ok(
    Math.abs(sicak / sicakSade - 2) < 0.1,
    `esya radyatoru calismiyor: x${(sicak / sicakSade).toFixed(2)}`
  );
});

test("Soğutma Sıvısı üst üste alınabilir ve her alım soğumayı artırır", () => {
  const item = getShopItem("sogutma-sivisi");
  assert.equal(item.repeatable, true);
  assert.equal(item.maxStacks, 3);

  const sade = towerRoom();
  const bir = towerRoom([], ["sogutma-sivisi"]);
  const iki = towerRoom([], ["sogutma-sivisi", "sogutma-sivisi"]);

  const sadeDusus = coolOneSecond(sade.room, sade.tower, 80);
  const birDusus = coolOneSecond(bir.room, bir.tower, 80);
  const ikiDusus = coolOneSecond(iki.room, iki.tower, 80);

  assert.ok(birDusus > sadeDusus, "tek sisenin etkisi yok");
  assert.ok(ikiDusus > birDusus, "ikinci sise birikmedi");
});

test("soğutma içeriği hem kartta hem mağazada var", () => {
  // Bir kol yalnizca tek tarafta yasarsa oyuncunun ona ulasmasi tek yola baglanir.
  const kartlar = cardCatalog.filter((card) =>
    (card.unlocks ?? []).some((unlock) => unlock.startsWith("heat:")) ||
    (card.effects ?? []).some((modifier) => modifier.stat === "cooling"));
  const esyalar = shopCatalog.filter((item) =>
    (item.unlocks ?? []).some((unlock) => unlock.startsWith("heat:")) ||
    (item.effects ?? []).some((modifier) => modifier.stat === "cooling"));

  assert.ok(kartlar.length >= 6, `sogutma karti az: ${kartlar.length}`);
  assert.ok(esyalar.length >= 6, `sogutma esyasi az: ${esyalar.length}`);
});
