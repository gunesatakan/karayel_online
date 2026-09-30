/**
 * Ulti hazir sinyali ve ulti karnesi.
 *
 * Ulti sessizdi: hazir oldugunda yalnizca bir kenar rengi, basildiginda soluk
 * bir ton, sonucu hic soylenmiyordu. Sunucu artik ulti sonuclaninca atana
 * `ultimate:result` (isabet, olum; sutunda en iyi sutun) ve odanin geri
 * kalanina `ultimate:cast` yolluyor.
 *
 * Buradaki testlerin tuttugu sozler:
 * - sayilar gercek: isabet ultinin gercekten indigi dusman, olum ultinin kendi
 *   vurusuyla olen; bagisik dusman ne isabet ne "en iyi sutun" sayiliyor;
 * - drone'lu ulti atisi beklemiyor, karne son drone dusunce bir kez gidiyor;
 * - karne yalnizca atana, cip yalnizca digerlerine;
 * - istemcinin metni ve derecesi bu sayilardan, sisirmeden kuruluyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ULTIMATE_CAST_ZOOM,
  ULTIMATE_CAST_ZOOM_MS,
  ULTIMATE_PERFECT_MIN_HITS,
  ULTIMATE_STAMP_LAG_MS,
  UltimateReadyWatch,
  getBestUltimateColumnHits,
  getMapGridSize,
  getMapOrigin,
  getUltimateAimTier,
  getUltimateCastZoom,
  getUltimateColumnSpan,
  getUltimateResultKind,
  getUltimateShockwavePose,
  getUltimateStampText,
  getUltimateTeamChipText
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

/** Gonderilen mesajlari kaydeden istemci ve yayin. */
function wire(room, sessionIds = ["p1", "p2"]) {
  const sent = new Map(sessionIds.map((id) => [id, []]));
  const clients = sessionIds.map((sessionId) => ({
    sessionId,
    send(type, payload) {
      sent.get(sessionId).push({ type, payload });
    }
  }));
  const broadcasts = [];
  room.clients = clients;
  room.broadcast = (type, payload, options) => broadcasts.push({ type, payload, options });
  const resultsFor = (sessionId) => sent.get(sessionId).filter((entry) => entry.type === "ultimate:result").map((entry) => entry.payload);
  return {
    clients,
    owner: clients[0],
    resultsFor,
    results: () => resultsFor("p1"),
    casts: () => broadcasts.filter((entry) => entry.type === "ultimate:cast")
  };
}

/** Sutuna dusman koyar; `hp` 160'in altindaysa sutun ultisi tek atar. */
function putEnemy(room, column, { hp = 50, row = 3 } = {}) {
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  enemy.x = origin.x + column * gridSize + gridSize / 2;
  enemy.y = origin.y + gridSize * row;
  enemy.maxHp = hp;
  enemy.hp = hp;
  enemy.shield = 0;
  enemy.maxShield = 0;
  enemy.movementKind = "ground";
  enemy.statusResistances = {};
  return enemy;
}

function ready(room) {
  room.state.players.get("p1").ultimateCharge = 100;
}

// --- saf kurallar ---------------------------------------------------------

test("sutun sayimi sunucunun sol <= x < sag kuralini kullanir", () => {
  const span = getUltimateColumnSpan(10, 20, 2);
  assert.deepEqual(span, { left: 50, right: 70 });
  // Sol kenar sutunun, sag kenar bir sonrakinin.
  assert.equal(getBestUltimateColumnHits([50, 50, 69.99, 70], 10, 20, 5), 3);
  // Harita disi hicbir sutuna girmiyor.
  assert.equal(getBestUltimateColumnHits([5, 111, Number.NaN], 10, 20, 5), 0);
  assert.equal(getBestUltimateColumnHits([], 10, 20, 5), 0);
});

test("nisan derecesi: en iyiyle esit ve en az 3 mukemmel, %60 iyi, alti notr", () => {
  assert.equal(ULTIMATE_PERFECT_MIN_HITS, 3);
  assert.equal(getUltimateAimTier(6, 6), "perfect");
  assert.equal(getUltimateAimTier(3, 3), "perfect");
  // Iki dusmanli en iyi sutun "mukemmel" degil; oran yine de iyi.
  assert.equal(getUltimateAimTier(2, 2), "good");
  assert.equal(getUltimateAimTier(3, 5), "good");
  assert.equal(getUltimateAimTier(2, 5), "neutral");
  assert.equal(getUltimateAimTier(0, 4), "neutral");
  // Sahada vurulacak kimse yoksa derece de yok.
  assert.equal(getUltimateAimTier(0, 0), undefined);
  assert.equal(getUltimateAimTier(0, undefined), undefined);
});

test("karne metni sunucunun sayilarini oldugu gibi soyler", () => {
  assert.deepEqual(getUltimateStampText({ kind: "column", hits: 6, kills: 4, best: 6 }), {
    title: "SÜTUN · 6 isabet · 4 öldü",
    grade: { tier: "perfect", text: "MÜKEMMEL NİŞAN" }
  });
  assert.deepEqual(getUltimateStampText({ kind: "column", hits: 3, kills: 1, best: 5 }).grade, { tier: "good", text: "İyi nişan · 3/5" });
  assert.deepEqual(getUltimateStampText({ kind: "column", hits: 1, kills: 0, best: 9 }).grade, { tier: "neutral", text: "En kalabalık sütun: 9" });
  assert.deepEqual(getUltimateStampText({ kind: "column", hits: 0, kills: 0, best: 0 }), { title: "SÜTUN · isabet yok" });
  assert.equal(getUltimateStampText({ kind: "drones", hits: 4, kills: 3 }).title, "DRONLAR · 4 isabet · 3 öldü");
  assert.equal(getUltimateStampText({ kind: "drones", hits: 4, kills: 3 }).grade, undefined, "derece yalnizca sutunda");
  assert.equal(getUltimateStampText({ kind: "repair", hits: 0, kills: 0, heal: 4 }).title, "TAMİR · +4 üs canı");
  assert.equal(getUltimateStampText({ kind: "repair", hits: 0, kills: 0, heal: 0 }).title, "TAMİR · üs canı değişmedi");
  assert.equal(getUltimateStampText({ kind: "heal", hits: 7, kills: 0, heal: 28 }).title, "CAN DALGASI · +28 üs canı · 7 yavaşladı");
  assert.equal(getUltimateStampText({ kind: "sympathy", hits: 9, kills: 4 }).title, "SEMPATİ · 9 bağlandı · 4 öldü");
  assert.equal(getUltimateStampText({ kind: "nightmare", hits: 214, kills: 23 }).title, "GOTİK KABUS · 214 isabet · 23 öldü");
  // Kesirli ya da bozuk sayi buyutulmuyor, yuvarlaniyor.
  assert.equal(getUltimateStampText({ kind: "meteor", hits: 2.4, kills: -1 }).title, "METEOR · 2 isabet · 0 öldü");
});

test("derece nisandan: zincir olum isabeti dusurse de en kalabalik sutun mukemmel", () => {
  // Bes dusmanli en iyi sutun secildi; biri sirasi gelmeden zincir olumle gitti.
  const chained = getUltimateStampText({ kind: "column", hits: 4, kills: 4, best: 5, aim: 5 });
  assert.equal(chained.title, "SÜTUN · 4 isabet · 4 öldü", "baslik gercek isabet; sayi sisirilmiyor");
  assert.deepEqual(chained.grade, { tier: "perfect", text: "MÜKEMMEL NİŞAN" });
  // Iyi derecenin metni de nisandan: derece ve metin ayni sayiyi soyluyor.
  assert.deepEqual(getUltimateStampText({ kind: "column", hits: 2, kills: 1, best: 5, aim: 3 }).grade, { tier: "good", text: "İyi nişan · 3/5" });
  // Nisan yoksa (isabetle ayni oldugu icin yazilmadi) derece isabetten.
  assert.deepEqual(getUltimateStampText({ kind: "column", hits: 3, kills: 1, best: 5 }).grade, { tier: "good", text: "İyi nişan · 3/5" });
});

test("takim cipi tek satir: once olum, sonra can, sonra isabet", () => {
  assert.equal(getUltimateTeamChipText("Zeynep", { kind: "column", hits: 6, kills: 4 }), "Zeynep ULTİ · 4 öldü");
  assert.equal(getUltimateTeamChipText("Atakan", { kind: "repair", hits: 0, kills: 0, heal: 9 }), "Atakan ULTİ · +9 üs canı");
  assert.equal(getUltimateTeamChipText("Onur", { kind: "sympathy", hits: 5, kills: 0 }), "Onur ULTİ · 5 bağlandı");
  assert.equal(getUltimateTeamChipText("Ömer", { kind: "lock", hits: 3, kills: 0 }), "Ömer ULTİ · 3 isabet");
  assert.equal(getUltimateTeamChipText("Melis", { kind: "nightmare", hits: 0, kills: 0 }), "Melis ULTİ");
});

test("her karakterin ultisi bir sonuc turune donusur", () => {
  assert.equal(getUltimateResultKind("zeynep"), "column");
  assert.equal(getUltimateResultKind("warrior", "attack"), "drones");
  assert.equal(getUltimateResultKind("warrior", "repair"), "repair");
  assert.equal(getUltimateResultKind("warrior"), "drones");
  assert.equal(getUltimateResultKind("mage"), "meteor");
  assert.equal(getUltimateResultKind("tank"), "lock");
  assert.equal(getUltimateResultKind("healer"), "heal");
  assert.equal(getUltimateResultKind("onur"), "sympathy");
  assert.equal(getUltimateResultKind("archer"), "nightmare");
  assert.equal(getUltimateResultKind("bilinmeyen"), "burst");
});

test("hazir sinyali yalnizca dolmamistan dolmusa geciste bir kez", () => {
  const watch = new UltimateReadyWatch();
  // Ilk gozlem gecis degil: yeniden baglanan oyuncunun dugmesi aninda atmasin.
  assert.equal(watch.observe(100), false);
  assert.equal(watch.observe(100), false);
  assert.equal(watch.observe(0), false);
  assert.equal(watch.observe(99), false);
  assert.equal(watch.observe(100), true);
  assert.equal(watch.observe(100), false, "dolu kalan sarj tekrar atmamali");
  assert.equal(watch.observe(40), false);
  assert.equal(watch.observe(100, { over: true }), false, "mac bittiyse sinyal yok");
  watch.reset();
  assert.equal(watch.observe(100), false);
});

test("atis zoomu 1.03'e cikip tam 1'e doner; sok dalgasi hareket azaltmada yayilmaz", () => {
  assert.equal(getUltimateCastZoom(0), 1);
  assert.ok(Math.abs(getUltimateCastZoom(ULTIMATE_CAST_ZOOM_MS / 2) - ULTIMATE_CAST_ZOOM) < 1e-9);
  assert.equal(getUltimateCastZoom(ULTIMATE_CAST_ZOOM_MS), 1);
  assert.equal(getUltimateCastZoom(5000), 1);
  for (let ms = 0; ms <= ULTIMATE_CAST_ZOOM_MS; ms += 10) {
    const zoom = getUltimateCastZoom(ms);
    assert.ok(zoom >= 1 && zoom <= ULTIMATE_CAST_ZOOM, `${ms} ms: ${zoom}`);
  }

  const start = getUltimateShockwavePose(0, false);
  const end = getUltimateShockwavePose(1, false);
  assert.equal(start.reach, 0);
  assert.equal(end.reach, 1);
  assert.equal(end.alpha, 0);
  const still = [0, 0.5, 1].map((t) => getUltimateShockwavePose(t, true));
  assert.ok(still.every((pose) => pose.reach === 1), "hareket azaltmada dalga buyumemeli");
  assert.ok(still[0].alpha > still[1].alpha && still[1].alpha > still[2].alpha, "yerinde sonmeli");
  // Karne oynatma gecikmesinin hemen ustunde: atistan ~600 ms sonra.
  assert.ok(ULTIMATE_STAMP_LAG_MS > 0 && 500 + ULTIMATE_STAMP_LAG_MS <= 700);
});

// --- sunucu ---------------------------------------------------------------

test("sutun karnesi: gercek isabet, gercek olum ve atis anindaki en iyi sutun", () => {
  const room = createRoom("zeynep");
  const io = wire(room);
  // Hedef sutunda uc dusman: ikisi tek atiliyor, biri dayaniyor.
  const hedef = 4;
  const dusenler = [putEnemy(room, hedef, { hp: 50, row: 2 }), putEnemy(room, hedef, { hp: 90, row: 4 })];
  const dayanan = putEnemy(room, hedef, { hp: 10_000_000, row: 6 });
  // Baska sutunda bes dusman: en iyi sutun orasi.
  const kalabalik = Array.from({ length: 5 }, (_, index) => putEnemy(room, 7, { hp: 10_000_000, row: 2 + index }));
  ready(room);

  room.useUltimate(io.owner, { column: hedef });

  const results = io.results();
  assert.equal(results.length, 1, "karne tam bir kez gitmeli");
  assert.deepEqual(results[0], { kind: "column", hits: 3, kills: 2, best: 5 });
  // Sayilar sahanin kendisiyle ayni.
  assert.ok(dusenler.every((enemy) => !room.enemies.has(enemy.id)), "tek atilmasi gerekenler yasiyor");
  assert.ok(dayanan.hp < dayanan.maxHp && room.enemies.has(dayanan.id));
  assert.ok(kalabalik.every((enemy) => enemy.hp === enemy.maxHp), "baska sutun vuruldu");

  const casts = io.casts();
  assert.equal(casts.length, 1);
  assert.deepEqual(casts[0].payload, { ownerId: "p1", kind: "column", hits: 3, kills: 2 });
  assert.equal(casts[0].options?.except, io.owner, "cip atana gitmemeli; onun karnesi var");
});

test("en kalabalik sutunu yakalayan nisan mukemmel sayilir", () => {
  const room = createRoom("zeynep");
  const io = wire(room);
  putEnemy(room, 2, { hp: 10_000_000 });
  for (let row = 1; row <= 4; row += 1) putEnemy(room, 6, { hp: 10_000_000, row });
  ready(room);

  room.useUltimate(io.owner, { column: 6 });

  const [result] = io.results();
  assert.equal(result.hits, 4);
  assert.equal(result.best, 4);
  assert.equal(getUltimateStampText(result).grade?.text, "MÜKEMMEL NİŞAN");
});

test("zincir olum (lanet patlamasi) sutundaki komsuyu sirasi gelmeden oldurunce derece nisandan", () => {
  const room = createRoom("zeynep");
  const io = wire(room);
  const ilk = putEnemy(room, 5, { hp: 50, row: 2 });
  const komsu = putEnemy(room, 5, { hp: 10_000_000, row: 3 });
  const son = putEnemy(room, 5, { hp: 10_000_000, row: 5 });
  putEnemy(room, 1, { hp: 10_000_000 });
  // Melis'in lanet patlamasi: olen dusman sutundaki komsusunu olduruyor.
  // Gercek patlama olen dusmanin kaldirilmasindan once calisiyor; burada da.
  const burst = room.triggerMelisCurseDeathBurst.bind(room);
  room.triggerMelisCurseDeathBurst = (enemy, now) => {
    if (enemy.id === ilk.id) room.damageEnemy(komsu, 1e12, 0, "archer-3-curse-burst", "p1", "true");
    return burst(enemy, now);
  };
  ready(room);

  room.useUltimate(io.owner, { column: 5 });

  assert.equal(room.enemies.has(komsu.id), false, "komsu zincirle oldu");
  assert.ok(son.hp < son.maxHp, "sutunun kalani vuruldu");
  const [result] = io.results();
  assert.deepEqual(result, { kind: "column", hits: 2, kills: 1, best: 3, aim: 3 }, "isabet gercek, nisan atis anindaki sutun");
  assert.equal(getUltimateStampText(result).grade?.text, "MÜKEMMEL NİŞAN");
  assert.equal(getUltimateStampText(result).title, "SÜTUN · 2 isabet · 1 öldü");
  assert.equal("aim" in io.casts()[0].payload, false, "nisan yalnizca atanin karnesinde");
});

test("bagisik (hukmedilen) dusman ne isabet ne en iyi sutun sayilir", () => {
  const room = createRoom("zeynep");
  const io = wire(room);
  const serbest = putEnemy(room, 3, { hp: 10_000_000, row: 2 });
  const hukmedilen = [putEnemy(room, 3, { hp: 10_000_000, row: 4 }), putEnemy(room, 3, { hp: 10_000_000, row: 5 })];
  for (const enemy of hukmedilen) enemy.dominatedUntil = Date.now() + 60_000;
  ready(room);

  room.useUltimate(io.owner, { column: 3 });

  assert.ok(serbest.hp < serbest.maxHp);
  assert.ok(hukmedilen.every((enemy) => enemy.hp === enemy.maxHp), "bagisik dusman hasar aldi");
  assert.deepEqual(io.results()[0], { kind: "column", hits: 1, kills: 0, best: 1 });
});

test("snapshot sarji tabana yuvarliyor: telde 100 atisin kabul edilecegi demek", () => {
  const room = createRoom("zeynep");
  const io = wire(room);
  putEnemy(room, 3, { hp: 10_000_000 });
  const player = room.state.players.get("p1");
  const wireCharge = () => room.getSnapshot().players.find((entry) => entry.id === "p1").ultimateCharge;

  // Yuvarlamada 99.6 "100" gidiyordu: hazir sesi caliyor, atis reddediliyordu.
  player.ultimateCharge = 99.6;
  assert.equal(wireCharge(), 99);
  room.useUltimate(io.owner, { column: 3 });
  assert.equal(io.results().length, 0, "sunucu 100'un altinda atisi kabul etmiyor");

  player.ultimateCharge = 100;
  assert.equal(wireCharge(), 100);
  room.useUltimate(io.owner, { column: 3 });
  assert.equal(io.results().length, 1);
});

test("gecersiz sutun sarji yakmaz ve karne yollamaz", () => {
  const room = createRoom("zeynep");
  const io = wire(room);
  putEnemy(room, 1);
  ready(room);

  room.useUltimate(io.owner, { column: -1 });

  assert.equal(io.results().length, 0);
  assert.equal(io.casts().length, 0);
});

test("anlik ultilerde de karne var ve bos alan yazilmiyor", () => {
  const room = createRoom("mage");
  const io = wire(room);
  const zayif = putEnemy(room, 1, { hp: 40 });
  putEnemy(room, 5, { hp: 10_000_000 });
  ready(room);

  room.useUltimate(io.owner, {});

  const [result] = io.results();
  assert.deepEqual(result, { kind: "meteor", hits: 2, kills: 1 });
  assert.ok(!("best" in result) && !("heal" in result), "bos alan tele yazilmamali");
  assert.ok(!room.enemies.has(zayif.id));
  assert.ok(!("heal" in io.casts()[0].payload));
});

test("can dalgasi usse gercekten donen cani yazar, tavanda kirpilani degil", () => {
  const room = createRoom("healer");
  const io = wire(room);
  putEnemy(room, 1, { hp: 10_000_000 });
  putEnemy(room, 2, { hp: 10_000_000 });
  room.teamHealth = 90;
  ready(room);

  room.useUltimate(io.owner, {});

  assert.equal(room.teamHealth, 100);
  assert.deepEqual(io.results()[0], { kind: "heal", hits: 2, kills: 0, heal: 10 });
  assert.deepEqual(io.casts()[0].payload, { ownerId: "p1", kind: "heal", hits: 2, kills: 0, heal: 10 });
});

/** Atakan kulelerini kurar ve dusmanlari yanlarina koyar. */
function atakanWithDrones(room, towerCount) {
  const client = { sessionId: "p1", send() {} };
  const towers = [];
  for (let index = 0; index < towerCount; index += 1) {
    const spot = findBuildableSpot(room, "warrior-1");
    assert.ok(spot, "Atakan kulesi icin yer yok");
    room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
    towers.push([...room.towers.values()].at(-1));
  }
  return towers;
}

function flyDrones(room, ticks = 400) {
  for (let tick = 0; tick < ticks && [...room.drones.values()].some((drone) => drone.mode === "attack" || drone.mode === "repair"); tick += 1) {
    room.updateDrones(50, 0.05);
    room.settleUltimateReports();
  }
  room.settleUltimateReports();
}

test("Atakan drone'lari atisi bekletmez; karne son drone dusunce bir kez gider", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  const towers = atakanWithDrones(room, 2);
  const hedefler = towers.map((tower) => {
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    Object.assign(enemy, { x: tower.x + 20, y: tower.y, hp: 30, maxHp: 30, shield: 0, maxShield: 0, statusResistances: {} });
    return enemy;
  });
  room.enemySpatialGrid.rebuild(room.enemies.values());
  ready(room);

  room.useUltimate(io.owner, { mode: "attack" });

  // Atis aninda: sarj harcandi, drone'lar havada, karne henuz yok.
  assert.equal(room.state.players.get("p1").ultimateCharge, 0);
  assert.equal([...room.drones.values()].filter((drone) => drone.mode === "attack").length, 2);
  assert.equal(io.results().length, 0, "drone'lar inmeden karne gitmemeli");

  flyDrones(room);

  assert.ok(hedefler.every((enemy) => !room.enemies.has(enemy.id)), "drone'lar hedefi oldurmedi");
  assert.deepEqual(io.results(), [{ kind: "drones", hits: 2, kills: 2 }]);
  assert.equal(io.casts().length, 1);
  assert.deepEqual(io.casts()[0].payload, { ownerId: "p1", kind: "drones", hits: 2, kills: 2 });
});

test("sahada dusman yoksa drone cikmaz ve karne hemen 'isabet yok' der", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  atakanWithDrones(room, 1);
  ready(room);

  room.useUltimate(io.owner, { mode: "attack" });

  assert.deepEqual(io.results(), [{ kind: "drones", hits: 0, kills: 0 }]);
  assert.equal(getUltimateStampText(io.results()[0]).title, "DRONLAR · isabet yok");
});

test("tamir drone'lari usse donen cani sayar; tavanda kirpilan yazilmaz", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  atakanWithDrones(room, 2);
  room.teamHealth = 96;
  ready(room);

  room.useUltimate(io.owner, { mode: "repair" });
  assert.equal(io.results().length, 0);
  flyDrones(room, 1000);

  assert.equal(room.teamHealth, 100);
  // Iki drone 3'er can getiriyor ama us 4 eksikti.
  assert.deepEqual(io.results(), [{ kind: "repair", hits: 0, kills: 0, heal: 4 }]);
});

test("yeniden baglanan oyuncu havadaki drone'larin karnesini alir", () => {
  const room = createRoom("warrior");
  const io = wire(room, ["p1", "p1-yeni"]);
  const [tower] = atakanWithDrones(room, 1);
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x: tower.x + 20, y: tower.y, hp: 30, maxHp: 30, shield: 0, maxShield: 0, statusResistances: {} });
  ready(room);
  room.useUltimate(io.owner, { mode: "attack" });

  const player = room.state.players.get("p1");
  room.transferPlayerSession("p1", "p1-yeni", player);
  flyDrones(room);

  assert.equal(io.results().length, 0, "eski oturuma karne gitmemeli");
  assert.deepEqual(io.resultsFor("p1-yeni"), [{ kind: "drones", hits: 1, kills: 1 }]);
  const casts = io.casts();
  assert.equal(casts.length, 1);
  assert.equal(casts[0].payload.ownerId, "p1-yeni");
  assert.equal(casts[0].options?.except, io.clients[1]);
});

test("Gotik Kabus: suredeki Melis kulesi vuruslari sayilir, durum tikleri ve baskasinin kulesi sayilmaz", () => {
  const room = createRoom("archer");
  const io = wire(room);
  const client = { sessionId: "p1", send() {} };
  const spot = findBuildableSpot(room, "archer-1");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "archer-1" });
  const tower = [...room.towers.values()].at(-1);
  const zayif = putEnemy(room, 2, { hp: 5 });
  const saglam = putEnemy(room, 4, { hp: 10_000_000 });
  ready(room);

  room.useUltimate(io.owner, {});
  assert.equal(io.results().length, 0, "Kabus suresi bitmeden karne gitmemeli");

  const hit = (enemy, amount, source = tower.definition.id, towerId = tower.id) =>
    room.damageEnemy(enemy, amount, 0, source, "p1", "true", 0, tower.level, towerId);
  hit(saglam, 10);
  hit(saglam, 10);
  hit(zayif, 50);
  // Kanama tiki: ultinin guclendirdigi bir vurus degil.
  hit(saglam, 10, "status:bleed");
  // Sahipsiz vurus (kule yok) da sayilmiyor.
  room.damageEnemy(saglam, 10, 0, "ultimate", "p1");

  room.openUltimateReports[0].until = Date.now() - 1;
  room.settleUltimateReports();

  assert.deepEqual(io.results(), [{ kind: "nightmare", hits: 3, kills: 1 }]);
});

test("Sempati: baga takilan dusmanlar ve onlardan olenler sure bitince raporlanir", () => {
  const room = createRoom("onur");
  const io = wire(room);
  const client = { sessionId: "p1", send() {} };
  for (let index = 0; index < 2; index += 1) {
    const spot = findBuildableSpot(room, "onur-3");
    room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "onur-3" });
  }
  const towers = [...room.towers.values()];
  ready(room);

  room.useUltimate(io.owner, {});

  const bagli = putEnemy(room, 0, { hp: 10_000_000 });
  bagli.x = (towers[0].x + towers[1].x) / 2;
  bagli.y = (towers[0].y + towers[1].y) / 2;
  const uzak = putEnemy(room, 0, { hp: 20 });
  uzak.x = bagli.x + 600;
  uzak.y = bagli.y + 600;
  room.resetAuraSlows();
  room.updateSympathy();
  room.updateSympathy();

  // Bagli dusman olur (kimin vurdugu fark etmez), bagsiz dusmanin olumu sayilmaz.
  room.damageEnemy(bagli, 20_000_000, 0, "ultimate", "p1");
  room.damageEnemy(uzak, 100, 0, "ultimate", "p1");
  assert.equal(io.results().length, 0);

  room.openUltimateReports[0].until = Date.now() - 1;
  room.settleUltimateReports();

  assert.deepEqual(io.results(), [{ kind: "sympathy", hits: 1, kills: 1 }]);
});

test("oyuncu odadan ciktiysa karne sessizce birakilir", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  const [tower] = atakanWithDrones(room, 1);
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x: tower.x + 20, y: tower.y, hp: 30, maxHp: 30, shield: 0, maxShield: 0, statusResistances: {} });
  ready(room);
  room.useUltimate(io.owner, { mode: "attack" });

  room.state.players.delete("p1");
  flyDrones(room);

  assert.equal(io.results().length, 0);
  assert.equal(io.casts().length, 0);
  assert.equal(room.openUltimateReports.length, 0, "karne acik kalmamali");
});

test("istemci iki mesaji da dinliyor; karne yalnizca atana gidiyor", () => {
  const server = readFileSync(new URL("../apps/server/src/rooms/MatchRoom.ts", import.meta.url), "utf8");
  const scene = readFileSync(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8");
  assert.ok(!server.includes("broadcast(\"ultimate:result\""), "karne herkese yayilmamali");
  assert.ok(server.includes("send(\"ultimate:result\""));
  assert.ok(server.includes("broadcast(\"ultimate:cast\""));
  assert.ok(scene.includes("onMessage(\"ultimate:result\""), "istemci karneyi dinlemiyor");
  assert.ok(scene.includes("onMessage(\"ultimate:cast\""), "istemci takim cipini dinlemiyor");
});
