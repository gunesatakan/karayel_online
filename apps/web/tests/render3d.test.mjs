// 3D kule katmani (asama 1). Kok `tests/` degil burasi: kok testlere dokunmak sunucu
// yayinini tetikliyor (.github/workflows/fly-server-deploy.yml).
//   node --test apps/web/tests
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  angledFrustum,
  angledGroundToScreen,
  angledScreenToGround,
  EDGE_MODEL_IDS,
  MODEL_BODY_DIAMETER_CELLS,
  TOWER_MODEL_IDS,
  edgeModelTransform,
  orthoFromWorldView,
  towerModelPath,
  towerModelScale,
  yawFromFacing
} from "../src/render3d/tower-math.ts";
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

test("egik gorunum: ekran -> zemin -> ekran ayni noktaya donuyor, tahtanin tamami kesitte", () => {
  const view = { width: 408, height: 674 };
  const center = { x: 204, z: 392 };
  const frustum = angledFrustum(view, 766 / 1266, 52, 70);
  for (const [x, z] of [[204, 392], [0, 55], [408, 729], [120, 600], [350, 100]]) {
    const ndc = angledGroundToScreen(x, z, 0, center, frustum);
    assert.ok(Math.abs(ndc.x) <= 1 + 1e-9 && Math.abs(ndc.y) <= 1 + 1e-9, `kesit disi ${x},${z}`);
    const back = angledScreenToGround(ndc.x, ndc.y, center, frustum);
    assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.z - z) < 1e-9, `${x},${z}`);
  }
  // Kuzey (kucuk z) ekranda yukarida; yukselen nokta ekranda yukari kayiyor.
  assert.ok(angledGroundToScreen(204, 100, 0, center, frustum).y > angledGroundToScreen(204, 600, 0, center, frustum).y);
  assert.ok(angledGroundToScreen(204, 392, 30, center, frustum).y > 0);
});

test("dar ekranda kesit derinlige gore buyuyor", () => {
  const frustum = angledFrustum({ width: 408, height: 674 }, 2, 52, 70);
  assert.ok(frustum.halfHeight * 2 >= 674 * frustum.sin + 70 * frustum.cos - 1e-9);
  assert.ok(Math.abs(frustum.halfWidth / frustum.halfHeight - 2) < 1e-9);
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
