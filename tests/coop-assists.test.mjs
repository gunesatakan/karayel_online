/**
 * Co-op asisti ve rol unvanlari.
 *
 *   1. Asist gercek odada: A isaretler, B oldurur -> A'ya asist; ayni oyuncu
 *      isaretleyip oldururse asist yok; soloda hic yok. Zeynep komutu kuleyle
 *      gelen oldurmede komut asisti. Asist oldurme olayinda kucuk `a` alani.
 *   2. Bildirim yalnizca iki tarafa ve cift basina 5 sn'de bir.
 *   3. Unvan secimi: soloda yok, esitlik sabit kuralla, ondeki oyuncu tek unvan,
 *      unvan yalnizca o olcude ondekine, kucuk olcu esik altinda.
 *   4. Karne ve kosu raporu rol olgularini yalnizca co-op'ta tasiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSIST_TOAST_PAIR_GAP_MS,
  AssistToastGate,
  KILL_ASSIST_LIMIT,
  ROLE_TITLE_FLOORS,
  ROLE_TITLE_KILL_SHARE_FLOOR,
  RunLedger,
  buildWaveReportCard,
  decodeKillAssists,
  encodeKillAssists,
  getKillAssistText,
  getRoleTitleFloor,
  getRunMapKey,
  pickLocalKillAssist,
  pickRoleTitles,
  pickWaveRoleTitle,
  resolveKillAssists,
  sanitizeWaveRecord
} from "../packages/shared/dist/index.js";
import { toKillEventWire } from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

// --- saf mantik -------------------------------------------------------------

test("asist cozumu: oldurenden farkli, oyuncu basina bir, oncelikli tur, en fazla uc", () => {
  assert.deepEqual(resolveKillAssists(1, [{ slot: 0, kind: "mark" }]), [{ slot: 0, kind: "mark" }]);
  assert.deepEqual(resolveKillAssists(0, [{ slot: 0, kind: "mark" }]), [], "kendine asist yok");
  assert.deepEqual(resolveKillAssists(undefined, [{ slot: 0, kind: "mark" }]), [], "sahipsiz oldurmede asist yok");
  assert.deepEqual(resolveKillAssists(1, [{ slot: undefined, kind: "mark" }]), [], "yuvasi bilinmeyen aday atlaniyor");
  assert.deepEqual(
    resolveKillAssists(1, [{ slot: 0, kind: "slow" }, { slot: 0, kind: "mark" }, { slot: 2, kind: "command" }]),
    [{ slot: 0, kind: "mark" }, { slot: 2, kind: "command" }],
    "ayni oyuncunun isareti yavaslatmanin onunde"
  );
  const many = resolveKillAssists(3, [0, 1, 2, 4, 5].map((slot) => ({ slot, kind: "slow" })));
  assert.equal(many.length, KILL_ASSIST_LIMIT);
});

test("asist tel bicimi: yuva*4+tur, bos liste alan yazmiyor, bozuk deger atlaniyor", () => {
  assert.equal(encodeKillAssists([]), undefined);
  const assists = [{ slot: 0, kind: "mark" }, { slot: 2, kind: "command" }, { slot: 3, kind: "slow" }];
  const wire = encodeKillAssists(assists);
  assert.deepEqual(wire, [0, 9, 15]);
  assert.deepEqual(decodeKillAssists(wire), assists);
  assert.deepEqual(decodeKillAssists("x"), []);
  assert.deepEqual(decodeKillAssists([-1, 1.5, "2", 6]), [{ slot: 1, kind: "freeze" }]);
});

test("bildirim yalnizca iki tarafa: oldurene ilk asist, asist verene kendi, ucuncuye hic", () => {
  const assists = [{ slot: 0, kind: "mark" }, { slot: 2, kind: "slow" }];
  assert.deepEqual(pickLocalKillAssist(1, assists, 1), { slot: 0, kind: "mark" }, "oldurensen ilk asist");
  assert.deepEqual(pickLocalKillAssist(1, assists, 2), { slot: 2, kind: "slow" }, "asist verdiysen seninki");
  assert.equal(pickLocalKillAssist(1, assists, 3), undefined, "ucuncu oyuncu hicbir sey gormuyor");
  assert.equal(getKillAssistText("mark", "Atakan", "Zeynep"), "Atakan işaretledi → Zeynep bitirdi");
  assert.equal(getKillAssistText("command", "Zeynep", "Onur"), "Zeynep komut verdi → Onur bitirdi");
});

test("cift basina hiz siniri: ayni iki oyuncu 5 sn'de bir, sira onemsiz, baska cift bagimsiz", () => {
  const gate = new AssistToastGate();
  assert.equal(gate.allow(0, 1, 1000), true);
  assert.equal(gate.allow(1, 0, 2000), false, "ters yon ayni cift");
  assert.equal(gate.allow(0, 2, 2000), true, "baska cift bagimsiz");
  assert.equal(gate.allow(0, 1, 1000 + ASSIST_TOAST_PAIR_GAP_MS - 1), false);
  assert.equal(gate.allow(0, 1, 1000 + ASSIST_TOAST_PAIR_GAP_MS), true);
  assert.equal(gate.allow(1, 1, 99999), false, "kendisiyle cift yok");
  gate.reset();
  assert.equal(gate.allow(0, 2, 2001), true, "yeni mac sayaci sifirliyor");
});

const facts = (slot, values = {}) => ({ slot, kills: 0, assists: 0, commandAssists: 0, repaired: 0, towerDamage: 0, ...values });

test("unvan: soloda yok; ondeki oyuncu tek unvan alir, digerleri siradakine", () => {
  assert.equal(pickRoleTitles([facts(0, { kills: 30, towerDamage: 9000 })]).size, 0, "solo");
  const titles = pickRoleTitles([
    facts(0, { kills: 30, towerDamage: 9000 }),
    // Asist esigi: en az 3 ve takim oldurmelerinin %15'i (42 -> 6.3).
    facts(1, { kills: 10, towerDamage: 1000, assists: 8 }),
    facts(2, { kills: 2, repaired: 300 })
  ]);
  assert.equal(titles.get(0), "tower", "en guclu payi (hasar %90) aliyor, Kasap'i birakiyor");
  assert.equal(titles.get(1), "assist");
  assert.equal(titles.get(2), "repair");
  assert.equal([...titles.values()].includes("kills"), false, "Kasap ondeki oyuncuya ikinci unvan olarak gitmiyor");
});

test("unvan: yalnizca o olcude en cok yapan alir; tek kisinin kucuk olcusu unvan kapmiyor", () => {
  // Inceleme ornegi: P0 her seyde onde ve biraz da onarmis; P1 hicbir seyde onde degil.
  const exclusive = pickRoleTitles([
    facts(0, { kills: 30, repaired: 20, towerDamage: 8000 }),
    facts(1, { kills: 10, towerDamage: 2000 })
  ]);
  assert.equal(exclusive.get(0), "tower", "20 can onarim esik alti; en belirgin onde oldugu olcu");
  assert.equal(exclusive.get(1), undefined, "10 oldurme 30'un yaninda Kasap degil");

  // Tek asist Nisanci Ortagi yapmiyor; esik takim oldurmeleriyle buyuyor.
  const single = pickRoleTitles([facts(0, { kills: 30, towerDamage: 8000 }), facts(1, { kills: 10, assists: 1 })]);
  assert.equal(single.get(1), undefined, "tek asist");
  assert.equal(getRoleTitleFloor("assist", 0), ROLE_TITLE_FLOORS.assist);
  assert.equal(getRoleTitleFloor("assist", 100), 100 * ROLE_TITLE_KILL_SHARE_FLOOR);
  assert.equal(getRoleTitleFloor("command", 100), 100 * ROLE_TITLE_KILL_SHARE_FLOOR);
  assert.equal(getRoleTitleFloor("repair", 1000), ROLE_TITLE_FLOORS.repair, "onarim esigi oldurmeyle buyumuyor");
  const underShare = pickRoleTitles([facts(0, { kills: 90 }), facts(1, { kills: 10, assists: 14 })]);
  assert.equal(underShare.get(1), undefined, "100 oldurmede 14 asist %15'in altinda");
  const overShare = pickRoleTitles([facts(0, { kills: 90 }), facts(1, { kills: 10, assists: 15 })]);
  assert.equal(overShare.get(1), "assist");
  assert.equal(overShare.get(0), "kills");

  // Tek basina yapilan ama esigi gecen olcu yine ondekine: komut asisti P1'in.
  const command = pickRoleTitles([facts(0, { kills: 20, towerDamage: 5000 }), facts(1, { kills: 4, commandAssists: 6 })]);
  assert.equal(command.get(1), "command");
  assert.equal(command.get(0), "tower");

  // Ondeki baska unvan aldiysa olcu siradakine dusmuyor: Kasap bos kaliyor.
  const leader = pickRoleTitles([
    facts(0, { kills: 30, towerDamage: 9000 }),
    facts(1, { kills: 20, towerDamage: 1000 }),
    facts(2, { kills: 5, repaired: 400 })
  ]);
  assert.equal(leader.get(0), "tower");
  assert.equal(leader.get(1), undefined, "oldurmede ikinci, Kasap degil");
  assert.equal(leader.get(2), "repair");
});

test("unvan: esitlik sabit kuralla; esit paylasan unvani birlikte alir, girdi sirasi onemsiz", () => {
  const a = [facts(0, { kills: 5 }), facts(1, { kills: 5 })];
  assert.deepEqual([...pickRoleTitles(a).entries()].sort(), [[0, "kills"], [1, "kills"]]);
  // Esit payda destek unvani once: tek komut asisti ile tek oldurme ayni pay.
  const b = [facts(0, { commandAssists: 3, kills: 3 }), facts(1, { kills: 0 })];
  assert.equal(pickRoleTitles(b).get(0), "command");
  const forward = pickRoleTitles([facts(2, { kills: 4, towerDamage: 50 }), facts(0, { kills: 4, towerDamage: 50 }), facts(1, { assists: 1 })]);
  const reverse = pickRoleTitles([facts(1, { assists: 1 }), facts(0, { kills: 4, towerDamage: 50 }), facts(2, { kills: 4, towerDamage: 50 })]);
  assert.deepEqual([...forward.entries()].sort(), [...reverse.entries()].sort());
  // Esik: birkac canlik onarim Tamirci yapmiyor; hicbir olcusu olmayan unvansiz.
  const c = pickRoleTitles([facts(0, { kills: 3 }), facts(1, { repaired: ROLE_TITLE_FLOORS.repair - 1 })]);
  assert.equal(c.get(1), undefined);
});

test("defter: asist, komut asisti, onarim ve kule hasari yalnizca co-op karnesinde ve raporunda", () => {
  const tower = { id: "t", level: 3, definition: { id: "d", name: "Takipçi" } };
  const coop = new RunLedger();
  coop.recordKill(1);
  coop.recordAssist(0, "mark");
  coop.recordAssist(0, "slow");
  coop.recordAssist(0, "freeze");
  // Unvan esigi: asist ve komut asisti en az 3.
  coop.recordAssist(2, "command");
  coop.recordAssist(2, "command");
  coop.recordAssist(2, "command");
  coop.recordRepair(2, 123.4);
  coop.recordTowerDamage(tower, 1, 500.6);
  const record = coop.closeWave(1, { slots: [0, 1, 2] });
  assert.deepEqual(record.n, [3, 0, 0]);
  assert.deepEqual(record.z, [0, 0, 3]);
  assert.deepEqual(record.r, [0, 0, 123]);
  assert.deepEqual(record.t, [0, 501, 0]);
  assert.equal(pickWaveRoleTitle(record, 0), "assist");
  assert.equal(pickWaveRoleTitle(record, 2), "command");
  const summary = coop.summarize({
    id: "r", result: "victory", stage: 1, wave: 1, creative: false, mapKey: getRunMapKey(1),
    players: [0, 1, 2].map((slot) => ({ slot, name: `P${slot}`, characterId: "warrior", cards: [] }))
  });
  assert.equal(summary.players[0].assists, 3);
  assert.equal(summary.players[2].commandAssists, 3);
  assert.equal(summary.players[2].repaired, 123);
  assert.equal(summary.players[1].towerDamage, 501);
  assert.equal(summary.players[1].assists, undefined, "sifir yazilmiyor");
  assert.deepEqual(summary.waves[0].n, [3, 0, 0]);
  assert.notEqual(summary.waves[0].n, record.n, "rapor defterin dizisini paylasmiyor");

  const solo = new RunLedger();
  solo.recordRepair(0, 300);
  solo.recordTowerDamage(tower, 0, 900);
  const soloRecord = solo.closeWave(1, { slots: [0] });
  assert.deepEqual(Object.keys(soloRecord).sort(), ["c", "k", "l", "p", "w"], "solo karne eskisiyle ayni");
  const soloSummary = solo.summarize({
    id: "s", result: "victory", stage: 1, wave: 1, creative: false, mapKey: getRunMapKey(1),
    players: [{ slot: 0, name: "Solo", characterId: "warrior", cards: [] }]
  });
  assert.equal(soloSummary.players[0].repaired, undefined);
  assert.equal(soloSummary.players[0].towerDamage, undefined);
});

test("karne: co-op'ta kendi unvanin cip olarak; soloda ve unvansizken yok; telden gelen olgu korunuyor", () => {
  const record = sanitizeWaveRecord({ w: 4, l: 0, k: 12, p: [9, 3], c: 2, n: [0, 6], t: [800, "x"] });
  assert.deepEqual(record.n, [0, 6]);
  assert.deepEqual(record.t, [800, 0]);
  const card = (localSlot, coop = true) => buildWaveReportCard({ wave: 4, record, localSlot, coop, creative: false });
  const own = card(1).chips.find((chip) => chip.kind === "title");
  assert.equal(own.text, "Unvanın: Nişancı Ortağı");
  assert.equal(own.title, "assist");
  assert.equal(card(0).chips.find((chip) => chip.kind === "title").text, "Unvanın: Kule Ustası");
  assert.equal(card(0, false).chips.some((chip) => chip.kind === "title"), false, "solo");
  const empty = buildWaveReportCard({ wave: 4, record: { w: 4, l: 0, k: 0, p: [0, 0], c: 1 }, localSlot: 0, coop: true, creative: false });
  assert.equal(empty.chips.some((chip) => chip.kind === "title"), false, "olgusu olmayan unvansiz");
});

test("karne: co-op'ta unvan MVP cipinin yerini aliyor; serit 375 px'te ucuncu satira tasmiyor", () => {
  const record = sanitizeWaveRecord({ w: 4, l: 0, k: 12, p: [9, 3], c: 2, n: [0, 6], t: [800, 0] });
  const defense = { wave: 4, rows: [{ ownerId: "p", towerId: "t", name: "Takipçi", definitionId: "warrior-1", level: 3, damage: 1240, kills: 4, markAssistDamage: 0, repaired: 0 }] };
  const card = (localSlot, coop = true, input = {}) => buildWaveReportCard({ wave: 4, record, localSlot, coop, creative: false, defense, gold: 95, ...input });
  const kinds = (built) => built.chips.map((chip) => chip.kind);
  assert.deepEqual(kinds(card(1)), ["clean", "kills", "gold", "title"], "unvan varken MVP yok");
  assert.equal(card(1).chips.length, 4, "unvandan once de dort cip vardi");
  assert.equal(card(1).label.includes("MVP"), false);
  assert.ok(kinds(card(0, false)).includes("mvp"), "soloda MVP yerinde");
  const untitled = buildWaveReportCard({ wave: 4, record: sanitizeWaveRecord({ w: 4, l: 0, k: 12, p: [9, 3], c: 2 }), localSlot: 1, coop: true, creative: false, defense, gold: 95 });
  assert.deepEqual(kinds(untitled), ["clean", "kills", "gold", "mvp"], "unvansiz co-op oyuncusu MVP'sini goruyor");
});

// --- gercek oda -------------------------------------------------------------

/** Iki oyunculu oda: p1 Atakan (yuva 0), p2 Zeynep (yuva 1); iki Takipci kulesi. */
function teamRoom({ solo = false } = {}) {
  const room = createRoom("warrior");
  const p1 = room.state.players.get("p1");
  Object.assign(p1, { slot: 0, connected: true });
  if (!solo) {
    room.state.players.set("p2", { ...p1, id: "p2", name: "Zeynep", characterId: "zeynep", slot: 1, skillCooldowns: [], runModifiers: [], ownedCardIds: [], hiredWorkers: [] });
  }
  room.broadcast = () => {};
  const client = { sessionId: "p1", send() {} };
  const towers = [];
  for (let index = 0; index < 2; index += 1) {
    room.placeTower(client, { ...findBuildableSpot(room, "warrior-1"), definitionId: "warrior-1" });
    towers.push([...room.towers.values()].at(-1));
  }
  room.towerCriticalRandom = () => 1;
  return { room, tracker: towers[0], attacker: towers[1] };
}

function markedEnemy(room, tracker) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { hp: 5, maxHp: 5, shield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {} });
  room.applyTrackingStacks(enemy, Date.now() + 5000, 1);
  enemy.trackingSourceTowerId = tracker.id;
  return enemy;
}

const lastKill = (room) => [...room.killEvents.values()].at(-1);

test("oda: A isaretler, B oldurur -> A'ya asist; ayni oyuncu oldururse asist yok", () => {
  const { room, tracker, attacker } = teamRoom();
  attacker.ownerId = "p2";
  room.damageEnemy(markedEnemy(room, tracker), 100, 0, "warrior-4", "p2", "true", 0, 1, attacker.id);
  const event = lastKill(room);
  assert.equal(event.ownerId, "p2");
  assert.deepEqual(decodeKillAssists(event.a), [{ slot: 0, kind: "mark" }]);
  assert.deepEqual(toKillEventWire(event).a, event.a, "asist telde gidiyor");

  attacker.ownerId = "p1";
  room.damageEnemy(markedEnemy(room, tracker), 100, 0, "warrior-4", "p1", "true", 0, 1, attacker.id);
  const own = lastKill(room);
  assert.equal(own.ownerId, "p1");
  assert.equal(own.a, undefined, "kendi isaretin asist degil");
  assert.equal("a" in toKillEventWire(own), false, "asistsiz olayda alan yok");

  const record = room.runLedger.closeWave(1, { slots: [0, 1] });
  assert.deepEqual(record.n, [1, 0], "asist karnede A'nin yuvasinda");
});

test("oda: Zeynep'in acik hiz komutu takim arkadasinin kule oldurmesinde komut asisti", () => {
  const { room, attacker } = teamRoom();
  room.applyZeynepCommand("haste", "small", false, 0, Date.now(), "p2");
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { hp: 5, maxHp: 5, shield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {} });
  room.damageEnemy(enemy, 100, 0, "warrior-4", "p1", "true", 0, 1, attacker.id);
  assert.deepEqual(decodeKillAssists(lastKill(room).a), [{ slot: 1, kind: "command" }]);
  const summary = room.buildRunSummary("victory");
  assert.equal(summary.players.find((player) => player.slot === 1).commandAssists, 1);
});

test("oda: soloda asist hesaplanmiyor", () => {
  const { room, tracker, attacker } = teamRoom({ solo: true });
  tracker.ownerId = "ghost";
  room.damageEnemy(markedEnemy(room, tracker), 100, 0, "warrior-4", "p1", "true", 0, 1, attacker.id);
  assert.equal(lastKill(room).a, undefined);
});

/** Iskelet dusman: tek vurusta olen, direnci yok. */
function plainEnemy(room, hp = 5) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { hp, maxHp: hp, shield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {} });
  return enemy;
}

test("oda: B yavaslatir, A'nin yavaslatan kulesi oldurur -> B'ye yavaslatma asisti (oldurucu vurus kaynagi ezmiyor)", () => {
  const { room, attacker } = teamRoom();
  const enemy = plainEnemy(room, 50);
  // B'nin yavaslatmasi: kulesiz, oldurmeyen vurus.
  room.damageEnemy(enemy, 1, 1000, "warrior-3", "p2", "true", 0, 1, "");
  assert.equal(enemy.statusEffects.slow.sourceOwnerId, "p2");
  // A'nin oldurucu vurusu da yavaslatiyor: kaynak eskiden A'ya yaziliyor ve
  // B'nin asisti dusuyordu.
  room.damageEnemy(enemy, 100, 850, "warrior-1", "p1", "true", 0, 1, attacker.id);
  const event = lastKill(room);
  assert.equal(event.ownerId, "p1");
  assert.deepEqual(decodeKillAssists(event.a), [{ slot: 1, kind: "slow" }]);
});

test("oda: warrior-5 uc yiginin birini tuketir, takim arkadasi oldurur -> isaret asisti kaliyor", () => {
  const { room, tracker, attacker } = teamRoom();
  tracker.ownerId = "p2";
  room.placeTower({ sessionId: "p1", send() {} }, { ...findBuildableSpot(room, "warrior-5"), definitionId: "warrior-5" });
  const laser = [...room.towers.values()].at(-1);
  assert.equal(laser.definition.id, "warrior-5");
  const enemy = plainEnemy(room, 50);
  room.applyTrackingStacks(enemy, Date.now() + 5000, 3);
  enemy.trackingSourceTowerId = tracker.id;
  room.consumeConfiguredMarks(laser, enemy, "hit");
  assert.equal(enemy.trackingStackUntil[0], 0, "en erken biten yuva -- 0 -- tuketildi");
  assert.equal(room.getTrackingStackCount(enemy, Date.now()), 2);
  room.damageEnemy(enemy, 100, 0, "warrior-4", "p1", "true", 0, 1, attacker.id);
  assert.deepEqual(decodeKillAssists(lastKill(room).a), [{ slot: 1, kind: "mark" }]);
});

test("oda: yeniden baglanan oyuncunun dusmandaki yavaslatmasi ve soguma yavaslatmasi asist olarak kaliyor", () => {
  const { room, attacker } = teamRoom();
  const slowed = plainEnemy(room, 50);
  room.damageEnemy(slowed, 1, 1000, "warrior-3", "p2", "true", 0, 1, "");
  const cooled = plainEnemy(room, 50);
  cooled.coolantSlowUntil = Date.now() + 5000;
  cooled.coolantSlowOwnerId = "p2";

  room.transferPlayerSession("p2", "p2-yeni", room.state.players.get("p2"));
  assert.equal(slowed.statusEffects.slow.sourceOwnerId, "p2-yeni");
  assert.equal(cooled.coolantSlowOwnerId, "p2-yeni");

  room.damageEnemy(slowed, 100, 0, "warrior-4", "p1", "true", 0, 1, attacker.id);
  assert.deepEqual(decodeKillAssists(lastKill(room).a), [{ slot: 1, kind: "slow" }]);
  room.damageEnemy(cooled, 100, 0, "warrior-4", "p1", "true", 0, 1, attacker.id);
  assert.deepEqual(decodeKillAssists(lastKill(room).a), [{ slot: 1, kind: "slow" }]);
});
