/**
 * Kosu izi: sizinti sayaci, temiz dalga serisi ve mac sonu raporu.
 *
 * Dalga karnesi, kosu raporu, rekor ve yildizlar ayni veriden beslenecek; bu
 * testler o verinin sozlerini kilitliyor:
 *
 *   1. Sizinti nexus'a ulasan dusmandir, can kaybi degil. Kalkanin can
 *      degismeden yuttugu dusman da sizinti; Gotik Kabus'un tuttugu degil.
 *   2. Temiz dalga serisi sizintili dalgada sifirlaniyor, en iyi seri kaliyor.
 *   3. Rapor kosunun tamamini tasiyor: dalga seridi, oyuncu basina oldurme ve
 *      hasar, satilan kule dahil MVP, deste, en yuksek seri, ilk onuncu
 *      seviye. Zaferde de yenilgide de; yenilgi dalgasi isaretli.
 *   4. Yaratici bayragi raporda da duruyor ve kayit kapisindan gecemiyor.
 *   5. Yeniden baglanan oyuncu son karneyi ve bitmis macin raporunu aliyor.
 *
 * Gercek MatchRoom'un yollari suruluyor: kacis dali (`updateEnemies`), dalga
 * kapanisi (`updateSpawning`), oldurme (`damageEnemy`), yukseltme ve satis.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FINAL_WAVE,
  RUN_SUMMARY_VERSION,
  RUN_WAVE_HISTORY_LIMIT,
  RunLedger,
  canRecordProgress,
  getKillStreakTierRank,
  getRunMapKey,
  isCleanWave,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

/** Mesajlari toplayan oda; tek oyuncu yuva 0'da. */
function oda(characterId = "onur") {
  const room = createRoom(characterId);
  const yayinlar = [];
  room.broadcast = (type, payload) => yayinlar.push({ type, payload });
  const player = room.state.players.get("p1");
  Object.assign(player, {
    slot: 0,
    connected: true,
    shopOffers: [],
    shopRerolls: 0,
    nexusShieldCharges: 0
  });
  return { room, yayinlar, player };
}

/** Istemci yerine gecen kayitci. */
function istemci(sessionId = "p1") {
  const sent = [];
  return { sessionId, sent, send(type, payload) { sent.push({ type, payload }); } };
}

/** Odanin kendi kapanis yolu: dusman bitti, 2 sn'lik mola sahte saatle geciyor. */
function dalgayiKapat(room) {
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

/** Kurulumu odanin kendi kuraliyla bitirir (herkes hazir). */
function savasaBasla(room) {
  room.pendingCardChoices.clear();
  for (const [id, player] of room.state.players) if (player.connected) room.setupReadyPlayerIds.add(id);
  room.tryFinishSetupPhase();
  assert.equal(room.setupPhase, false, "kurulum bitmedi");
}

/** Tek vurusta olen, zirhsiz dusman. */
function kirilganDusman(room) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { type: "grunt", hp: 5, maxHp: 5, shield: 0, maxShield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
  return enemy;
}

/** Saglam dusman: kule hasari olcmek icin olmemeli. */
function saglamDusman(room) {
  const enemy = kirilganDusman(room);
  Object.assign(enemy, { hp: 1_000_000, maxHp: 1_000_000 });
  return enemy;
}

/** Bir dusmani kacis dalindan nexus'a sokar. */
function sizdir(room, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { type: "grunt", movementKind: "ground", ...overrides });
  // Son satirin altinda: rota cikisa vardi sayiyor.
  enemy.y = room.getArenaBottom() + room.getMapCellRadius() + 1;
  room.updateEnemies(0.016);
  return enemy;
}

const karneler = (yayinlar) => yayinlar.filter((yayin) => yayin.type === "wave:report").map((yayin) => yayin.payload);

test("defter: temiz seri sizintili dalgada sifirlaniyor, en iyi seri ve toplamlar kaliyor", () => {
  const ledger = new RunLedger();
  const seri = [];
  for (const [wave, leaks] of [[1, 0], [2, 0], [3, 0], [4, 2], [5, 0], [6, 0]]) {
    for (let index = 0; index < leaks; index += 1) ledger.recordLeak({ air: false, absorbed: false, hpLost: 8 });
    seri.push(ledger.closeWave(wave, { slots: [0] }).c);
  }
  assert.deepEqual(seri, [1, 2, 3, 0, 1, 2]);
  const summary = ledger.summarize({ id: "x", result: "defeat", stage: 1, wave: 6, creative: false, mapKey: getRunMapKey(1), players: [] });
  assert.equal(summary.bestCleanStreak, 3, "en iyi seri sifirlanmadan kaliyor");
  assert.equal(summary.cleanStreak, 2);
  assert.equal(summary.cleanWaves, 5, "temiz dalga toplami ust uste olmak zorunda degil");
  assert.equal(summary.leaks, 2);
  assert.equal(summary.waves[3].h, 16);
  assert.equal(isCleanWave(summary.waves[3]), false);
  assert.equal(isCleanWave(summary.waves[4]), true);

  // Olunen dalga sizintisiz kapansa da temiz degil: rapor olum dalgasini
  // "temiz" diye yazmamali.
  const olum = ledger.closeWave(7, { died: true });
  assert.equal(olum.c, 0);
  assert.equal(olum.d, 1);
  assert.equal(isCleanWave(olum), false);
});

test("defter: karne sifir ayrintiyi yazmiyor, hava duzeni ve yuva dizisi dogru", () => {
  const ledger = new RunLedger();
  const kara = ledger.closeWave(3, { slots: [0, 2] });
  // Telde `undefined` anahtar da yer tutuyor (msgpack): hic yazilmamali.
  assert.deepEqual(Object.keys(kara).sort(), ["c", "k", "l", "p", "w"]);
  assert.deepEqual(kara.p, [0, 0, 0], "hic oldurmeyen oyuncu da 0 olarak gorunuyor");

  ledger.recordKill(2);
  ledger.recordKill(2);
  ledger.recordKill(undefined);
  ledger.recordLeak({ air: true, absorbed: false, hpLost: 8 });
  ledger.recordLeak({ air: true, absorbed: true, hpLost: 0 });
  const hava = ledger.closeWave(5, { slots: [0] });
  assert.deepEqual(hava, { w: 5, l: 2, a: 2, s: 1, h: 8, k: 3, p: [0, 0, 2], m: "all", c: 0 });
  assert.equal(ledger.closeWave(15, { slots: [0] }).m, "mixed");
  // Bozuk yuva seyrek dizi acmiyor.
  ledger.recordKill(-1);
  ledger.recordKill(99);
  assert.deepEqual(ledger.closeWave(16, { slots: [0] }).p, [0]);
});

test("defter: yaratici geri sarma raporu sisirmiyor, seri kademesi sirasi kurallardan", () => {
  const ledger = new RunLedger();
  for (let index = 0; index < RUN_WAVE_HISTORY_LIMIT + 7; index += 1) ledger.closeWave(1 + (index % FINAL_WAVE));
  assert.equal(ledger.waves.length, RUN_WAVE_HISTORY_LIMIT);
  const summary = ledger.summarize({ id: "x", result: "defeat", stage: 1, wave: 1, creative: true, mapKey: "arena@1", players: [] });
  assert.equal(summary.cleanWaves, RUN_WAVE_HISTORY_LIMIT + 7, "toplam, dusen dalgalardan etkilenmiyor");

  assert.equal(getKillStreakTierRank(undefined), 0);
  assert.ok(getKillStreakTierRank("granted") < getKillStreakTierRank("unstoppable"));
  assert.ok(getKillStreakTierRank("unstoppable") < getKillStreakTierRank("rampage"));
  assert.ok(getKillStreakTierRank("rampage") < getKillStreakTierRank("legendary"));
});

test("sunucu: nexus'a ulasan her dusman sizinti; kalkan tutsa da, can degismese de", () => {
  const { room, yayinlar, player } = oda();
  savasaBasla(room);

  sizdir(room);
  assert.equal(room.teamHealth, 92, "kara sizintisi can goturuyor");
  sizdir(room, { movementKind: "air" });
  assert.equal(room.teamHealth, 84);

  // Kalkan sizintiyi can degismeden yutuyor; can puanina bakan bir not bunu
  // temiz sayardi.
  player.nexusShieldCharges = 1;
  sizdir(room);
  assert.equal(room.teamHealth, 84, "kalkan cani korudu");
  assert.equal(player.nexusShieldCharges, 0);

  // Gotik Kabus dusmani cikista tutuyor: kacmadi, sizinti degil.
  room.melisGothicNightmareUntil = Date.now() + 60_000;
  const tutulan = sizdir(room);
  assert.ok(room.enemies.has(tutulan.id), "kabus dusmani tuttu");
  room.melisGothicNightmareUntil = 0;

  dalgayiKapat(room);
  const [karne] = karneler(yayinlar);
  assert.ok(karne, "dalga karnesi yollanmadi");
  assert.deepEqual(
    { w: karne.w, l: karne.l, a: karne.a, s: karne.s, h: karne.h, c: karne.c },
    { w: 1, l: 3, a: 1, s: 1, h: 16, c: 0 },
    "uc sizinti: biri ucan, biri kalkanda; can kaybi yalnizca iki sizintidan"
  );
  assert.equal(karneler(yayinlar).length, 1, "karne dalga basina bir kez");
});

test("sunucu: temiz seri dalga kapanisinda ilerliyor ve sizintili dalgada sifirlaniyor", () => {
  const { room, yayinlar } = oda();
  savasaBasla(room);
  dalgayiKapat(room); // 1: temiz
  savasaBasla(room);
  dalgayiKapat(room); // 2: temiz
  savasaBasla(room);
  sizdir(room);
  dalgayiKapat(room); // 3: sizintili
  savasaBasla(room);
  dalgayiKapat(room); // 4: temiz

  assert.deepEqual(karneler(yayinlar).map((karne) => [karne.w, karne.l, karne.c]), [[1, 0, 1], [2, 0, 2], [3, 1, 0], [4, 0, 1]]);

  room.finishMatch("defeat");
  const run = yayinlar.find((yayin) => yayin.type === "match:defeat").payload.run;
  assert.equal(run.bestCleanStreak, 2);
  assert.equal(run.cleanStreak, 0, "yenilgi dalgasi temiz sayilmiyor");
  assert.equal(run.cleanWaves, 3);
});

test("sunucu: zafer raporu kosunun tamamini tasiyor (MVP satilan kule dahil)", () => {
  const { room, yayinlar, player } = oda("onur");
  const client = istemci();
  player.name = "Atakan";
  player.ownedCardIds.push("kart-a", "kart-b");
  player.experience = 1e12;
  player.gold = 1e12;
  savasaBasla(room);

  // Oyuncunun yetenek oldurmeleri: 5 oldurme 2 sn icinde, ilk seri kademesi.
  for (let index = 0; index < 5; index += 1) {
    room.damageEnemy(kirilganDusman(room), 50, 0, "skill", "p1", "true");
  }

  // Bir kule hasar verip satiliyor: MVP butun kosunun toplami, kule gitse de.
  const definition = towerCatalog.onur[0];
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot, "kule icin kare yok");
  room.placeTower(client, { ...spot, definitionId: definition.id });
  const tower = [...room.towers.values()].at(-1);
  const hedef = saglamDusman(room);
  for (let index = 0; index < 4; index += 1) room.damageEnemyFromTower(tower, hedef, 40, 0);
  const kuleHasari = tower.damageDealt;
  assert.ok(kuleHasari > 0, "kule hasar vermedi");
  room.sellTower(client, { towerId: tower.id });
  assert.equal(room.towers.has(tower.id), false);
  room.enemies.delete(hedef.id);

  // Ikinci kule onuncu seviyeye cikiyor: kosunun ilk L10 ani.
  room.placeTower(client, { ...spot, definitionId: definition.id });
  const ikinci = [...room.towers.values()].at(-1);
  for (let level = ikinci.level; level < 10; level += 1) room.upgradeTower(client, { towerId: ikinci.id });
  assert.equal(ikinci.level, 10, "kule onuncu seviyeye cikmadi");

  dalgayiKapat(room); // 1
  savasaBasla(room);
  room.wave = FINAL_WAVE;
  dalgayiKapat(room); // son dalga: zafer

  const mesaj = yayinlar.find((yayin) => yayin.type === "match:victory");
  assert.ok(mesaj, "zafer yayinlanmadi");
  const run = mesaj.payload.run;
  assert.equal(run.version, RUN_SUMMARY_VERSION);
  assert.equal(typeof run.id, "string");
  assert.ok(run.id.length > 0);
  assert.equal(run.result, "victory");
  assert.equal(run.wave, FINAL_WAVE);
  assert.equal(run.finalWave, FINAL_WAVE);
  assert.equal(run.stage, mesaj.payload.stage);
  assert.equal(run.playerCount, 1);
  assert.equal(run.mapKey, getRunMapKey(room.mapScale));
  assert.equal("creative" in run, false, "normal kosuda yaratici anahtari yok");
  assert.equal(canRecordProgress(run), true);
  assert.deepEqual(run.waves.map((karne) => karne.w), [1, FINAL_WAVE]);
  assert.equal(run.waves.at(-1).m, "mixed", "20. dalga karisik hava");
  assert.equal(run.waves.some((karne) => karne.d), false, "zaferde olum dalgasi yok");
  assert.equal(run.kills, room.kills);
  assert.equal(run.kills, 5);
  assert.equal(run.leaks, 0);
  assert.equal(run.cleanWaves, 2);
  assert.equal(run.bestCleanStreak, 2);

  assert.equal(run.players.length, 1);
  const [satir] = run.players;
  assert.equal(satir.slot, 0);
  assert.equal(satir.name, "Atakan");
  assert.equal(satir.characterId, "onur");
  assert.equal(satir.kills, 5);
  assert.equal(satir.damage, Math.round(25 + kuleHasari), "yetenek ve kule hasari oyuncunun");
  assert.deepEqual(satir.cards, ["kart-a", "kart-b"], "deste secim sirasiyla");
  assert.equal(satir.bestStreakTier, "granted");
  assert.equal(satir.topTower.towerId, tower.id);

  assert.deepEqual(run.mvp, {
    towerId: tower.id,
    definitionId: definition.id,
    name: definition.name,
    slot: 0,
    damage: Math.round(kuleHasari),
    level: 1
  });
  assert.deepEqual(run.bestStreak, { tier: "granted", slot: 0, wave: 1 });
  assert.deepEqual(run.firstLevel10, { wave: 1, slot: 0, towerId: ikinci.id, definitionId: definition.id, name: definition.name });

  // Rapor sonuc mesajinin icinde bir kez; dalga karnesi son dalgada da gitti.
  assert.equal(yayinlar.filter((yayin) => yayin.type === "match:victory").length, 1);
  assert.equal(karneler(yayinlar).at(-1).w, FINAL_WAVE);
});

test("sunucu: yenilgi raporu olunen dalgayi isaretliyor", () => {
  const { room, yayinlar } = oda();
  savasaBasla(room);
  dalgayiKapat(room); // 1: temiz
  savasaBasla(room);
  room.damageEnemy(kirilganDusman(room), 50, 0, "skill", "p1", "true");
  room.teamHealth = 8;
  sizdir(room);

  assert.equal(room.matchResult, "defeat");
  const tipler = yayinlar.map((yayin) => yayin.type).filter((type) => type === "wave:report" || type.startsWith("match:"));
  assert.deepEqual(tipler, ["wave:report", "wave:report", "match:defeat"], "olum dalgasinin karnesi sonuctan once");
  const run = yayinlar.find((yayin) => yayin.type === "match:defeat").payload.run;
  assert.equal(run.result, "defeat");
  assert.equal(run.wave, 2);
  assert.deepEqual(run.waves.at(-1), { w: 2, l: 1, h: 8, k: 1, p: [1], c: 0, d: 1 });
  assert.equal(run.waves.filter((karne) => karne.d).length, 1);
  assert.equal(run.cleanStreak, 0);
  assert.equal(run.bestCleanStreak, 1);
  assert.equal(run.leaks, 1);
  assert.equal(run.players[0].kills, 1);
  assert.equal(run.mvp, undefined, "kule hasari yoksa MVP yok");
});

test("sunucu: yaratici bayragi raporda da duruyor, kayit kapisindan gecemiyor", () => {
  const { room, yayinlar } = oda();
  room.creativeMode = true;
  room.stage = 2;
  savasaBasla(room);
  room.finishMatch("defeat");

  const payload = yayinlar.find((yayin) => yayin.type === "match:defeat").payload;
  assert.equal(payload.creative, true);
  assert.equal(payload.run.creative, true);
  assert.equal(payload.run.stage, 2);
  assert.equal(canRecordProgress(payload), false);
  assert.equal(canRecordProgress(payload.run), false);
});

test("sunucu: co-op karnesi oyuncu basina oldurmeyi yuvayla yaziyor", () => {
  const { room, yayinlar, player } = oda("onur");
  room.state.players.set("p2", {
    ...player,
    name: "Zeynep",
    characterId: "zeynep",
    slot: 1,
    ownedCardIds: ["kart-z"],
    runModifiers: [],
    skillCooldowns: [],
    hiredWorkers: [],
    ownedShopItemIds: [],
    inventoryItemIds: [],
    shopOffers: []
  });
  savasaBasla(room);
  room.damageEnemy(kirilganDusman(room), 50, 0, "skill", "p1", "true");
  room.damageEnemy(kirilganDusman(room), 50, 0, "skill", "p1", "true");
  room.damageEnemy(kirilganDusman(room), 50, 0, "skill", "p2", "true");
  // Sahipsiz olum (ornegin bir durum etkisi): takimin, kimsenin degil.
  room.damageEnemy(kirilganDusman(room), 50, 0, "status:burn", "", "true");
  dalgayiKapat(room);
  savasaBasla(room);
  room.damageEnemy(kirilganDusman(room), 50, 0, "skill", "p1", "true");
  dalgayiKapat(room);

  assert.deepEqual(karneler(yayinlar).map((karne) => [karne.k, karne.p]), [[4, [2, 1]], [1, [1, 0]]]);
  room.finishMatch("victory");
  const run = yayinlar.find((yayin) => yayin.type === "match:victory").payload.run;
  assert.equal(run.playerCount, 2, "co-op kosusu solo kaydina karismasin diye oyuncu sayisi raporda");
  assert.deepEqual(run.players.map((satir) => [satir.slot, satir.name, satir.characterId, satir.kills, satir.cards]), [
    [0, "Test", "onur", 3, []],
    [1, "Zeynep", "zeynep", 1, ["kart-z"]]
  ]);
  assert.equal(run.kills, 5);
});

test("sunucu: yeniden baglanan oyuncu son karneyi ve bitmis macin raporunu aliyor", () => {
  const { room, yayinlar } = oda();
  savasaBasla(room);
  sizdir(room);
  dalgayiKapat(room);

  const ortada = istemci();
  room.sendRunState(ortada);
  const karne = ortada.sent.find((mesaj) => mesaj.type === "wave:report");
  assert.deepEqual(karne?.payload, karneler(yayinlar).at(-1), "son karne yeniden gidiyor");
  assert.equal(ortada.sent.some((mesaj) => mesaj.type.startsWith("match:")), false, "mac bitmeden rapor yok");

  savasaBasla(room);
  room.finishMatch("victory");
  const yayinlanan = yayinlar.find((yayin) => yayin.type === "match:victory").payload;

  // Gercek yeniden baglanma yolu: rapor ayni kimlikle, kart seciminden once.
  const donen = istemci();
  room.sendMatchResumeState(donen);
  const sonuc = donen.sent.find((mesaj) => mesaj.type === "match:victory");
  assert.ok(sonuc, "bitmis macin raporu yeniden baglanmada gitmedi");
  assert.equal(sonuc.payload.run.id, yayinlanan.run.id, "istemci ayni kosuyu iki kez kaydetmesin");
  assert.deepEqual(sonuc.payload, yayinlanan);
  assert.ok(donen.sent.some((mesaj) => mesaj.type === "wave:report"));
});
