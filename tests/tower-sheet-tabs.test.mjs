/**
 * Kule paneli sekmeleri ve Gelismis kartlari (apps/web/src/tower-sheet.ts).
 *
 * Sahibin istegi (2026-10-20): panel cok karmasik ve cok kaydiriliyordu;
 * temel ve gelismis sayilar ayri, gelismiste atis basina isi, soguma/sn,
 * atis basina enerji, enerji/sn gibi olculer acik bir gorselle.
 * - Sekmeler: Genel (ana sayilar + canli kaynaklar), Gelismis (isi, enerji,
 *   mühimmat kartlari; saldiri ve nisan; gelisim), Etkiler, Ayarlar.
 * - Kartlarin olculeri yapilandirilmis: deger degisince panel yeniden kurulmuyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const web = await importWebModule("tests/fixtures/tower-ammo-entry.ts");
const { buildTowerSheetModel, setLocaleForTest, installCatalogLocale } = web;
installCatalogLocale();
const sheetModule = await importWebModule("apps/web/src/tower-sheet.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Sunucu oyun saatinde sayiyor; panel gercek saatte (GAME_SPEED_MULTIPLIER 0,8).
const input = (live, stats) => ({
  towerId: "t1", definitionId: "warrior-1", characterId: "warrior", name: "Takipçi", level: 1, color: "#22c55e",
  live: { hp: 100, maxHp: 100, temperature: 20, ammo: 18, maxAmmo: 20, energy: 60, maxEnergy: 100, performance: 0.5, ...live },
  notes: [],
  stats: { id: "t1", hs: 10, hc: 1, su: 0.1, ec: 0.5, oe: 0.2, am: 1, ...stats }
});

test("Gelismis kartlari: isi (atis basina, soguma/sn, frene kalan, surekli), enerji (atis basina, calisma), mühimmat (atis basina, dolu depo)", () => {
  setLocaleForTest("tr");
  const model = buildTowerSheetModel(input());
  assert.deepEqual(model.specs.map((card) => card.key), ["heat", "energy", "ammo"]);
  const [heat, energy, ammo] = model.specs;
  assert.equal(heat.title, "Isı");
  assert.equal(heat.value, "%20");
  assert.equal(heat.marker, 0.5, "isi freni cizgisi");
  assert.deepEqual(heat.items.map((item) => [item.label, item.value]), [
    ["Atış başına", "+10,0"], ["Soğuma", "0,80/sn"], ["Frene kalan", "3 atış"], ["Sürekli atış", "0,08/sn"]
  ]);
  assert.deepEqual(energy.items.map((item) => [item.label, item.value]), [["Atış başına", "0,50"], ["Çalışma", "0,16/sn"]]);
  assert.equal(energy.value, "60/100");
  assert.deepEqual(ammo.items.map((item) => [item.label, item.value]), [["Atış başına", "1,00"], ["Dolu depo", "20 atış"]]);
  assert.equal(ammo.caption, "Kurşun");
  assert.equal(ammo.ammoMarker, "bullet");
  // Frende ve fren yok.
  const braking = buildTowerSheetModel(input({ temperature: 70 })).specs[0];
  assert.equal(braking.items.find((item) => item.key === "brake").value, "frende");
  assert.equal(braking.tone, "warn");
  const noBrake = buildTowerSheetModel(input({}, { nb: 1 })).specs[0];
  assert.equal(noBrake.items.find((item) => item.key === "brake").value, "fren yok");
  assert.equal(noBrake.marker, undefined);
});

test("kartlar canli sayilarla degismeyen yapida; enerjiyle ates eden kulede mühimmat karti yok; binada kart yok", () => {
  const { getTowerSheetStructureKey } = sheetModule;
  setLocaleForTest("tr");
  const cold = getTowerSheetStructureKey(buildTowerSheetModel(input({ temperature: 0, ammo: 20, energy: 100 })));
  const hot = getTowerSheetStructureKey(buildTowerSheetModel(input({ temperature: 80, ammo: 2, energy: 5 })));
  assert.equal(cold, hot, "canli sayi paneli yeniden kurduruyor");
  const laser = buildTowerSheetModel({ ...input({ shotFuel: "energy" }), definitionId: "warrior-5" });
  assert.deepEqual(laser.specs.map((card) => card.key), ["heat", "energy"]);
  const warehouse = buildTowerSheetModel({ ...input({ materials: { iron: 10 } }), definitionId: "warehouse-1" });
  assert.deepEqual(warehouse.specs, []);
});

test("sekmeli cizim: Genel/Gelismis/Etkiler/Ayarlar; secim saklaniyor; ayrinti sekmesinde panel uzayabiliyor; parilti yok", () => {
  const sheet = read("apps/web/src/tower-sheet.ts");
  assert.match(sheet, /export const TOWER_SHEET_TABS = \["basic", "advanced", "effects", "settings"\] as const;/);
  assert.match(sheet, /const TAB_STORAGE_KEY = "uzay_tower_sheet_tab_v1";/);
  assert.match(sheet, /function writeTowerSheetTab\(tab: TowerSheetTab\) \{\n\s+tabState = tab;\n\s+try \{\n\s+window\.localStorage\.setItem\(TAB_STORAGE_KEY, tab\);/);
  // Genel: canli kaynaklar tek sirada (kucuk cubuk, alt metin Gelismis'te).
  assert.match(sheet, /for \(const bar of resources\.bars\) vitals\.append\(buildBar\(bar, keep, true\)\);/);
  const controls = read("apps/web/src/game-control-ui.ts");
  assert.match(controls, /effects\.dataset\.sheetTab = "effects";/);
  assert.match(controls, /controls\.dataset\.sheetTab = "settings";/);
  const css = read("apps/web/src/style.css");
  const sheetCss = css.slice(css.indexOf("/* Kule paneli"), css.indexOf("/* Kule paneli sonu */"));
  for (const selector of [".ts-tabs {", ".ts-vitals {", ".ts-spec {", ".ts-spec__items {", ".ts-metrics {", ".ts-card {"]) assert.ok(sheetCss.includes(selector), selector);
  assert.match(sheetCss, /\.tower-sheet\[data-tab="advanced"\]:not\(\.tower-sheet--expanded\)/);
  assert.equal(/animation:|glow|sparkle/i.test(sheetCss), false);
  // Metinler iki dilde.
  setLocaleForTest("en");
  assert.equal(buildTowerSheetModel(input()).specs[0].items[0].label, "Per shot");
  setLocaleForTest("tr");
});
