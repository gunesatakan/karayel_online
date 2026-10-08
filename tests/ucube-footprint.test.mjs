/**
 * Ucube 2x2.
 *
 * Ucube artik dort kare kapliyor: Saray Arsivi gibi kare kosesine oturuyor.
 * Mermisi de kuleyle orantili: iki kat kalin, boyu ayni. Namludan cikis
 * tower-muzzle.test.mjs'te, kademe resimleri tower-art.test.mjs'te.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  getMapGridSize,
  getMapOrigin,
  getTowerGridSpan,
  gridToWorld,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const client = { sessionId: "p1", send() {} };
const profiles = await importWebModule("apps/web/src/vfx/vfx-profiles.ts");
const shots = await importWebModule("apps/web/src/vfx/atakan-shots.ts");

test("Ucube dort kare kapliyor; istemci ve sunucu ayni izi okuyor", () => {
  const ucube = towerCatalog.warrior.find((definition) => definition.id === "warrior-6");
  assert.equal(ucube.engine.placement.footprintSpan, 2);
  // Istemcinin okudugu iz sunucunun dogruladigi alandan geliyor.
  assert.equal(getTowerGridSpan("warrior-6"), 2);
  assert.equal(getTowerGridSpan("zeynep-7"), 2);
  assert.equal(getTowerGridSpan("warrior-1"), 1);
  assert.equal(getTowerGridSpan("bilinmeyen-kule"), 1);

  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-6");
  assert.ok(spot, "Ucube icin yer bulunamadi");
  room.placeTower(client, { ...spot, definitionId: "warrior-6" });
  const tower = [...room.towers.values()].find((entry) => entry.definition.id === "warrior-6");
  assert.ok(tower, "Ucube kurulamadi");
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  // Kare kosesine oturuyor: merkez dort karenin ortak kosesi.
  assert.ok(Number.isInteger(Math.round(((tower.x - origin.x) / gridSize) * 1e6) / 1e6), "x kare kosesinde degil");
  assert.ok(Number.isInteger(Math.round(((tower.y - origin.y) / gridSize) * 1e6) / 1e6), "y kare kosesinde degil");
  const cells = room.getTowerFootprintCells(tower.x, tower.y, "warrior-6");
  assert.equal(cells.length, 4);
  for (const cell of cells) {
    const world = gridToWorld(cell.col, cell.row, room.activeMap);
    assert.equal(room.canPlaceTower(world.x, world.y, "warrior-1", "horizontal"), false, `${cell.col}:${cell.row} bos sayildi`);
  }
});

test("Ucube mermisi iki kat kalin, boyu ayni; diger kuleler degismedi", () => {
  const ucube = profiles.getVfxProfile("warrior-6");
  for (const recipe of ucube.tiers) assert.equal(recipe.thickness, 2);
  for (const id of ["warrior-1", "warrior-2", "warrior-4", "zeynep-1", "archer-1", "onur-2"]) {
    for (const recipe of profiles.getVfxProfile(id).tiers) assert.equal(recipe.thickness, 1, id);
  }

  // Ayni mermi, ayni an: kalinlik 1 ile 2 arasinda her cizgi ve topun capi
  // iki kat, kuyrugun boyu ayni.
  for (const tier of [1, 2, 3]) {
    const draw = (thickness) => {
      const body = createRecorder();
      shots.drawUcubeShot(body, {
        x: 100, y: 200, angle: 0, radius: 7, scale: 1, tier, recipe: { ...ucube.tiers[tier - 1], thickness }, hue: ucube.tiers[tier - 1].color,
        now: 1234, seed: 17, still: false, sparks: true, extra: 1, trail: undefined, trailCapacity: 8, trailScale: 1
      });
      const widths = body.calls.filter(([name]) => name === "lineStyle").map(([, width]) => width);
      const xs = body.calls.filter(([name]) => name === "fillTriangle").flatMap(([, x1, , x2, , x3]) => [x1, x2, x3]);
      const ys = body.calls.filter(([name]) => name === "fillTriangle").flatMap(([, , y1, , y2, , y3]) => [y1, y2, y3]);
      const pathXs = body.calls.filter(([name]) => name === "moveTo" || name === "lineTo").map(([, x]) => x);
      return { widths, height: Math.max(...ys) - Math.min(...ys), tailEnd: pathXs.length ? Math.min(...pathXs) : Math.min(...xs) };
    };
    const ince = draw(1);
    const kalin = draw(2);
    assert.equal(kalin.widths.length, ince.widths.length, `kademe ${tier}: cizgi sayisi`);
    kalin.widths.forEach((width, index) => assert.ok(Math.abs(width - ince.widths[index] * 2) < 1e-9, `kademe ${tier} cizgi ${index}: ${width}, ince ${ince.widths[index]}`));
    assert.ok(kalin.height > ince.height * 1.6, `kademe ${tier}: govde kalinlasmadi (${ince.height.toFixed(1)} -> ${kalin.height.toFixed(1)})`);
    if (tier >= 2) assert.ok(Math.abs(kalin.tailEnd - ince.tailEnd) < 7 * 1.2, `kademe ${tier}: kuyruk uzadi (${ince.tailEnd.toFixed(1)} -> ${kalin.tailEnd.toFixed(1)})`);
  }
});
