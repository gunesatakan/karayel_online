/**
 * Hedefli kartin kulesi haritadan seciliyor.
 *
 * Kart perdesindeki kule listesinde ayni turden kuleler yalnizca adlariyla
 * ayriliyordu. Simdi hedefli karta dokununca perde gizleniyor, haritanin
 * cevresinde secim cercevesi ve uygun kulelerde halka cikiyor; kuleye
 * dokunmak onizlemeyi aciyor, "uygula" karti gonderiyor.
 *
 * Kilitlenen sozler:
 *   1. Hedefli kart haritadan secimi baslatiyor; uygun kule yoksa liste
 *      ekraninin bos mesaji kaliyor.
 *   2. Secim kipinde haritaya dokunus yalnizca hedef seciyor; uygun olmayan
 *      kulede sebep yaziliyor, uygun kulede onizleme -> secim bitiyor -> kart.
 *   3. Cerceve kare dongusunde ciziliyor; perde kapaninca secim de bitiyor.
 *   4. Perde secim boyunca gizli; ust serit ve metinler iki dilde.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const scene = read("apps/web/src/scenes/GameScene.ts");
const method = (name) => {
  const start = scene.indexOf(`  private ${name}(`);
  assert.ok(start > 0, `${name} yok`);
  const next = scene.indexOf("\n  private ", start + 10);
  return scene.slice(start, next);
};

test("hedefli kart haritadan secimi baslatiyor; uygun kule yoksa liste ekrani", () => {
  assert.match(scene, /if \(card\.scope\.kind === "targeted"\) this\.startCardTargetPick\(card\);/);
  const start = method("startCardTargetPick");
  assert.match(start, /if \(!root \|\| !eligible\) \{\n\s+this\.showTargetedTowerChoices\(card\);\n\s+return;/);
  assert.match(start, /root\.classList\.add\("card-draft--map-pick"\);/);
  assert.match(start, /this\.ignoreMapPointerUntil = performance\.now\(\) \+ 250;/);
});

test("secim kipinde dokunus yalnizca hedef seciyor; onizleme sonra kart", () => {
  const pointer = method("handleMapPointer");
  const pick = pointer.indexOf("if (this.cardTargetPick && this.isBattlePointer(pointer))");
  assert.ok(pick > 0 && pick < pointer.indexOf("this.hitSellButton(pointer)"), "secim kipi satistan ve kule seciminden once bakilmali");
  const tap = method("resolveCardTargetTap");
  assert.match(tap, /if \(tower\.ownerId !== this\.localSessionId \|\| !this\.canTowerHoldCard\(tower\)\) \{\n\s+this\.showNotice\(t\("scene\.card\.mapPickInvalid"\)\);\n\s+return;/);
  assert.match(tap, /this\.previewTowerChange\(\{ cardId, towerId: tower\.id \}, \(\) => \{\n\s+this\.endCardTargetPick\(\);\n\s+this\.submitCardChoice\(\{ cardId, towerId: tower\.id \}\);/);
});

test("cerceve kare dongusunde; perde kapaninca secim bitiyor", () => {
  assert.match(scene, /this\.tickWallLine\(now\);\n\s+this\.renderMapPickFrame\(now\);/);
  const frame = method("renderMapPickFrame");
  assert.match(frame, /const pulse = still \? 1 :/, "hareket azaltmada sabit");
  assert.match(frame, /this\.canTowerHoldCard\(tower\)/, "halka yalnizca karti alabilecek kulelerde");
  assert.match(method("hideCardChoices"), /^  private hideCardChoices\(\) \{\n\s+this\.endCardTargetPick\(\);/);
  const end = method("endCardTargetPick");
  assert.match(end, /pick\.banner\.remove\(\);/);
  assert.match(end, /classList\.remove\("card-draft--map-pick"\)/);
});

test("perde secim boyunca gizli; metinler iki dilde", () => {
  const css = read("apps/web/src/style.css");
  assert.match(css, /#card-root\.card-draft--map-pick \{\s+display: none;/);
  assert.match(css, /\.map-pick-banner \{/);
  const locale = read("apps/web/src/locales/areas/scene.ts");
  assert.equal(locale.match(/"scene\.card\.mapPickTitle":/g)?.length, 2);
  assert.equal(locale.match(/"scene\.card\.mapPickInvalid":/g)?.length, 2);
});
