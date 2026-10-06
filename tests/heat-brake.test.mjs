/**
 * Isi freni gorunur olmali.
 *
 * 50 derecenin ustunde atis hizi dogrusal dusuyor ve bu uzun sure hicbir yerde
 * yazmiyordu: kule durumu susuyor, savas ozeti frenli zamani normal atis
 * dongusu sayiyordu, sogutma kartlari da "economy" diye boyaniyordu. Oyuncu
 * isiyi yalnizca kilit saniyor ve atis hizi kartini sogutmanin onune koyuyordu.
 *
 * Testlerin tuttugu sozler:
 *   1. Frendeki kulenin durumu "Isı freni %X" diyor; X kalan atis hizi.
 *      Engelleyici durumlar (kilit, bekleme, muhimmat) onun onunde kaliyor.
 *      Termal Kutle'de ve sabit aralikli kulede fren yok, durum da yok.
 *   2. Surekli atis hizi isi dengesi: isi baglarsa `soguma / tetikleme isisi`,
 *      baglamazsa frensiz tam hiz. Sayi gercek savasla ayni cikiyor.
 *   3. Sayi yalnizca isi baglayan kulede kule panelinin blogunda (`su`);
 *      anlik goruntude hic yok (her karede her kule icin gitmesi bosunaydi).
 *   4. Onizleme surekli tetiklemeyi gosteriyor: isi baglayan kulede atis hizi
 *      karti onu kipirdatmiyor, sogutma esyasi buyutuyor.
 *   5. Sogutma kartlari "dps" ekseni de tasiyor.
 *   6. Radyator kulenin surekli ateste oturdugu sicaklikta okunuyor: soguk
 *      kulede de kazanci gorunuyor. Namlu Molasi surekli hiza girmiyor.
 *   7. Fren yalnizca bu metinde gorunen bilgiyi (Ayna, Streak) silmiyor,
 *      yanina ekleniyor; ucgensiz Sentez'in asil engeli frenden once geliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cardCatalog, mergeDynamicTowerSnapshots, TOWER_HEAT_BRAKE_TEMPERATURE } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function kart(id) {
  const card = cardCatalog.find((entry) => entry.id === id);
  assert.ok(card, `${id} katalogda yok`);
  return card;
}

/** Takipci: mermili, varsayilan kolda isi baglayan bir kule. */
function kuleliOda(definitionId = "warrior-1", characterId = "warrior") {
  const room = createRoom(characterId);
  room.broadcast = () => {};
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin kare bulunamadi`);
  room.placeTower(client, { ...spot, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower.definition.id, definitionId);
  return { room, tower };
}

function kartAl(room, cardId) {
  room.pendingCardChoices.set("p1", [kart(cardId)]);
  room.chooseCard(client, { cardId });
  assert.equal(room.pendingCardChoices.has("p1"), false, `${cardId} secimi islenmedi`);
}

/**
 * Kuleyi hic tukenmeyen bir dusmana uzun sure ates ettirir ve ikinci yarida
 * saniyede kac tetikleme yaptigini sayar. Muhimmat ve enerji her tikte
 * doluyor: olculen tek sinir isi olsun.
 */
function olculenTetiklemeHizi(room, tower, seconds = 120) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x: tower.x + 20, y: tower.y, hp: 1e12, maxHp: 1e12, shield: 0, armor: 0, movementKind: "ground" });
  let triggers = 0;
  const consume = room.consumeTowerResources.bind(room);
  room.consumeTowerResources = (target) => {
    if (target === tower) triggers += 1;
    return consume(target);
  };
  const tickMs = 50;
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += tickMs) {
    if (elapsed === seconds * 500) triggers = 0;
    tower.ammo = tower.maxAmmo;
    tower.energy = tower.maxEnergy;
    enemy.hp = 1e12;
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateTowers(tickMs);
  }
  return triggers / (seconds / 2);
}

test("frendeki kule durumunda kalan atis hizini yaziyor", () => {
  const { room, tower } = kuleliOda();
  tower.temperature = TOWER_HEAT_BRAKE_TEMPERATURE;
  assert.ok(!room.getTowerStatus(tower).startsWith("Isı freni"), "esikte fren yok, durum da olmamali");

  tower.temperature = 75;
  assert.equal(room.getTowerStatus(tower), "Isı freni %50");
  // Durumdaki sayi savasin kullandigi carpanin aynisi.
  assert.equal(room.getTowerPerformanceAttackMultiplier(tower), room.getTowerPerformanceAttackMultiplier(tower, false) * 0.5);

  tower.temperature = 90;
  assert.equal(room.getTowerStatus(tower), "Isı freni %20");
});

test("engelleyici durumlar isi freninin onunde kaliyor", () => {
  const { room, tower } = kuleliOda();
  tower.temperature = 75;

  tower.heatLocked = true;
  assert.equal(room.getTowerStatus(tower), "Asiri Sicak");
  tower.heatLocked = false;

  tower.standby = true;
  assert.equal(room.getTowerStatus(tower), "Beklemede");
  tower.standby = false;

  tower.ammo = 0;
  assert.equal(room.getTowerStatus(tower), "Muhimmat Yok");
});

test("Termal Kütle freni kaldiriyor, durum da susuyor", () => {
  const { room, tower } = kuleliOda();
  tower.temperature = 75;
  assert.ok(room.getTowerStatus(tower).startsWith("Isı freni"));

  kartAl(room, "termal-kutle");
  assert.ok(!room.getTowerStatus(tower).startsWith("Isı freni"), `durum: ${room.getTowerStatus(tower)}`);
});

test("isi baglarsa surekli atis soguma bolu tetikleme isisi", () => {
  const { room, tower } = kuleliOda();
  const budget = room.getTowerHeatBudget(tower);
  assert.ok(budget, "mermili kule icin isi butcesi yok");

  const expected = room.getTowerCoolingPerSecond(tower) / room.getTowerShotHeat(tower);
  assert.ok(Math.abs(budget.sustained - expected) < 1e-9, `surekli ${budget.sustained}, beklenen ${expected}`);
  assert.ok(budget.sustained < budget.nominal, "olcum bos: bu kulede isi baglamiyor");
  assert.ok(Math.abs(budget.nominal - 1000 / room.getTowerFireInterval(tower)) < 1e-9, "soguk kulede tam hiz atis araligindan gelmeli");

  // Tam hiz o anki freni icermiyor: sicak kulede de ayni sayi.
  tower.temperature = 80;
  assert.ok(Math.abs(room.getTowerHeatBudget(tower).nominal - budget.nominal) < 1e-9, "tam hiz frenle birlikte dustu");
  tower.temperature = 0;

  // Panel blogu iki basamakli sayiyi tasiyor.
  assert.equal(room.getTowerStatsBlock(tower, "p1").su, Math.round(expected * 100) / 100);
});

test("sogutma tam hizi karsiliyorsa surekli atis tam hiz ve tele cikmiyor", () => {
  const { room, tower } = kuleliOda();
  // Kol asagida: atis basina isi dusuyor, atis hizi da; soguma ikisine yetiyor.
  tower.performance = 0.1;
  const budget = room.getTowerHeatBudget(tower);
  assert.ok(room.getTowerCoolingPerSecond(tower) / room.getTowerShotHeat(tower) > budget.nominal, "olcum bos: isi hala bagliyor");
  assert.equal(budget.sustained, budget.nominal);
  assert.equal(room.getTowerStatsBlock(tower, "p1").su, undefined);

  // Isinmayan yapinin butcesi hic yok.
  const depot = kuleliOda("warrior-8");
  assert.equal(depot.room.getTowerHeatBudget(depot.tower), undefined);
});

test("surekli atis gercek savasla ayni: sade, sogutmali ve Termal Kütle'li", () => {
  const sade = kuleliOda();
  const beklenenSade = sade.room.getTowerHeatBudget(sade.tower).sustained;
  const olculenSade = olculenTetiklemeHizi(sade.room, sade.tower);
  assert.ok(Math.abs(olculenSade / beklenenSade - 1) < 0.05, `beklenen ${beklenenSade.toFixed(3)}/sn, olculen ${olculenSade.toFixed(3)}/sn`);

  const sogutmali = kuleliOda();
  kartAl(sogutmali.room, "sogutma-sistemi");
  const beklenenSogutmali = sogutmali.room.getTowerHeatBudget(sogutmali.tower).sustained;
  assert.ok(Math.abs(beklenenSogutmali / beklenenSade - 1.5) < 1e-9, "Soğutma Sistemi surekli atisi x1.5 yapmali");
  const olculenSogutmali = olculenTetiklemeHizi(sogutmali.room, sogutmali.tower);
  assert.ok(Math.abs(olculenSogutmali / beklenenSogutmali - 1) < 0.05, `beklenen ${beklenenSogutmali.toFixed(3)}/sn, olculen ${olculenSogutmali.toFixed(3)}/sn`);

  // Termal Kutle freni kaldiriyor ama isi tavani kalkmiyor: kule kilide
  // kosup acilarak ayni dengeye varir. Onu "isiya takilmaz" saymak soguma
  // cezasini gizler ve karti bedava gosterirdi.
  const termal = kuleliOda();
  kartAl(termal.room, "termal-kutle");
  const beklenenTermal = termal.room.getTowerHeatBudget(termal.tower);
  assert.ok(beklenenTermal.sustained < beklenenTermal.nominal * 0.5, "Termal Kutle'de isi baglamiyor gorunuyor");
  assert.ok(termal.room.getTowerStatsBlock(termal.tower, "p1").su, "Termal Kutle'li kulede panel surekli atisi gostermeli");
  const olculenTermal = olculenTetiklemeHizi(termal.room, termal.tower);
  assert.ok(Math.abs(olculenTermal / beklenenTermal.sustained - 1) < 0.15, `beklenen ${beklenenTermal.sustained.toFixed(3)}/sn, olculen ${olculenTermal.toFixed(3)}/sn`);
});

test("surekli atis anlik goruntude yok, panel blogunda var", () => {
  const { room, tower } = kuleliOda();
  const onbellek = new Map();
  const { wire, towerBaseline, enemyBaseline } = room.applyWireDelta(room.getSnapshot());
  room.commitWireBaseline(towerBaseline, enemyBaseline);
  const kayitlar = JSON.parse(JSON.stringify(wire.towers));
  mergeDynamicTowerSnapshots(onbellek, kayitlar);
  const kayit = kayitlar.find((entry) => entry.id === tower.id);
  assert.ok(kayit, "kule tele cikmadi");
  for (const alan of ["sustainedAttacksPerSecond", "auraSlowMultiplier", "slowSpeedMultiplier", "slowSpeedMultiplierFar", "slowDurationMs", "slowCrit"]) {
    assert.equal(alan in kayit, false, `${alan} hala her karede gidiyor`);
  }
  assert.equal(typeof room.getTowerStatsBlock(tower, "p1").su, "number");
  tower.performance = 0.1;
  assert.equal(room.getTowerStatsBlock(tower, "p1").su, undefined, "isi baglamayi birakinca sayi kalkmadi");
});

/** "Etiket: once -> sonra" satirindan iki sayi. */
function onizlemeDegeri(preview, label) {
  const line = preview.lines.find((entry) => entry.startsWith(`${label}:`));
  assert.ok(line, `${label} satiri yok: ${preview.lines.join(" | ")}`);
  const [, before, after] = line.match(/: (-?[\d.]+) → (-?[\d.]+)$/);
  return { before: Number(before), after: Number(after), changed: preview.changed[preview.lines.indexOf(line)] };
}

function onizle(room, change) {
  let preview;
  room.previewRequestTimes.clear();
  room.sendTowerPreview({ sessionId: "p1", send: (_type, value) => { preview = value; } }, { ...change, requestId: "1" });
  assert.equal(preview.error, undefined);
  return preview;
}

test("onizleme atis hizi ile sogutmayi surekli atista karsilastiriyor", () => {
  const { room, tower } = kuleliOda();

  // Seri Atis atis hizini buyutuyor ama isi bagliyken surekli hiz yerinde.
  room.pendingCardChoices.set("p1", [kart("seri-atis")]);
  const hiz = onizle(room, { towerId: tower.id, cardId: "seri-atis" });
  const aralik = onizlemeDegeri(hiz, "Atış / etki aralığı (sn)");
  assert.ok(aralik.after < aralik.before, "olcum bos: Seri Atış araligi kisaltmadi");
  const hizliSurekli = onizlemeDegeri(hiz, "Sürekli tetikleme / sn");
  assert.equal(hizliSurekli.changed, false, `isi bagliyken atis hizi karti surekli hizi degistirdi: ${hizliSurekli.before} -> ${hizliSurekli.after}`);

  // Sogutma Sivisi +%35 soguma: surekli hiz ayni oranda buyuyor.
  room.state.players.get("p1").inventoryItemIds.push("sogutma-sivisi");
  const soguk = onizlemeDegeri(onizle(room, { towerId: tower.id, itemId: "sogutma-sivisi" }), "Sürekli tetikleme / sn");
  assert.equal(soguk.changed, true);
  assert.ok(Math.abs(soguk.after / soguk.before - 1.35) < 0.02, `beklenen x1.35, olculen ${soguk.before} -> ${soguk.after}`);
});

test("Radyator soguk kulede de surekli tetiklemeyi buyutuyor ve savasla ayni", () => {
  const sade = kuleliOda();
  const sadeSurekli = sade.room.getTowerHeatBudget(sade.tower).sustained;

  const { room, tower } = kuleliOda();
  kartAl(room, "radyator");
  tower.temperature = 0;
  const soguk = room.getTowerHeatBudget(tower).sustained;
  // Anlik sicaklikla okunsaydi 0 derecede kart hicbir sey degistirmiyor
  // gorunurdu; sayi sicakliga da bagli olmamali, yoksa her anlik goruntude
  // oynar.
  assert.ok(soguk > sadeSurekli * 1.5, `Radyator soguk kulede gorunmuyor: ${sadeSurekli.toFixed(3)} -> ${soguk.toFixed(3)}`);
  tower.temperature = 85;
  assert.ok(Math.abs(room.getTowerHeatBudget(tower).sustained - soguk) < 1e-9, "surekli hiz o anki sicaklikla oynuyor");
  tower.temperature = 0;

  const olculen = olculenTetiklemeHizi(room, tower);
  assert.ok(Math.abs(olculen / soguk - 1) < 0.05, `beklenen ${soguk.toFixed(3)}/sn, olculen ${olculen.toFixed(3)}/sn`);
});

test("Dokme Radyator onizlemesi soguk kulede surekli tetiklemeyi degisti gosteriyor", () => {
  const { room, tower } = kuleliOda();
  tower.temperature = 0;
  room.state.players.get("p1").inventoryItemIds.push("dokme-radyator");
  const surekli = onizlemeDegeri(onizle(room, { towerId: tower.id, itemId: "dokme-radyator" }), "Sürekli tetikleme / sn");
  assert.equal(surekli.changed, true, `${surekli.before} -> ${surekli.after}`);
  assert.ok(surekli.after > surekli.before);
});

test("Namlu Molasi muhimmat bitince surekli tetiklemeyi sisirmiyor", () => {
  const { room, tower } = kuleliOda();
  kartAl(room, "namlu-molasi");
  const dolu = room.getTowerHeatBudget(tower).sustained;
  // Kart yalnizca kule atamazken sogutuyor; o anki uc kat soguma surekli
  // atisin hizi degil.
  tower.ammo = 0;
  assert.ok(room.getTowerCoolingPerSecond(tower) > room.getTowerCoolingPerSecond(tower, { sustained: true }), "olcum bos: kart sogumayi buyutmedi");
  assert.equal(room.getTowerHeatBudget(tower).sustained, dolu);
});

test("fren Ayna sarjini silmiyor, yanina ekleniyor", () => {
  const { room, tower } = kuleliOda("archer-5", "archer");
  tower.melisMirrorCharge = room.getMelisBrokenMirrorCapacity(tower) / 2;
  tower.temperature = 40;
  assert.equal(room.getTowerStatus(tower), "Ayna 50%");
  tower.temperature = 72;
  const durum = room.getTowerStatus(tower);
  assert.ok(durum.includes("Ayna 50%"), `Ayna kayboldu: ${durum}`);
  assert.ok(durum.includes("Isı freni %56"), `fren yazmiyor: ${durum}`);
});

test("ucgensiz Sentez sicakken de asil engelini yaziyor ve butce tasimiyor", () => {
  const { room, tower } = kuleliOda("zeynep-3", "zeynep");
  tower.temperature = 72;
  assert.equal(room.getTowerStatus(tower), "Ucgen bekliyor");
  // Hic ates etmeyen kuleye "ısı sınırlı" surekli hiz yazmak yalan olurdu.
  assert.equal(room.getTowerHeatBudget(tower), undefined);
});

test("ana etkisi soguma olan kartlar dps ekseni de tasiyor", () => {
  for (const id of ["sogutma-sistemi", "isi-perdesi", "buz-akusu", "namlu-molasi", "sogutmali-kaynak", "soguk-zincir"]) {
    assert.ok(kart(id).axes.includes("dps"), `${id} dps ekseni tasimiyor: ${kart(id).axes.join(", ")}`);
  }
  // Soguma artiran her duz etkili kart da kapsamda: yeni biri eklenirse
  // ekseni unutulmasin.
  for (const card of cardCatalog) {
    if (card.effects.some((modifier) => modifier.stat === "cooling" && modifier.add > 0)) {
      assert.ok(card.axes.includes("dps"), `${card.id} sogutuyor ama dps ekseni yok`);
    }
  }
});
