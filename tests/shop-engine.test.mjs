import assert from "node:assert/strict";
import test from "node:test";
import { drawShopOffers, getShopItemPrice, getShopRerollPrice, isShopItemAvailable, shopCatalog, shopItemAppliesToTower } from "../packages/shared/dist/index.js";

const item = { id: "x", name: "X", description: "+1 test.", category: "power", price: 100, axes: [], scope: { kind: "tagged", hitTypes: ["projectile"] }, repeatable: true, maxStacks: 2, effects: [] };

test("shop prices grow additively by purchase count", () => {
  assert.equal(getShopItemPrice(item, []), 100);
  assert.equal(getShopItemPrice(item, ["x"]), 160);
  assert.equal(getShopRerollPrice(0), 40);
  assert.equal(getShopRerollPrice(2), 80);
});

test("catalog contains 45 valid, unique and numeric single-line items", () => {
  assert.equal(shopCatalog.length, 45);
  assert.equal(new Set(shopCatalog.map(({ id }) => id)).size, 45);
  for (const entry of shopCatalog) {
    assert.match(entry.description, /\d/);
    assert.equal(entry.description.includes("\n"), false);
    for (const modifier of entry.effects) assert.equal(modifier.source, `shop:${entry.id}`);
  }
});

for (const expectedId of [
  "sogutucu-kanatlar", "madenci-eldiveni", "seri-cephane-hatti", "isci-botlari",
  "hassas-servo", "balistik-itici", "ince-ayar",
  "namlu-yatagi", "nisangah", "hafif-muhimmat", "isi-emici", "kritik-sistem",
  "delici-cekirdek", "odak-mercegi", "agir-kundak", "yanki-odasi",
  "komuta-modulu", "buz-cekirdegi", "zirh-plakasi", "verim-hatti",
  "termal-funye", "kriyojen-hat", "hedef-kilidi", "avci-protokolu", "nobetci-protokolu",
  "ucaksavar-kiti", "kalkan-delici", "agir-avcisi", "son-mermi", "enkaz-alani",
  "zafer-serisi", "kidem", "kristal-rafinerisi", "bitisik-devre", "yalniz-kurt",
  "besinci-isci", "ek-yuva-magaza", "bariyer", "ziftli-zemin", "nexus-kalkani",
  "faiz-hesabi", "ganimet-avcisi", "riskli-yatirim", "kan-bankasi"
]) {
  test(`mağaza öğesi ${expectedId} çalıştırılabilir veri taşır`, () => {
    const entry = shopCatalog.find(({ id }) => id === expectedId);
    assert.ok(entry);
    assert.ok(entry.effects.length > 0 || entry.unlocks?.length > 0 || ["besinci-isci", "bariyer", "ziftli-zemin", "riskli-yatirim"].includes(entry.id));
    assert.ok(entry.scope?.kind);
    assert.ok(entry.price >= 0);
  });
}

test("offers contain five unique weighted eligible items", () => {
  const offers = drawShopOffers({ wave: 1, preferredAxes: ["cc"], towers: [], ownedItemIds: [], random: () => 0.5 });
  assert.equal(offers.length, 5);
  assert.equal(new Set(offers.map(({ id }) => id)).size, 5);
  assert.equal(offers.some(({ unlockWave }) => unlockWave && unlockWave > 1), false);
});

test("shop availability enforces wave, stack and exclusion rules", () => {
  assert.equal(isShopItemAvailable({ ...item, unlockWave: 5 }, 4, []), false);
  assert.equal(isShopItemAvailable(item, 5, ["x", "x"]), false);
  assert.equal(isShopItemAvailable({ ...item, id: "bitisik-devre" }, 5, ["yalniz-kurt"]), false);
});

test("tagged shop scope reuses card tower matching", () => {
  const tower = { axes: ["dps"], hitType: "projectile", damageType: "physical", resourceProvider: undefined, engine: { attack: { shape: "single" }, resources: { ammoType: "bullet" } } };
  assert.equal(shopItemAppliesToTower(item, tower), true);
  assert.equal(shopItemAppliesToTower({ ...item, scope: { kind: "tagged", hitTypes: ["focus"] } }, tower), false);
});
