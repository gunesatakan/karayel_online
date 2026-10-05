/**
 * Sonucu degistiren kararlarin taninmasi.
 *
 * 1. Karar payi: Atakan'in yalnizligi ve Zeynep'in dizilimi bir kulenin
 *    **nereye** kuruldugunu oduller. Sunucu her vurusta, bonus o an aciksa,
 *    vurusun bonusa dusen payini tahmin ediyor:
 *    `dealt × (1 − 1/DPS carpani)`. Toplam sahibine giden dalga ozetiyle
 *    (`defense:summary`) dalgada bir kez gidiyor; karnede ultiden sonra, kil
 *    payindan once tek satir. Kosu toplami raporun "en iyi an" adaylarinda.
 * 2. Kombo damgalari: yalnizca sonucu degistiren uc etkilesim -- isaretli
 *    oldurmeden asiri yukleme, supurmenin oldurdugu (en az iki) ve Onur'un sans
 *    penceresi. Tur + sahip basina 4 sn'de bir, ekranda en fazla iki.
 *
 * Kural sayilari degismedi; testler yalnizca olcuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ATAKAN_ISOLATION_MULTIPLIER,
  COMBO_STAMP_GAP_MS,
  COMBO_STAMP_KINDS,
  COMBO_STAMP_MAX_LIVE,
  ComboStampGate,
  ComboStampThrottle,
  FEEDBACK_KIND_RULES,
  ONUR_LUCKY_WINDOW_MS,
  ONUR_MISFORTUNE_MAX,
  RunLedger,
  SYNERGY_SHARE_RUN_FLOOR,
  SYNERGY_SHARE_WAVE_FLOOR,
  ZEYNEP_FORMATION_PAIR_DAMAGE_MULTIPLIER,
  ZEYNEP_FORMATION_PAIR_FIRE_INTERVAL_MULTIPLIER,
  ZEYNEP_FORMATION_TRIO_DAMAGE_MULTIPLIER,
  ZEYNEP_FORMATION_TRIO_FIRE_INTERVAL_MULTIPLIER,
  buildWaveReportCard,
  createDefenseRow,
  estimateSynergyShare,
  getAtakanIsolationShare,
  getComboStampText,
  getZeynepFormationShare,
  pickRunMoment,
  pickWaveReportHighlight,
  sanitizeComboStampMessage,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ""} ${actual} != ${expected}`);

// --- saf hesap -------------------------------------------------------------

test("pay formulu: dealt × (1 − 1/DPS carpani); carpan yoksa sifir", () => {
  close(estimateSynergyShare(1000, 2), 500);
  assert.equal(estimateSynergyShare(1000, 1), 0);
  assert.equal(estimateSynergyShare(1000, 0.8), 0, "carpan 1'in altindaysa pay yok, eksi de yok");
  assert.equal(estimateSynergyShare(0, 3), 0);
  assert.equal(estimateSynergyShare(Number.NaN, 3), 0);
});

test("yalnizlik: yalniz kulede hasar ve atis hizi birlikte, degilse sifir", () => {
  const dps = ATAKAN_ISOLATION_MULTIPLIER * ATAKAN_ISOLATION_MULTIPLIER;
  close(getAtakanIsolationShare(1000, true), 1000 * (1 - 1 / dps), "yalniz");
  close(getAtakanIsolationShare(1000, true), 555.5555555555, "2,25 kat DPS");
  assert.equal(getAtakanIsolationShare(1000, false), 0, "yalniz degil: pay yok");
});

test("dizilim: sunucunun carpanlari ve seviye orani, dizilim yoksa sifir", () => {
  const trio = ZEYNEP_FORMATION_TRIO_DAMAGE_MULTIPLIER / ZEYNEP_FORMATION_TRIO_FIRE_INTERVAL_MULTIPLIER;
  close(getZeynepFormationShare(1000, { zeynepFormationSize: 3, zeynepFormationLevel: 10 }), 1000 * (1 - 1 / trio), "uclu");
  const pair = ZEYNEP_FORMATION_PAIR_DAMAGE_MULTIPLIER / ZEYNEP_FORMATION_PAIR_FIRE_INTERVAL_MULTIPLIER;
  close(getZeynepFormationShare(1000, { zeynepFormationSize: 2, zeynepFormationLevel: 10 }), 1000 * (1 - 1 / pair), "ikili");
  // Seviye 5: carpanlar yari yolda.
  const halfDamage = 1 + (ZEYNEP_FORMATION_TRIO_DAMAGE_MULTIPLIER - 1) * 0.5;
  const halfInterval = 1 - (1 - ZEYNEP_FORMATION_TRIO_FIRE_INTERVAL_MULTIPLIER) * 0.5;
  close(getZeynepFormationShare(1000, { zeynepFormationSize: 3, zeynepFormationLevel: 5 }), 1000 * (1 - halfInterval / halfDamage), "seviye 5");
  assert.equal(getZeynepFormationShare(1000, { zeynepFormationSize: 0, zeynepFormationLevel: 0 }), 0);
  assert.equal(getZeynepFormationShare(1000, {}), 0);
});

// --- karne ve rapor ---------------------------------------------------------

function satir(name, damage) {
  return { ...createDefenseRow(`kule-${name}`, "p1", name), damage };
}

test("karne: pay satiri ultiden sonra, kil payindan once; tabanin altinda yok", () => {
  const record = { w: 9, l: 3, h: 40, k: 30, p: [30], c: 0 };
  const health = { health: 20, maxHealth: 100 };
  const defense = { wave: 9, rows: [satir("İzolasyon Kulesi", 4000)], isolationShare: 2108 };

  const share = pickWaveReportHighlight({ record, defense, health });
  assert.deepEqual(share, { kind: "synergyShare", share: "isolation", text: "Yalnızlık payı: ~2.110 hasar" });

  // Ulti derecesi yine ustte.
  const ulti = pickWaveReportHighlight({ record, defense, health, ultimate: { kind: "column", hits: 6, kills: 4, best: 6 } });
  assert.equal(ulti.kind, "ultimate");

  // Mutlak taban: kucuk pay kil payina yer birakiyor.
  const small = { ...defense, rows: [satir("İzolasyon Kulesi", 300)], isolationShare: SYNERGY_SHARE_WAVE_FLOOR - 20 };
  assert.equal(pickWaveReportHighlight({ record, defense: small, health }).kind, "nearMiss");
  // Oransal taban: kule hasarinin %15'inden az pay satir degil.
  const diluted = { ...defense, rows: [satir("İzolasyon Kulesi", 20000)], isolationShare: 900 };
  assert.equal(pickWaveReportHighlight({ record, defense: diluted, health }).kind, "nearMiss");

  // Dizilim daha buyukse o.
  const formation = { wave: 9, rows: [satir("Hiza", 3000)], formationShare: 1337, isolationShare: 400 };
  assert.deepEqual(pickWaveReportHighlight({ record, defense: formation }), { kind: "synergyShare", share: "formation", text: "Dizilim payı: ~1.340 hasar" });

  // Kartta tek satir, etiketin sonunda; baska dalganin ozeti karismiyor.
  const card = buildWaveReportCard({ wave: 9, record, localSlot: 0, coop: false, creative: false, defense, health });
  assert.equal(card.highlight.kind, "synergyShare");
  assert.ok(card.label.endsWith(". Yalnızlık payı: ~2.110 hasar"));
  const stale = buildWaveReportCard({ wave: 10, record: { ...record, w: 10 }, localSlot: 0, coop: false, creative: false, defense, health });
  assert.notEqual(stale.highlight?.kind, "synergyShare");
});

test("rapor: kosu toplami en iyi an adayi; yalnizca kendi payin, tabanin ustunde", () => {
  const players = [
    { slot: 0, name: "Ali", characterId: "warrior", kills: 10, damage: 10, cards: [], isolationShare: 12_404 },
    { slot: 1, name: "Ece", characterId: "zeynep", kills: 10, damage: 10, cards: [], formationShare: 99_999 }
  ];
  assert.deepEqual(pickRunMoment({ players }, { localSlot: 0 }), { kind: "synergy", own: true, text: "Yalnızlık payı · ~12.400 hasar" });
  assert.equal(pickRunMoment({ players: [{ ...players[0], isolationShare: SYNERGY_SHARE_RUN_FLOOR - 1 }] }, { localSlot: 0 }), undefined);
  // Takim arkadasinin payi senin basligin olmuyor.
  assert.equal(pickRunMoment({ players: [{ ...players[0], isolationShare: undefined }, players[1]] }, { localSlot: 0 }), undefined);
  // Seri kademesi daha parlak bir an.
  assert.equal(pickRunMoment({ players: [{ ...players[0], bestStreakTier: "granted" }] }, { localSlot: 0 }).kind, "streak");

  const ledger = new RunLedger();
  ledger.recordSynergyShare(0, "isolation", 100.4);
  ledger.recordSynergyShare(0, "isolation", 100.4);
  ledger.recordSynergyShare(1, "formation", 0);
  const summary = ledger.summarize({ id: "x", result: "defeat", stage: 1, wave: 3, creative: false, mapKey: "arena@1", players: [
    { slot: 0, name: "Ali", characterId: "warrior", cards: [] },
    { slot: 1, name: "Ece", characterId: "zeynep", cards: [] }
  ] });
  assert.equal(summary.players[0].isolationShare, 201);
  assert.equal("formationShare" in summary.players[0], false);
  assert.equal("formationShare" in summary.players[1], false, "sifir pay telde yok");
});

// --- gercek oda: pay --------------------------------------------------------

function dummy(room) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { type: "grunt", hp: 1_000_000, maxHp: 1_000_000, shield: 0, maxShield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
  return enemy;
}

function place(room, client, definitionId) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer yok`);
  room.placeTower(client, { ...spot, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower?.definition.id, definitionId);
  return tower;
}

test("sunucu: yalniz Atakan kulesinin payi ozete yaziliyor; yalnizlik kapaliyken sifir", () => {
  const room = createRoom("warrior");
  const client = { sessionId: "p1", send() {} };
  room.clients = [client];
  room.broadcast = () => {};
  const tower = place(room, client, "warrior-1");
  assert.equal(room.getAtakanPassiveMultiplier(tower), ATAKAN_ISOLATION_MULTIPLIER, "tek kule yalniz");
  const enemy = dummy(room);

  const before = tower.damageDealt;
  room.damageEnemyFromTower(tower, enemy, 200, 0);
  const isolatedDealt = tower.damageDealt - before;
  assert.ok(isolatedDealt > 0);

  // Yalnizlik kapandi (testin kancasi): sonraki vurusun payi yok.
  room.isTowerIsolated = () => false;
  room.damageEnemyFromTower(tower, enemy, 200, 0);

  room.finishDefenseSummary();
  const summary = room.lastDefenseSummary.get("p1");
  close(summary.isolationShare, Math.round(getAtakanIsolationShare(isolatedDealt, true)), "yalnizken vurus");
  assert.equal("formationShare" in summary, false, "sifir alan telde yok");
  assert.equal(room.runLedger.summarize({ id: "x", result: "defeat", stage: 1, wave: 1, creative: false, mapKey: "a", players: [{ slot: 0, name: "T", characterId: "warrior", cards: [] }] }).players[0].isolationShare,
    Math.round(getAtakanIsolationShare(isolatedDealt, true)));
});

test("sunucu: dizilimdeki Zeynep kulesinin payi; dizilim yokken ve kurulumda sifir", () => {
  const room = createRoom("zeynep");
  const client = { sessionId: "p1", send() {} };
  room.clients = [client];
  room.broadcast = () => {};
  const tower = place(room, client, towerCatalog.zeynep[0].id);
  const enemy = dummy(room);

  // Dizilim yok: pay yok.
  room.damageEnemyFromTower(tower, enemy, 100, 0);
  // Kurulumda hasar sayilmiyor.
  tower.zeynepFormationSize = 3;
  tower.zeynepFormationLevel = 10;
  room.setupPhase = true;
  room.damageEnemyFromTower(tower, enemy, 100, 0);
  room.setupPhase = false;

  const before = tower.damageDealt;
  room.damageEnemyFromTower(tower, enemy, 100, 0);
  const dealt = tower.damageDealt - before;
  room.finishDefenseSummary();
  const summary = room.lastDefenseSummary.get("p1");
  close(summary.formationShare, Math.round(getZeynepFormationShare(dealt, { zeynepFormationSize: 3, zeynepFormationLevel: 10 })), "yalnizca dizilimli vurus");
  assert.equal("isolationShare" in summary, false);

  // Sonraki dalga sifirdan: eski dalganin payi yeni ozete tasinmiyor.
  room.wave += 1;
  tower.zeynepFormationSize = 0;
  room.damageEnemyFromTower(tower, enemy, 100, 0);
  room.finishDefenseSummary();
  assert.equal(room.lastDefenseSummary.get("p1").wave, room.wave);
  assert.equal("formationShare" in room.lastDefenseSummary.get("p1"), false);
});

test("sunucu -> karne: pay ozetle kart seciminden once gidiyor, tick'te ayrica mesaj yok", () => {
  const server = readSource("apps/server/src/rooms/MatchRoom.ts");
  assert.equal((server.match(/isolationShare/g) ?? []).length > 0, true);
  // Pay yalnizca ozetin icinde: kendi mesaj tipi yok.
  assert.equal(/send\("synergy:share"|broadcast\("synergy:share"/.test(server), false);
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.ok(scene.includes("defense: this.latestDefenseSummary"), "karne ozetten kuruluyor");
});

// --- kombo damgalari: saf kurallar -------------------------------------------

test("damga turleri yalnizca sonucu degistiren uc etkilesim", () => {
  assert.deepEqual([...COMBO_STAMP_KINDS], ["markOverdrive", "sweepKills", "luckyWindow"]);
  assert.equal(getComboStampText({ kind: "markOverdrive" }), "İŞARET → OVERDRIVE");
  assert.equal(getComboStampText({ kind: "sweepKills", kills: 3 }), "Tarama: 3 öldü");
  assert.equal(getComboStampText({ kind: "sweepKills", kills: 1 }), undefined, "tek oldurme damga degil");
  assert.equal(getComboStampText({ kind: "luckyWindow" }), `ŞANS PENCERESİ ${ONUR_LUCKY_WINDOW_MS / 1000} sn`);
  assert.equal(getComboStampText({ kind: "deepFreeze" }), undefined, "olcumde fark yaratmayan kombo damgasiz");
  assert.equal(sanitizeComboStampMessage({ kind: "sweepKills", ownerId: "p1", towerId: "t", x: 1, y: 2, kills: 1 }), undefined);
  assert.deepEqual(sanitizeComboStampMessage({ kind: "markOverdrive", ownerId: "p1", towerId: "t", x: 1, y: 2 }), { kind: "markOverdrive", ownerId: "p1", towerId: "t", x: 1, y: 2 });
  assert.equal(sanitizeComboStampMessage({ kind: "markOverdrive", ownerId: "p1", towerId: "t", x: "1", y: 2 }), undefined);
});

test("kapi: tur + sahip basina 4 sn, ekranda en fazla iki", () => {
  const throttle = new ComboStampThrottle();
  assert.equal(throttle.admit("markOverdrive", "p1", 0), true);
  assert.equal(throttle.admit("markOverdrive", "p1", COMBO_STAMP_GAP_MS - 1), false);
  assert.equal(throttle.admit("sweepKills", "p1", 10), true, "baska tur ayri sayiliyor");
  assert.equal(throttle.admit("markOverdrive", "p2", 10), true, "baska sahip ayri sayiliyor");
  assert.equal(throttle.admit("markOverdrive", "p1", COMBO_STAMP_GAP_MS), true);

  const gate = new ComboStampGate();
  assert.equal(COMBO_STAMP_MAX_LIVE, 2);
  assert.equal(gate.admit("markOverdrive", "p1", 0), true);
  gate.commit(0, 1600);
  assert.equal(gate.admit("luckyWindow", "p1", 10), true);
  gate.commit(10, 1600);
  assert.equal(gate.admit("markOverdrive", "p2", 20), false, "ucuncu damga dusuyor");
  assert.equal(gate.liveCount(20), 2);
  assert.equal(gate.admit("markOverdrive", "p2", 1700), true, "biri sonunce yer acildi");

  // Yonetmende: P1 etiket, sessiz, takim arkadasinda soluk ama gorunur.
  const rule = FEEDBACK_KIND_RULES.combo;
  assert.equal(rule.channel, "label");
  assert.equal(rule.ownPriority, 1);
  assert.equal(rule.soundMs, 0);
  assert.equal(rule.teammateVisual, true);
});

// --- kombo damgalari: gercek oda ----------------------------------------------

function withClock(run) {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    return run((ms) => { now += ms; });
  } finally {
    Date.now = realNow;
  }
}

function teamRoom(characterId) {
  const room = createRoom(characterId);
  const p1 = room.state.players.get("p1");
  Object.assign(p1, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0 });
  room.state.players.set("p2", { ...p1, id: "p2", name: "Ece", characterId: "zeynep", slot: 1, skillCooldowns: [], runModifiers: [], ownedCardIds: [], hiredWorkers: [] });
  const sent = new Map([["p1", []], ["p2", []]]);
  room.clients = ["p1", "p2"].map((sessionId) => ({ sessionId, send(type, payload) { sent.get(sessionId).push({ type, payload }); } }));
  // Damga yayin degil, istemci basina send: yayin kaydi bos kalmali.
  const broadcasts = [];
  room.broadcast = (type, payload) => broadcasts.push({ type, payload });
  const of = (sessionId, kind) => sent.get(sessionId).filter((entry) => entry.type === "combo:stamp" && (!kind || entry.payload.kind === kind)).map((entry) => entry.payload);
  return { room, client: room.clients[0], of, broadcasts };
}

function laserScene(spots) {
  const scene = teamRoom("warrior");
  const tower = place(scene.room, scene.client, "warrior-5");
  // Asiri yukleme 5. seviyede aciliyor.
  tower.level = 5;
  tower.ammo = tower.maxAmmo;
  tower.energy = tower.maxEnergy;
  const enemies = spots.map(({ degrees, distance, hp }) => {
    const enemy = dummy(scene.room);
    const radians = (degrees * Math.PI) / 180;
    Object.assign(enemy, { x: tower.x + distance * Math.cos(radians), y: tower.y + distance * Math.sin(radians), hp, maxHp: hp });
    return enemy;
  });
  scene.room.enemySpatialGrid.rebuild(scene.room.enemies.values());
  return { ...scene, tower, enemies };
}

function runTicks(room, advance, durationMs, tickMs = 50) {
  for (let elapsed = 0; elapsed < durationMs; elapsed += tickMs) {
    advance(tickMs);
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.resetAuraSlows();
    room.updateTowers(tickMs);
    room.updateBeams(tickMs);
  }
}

function triggerMarkedKill(room, tower, target) {
  target.hp = 1;
  target.trackingStackUntil = [Date.now() + 5000];
  room.fireDebugLaser(tower, target);
}

test("isaretli oldurme asiri yuklemeyi acinca herkese tek damga; supurme bitince oldurme sayisi", () => {
  withClock((advance) => {
    const { room, tower, enemies, of } = laserScene([
      { degrees: 0, distance: 60, hp: 1 },
      { degrees: 0, distance: 90, hp: 1 },
      { degrees: 2, distance: 120, hp: 1 },
      { degrees: 0, distance: 150, hp: 1 }
    ]);
    triggerMarkedKill(room, tower, enemies[0]);
    assert.ok(tower.debugOverdriveUntil > Date.now(), "asiri yukleme acilmadi");
    const start = { kind: "markOverdrive", ownerId: "p1", towerId: tower.id, x: Math.round(tower.x), y: Math.round(tower.y) };
    assert.deepEqual(of("p1"), [start], "kendi damgan");
    assert.deepEqual(of("p2"), [start], "takim arkadasi da goruyor (soluk)");

    runTicks(room, advance, 2600);
    const swept = enemies.slice(1).filter((enemy) => !room.enemies.has(enemy.id)).length;
    assert.ok(swept >= 2, `supurme yeterince oldurmedi: ${swept}`);
    assert.deepEqual(of("p1", "sweepKills"), [{ kind: "sweepKills", ownerId: "p1", towerId: tower.id, x: Math.round(tower.x), y: Math.round(tower.y), kills: swept }]);
    assert.equal(of("p2", "sweepKills").length, 1);
    assert.equal(room.debugSweepRuns.size, 0, "supurme kaydi kapandi");
  });
});

test("supurme tek oldurdu ya da hic: sonuc damgasi yok; ust uste tetik 4 sn icinde ikinci damga acmiyor", () => {
  withClock((advance) => {
    const { room, tower, enemies, of } = laserScene([
      { degrees: 0, distance: 60, hp: 1 },
      { degrees: 0, distance: 90, hp: 1 },
      { degrees: 0, distance: 120, hp: 1_000_000 }
    ]);
    triggerMarkedKill(room, tower, enemies[0]);
    runTicks(room, advance, 2600);
    assert.equal(room.enemies.has(enemies[1].id), false, "supurme tek dusmani oldurdu");
    assert.equal(of("p1", "sweepKills").length, 0, "tek oldurme damga degil");

    // Ayni kule 4 sn dolmadan yeniden isaretli oldurdu: kural calisiyor, damga yok.
    const retrigger = () => {
      const again = dummy(room);
      Object.assign(again, { x: tower.x + 60, y: tower.y });
      Object.assign(tower, { overheatMs: 0, debugOverdriveUntil: 0, debugOverdriveHeatSegments: [], triggerCooldowns: {} });
      triggerMarkedKill(room, tower, again);
      assert.ok(tower.debugOverdriveUntil > Date.now(), "asiri yukleme yeniden acilmadi");
    };
    retrigger();
    assert.equal(of("p1", "markOverdrive").length, 1, "4 sn icinde ikinci damga yok");
    // Aralik dolunca yeniden.
    advance(4000);
    retrigger();
    assert.equal(of("p1", "markOverdrive").length, 2);
  });
});

test("sans penceresi acilinca yalnizca sahibine tek damga; pencere acikken yenisi yok", () => {
  withClock(() => {
    const { room, of } = teamRoom("onur");
    room.state.players.get("p1").characterId = "onur";
    const definition = towerCatalog.onur.find((entry) => entry.damage > 0);
    const tower = place(room, room.clients[0], definition.id);
    room.towerDamageRandom = () => 0; // en kotu zar: sayac dolsun
    tower.misfortune = ONUR_MISFORTUNE_MAX - 1e-9;
    room.prepareOnurGamblerShot(tower);
    assert.ok(tower.luckyWindowUntil > Date.now(), "pencere acilmadi");
    assert.equal(tower.luckyWindowUntil - Date.now(), ONUR_LUCKY_WINDOW_MS, "kural degismedi");
    assert.deepEqual(of("p1"), [{ kind: "luckyWindow", ownerId: "p1", towerId: tower.id, x: Math.round(tower.x), y: Math.round(tower.y) }]);
    assert.equal(of("p2").length, 0, "takim arkadasina gitmiyor");

    room.towerDamageRandom = () => 0.9; // pencere icinde iyi zar: pencere suruyor
    room.prepareOnurGamblerShot(tower);
    assert.equal(of("p1").length, 1);
  });
});

test("istemci: mesaj dinleniyor, yonetmenden geciyor, alt cubugun ustunde ve kapidan geciyor", () => {
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.ok(scene.includes(`onMessage("combo:stamp"`));
  assert.ok(scene.includes(`emit("combo"`));
  assert.ok(scene.includes("this.comboStamps.admit("));
  assert.ok(scene.includes("bounds: this.getWorldLabelBoundsAboveBottomBar()"));
  assert.ok(/kind === "luckyWindow" && !own/.test(scene), "sans penceresi yalnizca sahibinde");
  const labels = readSource("apps/web/src/vfx/world-labels.ts");
  assert.ok(labels.includes("spec.bounds.bottom"), "etiket alt sinira uyuyor");
  const css = readSource("apps/web/src/style.css");
  assert.ok(css.includes(".wave-report__highlight--synergyShare"));
});
