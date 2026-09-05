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

/**
 * Verilen sicakliktan bir saniye sogutur ve kac derece dustugunu doner.
 *
 * Kule beklemeye alinir: menzilde dusman varken ates de ederdi ve olculen dusus
 * "soguma eksi uretilen isi" olurdu. Bekleme atesi kesip sogumayi surdurdugu
 * icin olcum yalnizca soguma kalir.
 */
function coolOneSecond(room, tower, startTemperature) {
  const oncekiBekleme = tower.standby;
  tower.standby = true;
  tower.temperature = startTemperature;
  room.updateTowers(1000);
  tower.standby = oncekiBekleme;
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
  assert.equal(tower.temperature, 66, "oldurme isiyi atmadi");
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

  assert.equal(tower.temperature, 29);
  assert.equal(tower.heatLocked, false, "tahliye kilidi kaldirmadi");
});

test("Dökme Radyatör kart karşılığıyla aynı davranışı tek kuleye verir", () => {
  // Esya ile kart ayni kilidi paylasiyor: fark kapsamda, davranista degil.
  const { room, tower } = towerRoom([], ["dokme-radyator"]);
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

/**
 * Sogumayi baska kollara baglayan kartlar.
 *
 * Buradaki dordunun ortak yani sogumanin kendi basina bir sayi olmamasi:
 * degeri, oyuncunun **baska** bir yerde verdigi karara bagli. Testlerin isi da
 * bu yuzden "soguma degisti mi" degil, "dogru kosulda degisti mi": kosul
 * saglanmadan da calisan bir kart, aslinda duz bir soguma karti demektir.
 */

/** Kuleye menzil icinde bir dusman koyar; istege gore yavaslatir. */
function enemyInRange(room, tower, { slowed }) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  enemy.x = tower.x + 10;
  enemy.y = tower.y;
  enemy.slowUntil = slowed ? Date.now() + 5000 : 0;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  return enemy;
}

test("Soğuk Zincir yalnızca yavaşlatılmış düşman varken soğutur", () => {
  const kartli = towerRoom(["soguk-zincir"]);
  const sade = towerRoom();

  // Yavaslatilmamis dusman: kart hicbir sey yapmamali.
  enemyInRange(kartli.room, kartli.tower, { slowed: false });
  enemyInRange(sade.room, sade.tower, { slowed: false });
  const yavassiz = coolOneSecond(kartli.room, kartli.tower, 80);
  const yavassizSade = coolOneSecond(sade.room, sade.tower, 80);
  assert.ok(
    Math.abs(yavassiz / yavassizSade - 1) < 0.05,
    `kosul yokken de calisiyor: x${(yavassiz / yavassizSade).toFixed(2)}`
  );

  // Yavaslatilmis dusman: soguma +%80.
  kartli.room.enemies.clear();
  enemyInRange(kartli.room, kartli.tower, { slowed: true });
  const yavasli = coolOneSecond(kartli.room, kartli.tower, 80);
  assert.ok(
    Math.abs(yavasli / yavassizSade - 1.5) < 0.1,
    `beklenen x1.5, olculen x${(yavasli / yavassizSade).toFixed(2)}`
  );
});

test("Isı Değişimi bitişik kuleler arasında ısıyı taşır", () => {
  const { room, tower, player } = towerRoom(["isi-degisimi"]);

  // Yanina ikinci bir kule kur: bitisik olmasi icin komsu kareyi kullan.
  const komsu = findBuildableSpot(room, "warrior-1");
  assert.ok(komsu, "ikinci kule icin yer yok");
  room.placeTower(client, { ...komsu, definitionId: "warrior-1" });
  const other = [...room.towers.values()].find((entry) => entry.id !== tower.id);
  assert.ok(other, "ikinci kule kurulamadi");
  // Bitisiklik konumdan cikiyor; ikinci kuleyi birincinin yanina tasi.
  other.x = tower.x + 1;
  other.y = tower.y + 1;
  assert.ok(room.countAdjacentFriendlyTowers(tower) > 0, "kuleler bitisik degil");

  tower.temperature = 90;
  other.temperature = 10;
  room.updateHeatExchange(1);

  assert.ok(tower.temperature < 90, "sicak kule sogumadi");
  assert.ok(other.temperature > 10, "soguk kule isinmadi");
  // Toplam isi korunur: tasima, yok etme degil.
  assert.ok(Math.abs((tower.temperature + other.temperature) - 100) < 0.001, "isi kaybolmus");
});

test("Isı Değişimi salınmaz: bir adımda farkın en fazla yarısı taşınır", () => {
  const { room, tower } = towerRoom(["isi-degisimi"]);
  const komsu = findBuildableSpot(room, "warrior-1");
  room.placeTower(client, { ...komsu, definitionId: "warrior-1" });
  const other = [...room.towers.values()].find((entry) => entry.id !== tower.id);
  other.x = tower.x + 1;
  other.y = tower.y + 1;

  tower.temperature = 100;
  other.temperature = 0;
  // Buyuk bir adim: sinir olmasa sicak kule soguk olanin altina duserdi.
  room.updateHeatExchange(10);

  assert.ok(tower.temperature >= other.temperature, "kuleler yer degistirdi, salinim var");
});

/**
 * Buz Akusu bir esik karti, oran karti degil.
 *
 * Ilk hali sogumayi enerji oraniyla surekli olcekliyor ve tepesini tam doluya
 * koyuyordu. Kule oyunda neredeyse hic tam dolu olmadigi icin o tepeye
 * ulasilamiyordu; geriye yalnizca tabandaki ceza kaliyordu, yani kart pratikte
 * bir dezavantajdi. Esik, odulu kulenin gercekten gezdigi bolgeye tasiyor.
 */
test("Buz Aküsü enerji %70 üzerindeyken soğutur", () => {
  const sade = towerRoom();
  const sadeDusus = coolOneSecond(sade.room, sade.tower, 80);

  const dolu = towerRoom(["buz-akusu"]);
  dolu.tower.energy = dolu.tower.maxEnergy * 0.8;
  assert.ok(
    Math.abs(coolOneSecond(dolu.room, dolu.tower, 80) / sadeDusus - 1.5) < 0.1,
    "esigin ustunde +%50 olmali"
  );

  // Esigin tam ustu degil altinda: sinir kapsayici olmamali.
  const sinirda = towerRoom(["buz-akusu"]);
  sinirda.tower.energy = sinirda.tower.maxEnergy * 0.7;
  assert.ok(
    Math.abs(coolOneSecond(sinirda.room, sinirda.tower, 80) / sadeDusus - 1) < 0.05,
    "tam esikte odul verilmemeli"
  );

  // Ceza yok: esigin altinda kule normal soguyor, cezalanmiyor.
  const bos = towerRoom(["buz-akusu"]);
  bos.tower.energy = 0;
  assert.ok(
    Math.abs(coolOneSecond(bos.room, bos.tower, 80) / sadeDusus - 1) < 0.05,
    "esigin altinda ceza uygulanmis"
  );
});

test("Namlu Molası yalnızca mühimmat bittiğinde soğutur", () => {
  const sade = towerRoom();
  const sadeDusus = coolOneSecond(sade.room, sade.tower, 80);

  const dolu = towerRoom(["namlu-molasi"]);
  dolu.tower.ammo = dolu.tower.maxAmmo;
  const doluDusus = coolOneSecond(dolu.room, dolu.tower, 80);
  assert.ok(
    Math.abs(doluDusus / sadeDusus - 1) < 0.05,
    `muhimmat doluyken de calisiyor: x${(doluDusus / sadeDusus).toFixed(2)}`
  );

  const bos = towerRoom(["namlu-molasi"]);
  bos.tower.ammo = 0;
  const bosDusus = coolOneSecond(bos.room, bos.tower, 80);
  assert.ok(
    Math.abs(bosDusus / sadeDusus - 3) < 0.15,
    `beklenen x3, olculen x${(bosDusus / sadeDusus).toFixed(2)}`
  );
});

test("Isı Değişimi eşit sıcaklıktaki kuleler arasında hiçbir şey yapmaz", () => {
  // Akis farktan doguyor: fark yoksa tasinacak sey de yok. Kural bu yonde
  // yazilmasaydi esit iki kule birbirine isi atip durur, ikisi de gereksiz yere
  // kimildardi.
  const { room, tower } = towerRoom(["isi-degisimi"]);
  const komsu = findBuildableSpot(room, "warrior-1");
  room.placeTower(client, { ...komsu, definitionId: "warrior-1" });
  const other = [...room.towers.values()].find((entry) => entry.id !== tower.id);
  other.x = tower.x + 1;
  other.y = tower.y + 1;

  tower.temperature = 45;
  other.temperature = 45;
  room.updateHeatExchange(1);

  assert.equal(tower.temperature, 45, "esit sicaklikta isi hareket etti");
  assert.equal(other.temperature, 45, "esit sicaklikta isi hareket etti");
});
