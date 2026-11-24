/**
 * Esya yazilari (magaza ve envanter).
 *
 * Sahibin istegi (2026-11-24): "Esya yazilari cok kucuk oldugu icin
 * okunamiyor. Yazi boyutunu 2 katina cikar. Tasmadigina emin ol."
 *
 * Magaza alt panelin icinde ve taban `.game-controls button` kurali (satir
 * ici flex, ortali, `touch-action: none`) magaza kartini yan yana bir satira
 * ceviriyordu: dar ekranda ad 62 piksele sikisiyor, aciklama 9 piksel
 * kaliyordu. Kartin kendi kurali alt alta dizip yazilari iki katina
 * cikariyor; satirlar icerik boyunda (liste kayiyor, kart kirpilmiyor).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../apps/web/src/style.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SHOP = ".game-controls .gold-shop__offers button.gold-shop__item";
const INVENTORY = ".game-controls .game-controls__inventory-list button.gold-shop__item";
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fontSize = (source, selector) => {
  const match = source.match(new RegExp(`${escape(selector)} \\{[^}]*font-size: (\\d+)px`));
  return match ? Number(match[1]) : undefined;
};
const mobile = css.slice(css.indexOf("@media (max-width: 700px), (max-height: 560px) and (pointer: coarse) {\n  .gold-shop {"));

test("magaza karti taban dugme kuralindan ayrilmis: alt alta, sola yasli, ustunden kayiyor", () => {
  const rule = css.match(new RegExp(`${escape(SHOP)} \\{([^}]*)\\}`))?.[1] ?? "";
  assert.match(rule, /display: grid;/);
  assert.match(rule, /align-items: start;/);
  assert.match(rule, /text-align: left;/);
  assert.match(rule, /white-space: normal;/);
  assert.match(rule, /touch-action: pan-y;/, "kartin ustunden surukleyince liste kaymiyor");
  assert.match(css, new RegExp(`${escape(SHOP)} > span,\\n${escape(SHOP)} > strong,\\n${escape(SHOP)} > small \\{[^}]*overflow-wrap: anywhere;`), "uzun kelime tasabilir");
  // Satir kartin icerigi kadar: liste kutusuna bolunurse uzun aciklama kirpilirdi.
  // Genis, dar ve kisa yatay ekranin uc kurali da.
  assert.equal((css.match(/\.gold-shop__offers \{[^}]*grid-auto-rows: max-content;/g) ?? []).length, 3);
  assert.doesNotMatch(css, /\.gold-shop__offers \{[^}]*grid-auto-rows: minmax/, "satir kutuya bolunuyor");
});

test("kule panelindeki esya cipleri iki kat; uzun ad kiriliyor, kart cipleri kompakt", () => {
  const ui = readFileSync(new URL("../apps/web/src/game-control-ui.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const CHIP = ".game-controls .tower-sheet .tower-effects__group--items button.tower-effects__chip";
  // Eski boylar: cip 12, bos yazisi 10, aciklama 11.
  assert.equal(fontSize(css, CHIP), 24);
  assert.equal(fontSize(css, ".tower-sheet .tower-effects__group--items .tower-items__empty"), 20);
  assert.equal(fontSize(css, ".tower-sheet .tower-effects__detail--item"), 22);
  const chip = css.match(new RegExp(`${escape(CHIP)} \\{([^}]*)\\}`))?.[1] ?? "";
  assert.match(chip, /max-width: 100%;/, "cip panelden tasabilir");
  assert.match(chip, /overflow-wrap: anywhere;/, "uzun ad kirilmiyor");
  // Kart cipleri ayni boyda kaliyor.
  assert.match(css, /\.game-controls \.tower-sheet button\.tower-effects__chip \{[^}]*font: 600 12px\/1\.1 Rajdhani/);
  // Isaretler yalnizca esya grubunda ve esyanin aciklamasinda.
  assert.match(ui, /addGroup\(\n\s+capacity > 0 \? t\("controls\.towerEffects\.itemsCapacity"[^\n]*\n\s+itemEntries,\n\s+t\("controls\.towerEffects\.noItems"\),\n\s+true\n\s+\);/);
  assert.match(ui, /group\.className = items \? "tower-effects__group tower-effects__group--items" : "tower-effects__group";/);
  assert.match(ui, /detail\.className = focused\.key\.startsWith\("item:"\) \? "tower-effects__detail tower-effects__detail--item" : "tower-effects__detail";/);
});

test("esya yazilari iki kati: magaza (genis ve dar ekran) ve envanter", () => {
  // Eski boylar: genis 9/14/11/14, dar 8/12/9/12, envanter 9/12/10/12.
  assert.deepEqual(["span", "strong", "small", "b"].map((part) => fontSize(css, `${SHOP} > ${part}`)), [18, 28, 22, 28]);
  assert.deepEqual(["span", "strong", "small", "b"].map((part) => fontSize(mobile, `${SHOP} > ${part}`)), [16, 24, 18, 24]);
  assert.deepEqual(["span", "strong", "small", "b"].map((part) => fontSize(css, `${INVENTORY} > ${part}`)), [18, 24, 20, 24]);
  // Dar sutun iki kat yaziya yetmiyor: kart en az 300 piksel, telefonda tek sutun.
  assert.match(css, /\.game-controls__inventory-list \{\n {2}display: grid;\n {2}grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 300px\), 1fr\)\);/);
  assert.match(css, /\.gold-shop__offers \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 300px\), 1fr\)\);/);
});
