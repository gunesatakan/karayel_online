/**
 * Yerlestirme onizlemesinin menzil halkasi.
 *
 * 1. Saf yardimci (`getPlacementPreviewRange`): AttackLord kulesi komsusuz
 *    karede yalnizlik carpaniyla buyuyor, komsulu karede normal; carpan
 *    `ATAKAN_ISOLATION_MULTIPLIER`dan okunuyor (denge gecisi sayiyi
 *    degistirirse test de onu izliyor).
 * 2. Ayni sayi sunucunun gercekten uyguladigi menzil: gercek MatchRoom'a
 *    kurulan kulenin `getTowerRange` / `getTowerMinimumRange` degeri.
 * 3. Cizici: halka yalnizca kare degisince yeniden ciziliyor; gecersiz
 *    karede soluk kirmizi, yalniz karede turkuaz isaret.
 * 4. Sahne: cekmeceden surukleme halkayi ciziyor, birakma ve vazgecme siliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ATAKAN_ISOLATION_MULTIPLIER,
  createDefaultEditableMap,
  getMapGridSize,
  getPlacementPreviewRange,
  getTowerBaseLevelRange,
  gridToWorld,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const map = createDefaultEditableMap();
const definitions = new Map(Object.values(towerCatalog).flat().map((definition) => [definition.id, definition]));
const def = (id) => {
  const definition = definitions.get(id);
  assert.ok(definition, `${id} katalogda yok`);
  return definition;
};
const at = (col, row) => gridToWorld(col, row, map);
let nextId = 0;
const yapi = (definitionId, col, row) => ({ id: `s${(nextId += 1)}`, ...at(col, row), definition: def(definitionId) });
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);

test("AttackLord kulesi: komsusuz karede halka yalnizlik carpaniyla buyuk, komsulu karede normal", () => {
  const spot = at(6, 6);
  const alone = getPlacementPreviewRange({ definition: def("warrior-1"), characterId: "warrior", ...spot, structures: [], map });
  assert.equal(alone.kind, "attack");
  assert.equal(alone.isolationEligible, true);
  assert.equal(alone.isolated, true);
  near(alone.radius, alone.baseRadius * ATAKAN_ISOLATION_MULTIPLIER, "yalniz halka");
  const scale = getMapGridSize(map) / 34;
  near(alone.baseRadius, getTowerBaseLevelRange(def("warrior-1"), 1) * scale, "taban halka tower-stats'tan");

  // Kosegen komsu da yalnizligi bozuyor (sekiz kare).
  const crowded = getPlacementPreviewRange({ definition: def("warrior-1"), characterId: "warrior", ...spot, structures: [yapi("archer-1", 7, 7)], map });
  assert.equal(crowded.isolated, false);
  near(crowded.radius, alone.baseRadius, "komsulu halka");

  // Iki kare uzaktaki kule bozmuyor; duvar hic bozmuyor.
  const far = getPlacementPreviewRange({ definition: def("warrior-1"), characterId: "warrior", ...spot, structures: [yapi("archer-1", 8, 6), yapi("wall-1", 7, 6)], map });
  assert.equal(far.isolated, true);
});

test("yalnizlik yalnizca AttackLord'a: baska operatorun kulesi ve Sunucu buyumuyor", () => {
  const spot = at(6, 6);
  const archer = getPlacementPreviewRange({ definition: def("archer-1"), characterId: "archer", ...spot, structures: [], map });
  assert.equal(archer.isolationEligible, false);
  assert.equal(archer.isolated, false);
  near(archer.radius, archer.baseRadius, "Melis kulesi");
  // Sunucu butun arenayi bagliyor: cizilecek bir cember yok.
  assert.equal(getPlacementPreviewRange({ definition: def("warrior-2"), characterId: "warrior", ...spot, structures: [], map }).kind, "none");
});

test("menzili olmayan yapi halka cizmiyor; Tamir Merkezi cemberini, Jackpot olu bolgesini gosteriyor", () => {
  const spot = at(6, 6);
  for (const id of ["wall-1", "warrior-7", "warrior-8", "warehouse-1"]) {
    assert.equal(getPlacementPreviewRange({ definition: def(id), characterId: def(id).characterId, ...spot, structures: [], map }).kind, "none", id);
  }
  // Saray Arsivi AURA kulesi: halka aura alani (2,5 kare), seviyeyle buyumuyor.
  const palace = getPlacementPreviewRange({ definition: def("zeynep-7"), characterId: "zeynep", ...spot, structures: [], map });
  assert.equal(palace.kind, "aura");
  near(palace.radius, 2.5 * getMapGridSize(map), "Saray Arsivi aura halkasi");
  near(getPlacementPreviewRange({ definition: def("zeynep-7"), characterId: "zeynep", ...spot, structures: [], map, level: 5 }).radius, palace.radius, "5. seviye ayni halka");
  const depot = getPlacementPreviewRange({ definition: def("repair-depot-1"), characterId: "archer", ...spot, structures: [], map });
  assert.equal(depot.kind, "aura");
  assert.ok(depot.radius > 0);
  const jackpot = getPlacementPreviewRange({ definition: def("onur-2"), characterId: "onur", ...spot, structures: [], map });
  assert.ok(jackpot.minimumRadius > 0 && jackpot.minimumRadius < jackpot.radius);
});

/** Sunucuya kurulan kule: halka sunucunun uyguladigi menzille ayni olmali. */
function serverRanges(characterId, definition, neighbour) {
  const room = createRoom(characterId);
  const player = room.state.players.get("p1");
  player.approval = 0;
  player.stress = 0;
  const spot = findBuildableSpot(room, definition.id);
  if (!spot) return undefined;
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: definition.id });
  const tower = [...room.towers.values()].find((entry) => entry.definition.id === definition.id);
  if (!tower) return undefined;
  if (neighbour) {
    // Komsu karede bir kule: odanin kendi yerlestirmesi yasaklayabilir, modeli elle ekliyoruz.
    room.towers.set("komsu", { ...tower, id: "komsu", x: tower.x + getMapGridSize(room.activeMap), definition: def("archer-1"), characterId: "archer" });
  }
  const structures = [...room.towers.values()].filter((entry) => entry.id !== tower.id);
  const preview = getPlacementPreviewRange({ definition, characterId, x: tower.x, y: tower.y, structures, map: room.activeMap });
  // Yorunge kulesinin eristigi yer bicagin ucu: secili kulenin halkasi da onu ciziyor.
  const orbit = definition.engine?.attack.executor === "orbit";
  return { preview, range: orbit ? room.getOrbitBladeLengthForTower(tower) : room.getTowerRange(tower), minimumRange: room.getTowerMinimumRange(tower) };
}

test("halka sunucunun uyguladigi menzille ayni (yalniz ve komsulu, AttackLord ve Onur)", () => {
  const checked = [];
  for (const characterId of ["warrior", "onur"]) {
    for (const definition of towerCatalog[characterId]) {
      if (definition.resourceProvider || definition.range <= 0 || definition.id === "warrior-2") continue;
      for (const neighbour of [false, true]) {
        const result = serverRanges(characterId, definition, neighbour);
        if (!result) continue;
        const where = `${definition.id}${neighbour ? " komsulu" : " yalniz"}`;
        near(result.preview.radius, result.range, `${where} menzil`);
        near(result.preview.minimumRadius, result.minimumRange, `${where} olu bolge`);
        checked.push(where);
      }
    }
  }
  assert.ok(checked.some((where) => where.startsWith("warrior-1 yalniz")), checked.join(", "));
  assert.ok(checked.some((where) => where.startsWith("warrior-1 komsulu")), checked.join(", "));
  assert.ok(checked.some((where) => where.startsWith("onur-2")), checked.join(", "));
  assert.ok(checked.some((where) => where.startsWith("onur-1")), checked.join(", "));
});

const web = await importWebModule("apps/web/src/vfx/placement-range.ts");

function createPreview() {
  const graphics = createRecorder();
  const scene = { add: { graphics: () => graphics } };
  return { preview: new web.PlacementRangePreview(scene, 26), graphics };
}

const methods = (graphics) => graphics.calls.map(([name]) => name);

test("halka yalnizca kare ya da saha degisince yeniden ciziliyor", () => {
  const { preview, graphics } = createPreview();
  const spot = at(6, 6);
  const args = { definition: def("warrior-1"), characterId: "warrior", ...spot, canPlace: true, map, structures: [] };
  assert.equal(preview.update(args), true);
  const afterFirst = graphics.calls.length;
  assert.equal(preview.update({ ...args }), false, "ayni kare");
  assert.equal(graphics.calls.length, afterFirst, "ayni karede cagri yok");
  assert.equal(preview.update({ ...args, ...at(7, 6) }), true, "yeni kare");
  assert.equal(preview.update({ ...args, ...at(7, 6), structures: [yapi("archer-1", 8, 6)] }), true, "saha degisti");
  assert.equal(preview.current.isolated, false);
});

test("cizim: yalniz karede buyuk halka ve turkuaz isaret, gecersiz karede yalnizca soluk kirmizi cizgi", () => {
  const { preview, graphics } = createPreview();
  const spot = at(6, 6);
  preview.update({ definition: def("warrior-1"), characterId: "warrior", ...spot, canPlace: true, map, structures: [] });
  const strokes = graphics.calls.filter(([name]) => name === "strokeCircle");
  assert.equal(strokes.length, 2, "menzil ve yalnizliksiz halka");
  near(strokes[0][3], preview.current.radius, "dis halka yalniz menzil");
  near(strokes[1][3], preview.current.baseRadius, "ic halka taban menzil");
  assert.ok(methods(graphics).includes("fillPoints"), "yalnizlik isareti");
  // Dolgu en fazla cok soluk; parilti yok.
  for (const [, , alpha] of graphics.calls.filter(([name]) => name === "fillStyle")) {
    assert.ok(alpha <= 0.05 || alpha >= 0.85, `beklenmeyen dolgu ${alpha}`);
  }
  const fills = graphics.calls.filter(([name]) => name === "fillCircle");
  assert.equal(fills.length, 1);

  const invalid = createPreview();
  invalid.preview.update({ definition: def("warrior-1"), characterId: "warrior", ...spot, canPlace: false, map, structures: [] });
  assert.deepEqual(methods(invalid.graphics).filter((name) => name !== "setDepth" && name !== "setVisible" && name !== "clear"), ["lineStyle", "strokeCircle"]);
  const [, , color, alpha] = invalid.graphics.calls.find(([name]) => name === "lineStyle");
  assert.equal(color, 0xf87171);
  assert.ok(alpha < 0.6);
});

test("cemberi olmayan yapi icin halka gizli", () => {
  const { preview, graphics } = createPreview();
  preview.update({ definition: def("wall-1"), characterId: "warrior", ...at(6, 6), canPlace: true, map, structures: [] });
  assert.ok(!methods(graphics).includes("strokeCircle"));
  assert.deepEqual(graphics.calls.filter(([name]) => name === "setVisible").at(-1), ["setVisible", false]);
  preview.clear();
  assert.equal(preview.current, undefined);
});

test("sahne: cekmece suruklemesi halkayi ciziyor, birakma ve vazgecme siliyor", () => {
  const source = readFileSync(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const body = (name) => {
    const start = source.indexOf(`  private ${name}(`);
    assert.ok(start >= 0, `${name} yok`);
    const end = source.indexOf("\n  }\n", start);
    return source.slice(start, end);
  };
  const update = body("updateTowerDragAt");
  assert.match(update, /this\.placementRange\?\.update\(\{[\s\S]*definition: this\.draggedTowerDefinition[\s\S]*canPlace[\s\S]*structures: this\.synergyMarks\?\.getStructures\(\)/);
  assert.match(body("finishTowerDragAt"), /this\.placementRange\?\.clear\(\)/);
  assert.match(body("cancelTowerDrag"), /this\.placementRange\?\.clear\(\)/);
  // Cekmeceden gelen olaylar ayni yoldan geciyor.
  assert.match(source, /case "towerDragMove": \{[\s\S]*?this\.updateTowerDragAt\(point(, getClientPoint\(\))?\)/);
  assert.match(source, /new PlacementRangePreview\(this, 26\)/);
});
