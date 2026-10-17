/**
 * Muhimmat adlari her yerde ayni; deneyim ust satirda altinin yaninda.
 *
 * Kilitlenen sozler:
 *   1. Her muhimmat turunun tek adi var: `ammoTypeLabels` (TR Kurşun / Aura
 *      kristali / Güç çekirdeği, EN Bullet / Aura crystal / Power core).
 *      Cephaneligin uretim secicisi, tasiyicinin urun dugmeleri, isci
 *      listesi, kule cekmecesi/dosya, ust cubugun muhimmat cipi ve ogretici
 *      bu sozlugu okuyor; eski ikinci adlar ("Projektil", "Psişik / Aura",
 *      "Projectile", "Psychic / Aura", "Mermi · Aura · Güç") geri gelmiyor.
 *      Hammadde adlari ("Güç kristali") ayri ve degismiyor.
 *   2. Ust satirda altinin hemen yaninda deneyim (★): canli, altinla ayni
 *      kisaltma, iki dilde ipucu; Detay panelindeki ★ cipi de yerinde.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { importWebModule } from "./helpers/web-module.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

const web = await importWebModule("tests/fixtures/ammo-names-entry.ts");
const {
  setLocaleForTest, installCatalogLocale, AMMO_TYPE_ORDER, ammoTypeLabels, enAmmoTypeLabels, formatTransportProduct,
  getWorkerProductOptions, describeTowerAmmo, getTutorialCopy, formatHudCompactNumber, tr, en,
  RESOURCE_NAMES, RESOURCE_NAMES_EN, towerCatalog, getTowerAmmoUsage
} = web;
installCatalogLocale();

const withLocale = (locale, run) => {
  try {
    setLocaleForTest(locale);
    installCatalogLocale();
    return run();
  } finally {
    setLocaleForTest("tr");
    installCatalogLocale();
  }
};

const CANONICAL = {
  tr: { bullet: "Kurşun", auraCrystal: "Aura kristali", powerCrystal: "Güç çekirdeği" },
  en: { bullet: "Bullet", auraCrystal: "Aura crystal", powerCrystal: "Power core" }
};
// Muhimmat adi olarak kullanilan eski ikinci adlar. Ingilizce "Projectile"
// metinlerde saldiri bicimi olarak da geciyor ("Projectile towers", panelin
// "Projectile" bolumu): o ad yalnizca muhimmat adini yazan kodda araniyor.
const OLD_ALTERNATES = /Projektil|projektil|Psişik \/ Aura|Psychic \/ Aura|projectile, aura|Mermi · Aura · Güç|Bullets · Aura · Power/;
const AMMO_NAME_CODE = ["apps/web/src/game-control-ui.ts", "apps/web/src/worker-roster.ts", "apps/web/src/tutorial.ts", "apps/web/src/tower-ammo.ts", "apps/web/src/tower-sheet.ts"];

// ---------------------------------------------------------------- 1. Tek ad

test("her muhimmat turunun tek adi var, iki dilde", () => {
  assert.deepEqual([...AMMO_TYPE_ORDER], ["bullet", "auraCrystal", "powerCrystal"]);
  assert.deepEqual({ ...ammoTypeLabels }, CANONICAL.tr);
  assert.deepEqual({ ...enAmmoTypeLabels }, CANONICAL.en);
  withLocale("en", () => assert.deepEqual({ ...ammoTypeLabels }, CANONICAL.en));
  // Hammadde adi ayri kaliyor.
  assert.equal(RESOURCE_NAMES.plasma, "Güç kristali");
  assert.equal(RESOURCE_NAMES_EN.plasma, "Power crystal");
});

test("eski ikinci adlar arayuz kodunda ve metinlerde yok", () => {
  for (const path of [
    "apps/web/src/locales/areas/controls.ts", "apps/web/src/locales/tr.ts", "apps/web/src/locales/en.ts",
    "apps/web/src/game-control-ui.ts", "apps/web/src/worker-roster.ts", "apps/web/src/tutorial.ts",
    "apps/web/src/tower-ammo.ts", "apps/web/src/tower-sheet.ts", "apps/web/src/menu-ui.ts"
  ]) {
    assert.doesNotMatch(read(path), OLD_ALTERNATES, path);
  }
  for (const path of AMMO_NAME_CODE) assert.doesNotMatch(read(path), /"Projectile"/, path);
  for (const dictionary of [tr, en]) {
    assert.equal(Object.keys(dictionary).some((key) => /^controls\.tower\.production\./.test(key)), false, "secici icin ayri ad anahtari geri geldi");
    assert.equal("hud.ammo" in dictionary, false, "muhimmat cipinin ayri etiketi geri geldi");
  }
});

test("uretim secicisi, tasiyici dugmeleri, muhimmat cipi ve kule satiri ammoTypeLabels okuyor", () => {
  const ui = read("apps/web/src/game-control-ui.ts");
  const picker = ui.slice(ui.indexOf("const buildProductionPicker = "), ui.indexOf("Secili kulenin paneli."));
  assert.ok(picker.length > 200, "uretim secicisi bulunamadi");
  assert.match(picker, /AMMO_TYPE_ORDER\.map\(ammoType =>/);
  assert.match(picker, /makeActionButton\(ammoTypeLabels\[ammoType\],/);
  assert.doesNotMatch(picker, /controls\.tower\.production\./);
  assert.match(ui, /const ammoLabel = AMMO_TYPE_ORDER\.map\(\(type\) => ammoTypeLabels\[type\]\)\.join\(" · "\);/);
  assert.match(read("apps/web/src/worker-roster.ts"), /return ammoTypeLabels\[product\];/);
  assert.match(read("apps/web/src/tutorial.ts"), /ammo: ammoTypeLabels\[production\],/);

  for (const locale of ["tr", "en"]) {
    withLocale(locale, () => {
      const names = CANONICAL[locale];
      const ammoProducts = getWorkerProductOptions("carrier").filter((product) => product in names);
      assert.deepEqual([...ammoProducts], ["bullet", "auraCrystal", "powerCrystal"]);
      for (const type of ammoProducts) assert.equal(formatTransportProduct(type), names[type], `${locale} ${type}`);
      let checked = 0;
      for (const tower of Object.values(towerCatalog).flat()) {
        const usage = getTowerAmmoUsage(tower);
        if (usage.kind !== "ammo") continue;
        assert.equal(describeTowerAmmo(tower).label, names[usage.ammoType], tower.id);
        checked += 1;
      }
      assert.ok(checked > 0, "muhimmat yakan kule yok");
    });
  }
});

test("ogretici kanonik adlari yaziyor (secicideki, dugmedeki ve paneldeki ad ayni)", () => {
  for (const locale of ["tr", "en"]) {
    withLocale(locale, () => {
      const names = CANONICAL[locale];
      const lower = (text) => text.toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-US");
      const production = getTutorialCopy("production").body;
      for (const type of AMMO_TYPE_ORDER) assert.ok(production.includes(lower(names[type])), `${locale}: ${production}`);
      assert.doesNotMatch(production, /\{|projektil|projectile|psychic/i);
      for (const type of AMMO_TYPE_ORDER) {
        // Iki otomatik tasiyici: biri enerjide kaliyor, digeri cephaneye atanabilir (ise alim metni yok).
        const facts = { production: type, workers: [{ mode: "energyTransport", manual: false }, { mode: "energyTransport", manual: false }] };
        assert.ok(getTutorialCopy("gatherer", true, { facts }).body.includes(names[type]), `${locale} gatherer ${type}`);
        assert.ok(getTutorialCopy("ammoCarrier", true, { facts }).body.includes(names[type]), `${locale} ammoCarrier ${type}`);
      }
    });
  }
});

// ---------------------------------------------------------------- 2. Deneyim ust satirda

test("ust satirda deneyim altinin hemen yaninda, Detay cipi de yerinde", () => {
  const ui = read("apps/web/src/game-control-ui.ts");
  const vitals = ui.slice(ui.indexOf('<div class="game-hud__vitals">'), ui.indexOf('<p class="game-hud__status"'));
  const gold = vitals.indexOf("game-hud__vital--gold");
  const xp = vitals.indexOf("game-hud__vital--xp");
  const health = vitals.indexOf("game-hud__vital--health");
  assert.ok(gold >= 0 && xp > gold && health > xp, "sira altin, deneyim, can olmali");
  assert.match(vitals, /<span class="game-hud__vital game-hud__vital--xp" data-hud-xp-vital role="group"><i aria-hidden="true">★<\/i><b data-hud-xp-top>0<\/b><\/span>/);
  // Canli: her cizimde deneyim altinla ayni bicimle yaziliyor; ipucu iki dilde.
  assert.match(ui, /setText\(xpTopNode, compactNumber\(stats\.experience\)\);/);
  assert.match(ui, /const xpTitle = upgradeReady \? t\("hud\.experienceReady"\) : t\("hud\.experience"\);/);
  assert.match(ui, /setTitle\(xpVitalNode, xpTitle\);/);
  assert.match(ui, /xpVitalNode\.setAttribute\("aria-label", xpTitle\)/);
  assert.match(ui, /data-hud-xp><i aria-hidden="true">★<\/i>/, "Detay panelindeki deneyim cipi kalmali");
  assert.equal(tr["hud.experience"], "Deneyim");
  assert.equal(en["hud.experience"], "Experience");
  assert.ok(tr["hud.experienceReady"] && en["hud.experienceReady"]);

  const css = read("apps/web/src/style.css");
  assert.match(css, /\.game-hud__vital--xp \{ color: #c4b5fd; \}/);
  assert.match(css, /\.game-hud__vital--xp\.is-ready i \{ color: #4ade80;/);
});

test("deneyim altinla ayni kisaltmayla yaziliyor", () => {
  assert.equal(formatHudCompactNumber(0), "0");
  assert.equal(formatHudCompactNumber(-5), "0");
  assert.equal(formatHudCompactNumber(37.9), "37");
  assert.equal(formatHudCompactNumber(9999), "9999");
  assert.equal(formatHudCompactNumber(12_400), "12.4B");
  assert.equal(formatHudCompactNumber(250_000), "250B");
  assert.equal(formatHudCompactNumber(1_500_000), "1.5M");
  withLocale("en", () => assert.equal(formatHudCompactNumber(12_400), "12.4K"));
});

test("ogretici deneyimi ust satirda gosteriyor", () => {
  assert.match(read("apps/web/src/tutorial.ts"), /xpGold: \["\.game-hud__vital--xp", "\.game-hud__chip--xp", "\.game-hud__vital--gold"\]/);
  assert.match(tr["tutorial.xpGold.body"], /Deneyim \(altının yanında/);
  assert.match(en["tutorial.xpGold.body"], /Experience \(next to gold/);
});
