/**
 * Nisanlar, Operator Ustaligi ve kozmetik.
 *
 * Bu testler kuralin sozlerini kilitliyor:
 *
 *   1. Her nisanin kosulu hem tutunca aciliyor hem tutmayinca acilmiyor;
 *      imza nisani yalnizca kendi operatoruyle.
 *   2. Her kosulun olgusu gercekten uretiliyor: sunucunun kendisi (harness)
 *      ya da kosu defteri o olguyu yaziyor -- ulasilabilir ve gorulebilir.
 *   3. Yaratici kosu, maci canli gormeyen istemci ve kilitli asama hicbir sey
 *      yazmiyor; rekor ve yildizla ayni kapi.
 *   4. Ustalik egrisi sabit, puan co-op'ta kuculmuyor ve oyuncu sayisiyla
 *      buyumuyor; ayni kosu iki kez sayilmiyor.
 *   5. Bozuk, eski surum ya da kurcalanmis depo hicbir seyi kirmiyor; kilitli
 *      kozmetik secilemiyor ve gosterilemiyor.
 *   6. Bildirim dalga ortasinda hicbir sey acmiyor: dalga molasina ve kosu
 *      raporuna kuyruklaniyor.
 *   7. Hepsi taninma: sunucu bunlarin hicbirini bilmiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ARCHIVIST_CARD_TARGET,
  BADGE_BOOK_VERSION,
  BADGE_CATALOG,
  BANNER_LINE_MAX_CHARS,
  BadgeNoticeQueue,
  BadgeRunWatch,
  COSMETICS_VERSION,
  FINAL_WAVE,
  FULL_HEAL_WAVE_HP,
  LOCK_CROWD_HITS,
  MASTERY_BOOK_VERSION,
  MASTERY_LEVEL_FLOORS,
  MASTERY_MAX_LEVEL,
  MASTERY_POINTS,
  METEOR_KILLS,
  RunLedger,
  SERVER_KNOWLEDGE_BADGE_BONUS,
  getServerKnowledgeTopBonus,
  STAGE_COUNT,
  TITLE_CATALOG,
  applyRunToMastery,
  awardBadges,
  buildBadgeBoardView,
  buildCosmeticsView,
  buildMasteryReportView,
  cardCatalog,
  characters,
  checkBadgeRecordable,
  countRunClearedWaves,
  countSignatureBadges,
  createDefaultCosmetics,
  createEmptyBadgeFlags,
  createEmptyCardArchive,
  createEmptyMasteryBook,
  findNewBadges,
  findNewCosmetics,
  formatBadgeNotice,
  formatBannerSecondLine,
  getBadgeNoticeMoment,
  getKillStreakBuffText,
  getMapGridSize,
  getMapOrigin,
  getMasteryLevel,
  getMasteryLevelFloor,
  getMasteryPoints,
  getMasteryProgress,
  getSignatureBadges,
  getStageDamageProfile,
  recordKey,
  resolveCosmetics,
  resolveOnurGamblerShot,
  sanitizeBadgeBook,
  sanitizeChampionDownMessage,
  sanitizeCosmetics,
  sanitizeMasteryBook,
  resolveFirstLiveWave,
  selectCosmetic,
  summarizeRunProgress,
  TOWER_HEALTH_BAR_LIFT_PX,
  getTowerCrownPoints,
  withoutBadges,
  serializeBadgeBook,
  serializeCosmetics,
  serializeMasteryBook,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// --- yardimcilar -------------------------------------------------------------

const flags = (over = {}) => ({ ...createEmptyBadgeFlags(), ...over });
/** Degerlendirmenin olgulari; varsayilan Atakan, 1. asama, karnesiz. */
const facts = (over = {}) => ({ characterId: "warrior", stage: 1, waves: [], firstLiveWave: 1, ...over, flags: flags(over.flags) });
/** Kosunun basindan beri odada olan istemcinin defteri (ilk canli dalga 1). */
function liveWatch(firstLiveWave = 1) {
  const watch = new BadgeRunWatch();
  watch.noteFirstLiveWave(firstLiveWave);
  return watch;
}
const rec = (w, l = 0, c = 0, extra = {}) => ({ w, l, k: 10, p: [10], c, ...extra });
/** Bu olgularla acilan nisanlar (bos defter). */
const opens = (input, context = {}, phase = "run") => findNewBadges(input, context, new Set(), phase);
const has = (input, id, context = {}, phase = "run") => opens(input, context, phase).includes(id);

/** Gercek kosu defterinden bir rapor: dalgalar sirayla, her biri `leaks[i]` sizintiyla. */
function ledgerRun({ leaks = Array(FINAL_WAVE).fill(0), result = "victory", stage = 1, players = [{ slot: 0, name: "Ali", characterId: "warrior", cards: [] }], id = "run-a1", setup } = {}) {
  const ledger = new RunLedger();
  setup?.(ledger);
  leaks.forEach((count, index) => {
    for (let leak = 0; leak < count; leak += 1) ledger.recordLeak({ air: false, absorbed: false, hpLost: 4 });
    const last = index === leaks.length - 1;
    ledger.closeWave(index + 1, { died: last && result === "defeat", slots: players.map((player) => player.slot) });
  });
  return ledger.summarize({ id, result, stage, wave: leaks.length, creative: false, mapKey: "arena@1", players });
}

// --- 1. kosullar: tutunca acik, tutmayinca kapali ----------------------------

test("katalog: yaklasik 24 nisan, kimlikler essiz, her kosul yazili ve Turkce", () => {
  assert.ok(BADGE_CATALOG.length >= 22 && BADGE_CATALOG.length <= 26, `nisan sayisi ${BADGE_CATALOG.length}`);
  assert.equal(new Set(BADGE_CATALOG.map((badge) => badge.id)).size, BADGE_CATALOG.length);
  for (const badge of BADGE_CATALOG) {
    assert.ok(badge.condition.length > 10, `${badge.id} kosulu bos`);
    assert.match(badge.id, /^[a-z0-9-]+$/);
  }
  // Her operatorun en az bir imza nisani var: ustalik puani herkese acik.
  for (const character of characters) {
    assert.ok(getSignatureBadges(character.id).length >= 1, `${character.id} imza nisani yok`);
  }
});

test("Hava Sahası: 10. dalga sizintisiz; sizintili ya da olunen 10. dalga acmaz", () => {
  assert.ok(has(facts({ waves: [rec(10, 0, 1)] }), "hava-sahasi", {}, "wave"));
  assert.ok(!has(facts({ waves: [rec(10, 2, 0)] }), "hava-sahasi", {}, "wave"));
  assert.ok(!has(facts({ waves: [rec(10, 0, 0, { d: 1 })] }), "hava-sahasi", {}, "wave"));
  assert.ok(!has(facts({ waves: [rec(9, 0, 9)] }), "hava-sahasi", {}, "wave"));
});

test("Kesintisiz: 10 temiz dalga ust uste; 9'da yok", () => {
  assert.ok(has(facts({ waves: [rec(12, 0, 10)] }), "kesintisiz", {}, "wave"));
  assert.ok(!has(facts({ waves: [rec(12, 0, 9)] }), "kesintisiz", {}, "wave"));
});

test("Kusursuz: 20/20 temiz zafer; 19 temiz ya da yenilgi acmaz; dalga sonunda karar verilmez", () => {
  assert.ok(has(facts({ result: "victory", cleanWaves: FINAL_WAVE }), "kusursuz"));
  assert.ok(!has(facts({ result: "victory", cleanWaves: FINAL_WAVE - 1 }), "kusursuz"));
  assert.ok(!has(facts({ result: "defeat", cleanWaves: FINAL_WAVE }), "kusursuz"));
  assert.ok(!has(facts({ result: "victory", cleanWaves: FINAL_WAVE }), "kusursuz", {}, "wave"));
});

test("Kıyım ve Efsane: kendi en iyi serin; daha dusuk kademe acmaz", () => {
  assert.ok(has(facts({ result: "defeat", player: { bestStreakTier: "rampage" } }), "kiyim"));
  assert.ok(!has(facts({ result: "defeat", player: { bestStreakTier: "rampage" } }), "efsane"));
  assert.ok(has(facts({ result: "defeat", player: { bestStreakTier: "legendary" } }), "efsane"));
  assert.ok(has(facts({ result: "defeat", player: { bestStreakTier: "legendary" } }), "kiyim"));
  assert.ok(!has(facts({ result: "defeat", player: { bestStreakTier: "unstoppable" } }), "kiyim"));
  assert.ok(!has(facts({ result: "defeat" }), "kiyim"));
});

test("Şampiyon Avcısı ve Hızlanan Av: devrilme ve bir oncekinden hizli devrilme", () => {
  assert.ok(has(facts({ flags: { championDowns: 1 } }), "sampiyon-avcisi", {}, "wave"));
  assert.ok(!has(facts(), "sampiyon-avcisi", {}, "wave"));
  assert.ok(has(facts({ flags: { championFaster: true } }), "hizlanan-av", {}, "wave"));
  assert.ok(!has(facts({ flags: { championDowns: 3 } }), "hizlanan-av", {}, "wave"));
});

test("Kademe 2 ve 3: kendi kulenin seviyesi 5 ve 10; 4 ve 9 acmaz", () => {
  assert.ok(has(facts({ flags: { ownTowerMaxLevel: 5 } }), "kademe-2", {}, "wave"));
  assert.ok(!has(facts({ flags: { ownTowerMaxLevel: 4 } }), "kademe-2", {}, "wave"));
  assert.ok(has(facts({ flags: { ownTowerMaxLevel: 10 } }), "kademe-3", {}, "wave"));
  assert.ok(!has(facts({ flags: { ownTowerMaxLevel: 9 } }), "kademe-3", {}, "wave"));
  assert.ok(has(facts({ result: "defeat", ownFirstLevel10: true }), "kademe-3"), "raporun ilk onuncu seviyesi de sayiliyor");
});

test("İlk Zafer ve Son Kale: 1. ve 5. asama zaferi; yenilgi ve baska asama acmaz", () => {
  assert.ok(has(facts({ result: "victory", stage: 1 }), "ilk-zafer"));
  assert.ok(!has(facts({ result: "defeat", stage: 1 }), "ilk-zafer"));
  assert.ok(!has(facts({ result: "victory", stage: 2 }), "ilk-zafer"));
  assert.ok(has(facts({ result: "victory", stage: STAGE_COUNT }), "son-kale"));
  assert.ok(!has(facts({ result: "victory", stage: STAGE_COUNT - 1 }), "son-kale"));
});

test("Doğru Silah: en iyi kulen asamanin zayif oldugu tipte ve zafer", () => {
  const top = (definitionId) => ({ topTower: { towerId: "t", definitionId, name: "x", slot: 0, damage: 900, level: 3 } });
  // 1. asama fiziksel zayif: Takipçi (fiziksel) tutuyor, Sunucu (elektrik) tutmuyor.
  assert.deepEqual(getStageDamageProfile(1).weakTo, ["physical"]);
  assert.ok(has(facts({ result: "victory", stage: 1, player: top("warrior-1") }), "dogru-silah"));
  assert.ok(!has(facts({ result: "victory", stage: 1, player: top("warrior-2") }), "dogru-silah"));
  assert.ok(has(facts({ result: "victory", stage: 2, player: top("warrior-2") }), "dogru-silah"));
  assert.ok(!has(facts({ result: "defeat", stage: 1, player: top("warrior-1") }), "dogru-silah"));
  assert.ok(!has(facts({ result: "victory", stage: 1 }), "dogru-silah"), "kule hasari yoksa yok");
});

test("Her Cephede: 1. asama yedi operatorle (oyuncu sayisi fark etmez); alti yetmez; ilerleme 6/7", () => {
  const records = {};
  const ids = characters.map((character) => character.id);
  for (const [index, id] of ids.entries()) {
    records[recordKey(1, id, index % 2 === 0 ? 1 : 3, "arena@1")] = { bestWave: 20, clears: 1, bestStars: 1, bestCleanWaves: 5, runs: 1 };
  }
  assert.ok(has(facts({ result: "victory" }), "her-cephede", { records }));
  const eksik = { ...records };
  delete eksik[recordKey(1, ids[6], 1, "arena@1")];
  assert.ok(!has(facts({ result: "victory" }), "her-cephede", { records: eksik }));
  const entry = buildBadgeBoardView({}, { records: eksik }).groups.flatMap((group) => group.entries).find((badge) => badge.id === "her-cephede");
  assert.equal(entry.progress.text, "6/7");
});

test("Arşivci: 50 kart; 49 yetmez; menude ilerleme", () => {
  const archive = (count) => ({ ...createEmptyCardArchive(), cards: cardCatalog.slice(0, count).map((card) => card.id) });
  assert.ok(has(facts({ result: "defeat" }), "arsivci", { archive: archive(ARCHIVIST_CARD_TARGET) }));
  assert.ok(!has(facts({ result: "defeat" }), "arsivci", { archive: archive(ARCHIVIST_CARD_TARGET - 1) }));
  const entry = buildBadgeBoardView({}, { archive: archive(20) }).groups.flatMap((group) => group.entries).find((badge) => badge.id === "arsivci");
  assert.equal(entry.progress.text, `20/${ARCHIVIST_CARD_TARGET}`);
});

test("imza nisanlari: yalnizca kendi operatoruyle, esigin altinda acilmaz", () => {
  const cases = [
    ["tam-dizilim", "zeynep", { formationTrio: true }, { formationTrio: false }],
    ["mukemmel-sutun", "zeynep", { perfectColumn: true }, {}],
    ["bilgi-bankasi", "warrior", { serverKnowledgeHalf: true }, {}],
    ["tam-evrim", "archer", { melisMaxEvolution: 3 }, { melisMaxEvolution: 2 }],
    ["sans-penceresi", "onur", { luckyWindow: true }, {}],
    ["kasa", "onur", { bestLuck: 1.9 }, { bestLuck: 1.89 }],
    ["kilit-alan", "tank", { lockMaxHits: LOCK_CROWD_HITS }, { lockMaxHits: LOCK_CROWD_HITS - 1 }],
    ["tam-dalga", "healer", { fullHeal: true }, {}],
    ["meteor-yagmuru", "mage", { meteorMaxKills: METEOR_KILLS }, { meteorMaxKills: METEOR_KILLS - 1 }]
  ];
  for (const [id, characterId, yes, no] of cases) {
    assert.ok(has(facts({ characterId, flags: yes }), id, {}, "wave"), `${id} acilmadi`);
    assert.ok(!has(facts({ characterId, flags: no }), id, {}, "wave"), `${id} esigin altinda acildi`);
    const other = characterId === "warrior" ? "zeynep" : "warrior";
    assert.ok(!has(facts({ characterId: other, flags: yes }), id, {}, "wave"), `${id} baska operatorle acildi`);
  }
  // Yalnız Kurt: kosu sonu yalnizlik payi.
  assert.ok(has(facts({ result: "defeat", player: { isolationShare: 3000 } }), "yalniz-kurt"));
  assert.ok(!has(facts({ result: "defeat", player: { isolationShare: 2999 } }), "yalniz-kurt"));
  assert.ok(!has(facts({ characterId: "zeynep", result: "defeat", player: { isolationShare: 9000 } }), "yalniz-kurt"));
});

test("zaten kazanilan nisan yeniden acilmaz; dalga sonunda yalnizca dalga nisanlari", () => {
  const input = facts({ result: "victory", stage: 1, waves: [rec(10, 0, 10)] });
  assert.ok(!findNewBadges(input, {}, { "hava-sahasi": 1 }, "run").includes("hava-sahasi"));
  const wave = findNewBadges({ ...input, result: undefined }, {}, new Set(), "wave");
  assert.ok(wave.includes("hava-sahasi"));
  assert.ok(!wave.includes("ilk-zafer"), "kosu sonu nisani dalga sonunda acildi");
});

// --- 2. ulasilabilirlik: olgu gercekten uretiliyor --------------------------

test("ulasilabilir: kosu defteri Hava Sahası, Kesintisiz, İlk Zafer, Kıyım, Yalnız Kurt ve Doğru Silah olgularini yaziyor", () => {
  const leaks = Array(FINAL_WAVE).fill(0);
  leaks[13] = 2;
  const run = ledgerRun({
    leaks,
    setup: (ledger) => {
      ledger.recordStreak(0, "rampage", 8);
      ledger.recordSynergyShare(0, "isolation", 3200);
      ledger.recordTowerDamage({ id: "t1", level: 4, definition: { id: "warrior-1", name: "Takipçi" } }, 0, 5000);
    }
  });
  const watch = liveWatch();
  const result = findNewBadges(watch.buildFacts({ characterId: "warrior", stage: 1, run, localSlot: 0 }), {}, new Set(), "run");
  for (const id of ["hava-sahasi", "kesintisiz", "ilk-zafer", "kiyim", "yalniz-kurt", "dogru-silah"]) {
    assert.ok(result.includes(id), `${id} gercek rapordan acilmadi`);
  }
  assert.ok(!result.includes("kusursuz"), "14. dalga sizdi");
});

test("ulasilabilir: Kademe 3 kosu defterinin ilk onuncu seviyesinden", () => {
  const run = ledgerRun({
    leaks: [0, 0, 1],
    result: "defeat",
    setup: (ledger) => ledger.recordTowerLevel({ id: "t1", level: 10, definition: { id: "warrior-1", name: "Takipçi" } }, 0, 2)
  });
  const input = liveWatch().buildFacts({ characterId: "warrior", stage: 1, run, localSlot: 0 });
  assert.ok(findNewBadges(input, {}, new Set(), "run").includes("kademe-3"));
  const other = liveWatch().buildFacts({ characterId: "warrior", stage: 1, run, localSlot: 1 });
  assert.ok(!findNewBadges(other, {}, new Set(), "run").includes("kademe-3"), "baskasinin onuncu seviyesi senin degil");
});

test("ulasilabilir: sunucunun uclu Zeynep dizilimi anlik goruntude, Tam Dizilim aciliyor", () => {
  const room = createRoom("zeynep");
  const client = { sessionId: "p1", send() {} };
  const gridSize = getMapGridSize(room.activeMap);
  const first = findBuildableSpot(room, "zeynep-1");
  // Uclu yalnizca ucgen (2x2'nin uc kosesi); duz cizgi dizilim degil.
  // Istemci kuleleri kuruldukca goruyor: once ikili, sonra uclu.
  const watch = liveWatch();
  const see = () => {
    room.refreshZeynepFormations();
    for (const tower of room.getSnapshot().towers) watch.noteOwnTower({ id: tower.id, level: tower.level, formationSize: tower.zeynepFormationSize });
  };
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
    room.placeTower(client, { x: first.x + dx * gridSize, y: first.y + dy * gridSize, definitionId: "zeynep-1" });
    see();
  }
  const towers = room.getSnapshot().towers;
  assert.equal(towers.length, 3, "uc kule kurulamadi");
  assert.ok(towers.every((tower) => tower.zeynepFormationSize === 3), "ucgen uclu dizilim degil");
  assert.ok(findNewBadges(watch.buildFacts({ characterId: "zeynep", stage: 1 }), {}, new Set(), "wave").includes("tam-dizilim"));
});

test("ulasilabilir: Sunucu'nun bilgi artisi canli olarak %50'yi gecince Bilgi Bankasi; miras bilgi saymiyor", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const client = { sessionId: "p1", send() {} };
  room.clients = [client];
  const build = (definitionId) => {
    const spot = findBuildableSpot(room, definitionId);
    room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
    return [...room.towers.values()].at(-1);
  };
  const server = build("warrior-2");
  const own = build("warrior-1");
  room.linkServerTower(client, { serverTowerId: server.id, targetTowerId: own.id });
  const watch = liveWatch();
  const note = () => {
    for (const wire of room.getSnapshot().towers) {
      watch.noteOwnTower({ id: wire.id, level: wire.level, // Telde tanim kimligi statik kanalda; Sunucu kimligiyle eslesiyor.
        serverKnowledgeBonus: wire.id === server.id ? getServerKnowledgeTopBonus(wire.serverKnowledge, wire.level) : undefined });
    }
  };
  note();
  // Bagli kule bir turden oldurdukce Sunucu bilgi topluyor; esik seviye 1'de 160 oldurme.
  for (let kill = 0; kill < 159; kill += 1) {
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    Object.assign(enemy, { type: "runner", hp: 1, maxHp: 1, shield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {} });
    room.damageEnemy(enemy, 1000, 0, own.definition.id, "p1", "true", 0, own.level, own.id, own.definition.hitType);
  }
  assert.equal(server.serverKnowledge.runner, 159);
  note();
  assert.equal(watch.getFlags().serverKnowledgeHalf, false, "esigin altinda acildi");
  room.spawnEnemy();
  const last = [...room.enemies.values()].at(-1);
  Object.assign(last, { type: "runner", hp: 1, maxHp: 1, shield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {} });
  room.damageEnemy(last, 1000, 0, own.definition.id, "p1", "true", 0, own.level, own.id, own.definition.hitType);
  note();
  assert.ok(getServerKnowledgeTopBonus(server.serverKnowledge, server.level) >= SERVER_KNOWLEDGE_BADGE_BONUS);
  assert.equal(watch.getFlags().serverKnowledgeHalf, true);
  assert.ok(findNewBadges(watch.buildFacts({ characterId: "warrior", stage: 1 }), {}, new Set(), "wave").includes("bilgi-bankasi"));
  // Ilk gorulusunde zaten bilgili Sunucu (miras) taban oluyor, nisan acmiyor.
  const heir = liveWatch();
  heir.noteOwnTower({ id: "miras", level: 1, serverKnowledgeBonus: 0.9 });
  heir.noteOwnTower({ id: "miras", level: 1, serverKnowledgeBonus: 0.9 });
  assert.equal(heir.getFlags().serverKnowledgeHalf, false);
});

test("ulasilabilir: sunucunun champion:down mesaji iki sampiyon nisanini besliyor", () => {
  const room = createRoom("warrior");
  const messages = [];
  room.broadcast = (type, payload) => { if (type === "champion:down") messages.push(payload); };
  const now = Date.now();
  room.announceChampionDown({ id: "c1", x: 10, y: 10, champion: { spawnedAt: now - 9000 } }, now);
  room.announceChampionDown({ id: "c2", x: 10, y: 10, champion: { spawnedAt: now - 6000 } }, now);
  assert.equal(messages.length, 2);
  const watch = liveWatch();
  for (const raw of messages) watch.noteChampionDown(sanitizeChampionDownMessage(raw));
  const fresh = findNewBadges(watch.buildFacts({ characterId: "mage", stage: 1 }), {}, new Set(), "wave");
  assert.ok(fresh.includes("sampiyon-avcisi"));
  assert.ok(fresh.includes("hizlanan-av"));
  const slow = liveWatch();
  slow.noteChampionDown({ ms: 9000 });
  slow.noteChampionDown({ ms: 9500, prevMs: 9000 });
  assert.equal(slow.getFlags().championFaster, false, "yavaslayan av hizlanan av degil");
});

/** Ultinin sonucu sunucudan: `ultimate:result` yalnizca atana. */
function castUltimate(characterId, { wave = 2, enemies = 20, health = 50, message = {}, place } = {}) {
  const room = createRoom(characterId);
  const sent = [];
  const client = { sessionId: "p1", send: (type, payload) => sent.push({ type, payload }) };
  room.clients = [client];
  room.broadcast = () => {};
  room.wave = wave;
  room.setupPhase = false;
  const random = Math.random;
  Math.random = () => 0.01; // ilk dalga karisiminin en yaygin dusmani
  try {
    for (let index = 0; index < enemies; index += 1) room.spawnEnemy();
  } finally {
    Math.random = random;
  }
  place?.(room);
  room.teamHealth = health;
  room.state.players.get("p1").ultimateCharge = 100;
  room.useUltimate(client, message);
  return sent.filter((entry) => entry.type === "ultimate:result").map((entry) => entry.payload);
}

test("ulasilabilir: Baransel meteoru, Omer kilidi ve Ulku can dalgasi sunucunun karnesinden", () => {
  const [meteor] = castUltimate("mage");
  assert.ok(meteor.kills >= METEOR_KILLS, `meteor ${meteor.kills} oldurdu`);
  const [lock] = castUltimate("tank");
  assert.ok(lock.hits >= LOCK_CROWD_HITS, `kilit ${lock.hits} vurdu`);
  const [heal] = castUltimate("healer", { health: 50 });
  assert.equal(heal.heal, FULL_HEAL_WAVE_HP);
  const [wasted] = castUltimate("healer", { health: 90 });
  assert.ok(wasted.heal < FULL_HEAL_WAVE_HP, "tavanda kirpilan can tam sayilmamali");

  for (const [characterId, result, id] of [["mage", meteor, "meteor-yagmuru"], ["tank", lock, "kilit-alan"], ["healer", heal, "tam-dalga"]]) {
    const watch = liveWatch();
    watch.noteUltimate(result);
    assert.ok(findNewBadges(watch.buildFacts({ characterId, stage: 1 }), {}, new Set(), "wave").includes(id), id);
  }
  const wastedWatch = liveWatch();
  wastedWatch.noteUltimate(wasted);
  assert.equal(wastedWatch.getFlags().fullHeal, false);
  // Sunucunun sabiti nisanin sabitiyle ayni.
  assert.match(readSource("apps/server/src/rooms/MatchRoom.ts"), new RegExp(`this\\.teamHealth \\+ ${FULL_HEAL_WAVE_HP}\\)`));
});

test("ulasilabilir: Zeynep sutunu en kalabalik sutuna inince Mükemmel Sütun", () => {
  const [result] = castUltimate("zeynep", {
    enemies: 0,
    message: { column: 6 },
    place: (room) => {
      const gridSize = getMapGridSize(room.activeMap);
      const origin = getMapOrigin(room.activeMap);
      for (let row = 1; row <= 4; row += 1) {
        room.spawnEnemy();
        const enemy = [...room.enemies.values()].at(-1);
        Object.assign(enemy, { x: origin.x + 6 * gridSize + gridSize / 2, y: origin.y + gridSize * row, hp: 1e7, maxHp: 1e7, shield: 0, maxShield: 0, movementKind: "ground", statusResistances: {} });
      }
    }
  });
  const watch = liveWatch();
  watch.noteUltimate(result);
  assert.ok(findNewBadges(watch.buildFacts({ characterId: "zeynep", stage: 1 }), {}, new Set(), "wave").includes("mukemmel-sutun"));
});

test("ulasilabilir: Melis evrimi ve Onur zari anlik goruntude; pencerede zar ×1,9'u gecebiliyor", () => {
  assert.match(readSource("apps/server/src/rooms/MatchRoom.ts"), /const MELIS_MAX_EVOLUTION_LEVEL = 3;/);
  const melis = createRoom("archer");
  const client = { sessionId: "p1", send() {} };
  const spot = findBuildableSpot(melis, "archer-1");
  melis.placeTower(client, { x: spot.x, y: spot.y, definitionId: "archer-1" });
  const archer = [...melis.towers.values()].at(-1);
  const watch = liveWatch();
  const seeArcher = () => {
    const wire = melis.getSnapshot().towers.find((tower) => tower.id === archer.id);
    watch.noteOwnTower({ id: wire.id, level: wire.level, evolution: wire.melisEvolutionLevel });
  };
  seeArcher();
  archer.melisEvolutionLevel = 3;
  seeArcher();
  assert.ok(findNewBadges(watch.buildFacts({ characterId: "archer", stage: 1 }), {}, new Set(), "wave").includes("tam-evrim"));

  // Pencere: 0,95 + r * 1,05; r >= 0,91 ×1,9'u geciyor (pencerede atislarin ~%9'u).
  const now = 1_000_000;
  const shot = resolveOnurGamblerShot({ misfortune: 0, luckyWindowUntil: now + 5000 }, 450, () => 0.95, now);
  assert.ok(shot.luckyWindowActive && shot.multiplier >= 1.9, `pencere zari ${shot.multiplier}`);
  const normal = resolveOnurGamblerShot({ misfortune: 0, luckyWindowUntil: 0 }, 450, () => 1, now);
  assert.ok(normal.multiplier < 1.9, "pencere disinda ×1,9 yok: Kasa pencereyi ogretiyor");

  const onur = createRoom("onur");
  const onurSpot = findBuildableSpot(onur, "onur-1");
  onur.placeTower(client, { x: onurSpot.x, y: onurSpot.y, definitionId: "onur-1" });
  const saw = [...onur.towers.values()].at(-1);
  const luck = liveWatch();
  const seeSaw = () => {
    const wire = onur.getSnapshot().towers.find((tower) => tower.id === saw.id);
    luck.noteOwnTower({ id: wire.id, level: wire.level, luck: wire.lastLuckMultiplier, luckyWindowRemainingMs: wire.luckyWindowRemainingMs });
  };
  seeSaw();
  saw.lastLuckMultiplier = shot.multiplier;
  saw.luckyWindowUntil = Date.now() + 5000;
  seeSaw();
  const fresh = findNewBadges(luck.buildFacts({ characterId: "onur", stage: 1 }), {}, new Set(), "wave");
  assert.ok(fresh.includes("kasa") && fresh.includes("sans-penceresi"));
});

test("Doğru Silah her asamada en az bir operatorle ulasilabilir", () => {
  for (let stage = 1; stage <= STAGE_COUNT; stage += 1) {
    const weak = getStageDamageProfile(stage).weakTo;
    const towers = Object.values(towerCatalog).flat().filter((tower) => weak.includes(tower.damageType));
    assert.ok(towers.length > 0, `${stage}. asamanin zayifligi icin kule yok`);
  }
});

// --- 3. kapi: yaratici, canli olmayan, kilitli -------------------------------

test("yaratici kosu, maci canli gormeyen istemci ve kilitli asama nisan yazamaz", () => {
  assert.equal(checkBadgeRecordable({ creative: false, stage: 1, live: true }, []), true);
  assert.equal(checkBadgeRecordable({ creative: true, stage: 1, live: true }, []), false, "yaratici");
  assert.equal(checkBadgeRecordable({ creative: false, stage: 1, live: false }, []), false, "canli degil");
  assert.equal(checkBadgeRecordable({ creative: false, stage: 3, live: true }, [1]), false, "kilitli asama");
  assert.equal(checkBadgeRecordable({ creative: false, stage: 2, live: true }, [1]), true);
  assert.equal(checkBadgeRecordable({ creative: false, stage: undefined, live: true }, []), false, "asama bilinmiyor");
});

test("yaratici kosu ustalik yazmaz: rapor ya da istemci bayragi yeter", () => {
  const run = ledgerRun();
  const book = createEmptyMasteryBook();
  assert.equal(applyRunToMastery(book, { ...run, creative: true }, { slot: 0, characterId: "warrior" }, { countStars: true }), undefined);
  assert.equal(applyRunToMastery(book, run, { slot: 0, characterId: "warrior", creative: true }, { countStars: true }), undefined);
  assert.ok(applyRunToMastery(book, run, { slot: 0, characterId: "warrior" }, { countStars: true }));
});

test("istemci kapisi: depo modulu kapiyi kullaniyor, sahne yaratici bayragini ve canli maci veriyor", () => {
  const store = readSource("apps/web/src/progress-store.ts");
  assert.match(store, /checkBadgeRecordable\(source, getClearedStages\(\)\)/);
  assert.match(store, /if \(!input\.live \|\| input\.creative \|\| run\.creative === true\) return undefined;/);
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /creative: this\.creativeMode \|\| this\.isArchiveSandbox\(\), stage, live: this\.liveSnapshotSeen/);
  assert.match(scene, /live: this\.liveSnapshotSeen,\n\s+local: \{ slot, characterId: this\.selectedCharacterId \},\n\s+watch: this\.badgeWatch/);
});

// --- 4. ustalik ----------------------------------------------------------------

test("ustalik egrisi: 10 seviye, 5*(L-1)*(L+2), sinirlar dahil", () => {
  assert.equal(MASTERY_MAX_LEVEL, 10);
  assert.deepEqual([...MASTERY_LEVEL_FLOORS], [0, 20, 50, 90, 140, 200, 270, 350, 440, 540]);
  for (let level = 1; level <= MASTERY_MAX_LEVEL; level += 1) {
    const floor = getMasteryLevelFloor(level);
    assert.equal(getMasteryLevel(floor), level, `${floor} puan ${level}. seviye olmali`);
    if (level > 1) assert.equal(getMasteryLevel(floor - 1), level - 1);
  }
  assert.equal(getMasteryLevel(1e9), MASTERY_MAX_LEVEL);
  assert.equal(getMasteryLevel(-5), 1);
  assert.equal(getMasteryLevel(Number.NaN), 1);
  assert.deepEqual(getMasteryProgress(70), { level: 3, points: 70, floor: 50, next: 90, ratio: 0.5 });
  assert.equal(getMasteryProgress(600).next, undefined);
  assert.equal(getMasteryProgress(600).ratio, 1);
});

test("ustalik puani: temizlenen dalga, ilk temizleme, ilk ★★ ve ★★★, imza nisani", () => {
  assert.equal(getMasteryPoints(undefined), 0);
  assert.equal(getMasteryPoints({ waves: 40, stars: [3, 2, 1, 0, 0] }, 1),
    40 + 3 * MASTERY_POINTS.firstClear + 2 * MASTERY_POINTS.firstTwoStars + MASTERY_POINTS.firstThreeStars + MASTERY_POINTS.signatureBadge);
  // Ilk zafer operatoru 3. seviyeye tasiyor: an olsun.
  assert.equal(getMasteryLevel(FINAL_WAVE + MASTERY_POINTS.firstClear), 3);
});

test("kosu ustaliga: olunen dalga sayilmiyor, ilk temizleme ve yildiz bir kez, ayni kosu iki kez yok", () => {
  const leaks = Array(FINAL_WAVE).fill(0);
  leaks[3] = 1; leaks[7] = 1; leaks[11] = 1; leaks[15] = 1; leaks[16] = 1; // 15 temiz: ★
  const win = ledgerRun({ leaks, id: "run-win" });
  const book = createEmptyMasteryBook();
  const first = applyRunToMastery(book, win, { slot: 0, characterId: "warrior" }, { countStars: true });
  assert.equal(first.characterId, "warrior");
  assert.deepEqual(first.gained, { waves: FINAL_WAVE, firstClear: MASTERY_POINTS.firstClear, stars: 0 });
  assert.equal(applyRunToMastery(first.book, win, { slot: 0, characterId: "warrior" }, { countStars: true }), undefined, "ayni kosu ikinci kez");

  const perfect = ledgerRun({ id: "run-perfect" });
  const second = applyRunToMastery(first.book, perfect, { slot: 0, characterId: "warrior" }, { countStars: true });
  assert.deepEqual(second.gained, { waves: FINAL_WAVE, firstClear: 0, stars: MASTERY_POINTS.firstTwoStars + MASTERY_POINTS.firstThreeStars });

  const loss = ledgerRun({ leaks: [0, 0, 0, 0, 3], result: "defeat", id: "run-loss" });
  assert.equal(countRunClearedWaves(loss), 4, "olunen 5. dalga sayilmiyor");
  const third = applyRunToMastery(second.book, loss, { slot: 0, characterId: "warrior" }, { countStars: true });
  assert.deepEqual(third.gained, { waves: 4, firstClear: 0, stars: 0 });

  // Kilitli asama: dalga sayiliyor, ilk temizleme ve yildiz yok.
  const locked = applyRunToMastery(book, ledgerRun({ id: "run-locked", stage: 3 }), { slot: 0, characterId: "warrior" }, { countStars: false });
  assert.deepEqual(locked.gained, { waves: FINAL_WAVE, firstClear: 0, stars: 0 });
  assert.deepEqual(locked.after.stars, [0, 0, 0, 0, 0]);
});

test("co-op ustaligi kucultmuyor ve oyuncu sayisiyla buyutmuyor: her oyuncu soloyla ayni puan", () => {
  const solo = ledgerRun({ id: "run-solo" });
  const team = ledgerRun({
    id: "run-team",
    players: [
      { slot: 0, name: "A", characterId: "warrior", cards: [] },
      { slot: 1, name: "B", characterId: "zeynep", cards: [] },
      { slot: 2, name: "C", characterId: "archer", cards: [] },
      { slot: 3, name: "D", characterId: "onur", cards: [] }
    ]
  });
  assert.equal(team.playerCount, 4);
  const soloGain = applyRunToMastery(createEmptyMasteryBook(), solo, { slot: 0, characterId: "warrior" }, { countStars: true });
  for (const [slot, characterId] of [[0, "warrior"], [1, "zeynep"], [2, "archer"], [3, "onur"]]) {
    const teamGain = applyRunToMastery(createEmptyMasteryBook(), team, { slot, characterId }, { countStars: true });
    assert.equal(teamGain.characterId, characterId);
    assert.deepEqual(teamGain.gained, soloGain.gained, `${characterId} co-op'ta farkli puan aldi`);
  }
  assert.equal(applyRunToMastery(createEmptyMasteryBook(), team, { slot: 5, characterId: "mage" }, { countStars: true }), undefined, "kosuda olmayan oyuncu yazmaz");
});

test("raporun ustalik satiri: 'Ustalık 2 → 3' ani, yoksa '+N'; kaynaklar yazili", () => {
  const up = buildMasteryReportView({ characterId: "zeynep", operator: "Zeynep", beforePoints: 30, afterPoints: 75, gained: { waves: 20, firstClear: 25, stars: 0 }, badgePoints: 0 });
  assert.equal(up.headline, "Ustalık 2 → 3");
  assert.equal(up.levelUp, true);
  assert.equal(up.detail, "75/90 · sonraki seviyeye 15");
  assert.equal(up.sources, "20 dalga +20 · ilk temizleme +25");
  const flat = buildMasteryReportView({ characterId: "zeynep", operator: "Zeynep", beforePoints: 55, afterPoints: 60, gained: { waves: 5, firstClear: 0, stars: 0 }, badgePoints: 0 });
  assert.equal(flat.headline, "Ustalık 3 · +5");
  const max = buildMasteryReportView({ characterId: "zeynep", operator: "Zeynep", beforePoints: 600, afterPoints: 620, gained: { waves: 20, firstClear: 0, stars: 0 }, badgePoints: 0 });
  assert.equal(max.detail, "En yüksek ustalık");
});

// --- 5. depo, surum ve kozmetik ----------------------------------------------

test("nisan defteri: bozuk, eski surum ve kurcalanmis depo temiz deftere donuyor", () => {
  for (const raw of [undefined, null, 4, "x", [], { v: 0, earned: { "hava-sahasi": 1 } }, { v: BADGE_BOOK_VERSION, earned: [] }, { v: BADGE_BOOK_VERSION }]) {
    assert.deepEqual(sanitizeBadgeBook(raw), {}, JSON.stringify(raw));
  }
  const book = sanitizeBadgeBook({ v: BADGE_BOOK_VERSION, earned: { "hava-sahasi": 5, "<script>": 1, "yeni-nisan": "x", kasa: -3 } });
  assert.deepEqual(book, { "hava-sahasi": 5, "yeni-nisan": 0, kasa: 0 }, "bicimi dogru gelecek kimlik korunuyor, bozuk zaman 0");
  assert.deepEqual(sanitizeBadgeBook(JSON.parse(JSON.stringify(serializeBadgeBook(book)))), book, "gidis-donus");
  const huge = { v: BADGE_BOOK_VERSION, earned: Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`n-${index}`, 1])) };
  assert.ok(Object.keys(sanitizeBadgeBook(huge)).length <= 128, "tavan");
  // Bilinmeyen nisan sayilmiyor ve ustalik puani vermiyor.
  assert.equal(buildBadgeBoardView(book, {}).earned, 2);
  assert.equal(countSignatureBadges({ ...book, "yeni-nisan": 1 }, "onur"), 1);
});

test("nisan yazimi: ilk an korunuyor, yinelenen ve bilinmeyen kimlik yazilmiyor", () => {
  const first = awardBadges({}, ["hava-sahasi", "hava-sahasi", "uydurma"], 100);
  assert.deepEqual(first.fresh, ["hava-sahasi"]);
  assert.deepEqual(first.book, { "hava-sahasi": 100 });
  const again = awardBadges(first.book, ["hava-sahasi"], 999);
  assert.equal(again.book, first.book, "degisiklik yoksa ayni defter");
  assert.deepEqual(again.fresh, []);
});

test("ustalik defteri: bozuk ve eski surum temiz deftere; bilinmeyen operator ve kurcalanmis sayi kistiriliyor", () => {
  for (const raw of [undefined, null, [], "x", { v: 0, operators: { warrior: { waves: 5 } } }]) {
    assert.deepEqual(sanitizeMasteryBook(raw), createEmptyMasteryBook(), JSON.stringify(raw));
  }
  const book = sanitizeMasteryBook({
    v: MASTERY_BOOK_VERSION,
    operators: {
      warrior: { waves: 1e12, stars: [9, -1, "3", 2.7] },
      ejderha: { waves: 50, stars: [3] },
      zeynep: { waves: "çok", stars: "yok" },
      archer: { waves: 12 }
    },
    runs: ["run-a", "run-a", "<bad>", 7]
  });
  assert.deepEqual(book.operators.warrior, { waves: 1_000_000, stars: [3, 0, 0, 2, 0] });
  assert.equal(book.operators.ejderha, undefined);
  assert.equal(book.operators.zeynep, undefined, "bos kayit tutulmuyor");
  assert.deepEqual(book.operators.archer, { waves: 12, stars: [0, 0, 0, 0, 0] });
  assert.deepEqual(book.runs, ["run-a"]);
  assert.deepEqual(sanitizeMasteryBook(JSON.parse(JSON.stringify(serializeMasteryBook(book)))), book);
});

test("kozmetik: bozuk depo varsayilana, kilitli secim gosterilmiyor ve secilemiyor", () => {
  for (const raw of [undefined, null, [], { v: 0, title: "b-hava-sahasi" }]) {
    assert.deepEqual(sanitizeCosmetics(raw), createDefaultCosmetics());
  }
  assert.deepEqual(sanitizeCosmetics({ v: COSMETICS_VERSION, title: "<img>", stamp: "elmas", crown: "evet" }), createDefaultCosmetics());
  const stored = sanitizeCosmetics({ v: COSMETICS_VERSION, title: "b-hava-sahasi", stamp: "altin", crown: true });
  const locked = { masteryLevels: {}, badges: {} };
  assert.deepEqual(resolveCosmetics(stored, locked), { stamp: "klasik", crown: false }, "kurcalanmis depo kilitli unvani gosteremez");
  const open = { masteryLevels: { warrior: 10 }, badges: { "hava-sahasi": 1 } };
  assert.deepEqual(resolveCosmetics(stored, open), { title: "Hava Muhafızı", titleId: "b-hava-sahasi", stamp: "altin", crown: true });
  assert.deepEqual(sanitizeCosmetics(JSON.parse(JSON.stringify(serializeCosmetics(stored)))), stored);

  const base = createDefaultCosmetics();
  assert.equal(selectCosmetic(base, locked, { title: "b-hava-sahasi" }), base, "kilitli unvan reddedildi");
  assert.equal(selectCosmetic(base, locked, { stamp: "bronz" }), base, "kilitli muhur reddedildi");
  assert.equal(selectCosmetic(base, open, { title: "b-hava-sahasi" }).title, "b-hava-sahasi");
  assert.equal(selectCosmetic({ ...base, title: "b-hava-sahasi" }, open, { title: null }).title, undefined);
  assert.equal(selectCosmetic(base, open, { crown: false }).crown, false);
});

test("kozmetik acilislari: ustalik ve nisandan; kosuyla acilan yazili; unvanlar kisa", () => {
  const before = { masteryLevels: { zeynep: 2 }, badges: {} };
  const after = { masteryLevels: { zeynep: 5 }, badges: { "sampiyon-avcisi": 1 } };
  const fresh = findNewCosmetics(before, after);
  assert.ok(fresh.includes("Unvan: ZentaX Kalfası"));
  assert.ok(fresh.includes("Unvan: Şampiyon Avcısı"));
  assert.ok(fresh.includes("Taç süsü"));
  assert.ok(fresh.includes("Bronz mühür"));
  const view = buildCosmeticsView(createDefaultCosmetics(), after);
  assert.equal(view.titles[0].unlocked, true, "acilanlar once");
  assert.ok(view.titles.some((title) => !title.unlocked && title.condition.length > 0), "kilitlinin kosulu yazili");
  for (const title of TITLE_CATALOG) assert.ok(title.label.length <= 18, `${title.label} afise sigmaz`);
});

test("afisin ikinci satiri: guc once; unvan sigarsa yaninda, sigmazsa dusuyor", () => {
  const granted = getKillStreakBuffText("granted");
  assert.equal(formatBannerSecondLine(granted, "Hava Muhafızı"), `${granted} · Hava Muhafızı`);
  const legendary = getKillStreakBuffText("legendary");
  assert.equal(formatBannerSecondLine(legendary, "Hava Muhafızı"), legendary, "seri bilgisi kesilmiyor");
  assert.equal(formatBannerSecondLine(granted, undefined), granted);
  assert.ok(formatBannerSecondLine(granted, "Hava Muhafızı").length <= BANNER_LINE_MAX_CHARS);
});

test("depo anahtarlari surumlu ve her erisim try/catch icinde", () => {
  const store = readSource("apps/web/src/progress-store.ts");
  for (const key of ["karayel_badges_v1", "karayel_mastery_v1", "karayel_cosmetics_v1"]) assert.ok(store.includes(`"${key}"`), key);
  assert.equal((store.match(/window\.localStorage/g) ?? []).length, 2, "depoya yalnizca iki yardimci dokunuyor");
  assert.match(store, /function readJson[\s\S]*?try \{\n\s+raw = window\.localStorage\.getItem\(key\);\n\s+\} catch \{\n[^\n]*\n\s+return \{ value: undefined, available: false \};/);
  // Bozuk icerik depoyu "kapali" yapmiyor: menu yanlis uyari gostermesin.
  assert.match(store, /try \{\n\s+return \{ value: JSON\.parse\(raw\), available: true \};\n\s+\} catch \{\n[^\n]*\n\s+return \{ value: undefined, available: true \};/);
  // Canli ilk dalga oturum deposunda, oda kimligiyle ve try/catch icinde.
  assert.match(store, /export function resolveRoomFirstLiveWave[\s\S]*?try \{[\s\S]*?window\.sessionStorage\.getItem\(LIVE_WAVE_STORAGE_KEY\)[\s\S]*?window\.sessionStorage\.setItem[\s\S]*?\} catch \{/);
  assert.match(store, /function writeJson[\s\S]*?try \{\n\s+window\.localStorage\.setItem\(key, JSON\.stringify\(value\)\);[\s\S]*?\} catch \{/);
});

// --- 6. bildirim: dalga ortasinda hic ----------------------------------------

test("bildirim kuyrugu: dalga ortasinda hicbir sey vermiyor, molada bir kez, raporda hepsi", () => {
  const queue = new BadgeNoticeQueue();
  queue.push(["hava-sahasi", "uydurma"]);
  assert.deepEqual(queue.take("combat"), [], "dalga ortasi");
  assert.equal(queue.size, 1, "dalga ortasi kuyrugu bosaltmiyor");
  assert.deepEqual(queue.take("waveClear"), ["hava-sahasi"]);
  assert.deepEqual(queue.take("waveClear"), [], "bir kez");
  queue.push(["kesintisiz", "hava-sahasi"]);
  assert.deepEqual(queue.take("report"), ["hava-sahasi", "kesintisiz"], "rapor kosunun tam izi, yinelemesiz");
  assert.deepEqual(queue.take("report"), ["hava-sahasi", "kesintisiz"], "rapor yeniden cizilince de ayni");
  queue.reset();
  assert.deepEqual(queue.take("report"), []);
});

test("bildirim ani: dusman sahadayken dalga ortasi; temizlenme, kurulum ve kart perdesi mola; sonuc rapor", () => {
  assert.equal(getBadgeNoticeMoment({ over: false, setupPhase: false, enemiesLeft: 4 }), "combat");
  assert.equal(getBadgeNoticeMoment({ over: false, setupPhase: false, enemiesLeft: 0 }), "waveClear");
  assert.equal(getBadgeNoticeMoment({ over: false, setupPhase: true, enemiesLeft: 0 }), "waveClear");
  assert.equal(getBadgeNoticeMoment({ over: false, setupPhase: false, enemiesLeft: 3, draftOpen: true }), "waveClear");
  assert.equal(getBadgeNoticeMoment({ over: true, setupPhase: false, enemiesLeft: 5 }), "report");
  assert.equal(formatBadgeNotice(["hava-sahasi", "kesintisiz"]), "Yeni nişan: Hava Sahası +1");
  assert.equal(formatBadgeNotice([]), undefined);
});

test("sahne: bildirim yalnizca temizleme damgasinda, kart perdesinde ve raporda; modal yok", () => {
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  const takes = [...scene.matchAll(/badgeNotices\.take\(([^)]*)\)/g)].map((match) => match[1]);
  assert.deepEqual(takes.sort(), ["\"report\"", "moment", "moment"], "kuyruk yalnizca uc yerde okunuyor");
  // Damga: temizlenme aninda (`watchWaveClear`), an sahadaki dusmandan; dalga ortasinda bos.
  assert.match(scene, /private watchWaveClear[\s\S]*?const moment = getBadgeNoticeMoment\(\{ over: false, setupPhase: Boolean\(snapshot\.setupPhase\), enemiesLeft: snapshot\.team\.enemiesLeft \}\);\n\s+const notice = formatBadgeNotice\(this\.badgeNotices\.take\(moment\)\);[\s\S]*?game:hud-wave-clear/);
  // Kart perdesi: dagitim aninda, perde acik (dalga molasi).
  assert.match(scene, /if \(deal\) \{[\s\S]*?const moment = getBadgeNoticeMoment\(\{ over: this\.matchResultShown, setupPhase: true, enemiesLeft: 0, draftOpen: true \}\);\n\s+this\.cardDraftBadgeNotice = formatBadgeNotice\(this\.badgeNotices\.take\(moment\)\);/);
  // Karne dalga sonunda geliyor; nisan orada yaziliyor, dalga ortasinda yalnizca not.
  assert.match(scene, /if \(this\.badgeWatch\.noteWave\(record\)\) this\.recordWaveBadges\(\);/);
  assert.match(scene, /this\.badgeWatch\.noteUltimate\(message\);/);
  assert.ok(!/openChoiceDialog\([^)]*nişan/i.test(scene), "nisan icin pencere acilmiyor");
  // Kart perdesinde `p` 375 px'te gizleniyor; satir `span`.
  assert.match(scene, /const notice = document\.createElement\("span"\);\n\s+notice\.className = `card-draft__badge/);
});

test("menu: Nişanlar ekrani, operator secimindeki ustalik, lobide yalnizca kendi unvanin", () => {
  const menu = readSource("apps/web/src/menu-ui.ts");
  assert.match(menu, /data-view="badges"/);
  // Baslik sozlukten (locales/areas/menu.ts); Turkcesi ayni.
  assert.match(menu, /<h1>\$\{t\("menu\.badges\.title"\)\}<\/h1>/);
  assert.match(readSource("apps/web/src/locales/areas/menu.ts"), /"menu\.badges\.title": "Nişanlar"/);
  assert.match(menu, /function renderArchive\(selectedCharacter: CharacterDefinition, progress: ProgressState\)[\s\S]*?renderMasteryMeter/);
  assert.match(menu, /player\.id === lobbySessionId && ownTitle/);
});

// --- 7. taninma, guc degil ----------------------------------------------------

test("sunucu nisan, ustalik ve kozmetigi bilmiyor; hicbiri oyuna geri donmuyor", () => {
  const server = readSource("apps/server/src/rooms/MatchRoom.ts");
  for (const word of ["Badge", "badge", "Mastery", "mastery", "Cosmetic", "cosmetic", "karayel_badges", "karayel_mastery"]) {
    assert.ok(!server.includes(word), `sunucu "${word}" biliyor`);
  }
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  // Sahne ustaligi ve nisani hicbir mesajla sunucuya yollamiyor.
  assert.ok(!/room\.send\([^)]*(badge|mastery|cosmetic|title)/i.test(scene));
});

// --- sonradan katilan, yuva devralan, yeniden baglanan ----------------------

test("canli ilk dalga: kurulumda gelen siradaki dalga, savasta ya da molada gelen bir sonraki", () => {
  assert.equal(resolveFirstLiveWave({ wave: 1, setupPhase: true }), 1, "kosunun basi");
  assert.equal(resolveFirstLiveWave({ wave: 7, setupPhase: true }), 7);
  assert.equal(resolveFirstLiveWave({ wave: 7, setupPhase: false }), 8, "7. dalganin bir kismi kacirildi");
  const watch = new BadgeRunWatch();
  watch.noteFirstLiveWave(4);
  watch.noteFirstLiveWave(12);
  assert.equal(watch.firstLiveWave, 4, "ilk deger kaliyor (yeniden baglanma)");
});

test("19. dalgada katilan: tam kosunun nisanlari, ilk temizleme ve yildiz yok; yalnizca gordugu dalgalar", () => {
  const run = ledgerRun({
    id: "run-late",
    setup: (ledger) => {
      ledger.recordStreak(0, "legendary", 3);
      ledger.recordSynergyShare(0, "isolation", 9000);
      ledger.recordTowerDamage({ id: "t1", level: 4, definition: { id: "warrior-1", name: "Takipçi" } }, 0, 5000);
      ledger.recordTowerLevel({ id: "t1", level: 10, definition: { id: "warrior-1", name: "Takipçi" } }, 0, 2);
    }
  });
  const late = liveWatch(19);
  const fresh = findNewBadges(late.buildFacts({ characterId: "warrior", stage: 1, run, localSlot: 0 }), {}, new Set(), "run");
  for (const id of ["hava-sahasi", "kesintisiz", "kusursuz", "ilk-zafer", "kiyim", "efsane", "yalniz-kurt", "dogru-silah", "kademe-3"]) {
    assert.ok(!fresh.includes(id), `${id} sonradan katilana acildi`);
  }
  // Ayni rapor kosunun basindaki oyuncuya hepsini aciyor: kural nisani degil, katilimi suzuyor.
  const full = findNewBadges(liveWatch().buildFacts({ characterId: "warrior", stage: 1, run, localSlot: 0 }), {}, new Set(), "run");
  for (const id of ["hava-sahasi", "kusursuz", "ilk-zafer", "efsane", "kademe-3"]) assert.ok(full.includes(id), id);

  const mastery = applyRunToMastery(createEmptyMasteryBook(), run, { slot: 0, characterId: "warrior" }, { countStars: true, firstLiveWave: 19 });
  assert.deepEqual(mastery.gained, { waves: 2, firstClear: 0, stars: 0 }, "yalnizca 19 ve 20");
  assert.deepEqual(mastery.after.stars, [0, 0, 0, 0, 0]);
  assert.equal(countRunClearedWaves(run, 19), 2);
  assert.equal(countRunClearedWaves({ result: "victory", wave: 20 }, 19), 2, "karnesiz eski rapor da");
});

test("sonradan katilan: Kesintisiz yalnizca canli gorulen temiz seriden; Hava Sahası gordugu 10. dalgadan", () => {
  // 5. dalgada katildi: sunucunun serisi 14 ama canli seri 10.
  assert.ok(has(facts({ firstLiveWave: 5, waves: [rec(14, 0, 14)] }), "kesintisiz", {}, "wave"));
  assert.ok(!has(facts({ firstLiveWave: 5, waves: [rec(13, 0, 13)] }), "kesintisiz", {}, "wave"), "canli seri 9");
  const watch = liveWatch(5);
  watch.noteWave(rec(4, 0, 4));
  watch.noteWave(rec(10, 0, 10));
  const input = watch.buildFacts({ characterId: "warrior", stage: 1 });
  assert.deepEqual(input.waves.map((record) => record.w), [10], "katilmadan once biten dalga yok");
  assert.ok(findNewBadges(input, {}, new Set(), "wave").includes("hava-sahasi"), "10. dalgayi bastan sona gordu");
});

test("yuva devralan: miras kuleler ve miras zar bir sey acmiyor; canli yukseltme aciyor", () => {
  const watch = liveWatch(9);
  // Ilk gorulus: 10. seviye kule, 3. evrim Melis kulesi, pencerede ×1,95 zar, uclu dizilim.
  watch.noteOwnTower({ id: "a", level: 10 });
  watch.noteOwnTower({ id: "m", level: 6, evolution: 3 });
  watch.noteOwnTower({ id: "o", level: 3, luck: 1.95, luckyWindowRemainingMs: 4000 });
  watch.noteOwnTower({ id: "z", level: 2, formationSize: 3 });
  // Sonraki snapshot'lar ayni: hicbir sey degismedi.
  for (let index = 0; index < 3; index += 1) {
    watch.noteOwnTower({ id: "a", level: 10 });
    watch.noteOwnTower({ id: "m", level: 6, evolution: 3 });
    watch.noteOwnTower({ id: "o", level: 3, luck: 1.95, luckyWindowRemainingMs: 3000 });
    watch.noteOwnTower({ id: "z", level: 2, formationSize: 3 });
  }
  for (const characterId of ["warrior", "archer", "onur", "zeynep"]) {
    const fresh = findNewBadges(watch.buildFacts({ characterId, stage: 1 }), {}, new Set(), "wave");
    for (const id of ["kademe-2", "kademe-3", "tam-evrim", "kasa", "sans-penceresi", "tam-dizilim"]) {
      assert.ok(!fresh.includes(id), `${id} miras olgudan acildi (${characterId})`);
    }
  }
  // Duvar seviyesi kademe sayilmiyor; gercek bir kulenin 4 -> 5 yukseltmesi sayiliyor.
  watch.noteOwnTower({ id: "w", level: 4, countsAsTower: false });
  watch.noteOwnTower({ id: "w", level: 5, countsAsTower: false });
  assert.equal(watch.getFlags().ownTowerMaxLevel, 0);
  watch.noteOwnTower({ id: "b", level: 4 });
  watch.noteOwnTower({ id: "b", level: 5 });
  assert.ok(findNewBadges(watch.buildFacts({ characterId: "warrior", stage: 1 }), {}, new Set(), "wave").includes("kademe-2"));
  // Yeni bir zar (deger degisti) sayiliyor.
  watch.noteOwnTower({ id: "o", level: 3, luck: 1.92, luckyWindowRemainingMs: 2000 });
  assert.equal(watch.getFlags().bestLuck, 1.92);
});

test("katilmadan once devrilen sampiyonla yarisilmiyor: Hızlanan Av iki canli devrilme istiyor", () => {
  const watch = liveWatch(8);
  watch.noteChampionDown({ ms: 5000, prevMs: 9000 });
  assert.equal(watch.getFlags().championFaster, false, "onceki sampiyon katilmadan once devrildi");
  watch.noteChampionDown({ ms: 4000, prevMs: 5000 });
  assert.equal(watch.getFlags().championFaster, true);
});

test("yeniden baglanma: katilirken yeniden gonderilen karne canli dalga bilinmeden nisan acmiyor", () => {
  const watch = new BadgeRunWatch();
  // Sunucu katilana once son karneyi yolluyor (`sendRunState`), snapshot sonra geliyor.
  assert.ok(watch.noteWave(rec(10, 0, 10)));
  const before = watch.buildFacts({ characterId: "warrior", stage: 1 });
  assert.deepEqual(before.waves, []);
  assert.deepEqual(findNewBadges(before, {}, new Set(), "wave"), []);
  // Ilk canli snapshot 11. dalganin kurulumu: 10. dalga katilmadan once bitti.
  watch.noteFirstLiveWave(resolveFirstLiveWave({ wave: 11, setupPhase: true }));
  assert.ok(!findNewBadges(watch.buildFacts({ characterId: "warrior", stage: 1 }), {}, new Set(), "wave").includes("hava-sahasi"));

  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  // Sahne: canli dalga bilinmeden dalga nisani yazilmiyor; deger oda kimligiyle oturum deposundan.
  assert.match(scene, /if \(stage === undefined \|\| this\.badgeWatch\.firstLiveWave === undefined\) return;/);
  assert.match(scene, /this\.badgeWatch\.noteFirstLiveWave\(resolveRoomFirstLiveWave\(this\.room\?\.roomId, candidate\)\);/);
  // Ustalik da ayni degeri kullaniyor.
  assert.match(readSource("apps/web/src/progress-store.ts"), /\{ countStars: gate, firstLiveWave \}/);
});

test("snapshot olgulari alindigi an not ediliyor, oynatma gecikmesinde degil", () => {
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /const hydratedSnapshot = this\.hydrateSnapshot\(snapshot\);\n\s+if \(!hydratedSnapshot\) \{[\s\S]*?\n\s+\}\n\s+this\.noteBadgeSnapshot\(hydratedSnapshot\);/);
  assert.equal((scene.match(/this\.noteBadgeTowerFacts\(/g) ?? []).length, 1, "yalnizca alinan snapshot'ta");
});

test("raporun 'once'si kosunun basi: dalga sonunda yazilan imza nisani puani, seviyesi ve unvani gorunuyor", () => {
  const masteryBefore = createEmptyMasteryBook();
  const masteryAfter = { operators: { zeynep: { waves: 20, stars: [0, 0, 0, 0, 0] } }, runs: ["run-z"] };
  // Dalga sonunda yazildi: mac sonunda okunan defter onlari zaten tasiyor.
  const saved = { "tam-dizilim": 10, "hava-sahasi": 11 };
  const summary = summarizeRunProgress({
    characterId: "zeynep",
    badgesAtStart: withoutBadges(saved, ["tam-dizilim", "hava-sahasi"]),
    badgesAfter: saved,
    masteryBefore,
    masteryAfter,
    gained: { waves: 20, firstClear: 0, stars: 0 }
  });
  assert.equal(summary.mastery.headline, "Ustalık 1 → 3");
  assert.equal(summary.mastery.sources, `20 dalga +20 · imza nişanı +${MASTERY_POINTS.signatureBadge}`);
  assert.ok(summary.cosmetics.includes("Unvan: Hava Muhafızı"));
  // Duzeltme olmadan (defter oldugu gibi) ayni kosu bunlari kaybediyordu.
  const naive = summarizeRunProgress({ characterId: "zeynep", badgesAtStart: saved, badgesAfter: saved, masteryBefore, masteryAfter, gained: { waves: 20, firstClear: 0, stars: 0 } });
  assert.equal(naive.mastery.headline, "Ustalık 2 → 3");
  assert.ok(!naive.cosmetics.includes("Unvan: Hava Muhafızı"));
  assert.deepEqual(withoutBadges(saved, []), saved);
  // Sahne dalga sonunda yazilani deftere not ediyor; depo raporu ondan kuruyor.
  assert.match(readSource("apps/web/src/scenes/GameScene.ts"), /this\.badgeWatch\.noteAwarded\(fresh\);/);
  assert.match(readSource("apps/web/src/progress-store.ts"), /badgesAtStart: withoutBadges\(badgesBefore, input\.watch\.awardedThisRun\)/);
});

test("tac can cubugunun ustunde ve seviye etiketinin altinda", () => {
  for (const radius of [12, 17, 24, 34]) {
    const x = 100;
    const y = 200;
    const points = getTowerCrownPoints(x, y, radius);
    const bottom = Math.max(...points.map((point) => point.y));
    const top = Math.min(...points.map((point) => point.y));
    // Cubuk cercevesiyle birlikte kadranin 4-9 px ustu.
    const barTop = y - radius - TOWER_HEALTH_BAR_LIFT_PX - 1;
    assert.ok(bottom < barTop, `r=${radius}: tac cubukla cakisiyor (${bottom} >= ${barTop})`);
    // Seviye etiketi kadranin 26 px ustunde ortali, ~10 px yazi.
    assert.ok(top > y - radius - 26 + 5, `r=${radius}: tac seviye etiketine giriyor`);
    const width = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
    assert.ok(width <= 14 && width >= 10);
  }
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /const y = tower\.y - discSize \/ 2 - TOWER_HEALTH_BAR_LIFT_PX;/, "cubuk ayni sabitle ciziliyor");
  assert.match(scene, /getTowerCrownPoints\(x, y, spriteRadius\)/);
});
