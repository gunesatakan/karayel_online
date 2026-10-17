/**
 * Her kule hangi mühimmati kullandigini soyluyor.
 *
 * Tur sunucunun ikmal hattiyla ayni kaynaktan geliyor (`getTowerAmmoUsage`:
 * motorun `ammoType`i, `shotFuel` ve yapinin ates edip etmedigi); istemci
 * kule basina tur yazmiyor. Uc yerde gorunuyor: kule cekmecesinin dugmeleri,
 * secili kulenin paneli (Kaynak bolumu) ve menudeki kule kunyesi. Isaretin
 * rengi cephaneligin uretim secenekleriyle ayni, oyuncu ikisini eslestirsin.
 *
 * Kilitlenen sozler:
 *   1. Katalogdaki her kule bir duruma cozuluyor; mühimmatli olanlar gercekten
 *      mühimmat harciyor, enerjili ve mühimmatsiz olanlar harcamiyor.
 *   2. Psisik hasarli mühimmatli kule aura kristali; enerjiyle ateslenen kule
 *      "Enerji ile ateşler"; duvar, depolar ve kaynak binalari mühimmat kullanmaz.
 *   3. Etiket iki dilde dolu; kule paneli turu satir olarak yaziyor.
 *   4. Cekmece dugmesi, cephanelik secicisi ve kunye etiketi okuyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateTowerAmmoCost, getTowerAmmoUsage, towerCatalog } from "../packages/shared/dist/index.js";
import { importWebModule } from "./helpers/web-module.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const uniqueTowers = (catalog) => [...new Map(Object.values(catalog).flat().map((tower) => [tower.id, tower])).values()];
const allTowers = uniqueTowers(towerCatalog);
const sharedTower = (id) => allTowers.find((tower) => tower.id === id);

const web = await importWebModule("tests/fixtures/tower-ammo-entry.ts");
const { describeTowerAmmo, buildTowerSheetModel, setLocaleForTest, installCatalogLocale, tr, en } = web;
installCatalogLocale();
const webTowers = uniqueTowers(web.towerCatalog);
const webTower = (id) => webTowers.find((tower) => tower.id === id);

test("katalogdaki her kule bir mühimmat durumuna cozuluyor ve sunucunun maliyetiyle uyusuyor", () => {
  assert.ok(allTowers.length > 20);
  for (const tower of allTowers) {
    const usage = getTowerAmmoUsage(tower);
    assert.ok(["ammo", "energy", "none"].includes(usage.kind), `${tower.id}: ${usage.kind}`);
    if (usage.kind === "ammo") {
      assert.ok(["bullet", "auraCrystal", "powerCrystal"].includes(usage.ammoType), `${tower.id}: ${usage.ammoType}`);
      assert.equal(usage.ammoType, tower.engine.resources.ammoType, `${tower.id}: motorun turu degil`);
      assert.ok(calculateTowerAmmoCost(tower) > 0, `${tower.id}: mühimmat diyor ama atis basina harcamiyor`);
    } else {
      // Sunucu (warrior-2) motorda mühimmatli ama hic tetiklemiyor, harcamiyor.
      if (tower.id !== "warrior-2") assert.equal(calculateTowerAmmoCost(tower), 0, `${tower.id}: ${usage.kind} diyor ama mühimmat harciyor`);
    }
  }
});

test("psisik kule aura kristali, enerjili kule enerji, yapilar mühimmatsiz", () => {
  const psychic = allTowers.filter((tower) => tower.damageType === "psychic" && tower.engine.resources.shotFuel === "ammo");
  assert.ok(psychic.length > 0);
  for (const tower of psychic) assert.deepEqual(getTowerAmmoUsage(tower), { kind: "ammo", ammoType: "auraCrystal" }, tower.id);

  const energy = allTowers.filter((tower) => tower.engine.resources.shotFuel === "energy" && !tower.resourceProvider);
  assert.ok(energy.some((tower) => tower.id === "warrior-5"), "Debug Lazer enerjiyle ateslenir");
  for (const tower of energy) assert.equal(getTowerAmmoUsage(tower).kind, "energy", tower.id);

  // Sunucu (warrior-2) hic tetiklemiyor: mühimmati olsa da harcamiyor.
  for (const id of ["wall-1", "warehouse-1", "repair-depot-1", "warrior-7", "warrior-8", "zeynep-9", "archer-8", "warrior-2"]) {
    assert.equal(getTowerAmmoUsage(sharedTower(id)).kind, "none", id);
  }
  assert.deepEqual(getTowerAmmoUsage(sharedTower("warrior-1")), { kind: "ammo", ammoType: "bullet" });
  assert.deepEqual(getTowerAmmoUsage(sharedTower("zeynep-2")), { kind: "ammo", ammoType: "powerCrystal" });
});

test("etiket iki dilde her kule icin dolu", () => {
  try {
    for (const locale of ["tr", "en"]) {
      setLocaleForTest(locale);
      installCatalogLocale();
      for (const tower of webTowers) {
        assert.ok(describeTowerAmmo(tower).label.trim().length > 0, `${locale} ${tower.id}: bos`);
      }
    }
    setLocaleForTest("tr");
    installCatalogLocale();
    assert.deepEqual(describeTowerAmmo(webTower("archer-1")), { key: "auraCrystal", label: "Aura kristali" });
    assert.deepEqual(describeTowerAmmo(webTower("warrior-5")), { key: "energy", label: "Enerji ile ateşler" });
    assert.deepEqual(describeTowerAmmo(webTower("wall-1")), { key: "none", label: "Mühimmat kullanmaz" });
    setLocaleForTest("en");
    installCatalogLocale();
    assert.deepEqual(describeTowerAmmo(webTower("archer-1")), { key: "auraCrystal", label: "Aura crystal" });
    assert.deepEqual(describeTowerAmmo(webTower("warrior-5")), { key: "energy", label: "Fires on energy" });
    assert.deepEqual(describeTowerAmmo(webTower("wall-1")), { key: "none", label: "Uses no ammo" });
  } finally {
    setLocaleForTest("tr");
    installCatalogLocale();
  }
  for (const key of ["ammo.energy", "ammo.none", "sheet.ammoType", "sheet.ammoNone", "menu.tower.ammo", "menu.tower.ammoHint", "menu.tower.ammoEnergyHint"]) {
    assert.ok(tr[key]?.trim(), `tr ${key}`);
    assert.ok(en[key]?.trim(), `en ${key}`);
  }
});

test("kule paneli Kaynak bolumunde mühimmat turunu yaziyor", () => {
  const modelFor = (definitionId) => buildTowerSheetModel({
    towerId: "t1", definitionId, characterId: "archer", name: "x", level: 1, color: "#22c55e",
    live: { hp: 100, maxHp: 100, temperature: 10, ammo: 10, maxAmmo: 40 }, notes: []
  });
  const rowFor = (definitionId) => modelFor(definitionId).sections.find((section) => section.id === "resources")?.rows.find((row) => row.key === "ammoType");
  const archer = rowFor("archer-1");
  assert.deepEqual([archer.label, archer.value, archer.ammoMarker], ["Mühimmat türü", "Aura kristali", "auraCrystal"]);
  assert.equal(rowFor("warrior-1").value, "Kurşun");
  assert.equal(rowFor("warrior-5").value, "Enerji ile ateşler");
  assert.equal(rowFor("wall-1").value, "Kullanmaz");
  // Eski tursuz "Atis yakiti" satiri yerini verdi.
  assert.equal(modelFor("archer-1").sections.flatMap((section) => section.rows).some((row) => row.key === "fuel"), false);
});

test("cekmece dugmesi, cephanelik secicisi ve kunye etiketi okuyor; isaretin her turu stilli", () => {
  const ui = read("apps/web/src/game-control-ui.ts");
  const start = ui.indexOf("const makeTowerButton = ");
  const button = ui.slice(start, ui.indexOf("button.addEventListener(\"pointerdown\"", start));
  assert.match(button, /describeTowerAmmo\(definition\)/);
  assert.match(button, /game-controls__tower-ammo/);
  assert.match(button, /makeAmmoMarker\(ammo\.key\)/);
  // Uretim secicisi panelin en ustunde, kendi bloklarinda (buildProductionPicker).
  const pickerStart = ui.indexOf("const buildProductionPicker = ");
  assert.ok(pickerStart > 0, "uretim secicisi yok");
  const armory = ui.slice(pickerStart, ui.indexOf("return block;", pickerStart));
  assert.match(armory, /button\.prepend\(makeAmmoMarker\(ammoType\)\)/, "cephanelik secenegi isaretsiz: kuleyle eslesmiyor");
  assert.match(armory, /makeActionButton\(ammoTypeLabels\[ammoType\],/, "secenek adi katalogdan degil");
  const menu = read("apps/web/src/menu-ui.ts");
  const detailStart = menu.indexOf("function towerToDetail(");
  const detail = menu.slice(detailStart, menu.indexOf("t(\"menu.tower.economy\")", detailStart));
  assert.match(detail, /describeTowerAmmo\(tower\)/);
  assert.match(detail, /t\("menu\.tower\.ammo"\)/);
  const sheet = read("apps/web/src/tower-sheet.ts");
  assert.match(sheet, /if \(row\.ammoMarker\) label\.prepend\(makeAmmoMarker\(row\.ammoMarker\)\);/);
  const css = read("apps/web/src/style.css");
  for (const key of ["auraCrystal", "powerCrystal", "energy", "none"]) assert.match(css, new RegExp(`\\.ammo-mark--${key}\\b`), key);
  assert.match(css, /\.ammo-mark \{/);
  assert.match(css, /\.game-controls__tower-foot \{/);
});
