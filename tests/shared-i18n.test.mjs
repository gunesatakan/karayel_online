/**
 * Paylasilan metin ureticilerinin dili (packages/shared/src/i18n).
 *
 * Mac raporu, dalga karnesi, kart perdesi basligi, nisan ve kozmetik
 * bildirimleri, geri bildirim metinleri `lt(tr, en)` ile iki dilde. Varsayilan
 * Turkce ve sunucu dili hic degistirmiyor: Turkce cikti eskisiyle birebir.
 * Istemci `setSharedLocale("en")` dediginde ayni ureticiler Ingilizce yaziyor;
 * Ingilizce metinde Turkce harf kalmiyor.
 *
 * Katalog metinleri (kart, kule, asama, operator rolu, unvan etiketleri)
 * burada degil: istemci onlari kendi katmaninda ceviriyor (catalog-locale.ts),
 * bu yuzden testlerde ya ASCII adlar veriliyor ya da o alanlar disarida.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FINAL_WAVE,
  RunLedger,
  buildCosmeticsView,
  buildMasteryReportView,
  buildPlayerLines,
  buildRunReportView,
  buildWaveReportCard,
  describeCosmeticUnlock,
  describeSynergyPreview,
  findNewCosmetics,
  formatBadgeNotice,
  formatWaveHpStep,
  getCardDraftTitle,
  getChampionDownText,
  getComboStampText,
  getExecuteRejectText,
  getInventoryEquipRejectedCue,
  getKillAssistText,
  getKillStreakBuffText,
  getMelisZoneAffectedTowerIds,
  getMelisZoneEffectText,
  getRiskyInvestmentNoticeText,
  getRunMapKey,
  getServerLinkJoinedText,
  getServerLinkMaturedText,
  getSharedLocale,
  getShopPurchaseCue,
  getStage,
  getStructureRepairCue,
  getSynergyCulpritNotice,
  getSynergyStampText,
  getTowerLevelLabel,
  getUltimateStampText,
  getUltimateTeamChipText,
  getUltimateUpgradeCue,
  getWaveClearStampText,
  mergeRecord,
  nextGoal,
  planRunReportActions,
  setSharedLocale,
  shopCatalog
} from "../packages/shared/dist/index.js";

const TURKISH_LETTERS = /[ğüşıöçĞÜŞİÖÇ]/;

/** Ayni ureticiyi iki dilde calistirir; dil her durumda Turkceye donuyor. */
function inBoth(build) {
  try {
    setSharedLocale("tr");
    const tr = build();
    setSharedLocale("en");
    const en = build();
    return { tr, en };
  } finally {
    setSharedLocale("tr");
  }
}

/** Nesnenin butun metin yapraklari (ic ice dahil). */
function texts(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(texts);
}

function assertEnglish(value, context) {
  for (const text of texts(value)) {
    assert.ok(!TURKISH_LETTERS.test(text), `${context}: Ingilizce metinde Turkce harf var: "${text}"`);
  }
}

/** Defterden gercek bir kosu raporu (tek oyuncu, ASCII kule adi). */
function soloRun({ waves, leaks = {}, died = false }) {
  const ledger = new RunLedger();
  const tower = { id: "t1", level: 7, definition: { id: "t1-def", name: "Tracker" } };
  for (let wave = 1; wave <= waves; wave += 1) {
    for (let index = 0; index < (leaks[wave] ?? 0); index += 1) {
      ledger.recordLeak({ air: wave === 5 || wave === 10, absorbed: false, hpLost: 8 });
    }
    for (let kill = 0; kill < 3; kill += 1) ledger.recordKill(0);
    ledger.recordTowerDamage(tower, 0, 620);
    ledger.closeWave(wave, { died: died && wave === waves, slots: [0] });
  }
  return ledger.summarize({
    id: "dil-1",
    result: died ? "defeat" : "victory",
    stage: 1,
    wave: waves,
    creative: false,
    mapKey: getRunMapKey(1),
    players: [{ slot: 0, name: "Ali", characterId: "zeynep", cards: [] }]
  });
}

test("varsayilan dil Turkce; inBoth sonunda Turkceye donuyor", () => {
  assert.equal(getSharedLocale(), "tr");
  inBoth(() => getCardDraftTitle(3));
  assert.equal(getSharedLocale(), "tr");
});

test("kosu raporu: Turkce satirlar ayni, Ingilizcede Turkce harf yok", () => {
  const run = soloRun({ waves: 13, died: true, leaks: { 5: 2, 9: 1, 13: 3 } });
  const merge = mergeRecord({ bestWave: 11, clears: 0, bestStars: 0, bestCleanWaves: 4, runs: 2 }, run);
  const build = (stage) => buildRunReportView({ result: "defeat", wave: 13, kills: 39, stage, creative: false, run, localSlot: 0, merge, finale: false });
  const { tr, en } = inBoth(() => build(undefined));

  assert.equal(tr.heading.eyebrow, "KOŞU RAPORU");
  assert.equal(tr.heading.title, "YENİLGİ");
  assert.equal(`${tr.hero.text}${tr.badge.separator}${tr.badge.text}`, "Dalga 13/20 — YENİ REKOR (önceki 11)");
  assert.equal(tr.strip[4].label, "5. dalga (hava): 2 sızıntı (2 hava)");
  assert.equal(tr.strip[12].label, "13. dalga: düştü · 3 sızıntı");
  assert.equal(tr.strip[14].label, "15. dalga (karışık hava): oynanmadı");
  assert.equal(tr.totals, "39 düşman · 6 sızıntı · 10 temiz dalga");
  assert.equal(tr.mvp, "Tracker · SV 7 · 8.060 hasar");
  assert.equal(tr.goal, "Sıradaki hedef: Dalga 14 · ★★ için 16 temiz dalga");

  assertEnglish(en, "kosu raporu");
  assert.equal(en.heading.eyebrow, "RUN REPORT");
  assert.equal(en.heading.title, "DEFEAT");
  assert.equal(`${en.hero.text}${en.badge.separator}${en.badge.text}`, "Wave 13/20 — NEW RECORD (was 11)");
  assert.equal(en.strip[4].label, "Wave 5 (air): 2 leaks (2 air)");
  assert.equal(en.strip[12].label, "Wave 13: fell · 3 leaks");
  assert.equal(en.totals, "39 enemies · 6 leaks · 10 clean waves");
  assert.equal(en.mvp, "Tracker · LV 7 · 8,060 damage");
  assert.equal(en.goal, "Next goal: Wave 14 · 16 clean waves for ★★");

  // Asamali baslik: asama adi katalogdan (istemci ceviriyor); kalan kisim dile gore.
  const staged = inBoth(() => build(1));
  const stageName = getStage(1).name;
  assert.equal(staged.tr.heading.eyebrow, `1. AŞAMA · ${stageName.toLocaleUpperCase("tr-TR")}`);
  assert.equal(staged.en.heading.eyebrow, `STAGE 1 · ${stageName.toLocaleUpperCase("en-US")}`);
});

test("kosu raporu: dugmeler, co-op satiri ve hedef satiri iki dilde", () => {
  const actions = inBoth(() => planRunReportActions({
    result: "victory", stage: 1, mode: "online", characterId: "zeynep", mapScale: 1, clearedStageIds: [1], now: 1000
  }));
  const stageName = (id) => getStage(id).name;
  assert.equal(actions.tr.retry.label, "Tekrar");
  assert.equal(actions.tr.retry.detail, `yeni oda · 1. aşama · ${stageName(1)}`);
  assert.equal(actions.tr.next.label, "Sonraki aşama");
  assert.equal(actions.en.retry.label, "Retry");
  assert.equal(actions.en.retry.detail, `new room · Stage 1 · ${stageName(1)}`);
  assert.equal(actions.en.next.label, "Next stage");

  const coop = {
    players: [
      { slot: 0, name: "Ali", characterId: "zeynep", kills: 1, assists: 2, cards: [], topTower: { name: "Tracker", level: 4, damage: 900 } },
      { slot: 1, name: "Ece", characterId: "warrior", kills: 30, cards: [], bestStreakTier: "rampage" }
    ]
  };
  const lines = inBoth(() => buildPlayerLines(coop, 0));
  assert.deepEqual(lines.tr.map((line) => line.detail), ["1 öldürme · 2 asist · Tracker SV 4", "30 öldürme · kule hasarı yok · RAMPAGE"]);
  assert.deepEqual(lines.en.map((line) => line.detail), ["1 kill · 2 assists · Tracker LV 4", "30 kills · no tower damage · RAMPAGE"]);

  const goal = inBoth(() => nextGoal({ bestWave: 20, clears: 3, bestStars: 3, bestCleanWaves: 20, runs: 5 }));
  assert.equal(goal.tr, "Sıradaki hedef: ★★★ tamam · başka bir operatörle dene");
  assertEnglish(goal.en, "hedef");
});

test("dalga karnesi: ciplerin metni ve erisilebilir adi iki dilde", () => {
  const build = () => buildWaveReportCard({
    wave: 6,
    record: { w: 6, l: 2, s: 1, k: 23, p: [23], c: 0, h: 16 },
    localSlot: 0,
    coop: false,
    creative: false,
    gold: 412,
    health: { health: 20, maxHealth: 100 }
  });
  const { tr, en } = inBoth(build);
  assert.deepEqual(tr.chips.map((chip) => chip.text), ["2 sızıntı", "23 öldürme", "◆ +412"]);
  assert.equal(tr.highlight.text, "Kıl payı · nexus %20 canla dayandı");
  assert.equal(tr.label, "Dalga 6 karnesi: 2 sızıntı, 1 tanesini kalkan tuttu, 23 öldürme, +412 altın. Kıl payı · nexus %20 canla dayandı");
  assertEnglish(en, "dalga karnesi");
  assert.deepEqual(en.chips.map((chip) => chip.text), ["2 leaks", "23 kills", "◆ +412"]);
  assert.equal(en.highlight.text, "Close call · nexus held at 20% HP");

  const clean = inBoth(() => buildWaveReportCard({ wave: 10, record: { w: 10, l: 0, k: 5, p: [5], c: 10 }, localSlot: 0, coop: false, creative: false }));
  assert.equal(clean.tr.chips[0].text, "Kusursuz ×10");
  assert.equal(clean.tr.chips[0].label, "10 dalga üst üste kusursuz");
  assert.equal(clean.en.chips[0].text, "Flawless ×10");
  assertEnglish(clean.en, "temiz karne");
});

test("kart perdesi, dalga damgasi, sampiyon ve agir dalga satiri", () => {
  const draft = inBoth(() => [getCardDraftTitle(4), getCardDraftTitle(undefined)]);
  assert.deepEqual(draft.tr, ["DALGA 4 ÖDÜLÜ", "DALGA ÖDÜLÜ"]);
  assert.deepEqual(draft.en, ["WAVE 4 REWARD", "WAVE REWARD"]);

  const stamp = inBoth(() => getWaveClearStampText({ wave: 4, finalWave: FINAL_WAVE, kills: 12, gold: 80, bonus: 40 }));
  assert.deepEqual(stamp.tr, {
    title: "DALGA 4/20 TEMİZLENDİ",
    lines: [{ kind: "kills", text: "12 düşman" }, { kind: "gold", text: "+80 ◆" }, { kind: "bonus", text: "+40 dalga bonusu" }]
  });
  assert.equal(stamp.en.title, "WAVE 4/20 CLEARED");
  assertEnglish(stamp.en, "dalga damgasi");

  const hp = inBoth(() => formatWaveHpStep(1.4925));
  assert.equal(hp.tr, "Can ×1,49");
  assert.equal(hp.en, "HP ×1.49");

  const champion = inBoth(() => getChampionDownText({ ms: 10_560, prevMs: 12_100 }));
  assert.equal(champion.tr, "ŞAMPİYON DEVRİLDİ · 10,6 sn (önceki 12,1)");
  assert.equal(champion.en, "CHAMPION DOWN · 10.6 s (was 12.1)");
});

test("nisan bildirimi, kozmetik kosulu ve ustalik satiri", () => {
  // Nisan adi katalogdan (istemci ceviriyor); burada yalnizca cerceve.
  const notice = inBoth(() => formatBadgeNotice(["ilk-zafer", "kiyim"]));
  assert.equal(notice.tr, "Yeni nişan: İlk Zafer +1");
  assert.ok(notice.en.startsWith("New badge: "), notice.en);

  const unlock = inBoth(() => [
    describeCosmeticUnlock(undefined),
    describeCosmeticUnlock({ kind: "mastery", characterId: "zeynep", level: 5 }),
    describeCosmeticUnlock({ kind: "mastery", level: 3 })
  ]);
  assert.deepEqual(unlock.tr, ["Açık", "ZentaX ustalığı 5", "Herhangi bir operatörde ustalık 3"]);
  assert.deepEqual(unlock.en, ["Unlocked", "ZentaX mastery 5", "Mastery 3 on any operator"]);

  const fresh = inBoth(() => findNewCosmetics({ masteryLevels: {}, badges: {} }, { masteryLevels: { zeynep: 10 }, badges: {} }));
  assert.ok(fresh.tr.includes("Taç süsü"));
  assert.ok(fresh.tr.some((label) => label.startsWith("Unvan: ")));
  assert.ok(fresh.en.includes("Crown ornament"));
  assert.ok(fresh.en.some((label) => label.startsWith("Title: ")));

  const view = inBoth(() => buildCosmeticsView({ stamp: "klasik", crown: true }, { masteryLevels: {}, badges: {} }));
  assertEnglish(view.en.titles.map((title) => title.condition).filter((text) => !text.endsWith(" badge")), "kozmetik kosullari");

  const mastery = inBoth(() => buildMasteryReportView({
    characterId: "zeynep", operator: "ZentaX", beforePoints: 0, afterPoints: 140, gained: { waves: 18, firstClear: 30, stars: 0 }, badgePoints: 0
  }));
  assertEnglish(mastery.en, "ustalik");
  assert.ok(mastery.tr.headline.startsWith("Ustalık "));
  assert.ok(mastery.en.headline.startsWith("Mastery "));
});

test("geri bildirim: onay, ulti, seri, asist, takim ve sinerji metinleri", () => {
  const item = shopCatalog[0];
  const cues = inBoth(() => [
    getShopPurchaseCue({ itemId: item.id, toInventory: true }, { equippableTowers: 3 }).text,
    getShopPurchaseCue({ itemId: item.id }, { placementPending: true }).text,
    getInventoryEquipRejectedCue({ itemId: item.id, reason: "towerFull" }).text,
    getStructureRepairCue({ towerId: "t1", cost: 40 }).text,
    getUltimateUpgradeCue({ level: 2 }).text
  ]);
  assert.equal(cues.tr[0], `${item.name} envantere eklendi · 3 kulene takılabilir`);
  assert.equal(cues.tr[3], "Yapı onarıldı (40g)");
  // Esya adi katalogdan; cumlenin geri kalani Ingilizce.
  assertEnglish(cues.en.map((text) => text.replace(item.name, "")), "onaylar");
  assert.equal(cues.en[3], "Structure repaired (40g)");

  const ultimate = inBoth(() => [
    getUltimateStampText({ kind: "column", hits: 6, kills: 4, best: 6 }),
    getUltimateStampText({ kind: "heal", hits: 0, kills: 0, heal: 30 }),
    getUltimateTeamChipText("Ece", { kind: "sympathy", hits: 3, kills: 0 })
  ]);
  assert.deepEqual(ultimate.tr[0], { title: "SÜTUN · 6 isabet · 4 öldü", grade: { tier: "perfect", text: "MÜKEMMEL NİŞAN" } });
  assert.equal(ultimate.tr[2], "Ece ULTİ · 3 bağlandı");
  assert.equal(ultimate.en[0].grade.text, "PERFECT AIM");
  assert.equal(ultimate.en[2], "Ece ULTIMATE · 3 linked");
  // Ulti adi etiket haritasindan (istemci ceviriyor); sayilar ve fiiller Ingilizce.
  assert.equal(ultimate.en[0].title.replace(/^\S+ · /, ""), "6 hits · 4 killed");
  assert.equal(ultimate.en[1].title.replace(/^.+? · /, ""), "+30 base HP · none slowed");

  const streak = inBoth(() => getKillStreakBuffText("rampage"));
  assert.ok(streak.tr.includes("%") && streak.tr.endsWith(" sn"), streak.tr);
  assertEnglish(streak.en, "seri");
  assert.match(streak.en, /^\+\d+% damage/);

  const misc = inBoth(() => [
    getComboStampText({ kind: "markOverdrive" }),
    getComboStampText({ kind: "sweepKills", kills: 4 }),
    getComboStampText({ kind: "luckyWindow" }),
    getKillAssistText("mark", "Ali", "Ece"),
    getKillAssistText("freeze", undefined, "Ece"),
    getServerLinkJoinedText("AttackLord"),
    getServerLinkMaturedText(5),
    getRiskyInvestmentNoticeText("Ali", 10, 400),
    getSynergyStampText("isolationLost"),
    getSynergyCulpritNotice("formationBroken", "Ece"),
    getExecuteRejectText("immune"),
    getExecuteRejectText("invalid"),
    getTowerLevelLabel(10, true)
  ]);
  assert.deepEqual(misc.tr.slice(0, 4), ["İŞARET → OVERDRIVE", "Tarama: 4 öldü", misc.tr[2], "Ali işaretledi → Ece bitirdi"]);
  assert.deepEqual(misc.tr[5], { title: "AttackLord'un Sunucusu", detail: "kulene bağlandı" });
  assert.equal(misc.tr[12], "SV 10 · KADEME 3");
  assertEnglish(misc.en, "geri bildirim");
  assert.equal(misc.en[3], "Ali marked → Ece finished");
  assert.equal(misc.en[4], "Your teammate froze → Ece finished");
  assert.deepEqual(misc.en[5], { title: "AttackLord's Server", detail: "linked to your tower" });
  assert.equal(misc.en[12], "LV 10 · TIER 3");

  const preview = inBoth(() => describeSynergyPreview(
    { formation: undefined, isolationEligible: true, isolated: true, breaksIsolation: [{ id: "a" }], breaksFormation: [{ id: "b" }] },
    () => "Server"
  ));
  assert.equal(preview.tr.warning, "Bozar: Server, Dizilim");
  assert.equal(preview.en.warning, "Breaks: Server, Formation");
  assertEnglish(preview.en, "sinerji onizlemesi");
});

test("Melis ruh hali satirlari: her kule ve bolge Ingilizce", () => {
  for (const id of getMelisZoneAffectedTowerIds()) {
    for (const zone of ["approval", "balanced", "stress"]) {
      const { tr, en } = inBoth(() => getMelisZoneEffectText(id, zone));
      assert.ok(typeof tr === "string" && tr.length > 0, `${id}/${zone} Turkce`);
      assert.notEqual(en, tr, `${id}/${zone} Ingilizcesi yok`);
      assertEnglish(en, `${id}/${zone}`);
    }
  }
  assert.equal(inBoth(() => getMelisZoneEffectText("yok", "stress")).en, undefined);
});
