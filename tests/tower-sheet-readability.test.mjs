/**
 * Kule paneli: okunabilirlik turu.
 *
 * Kilitlenen sozler:
 *   1. Guc kristalinden uretilen mühimmatin adi "Güç çekirdeği" (EN "Power
 *      core"); hammaddenin adi "Güç kristali" kaliyor. Arayuzde mühimmat icin
 *      "Plazma"/"Plasma" kalmadi.
 *   2. Cephaneligin uretim secicisi panelin en ustunde: Ayarlar bolumunde
 *      degil, govdenin ilk elemani.
 *   3. Hammadde Deposu, cephanelik, Tamir Merkezi ve enerji binasinin stoku
 *      panelin en ustunde, buyuk sayilarla; Kaynak bolumu ayni sayilari
 *      ikinci kez yazmiyor; canli sayi ve uretim secimi paneli yeniden
 *      kurdurmuyor. Uretim hizi sunucunun blogundan (`pp`).
 *   4. Haritadaki kaynak paneli kule paneliyle hicbir zaman ortusmuyor
 *      (saf dikdortgen hesabi): ust/alt yasli, genis/dar panel, kule ust,
 *      orta ve alt kenarda, 375x812 ve 390x660.
 *   5. Yeni metinler iki dilde.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAmmoFactoryProductionRate, getRepairPartRate } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { importWebModule } from "./helpers/web-module.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

const web = await importWebModule("tests/fixtures/tower-sheet-entry.ts");
const { buildTowerSheetModel, getTowerSheetStructureKey, placeSelectedPanel, rectsOverlap, screenRatioRectToWorld, setLocaleForTest, installCatalogLocale, ammoTypeLabels, tr, en, RESOURCE_NAMES, RESOURCE_NAMES_EN } = web;
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

// ---------------------------------------------------------------- 1. Ad

test("guc kristalinden uretilen mühimmat 'Güç çekirdeği'; hammadde 'Güç kristali' kaliyor", () => {
  assert.equal(ammoTypeLabels.powerCrystal, "Güç çekirdeği");
  assert.equal(withLocale("en", () => ammoTypeLabels.powerCrystal), "Power core");
  assert.equal(RESOURCE_NAMES.plasma, "Güç kristali", "hammaddenin adi degismemeli");
  assert.equal(RESOURCE_NAMES_EN.plasma, "Power crystal");
  assert.equal(tr["controls.tower.production.powerCrystal"], "Güç çekirdeği");
  assert.equal(en["controls.tower.production.powerCrystal"], "Power core");
  assert.match(tr["tutorial.production.body"], /güç çekirdeği/);
  assert.match(en["tutorial.production.body"], /power core/);
  for (const dictionary of [tr, en]) {
    for (const key of ["tutorial.production.body", "controls.tower.production.bullet", "controls.tower.production.auraCrystal", "controls.tower.production.powerCrystal"]) {
      assert.doesNotMatch(dictionary[key], /plazma|plasma/i, key);
    }
  }
  const ui = read("apps/web/src/game-control-ui.ts");
  assert.doesNotMatch(ui, /"Plazma"|"Plasma"/, "uretim secicisinde eski ad");
  assert.doesNotMatch(read("apps/web/src/codex.ts"), /powerCrystal: "Güç kristali"/);
  assert.doesNotMatch(read("apps/web/src/locales/catalog/en-progression.ts"), /powerCrystal: "Power crystal"/);
});

// ---------------------------------------------------------------- 2. Secici en ustte

test("cephaneligin uretim secicisi panelin en ustunde, Ayarlar bolumunde degil", () => {
  const ui = read("apps/web/src/game-control-ui.ts");
  const controlsStart = ui.indexOf("const buildTowerControls = ");
  const controls = ui.slice(controlsStart, ui.indexOf("const buildProductionPicker = ", controlsStart));
  assert.ok(controls.length > 200, "Ayarlar govdesi bulunamadi");
  assert.doesNotMatch(controls, /productionAmmo|setFactoryProduction/, "secici hala Ayarlar bolumunde");
  const sheetStart = ui.indexOf("const buildTowerSheet = ");
  const sheet = ui.slice(sheetStart, ui.indexOf("renderTowerSheet(sheet", sheetStart));
  assert.match(sheet, /const production = buildProductionPicker\(state\);\n\s*if \(production\) lead\.unshift\(production\);/);
  const render = read("apps/web/src/tower-sheet.ts");
  const bodyStart = render.indexOf('const body = el("div", "tower-sheet__body");');
  const body = render.slice(bodyStart, render.indexOf("body.append(status, insight);", bodyStart));
  // Govdenin sirasi: lead (secici) -> stok -> durum.
  assert.ok(body.indexOf("slots.lead") < body.indexOf("buildStockBlock"), "secici stoktan sonra");
});

// ---------------------------------------------------------------- 3. Stok

const building = (definitionId, live, extra = {}) => ({
  towerId: "t1", definitionId, characterId: "warrior", name: definitionId, level: 2, color: "#22c55e",
  live: { hp: 100, maxHp: 120, ...live }, notes: [], ...extra
});

test("dort bina turunde stok en ustte; Kaynak bolumu ayni sayilari tekrar yazmiyor", () => {
  const warehouse = buildTowerSheetModel(building("warehouse-1", { materials: { gunpowder: 120, mystic: 48, plasma: 0, iron: 400 } }));
  assert.equal(warehouse.stock?.kind, "warehouse");
  assert.deepEqual(warehouse.stock.groups[0].items.map((item) => [item.key, item.value, item.max]), [
    ["m-gunpowder", "120", "/400"], ["m-mystic", "48", "/400"], ["m-plasma", "0", "/400"], ["m-iron", "400", "/400"]
  ]);
  assert.equal(warehouse.stock.groups[0].items[2].label, "Güç kristali", "depodaki hammadde guc kristali");

  const armory = buildTowerSheetModel(building("warrior-7", {
    resourceProvider: "ammunition", productionAmmo: "powerCrystal", ammo: 31, maxAmmo: 65, energy: 40, maxEnergy: 65,
    ammoStock: { bullet: 22, auraCrystal: 9 }, materials: { gunpowder: 56, plasma: 14 }
  }, { stats: { id: "t1", pp: 1.25 } }));
  assert.equal(armory.stock?.kind, "armory");
  const [ammo, input] = armory.stock.groups;
  assert.deepEqual(ammo.items.map((item) => [item.label, item.value, Boolean(item.active)]), [["Kurşun", "22", false], ["Aura kristali", "9", false], ["Güç çekirdeği", "0", true]]);
  assert.equal(ammo.summary, "31/65");
  assert.match(ammo.items[2].sub, /1,0\/sn/, "uretim hizi gercek saatte, sunucunun blogundan");
  assert.deepEqual(input.items.map((item) => item.key), ["m-gunpowder", "m-mystic", "m-plasma", "energy"]);
  assert.equal(input.items.find((item) => item.active)?.key, "m-plasma", "secili uretimin hammaddesi isaretli degil");
  assert.match(input.summary, /Güç kristali → güç çekirdeği/);

  const repair = buildTowerSheetModel(building("repair-depot-1", { repairParts: 18.6, materials: { iron: 0 }, energy: 0.4, maxEnergy: 65 }));
  assert.equal(repair.stock?.kind, "repair");
  assert.deepEqual(repair.stock.groups.map((group) => group.items.map((item) => [item.key, item.value, item.tone])), [
    [["parts", "18", "ok"]], [["m-iron", "0", "hot"], ["energy", "0,40", "warn"]]
  ]);

  const reactor = buildTowerSheetModel(building("warrior-8", { resourceProvider: "energy", energy: 88, maxEnergy: 110 }));
  assert.equal(reactor.stock?.kind, "energy");
  assert.deepEqual(reactor.stock.groups[0].items.map((item) => [item.value, item.max]), [["88", "/110"]]);

  for (const model of [warehouse, armory, repair, reactor]) {
    const resources = model.sections.find((section) => section.id === "resources");
    const keys = [...(resources?.bars ?? []).map((bar) => bar.key), ...(resources?.rows ?? []).map((row) => row.key)];
    assert.deepEqual(keys, ["hp"], `${model.stock.kind}: Kaynak bolumu stoku tekrar ediyor (${keys})`);
  }

  // Savas kulesinde stok yok; Kaynak bolumu ana sayilarin hemen altinda.
  const tower = buildTowerSheetModel({ ...building("warrior-1", { temperature: 30, ammo: 12, maxAmmo: 40, energy: 20, maxEnergy: 60, performance: 0.5 }) });
  assert.equal(tower.stock, undefined);
  assert.equal(tower.sections[0].id, "resources");
});

test("stok: canli sayi ve uretim secimi paneli yeniden kurdurmuyor; stok govdede en ustte", () => {
  const input = (live) => building("warrior-7", { resourceProvider: "ammunition", ammo: 5, maxAmmo: 65, energy: 10, maxEnergy: 65, ammoStock: { bullet: 5 }, materials: { gunpowder: 3 }, ...live });
  const first = getTowerSheetStructureKey(buildTowerSheetModel(input({ productionAmmo: "bullet" })));
  const later = getTowerSheetStructureKey(buildTowerSheetModel(input({ productionAmmo: "auraCrystal", ammoStock: { bullet: 40, auraCrystal: 3 }, energy: 0, materials: { mystic: 9 } })));
  assert.equal(first, later);
  const sheet = read("apps/web/src/tower-sheet.ts");
  assert.match(sheet, /patchStock\(registry, model\.stock\);/, "stok yerinde yazilmiyor");
  assert.match(sheet, /if \(model\.stock\) body\.append\(buildStockBlock\(model, model\.stock, keep\)\);/);
  const css = read("apps/web/src/style.css");
  const sheetCss = css.slice(css.indexOf("/* Kule paneli"), css.indexOf("/* Kule paneli sonu */"));
  for (const selector of [".ts-stock {", ".ts-tile__number {", ".ts-production {"]) assert.ok(sheetCss.includes(selector), selector);
  assert.equal(/animation:|glow|sparkle/i.test(sheetCss), false);
});

test("sunucu blogu uretim hizini tasiyor (pp): cephanelik ve Tamir Merkezi", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const client = { sessionId: "p1", send() {} };
  room.clients = [client];
  room.setupPhase = false;
  Object.assign(room.state.players.get("p1"), { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0, gold: 10_000 });
  const place = (definitionId) => {
    const spot = findBuildableSpot(room, definitionId);
    assert.ok(spot, `${definitionId} icin yer yok`);
    room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
    const tower = [...room.towers.values()].at(-1);
    assert.equal(tower.definition.id, definitionId);
    return tower;
  };
  const armory = place("warrior-7");
  assert.equal(room.getTowerStatsBlock(armory, "p1").pp, getAmmoFactoryProductionRate(armory.level));
  const repair = place("repair-depot-1");
  assert.equal(room.getTowerStatsBlock(repair, "p1").pp, getRepairPartRate(repair.level));
  const reactor = place("warrior-8");
  assert.equal(room.getTowerStatsBlock(reactor, "p1").pp, undefined);
});

// ---------------------------------------------------------------- 4. Ortusme

/**
 * Bir ekran: dunya = ekran pikseli (kamera 1:1), ust cubuk ve alt bar,
 * kule paneli uste ya da alta yasli, dar (%41) ya da genis (%75).
 */
function screen(width, height, { dock, expanded }) {
  const hud = 54;
  const bar = 60;
  const sheetHeight = Math.min(height * (expanded ? 0.75 : 0.41), height - hud - bar - 16);
  const sheet = dock === "top"
    ? { left: 6, right: width - 6, top: hud + 6, bottom: hud + 6 + sheetHeight }
    : { left: 6, right: width - 6, top: height - bar - 4 - sheetHeight, bottom: height - bar - 4 };
  return { area: { left: 0, right: width, top: hud, bottom: height - bar }, sheet };
}

const towerAt = (x, y, size = 34) => ({ left: x - size / 2 - 1, right: x + size / 2 + 1, top: y - size / 2 - 10, bottom: y + size / 2 + 1 });

test("harita paneli kule paneliyle hicbir durumda ortusmuyor (375x812, 390x660)", () => {
  // Dar panelde, kule panelin altinda kalmiyorsa (sahne kenari buna gore seciyor) panel gorunmeli.
  let shown = 0;
  let hidden = 0;
  for (const [width, height] of [[375, 812], [390, 660]]) {
    for (const dock of ["top", "bottom"]) {
      for (const expanded of [false, true]) {
        const { area, sheet } = screen(width, height, { dock, expanded });
        for (let y = area.top + 20; y <= area.bottom - 20; y += 13) {
          for (const x of [24, width / 2, width - 24]) {
            const tower = towerAt(x, y);
            const placement = placeSelectedPanel({ tower, width: 160, height: 98 + 30, area, blockers: [sheet] });
            const counted = !expanded && !rectsOverlap(tower, sheet);
            if (placement.side === "hidden") { if (counted) hidden += 1; continue; }
            if (counted) shown += 1;
            const rect = { left: placement.left, top: placement.top, right: placement.left + placement.width, bottom: placement.top + placement.height };
            const label = `${width}x${height} ${dock}${expanded ? " genis" : ""} kule ${x},${y} -> ${placement.side}`;
            assert.equal(rectsOverlap(rect, sheet), false, `kule paneliyle ortusuyor: ${label}`);
            assert.equal(rectsOverlap(rect, tower), false, `kuleyi ortuyor: ${label}`);
            assert.ok(rect.top >= area.top && rect.bottom <= area.bottom && rect.left >= area.left && rect.right <= area.right, `ekrandan tasiyor: ${label}`);
          }
        }
      }
    }
  }
  assert.ok(shown > hidden * 4, `panel cogu durumda gorunmeli (gorunen ${shown}, gizli ${hidden})`);
});

test("yerlesim: once alt, harita bitince ust, yan; yer yoksa gizli; onceki taraf korunuyor", () => {
  const area = { left: 0, right: 375, top: 54, bottom: 752 };
  const free = { tower: towerAt(187, 300), width: 160, height: 128, area, blockers: [] };
  assert.equal(placeSelectedPanel(free).side, "below");
  // Alt taraf kule panelinin altinda: ust.
  const lowSheet = { left: 6, right: 369, top: 380, bottom: 748 };
  assert.equal(placeSelectedPanel({ ...free, blockers: [lowSheet] }).side, "above");
  // Ust ve alt kapali, kenardaki kulenin yaninda yer var: yan.
  const side = placeSelectedPanel({ ...free, tower: towerAt(24, 300), blockers: [{ left: 6, right: 369, top: 54, bottom: 200 }, { left: 6, right: 369, top: 360, bottom: 748 }] });
  assert.equal(side.side, "right");
  assert.ok(side.top >= 200 + 4 && side.top + side.height <= 360 - 4, "yan panel serbest banda kaymadi");
  // Hicbir yere sigmiyor: gizli, ortusmek yerine.
  const full = { left: 6, right: 369, top: 54, bottom: 748 };
  assert.deepEqual(placeSelectedPanel({ ...free, blockers: [{ ...full, bottom: 280 }, { ...full, top: 322 }] }), { side: "hidden" });
  // Onceki taraf hala sigiyorsa degismiyor (titreme yok).
  assert.equal(placeSelectedPanel({ ...free, previous: "above" }).side, "above");
  // Ekran oranindan dunyaya: kamera kayik ve yakinlasmis.
  assert.deepEqual(screenRatioRectToWorld({ left: 0, top: 0.5, right: 1, bottom: 1 }, { x: 100, y: 200, width: 400, height: 600 }), { left: 100, right: 500, top: 500, bottom: 800 });
});

test("sahne kule panelinin olculen dikdortgenini okuyor; arayuz olcup bildiriyor", () => {
  const scene = read("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /game:tower-sheet-rect/);
  assert.match(scene, /placeSelectedPanel\(\{/);
  assert.match(scene, /getSelectedResourceLayout\(tower, discSize, \{ ignoreSheet: true \}\)/, "kenar secimi kendi yerine bagli");
  const ui = read("apps/web/src/game-control-ui.ts");
  assert.match(ui, /game\.events\.emit\("game:tower-sheet-rect", rect\)/);
  assert.match(ui, /new ResizeObserver\(\(\) => reportTowerSheetRect\(\)\)/);
});

// ---------------------------------------------------------------- 5. Iki dil

test("yeni metinler iki dilde ve Ingilizcede Turkce harf yok", () => {
  const keys = Object.keys(tr).filter((key) => key.startsWith("sheet.stock.") || key.startsWith("controls.tower.production"));
  assert.ok(keys.length >= 15, `anahtar az: ${keys.length}`);
  for (const key of keys) {
    assert.ok(en[key]?.trim(), `${key} Ingilizcesi yok`);
    assert.doesNotMatch(en[key], /[ğüşıöçĞÜŞİÖÇ]/, key);
  }
  const english = withLocale("en", () => buildTowerSheetModel(building("warrior-7", { resourceProvider: "ammunition", productionAmmo: "powerCrystal", ammoStock: {}, materials: {}, energy: 1, maxEnergy: 65 })));
  const texts = english.stock.groups.flatMap((group) => [group.title, group.summary, ...group.items.flatMap((item) => [item.label, item.sub ?? ""])]);
  assert.deepEqual(texts.filter((text) => /[ğüşıöçĞÜŞİÖÇ]/.test(text)), []);
  assert.ok(texts.includes("Power core"));
});
