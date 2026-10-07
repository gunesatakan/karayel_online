/**
 * Arayuz dili (apps/web/src/i18n.ts): Turkce kaynak, Ingilizce ceviri.
 *
 * Ingilizce sozlukte her Turkce anahtar var ve yer tutuculari ayni; eksik
 * anahtar ekranda Turkceye duser ama burada liste olarak yakalaniyor. Kule
 * paneli ve brifing secili dilde yaziyor; yuzde isareti Turkcede onde
 * ("%15"), Ingilizcede arkada ("15%"), ondalik ayraci dile gore.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { importWebModule } from "./helpers/web-module.mjs";

const i18n = await importWebModule("tests/fixtures/i18n-entry.ts");
const { t, tMaybe, setLocaleForTest, getLocale, upper, lower, tr, en, buildTowerSheetModel, getTutorialCopy, TUTORIAL_STEPS } = i18n;
// Istemcinin acilisi gibi: katalog metinleri dile baksin (kule panelindeki hasar tipi adi da).
i18n.installCatalogLocale();

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test("Ingilizce sozluk eksiksiz; yer tutucular Turkceyle ayni, fazladan anahtar yok", () => {
  const missing = Object.keys(tr).filter((key) => !(key in en));
  assert.deepEqual(missing, [], "Ingilizcesi olmayan anahtarlar");
  const extra = Object.keys(en).filter((key) => !(key in tr));
  assert.deepEqual(extra, [], "Turkcede olmayan Ingilizce anahtarlar");
  for (const key of Object.keys(tr)) {
    assert.deepEqual(placeholders(en[key]), placeholders(tr[key]), `${key} yer tutuculari farkli`);
    assert.ok(en[key].trim().length > 0, `${key} bos`);
  }
});

test("t: varsayilan Turkce, parametre dolduruyor, bilinmeyen anahtar tMaybe'de undefined", () => {
  setLocaleForTest("tr");
  assert.equal(getLocale(), "tr");
  assert.equal(t("tutorial.count", { n: 2, total: 6 }), "BRİFİNG 2/6");
  assert.equal(t("format.percent", { v: 15 }), "%15");
  assert.equal(tMaybe("sheet.status.burn"), "Yanma");
  assert.equal(tMaybe("sheet.status.yok-boyle"), undefined);
  assert.equal(upper("istasyon"), "İSTASYON");
  assert.equal(lower("ISI"), "ısı");

  setLocaleForTest("en");
  assert.equal(t("tutorial.count", { n: 2, total: 6 }), "BRIEFING 2/6");
  assert.equal(t("format.percent", { v: 15 }), "15%");
  assert.equal(upper("istasyon"), "ISTASYON");
  assert.equal(lower("HEAT"), "heat");
  setLocaleForTest("tr");
});

const sheetInput = {
  towerId: "t1", definitionId: "warrior-1", characterId: "warrior", name: "Takipçi", level: 4, color: "#22c55e",
  stats: {
    id: "t1", c: 40, dps: 10, k: 3,
    d: { v: 12, b: 10 }, f: { v: 1.25, b: 1 }, r: { v: 120, b: 120 },
    cc: { v: 0.15, b: 0.05 }, cm: { v: 1.5, b: 1.5 }, tr: { v: 200, b: 180 }, ac: { v: 6, b: 8 }, ps: { v: 300, b: 300 }
  },
  live: { temperature: 20, ammo: 10, maxAmmo: 40, damageDealt: 1234, currentDps: 12.5, performance: 0.5 },
  notes: []
};

test("kule paneli Ingilizcede: etiketler, birimler, yuzde ve ondalik ayraci", () => {
  setLocaleForTest("en");
  try {
    const model = buildTowerSheetModel(sheetInput);
    const figure = (key) => model.figures.find((entry) => entry.key === key);
    assert.equal(figure("f").label, "Fire rate");
    assert.match(figure("f").value, /^\d+\.\d{2}\/s$/, "Ingilizce ondalik nokta ve /s");
    assert.equal(figure("r").label, "Range");
    assert.match(figure("r").value, /tiles$/);
    assert.match(model.subtitle, /Lv 4\/10 · Tier I/);
    const attack = model.sections.find((section) => section.id === "attack");
    assert.equal(attack.title, "Attack");
    const crit = attack.rows.find((row) => row.key === "cc");
    assert.equal(crit.value, "15%");
    assert.equal(crit.bonus, "+10%");
    assert.equal(crit.detail[0].label, "Base");
    const heat = model.sections.find((section) => section.id === "resources").bars.find((bar) => bar.key === "heat");
    assert.equal(heat.label, "Heat");
    assert.equal(heat.value, "20%");
    // Turkce metin kalmadi (kule adi ve kod adlari haric).
    const texts = [model.subtitle, ...model.figures.flatMap((row) => [row.label, row.sub ?? ""]),
      ...model.sections.flatMap((section) => [section.title, section.summary, ...section.rows.flatMap((row) => [row.label, row.value, row.sub ?? ""]), ...section.bars.flatMap((bar) => [bar.label, bar.sub ?? ""])])];
    const turkish = texts.filter((text) => /[ğüşıöçĞÜŞİÖÇ]/.test(text));
    assert.deepEqual(turkish, [], "Ingilizce panelde Turkce metin");
  } finally {
    setLocaleForTest("tr");
  }
});

test("kule paneli Turkcede eskisi gibi: %15, virgul, kare", () => {
  setLocaleForTest("tr");
  const model = buildTowerSheetModel(sheetInput);
  const rate = model.figures.find((entry) => entry.key === "f");
  assert.equal(rate.label, "Atış hızı");
  assert.match(rate.value, /^\d+,\d{2}\/sn$/);
  const crit = model.sections.find((section) => section.id === "attack").rows.find((row) => row.key === "cc");
  assert.equal(crit.value, "%15");
  assert.equal(crit.bonus, "+%10");
});

test("brifing metinleri iki dilde; Ingilizcede Turkce harf yok", () => {
  for (const locale of ["tr", "en"]) {
    setLocaleForTest(locale);
    for (const id of TUTORIAL_STEPS) {
      for (const open of [false, true]) {
        const copy = getTutorialCopy(id, open);
        assert.ok(copy.title && copy.body, `${locale}/${id}`);
        if (locale === "en") assert.doesNotMatch(`${copy.title} ${copy.body} ${copy.ack ?? ""}`, /[ğüşıöçĞÜŞİÖÇ]/, `${id} Ingilizcede Turkce`);
      }
    }
  }
  setLocaleForTest("tr");
  assert.equal(getTutorialCopy("logistics", false).ack, "ANLAŞILDI");
});

/* ------------------------------------------------------------------ */
/* Katalog metinleri (catalog-locale.ts)                               */
/* ------------------------------------------------------------------ */

const turkishLetters = /[ğüşıöçĞÜŞİÖÇ]/;

test("katalog: her kart, esya, kule, operator, beceri, asama, isci, nisan ve unvanin Ingilizcesi var", () => {
  setLocaleForTest("tr");
  assert.deepEqual(i18n.listMissingCatalogTranslations(), [], "Ingilizcesi eksik katalog kayitlari");
});

test("katalog: ayni nesne dile gore okunuyor; Turkce kaynak bozulmuyor", () => {
  const card = i18n.getCardDefinition("buz-kirigi");
  setLocaleForTest("tr");
  assert.equal(card.name, "Buz Kırığı");
  setLocaleForTest("en");
  try {
    assert.equal(card.name, "Ice Shard");
    assert.doesNotMatch(card.description, turkishLetters);
    // Yayilan kopya o anki dili tasiyor.
    assert.equal({ ...card }.name, "Ice Shard");
    assert.equal(i18n.damageTypeCodex.physical.name, "Physical");
    assert.equal(i18n.cardRarityLabels.rare, "rare");
    assert.equal(i18n.stageCatalog.find((entry) => entry.id === 1).name, "Stone Siege");
    const mastery = i18n.TITLE_CATALOG.find((title) => title.id.startsWith("m-warrior-"));
    assert.match(mastery.label, /^AttackLord (Journeyman|Master)$/);
    for (const label of Object.values(i18n.WORKER_ROLE_LABELS)) assert.doesNotMatch(label, turkishLetters, label);
    const towers = Object.values(i18n.towerCatalog).flat();
    assert.deepEqual(towers.filter((tower) => turkishLetters.test(`${tower.name} ${tower.role} ${tower.description ?? ""}`)).map((tower) => tower.id), []);
    assert.deepEqual(i18n.BADGE_CATALOG.filter((badge) => turkishLetters.test(`${badge.name} ${badge.condition}`)).map((badge) => badge.id), []);
  } finally {
    setLocaleForTest("tr");
  }
  assert.equal(card.name, "Buz Kırığı", "dil donunce Turkce geri geliyor");
});

test("katalog: kurulum ikinci kez cagrilirsa okuyucular ust uste binmiyor", () => {
  i18n.installCatalogLocale();
  setLocaleForTest("en");
  try {
    assert.equal(i18n.getCardDefinition("buz-kirigi").name, "Ice Shard");
  } finally {
    setLocaleForTest("tr");
  }
  assert.equal(i18n.getCardDefinition("buz-kirigi").name, "Buz Kırığı");
});
