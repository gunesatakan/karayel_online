// 3D kule katmani (asama 1). Kok `tests/` degil burasi: kok testlere dokunmak sunucu
// yayinini tetikliyor (.github/workflows/fly-server-deploy.yml).
//   node --test apps/web/tests
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  ANGLED_ELEVATION_DEGREES,
  ANGLED_ELEVATION_RANGE,
  angledFrustum,
  classifyTwoFingerGesture,
  clampOrbit,
  rotateTargetAround,
  twoFingerDelta,
  angledGroundToScreen,
  angledScreenToGround,
  EDGE_MODEL_IDS,
  BUILDING_MODEL_KINDS,
  MINE_KINDS,
  OPERATOR_MODEL_PATHS,
  OPERATOR_MODEL_YAW_OFFSET,
  WALL_MODEL_PATH,
  WORKER_MODEL_PATH,
  buildingModelPath,
  MODEL_BODY_DIAMETER_CELLS,
  mineModelPath,
  TOWER_MODEL_IDS,
  edgeModelTransform,
  orthoFromWorldView,
  standeeCenterHeight,
  towerModelPath,
  towerModelScale,
  yawFromFacing
} from "../src/render3d/tower-math.ts";
import { EDGE_SLOPE, createZoneHeight, edgeSlopeHeight } from "../src/render3d/terrain.ts";
import { getBuildZoneReliefs } from "@karayel/shared";
import { SHOT_TOWER_IDS, getShotRecipe, shotTowerId } from "../src/render3d/shot-recipes.ts";
import { findForbidden, readDeployPaths } from "../../../tools/check-client-only.mjs";
import { TOWER_MODELS_DIR } from "../../../tools/build-itch.mjs";

const publicDir = new URL("../public/", import.meta.url);

test("oyunun yonu modelin namlusunu ayni yone ceviriyor", () => {
  // Model donmemisken namlu +Z'de; Y ekseninde a donusu +Z'yi (sin a, 0, cos a) yapar.
  for (const facing of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7, -2.3]) {
    const yaw = yawFromFacing(facing);
    assert.ok(Math.abs(Math.sin(yaw) - Math.cos(facing)) < 1e-9, `x at ${facing}`);
    assert.ok(Math.abs(Math.cos(yaw) - Math.sin(facing)) < 1e-9, `z at ${facing}`);
  }
});

test("model govdesi 2D govdenin capina oturuyor; 2x2 kulede kok olcegi zaten yayilimli", () => {
  const cell = 34;
  for (const span of [1, 2]) {
    const bodySize = cell * span * 0.9;
    const scale = towerModelScale(bodySize, span);
    assert.ok(Math.abs(MODEL_BODY_DIAMETER_CELLS * span * scale - bodySize) < 1e-9);
  }
});

test("kenar rayi hucre boyunca, dikeyde 90 derece donuk", () => {
  assert.deepEqual(edgeModelTransform(34, 0.9, "horizontal"), { scale: 34 * 0.9, yaw: 0 });
  assert.equal(edgeModelTransform(34, 0.9, "vertical").yaw, Math.PI / 2);
  assert.equal(edgeModelTransform(34, 0.9, undefined).yaw, 0);
});

test("ortografik kesit Phaser'in dunya gorunumunu birebir kapsiyor", () => {
  const ortho = orthoFromWorldView({ x: 10, y: 86, width: 390, height: 612 });
  assert.equal(ortho.centerX, 205);
  assert.equal(ortho.centerZ, 392);
  assert.equal(ortho.right - ortho.left, 390);
  assert.equal(ortho.top - ortho.bottom, 612);
});

const orbitAt = (yaw, elevation, zoom = 1, target = { x: 204, z: 392 }) => {
  const base = angledFrustum({ width: 408, height: 674 }, 766 / 1266, elevation, 70);
  return { target, yaw, frustum: { ...base, halfWidth: base.halfWidth / zoom, halfHeight: base.halfHeight / zoom } };
};

test("egik kamera: ekran -> zemin -> ekran her donus, egim ve yakinlasmada ayni noktaya donuyor", () => {
  for (const [yaw, elevation, zoom] of [[0, 45, 1], [0.44, 38, 1.7], [2.44, 35, 1.5], [-1.05, 15, 3], [Math.PI, 70, 0.5]]) {
    const view = orbitAt(yaw, elevation, zoom, { x: 150, z: 300 });
    for (const [x, z] of [[204, 392], [0, 55], [408, 729], [120, 600], [350, 100]]) {
      const ndc = angledGroundToScreen(x, z, 0, view);
      const back = angledScreenToGround(ndc.x, ndc.y, view);
      assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.z - z) < 1e-9, `${yaw},${elevation}: ${x},${z}`);
    }
  }
});

test("egik kamera: donmeden tahtanin tamami kesitte, kuzey yukarida; yukselen nokta ekranda yukari", () => {
  const view = orbitAt(0, 52);
  for (const [x, z] of [[0, 55], [408, 729], [350, 100]]) {
    const ndc = angledGroundToScreen(x, z, 0, view);
    assert.ok(Math.abs(ndc.x) <= 1 + 1e-9 && Math.abs(ndc.y) <= 1 + 1e-9, `kesit disi ${x},${z}`);
  }
  assert.ok(angledGroundToScreen(204, 100, 0, view).y > angledGroundToScreen(204, 600, 0, view).y);
  assert.ok(angledGroundToScreen(204, 392, 30, view).y > 0);
  // 180 derece donunce kuzey asagida.
  const turned = orbitAt(Math.PI, 52);
  assert.ok(angledGroundToScreen(204, 100, 0, turned).y < angledGroundToScreen(204, 600, 0, turned).y);
});

test("donus haritanin merkezi cevresinde: merkez ekranda yerinde kaliyor", () => {
  const center = { x: 204, z: 392 };
  let view = orbitAt(0.3, 40, 2, { x: 120, z: 300 });
  const before = angledGroundToScreen(center.x, center.z, 0, view);
  for (const step of [0.4, 1.1, -2.5, 0.05]) {
    view = { ...view, yaw: view.yaw + step, target: rotateTargetAround(view.target, center, step) };
    const after = angledGroundToScreen(center.x, center.z, 0, view);
    assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9, `${step}`);
  }
});

test("egim sinirlari ve iki parmak jesti: kistirma, burma, birlikte dikey kaydirma egim", () => {
  assert.equal(clampOrbit(5, ANGLED_ELEVATION_RANGE), ANGLED_ELEVATION_RANGE.min);
  assert.equal(clampOrbit(89, ANGLED_ELEVATION_RANGE), ANGLED_ELEVATION_RANGE.max);
  const pinch = twoFingerDelta([{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 50, y: 100 }, { x: 250, y: 100 }]);
  assert.ok(Math.abs(pinch.scale - 2) < 1e-9 && Math.abs(pinch.rotation) < 1e-9);
  const twist = twoFingerDelta([{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 150, y: 50 }, { x: 150, y: 150 }]);
  assert.ok(Math.abs(twist.rotation - Math.PI / 2) < 1e-9);
  const up = twoFingerDelta([{ x: 100, y: 300 }, { x: 200, y: 300 }], [{ x: 100, y: 260 }, { x: 200, y: 260 }]);
  assert.equal(classifyTwoFingerGesture(up.moveX, up.moveY, up.scale, up.rotation, up.parallelVertical), "tilt");
  const drag = twoFingerDelta([{ x: 100, y: 300 }, { x: 200, y: 300 }], [{ x: 150, y: 290 }, { x: 250, y: 290 }]);
  assert.equal(classifyTwoFingerGesture(drag.moveX, drag.moveY, drag.scale, drag.rotation, drag.parallelVertical), "transform");
  assert.equal(classifyTwoFingerGesture(pinch.moveX, pinch.moveY, pinch.scale, pinch.rotation, pinch.parallelVertical), "transform");
});

test("ayakta duran panonun alt kenari ekranda ayagina degiyor", () => {
  const center = { x: 204, z: 392 };
  const frustum = angledFrustum({ width: 408, height: 674 }, 766 / 1266, ANGLED_ELEVATION_DEGREES, 70);
  const view = { target: center, yaw: 0, frustum };
  const toScreen = (z, height) => angledGroundToScreen(204, z, height, view).y * frustum.halfHeight;
  for (const size of [12, 23, 40]) {
    // Kameraya donuk pano ekranda tam boyunda: merkez yarim boy yukarida.
    assert.ok(Math.abs(toScreen(300, standeeCenterHeight(size)) - toScreen(300, 0) - size / 2) < 1e-9, `${size}`);
  }
});

test("dar ekranda kesit derinlige gore buyuyor", () => {
  const frustum = angledFrustum({ width: 408, height: 674 }, 2, 52, 70);
  assert.ok(frustum.halfHeight * 2 >= 674 * frustum.sin + 70 * frustum.cos - 1e-9);
  assert.ok(Math.abs(frustum.halfWidth / frustum.halfHeight - 2) < 1e-9);
});

test("arazi: yasak bolge lekeleri donusumlu tepe ve cukur, bolge disi ve kenari dumduz", () => {
  const input = { cols: 12, rows: 18, cellSize: 34, originX: 0, originY: 55, zoneCells: [3 * 12 + 2, 3 * 12 + 3, 4 * 12 + 3, 10 * 12 + 8, 10 * 12 + 9, 11 * 12 + 9] };
  assert.deepEqual(getBuildZoneReliefs({ cols: 12, rows: 18, cells: input.zoneCells }).map((relief) => relief.cells), [[38, 39, 51], [128, 129, 141]]);
  const height = createZoneHeight(input);
  const center = (col, row) => [input.originX + (col + 0.5) * 34, input.originY + (row + 0.5) * 34];
  const first = height(...center(3, 3));
  const second = height(...center(9, 10));
  assert.ok(first !== 0 && second !== 0 && Math.sign(first) !== Math.sign(second), `${first} ${second}`);
  // Kule kurulan komsu kare ve bolgenin siniri duz.
  assert.equal(height(...center(1, 3)), 0);
  assert.equal(height(...center(6, 6)), 0);
  assert.ok(Math.abs(height(input.originX + 2 * 34 + 0.01, input.originY + 3.5 * 34)) < 0.5);
});

test("arazi: yamac yalnizca arenanin sag ve solunda, egimi sinirli", () => {
  const arena = { left: 0, right: 408 };
  assert.equal(edgeSlopeHeight(200, 300, arena, 34), 0);
  assert.equal(edgeSlopeHeight(0, -500, arena, 34), 0);
  for (const out of [10, 40, 80, 150, 300]) {
    const h = edgeSlopeHeight(-out, 300, arena, 34);
    assert.ok(h > 0 && h <= out * EDGE_SLOPE * 1.25 + 1e-9, `${out}: ${h}`);
    assert.ok(edgeSlopeHeight(408 + out, 300, arena, 34) > 0);
  }
});

test("modeli olan her kulenin uc kademesi de var; rig dugumleri ve kademe bilgisi tasiniyor", () => {
  for (const id of TOWER_MODEL_IDS) for (const tier of [1, 2, 3]) {
    const path = towerModelPath(id, tier);
    assert.ok(path.startsWith(TOWER_MODELS_DIR), path);
    const url = new URL(path, publicDir);
    assert.ok(existsSync(url), `${path} eksik`);
    const bytes = readFileSync(url);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
    const names = new Set(json.nodes.map((node) => node.name));
    for (const name of [id, "turret-yaw", "barrels-recoil", "muzzle-socket"]) assert.ok(names.has(name), `${path}: ${name}`);
    const root = json.nodes.find((node) => node.name === id);
    assert.equal(root.extras.tier, tier);
    if (EDGE_MODEL_IDS.has(id)) assert.equal(root.extras.edgeCells, 2);
    assert.ok(json.images.every((image) => image.mimeType === "image/jpeg"), `${path}: oyun kopyasi JPEG dokulu`);
    assert.ok(bytes.length < 600 * 1024, `${path}: ${bytes.length} bayt`);
  }
});

test("her madenin modeli var: tek kok dugum, tabani 1 birim, JPEG dokulu ve hafif", () => {
  for (const kind of MINE_KINDS) {
    const path = mineModelPath(kind);
    assert.ok(path.startsWith(TOWER_MODELS_DIR), path);
    const url = new URL(path, publicDir);
    assert.ok(existsSync(url), `${path} eksik`);
    const bytes = readFileSync(url);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
    const root = json.nodes.find((node) => node.name === `mine-${kind}`);
    assert.ok(root, `${path}: kok dugum`);
    assert.equal(root.extras.kind, kind);
    const accessor = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
    const width = Math.max(accessor.max[0] - accessor.min[0], accessor.max[2] - accessor.min[2]);
    assert.ok(Math.abs(width - 1) < 0.02 && Math.abs(accessor.min[1]) < 0.02, `${path}: genislik ${width}, taban ${accessor.min[1]}`);
    assert.ok(json.images.every((image) => image.mimeType === "image/jpeg"), `${path}: JPEG`);
    assert.ok(bytes.length < 800 * 1024, `${path}: ${bytes.length} bayt`);
  }
});

test("ikmal binalarinin iki kademesi ve duvar modeli var; arazi dokulari 2048 px JPEG", () => {
  const read = (path) => {
    const url = new URL(path, publicDir);
    assert.ok(existsSync(url), `${path} eksik`);
    const bytes = readFileSync(url);
    return { bytes, json: JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8")) };
  };
  for (const id of Object.keys(BUILDING_MODEL_KINDS)) {
    for (const level of [1, 5]) {
      const path = buildingModelPath(id, level);
      assert.ok(path.startsWith(TOWER_MODELS_DIR), path);
      const { bytes, json } = read(path);
      const root = json.nodes.find((node) => node.name === path.slice(TOWER_MODELS_DIR.length, -4));
      assert.ok(root, `${path}: kok dugum`);
      assert.equal(root.extras.tier, level >= 5 ? 2 : 1);
      assert.ok(bytes.length < 800 * 1024, `${path}: ${bytes.length} bayt`);
    }
  }
  assert.equal(buildingModelPath("zeynep-1", 1), undefined);
  const worker = read(WORKER_MODEL_PATH);
  assert.ok(worker.json.nodes.some((node) => node.name === "worker-drone" && node.extras?.kind === "worker"), "isci dronu kok dugumu");
  assert.ok(worker.bytes.length < 800 * 1024);
  const wall = read(WALL_MODEL_PATH);
  const accessor = wall.json.accessors[wall.json.meshes[0].primitives[0].attributes.POSITION];
  // Boy X'te tam 1 (bir hucre kenari), kalinlik ondan az.
  assert.ok(Math.abs(accessor.max[0] - accessor.min[0] - 1) < 0.02 && accessor.max[2] - accessor.min[2] < 0.5);
  for (const stage of [1, 2, 3, 4, 5]) {
    const url = new URL(`models3d/terrain/stage-${stage}.jpg`, publicDir);
    assert.ok(existsSync(url), `stage-${stage}`);
    const jpeg = readFileSync(url);
    assert.equal(jpeg[0], 0xff);
    assert.equal(jpeg[1], 0xd8);
    assert.ok(jpeg.length < 2.5 * 1024 * 1024, `stage-${stage}: ${jpeg.length}`);
  }
});

test("operator bedenleri: iki karakterin modeli var, kollari donus 0'da kuzeye bakiyor", () => {
  assert.deepEqual(Object.keys(OPERATOR_MODEL_PATHS).sort(), ["warrior", "zeynep"]);
  for (const [character, path] of Object.entries(OPERATOR_MODEL_PATHS)) {
    assert.ok(path.startsWith(TOWER_MODELS_DIR), path);
    const url = new URL(path, publicDir);
    assert.ok(existsSync(url), `${path} eksik`);
    const bytes = readFileSync(url);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
    assert.ok(json.nodes.some((node) => node.extras?.kind === "operator" && node.extras?.character === character), `${path}: kok dugum`);
    assert.ok(json.images.every((image) => image.mimeType === "image/jpeg"), `${path}: JPEG`);
    assert.ok(bytes.length < 800 * 1024, `${path}: ${bytes.length} bayt`);
  }
  // Kollar modelde -X'te; donus 0'da (pi + kayma) Y donusu -X'i kuzeye (-z) cevirmeli.
  const yaw = Math.PI + OPERATOR_MODEL_YAW_OFFSET;
  const forward = [-Math.cos(yaw), Math.sin(yaw)]; // (x cos + z sin, -x sin + z cos), x = -1
  assert.ok(Math.abs(forward[0]) < 1e-9 && Math.abs(forward[1] + 1) < 1e-9, `${forward}`);
});

test("3D vuruslar: modeli olan her saldiri kulesinin kendi tarifi var; kademe yeni katman ekliyor", () => {
  // Saray (zeynep-7) ates etmiyor.
  for (const id of TOWER_MODEL_IDS) if (id !== "zeynep-7") assert.ok(SHOT_TOWER_IDS.includes(id), `${id} icin 3D vurus tarifi yok`);
  // Isinla vuranlar disindaki AttackLord kuleleri birbirinden farkli carpiyor.
  const styles = ["warrior-1", "warrior-2", "warrior-3", "warrior-4", "warrior-6"].map((id) => getShotRecipe(id, 1).impact);
  assert.equal(new Set(styles).size, styles.length, styles.join(","));
  for (const id of SHOT_TOWER_IDS) {
    const [one, two, three] = [1, 2, 3].map((tier) => getShotRecipe(id, tier));
    assert.ok(one.hit.sparks < two.hit.sparks && two.hit.sparks < three.hit.sparks, `${id}: kivilcim`);
    assert.ok(one.hit.flash < two.hit.flash && two.hit.flash < three.hit.flash, `${id}: parlama`);
    assert.ok(one.hit.rings < three.hit.rings && one.trail.lifeMs < three.trail.lifeMs, `${id}: halka ve iz`);
    assert.equal(one.hit.embers, 0);
    assert.ok(two.hit.embers > 0 && two.muzzle.ring && !one.muzzle.ring, `${id}: kademe 2 katmani`);
    assert.ok(three.hit.pillar && !two.hit.pillar, `${id}: kademe 3 katmani`);
  }
  assert.equal(shotTowerId("zeynep-3-kin-wave"), "zeynep-3");
  assert.equal(shotTowerId("zeynep-3-copy"), "zeynep-3");
  // Bilinmeyen kule yedek kurede, verilen tonda.
  assert.equal(getShotRecipe("archer-1", 1, 0x123456).color, 0x123456);
  assert.equal(getShotRecipe("warrior-5", 3).beam, "laser");
});

test("koruma: sunucu yayinini tetikleyen yollar yakalaniyor, istemci yollari serbest", () => {
  const workflow = readFileSync(new URL("../../../.github/workflows/fly-server-deploy.yml", import.meta.url), "utf8");
  const patterns = readDeployPaths(workflow);
  assert.deepEqual(
    findForbidden(["apps/server/src/rooms/MatchRoom.ts", "packages/shared/src/index.ts", "tests/a.test.mjs", "package.json", "package-lock.json",
      "apps/web/src/render3d/tower-layer.ts", "apps/web/package.json", "apps/web/public/models3d/x.glb", "tools/build-itch.mjs"], patterns),
    ["apps/server/src/rooms/MatchRoom.ts", "packages/shared/src/index.ts", "tests/a.test.mjs", "package.json", "package-lock.json"]
  );
});

test("itch paketi 3D'yi derlemede kapatiyor ve modelleri almiyor", () => {
  const script = readFileSync(new URL("../../../tools/build-itch.mjs", import.meta.url), "utf8");
  assert.match(script, /env\.VITE_TOWERS_3D = "off"/);
  assert.match(script, /startsWith\(TOWER_MODELS_DIR\)/);
});
