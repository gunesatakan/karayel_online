/**
 * Kosu raporu: macin son ekrani.
 *
 * Phaser katmanindaki tek sayilik sonuc ekraninin yerine gelen DOM raporunun
 * kurallari. Rapor satirlari paylasilan modulde kuruluyor; bu testler o
 * satirlarin sozlerini kilitliyor:
 *
 *   1. Dalga seridi sunucunun karnesinden: temiz, sizintili, dusulen dalga,
 *      oynanmayan; hava dalgalari oynanmasa da isaretli. Rapor yoksa hicbir
 *      sey uydurulmuyor.
 *   2. Rekor satiri sonuc ekraninin eski satiriyla ayni metin; yaratici kosuda
 *      yildiz yok.
 *   3. "En iyi an" once kendi, sonra ekip; co-op'ta her oyuncu bir satir ve bir
 *      rol unvani aliyor, hicbir unvan hasar yarisi degil.
 *   4. Deste secim sirasiyla, nadirlik cercevesiyle.
 *   5. Final metni yalnizca son asama bu tarayicida gercekten temizlenince.
 *   6. Tekrar / Sonraki aşama: sessionStorage niyeti + yeniden yukleme; niyet
 *      dogrulaniyor, eskiyince ya da bozulunca yok sayiliyor. Sonraki asama
 *      yalnizca aciksa.
 *   7. Sonuc kac yoldan gelirse gelsin ekran bir kez aciliyor ve kosu bir kez
 *      kaydediliyor (yeniden gonderim, yeniden baglanma, snapshot).
 *
 * Rapor taninma: hicbir fonksiyon oda durumuna dokunmuyor, hicbir satir
 * oyuna guc olarak donmuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CARD_PICKABLE_AFTER_MS,
  FEEDBACK_KIND_RULES,
  FINAL_WAVE,
  KILL_STREAK_RULES,
  MatchResultLatch,
  QUICK_START_MAX_AGE_MS,
  RUN_REPORT_ACTIONABLE_AFTER_MS,
  RUN_REPORT_BADGE_DELAY_MS,
  RUN_ROLE_TITLES,
  RUN_SUMMARY_VERSION,
  RunLedger,
  STAGE_COUNT,
  buildPlayerLines,
  buildRunDeck,
  buildRunReportHero,
  buildRunReportView,
  buildWaveStrip,
  cardCatalog,
  characters,
  createQuickStartIntent,
  describeRecordChange,
  describeRunMvp,
  getCardRarity,
  getRunMapKey,
  getRunRecordKey,
  getRunReportCues,
  getRunReportHeading,
  isFinaleClear,
  mergeRecord,
  parseQuickStartIntent,
  pickBetterUltimate,
  pickRunMoment,
  planRunReportActions,
  resolveLocalRunSlot,
  resolveQuickStartStage,
  scoreUltimateMoment
} from "../packages/shared/dist/index.js";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

/** Mesajlari toplayan gercek oda; tek oyuncu yuva 0'da, bagli. */
function bitecekOda(characterId = "warrior") {
  const room = createRoom(characterId);
  const yayinlar = [];
  room.broadcast = (type, payload) => yayinlar.push({ type, payload });
  room.clients = [];
  room.stage = 1;
  const player = room.state.players.get("p1");
  Object.assign(player, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0, ownedCardIds: [] });
  return { room, yayinlar, player };
}

/** Kendisine gonderilenleri toplayan sahte istemci. */
function sahteIstemci(sessionId) {
  return { sessionId, sent: [], send(type, payload) { this.sent.push({ type, payload }); } };
}

/** Defterden gercek bir rapor: verilen dalgalarda sizinti, `died` ise son dalgada dusuluyor. */
function defterRaporu({ waves, leaks = {}, died = false, result = died ? "defeat" : "victory", stage = 1, players, streak, level10 }) {
  const ledger = new RunLedger();
  const slots = players.map((player) => player.slot);
  for (let wave = 1; wave <= waves; wave += 1) {
    for (let index = 0; index < (leaks[wave] ?? 0); index += 1) {
      ledger.recordLeak({ air: wave === 5 || wave === 10, absorbed: false, hpLost: 8 });
    }
    for (const player of players) {
      for (let kill = 0; kill < (player.killsPerWave ?? 0); kill += 1) ledger.recordKill(player.slot);
      if (player.tower) ledger.recordTowerDamage(player.tower, player.slot, player.damagePerWave ?? 0);
    }
    if (streak && streak.wave === wave) ledger.recordStreak(streak.slot, streak.tier, wave);
    if (level10 && level10.wave === wave) ledger.recordTowerLevel({ ...level10.tower, level: 10 }, level10.slot, wave);
    ledger.closeWave(wave, { died: died && wave === waves, slots });
  }
  return ledger.summarize({
    id: "rapor-1",
    result,
    stage,
    wave: waves,
    creative: false,
    mapKey: getRunMapKey(1),
    players: players.map((player) => ({ slot: player.slot, name: player.name, characterId: player.characterId, cards: player.cards ?? [] }))
  });
}

const kule = (id, name, level = 5) => ({ id, level, definition: { id: `${id}-def`, name } });

test("serit: karneden temiz, sizintili, dusulen ve oynanmayan; hava dalgasi hep isaretli", () => {
  const run = defterRaporu({
    waves: 13,
    died: true,
    leaks: { 5: 2, 9: 1, 13: 3 },
    players: [{ slot: 0, name: "Zeynep", characterId: "zeynep", killsPerWave: 1 }]
  });
  const strip = buildWaveStrip({ result: "defeat", wave: 13, run });
  assert.equal(strip.length, FINAL_WAVE, "serit her zaman 20 hucre");
  const durum = (wave) => strip[wave - 1].state;
  assert.equal(durum(1), "clean");
  assert.equal(durum(5), "leak");
  assert.equal(durum(9), "leak");
  assert.equal(durum(10), "clean");
  assert.equal(durum(13), "death");
  assert.equal(durum(14), "open");
  assert.equal(durum(20), "open");
  assert.deepEqual(strip.filter((cell) => cell.air).map((cell) => [cell.wave, cell.air]), [[5, "all"], [10, "all"], [15, "mixed"], [20, "mixed"]]);
  assert.equal(strip[4].label, "5. dalga (hava): 2 sızıntı (2 hava)");
  assert.equal(strip[12].label, "13. dalga: düştü · 3 sızıntı");
  assert.equal(strip[14].label, "15. dalga (karışık hava): oynanmadı");

  // Kalkanin tuttugu sizinti da hucrede yaziyor.
  const kalkan = buildWaveStrip({ result: "defeat", wave: 2, run: { finalWave: FINAL_WAVE, waves: [{ w: 1, l: 1, s: 1, k: 0, p: [0], c: 0 }, { w: 2, l: 1, k: 0, p: [0], c: 0, d: 1 }] } });
  assert.equal(kalkan[0].label, "1. dalga: 1 sızıntı (kalkan tuttu 1)");

  // Yaratici geri sarma: ayni dalga iki kez geldiyse son karne gecerli.
  const geriSarma = buildWaveStrip({ result: "defeat", wave: 3, run: { finalWave: FINAL_WAVE, waves: [{ w: 3, l: 2, k: 0, p: [], c: 0 }, { w: 3, l: 0, k: 0, p: [], c: 1 }] } });
  assert.equal(geriSarma[2].state, "clean");
});

test("serit: rapor gelmeden acilan ekran temiz ya da sizintili uydurmuyor", () => {
  const yenilgi = buildWaveStrip({ result: "defeat", wave: 7 });
  assert.deepEqual(yenilgi.slice(0, 7).map((cell) => cell.state), ["played", "played", "played", "played", "played", "played", "death"]);
  assert.equal(yenilgi[7].state, "open");
  const zafer = buildWaveStrip({ result: "victory", wave: FINAL_WAVE });
  assert.ok(zafer.every((cell) => cell.state === "played"));
  assert.equal(zafer.some((cell) => cell.state === "clean" || cell.state === "leak"), false);
});

test("bas: yenilgide 'Dalga 13/20 — YENİ REKOR (önceki 11)', eski sonuc satiriyla ayni metin", () => {
  const kosu = (overrides) => ({ result: "defeat", wave: 13, cleanWaves: 8, ...overrides });
  const ilk = mergeRecord(undefined, kosu({ wave: 11 }));
  const rekor = mergeRecord(ilk.record, kosu({ wave: 13 }));
  const geride = mergeRecord(rekor.record, kosu({ wave: 10, cleanWaves: 2 }));
  for (const merge of [ilk, rekor, geride]) {
    const { hero, badge } = buildRunReportHero({ result: "defeat", wave: merge.wave, creative: false, merge });
    assert.equal(hero.kind, "wave");
    assert.equal(`${hero.text}${badge.separator}${badge.text}`, describeRecordChange(merge), "rapor ve eski satir ayni cumle");
  }
  const rekorBas = buildRunReportHero({ result: "defeat", wave: 13, creative: false, merge: rekor });
  assert.equal(`${rekorBas.hero.text}${rekorBas.badge.separator}${rekorBas.badge.text}`, "Dalga 13/20 — YENİ REKOR (önceki 11)");
  assert.equal(rekorBas.badge.celebrated, true);
  assert.equal(buildRunReportHero({ result: "defeat", wave: 11, creative: false, merge: ilk }).badge.celebrated, false, "ilk kayit kutlanmiyor");

  // Kayit yoksa (yaratici, kilitli, rapor yolda) yalnizca dalga.
  assert.deepEqual(buildRunReportHero({ result: "defeat", wave: 9, creative: true }), { hero: { kind: "wave", text: "Dalga 9/20" } });
});

test("bas: zaferde yildizlar ve temiz dalga; rozet yalnizca gecilen rekorda altin", () => {
  const zafer = (cleanWaves) => ({ result: "victory", wave: FINAL_WAVE, cleanWaves, finalWave: FINAL_WAVE });
  const ilkTemizleme = mergeRecord({ bestWave: 14, clears: 0, bestStars: 0, bestCleanWaves: 9, runs: 4 }, zafer(17));
  const bas = buildRunReportHero({ result: "victory", wave: FINAL_WAVE, creative: false, run: zafer(17), merge: ilkTemizleme });
  assert.deepEqual(bas.hero, { kind: "stars", stars: 2, text: "★★☆", caption: "17/20 temiz dalga" });
  assert.deepEqual(bas.badge, { text: "İLK TEMİZLEME", celebrated: true });
  assert.equal(`${bas.hero.text} · ${bas.badge.text}`, describeRecordChange(ilkTemizleme));

  // Gecilmemis zafer temiz dalgasini tekrar etmiyor; en iyiyi gosteriyor.
  const siradan = mergeRecord(ilkTemizleme.record, zafer(12));
  const siradanBas = buildRunReportHero({ result: "victory", wave: FINAL_WAVE, creative: false, run: zafer(12), merge: siradan });
  assert.deepEqual(siradanBas.badge, { text: "En iyi ★★☆ · 17 temiz dalga", celebrated: false });

  // Yaratici zafer: yildiz yok, istedigin dusmani gonderebildigin kosu bir sey olcmez.
  assert.deepEqual(buildRunReportHero({ result: "victory", wave: FINAL_WAVE, creative: true, run: zafer(20) }).hero, { kind: "wave", text: "Dalga 20/20" });
  // Kilitli asamada kazanilan zafer: yildiz kosunun olgusu, rozet ve kayit yok.
  const kilitli = buildRunReportHero({ result: "victory", wave: FINAL_WAVE, creative: false, run: zafer(20) });
  assert.equal(kilitli.hero.text, "★★★");
  assert.equal(kilitli.badge, undefined);
});

test("en iyi an: once kendi, sonra ekip; onuncu seviye > seri > ulti derecesi", () => {
  const players = [
    { slot: 0, name: "Ali", characterId: "zeynep", kills: 10, damage: 1, cards: [] },
    { slot: 1, name: "Ece", characterId: "warrior", kills: 40, damage: 9, cards: [], bestStreakTier: "legendary" }
  ];
  const mukemmel = { kind: "column", hits: 6, kills: 4, best: 6 };
  // Takim arkadasinin LEGENDARY'si senin ultinin ustune cikmiyor.
  const kendi = pickRunMoment({ players, bestStreak: { tier: "legendary", slot: 1, wave: 9 } }, { localSlot: 0, ultimate: mukemmel });
  assert.deepEqual(kendi, { kind: "ultimate", own: true, text: "SÜTUN · 6 isabet · 4 öldü · MÜKEMMEL NİŞAN" });
  // Kendi anin yoksa ekibinki, adiyla.
  const ekip = pickRunMoment({ players, bestStreak: { tier: "legendary", slot: 1, wave: 9 } }, { localSlot: 0 });
  assert.deepEqual(ekip, { kind: "streak", own: false, text: "Ece: LEGENDARY serisi · Dalga 9" });

  // Kendi anlari arasinda: RAMPAGE mukemmel nisanin ustunde, UNSTOPPABLE altinda; L10 hepsinin ustunde.
  const solo = (tier) => [{ slot: 0, name: "Ali", characterId: "zeynep", kills: 1, damage: 1, cards: [], bestStreakTier: tier }];
  assert.equal(pickRunMoment({ players: solo("rampage"), bestStreak: { tier: "rampage", slot: 0, wave: 8 } }, { localSlot: 0, ultimate: mukemmel }).text, "RAMPAGE serisi · Dalga 8");
  assert.equal(pickRunMoment({ players: solo("unstoppable"), bestStreak: { tier: "unstoppable", slot: 0, wave: 8 } }, { localSlot: 0, ultimate: mukemmel }).kind, "ultimate");
  const l10 = pickRunMoment({
    players: solo("legendary"),
    bestStreak: { tier: "legendary", slot: 0, wave: 12 },
    firstLevel10: { wave: 14, slot: 0, towerId: "t1", definitionId: "takipci", name: "Takipçi" }
  }, { localSlot: 0, ultimate: mukemmel });
  assert.deepEqual(l10, { kind: "level10", own: true, text: "Takipçi SV 10 · KADEME 3 · Dalga 14" });
  // Hic an yoksa satir yok.
  assert.equal(pickRunMoment({ players: solo(undefined) }, { localSlot: 0, ultimate: { kind: "meteor", hits: 0, kills: 0 } }), undefined);
});

test("ulti: iskalanan ulti an degil, derece oldurmenin ustunde, esitlikte ilk kaliyor", () => {
  assert.equal(scoreUltimateMoment({ kind: "meteor", hits: 0, kills: 0 }), 0);
  assert.ok(scoreUltimateMoment({ kind: "column", hits: 6, kills: 0, best: 6 }) > scoreUltimateMoment({ kind: "meteor", hits: 9, kills: 7 }));
  let best;
  best = pickBetterUltimate(best, { kind: "meteor", hits: 0, kills: 0 });
  assert.equal(best, undefined, "iskalama saklanmiyor");
  best = pickBetterUltimate(best, { kind: "meteor", hits: 5, kills: 2 });
  best = pickBetterUltimate(best, { kind: "meteor", hits: 9, kills: 2 });
  assert.equal(best.hits, 9, "ayni oldurmede daha cok isabet");
  const ilk = best;
  assert.equal(pickBetterUltimate(best, { kind: "meteor", hits: 9, kills: 2 }), ilk, "esitlikte ilk an kaliyor");
  assert.equal(pickBetterUltimate(best, { kind: "meteor", hits: 1, kills: 0 }), ilk, "kotu ulti iyisini silmiyor");
  assert.equal(pickBetterUltimate(best, { kind: "column", hits: 4, kills: 1, best: 4 }).kind, "column", "mukemmel nisan oldurmenin ustunde");
});

test("co-op: her oyuncu bir satir ve bir unvan; unvan olgulardan, hasar yarisi degil", () => {
  const run = defterRaporu({
    waves: 6,
    died: true,
    players: [
      { slot: 0, name: "Ali", characterId: "zeynep", killsPerWave: 1, tower: kule("a", "Hiza Emri", 7), damagePerWave: 9000 },
      { slot: 1, name: "Ece", characterId: "warrior", killsPerWave: 5, tower: kule("b", "Takipçi", 4), damagePerWave: 100 },
      { slot: 2, name: "Can", characterId: "healer", killsPerWave: 0 },
      { slot: 3, name: "Onur", characterId: "onur", killsPerWave: 0 }
    ],
    streak: { slot: 3, tier: "granted", wave: 2 }
  });
  const lines = buildPlayerLines(run, 2);
  assert.deepEqual(lines.map((line) => line.name), ["Can", "Ali", "Ece", "Onur"], "yerel oyuncu once, sonra yuva sirasi");
  const unvan = Object.fromEntries(lines.map((line) => [line.name, line.title]));
  assert.equal(unvan.Ece, RUN_ROLE_TITLES.kills, "tek basina en cok oldurme: Kasap");
  assert.equal(unvan.Onur, RUN_ROLE_TITLES.streak, "kosunun en yuksek serisi");
  // Kule hasari bes rol olcusunden biri (Kule Ustası): en cok hasari veren Ali
  // onu aliyor, ama yalnizca onu -- Kasap oldurmede onde olan Ece'de kaliyor.
  assert.equal(unvan.Ali, RUN_ROLE_TITLES.tower);
  assert.equal(unvan.Can, characters.find((character) => character.id === "healer").role);
  assert.ok(lines.every((line) => line.title.length > 0), "herkesin bir unvani var");
  assert.equal(lines.find((line) => line.name === "Ece").detail, "30 öldürme · Takipçi SV 4");
  assert.equal(lines.find((line) => line.name === "Can").detail, "0 öldürme · kule hasarı yok");
  assert.equal(lines.find((line) => line.name === "Onur").detail, "0 öldürme · kule hasarı yok · GRANTED");
  assert.equal(lines.some((line) => /\d hasar/.test(line.detail)), false, "satirda hasar sayisi yok");

  // Esit oldurmede Kasap ikisinde birden: unvan yuvaya gore keyfi birine gitmiyor.
  const esit = buildPlayerLines({ players: [
    { slot: 0, name: "A", characterId: "zeynep", kills: 5, damage: 0, cards: [] },
    { slot: 1, name: "B", characterId: "tank", kills: 5, damage: 0, cards: [] }
  ] }, 0);
  assert.deepEqual(esit.map((line) => line.titleKind), ["kills", "kills"]);

  // Rapor olgulari: asist ve komut asisti satirda, Nişancı Ortağı ve Komutan unvaninda.
  const destek = buildPlayerLines({ players: [
    { slot: 0, name: "A", characterId: "warrior", kills: 40, damage: 9000, towerDamage: 9000, cards: [] },
    { slot: 1, name: "B", characterId: "zeynep", kills: 4, damage: 300, commandAssists: 12, cards: [] },
    { slot: 2, name: "C", characterId: "archer", kills: 6, damage: 500, assists: 9, repaired: 400, cards: [] }
  ] }, 0);
  const destekUnvan = Object.fromEntries(destek.map((line) => [line.name, line.titleKind]));
  assert.equal(destekUnvan.B, "command");
  assert.equal(destekUnvan.C, "assist", "assist ve onarimin ikisinde de tek; once destek unvani");
  assert.ok(["kills", "tower"].includes(destekUnvan.A));
  assert.equal(destek.find((line) => line.name === "B").detail, "4 öldürme · 12 asist · kule hasarı yok");

  // Co-op raporunda kosu capinda hasar MVP'si yok; oyuncu satirlari var.
  const view = buildRunReportView({ result: "defeat", wave: 6, kills: run.kills, stage: 1, creative: false, run, localSlot: 2, finale: false });
  assert.equal(view.mvp, undefined);
  assert.equal(view.players.length, 4);
});

test("solo: kosunun kulesi butun dalgalarin toplami, binlik ayiracla", () => {
  const run = defterRaporu({
    waves: 20,
    players: [{ slot: 0, name: "Melis", characterId: "archer", killsPerWave: 3, tower: kule("t", "Takipçi", 7), damagePerWave: 620 }]
  });
  assert.equal(describeRunMvp(run.mvp), "Takipçi · SV 7 · 12.400 hasar");
  const view = buildRunReportView({ result: "victory", wave: FINAL_WAVE, kills: run.kills, stage: 1, creative: false, run, localSlot: 0, finale: false });
  assert.equal(view.mvp, "Takipçi · SV 7 · 12.400 hasar");
  assert.equal(view.players, undefined, "solo'da oyuncu satiri yok");
  assert.equal(view.totals, "60 düşman · sızıntı yok · 20 temiz dalga");
  assert.equal(describeRunMvp(undefined), undefined);
});

test("deste: secim sirasiyla, yigilan kart tek kalemde, nadirlik secim basina", () => {
  const rare = cardCatalog.find((card) => getCardRarity(card) === "rare");
  const uncommon = cardCatalog.find((card) => getCardRarity(card) === "uncommon");
  const common = cardCatalog.find((card) => getCardRarity(card) === "common");
  const deck = buildRunDeck([uncommon.id, rare.id, "yok-boyle-kart", uncommon.id, common.id, 42, null]);
  assert.deepEqual(deck.cards.map((card) => [card.id, card.count, card.rarity]), [
    [uncommon.id, 2, "uncommon"],
    [rare.id, 1, "rare"],
    [common.id, 1, "common"]
  ]);
  assert.equal(deck.total, 4, "katalogda olmayan kimlik atlaniyor");
  assert.deepEqual(deck.rarities, { common: 1, uncommon: 2, rare: 1, epic: 0 });
  assert.equal(deck.rarities.common + deck.rarities.uncommon + deck.rarities.rare, deck.total);
  assert.deepEqual(buildRunDeck(undefined), { cards: [], total: 0, rarities: { common: 0, uncommon: 0, rare: 0, epic: 0 } });
  // Epik kart da kendi nadirligiyle sayiliyor.
  const epic = cardCatalog.find((card) => getCardRarity(card) === "epic");
  assert.deepEqual(buildRunDeck([epic.id]).rarities, { common: 0, uncommon: 0, rare: 0, epic: 1 });

  // Rapor yokken deste snapshot'tan; rapor gelince raporun kendi satirindan.
  const fallback = buildRunReportView({ result: "defeat", wave: 3, kills: 9, stage: 1, creative: false, localSlot: 0, finale: false, fallbackCardIds: [rare.id] });
  assert.equal(fallback.deck.cards[0].id, rare.id);
  assert.equal(fallback.totals, "9 düşman");
});

test("final: yalnizca son asama bu tarayicida temizlendiyse, ayri metinle", () => {
  const hepsi = Array.from({ length: STAGE_COUNT }, (_, index) => index + 1);
  assert.equal(isFinaleClear({ result: "victory", stage: STAGE_COUNT, creative: false, clearedStageIds: hepsi }), true);
  assert.equal(isFinaleClear({ result: "victory", stage: STAGE_COUNT, creative: true, clearedStageIds: hepsi }), false, "yaratici");
  assert.equal(isFinaleClear({ result: "victory", stage: STAGE_COUNT, creative: false, clearedStageIds: [1, 2] }), false, "co-op'ta kilitli son asama");
  assert.equal(isFinaleClear({ result: "defeat", stage: STAGE_COUNT, creative: false, clearedStageIds: hepsi }), false);
  assert.equal(isFinaleClear({ result: "victory", stage: 3, creative: false, clearedStageIds: hepsi }), false);

  const final = getRunReportHeading({ result: "victory", stage: STAGE_COUNT, finale: true });
  assert.equal(final.tone, "finale");
  assert.equal(final.title, "TÜM AŞAMALAR TAMAMLANDI");
  assert.equal(final.eyebrow, "5. AŞAMA · KATLANMA · FİNAL");
  assert.equal(final.finale.text, "5 aşamanın hepsi temizlendi.");
  assert.equal(final.finale.races, "Golem · Meka · Uzay Böceği · Düşmüş · Dördüncü Boyut");
  assert.deepEqual(getRunReportHeading({ result: "victory", stage: STAGE_COUNT, finale: false }), { tone: "victory", eyebrow: "5. AŞAMA · KATLANMA", title: "ZAFER" });
  assert.deepEqual(getRunReportHeading({ result: "defeat", stage: 3, finale: false }), { tone: "defeat", eyebrow: "3. AŞAMA · SÜRÜ", title: "YENİLGİ" });
  assert.equal(getRunReportHeading({ result: "defeat", finale: false }).eyebrow, "KOŞU RAPORU", "asama bilinmiyorsa uydurulmuyor");
});

test("dugmeler: Sonraki aşama yalnizca aciksa; zaferde buyuk dugme o, son asamada yok", () => {
  const base = { characterId: "zeynep", mapScale: 1, mode: "solo", now: 1_000 };
  const zafer = planRunReportActions({ ...base, result: "victory", stage: 2, clearedStageIds: [1, 2] });
  assert.equal(zafer.primary, "next");
  assert.equal(zafer.next.detail, "3. aşama · Sürü");
  assert.deepEqual(zafer.next.intent, { v: 1, mode: "solo", stage: 3, characterId: "zeynep", mapScale: 1, at: 1_000 });
  assert.deepEqual(zafer.retry.intent, { v: 1, mode: "solo", stage: 2, characterId: "zeynep", mapScale: 1, at: 1_000 });

  const yenilgi = planRunReportActions({ ...base, result: "defeat", stage: 2, clearedStageIds: [1] });
  assert.equal(yenilgi.next, undefined, "3. asama kilitli");
  assert.equal(yenilgi.primary, "retry");
  assert.equal(yenilgi.retry.label, "Tekrar");
  assert.equal(yenilgi.retry.detail, "2. aşama · Çelik Hat");

  const final = planRunReportActions({ ...base, result: "victory", stage: STAGE_COUNT, clearedStageIds: [1, 2, 3, 4, 5] });
  assert.equal(final.next, undefined, "son asamadan sonra asama yok");
  assert.equal(final.primary, "retry");

  // Co-op'ta katilan oyuncu: ev sahibinin asamasi kendisinde kilitliyse tekrar acik olana dusuyor.
  const katilan = planRunReportActions({ ...base, mode: "online", result: "defeat", stage: 4, clearedStageIds: [1] });
  assert.equal(katilan.retry.intent.stage, 2);
  assert.equal(katilan.retry.detail, "yeni oda · 2. aşama · Çelik Hat");
  assert.equal(katilan.next, undefined);

  const yaratici = planRunReportActions({ ...base, mode: "creative", result: "defeat", stage: 1, clearedStageIds: [] });
  assert.equal(yaratici.retry.intent.mode, "creative");
  assert.equal(yaratici.retry.detail, "yaratıcı · 1. aşama · Taş Kuşatma");
});

test("tekrar niyeti: dogrulaniyor, eskiyince ve bozulunca yok sayiliyor", () => {
  const now = 5_000_000;
  const intent = createQuickStartIntent({ mode: "solo", stage: 3, characterId: "archer", mapScale: 2 }, now);
  assert.deepEqual(parseQuickStartIntent(JSON.parse(JSON.stringify(intent)), now + 1500), intent, "depodan donus kaybetmiyor");
  assert.equal(parseQuickStartIntent(intent, now + QUICK_START_MAX_AGE_MS + 1), undefined, "eski niyet oyunu kendiliginden baslatmiyor");
  assert.equal(parseQuickStartIntent(intent, now - 60_000), undefined, "gelecekten gelen niyet");
  for (const bozuk of [
    null, undefined, "x", 42, [], {},
    { ...intent, v: 2 },
    { ...intent, mode: "ranked" },
    { ...intent, stage: 0 },
    { ...intent, stage: STAGE_COUNT + 1 },
    { ...intent, stage: 2.5 },
    { ...intent, characterId: "yok" },
    { ...intent, mapScale: 7 },
    { ...intent, at: "dun" }
  ]) {
    assert.equal(parseQuickStartIntent(bozuk, now), undefined, JSON.stringify(bozuk));
  }
  assert.equal(createQuickStartIntent({ mode: "solo", stage: 9, characterId: "archer", mapScale: 1 }, now), undefined);
  // Kilitli asama menude secilemez; niyet de secmiyor.
  assert.equal(resolveQuickStartStage({ stage: 4 }, [1, 2, 3]), 4);
  assert.equal(resolveQuickStartStage({ stage: 4 }, [1]), 2);
  assert.equal(resolveQuickStartStage({ stage: 1 }, []), 1);
});

test("kapi: ekran bir kez, kayit kosu basina bir kez; rapor sonradan gelirse bir tazeleme", () => {
  // Mesaj once: kayit ve ekran ayni anda; sonraki snapshot'lar ve yeniden gonderim bir sey yapmiyor.
  const mesajOnce = new MatchResultLatch();
  assert.deepEqual(mesajOnce.receive({ run: { id: "k1" } }), { open: true, record: true, refresh: false });
  assert.equal(mesajOnce.awaitingRun, false);
  assert.deepEqual(mesajOnce.receive({}), { open: false, record: false, refresh: false }, "mac sonrasi her snapshot");
  assert.deepEqual(mesajOnce.receive({ run: { id: "k1" } }), { open: false, record: false, refresh: false }, "yeniden baglanma / run:sync");

  // Snapshot once: ekran raporsuz aciliyor, run:sync bekleniyor; rapor gelince bir kayit, bir tazeleme.
  const snapshotOnce = new MatchResultLatch();
  assert.deepEqual(snapshotOnce.receive({}), { open: true, record: false, refresh: false });
  assert.equal(snapshotOnce.awaitingRun, true, "run:sync istenmeli");
  assert.deepEqual(snapshotOnce.receive({}), { open: false, record: false, refresh: false });
  assert.deepEqual(snapshotOnce.receive({ run: { id: "k2" } }), { open: false, record: true, refresh: true });
  assert.equal(snapshotOnce.awaitingRun, false);
  assert.deepEqual(snapshotOnce.receive({ run: { id: "k2" } }), { open: false, record: false, refresh: false });
  // Kimliksiz rapor kayda gitmiyor.
  assert.deepEqual(new MatchResultLatch().receive({ run: { id: "" } }), { open: true, record: false, refresh: false });
});

test("uctan uca: gercek odanin yenilgisi ve yeniden baglanmada gelen ayni rapor bir kez sayiliyor", () => {
  const room = createRoom("warrior");
  const yayinlar = [];
  room.broadcast = (type, payload) => yayinlar.push({ type, payload });
  room.clients = [];
  const player = room.state.players.get("p1");
  Object.assign(player, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0, ownedCardIds: [cardCatalog[0].id] });
  room.wave = 7;
  room.finishMatch("defeat");
  const mesaj = yayinlar.find((yayin) => yayin.type === "match:defeat").payload;
  assert.equal(mesaj.run.version, RUN_SUMMARY_VERSION);

  const latch = new MatchResultLatch();
  let kayit = 0;
  const gelen = (payload) => { if (latch.receive({ run: payload.run }).record) kayit += 1; };
  gelen(mesaj);
  const donen = { sessionId: "p1", sent: [], send(type, payload) { this.sent.push({ type, payload }); } };
  room.sendMatchResumeState(donen);
  gelen(donen.sent.find((sent) => sent.type === "match:defeat").payload);
  assert.equal(kayit, 1, "yeniden baglanmada gelen ayni kosu ikinci kez sayilmiyor");

  const slot = resolveLocalRunSlot(mesaj.run, { hasSnapshot: false, characterId: "warrior" });
  const view = buildRunReportView({ result: "defeat", wave: mesaj.wave, kills: mesaj.kills, stage: mesaj.stage, creative: false, run: mesaj.run, localSlot: slot, finale: false });
  assert.equal(view.heading.title, "YENİLGİ");
  assert.equal(view.strip[6].state, "death", "olunen dalga seritte");
  assert.equal(view.strip[7].state, "open");
  assert.equal(view.deck.cards[0].id, cardCatalog[0].id, "yerel oyuncunun destesi");
  assert.equal(view.goal, undefined, "kayit yazilmadan hedef satiri yok");
});

test("yuva: snapshot varsa ondan, yoksa operatorden", () => {
  const run = { players: [{ slot: 0, characterId: "zeynep" }, { slot: 2, characterId: "tank" }] };
  assert.equal(resolveLocalRunSlot(run, { hasSnapshot: true, snapshotSlot: 3, characterId: "tank" }), 3);
  assert.equal(resolveLocalRunSlot(run, { hasSnapshot: true, characterId: "tank" }), 0, "harness oyuncusu: yuva yok, 0");
  assert.equal(resolveLocalRunSlot(run, { hasSnapshot: false, characterId: "tank" }), 2);
  assert.equal(resolveLocalRunSlot(undefined, { hasSnapshot: false, characterId: "tank" }), 0);
  // Raporda bu operator yoksa kosuda degildin: yuva 0'in satiri sana verilmiyor.
  assert.equal(resolveLocalRunSlot(run, { hasSnapshot: false, characterId: "mage" }), -1);
  assert.equal(resolveLocalRunSlot({}, { hasSnapshot: false, characterId: "mage" }), 0, "listesiz rapor");
});

test("bitmis maca giris yok: yeni oyuncu da devralma da reddediliyor, rapor oynamayana gitmiyor", () => {
  const { room, yayinlar, player } = bitecekOda("warrior");
  assert.equal(room.hasJoinableSeat(), true, "suren macta bos koltuk var");
  room.finishMatch("victory");
  assert.equal(room.hasJoinableSeat(), false, "bitmis mac listede katilinabilir gorunmuyor");

  const yabanci = sahteIstemci("yabanci");
  assert.throws(() => room.joinStartedMatch(yabanci, { characterId: "mage", playerName: "C" }), /Maç bitti/);
  assert.equal(room.state.players.size, 1, "yeni koltuk acilmadi");
  assert.equal(yabanci.sent.length, 0, "rapor da, harita da gitmedi");

  // Kopan oyuncunun yuvasi devralinamiyor: kosusu ve destesi baskasina gecmez.
  player.connected = false;
  assert.throws(() => room.joinStartedMatch(yabanci, { characterId: "mage" }), /Maç bitti/);
  assert.equal(room.state.players.get("p1"), player, "yuva kendi oturum anahtarinda");
  assert.equal(room.state.players.has("yabanci"), false);

  // Istemcinin ikinci hatti: rapor bir yoldan gelse de yuva 1'in satiri yok.
  const run = yayinlar.find((yayin) => yayin.type === "match:victory").payload.run;
  assert.equal(getRunRecordKey(run, { slot: 1, characterId: "mage" }), undefined, "yabanciya solo rekor yok");
  assert.equal(getRunRecordKey(run, { slot: 0, characterId: "warrior" }), "1|warrior|1|arena@1", "oynayanin kaydi yerinde");
});

test("bitmis mac: bekleyen kart eli temizleniyor, geri donen oyuncuya gitmiyor", () => {
  const { room } = bitecekOda("warrior");
  room.pendingCardChoices.set("p1", cardCatalog.slice(0, 3));
  const donen = sahteIstemci("p1");
  room.sendPendingCardChoices(donen);
  assert.equal(donen.sent.filter((sent) => sent.type === "card:choices").length, 1, "mac surerken el gidiyor");

  room.wave = 7;
  room.finishMatch("defeat");
  assert.equal(room.pendingCardChoices.size, 0);
  donen.sent = [];
  room.sendMatchResumeState(donen);
  assert.equal(donen.sent.some((sent) => sent.type === "card:choices"), false, "raporun altina kart perdesi gitmiyor");
  assert.ok(donen.sent.some((sent) => sent.type === "match:defeat"), "rapor yine gidiyor");
});

test("bitmis mac son istemci gidince hemen kapaniyor; suren mac on dakika bekliyor", () => {
  const { room } = bitecekOda("warrior");
  room.roomId = "oda-bitecek";
  room.abandonCheckEnabled = true;
  let kapatma = 0;
  room.disconnect = async () => { kapatma += 1; };
  const realNow = Date.now;
  let now = 9_000_000;
  Date.now = () => now;
  try {
    room.update(16);
    now += 60_000;
    room.update(16);
    assert.equal(kapatma, 0, "suren mac erken kapandi");

    // Rapor okunurken istemci bagli: oda duruyor.
    room.finishMatch("victory");
    room.clients = [sahteIstemci("p1")];
    room.update(16);
    assert.equal(kapatma, 0);
    room.clients = [];
    room.update(16);
    now += 16;
    room.update(16);
    assert.equal(kapatma, 1, "bitmis bos oda beklemeye devam etti");
  } finally {
    Date.now = realNow;
  }
});

test("rapor dugmeleri: kendiliginden acilan raporda ilk dokunus beklemede", () => {
  assert.ok(RUN_REPORT_ACTIONABLE_AFTER_MS >= CARD_PICKABLE_AFTER_MS, "kart secimi kadar en az");
  assert.ok(RUN_REPORT_ACTIONABLE_AFTER_MS >= 320, "panelin acilisi bitmeden dugme basilmiyor");
  assert.ok(RUN_REPORT_ACTIONABLE_AFTER_MS < 1000, "bilincli dokunusu bekletmiyor");
});

test("ses: acilis tinisi hemen, rekor tinisi rozetle; ikisi de yalnizca kendi ekraninda", () => {
  assert.deepEqual(getRunReportCues({ result: "victory", celebrated: false, reducedMotion: false }), [{ atMs: 0, kind: "reportWin" }]);
  assert.deepEqual(getRunReportCues({ result: "defeat", celebrated: true, reducedMotion: false }), [
    { atMs: 0, kind: "reportLoss" },
    { atMs: RUN_REPORT_BADGE_DELAY_MS, kind: "reportRecord" }
  ]);
  const still = getRunReportCues({ result: "defeat", celebrated: true, reducedMotion: true });
  assert.ok(still[1].atMs < RUN_REPORT_BADGE_DELAY_MS, "hareket azaltmada rozet yerinde; tini beklemiyor");
  for (const kind of ["reportWin", "reportLoss", "reportRecord"]) {
    const rule = FEEDBACK_KIND_RULES[kind];
    assert.equal(rule.ownPriority, 1, kind);
    assert.equal(rule.teammateSound, false, `${kind} takim arkadasinda calmaz`);
    assert.equal(rule.shakePx, 0, `${kind} kamerayi oynatmaz`);
    assert.equal(rule.vibrateMs, 0, `${kind} titretmez`);
    assert.equal(rule.channel, "none", `${kind} gorsel butceye girmez`);
  }
});

test("seri adlari arenadaki bannerla ayni ve her kademe icin var", async () => {
  const scene = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const run = defterRaporu({ waves: 1, players: [{ slot: 0, name: "A", characterId: "zeynep" }], streak: { slot: 0, tier: "granted", wave: 1 } });
  for (const rule of KILL_STREAK_RULES) {
    const moment = pickRunMoment({ ...run, players: [{ ...run.players[0], bestStreakTier: rule.tier }], bestStreak: { tier: rule.tier, slot: 0, wave: 1 } }, { localSlot: 0 });
    const label = moment.text.split(" ")[0];
    assert.ok(scene.includes(`label: "${label}"`), `${rule.tier} banner adi ${label} degil`);
  }
});

test("kaynak: rapor DOM'da, Tekrar niyet + yeniden yukleme, menu niyeti bir kez okuyor", async () => {
  const scene = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  // Phaser sahnesi yeniden baslatilmiyor: durumu alan baslaticilarinda.
  assert.equal(/scene\.restart\(/.test(scene), false);
  assert.ok(scene.includes("renderRunReport("), "rapor DOM'da ciziliyor");
  assert.equal(scene.includes('"ANA MENÜ"'), false, "eski Phaser sonuc katmani kalkti");
  assert.ok(scene.includes("saveQuickStartIntent("));
  assert.ok(scene.includes("window.location.reload()"));
  assert.ok(scene.includes("recordRun("), "kayit tek kapidan");

  const quick = (await readFile(new URL("../apps/web/src/quick-start.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(quick.includes('"karayel_quick_start_v1"'), "surumlu anahtar");
  // Ilk parca dosya basi (yorum); depoya dokunan her fonksiyon try/catch icinde.
  const chunks = quick.split(/\nexport function /).slice(1).filter((chunk) => chunk.includes("sessionStorage"));
  assert.equal(chunks.length, 2);
  for (const chunk of chunks) assert.ok(/try \{[\s\S]*sessionStorage[\s\S]*\} catch/.test(chunk), chunk.slice(0, 40));
  // Okuma once siliyor, sonra ayristiriyor: bozuk niyet bir kez yok sayiliyor, dongu yok.
  const take = quick.slice(quick.indexOf("export function takeQuickStartIntent"));
  assert.ok(take.indexOf("removeItem") < take.indexOf("parseQuickStartIntent("));

  const menu = (await readFile(new URL("../apps/web/src/menu-ui.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(menu.includes("takeQuickStartIntent()"));
  assert.ok(menu.includes("resolveQuickStartStage("), "kilitli asama secilmiyor");

  // Oyuncu adi kullanici girdisi: rapor HTML'e kacislanmadan yazmiyor.
  const ui = (await readFile(new URL("../apps/web/src/run-report-ui.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(ui.includes("escapeHtml(player.name)"));
  assert.equal(/\$\{player\.name\}/.test(ui), false);
});

test("kaynak: raporun korumalari (dokunus, kayit bekleme, odak, olcek, gec giris, mobil)", async () => {
  const scene = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const between = (start, end) => scene.slice(scene.indexOf(start), scene.indexOf(end, scene.indexOf(start)));

  // Kaza dokunusu: acilis ani bir kez, esik hareket ayarindan bagimsiz.
  const open = between("private openRunReport(", "private recordRunResult(");
  assert.ok(open.includes("this.runReportOpenedAt = performance.now();"));
  assert.ok(open.indexOf("this.matchResultShown = true;") < open.indexOf("this.runReportOpenedAt = performance.now();"), "ilk acilista, tazelemede degil");
  const render = between("private renderMatchReport(", "private chooseRunReportAction(");
  assert.ok(render.includes("actionableAt: this.runReportOpenedAt + RUN_REPORT_ACTIONABLE_AFTER_MS"));
  assert.ok(render.includes("focus: first"), "odak hareketten bagimsiz");
  const ui = (await readFile(new URL("../apps/web/src/run-report-ui.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const click = ui.slice(ui.indexOf('querySelectorAll<HTMLButtonElement>("[data-report-action]").forEach((button) => {\n    button.addEventListener'));
  assert.ok(click.indexOf("performance.now() < options.actionableAt") < click.indexOf("choose("), "erken dokunus secime ulasmiyor");
  assert.ok(ui.includes("options.focus || hadFocus"));
  assert.equal(ui.includes("if (options.animate) {\n    // Odak"), false, "odak canlanmaya bagli degil");

  // Rapor yoldayken yeniden yukleme kaydi kaybetmiyor.
  const choose = between("private chooseRunReportAction(", "private showCardChoices(");
  assert.ok(choose.includes("if (this.matchResultLatch.awaitingRun) {"));
  assert.ok(choose.includes("this.runReportReloadPending = true;"));
  const handle = between("private handleMatchResult(", "private openRunReport(");
  const pending = handle.indexOf("this.runReportReloadPending && !this.matchResultLatch.awaitingRun");
  assert.ok(pending > handle.indexOf("this.recordRunResult(summary)"), "once kayit");
  assert.ok(pending < handle.indexOf("this.renderMatchReport(false)"), "sonra yukleme; tazeleme dugmeyi yeniden acmadan");

  // Yazilamayan kayit kutlanmiyor.
  assert.ok(render.includes('outcome?.status === "recorded" && outcome.saved ? outcome.merge : undefined'));

  // Tekrar oynanan olcekte: arena olcegi tasimiyor.
  assert.ok(render.includes("mapScale: this.runMapScale"));
  assert.equal(render.includes("mapScale: this.selectedMapData.scale"), false);
  assert.ok(scene.includes("this.runMapScale = this.selectedMapData.scale;"), "olcek syncMap'ten once saklaniyor");

  // Mac bittikten sonra giren istemci kaydetmiyor, asama acmiyor.
  assert.ok(between("private queueSnapshot(", "private hydrateSnapshot(").includes("if (!snapshot.result) this.liveSnapshotSeen = true;"));
  assert.ok(between("private recordRunResult(", "private isArchiveSandbox(").includes("!this.liveSnapshotSeen) return;"));
  assert.ok(open.includes('result === "victory" && this.liveSnapshotSeen ? markStageCleared('));

  // Raporun altinda kart perdesi kurulmuyor, arsive gorulmus yazilmiyor.
  const draft = between("private showCardChoices(", "private scheduleCardRevealCues(");
  assert.ok(draft.indexOf("if (this.matchResultShown) return;") < draft.indexOf("this.cardArchiveLatch.resolve("));

  // Bitmis odadan dusen okuyucu 18 sn yeniden baglanmaya calismiyor.
  assert.ok(scene.includes("if (this.matchResultShown && this.matchReport?.run) {\n        clearActiveLobbyRoom(room.roomId);"));

  // Menu: oyuncu dokununca gec gelen kendiliginden baslatma iptal.
  const menu = (await readFile(new URL("../apps/web/src/menu-ui.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(menu.includes('const cancel = () => window.removeEventListener("karayel:phaser-ready", launch);'));
  assert.ok(menu.includes('root.addEventListener("pointerdown", cancel, { capture: true, once: true });'));
  assert.ok(menu.includes('root.addEventListener("keydown", cancel, { capture: true, once: true });'));

  // Mobil: tam ekran katman yenileme hareketine donmuyor, perde her karede bulaniklik hesaplamiyor.
  const css = (await readFile(new URL("../apps/web/src/style.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const block = (selector) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
  assert.ok(/touch-action: none;/.test(block("#run-report-root")));
  assert.ok(/overscroll-behavior: none;/.test(block("#run-report-root")));
  assert.ok(/touch-action: pan-y;/.test(block(".run-report__body")), "govde kendi kaydirmasini koruyor");
  assert.equal(/backdrop-filter/.test(block(".run-report__veil")), false);
});
