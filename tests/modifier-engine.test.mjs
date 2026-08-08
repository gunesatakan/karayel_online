import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TARGETED_CARDS_PER_TOWER,
  appendLegacyMultiplier,
  canAcceptTargetedCard,
  getModifierAdd,
  getModifierMultiplier,
  resolveModifierBreakdown
} from "../packages/shared/dist/index.js";

const modifier = (source, stat, add, scope = "player") => ({ source, stat, add, scope });

test("aynı stat modifierları çarpılmaz, toplanır", () => {
  const mods = [modifier("card:a", "damage", 0.25), modifier("card:b", "damage", 0.4, "tower")];
  assert.equal(getModifierAdd(mods, "damage"), 0.65);
  assert.equal(getModifierMultiplier(mods, "damage"), 1.65);
});

test("stat tavanı toplamsal havuzu sınırlar", () => {
  const mods = [modifier("card:a", "markAmplification", 0.75), modifier("card:b", "markAmplification", 0.5)];
  assert.equal(getModifierAdd(mods, "markAmplification"), 1);
  assert.equal(getModifierAdd(mods, "markAmplification", { markAmplification: 0.8 }), 0.8);
});

test("isimli eski çarpan dökümü mevcut sonucu korur", () => {
  let breakdown = { base: 40, mods: [] };
  breakdown = appendLegacyMultiplier(breakdown, "atakan:pasif", 1.5);
  breakdown = appendLegacyMultiplier(breakdown, "kule:aura", 1.2);
  assert.deepEqual(breakdown.mods.map(({ source }) => source), ["atakan:pasif", "kule:aura"]);
  assert.equal(resolveModifierBreakdown(breakdown), 72);
});

test("bir kule en fazla üç hedefli kart kabul eder", () => {
  assert.equal(MAX_TARGETED_CARDS_PER_TOWER, 3);
  assert.equal(canAcceptTargetedCard(["a", "b"]), true);
  assert.equal(canAcceptTargetedCard(["a", "b", "c"]), false);
});
