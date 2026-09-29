import test from "node:test";
import assert from "node:assert/strict";
import { applyEnemyMark, cardCatalog, drawCards, getMarkDamageMultiplier, getShopItem, isMarkOnlyChoice } from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

test("yeni işaret eski işareti tamamen değiştirir", () => {
  const tracking = { id: "tracking", add: 0.4, expiresAt: 2000 };
  const underworld = applyEnemyMark(tracking, { id: "underworld", add: 0.2, expiresAt: 3000 });
  assert.deepEqual(underworld, { id: "underworld", add: 0.2, expiresAt: 3000 });
});

test("işaret ve kart bonusu toplamsaldır ve +%100 tavanına uyar", () => {
  const mods = [
    { source: "card:a", scope: "player", stat: "markAmplification", add: 0.6 },
    { source: "card:b", scope: "player", stat: "markAmplification", add: 0.6 }
  ];
  assert.equal(getMarkDamageMultiplier({ id: "tracking", add: 0.4, expiresAt: 2000 }, mods, 1000), 2);
  assert.equal(getMarkDamageMultiplier({ id: "tracking", add: 0.4, expiresAt: 500 }, [], 1000), 1);
});

/**
 * Isaretleme Agi "isaretli dusmana +%15" diyor. Bir donem isaret yokken de
 * her vurusa x1.15 veriyordu; bonus artik yalnizca etkin isarette isliyor.
 */
test("kart bonusu işaretsiz düşmana işlemez, işaretli düşmana işler", () => {
  const mods = cardCatalog.find((card) => card.id === "isaretleme-agi").effects;
  assert.equal(getMarkDamageMultiplier(undefined, mods, 1000), 1);
  assert.equal(getMarkDamageMultiplier({ id: "", add: 0, expiresAt: 0 }, mods, 1000), 1);
  assert.equal(getMarkDamageMultiplier({ id: "tracking", add: 0.2, expiresAt: 500 }, mods, 1000), 1, "suresi dolmus isaret");
  assert.ok(Math.abs(getMarkDamageMultiplier({ id: "guidance", add: 0, expiresAt: 2000 }, mods, 1000) - 1.15) < 1e-9);
  assert.ok(Math.abs(getMarkDamageMultiplier({ id: "tracking", add: 0.2, expiresAt: 2000 }, mods, 1000) - 1.35) < 1e-9);
});

/** Gercek hasar yolu: kulesiz vurus, kritik ve kule bonuslari devre disi. */
function hit({ withCard, mark, source = "test-source" }) {
  const room = createRoom("zeynep");
  if (withCard) room.state.players.get("p1").runModifiers.push(...cardCatalog.find((card) => card.id === "isaretleme-agi").effects);
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  Object.assign(enemy, { hp: 1e6, maxHp: 1e6, shield: 0, maxShield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
  if (mark === "tracking") room.applyTrackingStacks(enemy, Date.now() + 5000, 1);
  else if (mark) room.setEnemyMark(enemy, mark, 0, Date.now() + 5000);
  room.damageEnemy(enemy, 100, 0, source, "p1", "true");
  return 1e6 - enemy.hp;
}

test("İşaretleme Ağı: işaretsiz düşman bonus almaz, işaretli düşman +%15 alır", () => {
  assert.ok(Math.abs(hit({ withCard: false, mark: undefined }) - 100) < 1e-6);
  assert.ok(Math.abs(hit({ withCard: true, mark: undefined }) - 100) < 1e-6, "isaretsiz dusmana kart bonusu islendi");
  assert.ok(Math.abs(hit({ withCard: false, mark: "test" }) - 100) < 1e-6);
  assert.ok(Math.abs(hit({ withCard: true, mark: "test" }) - 115) < 1e-6, "isaretli dusmana +%15 islemedi");
  // Takip isaretinin kendi +%20'si ve kartin +%15'i toplanir.
  assert.ok(Math.abs(hit({ withCard: false, mark: "tracking" }) - 120) < 1e-6);
  assert.ok(Math.abs(hit({ withCard: true, mark: "tracking" }) - 135) < 1e-6);
});

test("izci kulesi kendi takip işaretinden katkı almaz ama kart bonusunu alır", () => {
  assert.ok(Math.abs(hit({ withCard: false, mark: "tracking", source: "warrior-1" }) - 100) < 1e-6);
  assert.ok(Math.abs(hit({ withCard: true, mark: "tracking", source: "warrior-1" }) - 115) < 1e-6);
  assert.ok(Math.abs(hit({ withCard: true, mark: undefined, source: "warrior-1" }) - 100) < 1e-6);
});

test("yalnızca işarete bağlı seçenekler ayırt edilir", () => {
  assert.ok(isMarkOnlyChoice(cardCatalog.find((card) => card.id === "isaretleme-agi")));
  assert.ok(isMarkOnlyChoice(getShopItem("komuta-modulu")));
  assert.equal(isMarkOnlyChoice(cardCatalog.find((card) => card.id === "namlu-asinmasi")), false);
  assert.equal(isMarkOnlyChoice(cardCatalog.find((card) => card.id === "nexus-tamiri")), false, "efektsiz kilit karti");
});

/** Tohumlu rastgele: cekilis sikligini olcen test her calismada ayni sonucu versin. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("işaret kaynağı olmayan takımda İşaretleme Ağı seyrek çıkar", () => {
  const count = (marksAvailable) => {
    const random = seeded(7);
    let hits = 0;
    for (let draw = 0; draw < 4000; draw += 1) {
      const [card] = drawCards({ count: 1, preferredAxes: ["amplify", "dps"], towers: [], ownedCardIds: [], marksAvailable, random });
      if (card.id === "isaretleme-agi") hits += 1;
    }
    return hits;
  };
  const alive = count(true);
  const dead = count(false);
  assert.ok(alive > 50, `isaret kaynagi varken de neredeyse hic cikmadi: ${alive}`);
  assert.ok(dead < alive * 0.3, `isaret kaynagi yokken geri cekilmedi: ${dead} / ${alive}`);
  assert.equal(count(undefined), alive, "bilgi verilmezse cekilis eskisi gibi kalmali");
});

test("takımın işaret kaynağı sunucuda bulunur", () => {
  assert.equal(createRoom("zeynep").canTeamMarkEnemies(), false);
  assert.equal(createRoom("warrior").canTeamMarkEnemies(), true, "Atakan'in Yonlendirme becerisi isaret koyar");
});
