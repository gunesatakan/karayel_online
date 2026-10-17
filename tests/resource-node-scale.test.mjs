/**
 * Kaynak dugumleri harita olcegiyle buyuyor: olcek basina bir takim (7 dugum).
 *
 * Dusman sayisi olcekle dogrusal (`getArenaWaveEnemyCount`); dugumler eskiden
 * her olcekte yediydi. Ilk takim eski kimlikleri tasiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MAP_RESOURCE_NODES, createResourceLayoutRandom, getFixedResourceLayout, getMapResourceNodes, placeResourceNodes, validateResourceLayout } from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const DIMENSIONS = [[12, 18], [16, 24], [20, 30], [24, 36]];

test("her olcekte her turden olcek kadar dugum; ilk takim eski kimlikler", () => {
  for (const scale of [1, 2, 3, 4]) {
    const nodes = getMapResourceNodes(scale);
    assert.equal(nodes.length, MAP_RESOURCE_NODES.length * scale);
    assert.equal(new Set(nodes.map((node) => node.id)).size, nodes.length, "kimlik tekrari");
    assert.deepEqual(nodes.slice(0, MAP_RESOURCE_NODES.length), [...MAP_RESOURCE_NODES]);
    for (const kind of new Set(MAP_RESOURCE_NODES.map((node) => node.kind))) {
      const base = MAP_RESOURCE_NODES.filter((node) => node.kind === kind).length;
      assert.equal(nodes.filter((node) => node.kind === kind).length, base * scale, `${scale}. olcek ${kind}`);
    }
  }
  assert.deepEqual(getMapResourceNodes(2).slice(7).map((node) => `${node.id}:${node.kind}`),
    ["crystal-4:energy", "crystal-5:energy", "crystal-6:energy", "ammo-source-4:gunpowder", "ammo-source-5:mystic", "ammo-source-6:plasma", "iron-2:iron"]);
});

test("buyuk haritada dugumler kurallara uyarak yerlesiyor; sabit yerlesim de hepsini kapsiyor", () => {
  for (const [index, [cols, rows]] of DIMENSIONS.entries()) {
    const nodes = getMapResourceNodes(index + 1);
    for (const seed of [1, 7, 99]) {
      const result = placeResourceNodes({ cols, rows, nodes, random: createResourceLayoutRandom(seed) });
      assert.equal(result.source, "random");
      assert.equal(Object.keys(result.cells).length, nodes.length);
      assert.deepEqual(validateResourceLayout({ cols, rows, nodes }, result.cells), []);
    }
    const fixed = getFixedResourceLayout(cols, rows, nodes);
    const keys = new Set(Object.values(fixed).map((cell) => `${cell.col}:${cell.row}`));
    assert.equal(keys.size, nodes.length, "sabit yerlesimde ust uste dugum");
  }
});

test("oda harita olcegi kadar kristal ve hammadde yatagi yayinliyor", () => {
  const room = createRoom("warrior");
  room.mapScale = 3;
  room.configureArenaForScale();
  room.rollResourceLayout();
  assert.equal(room.getCrystalNodes().length, 9);
  assert.equal(room.getMaterialNodes().length, 12);
  assert.equal(room.getAmmoNodes().length, 9);
  const points = new Set([...room.getCrystalNodes(), ...room.getMaterialNodes()].map((node) => `${node.x}:${node.y}`));
  assert.equal(points.size, 21, "iki dugum ayni yerde");
});
