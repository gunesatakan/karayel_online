/**
 * Surukleme onizlemesi yolda olan kurulumlari sayiyor.
 *
 * AttackLord ve ZentaX'in bedeni kareye yuruyup kuruyor; sunucu kurana kadar
 * kule anlik goruntude yok. O surede yanina surukelenen ikinci kule
 * "Yalnız" diyor, "Bozar" uyarisi cikmiyordu (2026-10 oyuncu raporu).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultEditableMap, getMapGridSize, gridToWorld, towerCatalog } from "../packages/shared/dist/index.js";
import { importWebModule } from "./helpers/web-module.mjs";

const { SynergyMarks } = await importWebModule("apps/web/src/vfx/synergy-marks.ts");

function fakeText() {
  const text = { text: "", visible: false, displayWidth: 40, displayHeight: 12 };
  for (const name of ["setScale", "setDepth", "setColor", "setOrigin", "setPosition"]) text[name] = () => text;
  text.setText = (value) => { text.text = value; return text; };
  text.setVisible = (value) => { text.visible = value; return text; };
  return text;
}
function fakeGraphics() {
  const proxy = new Proxy({}, { get: () => () => proxy });
  return proxy;
}
const scene = { add: { graphics: () => fakeGraphics(), text: () => fakeText() } };

const map = createDefaultEditableMap();
const cell = getMapGridSize(map);
const warrior1 = towerCatalog.warrior.find((definition) => definition.id === "warrior-1");

function previewNextTo(pending) {
  const marks = new SynergyMarks(scene, { glyph: 1, preview: 2 });
  marks.sync([], map, "p1", cell, false);
  const at = gridToWorld(5, 6, map);
  const next = gridToWorld(6, 6, map);
  marks.preview({
    definition: warrior1, characterId: "warrior", x: next.x, y: next.y, canPlace: true, localSessionId: "p1",
    map, cellSize: cell, bounds: { left: 0, right: 1000, top: 0, bottom: 1000 },
    pending: pending ? [{ x: at.x, y: at.y, definitionId: "warrior-1" }] : []
  });
  return { headline: marks.headline.visible ? marks.headline.text : "", warning: marks.warning.visible ? marks.warning.text : "" };
}

test("yolda olan kurulumun yanina surukelenen kule yalnizligi bozdugunu soyluyor", () => {
  const without = previewNextTo(false);
  assert.match(without.headline, /Yalnız|Isolated/);
  assert.equal(without.warning, "");
  const withPending = previewNextTo(true);
  assert.match(withPending.headline, /Yalnızlık yok|No isolation/);
  assert.match(withPending.warning, /Bozar|Breaks/);
});
