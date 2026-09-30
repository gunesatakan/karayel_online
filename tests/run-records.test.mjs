/**
 * Rekorlar, yildizlar ve kosu kaydi.
 *
 * Kosu raporu (`RunSummary`) tarayicida kalici ize donusuyor; bu testler o
 * donusumun sozlerini kilitliyor:
 *
 *   1. Yildiz sizintiya bakiyor, kalan cana degil: kalkanin can degismeden
 *      tuttugu dusman da yildiz goturuyor. Yenilgi yildiz almiyor.
 *   2. Kayit anahtari asama | operator | oyuncu sayisi | harita: co-op ve
 *      baska harita solo kayda karismiyor.
 *   3. Kayit hicbir alanda geriye gitmiyor; hangi alanin iyilestigi
 *      ("YENİ REKOR") ve ilk kosu ayri.
 *   4. Hedef satiri en yakin iki hedefi kisa ve dogru soyluyor.
 *   5. Yaratici, asamasi tutmayan ve bu tarayicida kilitli asamanin kosusu
 *      hicbir kayda yazilmiyor.
 *   6. Bozuk ya da kurcalanmis depo menuyu kirmiyor; kosu kaydi 50 kosuyla
 *      sinirli ve ayni kosu iki kez yazilmiyor.
 *
 * Rekor ve yildiz hicbir yoldan oyuna guc olarak donmuyor; buradaki hicbir
 * fonksiyon oda durumuna dokunmuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AIR_CHECKPOINT_WAVES,
  FINAL_WAVE,
  RUN_LOG_LIMIT,
  RUN_SUMMARY_VERSION,
  RunLedger,
  THREE_STAR_CLEAN_WAVES,
  TWO_STAR_CLEAN_WAVES,
  appendRunLog,
  applyRunToBook,
  checkRunRecordable,
  computeStars,
  createRunLogEntry,
  describeRecordChange,
  formatStars,
  getAirCheckpoints,
  getRunMapKey,
  getRunRecordKey,
  buildRunReportHero,
  mergeRecord,
  nextGoal,
  parseRecordKey,
  recordKey,
  sanitizeRecordBook,
  sanitizeRunLog,
  serializeRecordBook,
  serializeRunLog
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

/** Elle kurulmus rapor; yalnizca rekorun okudugu alanlar anlamli. */
function kosu(overrides = {}) {
  return {
    version: RUN_SUMMARY_VERSION,
    id: "kosu-1",
    result: "defeat",
    stage: 1,
    wave: 13,
    finalWave: FINAL_WAVE,
    playerCount: 1,
    mapKey: getRunMapKey(1),
    kills: 200,
    leaks: 3,
    cleanWaves: 10,
    cleanStreak: 0,
    bestCleanStreak: 7,
    waves: [],
    players: [{ slot: 0, name: "Test", characterId: "warrior", kills: 150, damage: 12000, cards: ["seri-atis"] }],
    ...overrides
  };
}

const zafer = (cleanWaves, overrides = {}) => kosu({ result: "victory", wave: FINAL_WAVE, cleanWaves, ...overrides });

/** Tam bir defter kosusu: verilen dalgalarda sizinti var, geri kalani temiz. */
function defterKosusu(sizintiliDalgalar, sizinti = { air: false, absorbed: false, hpLost: 8 }) {
  const ledger = new RunLedger();
  for (let wave = 1; wave <= FINAL_WAVE; wave += 1) {
    if (sizintiliDalgalar.includes(wave)) ledger.recordLeak(sizinti);
    ledger.closeWave(wave, { slots: [0] });
  }
  return ledger.summarize({
    id: "defter-1",
    result: "victory",
    stage: 1,
    wave: FINAL_WAVE,
    creative: false,
    mapKey: getRunMapKey(1),
    players: [{ slot: 0, name: "Test", characterId: "warrior", cards: [] }]
  });
}

/** Mesajlari toplayan gercek oda; tek oyuncu yuva 0'da. */
function oda(characterId = "warrior") {
  const room = createRoom(characterId);
  const yayinlar = [];
  room.broadcast = (type, payload) => yayinlar.push({ type, payload });
  room.clients = [];
  const player = room.state.players.get("p1");
  Object.assign(player, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0, ownedCardIds: ["seri-atis", "kalin-zirh"] });
  return { room, yayinlar, player };
}

function gercekYenilgi(room, yayinlar) {
  room.wave = 7;
  room.finishMatch("defeat");
  return yayinlar.find((yayin) => yayin.type === "match:defeat").payload.run;
}

test("yildiz: sizintiya bakiyor, yenilgi yildiz almiyor, esikler adli sabitlerde", () => {
  assert.equal(TWO_STAR_CLEAN_WAVES, 16);
  assert.equal(THREE_STAR_CLEAN_WAVES, FINAL_WAVE);

  assert.equal(computeStars(kosu({ cleanWaves: 19 })), 0, "yenilgi, ne kadar temiz olursa olsun, yildizsiz");
  assert.equal(computeStars(zafer(0)), 1);
  assert.equal(computeStars(zafer(15)), 1);
  assert.equal(computeStars(zafer(16)), 2);
  assert.equal(computeStars(zafer(19)), 2);
  assert.equal(computeStars(zafer(20)), 3);
  // Yaratici geri sarma temiz dalgayi 20'nin ustune tasiyabilir; not yine 3.
  assert.equal(computeStars(zafer(45)), 3);
  assert.equal(computeStars(zafer(Number.NaN)), 1, "bozuk sayi temizlenmeyi silmiyor");

  assert.equal(formatStars(0), "☆☆☆");
  assert.equal(formatStars(2), "★★☆");
  assert.equal(formatStars(9), "★★★");
});

test("yildiz: kalkanin can degismeden tuttugu sizinti da yildiz goturuyor", () => {
  // Nexus hic can kaybetmedi (kalkan tuttu) ama dusman nexus'a ulasti: can
  // puani 3 yildiz verirdi, sizinti vermiyor.
  const kalkanli = defterKosusu([10], { air: true, absorbed: true, hpLost: 0 });
  assert.equal(kalkanli.cleanWaves, FINAL_WAVE - 1);
  assert.equal(computeStars(kalkanli), 2);

  assert.equal(computeStars(defterKosusu([])), 3, "20/20 temiz");
  assert.equal(computeStars(defterKosusu([2, 5, 10, 15])), 2, "16 temiz dalga ★★");
  assert.equal(computeStars(defterKosusu([2, 5, 10, 15, 20])), 1, "15 temiz dalga ★");
});

test("anahtar: co-op, harita, operator ve asama ayri kayit", () => {
  const anahtarlar = [
    recordKey(1, "warrior", 1, "arena@1"),
    recordKey(1, "warrior", 2, "arena@1"),
    recordKey(1, "warrior", 4, "arena@1"),
    recordKey(1, "warrior", 1, "arena@2"),
    recordKey(1, "warrior", 1, "custom@9f3a"),
    recordKey(1, "onur", 1, "arena@1"),
    recordKey(2, "warrior", 1, "arena@1")
  ];
  assert.ok(anahtarlar.every((anahtar) => typeof anahtar === "string"));
  assert.equal(new Set(anahtarlar).size, anahtarlar.length, "her parca kaydi ayiriyor");
  assert.equal(recordKey(1, "warrior", 1, "arena@1"), "1|warrior|1|arena@1");

  // Gecersiz parca: anahtar yok, kayit hic yazilmiyor.
  for (const [stage, characterId, count, mapKey] of [
    [0, "warrior", 1, "arena@1"],
    [6, "warrior", 1, "arena@1"],
    [1.5, "warrior", 1, "arena@1"],
    [1, "yok", 1, "arena@1"],
    [1, "warrior", 0, "arena@1"],
    [1, "warrior", 5, "arena@1"],
    [1, "warrior", 1, ""],
    [1, "warrior", 1, "a|b"],
    [1, "warrior", 1, "x".repeat(49)]
  ]) {
    assert.equal(recordKey(stage, characterId, count, mapKey), undefined, `${stage}|${characterId}|${count}|${mapKey}`);
  }

  assert.deepEqual(parseRecordKey("3|onur|2|arena@1"), { stage: 3, characterId: "onur", playerCount: 2, mapKey: "arena@1" });
  for (const bozuk of ["01|warrior|1|arena@1", "1|warrior|1", "1|warrior|1|arena@1|x", "__proto__", 42, undefined]) {
    assert.equal(parseRecordKey(bozuk), undefined, String(bozuk));
  }
});

test("anahtar: co-op kosusu solo kaydina dokunmuyor, operator sunucunun raporundan", () => {
  const solo = applyRunToBook({}, kosu({ wave: 9 }), { slot: 0, characterId: "warrior" });
  const coop = applyRunToBook(solo.book, kosu({
    id: "kosu-2",
    wave: 15,
    playerCount: 2,
    players: [
      { slot: 0, name: "A", characterId: "warrior", kills: 1, damage: 1, cards: [] },
      { slot: 1, name: "B", characterId: "onur", kills: 1, damage: 1, cards: [] }
    ]
  }), { slot: 1, characterId: "warrior" });

  // Istemci yanlis operator soylese de oynanan operator raporun satirinda.
  assert.equal(coop.key, "1|onur|2|arena@1");
  assert.equal(coop.book["1|warrior|1|arena@1"].bestWave, 9, "solo rekor co-op'tan etkilenmedi");
  assert.equal(coop.book["1|onur|2|arena@1"].bestWave, 15);
  assert.equal(Object.keys(coop.book).length, 2);
});

test("anahtar: raporda satiri olmayan oyuncu kosuyu kaydedemez, istemcinin secimine dusulmuyor", () => {
  // Solo kosu bitti; odaya sonradan giren Mage yuva 1'de. Raporda yalnizca yuva 0 var.
  const solo = kosu({ result: "victory", wave: FINAL_WAVE, cleanWaves: 20 });
  const yabanci = { slot: 1, characterId: "mage" };
  assert.equal(getRunRecordKey(solo, yabanci), undefined, "kosuda olmayanin anahtari yok");
  assert.equal(createRunLogEntry(solo, yabanci, 1), undefined, "kosu kaydi satiri yok");
  assert.equal(applyRunToBook({}, solo, yabanci), undefined, "rekor, yildiz ve ilk temizleme yok");
  // Bos liste de "kosuda yoktun" demek.
  assert.equal(getRunRecordKey(kosu({ players: [] }), { slot: 0, characterId: "warrior" }), undefined);
  // Oynayan oyuncu etkilenmiyor.
  assert.equal(getRunRecordKey(solo, { slot: 0, characterId: "mage" }), "1|warrior|1|arena@1", "satir varken operator sunucudan");
  // Listesi olmayan eski bicim rapor: istemcinin secimi.
  const listesiz = kosu();
  delete listesiz.players;
  assert.equal(getRunRecordKey(listesiz, { slot: 3, characterId: "mage" }), "1|mage|1|arena@1");
});

test("birlestirme: rekor geriye gitmiyor, iyilesen alanlar isaretli, ilk kosu rekor sayilmiyor", () => {
  const ilk = mergeRecord(undefined, kosu({ wave: 11, cleanWaves: 8 }));
  assert.deepEqual(ilk.record, { bestWave: 11, clears: 0, bestStars: 0, bestCleanWaves: 8, runs: 1 });
  assert.equal(ilk.previous, undefined);
  assert.equal(ilk.newRecord, false, "sifiri gecmek rekor degil");
  assert.equal(ilk.improved.bestWave, true);
  assert.equal(describeRecordChange(ilk), "Dalga 11/20 · ilk kayıt");

  const rekor = mergeRecord(ilk.record, kosu({ wave: 13, cleanWaves: 8 }));
  assert.equal(rekor.newRecord, true);
  assert.deepEqual(rekor.improved, { bestWave: true, firstClear: false, bestStars: false, bestCleanWaves: false });
  assert.equal(rekor.previous.bestWave, 11);
  assert.equal(describeRecordChange(rekor), "Dalga 13/20 — YENİ REKOR (önceki 11)");

  const geride = mergeRecord(rekor.record, kosu({ wave: 11, cleanWaves: 5 }));
  assert.equal(geride.newRecord, false);
  assert.deepEqual(geride.record, { bestWave: 13, clears: 0, bestStars: 0, bestCleanWaves: 8, runs: 3 });
  assert.equal(describeRecordChange(geride), "Dalga 11/20 · rekora 2 dalga");
  assert.equal(describeRecordChange(mergeRecord(rekor.record, kosu({ wave: 13, cleanWaves: 1 }))), "Dalga 13/20 · rekora eşit");

  // Daha erken biten ama daha temiz kosu: temiz dalga rekoru.
  const temiz = mergeRecord(geride.record, kosu({ wave: 12, cleanWaves: 10 }));
  assert.deepEqual(temiz.improved, { bestWave: false, firstClear: false, bestStars: false, bestCleanWaves: true });
  assert.equal(temiz.newRecord, true);
  assert.equal(describeRecordChange(temiz), "Dalga 12/20 · YENİ REKOR: 10 temiz dalga");

  const temizleme = mergeRecord(temiz.record, zafer(12));
  assert.equal(temizleme.improved.firstClear, true);
  assert.equal(temizleme.stars, 1);
  assert.deepEqual(temizleme.record, { bestWave: 20, clears: 1, bestStars: 1, bestCleanWaves: 12, runs: 5 });
  assert.equal(describeRecordChange(temizleme), "★☆☆ · İLK TEMİZLEME");

  const ikiYildiz = mergeRecord(temizleme.record, zafer(17));
  assert.deepEqual(ikiYildiz.improved, { bestWave: false, firstClear: false, bestStars: true, bestCleanWaves: true });
  assert.equal(describeRecordChange(ikiYildiz), "★★☆ · YENİ REKOR (önceki ★☆☆)");

  const dahaTemiz = mergeRecord(ikiYildiz.record, zafer(18));
  assert.deepEqual(dahaTemiz.improved, { bestWave: false, firstClear: false, bestStars: false, bestCleanWaves: true });
  assert.equal(describeRecordChange(dahaTemiz), "★★☆ · YENİ REKOR: 18 temiz dalga (önceki 17)");

  const siradan = mergeRecord(dahaTemiz.record, zafer(12));
  assert.equal(siradan.newRecord, false);
  assert.equal(siradan.record.clears, 4);
  assert.equal(siradan.record.bestStars, 2, "zayif zafer yildizi dusurmuyor");
  assert.equal(describeRecordChange(siradan), "★☆☆ · 12 temiz dalga");

  const sonrakiYenilgi = mergeRecord(siradan.record, kosu({ wave: 3, cleanWaves: 1 }));
  assert.deepEqual(sonrakiYenilgi.record, { ...siradan.record, runs: siradan.record.runs + 1 }, "yenilgi hicbir alani geri almiyor");
});

test("hedef satiri: en yakin iki hedef, kisa ve tek kosu esigiyle", () => {
  const kayit = (overrides) => ({ bestWave: 0, clears: 0, bestStars: 0, bestCleanWaves: 0, runs: 1, ...overrides });
  const satirlar = [
    [kayit({ bestWave: 13, bestCleanWaves: 9 }), "Sıradaki hedef: Dalga 14 · ★★ için 16 temiz dalga"],
    [undefined, "Sıradaki hedef: Aşamayı temizle · ★★ için 16 temiz dalga"],
    [kayit({ bestWave: 20, bestCleanWaves: 14 }), "Sıradaki hedef: Aşamayı temizle · ★★ için 16 temiz dalga"],
    [kayit({ bestWave: 20, clears: 1, bestStars: 1, bestCleanWaves: 12 }), "Sıradaki hedef: ★★ için 16 temiz dalga (en iyi 12)"],
    [kayit({ bestWave: 20, clears: 3, bestStars: 2, bestCleanWaves: 17 }), "Sıradaki hedef: ★★★ için 20/20 temiz dalga (en iyi 17)"],
    [kayit({ bestWave: 20, clears: 5, bestStars: 3, bestCleanWaves: 20 }), "Sıradaki hedef: ★★★ tamam · başka bir operatörle dene"]
  ];
  for (const [record, beklenen] of satirlar) {
    const satir = nextGoal(record, { finalWave: FINAL_WAVE });
    assert.equal(satir, beklenen);
    // 375 px'te 13 px yaziyla tek satir.
    assert.ok(satir.length <= 56, `satir uzun: ${satir}`);
  }
  // Kosu islendikten sonraki kayitla: rekor 13 olduysa hedef 14.
  assert.equal(nextGoal(mergeRecord(undefined, kosu({ wave: 13 })).record), "Sıradaki hedef: Dalga 14 · ★★ için 16 temiz dalga");
});

test("hedef satiri: yenilgiden gelen en iyi temiz dalga yildiz hedefinin yanina yazilmiyor", () => {
  // 19. dalgada 17 temiz dalgayla yenilgi, sonra 12 temiz dalgayla temizleme.
  const yenilgi = mergeRecord(undefined, kosu({ wave: 19, cleanWaves: 17 }));
  const temizleme = mergeRecord(yenilgi.record, zafer(12));
  assert.deepEqual(temizleme.record, { bestWave: 20, clears: 1, bestStars: 1, bestCleanWaves: 17, runs: 2 });
  assert.equal(nextGoal(temizleme.record, { finalWave: FINAL_WAVE }), "Sıradaki hedef: ★★ için 16 temiz dalga", "17 >= 16 ama ★★ yok: 'en iyi 17' celisirdi");
  // ★★'li kayitta 20 temiz dalga ancak yenilgiden gelir.
  const ikiYildiz = { bestWave: 20, clears: 2, bestStars: 2, bestCleanWaves: 20, runs: 3 };
  assert.equal(nextGoal(ikiYildiz, { finalWave: FINAL_WAVE }), "Sıradaki hedef: ★★★ için 20/20 temiz dalga");

  // Raporun "En iyi" rozeti ayni kurali okuyor.
  const siradan = mergeRecord(temizleme.record, zafer(12, { id: "kosu-3" }));
  const bas = buildRunReportHero({ result: "victory", wave: FINAL_WAVE, creative: false, run: zafer(12), merge: siradan });
  assert.deepEqual(bas.badge, { text: "En iyi ★☆☆", celebrated: false });

  // Temizlenmis asamada son dalgada dusmek "rekora eşit" degil.
  const sonDalga = mergeRecord(temizleme.record, kosu({ wave: 20, cleanWaves: 5 }));
  assert.equal(describeRecordChange(sonDalga), "Dalga 20/20 · en iyi ★☆☆");
  // Temizlenmemis asamada ayni durum yine "rekora eşit".
  assert.equal(describeRecordChange(mergeRecord(yenilgi.record, kosu({ wave: 19, cleanWaves: 3 }))), "Dalga 19/20 · rekora eşit");
});

test("hava isaretleri: 5/10/15/20 dengeden, gecilen dalga isaretli", () => {
  assert.deepEqual([...AIR_CHECKPOINT_WAVES], [5, 10, 15, 20]);
  const gecildi = (record) => getAirCheckpoints(record).map((checkpoint) => checkpoint.passed);
  assert.deepEqual(getAirCheckpoints().map((checkpoint) => checkpoint.mode), ["all", "all", "mixed", "mixed"]);
  assert.deepEqual(gecildi(undefined), [false, false, false, false]);
  assert.deepEqual(gecildi({ bestWave: 13, clears: 0 }), [true, true, false, false]);
  // 10. dalgada olen kosu 10'u gecmedi.
  assert.deepEqual(gecildi({ bestWave: 10, clears: 0 }), [true, false, false, false]);
  assert.deepEqual(gecildi({ bestWave: 20, clears: 0 }), [true, true, true, false], "son dalga yalnizca temizlemeyle");
  assert.deepEqual(gecildi({ bestWave: 20, clears: 1 }), [true, true, true, true]);
});

test("kapi: yaratici, asamasi tutmayan ve bu tarayicida kilitli asamanin kosusu yazilmaz", () => {
  assert.deepEqual(checkRunRecordable(kosu(), { stage: 1 }, []), { ok: true, stage: 1 });
  assert.deepEqual(checkRunRecordable(kosu({ creative: true }), { stage: 1 }, []), { ok: false, reason: "creative" });
  assert.deepEqual(checkRunRecordable(kosu(), { stage: 1, creative: true }, []), { ok: false, reason: "creative" });
  assert.deepEqual(checkRunRecordable(kosu(), { stage: undefined }, []), { ok: false, reason: "stage" });
  assert.deepEqual(checkRunRecordable(kosu({ stage: 1 }), { stage: 2 }, [1]), { ok: false, reason: "mismatch" });
  assert.deepEqual(checkRunRecordable(kosu({ version: RUN_SUMMARY_VERSION + 1 }), { stage: 1 }, []), { ok: false, reason: "version" });
  // Co-op: ev sahibinin 3. asamasi, katilanda yalnizca 1 bitmis.
  assert.deepEqual(checkRunRecordable(kosu({ stage: 3 }), { stage: 3 }, [1]), { ok: false, reason: "locked" });
  assert.deepEqual(checkRunRecordable(kosu({ stage: 3 }), { stage: 3 }, [1, 2]), { ok: true, stage: 3 });
});

test("uctan uca: gercek odanin yenilgi raporu solo kayda ve kosu kaydina yaziliyor", () => {
  const { room, yayinlar } = oda("warrior");
  const run = gercekYenilgi(room, yayinlar);
  assert.equal(checkRunRecordable(run, { stage: 1 }, []).ok, true);

  const applied = applyRunToBook({}, run, { slot: 0, characterId: "warrior" });
  assert.equal(applied.key, "1|warrior|1|arena@1");
  assert.equal(applied.merge.record.bestWave, 7);
  assert.equal(applied.merge.stars, 0);

  const entry = createRunLogEntry(run, { slot: 0, characterId: "warrior" }, 1_700_000_000_000);
  assert.equal(entry.v, 1);
  assert.equal(entry.id, run.id);
  assert.equal(entry.key, applied.key);
  assert.equal(entry.result, "defeat");
  assert.equal(entry.wave, 7);
  assert.deepEqual(entry.cards, ["seri-atis", "kalin-zirh"], "yerel oyuncunun destesi, secim sirasiyla");
  assert.deepEqual(entry.leakHistory, run.waves.map((record) => record.l));
  assert.equal(sanitizeRunLog(JSON.parse(JSON.stringify(serializeRunLog([entry]))))[0].id, entry.id, "depodan donus kaybetmiyor");

  // Yaratici oda ayni yoldan gecemez.
  const yaratici = oda("warrior");
  yaratici.room.creativeMode = true;
  const yaraticiRun = gercekYenilgi(yaratici.room, yaratici.yayinlar);
  assert.deepEqual(checkRunRecordable(yaraticiRun, { stage: 1 }, []), { ok: false, reason: "creative" });
});

test("kosu kaydi: 50 kosuyla sinirli, ayni kosu iki kez yazilmiyor, bozuk satir eleniyor", () => {
  let log = [];
  for (let index = 0; index < RUN_LOG_LIMIT + 5; index += 1) {
    log = appendRunLog(log, createRunLogEntry(kosu({ id: `kosu-${index}` }), { slot: 0, characterId: "warrior" }, index));
  }
  assert.equal(log.length, RUN_LOG_LIMIT);
  assert.equal(log[0].id, "kosu-5", "en eski kosu dusuyor");
  assert.equal(log.at(-1).id, `kosu-${RUN_LOG_LIMIT + 4}`);
  const tekrar = appendRunLog(log, createRunLogEntry(kosu({ id: "kosu-30" }), { slot: 0, characterId: "warrior" }, 999));
  assert.deepEqual(tekrar.map((entry) => entry.id), log.map((entry) => entry.id), "ayni kimlik ikinci kez yazilmiyor");

  const depo = serializeRunLog(log.slice(0, 2));
  depo.runs.push(null, "x", { v: 1, id: "bozuk" }, { ...depo.runs[0] }, { ...depo.runs[1], key: "9|warrior|1|arena@1" });
  const okunan = sanitizeRunLog(JSON.parse(JSON.stringify(depo)));
  assert.deepEqual(okunan.map((entry) => entry.id), [log[0].id, log[1].id], "bozuk ve yinelenen satirlar eleniyor");
  for (const bozuk of [null, undefined, "x", [], { v: 2, runs: depo.runs }, { v: 1, runs: "x" }]) {
    assert.deepEqual(sanitizeRunLog(bozuk), []);
  }
  // Yaratici bayrakli rapor bile olsa satir anahtarsiz kurulamaz.
  assert.equal(createRunLogEntry(kosu({ mapKey: "a|b" }), { slot: 0, characterId: "warrior" }, 0), undefined);
});

test("bozuk depo menuyu kirmiyor: defter temizlenerek okunuyor", () => {
  for (const bozuk of [null, undefined, "x", 42, [], { v: 2, records: {} }, { v: 1, records: [] }, { v: 1 }]) {
    assert.deepEqual(sanitizeRecordBook(bozuk), {}, JSON.stringify(bozuk));
  }
  const depo = {
    v: 1,
    records: {
      "1|warrior|1|arena@1": { bestWave: 99, clears: "x", bestStars: 7, bestCleanWaves: -4, runs: 2 },
      "2|warrior|1|arena@1": { bestWave: 4, clears: 2, bestStars: 0, bestCleanWaves: 30, runs: 1 },
      "3|warrior|1|arena@1": { bestWave: 4, clears: 0, bestStars: 0, bestCleanWaves: 0, runs: 0 },
      "4|warrior|1|arena@1": null,
      "9|warrior|1|arena@1": { bestWave: 5, clears: 0, bestStars: 0, bestCleanWaves: 0, runs: 1 },
      "1|yok|1|arena@1": { bestWave: 5, clears: 0, bestStars: 0, bestCleanWaves: 0, runs: 1 }
    }
  };
  const book = sanitizeRecordBook(JSON.parse(JSON.stringify(depo)));
  assert.deepEqual(Object.keys(book).sort(), ["1|warrior|1|arena@1", "2|warrior|1|arena@1"]);
  // Temizlenmemis asamanin yildizi olamaz; sinir disi sayilar kistiriliyor.
  assert.deepEqual(book["1|warrior|1|arena@1"], { bestWave: 20, clears: 0, bestStars: 0, bestCleanWaves: 0, runs: 2 });
  // Temizlenmis asama son dalgaya ulasmis ve en az bir yildizli; kosu sayisi temizlemeden az olamaz.
  assert.deepEqual(book["2|warrior|1|arena@1"], { bestWave: 20, clears: 2, bestStars: 1, bestCleanWaves: 20, runs: 2 });
  assert.deepEqual(sanitizeRecordBook(JSON.parse(JSON.stringify(serializeRecordBook(book)))), book, "depodan donus kaybetmiyor");
});

test("kaynak: tarayici kaydi kapidan gecmeden yazmiyor, anahtarlar surumlu, depo try icinde", async () => {
  const source = (await readFile(new URL("../apps/web/src/run-records.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(source.includes('"karayel_records_v1"'));
  assert.ok(source.includes('"karayel_run_log_v1"'));

  const start = source.indexOf("export function recordRun(");
  const body = source.slice(start);
  const gate = body.indexOf("checkRunRecordable(");
  assert.ok(gate >= 0, "recordRun ortak kapiyi kullaniyor");
  assert.ok(gate < body.indexOf("writeJson("), "kapi yazmadan once");

  // Depoya dokunan her fonksiyon try/catch icinde: depo kapaliysa menu kirilmamali.
  const chunks = source.split(/\nfunction |\nexport function /).filter((chunk) => chunk.includes("localStorage"));
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) assert.ok(/try \{[\s\S]*localStorage[\s\S]*\} catch/.test(chunk), chunk.slice(0, 40));

  // Sahne depoya kendisi yazmiyor; kayit tek kapidan.
  const scene = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(scene.includes("recordRun("));
  assert.equal(scene.includes("karayel_records_v1"), false);
  assert.equal(scene.includes("karayel_run_log_v1"), false);
});
