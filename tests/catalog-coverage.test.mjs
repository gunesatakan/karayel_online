/**
 * Kart ve esya kataloglarinin cesitliligini olcer.
 *
 * Kataloglar bir donem birkac statin etrafinda toplanmisti: 30 statin 18'i hic
 * bir kartta gecmiyor, ucu ise hicbir yerde kullanilmiyordu. Ayrica kod bes ayri
 * kapsam filtresi destekledigi halde kartlar yalnizca `axes` kullaniyordu.
 *
 * Buradaki testler o gerilemeyi engeller ve daha onemlisi olu icerik uretmeyi
 * yasaklar: bir karti sahada karsiligi olmayan bir ozellige kapsamak, oyuncuya
 * hicbir zaman ise yaramayacak bir secenek gostermek demektir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CARD_RARITY_WEIGHT,
  cardAppliesToTower,
  cardCatalog,
  getCardRarity,
  isEmptyTowerGrant,
  resolveTowerAttackMultipliers,
  resolveTowerEngine,
  shopCatalog,
  shopItemAppliesToTower,
  towerCatalog
} from "../packages/shared/dist/index.js";

/** modifiers/index.ts icindeki ModifierStat birlesiminin tamami. */
const ALL_STATS = [
  "damage", "fireRate", "range", "heat", "ammoCost", "energyCost", "shotFuelCost",
  "operatingEnergyCost", "towerHealth", "critChance", "critDamage", "accuracy",
  "markAmplification", "goldGain", "towerCapacity", "cooling", "armorBreak",
  "statusDuration", "statusMagnitude", "ammoEmptyDamage", "turnRate",
  "projectileSpeed", "resourceProduction", "ammoProduction", "workerGatherSpeed",
  "workerSpeed", "airDamage", "damageVsShielded", "damageVsBrute", "targetLockMs"
];

/**
 * Kartlar kaynak binalarini hedefleyemez, bu yuzden yalnizca binalarda anlam
 * tasiyan dort uretim stati kart tarafinda beklenmez; onlari esyalar karsilar.
 */
const BUILDING_ONLY_STATS = ["resourceProduction", "ammoProduction", "workerGatherSpeed", "workerSpeed"];

const allTowers = Object.values(towerCatalog).flat();
const statsUsedBy = (entries) => new Set(entries.flatMap((entry) => (entry.effects ?? []).map((modifier) => modifier.stat)));

test("her modifier stati en az bir kart veya esyada kullanilir", () => {
  const used = new Set([...statsUsedBy(cardCatalog), ...statsUsedBy(shopCatalog)]);
  const missing = ALL_STATS.filter((stat) => !used.has(stat));
  assert.deepEqual(missing, [], `hicbir yerde kullanilmayan stat: ${missing.join(", ")}`);
});

test("kartlar bina disi statlarin tamamina dokunur", () => {
  const used = statsUsedBy(cardCatalog);
  const expected = ALL_STATS.filter((stat) => !BUILDING_ONLY_STATS.includes(stat));
  const missing = expected.filter((stat) => !used.has(stat));
  assert.deepEqual(missing, [], `kartlarda eksik stat: ${missing.join(", ")}`);
});

test("kartlar tek bir statin etrafinda toplanmaz", () => {
  const counts = new Map();
  for (const card of cardCatalog) {
    for (const modifier of card.effects) {
      counts.set(modifier.stat, (counts.get(modifier.stat) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const dominant = Math.max(...counts.values());
  assert.ok(counts.size >= 20, `kartlar yalnizca ${counts.size} stata dokunuyor`);
  assert.ok(dominant / total < 0.3, `tek stat kartlarin %${Math.round((dominant / total) * 100)}'ini kapliyor`);
});

test("kartlar kodun destekledigi her kapsam filtresini kullanir", () => {
  const filters = new Set();
  for (const card of cardCatalog) {
    if (card.scope.kind !== "tagged") continue;
    for (const key of Object.keys(card.scope)) {
      if (key !== "kind") filters.add(key);
    }
  }
  for (const filter of ["axes", "hitTypes", "damageTypes", "shapes", "ammoTypes"]) {
    assert.ok(filters.has(filter), `kartlar ${filter} kapsamini hic kullanmiyor`);
  }
});

test("hicbir kart sahada karsiligi olmayan bir ozellige kapsanmaz", () => {
  for (const card of cardCatalog) {
    if (card.scope.kind !== "tagged") continue;
    const matches = allTowers.filter((tower) => cardAppliesToTower(card, tower));
    assert.ok(matches.length > 0, `${card.id} hicbir kuleye uymuyor, olu icerik`);
  }
});

test("hicbir esya sahada karsiligi olmayan bir ozellige kapsanmaz", () => {
  for (const item of shopCatalog) {
    if (item.scope.kind !== "tagged") continue;
    const matches = allTowers.filter((tower) => shopItemAppliesToTower(item, tower));
    assert.ok(matches.length > 0, `${item.id} hicbir kuleye uymuyor, olu icerik`);
  }
});

test("kart ve esya kimlikleri benzersiz", () => {
  const cardIds = cardCatalog.map((card) => card.id);
  assert.equal(new Set(cardIds).size, cardIds.length, "yinelenen kart kimligi var");
  const itemIds = shopCatalog.map((item) => item.id);
  assert.equal(new Set(itemIds).size, itemIds.length, "yinelenen esya kimligi var");
});

test("nadirlik cekilis agirligini gercekten degistirir", () => {
  const rarities = new Set(cardCatalog.map((card) => getCardRarity(card)));
  for (const rarity of ["common", "uncommon", "rare"]) {
    assert.ok(rarities.has(rarity), `${rarity} nadirlikte hic kart yok`);
  }
  assert.ok(CARD_RARITY_WEIGHT.common > CARD_RARITY_WEIGHT.uncommon);
  assert.ok(CARD_RARITY_WEIGHT.uncommon > CARD_RARITY_WEIGHT.rare);

  // Buyuyen katalogda cekirdek guc kartlari hala sik gorunmeli: 46 kartlik
  // havuzdan 3 secenek cikarken common agirligi toplamin anlamli bir payi olmali.
  const totalWeight = cardCatalog.reduce((sum, card) => sum + CARD_RARITY_WEIGHT[getCardRarity(card)], 0);
  const commonWeight = cardCatalog
    .filter((card) => getCardRarity(card) === "common")
    .reduce((sum, card) => sum + CARD_RARITY_WEIGHT[getCardRarity(card)], 0);
  assert.ok(commonWeight / totalWeight > 0.25, `common paylari cok dusuk: ${(commonWeight / totalWeight).toFixed(2)}`);
});

/**
 * Bir kart uc yoldan is yapabilir: modifier verir, kilit acar, ya da kulenin
 * motoruna stack/aura/trigger/durum etkisi ekler. Ucu de bos olan bir kart
 * oyuncuya bos bir secenek gostermek demektir.
 */
const carriesPayload = (entry) =>
  entry.effects.length > 0
  || (entry.unlocks?.length ?? 0) > 0
  || (entry.grants !== undefined && !isEmptyTowerGrant(entry.grants));

test("her kart ve esya bir sey yapar", () => {
  for (const card of cardCatalog) {
    assert.ok(carriesPayload(card), `${card.id} hicbir etki tasimiyor`);
    assert.match(card.description, /\d/, `${card.id} aciklamasinda sayi yok`);
  }
  for (const item of shopCatalog) {
    const doesSomething = carriesPayload(item) || item.category === "map" || item.category === "risk" || item.id === "besinci-isci";
    assert.ok(doesSomething, `${item.id} hicbir etki tasimiyor`);
  }
});

test("her kilit sunucuda okunur", async () => {
  // Kilit bildirmek ucuz, karsiligini yazmak degil. Bir kartin veya esyanin
  // bildirdigi kilidin sunucuda hicbir okuyucusu yoksa o icerik olu demektir;
  // `nexusShield` bir donem tam olarak boyleydi.
  const source = await readFile(new URL("../apps/server/src/rooms/MatchRoom.ts", import.meta.url), "utf8");
  const declared = new Set([
    ...cardCatalog.flatMap((card) => card.unlocks ?? []),
    ...shopCatalog.flatMap((item) => item.unlocks ?? [])
  ]);
  // Hedefleme kilitleri tek tek degil, gelen modun uzerinden kuruluyor; okuyucu
  // o sablon.
  const hasReader = (unlock) => source.includes(`"${unlock}"`)
    || (unlock.startsWith("targeting:") && source.includes("`targeting:${message.mode}`"));
  for (const unlock of declared) {
    assert.ok(hasReader(unlock), `${unlock} kilidini sunucuda okuyan yok`);
  }
});

test("motor eklentileri cozulmus motora gercekten giriyor", () => {
  const granting = [...cardCatalog, ...shopCatalog].filter((entry) => entry.grants);
  assert.ok(granting.length > 0, "hicbir kart veya esya motor eklentisi tasimiyor");

  for (const entry of granting) {
    // Grant tasiyan her icerigin uydugu en az bir kule olmali, yoksa eklenti
    // hicbir motora girmez.
    const target = allTowers.find((tower) => !tower.resourceProvider
      && tower.engine
      && (entry.scope.kind !== "tagged" || cardAppliesToTower({ ...entry, stackable: true }, tower)));
    assert.ok(target, `${entry.id} eklentisi hicbir motora giremiyor`);

    const base = target.engine;
    const resolved = resolveTowerEngine(base, [entry.grants]);
    const grew = (key) => (resolved?.[key]?.length ?? 0) > (base?.[key]?.length ?? 0);
    const attackChanged = JSON.stringify(resolved?.attack) !== JSON.stringify(base.attack);
    // Geometri carpanlari motora yazilmaz, ayri tasinir; ikisine de bakmak
    // zorundayiz yoksa carpan tasiyan kartlar olu gorunmeden olu kalabilir.
    const multipliers = resolveTowerAttackMultipliers([entry.grants]);
    const scales = Object.entries(multipliers).some(([, value]) => value !== 1);
    assert.ok(
      grew("stacks") || grew("auras") || grew("triggers") || grew("statusEffects") || attackChanged || scales,
      `${entry.id} cozulmus motorda hicbir sey degistirmiyor`
    );
  }
});
