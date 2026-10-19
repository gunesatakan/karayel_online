/**
 * Gorunen govde = isabet (sahibin karari, 2026-10): "Hitbox, gorunen govde ile
 * ayni olmali. Mermiler de cizildigi kadar vurus yaricapina sahip olmali."
 * Govde dokuyla birlikte yuruyus yonune donuyor.
 *
 * - Dusmanin govdesi cizilen dokunun gorunen maskesinin dis bukey cokgeni
 *   (PNG'lerden uretilmis, disariya dogru en fazla 12 koseye indirilmis) x
 *   istemcinin cizdigi karenin yarisi, yuruyus yonunde. Sunucu dogumda bir
 *   govde nesnesi kuruyor (tek bicim), yonu konum degisiminden izliyor
 *   (dururken son yon); istemci ayni fonksiyonlarla.
 * - Mermi cizilen govdesiyle: cizicinin dis bukey parcalari (mizragin bas
 *   ucgeni ve ince govde cizgisi, kare bas, mercek, Ucube'nin damlasi) ve
 *   disk; geriye ancak ucmus oldugu ve cizildigi kadar. Cizilen kenar
 *   degmeden vurus yok; temas noktasi hep govdenin kenarinda ve merminin
 *   kendi boyunun icinde (tikin basinda ortusende de: uzak yuz ya da namlunun
 *   gerisi degil, cizilen govdeye en yakin kenar noktasi); siperde ve meka
 *   kalkaninda cizilen govde engelin cizilen levhasina (uclar dahil) degince
 *   duruyor, yalnizca levhaya giden mermi.
 * - Alan hasari govdesi halkaya degeni vuruyor.
 *
 * Kaynaklar bagimsiz: cokgeni bu test PNG'den kendi zarfiyla, dunya
 * konumunu istemcinin doku donusu kuraliyla (atan2 - 90 derece, Phaser'in
 * donusu), ilk temasi mesafenin ucus boyunca dis bukey olmasindan (en kucuk
 * nokta ve ilk sifir) kendisi hesapliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AIR_ENEMY_DISPLAY_SCALE,
  AEGIS_DRAWN,
  MEKA_SHIELD_DRAWN,
  BODY_DEFAULT_HEADING_X,
  BODY_DEFAULT_HEADING_Y,
  BODY_HEADING_MIN_STEP,
  BODY_HEADING_WIRE_DEAD_BAND,
  CHAMPION_SPRITE_SCALE,
  ENEMY_BODY_OUTLINES,
  ENEMY_BOMBER_ART_SCALE,
  ENEMY_SIZE_SCALE,
  SERVER_TICK_MS,
  SNAPSHOT_INTERVAL_MS,
  SNAPSHOT_SEND_INTERVAL_MS,
  SpatialGrid,
  WIRE_POSITION_QUANTUM,
  createEnemyBody,
  getAttackDroneBodyRadius,
  getBodyHeadingMinStep,
  getBodyHeadingRotation,
  getBodyProjectionMax,
  getBodyProjectionMin,
  getEnemyBodyPolygon,
  getEnemyTextureKey,
  createEnemyBodyPolygon,
  getCounterSurgeWidthCells,
  getMapGridSize,
  getMapOrigin,
  getMekaShieldFace,
  getMekaShieldTickHalf,
  getOrbitBladeInner,
  getProjectileBody,
  getProjectileBodyContact,
  getProjectileReach,
  getProjectileSceneScale,
  getProjectileShape,
  getSnapshotHeadingMinStep,
  getSoulDrawerMultipliers,
  getTowerTier,
  gridToWorld,
  isBandTouchingBody,
  isBodyHeadingStep,
  isBodyInKinShowcase,
  isPointInBody,
  isSegmentTouchingBody,
  mergeDynamicEnemySnapshots,
  pruneStaticSnapshotCache,
  selectOrbitSweepContacts,
  updateBodyHeading,
  writeEnemyBodyShape,
  writeProjectileBodyContactPoint,
  worldToGrid,
  writeProjectileSupport
} from "../packages/shared/dist/index.js";
import { bodyMask, decodePng } from "../tools/measure-enemy-hitboxes.mjs";
import { isBodyTouchingAnnularSector, isBodyTouchingSector } from "./helpers/body-shapes.mjs";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import { SeededRoomRuntime } from "../apps/server/dist/debug/room-runtime.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { runRecordedBotMatch } from "../tools/debug/bot-match.mjs";
import { loadRecordingFile, replayRecording } from "../tools/debug/replay-lib.mjs";
import { importWebModule } from "./helpers/web-module.mjs";
import { createGeometryRecorder, isBodyPrim } from "./helpers/geometry-recorder.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const client = { sessionId: "p1", send() {} };
const RACES = ["meka", "spaceBug", "fourthDimensional", "holyGuardian", "fallen", "golem"];
const TYPES = ["grunt", "brute", "runner", "shooter", "siege"];
const ARTS = ["grunt", "brute", "runner", "shooter", "bomber", "harvester"];
const ART = { grunt: "grunt", brute: "brute", runner: "runner", shooter: "shooter", siege: "brute" };
const near = (actual, expected, label, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${label}: ${actual} != ${expected}`);
const bodies = await importWebModule("apps/web/src/vfx/enemy-bodies.ts");

/* ------------------------------------------------------------------ */
/* Bagimsiz geometri (testin kendi hesabi)                              */
/* ------------------------------------------------------------------ */

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const chain = (list) => {
    const out = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0) out.pop();
      out.push(point);
    }
    return out;
  };
  return chain(sorted).slice(0, -1).concat(chain([...sorted].reverse()).slice(0, -1));
}

/**
 * Govdenin dunyadaki cokgeni: istemci dokuyu `atan2(yon) - 90 derece` ile
 * ceviriyor; Phaser donusu dokunun (x, y) noktasini (x c - y s, x s + y c)
 * yapiyor. Kare yari kenari `scale`.
 */
function worldPolygon(body) {
  const angle = Math.atan2(body.headingY, body.headingX) - Math.PI / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out = [];
  for (let k = 0; k < body.poly.count; k += 1) {
    const x = body.poly.vx[k] * body.scale;
    const y = body.poly.vy[k] * body.scale;
    out.push([body.x + x * c - y * s, body.y + x * s + y * c]);
  }
  return out;
}

const inside = (polygon, q) => polygon.every((a, i) => cross(a, polygon[(i + 1) % polygon.length], q) >= -1e-12);

function segmentPointDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
}

function boundaryDistance(polygon, q) {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i += 1) best = Math.min(best, segmentPointDistance(q, polygon[i], polygon[(i + 1) % polygon.length]));
  return best;
}

/**
 * Alansiz (kesimin cizgisine yatmis) cokgenin ici yok: dogan Ucube'nin damlasi
 * `reach` 0'da x = 0'da bir parca. Kenar testi o cizginin tamamini (parcanin
 * disini da) "icerde" sayardi; uzaklik parcaya.
 */
const polygonArea2 = (polygon) => polygon.reduce((sum, p, i) => sum + cross([0, 0], p, polygon[(i + 1) % polygon.length]), 0);
const pointDistance = (polygon, q) => (polygonArea2(polygon) > 1e-9 && inside(polygon, q) ? 0 : boundaryDistance(polygon, q));

function segmentsCross(a, b, c, d) {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** Iki dis bukey cokgenin (ya da parca / nokta) uzakligi; kesisiyorsa 0. */
function polygonDistance(a, b) {
  if (a.some((q) => b.length >= 3 && inside(b, q)) || b.some((q) => a.length >= 3 && inside(a, q))) return 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return 0;
    }
  }
  let best = Infinity;
  for (const q of a) for (let j = 0; j < b.length; j += 1) best = Math.min(best, segmentPointDistance(q, b[j], b[(j + 1) % b.length]));
  for (const q of b) for (let i = 0; i < a.length; i += 1) best = Math.min(best, segmentPointDistance(q, a[i], a[(i + 1) % a.length]));
  return best;
}

/** Saat yonunun tersine dis bukey cokgeni `n . p <= c`ye kirpar. */
function clip(polygon, nx, ny, c) {
  const out = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const ps = nx * p[0] + ny * p[1] - c;
    const qs = nx * q[0] + ny * q[1] - c;
    if (ps <= 0) out.push(p);
    if ((ps <= 0) !== (qs <= 0)) {
      const t = ps / (ps - qs);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/**
 * Merminin cizilen govdesi yerel cercevede (+x ucus): cizicinin parcalari
 * (`getProjectileBody`; parcalarin cizimle ayni oldugu tests/projectile-body'de
 * olculuyor) ve disk (cevreleyen 180 kenarli cokgen), merkezin `reach` gerisi
 * kesik. Melis dokularinda kapsul (eksende `[arka, wide]`, yaricap `radius`)
 * ve igne.
 */
function projectileLocalParts(id, tier, shape, reach) {
  const parts = [];
  const body = getProjectileBody(id, tier);
  for (const part of body.parts) parts.push(hull(Array.from({ length: part.length / 2 }, (_, i) => [part[2 * i], part[2 * i + 1]])));
  if (shape.disc === 1 && shape.radius > 0) {
    const r = shape.radius / Math.cos(Math.PI / 180);
    parts.push(Array.from({ length: 180 }, (_, i) => [shape.wide + Math.cos((i / 180) * Math.PI * 2) * r, Math.sin((i / 180) * Math.PI * 2) * r]));
  }
  if (shape.disc === 2) {
    const rear = shape.wide - shape.radius < -reach ? shape.wide : Math.min(shape.wide, shape.radius - reach);
    const local = [];
    for (let i = 0; i <= 180; i += 1) {
      const a = -Math.PI / 2 + (Math.PI * i) / 180;
      local.push([shape.wide + Math.cos(a) * shape.radius, Math.sin(a) * shape.radius]);
    }
    for (let i = 0; i <= 180; i += 1) {
      const a = Math.PI / 2 + (Math.PI * i) / 180;
      local.push([rear + Math.cos(a) * shape.radius, Math.sin(a) * shape.radius]);
    }
    parts.push(hull(local));
  }
  return parts.map((part) => clip(part, -1, 0, reach)).filter((part) => part.length >= 3);
}

const placeLocal = (part, fx, fy, ux, uy) => part.map(([along, side]) => [fx + ux * along - uy * side, fy + uy * along + ux * side]);

/** Dis bukey `f`in (s icin) [0, travel]'deki ilk sifiri; yoksa -1. */
function firstZero(f, travel) {
  if (f(0) <= 1e-9) return 0;
  let low = 0;
  let high = travel;
  for (let i = 0; i < 80; i += 1) {
    const a = low + (high - low) / 3;
    const b = high - (high - low) / 3;
    if (f(a) < f(b)) high = b;
    else low = a;
  }
  const middle = (low + high) / 2;
  if (f(middle) > 1e-9) return -1;
  let free = 0;
  let touch = middle;
  for (let i = 0; i < 60; i += 1) {
    const s = (free + touch) / 2;
    if (f(s) <= 1e-9) touch = s;
    else free = s;
  }
  return touch;
}

/**
 * Bagimsiz ilk temas: her parca ayri (uzaklik ucus boyunca dis bukey: ilk
 * sifir), en kucugu. Melis dokularinda igne de (parca).
 */
function referenceContact(polygon, id, tier, flown, fx, fy, ux, uy, travel) {
  const shape = getProjectileShape(id, tier);
  const reach = getProjectileReach(shape, flown);
  let best = -1;
  for (const part of projectileLocalParts(id, tier, shape, reach)) {
    const t = firstZero((s) => polygonDistance(polygon, placeLocal(part, fx + ux * s, fy + uy * s, ux, uy)), travel);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  if (shape.disc === 2 && shape.nose > shape.wide + shape.radius) {
    const needleRear = Math.max(shape.wide, -reach);
    const needle = firstZero((s) => polygonDistance(polygon, [[fx + ux * (s + needleRear), fy + uy * (s + needleRear)], [fx + ux * (s + shape.nose), fy + uy * (s + shape.nose)]]), travel);
    if (needle >= 0 && (best < 0 || needle < best)) best = needle;
  }
  return best;
}

/** Merminin cizilen govdesi `along` kadar ilerlemisken dunyada (parcalar). */
function projectileWorldParts(id, tier, flown, fx, fy, ux, uy, along) {
  const shape = getProjectileShape(id, tier);
  return projectileLocalParts(id, tier, shape, getProjectileReach(shape, flown)).map((part) => placeLocal(part, fx + ux * along, fy + uy * along, ux, uy));
}

/** Tohumlu rastgele: test her calismada ayni durumlari deniyor. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBody(rnd) {
  const view = { race: RACES[Math.floor(rnd() * 6)], type: TYPES[Math.floor(rnd() * 5)], movementKind: rnd() < 0.3 ? "air" : "ground", champion: rnd() < 0.2 };
  const body = createEnemyBody(view, 34, (rnd() - 0.5) * 40, (rnd() - 0.5) * 40);
  const angle = rnd() * Math.PI * 2;
  body.headingX = Math.cos(angle);
  body.headingY = Math.sin(angle);
  return body;
}

/* ------------------------------------------------------------------ */
/* Dusmanin govdesi                                                      */
/* ------------------------------------------------------------------ */

test("cokgen tablosu dokularla guncel; her cokgen dis bukey, en fazla 12 koseli, gorunen her pikseli kapsiyor ve zarftan en fazla 9 piksel tasiyor", () => {
  // Uretec PNG'leri yeniden olcuyor; tablo eskiyse 1 ile cikiyor.
  execFileSync(process.execPath, ["tools/measure-enemy-hitboxes.mjs", "--check"], { cwd: root, stdio: "pipe" });
  let worst = { outward: 0 };
  for (const race of RACES) {
    for (const art of ARTS) {
      const polygon = getEnemyBodyPolygon(race, art);
      const label = `${race} ${art}`;
      assert.ok(polygon.count >= 3 && polygon.count <= 12, `${label}: ${polygon.count} kose`);
      // Saat yonunun tersine ve dis bukey (her ardisik uclu sola donuyor).
      const vertices = Array.from({ length: polygon.count }, (_, k) => [polygon.vx[k] * 256, polygon.vy[k] * 256]);
      vertices.forEach((a, i) => assert.ok(cross(a, vertices[(i + 1) % vertices.length], vertices[(i + 2) % vertices.length]) > 0, `${label}: kose ${i} dis bukey degil`));
      // Gorunen maske (alfa >= 128, %0,5'ten kucuk kopuk parcalar haric): her
      // satirin uc piksellerinin koseleri cokgenin icinde.
      const key = getEnemyTextureKey({ race, type: art === "bomber" || art === "harvester" ? "grunt" : art, special: art === "bomber" || art === "harvester" ? art : undefined });
      const { mask } = bodyMask(decodePng(`${root}/apps/web/public/images/enemies/${key}.png`));
      const corners = [];
      for (let y = 0; y < 512; y += 1) {
        let left = -1;
        let right = -1;
        for (let x = 0; x < 512; x += 1) if (mask[y * 512 + x]) { if (left < 0) left = x; right = x; }
        if (left < 0) continue;
        for (const [x, yy] of [[left, y], [left, y + 1], [right + 1, y], [right + 1, y + 1]]) corners.push([x - 256, yy - 256]);
      }
      for (const corner of corners) assert.ok(inside(vertices, corner), `${label}: piksel kosesi ${corner} cokgenin disinda`);
      // Cokgen zarftan (disariya) en fazla 9 piksel tasiyor (piyadede 0,4 birim).
      const maskHull = hull(corners);
      const outward = Math.max(...vertices.map((vertex) => pointDistance(maskHull, vertex)));
      assert.ok(outward <= 9, `${label}: zarftan ${outward} piksel tasiyor`);
      if (outward > worst.outward) worst = { outward, label };
    }
  }
  // Kosucular uzun ve dar: boyu eninin 2,5 katindan fazla (eski daire burnu ve kuyrugu kesiyordu).
  const runner = getEnemyBodyPolygon("holyGuardian", "runner");
  const span = (values) => Math.max(...values) - Math.min(...values);
  assert.ok(span(runner.vy) / span(runner.vx) > 2.5, `${span(runner.vy)} / ${span(runner.vx)}`);
  assert.ok(worst.outward > 0.5, JSON.stringify(worst));
});

test("govde cizilen karenin yarisi x dokunun cokgeni: her irk, tur, sampiyon, hava, ruh cekici, bombaci, hasatci", () => {
  // Istemcinin cizdigi kare, bagimsiz yazilmis: tur boyu x irkin brute carpani x 0,675.
  const DISPLAY = { grunt: 34, siege: 38, brute: 43.2, runner: 40, shooter: 38 };
  const BRUTE_RACE = { spaceBug: 1.3, fallen: 1.1 };
  const body = createEnemyBody({ race: "meka", type: "grunt" }, 34, 0, 0);
  const check = (view, cell, half, race, art, label) => {
    writeEnemyBodyShape(body, view, cell);
    near(body.scale, half, `${label} yari kenar`);
    const outline = ENEMY_BODY_OUTLINES[race][art];
    assert.equal(body.poly, getEnemyBodyPolygon(race, art), `${label}: paylasilan cokgen`);
    assert.equal(body.poly.count * 2, outline.length, label);
    for (let k = 0; k < body.poly.count; k += 1) assert.ok(body.poly.vx[k] === outline[2 * k] && body.poly.vy[k] === outline[2 * k + 1], `${label} kose ${k}`);
    const far = Math.max(...Array.from({ length: body.poly.count }, (_, k) => Math.hypot(outline[2 * k], outline[2 * k + 1])));
    near(body.reach, far * half, `${label} erisim`);
  };
  for (const cell of [34, 51]) {
    for (const race of RACES) {
      for (const type of TYPES) {
        const side = DISPLAY[type] * (type === "brute" ? BRUTE_RACE[race] ?? 1 : 1) * ENEMY_SIZE_SCALE * (cell / 34);
        for (const champion of [false, true]) {
          for (const movementKind of ["ground", "air"]) {
            for (const ds of [0, 1, 10]) {
              const scale = (champion ? CHAMPION_SPRITE_SCALE : 1) * getSoulDrawerMultipliers(ds).size * (movementKind === "air" ? AIR_ENEMY_DISPLAY_SCALE : 1);
              check({ race, type, champion, movementKind, ds }, cell, (side * scale) / 2, race, ART[type], `${race} ${type} c${champion} ${movementKind} ds${ds} kare ${cell}`);
            }
          }
        }
      }
      // Bombaci piyade boyunda, dokusunun kendi olcegiyle; hasatci brute dayanikli ama piyade boyunda.
      const grunt = 34 * ENEMY_SIZE_SCALE * (cell / 34);
      check({ race, type: "grunt", special: "bomber" }, cell, (grunt * ENEMY_BOMBER_ART_SCALE[race]) / 2, race, "bomber", `${race} bombaci`);
      check({ race, type: "brute", special: "harvester" }, cell, grunt / 2, race, "harvester", `${race} hasatci`);
    }
  }
  writeEnemyBodyShape(body, { race: "fallen", type: "brute", movementKind: "air", ds: 10 });
  assert.ok(body.reach > 28, `en buyuk govde ${body.reach}`);
});

/** Statik kaydi (istemcinin `enemy:spawn`i) ve canli kaydin irk alanlarini birlestirir. */
function clientView(room, sent, enemy) {
  const spawn = sent.filter((entry) => entry.type === "enemy:spawn").map((entry) => entry.payload).find((payload) => payload.id === enemy.id);
  assert.ok(spawn, "enemy:spawn yok");
  return { ...spawn, ...room.getRaceTraitWire(enemy, 0), x: enemy.x, y: enemy.y };
}

const BODY_KEYS = ["x", "y", "headingX", "headingY", "fromX", "fromY", "scale", "reach", "poly"];

test("dusman basina tek, sabit bicimli govde nesnesi: iki dogum yerinde ayni alanlar; ruh cekici buyuyunce ayni nesne yeniden olculuyor", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.spawnEnemy();
  room.spawnEnemy(undefined, { kind: "bomber", type: "grunt", healthMultiplier: 1, start: { x: 100, y: 100 } });
  const spot = findBuildableSpot(room, "archer-4");
  room.placeTower(client, { ...spot, definitionId: "warrior-1" });
  room.spawnMelisUndeadShooter([...room.towers.values()].at(-1), 0, room.runtime.now());
  const list = [...room.enemies.values()];
  assert.equal(list.length, 3);
  for (const enemy of list) {
    assert.deepEqual(Object.keys(enemy.body), BODY_KEYS, `${enemy.id}: govde nesnesinin bicimi`);
    for (const key of BODY_KEYS.slice(0, 8)) assert.equal(typeof enemy.body[key], "number", key);
    assert.deepEqual([enemy.body.x, enemy.body.y, enemy.body.headingX, enemy.body.headingY], [enemy.x, enemy.y, BODY_DEFAULT_HEADING_X, BODY_DEFAULT_HEADING_Y]);
  }
  // Nisanci (Oluler Bagi) dusmus irkin nisanci cokgeniyle.
  assert.equal(list[2].body.poly, getEnemyBodyPolygon("fallen", "shooter"));
  // Ruh cekici: ayni nesne, %6 buyuk; sorgu payi da.
  const drawer = list[0];
  drawer.race = "fallen";
  room.assignEnemyBody(drawer);
  const body = drawer.body;
  const before = body.scale;
  drawer.raceTrait = { trait: "drawer", stacks: 0, baseMaxHp: drawer.maxHp, baseSpeed: drawer.speed };
  room.rebuildEnemyGrid();
  const dead = list[1];
  dead.x = drawer.x + 5;
  dead.y = drawer.y;
  room.feedSoulDrawers(dead, 0);
  assert.equal(drawer.raceTrait.stacks, 1);
  assert.equal(drawer.body, body, "ruh cekici yeni govde nesnesi aldi");
  near(body.scale, before * getSoulDrawerMultipliers(1).size, "ruh cekici buyudu", 1e-9);
  assert.ok(room.enemyBodyReachMax >= body.reach, "sorgu payi buyuyen govdeyi bilmiyor");
});

test("sunucu ve istemci ayni govdeyi kullaniyor: dogum, sampiyon, hava, ozel, ruh cekici buyumesi", () => {
  const room = createRoom("warrior");
  const sent = [];
  room.broadcast = (type, payload) => sent.push({ type, payload });
  const grid = getMapGridSize(room.activeMap);
  const spawned = [];
  const take = () => { const enemy = [...room.enemies.values()].at(-1); spawned.push(enemy); return enemy; };
  room.spawnEnemy();
  take();
  room.spawnEnemy({ wave: 1, type: "brute", slot: 0, replaced: 3, hpMultiple: 3, gold: 1, exp: 1, leakDamage: 1, reputation: 0 });
  assert.ok(take().champion);
  room.spawnEnemy(undefined, { kind: "bomber", type: "grunt", healthMultiplier: 1, start: { x: 100, y: 100 } });
  take();
  room.spawnEnemy(undefined, { kind: "harvester", type: "brute", healthMultiplier: 1, start: { x: 100, y: 100 } });
  take();
  room.wave = 5;
  room.spawnEnemy();
  assert.equal(take().movementKind, "air", "5. dalga havada");
  // Istemci modulu paylasilan paketin kendi kopyasiyla paketleniyor: cokgen ayni sayilar (ayni nesne degil).
  const same = (server, scratch, label) => {
    assert.deepEqual([...scratch.body.poly.vx, ...scratch.body.poly.vy], [...server.poly.vx, ...server.poly.vy], `${label}: cokgen`);
    assert.equal(scratch.body.scale, server.scale, `${label}: yari kenar`);
    assert.equal(scratch.body.reach, server.reach, `${label}: erisim`);
  };
  for (const enemy of spawned) {
    same(enemy.body, bodies.writeSnapshotEnemyBody(bodies.createBodyScratch(), clientView(room, sent, enemy), undefined, grid), `${enemy.type} ${enemy.special?.kind ?? ""}`);
  }
  const drawer = spawned[0];
  drawer.race = "fallen";
  room.assignEnemyBody(drawer);
  drawer.raceTrait = { trait: "drawer", stacks: 0, baseMaxHp: drawer.maxHp, baseSpeed: drawer.speed };
  room.rebuildEnemyGrid();
  const dead = spawned[1];
  dead.x = drawer.x + 5;
  dead.y = drawer.y;
  room.feedSoulDrawers(dead, 0);
  assert.equal(room.getRaceTraitWire(drawer, 0).ds, 1);
  same(drawer.body, bodies.writeSnapshotEnemyBody(bodies.createBodyScratch(), { ...clientView(room, sent, drawer), race: "fallen" }, undefined, grid), "ruh cekici");
});

const roundWire = (value) => Math.round(value * 10) / 10;

/**
 * Istemcinin snapshot yolu (GameScene `hydrateSnapshot` -> `queueSnapshot`):
 * tam karede dinamik onbellek bosaliyor, delta kayitlar birlesiyor, sonra
 * yon izi (`EnemyHeadingTracker`) birlesmis kayitlarin konumlariyla.
 */
function clientMirror() {
  const cache = new Map();
  const tracker = new bodies.EnemyHeadingTracker();
  return {
    tracker,
    receive(frame) {
      if (frame.wireFull) cache.clear();
      const enemies = mergeDynamicEnemySnapshots(cache, frame.enemies);
      pruneStaticSnapshotCache(cache, frame.enemies.map((enemy) => enemy.id));
      tracker.note(enemies, frame.serverTime);
      return enemies;
    }
  };
}

/** Sunucunun her govdesinin yonu istemcinin iziyle bire bir ayni (kayan nokta esitligi). */
function assertHeadingsMatch(room, tracker, label) {
  let count = 0;
  for (const enemy of room.enemies.values()) {
    const seen = tracker.get(enemy.id);
    assert.ok(seen, `${label}: ${enemy.id} istemcide yok`);
    assert.ok(enemy.body.headingX === seen.headingX && enemy.body.headingY === seen.headingY,
      `${label}: ${enemy.id} sunucu (${enemy.body.headingX}, ${enemy.body.headingY}) / iz (${seen.headingX}, ${seen.headingY})`);
    count += 1;
  }
  return count;
}

/**
 * Uretim yolundaki oda: tohumlu saat, `setupRoom` + `onJoin`, tam tik
 * (`update`); istemciye giden snapshot'lar (`client.send`) oldugu gibi.
 */
function liveRoom({ seed = 7, stage = 1, characterId = "warrior" } = {}) {
  MatchRoom.createRuntime = () => new SeededRoomRuntime(seed, 1_800_000_000_000, { tick: () => 1_800_000_000_000, scope: () => 1_800_000_000_000 });
  try {
    const room = new MatchRoom();
    room.setSimulationInterval = () => {};
    room.broadcast = () => {};
    room.setupRoom({ autoStart: true, stage, characterId, playerName: "P1" });
    const frames = [];
    const peer = { sessionId: "s1", ref: { bufferedAmount: 0 }, send(type, payload) { if (type === "snapshot") frames.push(payload); }, leave() {} };
    room.clients.push(peer);
    room.onJoin(peer, { autoStart: true, stage, characterId, playerName: "P1" });
    const mirror = clientMirror();
    let read = 0;
    /** Bir tik; gelen snapshot istemcide; sunucunun govdeleri istemcinin iziyle karsilastiriliyor. */
    const tick = (label) => {
      // Kurulum evresinde oyuncu hazir: dalgalar arka arkaya.
      if (room.setupPhase) room.markSetupReady(peer);
      room.update(1000 / 60);
      let fresh = 0;
      while (read < frames.length) {
        mirror.receive(frames[read++]);
        fresh += 1;
      }
      return fresh > 0 ? assertHeadingsMatch(room, mirror.tracker, label) : 0;
    };
    return { room, frames, mirror, tick };
  } finally {
    MatchRoom.createRuntime = undefined;
  }
}

const headingAngle = (x, y) => Math.atan2(y, x);
const angleGap = (a, b) => {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
};

test("yon: yuruyus yonu; dururken son yon; sunucunun govdesi yayinda istemcinin iziyle ayni kural ve girdiler", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  // Dogumda yon olculmedi: son konum yok (NaN), yon dondurulmemis doku.
  assert.ok(Number.isNaN(enemy.body.fromX) && Number.isNaN(enemy.body.fromY), "dogumda son konum yazildi");
  const tracker = new bodies.EnemyHeadingTracker();
  let serverTime = 1000;
  // Yayin: sunucu govdeleri olcuyor, istemci ayni snapshot'i goruyor (0,1'e yuvarli).
  const broadcast = () => {
    serverTime += SNAPSHOT_INTERVAL_MS;
    room.noteSnapshotHeadings(serverTime);
    tracker.note([{ id: enemy.id, x: roundWire(enemy.x), y: roundWire(enemy.y) }], serverTime);
  };
  const step = (dx, dy) => {
    enemy.x += dx;
    enemy.y += dy;
    room.rebuildEnemyGrid();
    broadcast();
  };
  // Ilk gorulen snapshot yalnizca konumu yaziyor (istemcide de).
  enemy.x += 7;
  broadcast();
  assert.deepEqual([enemy.body.headingX, enemy.body.headingY], [BODY_DEFAULT_HEADING_X, BODY_DEFAULT_HEADING_Y], "ilk yayin yonu cevirdi");
  step(3, 0);
  near(enemy.body.headingX, 1, "saga yuruyor");
  near(enemy.body.headingY, 0, "saga yuruyor y");
  step(0, -2);
  near(enemy.body.headingY, -1, "yukari yuruyor");
  // Dururken (ve kipirdarken) son yon korunuyor: istemci dokuyu cevirmiyor.
  step(0, 0);
  step(0.02, 0.02);
  near(enemy.body.headingY, -1, "dururken yon korunmadi");
  // Itilen dusman da itme yonune donuyor (istemci dokuyu ekrandaki konum degisimiyle ceviriyor).
  step(-6, 0);
  near(enemy.body.headingX, -1, "itme yonu");
  assertHeadingsMatch(room, tracker, "kisa yol");
  // Izgara yonu cevirmiyor: yon yalnizca yayinda.
  enemy.x += 9;
  room.rebuildEnemyGrid();
  near(enemy.body.headingX, -1, "izgara yonu cevirdi");
  enemy.x -= 9;
  // Esikler. Snapshot adimi: yurume esigi aradaki tiklerde (0,05 x 4) arti telin
  // olu bandi (snapshot adimi basina iki yuvarlama adimi, 0,2): 0,4.
  near(BODY_HEADING_MIN_STEP, 0.05, "yurume esigi", 1e-12);
  near(BODY_HEADING_WIRE_DEAD_BAND, 2 * WIRE_POSITION_QUANTUM, "olu bant", 1e-12);
  // Snapshot araligi gonderme araliginin tik kati: 60 ms -> 4 tik.
  assert.equal(SNAPSHOT_SEND_INTERVAL_MS, 60);
  near(SNAPSHOT_INTERVAL_MS, 4 * SERVER_TICK_MS, "snapshot araligi", 1e-12);
  near(getBodyHeadingMinStep(SNAPSHOT_INTERVAL_MS), 0.4, "snapshot adimi", 1e-12);
  near(getBodyHeadingMinStep(2 * SNAPSHOT_INTERVAL_MS), 0.6, "iki snapshot'luk adim (bant bir kez)", 1e-12);
  near(getBodyHeadingMinStep(200), 0.05 * 12 + 0.2, "uzun adim", 1e-12);
  // Snapshot'tan snapshot'a esik (sunucu ve iz ayni fonksiyon): ilk snapshot ve geri giden saat bir tik.
  near(getSnapshotHeadingMinStep(5000, 5000 - SNAPSHOT_INTERVAL_MS), 0.4, "ardisik iki snapshot", 1e-12);
  near(getSnapshotHeadingMinStep(5000, undefined), 0.25, "ilk snapshot", 1e-12);
  near(getSnapshotHeadingMinStep(5000, 5005), 0.25, "geri giden saat", 1e-12);
  // Gecen sure yoksa (0 ya da eksi) esik sonsuz: hicbir adim dondurmuyor.
  assert.equal(getBodyHeadingMinStep(0), Infinity);
  assert.equal(getBodyHeadingMinStep(-5), Infinity);
  // Duz yuruyuste donme hizi: |dx| + |dy| hizi 6 birim/sn ustu (snapshot adimi 0,4).
  for (const perSecond of [2, 2.9, 3.1, 4, 5, 5.9, 6.1, 8, 26]) {
    const tracked = perSecond * (SNAPSHOT_INTERVAL_MS / 1000) > getBodyHeadingMinStep(SNAPSHOT_INTERVAL_MS);
    assert.equal(tracked, perSecond > 6 + 1e-9, `${perSecond}: esik`);
  }
  // Dokunun acisi: +y ekseni yon (dondurulmemis doku +y'ye bakiyor).
  near(getBodyHeadingRotation(0, 1), 0, "+y");
  near(getBodyHeadingRotation(1, 0), -Math.PI / 2, "+x");
});

test("yuvarlama kipirtisi: 0,1'e yuvarli snapshot konumlari yavas yuruyen ya da duran dusmanin yonunu cevirmiyor (iz de govde de)", () => {
  // Dusman 1,2 birim/sn ile x yonunde (snapshot basina 0,08): yuvarlanmis
  // konum farkinin |dx| + |dy|'si 0 ile 0,2 arasinda zipliyor. Eski esik
  // (snapshot basina 0,2) zaman zaman asiliyor ve doku y'ye de donuyordu.
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  const tracker = new bodies.EnemyHeadingTracker();
  let serverTime = 0;
  enemy.x = 10.04;
  enemy.y = 20.04;
  const broadcast = () => {
    room.noteSnapshotHeadings(serverTime);
    tracker.note([{ id: enemy.id, x: roundWire(enemy.x), y: roundWire(enemy.y) }], serverTime);
  };
  broadcast();
  const start = { ...tracker.get(enemy.id) };
  for (let snapshot = 0; snapshot < 400; snapshot += 1) {
    enemy.x += 1.2 * (SNAPSHOT_INTERVAL_MS / 1000);
    // Yanda yuvarlama sinirinda kipirti (0,05 cevresinde).
    enemy.y = 20.04 + (snapshot % 2 === 0 ? 0.02 : -0.02);
    serverTime += SNAPSHOT_INTERVAL_MS;
    broadcast();
    const seen = tracker.get(enemy.id);
    assert.ok(seen.headingX === start.headingX && seen.headingY === start.headingY, `${snapshot}: yuvarlama kipirtisi yonu cevirdi`);
    assert.ok(enemy.body.headingX === start.headingX && enemy.body.headingY === start.headingY, `${snapshot}: govde dondu`);
  }
});

test("yon kurali yavas ve capraz yuruyende: sunucunun govdesi her snapshot'ta istemcinin iziyle bire bir ayni, doku snapshot sinirlarinda; eski tik kurali ayrisiyordu", () => {
  // Turun dogrulayicisinin ornegi: sunucu govdeyi gercek konumla tik basina
  // 0,05 esigiyle ceviriyordu; |dx| + |dy| hizi 3-6 birim/sn olan (yavaslamis)
  // yuruyende istemcinin yuvarli snapshot adimi esigi asmiyor, doku ve iz
  // eski yonde kaliyordu. Simdi: dusman 1,5-8 birim/sn ile rastgele yonde
  // (capraz dahil) yuruyor, ortada 90 derece donuyor ve duruyor; sunucu
  // (`noteSnapshotHeadings`) ve iz (`EnemyHeadingTracker`) her snapshot'ta
  // ayni; doku 60 Hz'de snapshot sinirlarinda sunucunun yonunde, 144 Hz'de
  // yalnizca sunucunun dondugu bir snapshot adiminda donuyor.
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const rnd = random(4242);
  let clientTurns = 0;
  let oldRuleSplits = 0;
  for (let run = 0; run < 240; run += 1) {
    room.enemies.clear();
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    const speed = 1.5 + rnd() * 6.5;
    const angle = run % 4 === 0 ? Math.PI / 4 + (run % 8) * (Math.PI / 2) : rnd() * Math.PI * 2;
    const corner = 40 + Math.floor(rnd() * 40);
    const stop = corner + 40 + Math.floor(rnd() * 40);
    const ticks = stop + 60;
    const positions = [[50.03, 50.07]];
    let ux = Math.cos(angle);
    let uy = Math.sin(angle);
    for (let tick = 1; tick <= ticks; tick += 1) {
      if (tick === corner) [ux, uy] = [-uy, ux];
      const [px, py] = positions[tick - 1];
      positions.push(tick < stop ? [px + ux * speed / 60, py + uy * speed / 60] : [px, py]);
    }
    // Eski kural: gercek konumla tik basina 0,05.
    const old = { headingX: 0, headingY: 1, fromX: positions[0][0], fromY: positions[0][1] };
    const oldAt = [[0, 1]];
    for (let tick = 1; tick <= ticks; tick += 1) {
      updateBodyHeading(old, positions[tick][0], positions[tick][1], BODY_HEADING_MIN_STEP);
      oldAt.push([old.headingX, old.headingY]);
    }
    // Snapshot'lar her 4. tikte, konumlar telde 0,1'e yuvarli; sunucu ayni yayinda olcuyor.
    const snapshots = [];
    const tracker = new bodies.EnemyHeadingTracker();
    let previous;
    let split = false;
    for (let tick = 0; tick <= ticks; tick += 4) {
      const at = tick * SERVER_TICK_MS;
      enemy.x = positions[tick][0];
      enemy.y = positions[tick][1];
      room.noteSnapshotHeadings(at);
      // Istemcinin hidratlanmis kaydi: iz bu snapshot'taki yonu kayda yaziyor.
      const record = { id: enemy.id, x: roundWire(enemy.x), y: roundWire(enemy.y) };
      tracker.note([record], at);
      const seen = tracker.get(enemy.id);
      assert.ok(enemy.body.headingX === seen.headingX && enemy.body.headingY === seen.headingY, `${run}: ${speed.toFixed(2)} birim/sn, ${tick}. tikte sunucu ile iz ayri`);
      assert.ok(record.hx === seen.headingX && record.hy === seen.headingY, "kayda yon yazilmadi");
      if (previous && (seen.headingX !== previous[0] || seen.headingY !== previous[1])) clientTurns += 1;
      if (angleGap(headingAngle(...oldAt[tick]), headingAngle(seen.headingX, seen.headingY)) > 0.5) split = true;
      previous = [seen.headingX, seen.headingY];
      snapshots.push({ at, record, server: [enemy.body.headingX, enemy.body.headingY] });
    }
    if (split) oldRuleSplits += 1;
    // Doku (GameScene): oynatma ani t icin onceki (<= t) ve sonraki (>= t)
    // snapshot, ara degerlenmis kayit sonrakinden (`...enemy`); aci kaydin
    // yonu. Kare evresi rastgele (60 ve 144 Hz): her karede doku oynattigi
    // adimin sonundaki snapshot'ta sunucunun govdesinin yonunde, snapshot
    // sinirinda ikisi ayni; iki adimin karisik yonu yok.
    for (const hz of [60, 144]) {
      const frame = 1000 / hz;
      const phase = rnd() * frame;
      for (let at = phase; at <= snapshots.at(-1).at; at += frame) {
        const next = snapshots.find((snapshot) => snapshot.at >= at);
        const shown = { ...next.record };
        const rotation = getBodyHeadingRotation(shown.hx, shown.hy);
        assert.ok(angleGap(rotation, getBodyHeadingRotation(...next.server)) < 1e-12, `doku ${hz} Hz: ${speed.toFixed(2)} birim/sn, sunucunun yonunde degil`);
      }
    }
  }
  // Ornekler gercekten donuyor; eski tik kurali bu kosularin coklugunda izden ayrisiyordu.
  assert.ok(clientTurns > 200 && oldRuleSplits > 40, `${clientTurns} / ${oldRuleSplits}`);
});

test("yon: sonradan gelen istemci yonu tam statik kayittan (hx, hy) baslatiyor; doguma ve dondurulmemis dokuya anahtar yazilmiyor", () => {
  // Sonradan gelen (ya da yeniden baglanip tam kayit isteyen) istemcinin izi
  // dusmani ilk gordugu snapshot'ta baslatiyor: eskiden hep +y, duran
  // dusman yuruyene kadar sunucunun govdesinden ayri yone bakiyordu.
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.spawnEnemy();
  room.spawnEnemy();
  const [walker, idle] = [...room.enemies.values()];
  let serverTime = 1000;
  const broadcast = () => {
    serverTime += SNAPSHOT_INTERVAL_MS;
    room.noteSnapshotHeadings(serverTime);
  };
  broadcast();
  walker.x += 6;
  broadcast();
  assert.deepEqual([walker.body.headingX, walker.body.headingY], [1, 0]);
  const sent = [];
  room.sendFullStaticSnapshot({ send: (type, payload) => sent.push({ type, payload }) });
  const statics = new Map(sent[0].payload.enemies.map((entry) => [entry.id, entry]));
  assert.deepEqual([statics.get(walker.id).hx, statics.get(walker.id).hy], [walker.body.headingX, walker.body.headingY], "yon tohumu");
  assert.ok(!("hx" in statics.get(idle.id)) && !("hy" in statics.get(idle.id)), "dondurulmemis dokuya anahtar yazildi");
  // Dogumun statik kaydinda (`enemy:spawn`) anahtar yok.
  const spawned = [];
  room.broadcast = (type, payload) => spawned.push({ type, payload });
  room.spawnEnemy();
  const spawn = spawned.find((entry) => entry.type === "enemy:spawn");
  assert.ok(spawn && !("hx" in spawn.payload), "dogum kaydina yon yazildi");
  room.broadcast = () => {};
  room.enemies.delete(spawn.payload.id);
  // Yeni iz: ilk snapshot'ta tohumla basliyor, sunucunun yonuyle ayni; kayda o snapshot'taki yon yaziliyor.
  const tracker = new bodies.EnemyHeadingTracker();
  const records = () => [...room.enemies.values()].map((enemy) => ({ ...statics.get(enemy.id), id: enemy.id, x: roundWire(enemy.x), y: roundWire(enemy.y) }));
  broadcast();
  const first = records();
  tracker.note(first, serverTime);
  assertHeadingsMatch(room, tracker, "ilk snapshot");
  assert.deepEqual([first[0].hx, first[0].hy], [walker.body.headingX, walker.body.headingY]);
  assert.deepEqual([first[1].hx, first[1].hy], [BODY_DEFAULT_HEADING_X, BODY_DEFAULT_HEADING_Y]);
  // Duran dusman durdukca (tohumsuz olsaydi +y'de kalirdi) ve yuruyen yeniden yuruyunce ayni.
  for (let step = 0; step < 20; step += 1) {
    walker.y += step < 10 ? 0 : 0.6;
    broadcast();
    tracker.note(records(), serverTime);
    assertHeadingsMatch(room, tracker, `${step}. snapshot`);
  }
  assert.deepEqual([walker.body.headingX, walker.body.headingY], [0, 1]);
});

test("yon: rastgele dusmanlar, yayinlar arasi dogum, kacan ve tekrarlanmayan yayinlar, titresimli tik: sunucu her snapshot'ta istemcinin iziyle ayni", () => {
  // Yayin istemcinin aldigi snapshot'la ayni anda: kimseye gitmeyen kare
  // (geri basinc) ve bos tahtanin tekrarlanan karesi iki yanda da yok; fark
  // bir sonraki giden kareye kadar buyuyor. Yavas (yavaslamis), hizli,
  // duran, itilen ve kosede donen dusmanlar; bazilari yayinlar arasinda
  // doguyor, bazilari olup gidiyor.
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const rnd = random(90210);
  const tracker = new bodies.EnemyHeadingTracker();
  const movers = new Map();
  const spawn = () => {
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    enemy.x = 100 + rnd() * 600;
    enemy.y = 100 + rnd() * 400;
    const angle = rnd() * Math.PI * 2;
    movers.set(enemy.id, { speed: rnd() < 0.5 ? 2 + rnd() * 6 : rnd() * 40, ux: Math.cos(angle), uy: Math.sin(angle) });
  };
  for (let index = 0; index < 24; index += 1) spawn();
  let now = 0;
  let lastBroadcast = -Infinity;
  let snapshots = 0;
  let skipped = 0;
  let turns = 0;
  let checks = 0;
  const lastSeen = new Map();
  for (let tick = 0; tick < 6000; tick += 1) {
    now += 15.6 + rnd() * 1.6;
    for (const enemy of room.enemies.values()) {
      const mover = movers.get(enemy.id);
      const roll = rnd();
      if (roll < 0.004) [mover.ux, mover.uy] = [-mover.uy, mover.ux];
      else if (roll < 0.006) mover.speed = rnd() < 0.3 ? 0 : rnd() < 0.6 ? 2 + rnd() * 6 : rnd() * 40;
      else if (roll < 0.007) {
        // Itme (vurus, sicrama): tek tikte birkac birim.
        enemy.x += (rnd() - 0.5) * 8;
        enemy.y += (rnd() - 0.5) * 8;
      }
      enemy.x += mover.ux * mover.speed / 60;
      enemy.y += mover.uy * mover.speed / 60;
    }
    if (rnd() < 0.01 && room.enemies.size > 4) {
      const [id] = [...room.enemies.keys()].slice(Math.floor(rnd() * room.enemies.size));
      room.enemies.delete(id);
    }
    if (rnd() < 0.02) spawn();
    room.rebuildEnemyGrid();
    if (now - lastBroadcast < SNAPSHOT_SEND_INTERVAL_MS) continue;
    lastBroadcast = now;
    if (rnd() < 0.12) {
      skipped += 1;
      continue;
    }
    const serverTime = Math.floor(now);
    room.noteSnapshotHeadings(serverTime);
    tracker.note([...room.enemies.values()].map((enemy) => ({ id: enemy.id, x: roundWire(enemy.x), y: roundWire(enemy.y) })), serverTime);
    snapshots += 1;
    checks += assertHeadingsMatch(room, tracker, `${tick}. tik`);
    for (const enemy of room.enemies.values()) {
      const previous = lastSeen.get(enemy.id);
      if (previous && (previous[0] !== enemy.body.headingX || previous[1] !== enemy.body.headingY)) turns += 1;
      lastSeen.set(enemy.id, [enemy.body.headingX, enemy.body.headingY]);
    }
  }
  assert.ok(snapshots > 1000 && skipped > 100 && checks > 20000 && turns > 500, `${snapshots} / ${skipped} / ${checks} / ${turns}`);
});

/**
 * Tek dusman, tik tik verilen konumlarla: sunucunun yayini
 * (`noteSnapshotHeadings`, snapshot her 4. tikte) ve istemcinin izi (0,1'e
 * yuvarli konumlar); eski kural (gercek konumla tik basina 0,05) yaninda.
 * Her snapshot'ta sunucu ile iz ayni olmali.
 */
function walkWithSnapshots(path, ticks) {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  const tracker = new bodies.EnemyHeadingTracker();
  const start = path(0);
  const old = { headingX: BODY_DEFAULT_HEADING_X, headingY: BODY_DEFAULT_HEADING_Y, fromX: start[0], fromY: start[1] };
  const states = [];
  for (let tick = 0; tick <= ticks; tick += 1) {
    [enemy.x, enemy.y] = path(tick);
    if (tick > 0) updateBodyHeading(old, enemy.x, enemy.y, BODY_HEADING_MIN_STEP);
    room.rebuildEnemyGrid();
    if (tick % 4 !== 0) continue;
    const serverTime = 5000 + tick * SERVER_TICK_MS;
    room.noteSnapshotHeadings(serverTime);
    tracker.note([{ id: enemy.id, x: roundWire(enemy.x), y: roundWire(enemy.y) }], serverTime);
    assertHeadingsMatch(room, tracker, `${tick}. tik`);
    states.push({ tick, server: [enemy.body.headingX, enemy.body.headingY], old: [old.headingX, old.headingY] });
  }
  return states;
}

test("yon: %85 yavaslamis piyade 90 derecelik kosede: sunucunun govdesi 1 sn sonra (ve her snapshot'ta) istemcinin iziyle ayni; eski tik kurali ayrisiyordu", () => {
  // Turun dogrulayicisinin ornegi: piyade (26,2 birim/sn) +x'e 2 sn tam
  // hizla yuruyor, sonra %85 yavaslayip (3,93 birim/sn, tik basina 0,0655)
  // kosede +y'ye donuyor. Eski kuralda sunucu govdeyi koseden bir tik sonra
  // ceviriyordu; iz ve doku (snapshot adimi ~0,26 < 0,4) 2,7-8 sn boyunca
  // +x'te kaliyordu. Simdi ikisi ayni kuralla, ayni yonde; 90 ve 85
  // derecelik (capraz) kose ve %90 yavaslamis kosucu da.
  for (const [label, full, slow, turn] of [
    ["piyade", 26.2, 0.15, Math.PI / 2],
    ["piyade 85 derece", 26.2, 0.15, (85 * Math.PI) / 180],
    ["kosucu", 46.2, 0.1, -Math.PI / 2]
  ]) {
    const cornerTick = 120;
    const path = (tick) => {
      const fast = Math.min(tick, cornerTick) * full / 60;
      const after = Math.max(0, tick - cornerTick) * full * slow / 60;
      return [37.04 + fast + Math.cos(turn) * after, 81.03 + Math.sin(turn) * after];
    };
    const states = walkWithSnapshots(path, cornerTick + 60 * 8);
    const at = (tick) => states.find((state) => state.tick >= tick);
    const second = at(cornerTick + 60);
    // 1 sn sonra: sunucu ile iz ayni (her snapshot'ta da); ikisi de koseden onceki yonde.
    near(second.server[0], 1, `${label}: govde +x'te degil`, 1e-12);
    // Eski kural yeni yone donmustu (2-8 birimlik kenar kaymasi).
    assert.ok(angleGap(headingAngle(...second.old), turn) < 0.05, `${label}: eski kural donmemis (ornek bandin disinda)`);
    // Yavas yuruyus suresince (8 sn) hicbir snapshot'ta sunucu izden ayri degil (walkWithSnapshots).
    assert.ok(states.length > 100);
  }
});

test("yon: dogumdan beri yavas, duz yuruyen dusman: govde de iz de dondurulmemis dokuda (+y); eski kural yuruyus yonune ceviriyordu", () => {
  // Turun dogrulayicisinin ikinci ornegi: dogar dogmaz %85 yavaslayan
  // dusman +x'e duz yuruyor (snapshot adimi ~0,26). Istemcinin izi ve doku
  // dondurulmemis dokuda (+y) kaliyor; eski kuralda sunucu govdeyi +x'e
  // ceviriyordu. Yayinlar arasi dogum: ilk snapshot yalnizca konumu yaziyor.
  for (const [speed, born] of [[3.93, 0], [4.62, 1], [5.5, 3]]) {
    const states = walkWithSnapshots((tick) => [12.34 + Math.max(0, tick - born) * speed / 60, 56.78], 60 * 6);
    for (const state of states) assert.deepEqual(state.server, [BODY_DEFAULT_HEADING_X, BODY_DEFAULT_HEADING_Y], `${speed}: ${state.tick}. tikte govde dondu`);
    assert.ok(angleGap(headingAngle(...states.at(-1).old), 0) < 1e-9, `${speed}: eski kural donmemis`);
  }
});

test("yon: uretim yolunda rastgele yavaslatmalar ve kulelerin bukttugu yollar: sunucunun govdesi giden her snapshot'ta istemcinin iziyle ayni", () => {
  // Tam tik (tohumlu oda, \`update\`), giden snapshot'lar istemcinin snapshot
  // yolundan (tam kare, delta). Yolun ortasina kuleler (yuruyus 15-65
  // derece bukuluyor); her yeni dusmana ve ara ara rastgele dusmanlara
  // rastgele yavaslatma (%55-95: bandin tamami). Eski tik kuralinin izden
  // ayristigi snapshot'lar da sayiliyor: ornek gercekten o bandi geziyor.
  const { room, tick, mirror } = liveRoom({ seed: 33 });
  const peer = room.clients[0];
  room.state.players.get(peer.sessionId).gold = 1e6;
  const map = room.activeMap;
  // Ilk dusmanin seridine, onune kuleler: yol onlarin cevresinden bukuluyor.
  let checks = 0;
  for (let step = 0; step < 60 * 30 && room.enemies.size === 0; step += 1) checks += tick(`bekleme ${step}. tik`);
  const first = [...room.enemies.values()][0];
  assert.ok(first, "dusman dogmadi");
  const lane = worldToGrid(first.x, first.y, map);
  for (let row = lane.row + 3; row < map.rows - 2; row += 3) {
    for (const offset of [-2, -1, 0, 1, 2]) {
      if (Math.abs(offset) === 2 && row % 2) continue;
      const world = gridToWorld(lane.col + offset, row, map);
      room.placeTower(peer, { x: world.x, y: world.y, definitionId: "warrior-1" });
    }
  }
  assert.ok(room.towers.size > 3, `${room.towers.size} kule`);
  const rnd = random(31337);
  const olds = new Map();
  let splits = 0;
  let bent = 0;
  for (let step = 0; step < 60 * 45; step += 1) {
    const now = room.runtime.now();
    for (const enemy of room.enemies.values()) {
      if (!olds.has(enemy.id)) {
        if (rnd() < 0.6) room.addEnemySlowFloor(enemy, 0.05 + rnd() * 0.4, now + 2000 + rnd() * 8000, "flat", now);
        olds.set(enemy.id, { headingX: 0, headingY: 1, fromX: enemy.x, fromY: enemy.y });
      } else if (rnd() < 0.003) {
        room.addEnemySlowFloor(enemy, 0.05 + rnd() * 0.4, now + 500 + rnd() * 4000, `test${step}`, now);
      }
    }
    const matched = tick(`${step}. tik`);
    checks += matched;
    for (const enemy of room.enemies.values()) {
      const old = olds.get(enemy.id);
      if (!old) continue;
      updateBodyHeading(old, enemy.x, enemy.y, BODY_HEADING_MIN_STEP);
      if (Math.abs(old.headingX) > 0.2) bent += 1;
      if (matched > 0 && angleGap(headingAngle(old.headingX, old.headingY), headingAngle(enemy.body.headingX, enemy.body.headingY)) > 0.3) splits += 1;
    }
  }
  assert.ok(checks > 5000 && bent > 500 && splits > 20, `${checks} / ${bent} / ${splits}`);
});

test("yon: kaydedilmis bir bot macinin yeniden oynatilan tel snapshot'lari (delta ve tam kare): sunucunun govdesi her snapshot'ta istemcinin iziyle ayni", async () => {
  // Uretim yolu: bot maci (titresimli tik, Zeynep'in yavaslatmalari, tel
  // mesajlari), kaydi bagimsiz oynatiliyor; oynatilan odanin giden her
  // karesi (delta, `sendSnapshotWithBackpressure`) istemcinin snapshot
  // yolundan geciyor. Iki tohum, iki operator.
  const dir = mkdtempSync(join(tmpdir(), "nx-heading-"));
  try {
    let checks = 0;
    let frames = 0;
    for (const [operators, seed, stage] of [[["zeynep"], 5, 1], [["warrior"], 9, 2]]) {
      const match = await runRecordedBotMatch({ operators, stage, seed, maxWaves: 2, dir });
      const recording = loadRecordingFile(match.path);
      const mirror = clientMirror();
      let wrapped;
      let fresh = 0;
      const replay = await replayRecording(recording, {
        beforeTick(room) {
          if (wrapped === room) return;
          wrapped = room;
          const send = room.sendSnapshotWithBackpressure.bind(room);
          room.sendSnapshotWithBackpressure = (wire, full) => {
            const sent = send(wire, full);
            if (sent) {
              mirror.receive(wire);
              fresh += 1;
            }
            return sent;
          };
        },
        afterTick(room, tickIndex) {
          if (fresh === 0) return;
          fresh = 0;
          frames += 1;
          checks += assertHeadingsMatch(room, mirror.tracker, `${operators} ${seed}: ${tickIndex}. tik`);
        }
      });
      assert.deepEqual(replay.mismatches, [], "yeniden oynatma ayristi");
    }
    assert.ok(frames > 500 && checks > 2000, `${frames} / ${checks}`);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("istemci dokuyu paylasilan kuralla ciziyor ve donduruyor; sahne olcegi paylasilan; sunucuda daire yaricapi kalmadi", () => {
  const scene = read("apps/web/src/scenes/GameScene.ts");
  // Yerel boy tablosu ya da elle yazilmis bombaci olcegi yok; sunucunun okudugu fonksiyonlar.
  assert.doesNotMatch(scene, /const ENEMY_DISPLAY_SIZE|const BOMBER_ART_SCALE|function getEnemySpriteDisplaySize|function getEnemyTextureKey/);
  assert.match(scene, /getEnemyBodyScale\(\{ champion: enemy\.champion, ds: raceView\?\.drawer \}\)/);
  assert.match(scene, /const artScale = getEnemyArtScale\(enemy\);/);
  assert.match(scene, /enemy\.movementKind === "air" \? AIR_ENEMY_DISPLAY_SCALE : 1\) \+ slowPulse/);
  // Doku oynatilan snapshot'in yonuyle (iz gelen snapshot'in kaydina yaziyor,
  // ara degerleme kaydi sonraki snapshot'tan kuruyor); kare kare konum
  // farkiyla donmuyor. Havuzdan gelen doku dondurulmemis aciyla basliyor, ayni
  // karede kaydin yonu yaziliyor.
  assert.match(scene, /return hx !== undefined && hy !== undefined \? getBodyHeadingRotation\(hx, hy\) : previousRotation;/);
  assert.match(scene, /mover\.sprite\.setRotation\(this\.getEnemySpriteRotation\(enemy, mover\.sprite\.rotation\)\);/);
  assert.match(scene, /this\.enemyHeadings\.note\(hydratedSnapshot\.enemies, hydratedSnapshot\.serverTime\);[\s\S]*this\.snapshotBuffer\.push\(bufferedSnapshot\);/);
  assert.match(scene, /const enemies = next\.enemies\.map\(\(enemy\) => \{[\s\S]*?return \{\s+\.\.\.enemy,/);
  assert.doesNotMatch(scene, /isBodyHeadingStep|getBodyHeadingMinStep|lastEnemyTurnServerTime|> 0\.05\)/);
  // Mermilerin sahne olcegi sunucunun isabet seklinin olcegi.
  assert.match(scene, /private getTowerEffectScale\(\) \{\s+return getProjectileSceneScale\(this\.getMapCellSize\(\)\);/);
  // Carpmanin ani temasin tiki (mesajin tikinden bir tik once).
  assert.match(scene, /at: getContactServerTime\(received\)/);
  const receipts = read("apps/web/src/vfx/zeynep-signatures.ts");
  assert.doesNotMatch(receipts, /getEnemyTypeCollisionRadius|getEnemyHitRadius|isBodyTouchingSector/);
  assert.match(receipts, /isBodyInKinShowcase\(getReceiptEnemyBody\(enemy, gridSize, headings\)\.body/);
  assert.match(receipts, /isBodyTouchingKinWave\(getReceiptEnemyBody\(enemy, gridSize, headings\)\.body, sector\)/);
  const server = read("apps/server/src/rooms/MatchRoom.ts");
  assert.doesNotMatch(server, /getEnemyTypeCollisionRadius|getBallisticCollisionRadius|getEnemyHitRadius|hitRadius|bodyHalfLength|headingFromX/);
});

/* ------------------------------------------------------------------ */
/* Kesin geometri (bagimsiz hesaba karsi)                                */
/* ------------------------------------------------------------------ */

test("nokta, kapsul ve isin bandi govdeye kesin: bagimsiz uzaklik hesabiyla ayni (yuvarlak koseli cokgen)", () => {
  const rnd = random(20261019);
  for (let index = 0; index < 1500; index += 1) {
    const body = randomBody(rnd);
    const polygon = worldPolygon(body);
    const q = [body.x + (rnd() - 0.5) * 60, body.y + (rnd() - 0.5) * 60];
    const r = rnd() * 10;
    const distance = pointDistance(polygon, q);
    if (Math.abs(distance - r) > 1e-6) assert.equal(isPointInBody(body, q[0], q[1], r), distance <= r, `nokta ${distance} / ${r}`);
    const a = [body.x + (rnd() - 0.5) * 80, body.y + (rnd() - 0.5) * 80];
    const b = [body.x + (rnd() - 0.5) * 80, body.y + (rnd() - 0.5) * 80];
    const segment = polygonDistance(polygon, [a, b]);
    if (Math.abs(segment - r) > 1e-6) assert.equal(isSegmentTouchingBody(body, a[0], a[1], b[0], b[1], r), segment <= r, `kapsul ${segment} / ${r}`);
    // Bant: uclari kesik dikdortgen.
    const w = rnd() * 8;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (-(b[1] - a[1]) / length) * w;
    const ny = ((b[0] - a[0]) / length) * w;
    const band = hull([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
    const gap = polygonDistance(polygon, band);
    if (gap > 1e-6 || polygonDistance(hull(polygon), band) === 0) assert.equal(isBandTouchingBody(body, a[0], a[1], b[0], b[1], w), gap === 0, `bant ${gap}`);
  }
});

test("yozlasmis sekiller: acisi sifir kama ve dilim isin parcasi (sisirmeyle kapsul), boyu sifir bant daire; sonuc dusmanin yonune bagli degil", () => {
  // Eskiden sifir alanli kamada kirpma yuvarlama isaretine bagliydi (orneklemenin
  // degdigi govdeyi kaciriyordu); boyu sifir bant dusmanin yerel eksenine
  // hizali dikdortgene donuyor, sonuc yone gore degisiyordu.
  const rnd = random(1010);
  let touched = 0;
  for (let index = 0; index < 600; index += 1) {
    const body = randomBody(rnd);
    const o = [body.x + (rnd() - 0.5) * 80, body.y + (rnd() - 0.5) * 80];
    const angle = rnd() * Math.PI * 2;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const inner = rnd() * 30;
    const outer = inner + rnd() * 40;
    const ray = isSegmentTouchingBody(body, o[0] + ux * inner, o[1] + uy * inner, o[0] + ux * outer, o[1] + uy * outer, 0);
    assert.equal(isBodyTouchingAnnularSector(body, o[0], o[1], ux, uy, ux, uy, 0, inner, outer), ray, "acisi sifir halka dilimi isin parcasi degil");
    const inflate = rnd() * 4;
    const capsule = isSegmentTouchingBody(body, o[0], o[1], o[0] + ux * outer, o[1] + uy * outer, inflate);
    assert.equal(isBodyTouchingSector(body, o[0], o[1], ux, uy, ux, uy, 0, outer, inflate), capsule, "acisi sifir dilim kapsul degil");
    if (ray || capsule) touched += 1;
    // Boyu sifir bant: yaricapi yari en olan daire, yonden bagimsiz.
    const half = rnd() * 6;
    const disc = isPointInBody(body, o[0] * 0.2 + body.x * 0.8, o[1] * 0.2 + body.y * 0.8, half);
    const px = o[0] * 0.2 + body.x * 0.8;
    const py = o[1] * 0.2 + body.y * 0.8;
    assert.equal(isBandTouchingBody(body, px, py, px, py, half), disc, "boyu sifir bant daire degil");
    const turned = { ...body, headingX: -body.headingY, headingY: body.headingX };
    assert.equal(isBandTouchingBody(turned, px, py, px, py, half), isPointInBody(turned, px, py, half), "boyu sifir bant yone bagli");
  }
  assert.ok(touched > 50, `${touched}`);
});

test("cokgenin ic dairesi: kare merkezli, cokgenin icinde; alan halkasi ve bant sorulari onu kabul ederken kesin kalan", () => {
  for (const race of RACES) {
    for (const art of ARTS) {
      const polygon = getEnemyBodyPolygon(race, art);
      assert.ok(polygon.containsOrigin && polygon.inRadius > 0, `${race} ${art}`);
      for (let k = 0; k < polygon.count; k += 1) assert.ok(polygon.h[k] >= polygon.inRadius - 1e-12, `${race} ${art}: kenar ${k}`);
      // Dairenin noktalari cokgenin icinde.
      const vertices = Array.from({ length: polygon.count }, (_, k) => [polygon.vx[k], polygon.vy[k]]);
      for (let step = 0; step < 64; step += 1) {
        const a = (step / 64) * Math.PI * 2;
        assert.ok(inside(vertices, [Math.cos(a) * polygon.inRadius * 0.999999, Math.sin(a) * polygon.inRadius * 0.999999]), `${race} ${art}: ic daire tasiyor`);
      }
    }
  }
});

test("ic dairenin kisa yolu yalnizca merkezi icerde olan cokgende: merkezi disarida kalan cokgen uzaktan kabul edilmiyor (nokta, parca, bant, halka)", () => {
  // Turun dogrulayicisinin ornegi: kare (2,2)-(4,4), merkez disarida (ic
  // daire 0). Kisa yol `uzaklik <= yaricap + 0` diye merkeze degen her
  // sekli kabul ediyordu; cokgen en az 2,83 uzakta. Uretimdeki butun
  // cokgenler merkezi iceriyor (bir onceki test); kural geneli icin.
  const square = createEnemyBodyPolygon([2, 2, 4, 2, 4, 4, 2, 4]);
  assert.equal(square.containsOrigin, false);
  const body = { x: 0, y: 0, headingX: 0, headingY: 1, fromX: 0, fromY: 0, scale: 1, reach: square.radius, poly: square };
  const polygon = worldPolygon(body);
  assert.equal(isPointInBody(body, 0, 0, 0.5), false, "nokta");
  assert.equal(isPointInBody(body, 0, 0, 0), false, "nokta, yaricap 0");
  assert.equal(isBandTouchingBody(body, 0, -5, 0, 5, 0.5), false, "bant");
  assert.equal(isSegmentTouchingBody(body, -5, 0, 5, 0, 0.5), false, "parca");
  // Bagimsiz uzaklikla ayni (cokgenin yaninda ve uzaginda).
  const rnd = random(616);
  for (let index = 0; index < 2000; index += 1) {
    const turned = { ...body };
    const angle = rnd() * Math.PI * 2;
    turned.headingX = Math.cos(angle);
    turned.headingY = Math.sin(angle);
    const world = worldPolygon(turned);
    const p = [(rnd() - 0.5) * 14, (rnd() - 0.5) * 14];
    const radius = rnd() * 3;
    const gap = pointDistance(world, p);
    if (Math.abs(gap - radius) > 1e-6) assert.equal(isPointInBody(turned, p[0], p[1], radius), gap <= radius, `nokta ${gap} / ${radius}`);
    const q = [p[0] + (rnd() - 0.5) * 10, p[1] + (rnd() - 0.5) * 10];
    const segment = polygonDistance(world, [p, q]);
    if (Math.abs(segment - radius) > 1e-6) assert.equal(isSegmentTouchingBody(turned, p[0], p[1], q[0], q[1], radius), segment <= radius, `parca ${segment} / ${radius}`);
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (length > 1e-6) {
      const nx = -(q[1] - p[1]) / length;
      const ny = (q[0] - p[0]) / length;
      const band = [[p[0] - nx * radius, p[1] - ny * radius], [q[0] - nx * radius, q[1] - ny * radius], [q[0] + nx * radius, q[1] + ny * radius], [p[0] + nx * radius, p[1] + ny * radius]];
      const bandGap = polygonDistance(world, band);
      if (bandGap > 1e-6 || bandGap === 0) assert.equal(isBandTouchingBody(turned, p[0], p[1], q[0], q[1], radius), bandGap === 0, `bant ${bandGap}`);
    }
  }
  assert.ok(polygon.length === 4);
});

test("yorunge bicagi cizilen cokgeniyle: taranan alan bicagin ara konumlarinin birlesimiyle ayni (bagimsiz ornekleme)", () => {
  // Bicagin cizilen govdesi (GameScene \`BLADE_BODY\`): kok kenari kuleden
  // 0,18 kare, sivri uc boyda. Bagimsiz: bicagin cokgeni taramanin 600 ara
  // acisinda; govdeye uzakligin en kucugu.
  const rnd = random(4242);
  const cell = 34;
  let agreed = 0;
  for (let index = 0; index < 220; index += 1) {
    const body = randomBody(rnd);
    const length = 30 + rnd() * 40;
    const width = 4 + rnd() * 6;
    const inner = getOrbitBladeInner(cell);
    const distance = 10 + rnd() * (length + 12);
    const a = rnd() * Math.PI * 2;
    const tower = [body.x - Math.cos(a) * distance, body.y - Math.sin(a) * distance];
    const previousAngle = rnd() * Math.PI * 2;
    const sweep = rnd() < 0.15 ? 0 : rnd() * 1.4;
    const query = { x: tower[0], y: tower[1], previousAngle, nextAngle: previousAngle + sweep, bladeCount: 1, bladeLength: length, bladeWidth: width, bladeInner: inner };
    const model = selectOrbitSweepContacts(query, [{ id: "e", x: body.x, y: body.y, body }]).length > 0;
    const polygon = worldPolygon(body);
    let best = Infinity;
    for (let step = 0; step <= 600; step += 1) {
      const angle = previousAngle + (sweep * step) / 600;
      const fx = Math.cos(angle);
      const fy = Math.sin(angle);
      const corner = (along, side) => [tower[0] + fx * along - fy * side, tower[1] + fy * along + fx * side];
      const blade = [corner(inner, -width * 0.34), corner(inner, width * 0.34), corner(length * 0.76, width * 0.5), corner(length, width * 0.05), corner(length * 0.86, -width * 0.48)];
      best = Math.min(best, polygonDistance(polygon, hull(blade)));
      if (best === 0) break;
    }
    // Ornekleme acilari arasindaki yay (en fazla ~0,2 birim) belirsiz: atla.
    if (best > 0 && best < 0.25) continue;
    assert.equal(model, best === 0, `bicak: model ${model}, ornekleme uzakligi ${best.toFixed(3)} (boy ${length.toFixed(1)}, aci ${sweep.toFixed(2)})`);
    agreed += 1;
  }
  assert.ok(agreed > 150, `${agreed}`);
});

test("kama ve halka (Kin dalgasinin yayi, dilimler) ve Kin gosterisinin ucgeni govdeye kesin", () => {
  const rnd = random(4411);
  const inAnnulus = (q, o, start, sweep, inner, outer) => {
    const d = Math.hypot(q[0] - o[0], q[1] - o[1]);
    if (d < inner || d > outer) return false;
    const a = ((Math.atan2(q[1] - o[1], q[0] - o[0]) - start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    return a <= sweep;
  };
  let checked = 0;
  for (let index = 0; index < 1200; index += 1) {
    const body = randomBody(rnd);
    const polygon = worldPolygon(body);
    const o = [body.x + (rnd() - 0.5) * 120, body.y + (rnd() - 0.5) * 120];
    const start = rnd() * Math.PI * 2;
    const sweep = rnd() < 0.2 ? rnd() * 2 * Math.PI : rnd() * 1.6;
    const inner = rnd() * 50;
    const outer = inner + 0.5 + rnd() * 40;
    const call = (low, high) => isBodyTouchingAnnularSector(body, o[0], o[1], Math.cos(start), Math.sin(start), Math.cos(start + sweep), Math.sin(start + sweep), sweep, low, high);
    // Ornek: cokgenin sinir ve ic noktalari bolgede mi; sinirda ornekleme payi (0,15).
    const centre = polygon.reduce((sum, p) => [sum[0] + p[0] / polygon.length, sum[1] + p[1] / polygon.length], [0, 0]);
    let sampled = false;
    for (let i = 0; i < polygon.length && !sampled; i += 1) {
      for (let s = 0; s < 40 && !sampled; s += 1) {
        const p = [polygon[i][0] + (polygon[(i + 1) % polygon.length][0] - polygon[i][0]) * s / 40, polygon[i][1] + (polygon[(i + 1) % polygon.length][1] - polygon[i][1]) * s / 40];
        for (let f = 0; f <= 8 && !sampled; f += 1) sampled = inAnnulus([centre[0] + (p[0] - centre[0]) * f / 8, centre[1] + (p[1] - centre[1]) * f / 8], o, start, sweep, inner, outer);
      }
    }
    if (sampled) assert.equal(call(inner, outer), true, "ornek bolgede ama degmedi");
    else if (call(inner, outer)) assert.equal(call(Math.max(0, inner + 0.15), Math.max(inner + 0.15, outer - 0.15)), call(inner + 0.15, outer - 0.15), "degdi ama ornek bolgede degil");
    else checked += 1;
    // Ucgen: cokgenlerin kesisimi.
    const angle = rnd() * 2 * Math.PI;
    const range = 20 + rnd() * 100;
    const far = [o[0] + Math.cos(angle) * range, o[1] + Math.sin(angle) * range];
    const width = Math.max(12, Math.tan(Math.PI / 6) * range * 2);
    const n = [(-Math.sin(angle) * width) / 2, (Math.cos(angle) * width) / 2];
    const triangle = hull([o, [far[0] + n[0], far[1] + n[1]], [far[0] - n[0], far[1] - n[1]]]);
    const gap = polygonDistance(polygon, triangle);
    if (gap > 1e-6 || gap === 0) assert.equal(isBodyInKinShowcase(body, o[0], o[1], far[0], far[1], width), gap === 0, `ucgen ${gap}`);
  }
  assert.ok(checked > 100, `${checked}`);
});

test("ucan mermi: ilk temas bagimsiz hesapla ayni (parcalar, disk, kesik disk; Melis'te kapsul ve igne); temas noktasi govdenin kenarinda ve merminin cizilen govdesinde", () => {
  const rnd = random(777);
  const ids = ["zeynep-1", "warrior-1", "warrior-4", "warrior-6", "warrior-3", "zeynep-3-copy", "onur-2", "archer-1", "archer-5", "mage-1", "warrior-2", "zeynep-3"];
  let hits = 0;
  let clipped = 0;
  for (let index = 0; index < 240; index += 1) {
    const body = randomBody(rnd);
    const polygon = worldPolygon(body);
    const id = ids[index % ids.length];
    const tier = 1 + (index % 3);
    const shape = getProjectileShape(id, tier);
    const angle = rnd() * 2 * Math.PI;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const lateral = (rnd() - 0.5) * 2 * (body.reach + shape.halfWidth + 1);
    const back = body.reach + 2 + rnd() * 6 - (index % 5 === 0 ? body.reach + 4 : 0);
    const fx = body.x - ux * back - uy * lateral;
    const fy = body.y - uy * back + ux * lateral;
    const flown = index % 3 === 0 ? rnd() * 4 : 1000;
    const travel = 40;
    const model = getProjectileBodyContact(fx, fy, ux, uy, travel, shape, flown, body);
    const reference = referenceContact(polygon, id, tier, flown, fx, fy, ux, uy, travel);
    const label = `${id} ucus ${flown.toFixed(2)} yanal ${lateral.toFixed(2)}`;
    if (reference < 0 || model < 0) {
      assert.equal(model < 0, reference < 0, `${label}: model ${model} / bagimsiz ${reference}`);
      continue;
    }
    // Diskin cokgen kirisi (180 kose) ve ikili arama payi.
    assert.ok(Math.abs(model - reference) <= 2e-3, `${label}: model ${model} / bagimsiz ${reference}`);
    hits += 1;
    if (-getProjectileReach(shape, flown) > -shape.tail) clipped += 1;
    const point = writeProjectileBodyContactPoint(fx, fy, ux, uy, model, shape, flown, body, { x: 0, y: 0 });
    assert.ok(boundaryDistance(polygon, [point.x, point.y]) <= 1e-6, `${label}: temas noktasi kenarda degil (${boundaryDistance(polygon, [point.x, point.y])})`);
    // Ileri giderken degen mermide nokta merminin cizilen govdesinin de uzerinde (degdigi yer).
    if (model > 0) {
      const drawn = projectileWorldParts(id, tier, flown, fx, fy, ux, uy, model);
      let gap = Math.min(...drawn.map((part) => pointDistance(part, [point.x, point.y])));
      if (shape.disc === 2) {
        // Melis dokusunun ignesi (eksende `[max(wide, -reach), nose]`).
        const rear = Math.max(shape.wide, -getProjectileReach(shape, flown));
        const cx = fx + ux * model;
        const cy = fy + uy * model;
        gap = Math.min(gap, segmentPointDistance([point.x, point.y], [cx + ux * rear, cy + uy * rear], [cx + ux * shape.nose, cy + uy * shape.nose]));
      }
      assert.ok(gap <= 2e-3, `${label}: temas noktasi merminin govdesinde degil (${gap})`);
    }
  }
  assert.ok(hits > 80 && clipped > 5, `${hits} / ${clipped}`);
});

test("merminin yanlari cizildigi kadar: govde cizgisinin ve damlanin yanina giren dusman cizim degmeden vurulmuyor; mizragin bas ucgeninin yanlari gec degil", () => {
  // Turun dogrulayicilarinin ornekleri. Eskiden tek kapsul en genis yerin
  // (basin) eniyle kuyruga kadar gidiyordu: Hiza T1'in 0,6'lik govdesine 1,5,
  // T3'unkine 2, Ucube'nin damlasina 3 birim yandan "degiyordu".
  // Kucuk kare govde (yari kenar 0,25): alt yuzu eksenden `gap` uzakta, `along`da;
  // yalnizca o yanin yanina giriyor (gercek dusman bas ucgenine de uzanirdi).
  const square = createEnemyBodyPolygon([-1, -1, 1, -1, 1, 1, -1, 1]);
  const probe = (gap, along) => ({ x: along, y: gap + 0.25, headingX: 0, headingY: 1, fromX: along, fromY: gap + 0.25, scale: 0.25, reach: 0.25 * square.radius, poly: square });
  // Ucube'nin damlasi kuyruga dogru sivriliyor: karenin basa yakin kosesindeki (-6,35) en.
  for (const [id, tier, along, drawnHalf] of [["zeynep-1", 1, -7.2, 0.6], ["zeynep-1", 3, -7.2, 0.96], ["warrior-6", 1, -6.6, 3.36 * (1 - 6.35 / 10.92)]]) {
    const shape = getProjectileShape(id, tier);
    // Cizilen yanin hemen otesi: degmiyor; hemen icinde: degiyor (tikin basinda).
    assert.equal(getProjectileBodyContact(0, 0, 1, 0, 0, shape, 1000, probe(drawnHalf + 0.05, along)), -1, `${id} ${tier}: cizilen govdenin ${drawnHalf.toFixed(2)} yanina degmeden vurdu`);
    assert.equal(getProjectileBodyContact(0, 0, 1, 0, 0, shape, 1000, probe(drawnHalf - 0.05, along)), 0, `${id} ${tier}: cizilen govdeye degen dusmana degmedi`);
    // Eski kapsulun yaricapi (basin eni) cok daha genisti.
    assert.ok(shape.halfWidth > drawnHalf + 0.9, `${id}`);
  }
  // Bas ucgeninin yani: eksenin yaninda gelen govde ucgenin kenarina degdigi anda.
  // Ucgen (6,3, 0) -> (-0,9, +/-1,8): yanal 1,2'de on kenar x = 6,3 - 4 x 1,2 = 1,5.
  // Karenin sol alt kosesi (30, 1,2): temas merkez 28,5'teyken.
  const shape = getProjectileShape("zeynep-1", 1);
  const wall = probe(1.2, 30.25);
  const polygon = worldPolygon(wall);
  const contact = getProjectileBodyContact(0, 0, 1, 0, 60, shape, 1000, wall);
  near(contact, 28.5, "bas ucgeninin yani", 1e-9);
  const reference = referenceContact(polygon, "zeynep-1", 1, 1000, 0, 0, 1, 0, 60);
  assert.ok(Math.abs(contact - reference) < 2e-3, `${contact} / ${reference}`);
  const point = writeProjectileBodyContactPoint(0, 0, 1, 0, contact, shape, 1000, wall, { x: 0, y: 0 });
  near(point.x, 30, "temas kose x", 1e-9);
  near(point.y, 1.2, "temas kose y", 1e-9);
  // Eski model (yaricapi 1,8 disk -1,12'de ve eksende igne) bu durumda gec:
  // yanal 1,2'de diskin on kenari -1,12 + sqrt(1,8^2 - 1,2^2) = 0,22 (cizilen ucgen 1,5).
  const circle = (cx) => Array.from({ length: 360 }, (_, i) => [cx + Math.cos((i / 360) * Math.PI * 2) * 1.8, Math.sin((i / 360) * Math.PI * 2) * 1.8]);
  const oldDisc = firstZero((step) => polygonDistance(polygon, circle(step - 1.12)), 60);
  assert.ok(oldDisc > contact + 1.2, `eski model ${oldDisc}`);
});

/* ------------------------------------------------------------------ */
/* Merminin govdesi ve yonlu govde: odanin icinde                        */
/* ------------------------------------------------------------------ */

function setup() {
  const room = createRoom("warrior");
  const sent = [];
  room.broadcast = (type, payload) => sent.push({ type, payload });
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower(client, { ...spot, definitionId: "warrior-1" });
  const tower = [...room.towers.values()].at(-1);
  const bounds = room.getActiveWorldBounds();
  const center = { x: (bounds.left + bounds.right) / 2, y: bounds.top + (bounds.bottom - bounds.top) * 0.3 };
  const hits = [];
  const apply = room.applyProjectileHit.bind(room);
  room.applyProjectileHit = (projectile, enemy, contactX, contactY) => {
    hits.push({ enemyId: enemy.id, x: projectile.x, y: projectile.y, contactX, contactY });
    return apply(projectile, enemy, contactX, contactY);
  };
  return { room, tower, center, sent, hits, grid: getMapGridSize(room.activeMap) };
}

/** Sabit, olumsuz bir dusman; govdesi verilen gorunuse gore, yonu `heading` (birim). */
function enemyAt(context, x, y, view = {}, heading = [0, 1]) {
  const { room } = context;
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x, y, hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, speed: 0, moveVx: 0, moveVy: 0, champion: undefined, special: undefined, raceTrait: undefined, movementKind: "ground", ...view });
  room.assignEnemyBody(enemy);
  Object.assign(enemy.body, { x, y, headingX: heading[0], headingY: heading[1], fromX: x, fromY: y });
  return enemy;
}

function shoot(context, definitionId, from, angle, extra = {}) {
  const { room, tower } = context;
  const speed = 120;
  const projectile = {
    id: `p-${room.projectiles.size}-${Math.random()}`, towerId: tower.id, definitionId, kind: "tower", damageType: "physical", hitType: "projectile", source: "tower",
    targetId: "", x: from.x, y: from.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage: 1, maxHealthDamageRatio: 0, aoeRadius: 0, slowMs: 0,
    pierceLimit: 1, armorBreakAmount: 0, piercedEnemyIds: [], tier: 1, flown: 1000, ...extra
  };
  room.projectiles.set(projectile.id, projectile);
  return projectile;
}

/** Mermi kalkana ya da sinira kadar; her tikin basindaki konum `trail`de. */
function fly(context, projectile, ticks = 240) {
  const { room } = context;
  const trail = [];
  for (let tick = 0; tick < ticks && room.projectiles.has(projectile.id); tick += 1) {
    room.rebuildEnemyGrid();
    trail.push({ x: projectile.x, y: projectile.y });
    room.updateProjectiles(1 / 60);
  }
  return trail;
}

test("yonlu govde: uzun kosucuya boyuna, yandan ve capraz gelen atis cizilen kenarda degiyor; temas kenarda", () => {
  for (const definitionId of ["zeynep-1", "warrior-1", "warrior-4", "warrior-6"]) {
    const shape = getProjectileShape(definitionId, 1);
    for (const [label, heading, angle] of [
      ["burun", [1, 0], Math.PI],
      ["kuyruk", [-1, 0], Math.PI],
      ["yan", [0, 1], Math.PI],
      ["capraz yon", [Math.SQRT1_2, Math.SQRT1_2], (5 * Math.PI) / 4]
    ]) {
      const context = setup();
      const { center, hits } = context;
      const enemy = enemyAt(context, center.x, center.y, { race: "holyGuardian", type: "runner" }, heading);
      const polygon = worldPolygon(enemy.body);
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const start = { x: center.x - ux * 60, y: center.y - uy * 60 };
      const projectile = shoot(context, definitionId, start, angle);
      const trail = fly(context, projectile);
      const tag = `${definitionId} ${label}`;
      assert.equal(hits.length, 1, `${tag}: vurmadi`);
      // Bagimsiz ilk temas: merkezden gecen ucus.
      const expected = referenceContact(polygon, definitionId, 1, 1000, start.x, start.y, ux, uy, 120);
      near(Math.hypot(hits[0].x - start.x, hits[0].y - start.y), expected, `${tag}: temastaki konum`, 2e-3);
      assert.ok(boundaryDistance(polygon, [hits[0].contactX, hits[0].contactY]) <= 1e-6, `${tag}: temas noktasi kenarda degil`);
      const last = trail.at(-1);
      assert.ok(Math.hypot(last.x - start.x, last.y - start.y) < expected, `${tag}: tikin basinda zaten degiyordu`);
    }
  }
  // Ayni noktadan gecen atis: boyunu hatta dogru donmus kosucuya degiyor, yanini donmus olana degmiyor.
  const shape = getProjectileShape("zeynep-1", 1);
  const runner = (heading) => Object.assign(createEnemyBody({ race: "holyGuardian", type: "runner" }, 34, 0, 0), { headingX: heading[0], headingY: heading[1] });
  const long = runner([0, 1]);
  const pass = -(getBodyProjectionMax(long, 0, 1) + getBodyProjectionMax(runner([1, 0]), 0, 1)) / 2;
  assert.ok(getProjectileBodyContact(-60, -pass, 1, 0, 120, shape, 1000, long) >= 0, "boyuna donuk kosucuya degmedi");
  assert.equal(getProjectileBodyContact(-60, -pass, 1, 0, 120, shape, 1000, runner([1, 0])), -1, "dar yandan gecen atis vurdu");
});

test("govdenin kayik cokgeni: dokunun merkezinden ayni uzaklikta, govdenin uzandigi yanda degiyor, obur yanda degmiyor", () => {
  // Meka nisancisi: govde dokunun merkezinden sola (dokunun -x'i) kayik.
  const body = createEnemyBody({ race: "meka", type: "shooter" }, 34, 0, 0);
  const right = getBodyProjectionMax(body, 1, 0);
  const left = -getBodyProjectionMin(body, 1, 0);
  assert.ok(left - right > 2, `${left} / ${right}`);
  const shape = getProjectileShape("zeynep-1", 1);
  // Yon (0, 1): yanin (dokunun +x'i) dunyada (hy, -hx) = (1, 0). Sol yanin
  // en uzak noktasina bu kadar yakin gecen dikey atis degiyor; ayni uzaklikta
  // sag yanda gecen degmiyor.
  const offset = (left + right) / 2 + shape.halfWidth;
  assert.ok(getProjectileBodyContact(-offset, -80, 0, 1, 200, shape, 1000, body) >= 0, "uzanan yanda degmedi");
  assert.equal(getProjectileBodyContact(offset, -80, 0, 1, 200, shape, 1000, body), -1, "kisa yanda degdi");
});

test("geri yon: dogan merminin hicbir yeri dogdugu noktanin gerisine, ucmus merminin hicbir yeri cizilen kuyrugun gerisine degmiyor", () => {
  // Disk ve kapsul govdeler, sivri basli mizrak ve diski kuyrugundan geride
  // duran Melis dokulari; paket (Sunucu) de.
  const ids = ["zeynep-1", "warrior-1", "zeynep-3-copy", "warrior-6", "warrior-3", "onur-2", "archer-1", "archer-2", "archer-5", "warrior-2"];
  // Tek koseli sivri bir govde: ucu (+x'e bakan kose) mermiye en yakin nokta.
  const probe = (tipX, tipY) => {
    const body = createEnemyBody({ race: "holyGuardian", type: "runner" }, 34, 0, 0);
    // Yon -x'e (kosucunun burnu yon boyunca): burun -x'te; govdeyi burnu (tipX, tipY)'de olacak yere tasi.
    body.headingX = 1;
    body.headingY = 0;
    const noseX = getBodyProjectionMax(body, 1, 0);
    const noseY = (getBodyProjectionMax(body, 0, 1) + getBodyProjectionMin(body, 0, 1)) / 2;
    body.x = tipX - noseX;
    body.y = tipY - noseY;
    return body;
  };
  for (const id of ids) {
    const shape = getProjectileShape(id, 1);
    // Mermi orijinde, +x'e. Govdenin ucu merminin ekseninde ve dogdugu noktanin 0,05 gerisinde.
    for (const lateral of [0, shape.halfWidth * 0.3]) {
      const behind = probe(-0.05, lateral);
      assert.equal(getProjectileBodyContact(0, 0, 1, 0, 0, shape, 0, behind), -1, `${id}: dogarken merkezin gerisindeki govdeye degdi (yanal ${lateral})`);
      // Ucu merkezin hemen onunde ve merminin govdesinin icinde: dogarken de degiyor.
      const inside = projectileLocalParts(id, 1, shape, 0).some((part) => pointDistance(part, [0.05, lateral]) === 0);
      if (inside) {
        assert.equal(getProjectileBodyContact(0, 0, 1, 0, 0, shape, 0, probe(0.05, lateral)), 0, `${id}: dogarken onundeki govdeye degmedi (yanal ${lateral})`);
      }
    }
    // Ucmus mermi: kuyrugun 0,05 gerisindeki govdeye degmiyor, 0,05 icindekine degiyor.
    const tail = shape.tail;
    assert.equal(getProjectileBodyContact(0, 0, 1, 0, 0, shape, 1000, probe(-tail - 0.05, 0)), -1, `${id}: cizilen kuyrugun gerisine degdi`);
    assert.equal(getProjectileBodyContact(0, 0, 1, 0, 0, shape, 1000, probe(-tail + 0.05, 0)), 0, `${id}: cizilen kuyruga degmedi`);
  }
  // Kulenin kendi atisi (uretim yolu): kule +x'e bakiyor, arkasinda bir brute.
  const context = setup();
  const { room, tower, hits } = context;
  const cell = context.grid;
  const ahead = enemyAt(context, tower.x + cell * 2, tower.y, { type: "grunt" });
  // Merkezi kulenin 16 birim arkasinda: eskiden (kuyruk dogumdan sayiliyordu) vuruluyordu.
  const back = enemyAt(context, tower.x - 16, tower.y, { type: "brute" });
  tower.facing = 0;
  tower.ammo = tower.maxAmmo;
  tower.energy = tower.maxEnergy;
  room.rebuildEnemyGrid();
  room.spawnTowerProjectile(tower, ahead);
  const projectile = [...room.projectiles.values()].at(-1);
  fly(context, projectile, 120);
  assert.ok(hits.length >= 1 && hits[0].enemyId === ahead.id, `ilk vurus ${hits[0]?.enemyId} (arkadaki ${back.id})`);
});

test("tikin basinda zaten degen mermi: temas noktasi govdenin kenarinda (igne de, kapsul de)", () => {
  // Hiza'nin ignesi tikin basinda meka piyadesinin icinde (eski elips
  // cozumunde nokta govdenin icindeydi).
  const shape = getProjectileShape("zeynep-1", 1);
  const body = createEnemyBody({ race: "meka", type: "grunt" }, 34, 0, 0);
  const polygon = worldPolygon(body);
  for (const start of [-5, -8, -12]) {
    const along = getProjectileBodyContact(start, 0.5, 1, 0, 2, shape, 1000, body);
    assert.equal(along, 0, `${start}: tikin basinda degmiyor`);
    const point = writeProjectileBodyContactPoint(start, 0.5, 1, 0, 0, shape, 1000, body, { x: 0, y: 0 });
    assert.ok(boundaryDistance(polygon, [point.x, point.y]) <= 1e-6, `${start}: nokta kenarda degil`);
  }
  // Rastgele ortusmeler: her biri kenarda.
  const rnd = random(99);
  let overlaps = 0;
  for (let index = 0; index < 400; index += 1) {
    const enemy = randomBody(rnd);
    const shapeId = ["zeynep-1", "warrior-6", "warrior-1", "zeynep-3-copy", "archer-5"][index % 5];
    const projectileShape = getProjectileShape(shapeId, 1);
    const angle = rnd() * 2 * Math.PI;
    const x = enemy.x + (rnd() - 0.5) * enemy.reach * 2;
    const y = enemy.y + (rnd() - 0.5) * enemy.reach * 2;
    const flown = index % 2 ? 1000 : rnd() * 3;
    if (getProjectileBodyContact(x, y, Math.cos(angle), Math.sin(angle), 1, projectileShape, flown, enemy) !== 0) continue;
    overlaps += 1;
    const point = writeProjectileBodyContactPoint(x, y, Math.cos(angle), Math.sin(angle), 0, projectileShape, flown, enemy, { x: 0, y: 0 });
    assert.ok(boundaryDistance(worldPolygon(enemy), [point.x, point.y]) <= 1e-6, `${shapeId}: ortusmede nokta kenarda degil`);
  }
  assert.ok(overlaps > 60, `${overlaps}`);
});

test("tikin basinda ortusen mermi: temas noktasi merminin kendi boyunun icinde (namlunun ve cizilen kuyrugun gerisi degil, uzak yuz degil)", () => {
  // Turun dogrulayicilarinin ornekleri. Eskiden ucus dogrusunun govdeye
  // girdigi nokta: govdenin icinde dogan mermide govdenin arka yuzu, kulenin
  // 10-14 birim gerisi; kuyrugu degen mermide 27 birim geride. Alan hasarinin
  // halkasi o noktada aciliyordu.
  const air = (x, y) => createEnemyBody({ race: "meka", type: "brute", movementKind: "air" }, 34, x, y);
  for (const id of ["warrior-2", "warrior-6", "zeynep-1", "warrior-1", "archer-5"]) {
    const shape = getProjectileShape(id, 1);
    for (const [x, y] of [[4, 3], [6, -2], [2, 0]]) {
      const body = air(x, y);
      assert.equal(getProjectileBodyContact(0, 0, 1, 0, 5, shape, 0, body), 0, `${id}: dogarken govdenin icinde degil`);
      const point = writeProjectileBodyContactPoint(0, 0, 1, 0, 0, shape, 0, body, { x: 0, y: 0 });
      assert.ok(boundaryDistance(worldPolygon(body), [point.x, point.y]) <= 1e-6, `${id}: nokta kenarda degil`);
      assert.ok(point.x >= -1e-9 && point.x <= shape.front + 1e-9, `${id} (${x}, ${y}): nokta merminin boyunun disinda (${point.x.toFixed(2)})`);
    }
  }
  // Ucmus Hiza, kuyrugu arkadaki iri govdeye 1 birim giriyor: nokta kuyrugun degdigi yerde.
  const shape = getProjectileShape("zeynep-1", 1);
  const brute = createEnemyBody({ race: "golem", type: "brute" }, 34, 0, 0);
  brute.headingX = 0;
  brute.headingY = 1;
  brute.x = -shape.tail + 1 - getBodyProjectionMax(brute, 1, 0);
  assert.equal(getProjectileBodyContact(0, 0, 1, 0, 1, shape, 100, brute), 0);
  const point = writeProjectileBodyContactPoint(0, 0, 1, 0, 0, shape, 100, brute, { x: 0, y: 0 });
  assert.ok(boundaryDistance(worldPolygon(brute), [point.x, point.y]) <= 1e-6, "nokta kenarda degil");
  assert.ok(point.x >= -shape.tail - 1e-9 && point.x <= -shape.tail + 1 + 1e-6 && Math.abs(point.y) < 1e-6, `kuyrugun degdigi yer degil: ${point.x}, ${point.y}`);
  // Gercek oda: kulenin ustundeki dusman, namlusuz atis; alan hasarinin
  // halkasi merminin bulundugu yerde (merkez kulenin onunde, gerisinde degil).
  const context = setup();
  const { room, tower, hits } = context;
  enemyAt(context, tower.x + 3, tower.y + 2, { race: "meka", type: "brute" });
  const projectile = shoot(context, "warrior-2", { x: tower.x, y: tower.y }, 0, { flown: 0, aoeRadius: 6 });
  room.rebuildEnemyGrid();
  room.updateProjectiles(1 / 60);
  assert.equal(hits.length, 1, "vurmadi");
  const front = getProjectileShape("warrior-2", 1, getProjectileSceneScale(context.grid)).front;
  assert.ok(hits[0].contactX >= tower.x - 1e-6 && hits[0].contactX <= tower.x + front + 1e-6, `halka merminin disinda: ${hits[0].contactX - tower.x}`);
  assert.ok(!room.projectiles.has(projectile.id));
});

/** Noktanin merminin cizilen govdesine uzakligi (parcalar, disk, Melis'in ignesi); merminin cercevesinde degil, dunyada. */
function drawnDistance(id, tier, flown, fx, fy, ux, uy, along, point) {
  const shape = getProjectileShape(id, tier);
  let gap = Math.min(...projectileWorldParts(id, tier, flown, fx, fy, ux, uy, along).map((part) => pointDistance(part, point)));
  if (shape.disc === 2 && shape.nose > shape.wide + shape.radius) {
    const rear = Math.max(shape.wide, -getProjectileReach(shape, flown));
    const cx = fx + ux * along;
    const cy = fy + uy * along;
    gap = Math.min(gap, segmentPointDistance(point, [cx + ux * rear, cy + uy * rear], [cx + ux * shape.nose, cy + uy * shape.nose]));
  }
  return gap;
}

/** Govdenin kenari merminin dilimi icinde (`[-reach, front]`, merminin cercevesinde), `step` arayla ornekler. */
function sliceBoundarySamples(polygon, shape, flown, fx, fy, ux, uy, step) {
  const rear = -getProjectileReach(shape, flown);
  const samples = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j <= count; j += 1) {
      const p = [a[0] + ((b[0] - a[0]) * j) / count, a[1] + ((b[1] - a[1]) * j) / count];
      const along = (p[0] - fx) * ux + (p[1] - fy) * uy;
      if (along >= rear - 1e-9 && along <= shape.front + 1e-9) samples.push({ p, lateral: Math.abs((p[1] - fy) * ux - (p[0] - fx) * uy) });
    }
  }
  return samples;
}

test("tikin basinda ortusen mermi: nokta dilimdeki kenar noktalarinin merminin cizilen govdesine en yakini; kenar cizimi kesiyorsa cizimin uzerinde, esitlikte eksene en yakin", () => {
  // Turun dogrulayicilarinin ornekleri (kare 34, mermi (0, 0)'da +x'e). Eskiden
  // dilimde eksene en yakin kenar noktasi seciliyordu: kenar cizilen govdeyi
  // (Hiza'nin bas ucgenini, Ucube'nin basini, Obsesyon'un mercegini) baska
  // yerde kesiyorken nokta cizimden 1,7-2,3 birim uzaktaydi.
  for (const [id, tier, flown, view, x, y, degrees] of [
    ["zeynep-1", 3, 0, { race: "meka", type: "shooter" }, -0.2, 4.8, 247],
    ["warrior-6", 1, 100, { race: "golem", type: "brute" }, -7.5, 16.2, 354],
    ["warrior-4", 1, 0, { race: "spaceBug", type: "shooter" }, 1.7, 7.8, 281]
  ]) {
    const body = createEnemyBody(view, 34, x, y);
    body.headingX = Math.cos((degrees * Math.PI) / 180);
    body.headingY = Math.sin((degrees * Math.PI) / 180);
    const shape = getProjectileShape(id, tier);
    const polygon = worldPolygon(body);
    assert.equal(getProjectileBodyContact(0, 0, 1, 0, 5, shape, flown, body), 0, `${id}: tikin basinda degmiyor`);
    const point = writeProjectileBodyContactPoint(0, 0, 1, 0, 0, shape, flown, body, { x: 0, y: 0 });
    assert.ok(boundaryDistance(polygon, [point.x, point.y]) <= 1e-6, `${id}: nokta kenarda degil`);
    assert.ok(drawnDistance(id, tier, flown, 0, 0, 1, 0, 0, [point.x, point.y]) <= 2e-3, `${id}: nokta cizimin uzerinde degil (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);
    // Eski olcutun noktasi (dilimde eksene en yakin kenar noktasi) cizimden uzak: olcutler gercekten ayrisiyor.
    const samples = sliceBoundarySamples(polygon, shape, flown, 0, 0, 1, 0, 0.01);
    const axisNearest = samples.reduce((best, sample) => (sample.lateral < best.lateral ? sample : best));
    assert.ok(drawnDistance(id, tier, flown, 0, 0, 1, 0, 0, axisNearest.p) > 1, `${id}: eski olcut de cizimdeydi`);
  }
  // Dogan Ucube (ucus tam 0, `reach` 0): damlanin kesigi x = 0 cizgisinde
  // alansiz bir parca. Eskiden kirpmasi her kenarda "kesisiyor" diyordu;
  // nokta govdenin obur yanina, cizilen bastan 15 birim uzaga (0, 18,25)
  // dusuyordu (turun dogrulayicisinin ornegi, kutsal muhafiz iri, kare 34).
  {
    const shape = getProjectileShape("warrior-6", 1);
    const body = createEnemyBody({ race: "holyGuardian", type: "brute" }, 34, -6, 6);
    body.headingX = Math.cos(1.5 * Math.PI);
    body.headingY = Math.sin(1.5 * Math.PI);
    assert.equal(getProjectileBodyContact(0, 0, 1, 0, 5, shape, 0, body), 0, "dogan Ucube degmiyor");
    const point = writeProjectileBodyContactPoint(0, 0, 1, 0, 0, shape, 0, body, { x: 0, y: 0 });
    const polygon = worldPolygon(body);
    assert.ok(boundaryDistance(polygon, [point.x, point.y]) <= 1e-6, "dogan Ucube: nokta kenarda degil");
    const samples = sliceBoundarySamples(polygon, shape, 0, 0, 0, 1, 0, 0.01);
    const nearest = Math.min(...samples.map((sample) => drawnDistance("warrior-6", 1, 0, 0, 0, 1, 0, 0, sample.p)));
    const gap = drawnDistance("warrior-6", 1, 0, 0, 0, 1, 0, 0, [point.x, point.y]);
    assert.ok(gap <= nearest + 2e-3 && Math.abs(point.y) < 5, `dogan Ucube: nokta cizimden uzak (${point.x.toFixed(2)}, ${point.y.toFixed(2)}: ${gap} / ${nearest})`);
  }
  // Rastgele ortusmeler: secilen nokta dilimdeki kenar orneklerinin cizime en yakinindan uzak degil.
  // Ucus uc turlu: tam 0 (dogan mermi, kesik kuyruk duz), kisa ve uzun.
  const rnd = random(2718);
  const ids = ["zeynep-1", "warrior-6", "warrior-4", "warrior-1", "warrior-2", "zeynep-3-copy", "archer-5", "warrior-3"];
  let overlaps = 0;
  let crossing = 0;
  let spawnUcube = 0;
  for (let index = 0; index < 1500 && overlaps < 360; index += 1) {
    const body = randomBody(rnd);
    const id = ids[index % ids.length];
    const tier = 1 + (index % 3);
    const shape = getProjectileShape(id, tier);
    const angle = rnd() * 2 * Math.PI;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const fx = body.x + (rnd() - 0.5) * (body.reach + shape.front) * 2;
    const fy = body.y + (rnd() - 0.5) * (body.reach + shape.front) * 2;
    const flown = [0, 1000, rnd() * 3][Math.floor(index / ids.length) % 3];
    if (getProjectileBodyContact(fx, fy, ux, uy, 1, shape, flown, body) !== 0) continue;
    overlaps += 1;
    if (id === "warrior-6" && flown === 0) spawnUcube += 1;
    const polygon = worldPolygon(body);
    const point = writeProjectileBodyContactPoint(fx, fy, ux, uy, 0, shape, flown, body, { x: 0, y: 0 });
    const label = `${id} T${tier} ucus ${flown.toFixed(2)}`;
    assert.ok(boundaryDistance(polygon, [point.x, point.y]) <= 1e-6, `${label}: nokta kenarda degil`);
    const along = (point.x - fx) * ux + (point.y - fy) * uy;
    assert.ok(along >= -getProjectileReach(shape, flown) - 1e-6 && along <= shape.front + 1e-6, `${label}: nokta dilimin disinda`);
    const samples = sliceBoundarySamples(polygon, shape, flown, fx, fy, ux, uy, 0.05);
    let nearest = Infinity;
    for (const sample of samples) sample.gap = drawnDistance(id, tier, flown, fx, fy, ux, uy, 0, sample.p);
    for (const sample of samples) nearest = Math.min(nearest, sample.gap);
    const gap = drawnDistance(id, tier, flown, fx, fy, ux, uy, 0, [point.x, point.y]);
    assert.ok(gap <= nearest + 2e-3, `${label}: nokta cizime en yakin kenar noktasi degil (${gap} / ${nearest})`);
    if (nearest <= 1e-9) {
      // Kenar cizilen govdeyi kesiyor: nokta cizimin uzerinde ve oradakilerin eksene en yakini.
      crossing += 1;
      assert.ok(gap <= 2e-3, `${label}: kesisimde nokta cizimde degil (${gap})`);
      const lateral = Math.abs((point.y - fy) * ux - (point.x - fx) * uy);
      const best = Math.min(...samples.filter((sample) => sample.gap <= 1e-9).map((sample) => sample.lateral));
      assert.ok(lateral <= best + 2e-3, `${label}: cizimdeki noktalarin eksene en yakini degil (${lateral} / ${best})`);
    }
  }
  assert.ok(overlaps >= 300 && crossing > 80 && spawnUcube > 10, `${overlaps} / ${crossing} / ${spawnUcube}`);
});

test("gudumlu mermi hedefinin tam merkezinde: yon yok (0, 0) ama yine vuruyor; takilmiyor", () => {
  // Eskiden `max(1, uzaklik)` hedefin merkezinde yonu (0, 0) yapiyordu: hiz
  // sifira iniyor, temas -1 donuyordu; mermi hedef yururken orada kaliyordu.
  const body = createEnemyBody({ race: "golem", type: "grunt" }, 34, 0, 0);
  const shape = getProjectileShape("warrior-3", 1);
  assert.equal(getProjectileBodyContact(0, 0, 0, 0, 5, shape, 1000, body), 0, "yonsuz temas yok");
  const point = writeProjectileBodyContactPoint(0, 0, 0, 0, 0, shape, 1000, body, { x: 0, y: 0 });
  assert.ok(boundaryDistance(worldPolygon(body), [point.x, point.y]) <= 1e-6);
  const context = setup();
  const { room, center, hits } = context;
  const enemy = enemyAt(context, center.x, center.y, { type: "grunt" });
  shoot(context, "warrior-3", { x: center.x, y: center.y }, 0, { hitType: "focus", targetId: enemy.id, vx: 120, vy: 0 });
  room.rebuildEnemyGrid();
  room.updateProjectiles(1 / 60);
  assert.equal(hits.length, 1, "merkezdeki gudumlu mermi vurmadi");
});

test("alan hasari gorunen govdeye: merkezi halkanin disinda ama govdesi degen vuruluyor; degmeyen vurulmuyor", () => {
  const context = setup();
  const { center, hits } = context;
  const target = enemyAt(context, center.x, center.y, { type: "grunt" }, [0, 1]);
  const aoe = 20;
  // Mermi +x'te geliyor: temas govdenin en soldaki noktasinda.
  const contactX = getBodyProjectionMin(target.body, 1, 0);
  // Temasin altinda (mermi yolunun disinda): govdesinin ust kenari halkanin 1
  // birim icinde, merkezi disinda.
  const edge = enemyAt(context, 0, 0, { type: "grunt" }, [0, 1]);
  const up = edge.body.y - getBodyProjectionMin(edge.body, 0, 1);
  Object.assign(edge, { x: contactX, y: center.y + aoe - 1 + up });
  const far = enemyAt(context, 0, 0, { type: "grunt" }, [0, 1]);
  Object.assign(far, { x: contactX, y: center.y - aoe - far.body.reach - 0.5 });
  for (const enemy of [edge, far]) Object.assign(enemy.body, { fromX: enemy.x, fromY: enemy.y });
  assert.ok(Math.hypot(edge.x - contactX, edge.y - center.y) > aoe, "kenardaki dusmanin merkezi halkada");
  const hp = { edge: edge.hp, far: far.hp, target: target.hp };
  const projectile = shoot(context, "mage-1", { x: center.x - 60, y: center.y }, 0, { aoeRadius: aoe });
  fly(context, projectile, 120);
  assert.equal(hits.length, 1);
  assert.ok(Math.abs(hits[0].contactX - contactX) < 0.6, `temas ${hits[0].contactX} / ${contactX}`);
  assert.ok(edge.hp < hp.edge, "govdesi halkaya degen dusman vurulmadi");
  assert.equal(far.hp, hp.far, "govdesi halkanin disindaki dusman vuruldu");
  assert.ok(target.hp < hp.target, "hedef vurulmadi");
  const contact = context.sent.find((entry) => entry.type === "projectile:contact").payload;
  assert.ok(Math.abs(contact.x - hits[0].contactX) <= 0.05 && contact.r === aoe, JSON.stringify(contact));
});

test("esitlik: tikin basinda kapsule zaten degen iki govdeden ucus yonunde ondeki vuruluyor", () => {
  const context = setup();
  const { center, hits } = context;
  // Uzun kuyruklu kopya mizragi, ucmus: iki govde de tikin basinda cizilen govdeye degiyor.
  const shape = getProjectileShape("zeynep-3-copy", 1);
  const lower = enemyAt(context, 0, 0, { type: "grunt" }, [0, 1]);
  const below = getBodyProjectionMin(lower.body, 0, 1) - lower.body.y;
  const above = getBodyProjectionMax(lower.body, 0, 1) - lower.body.y;
  // Arkadaki govde merkezin gerisinde, govde cizgisinin (yari en 0,6) altina
  // degiyor; ondeki merkezin onunde, bas ucgeninin (1 birim onde yari en 1,33) ustune.
  Object.assign(lower, { x: center.x - shape.tail * 0.6, y: center.y + 0.3 - below });
  const upper = enemyAt(context, center.x + 1, center.y - 0.9 - above, { type: "grunt" }, [0, 1]);
  Object.assign(lower.body, { x: lower.x, y: lower.y, fromX: lower.x, fromY: lower.y });
  const projectile = shoot(context, "zeynep-3-copy", center, 0, { flown: 500 });
  fly(context, projectile, 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].enemyId, upper.id, `arkadaki (${lower.id}) vuruldu`);
});

test("gudumlu mermi: atis anindaki kademeyle ciziliyor ve vuruyor; ucu cizilen kenara degince duruyor", () => {
  const context = setup();
  const { room, tower, center, hits, sent, grid } = context;
  const enemy = enemyAt(context, center.x, center.y, { type: "brute" });
  tower.level = 5;
  const fired = getTowerTier(tower.level);
  assert.equal(fired, 2);
  // Kademesi yazilmamis (elle kurulan) mermi ilk taramada kulesinden aliyor; uretimde dogumda yazili.
  const projectile = shoot(context, "warrior-3", { x: center.x - 120, y: center.y }, 0, { hitType: "focus", targetId: enemy.id, tier: undefined, flown: undefined });
  room.rebuildEnemyGrid();
  room.updateProjectiles(1 / 60);
  assert.equal(projectile.tier, fired);
  assert.equal(projectile.shape, getProjectileShape("warrior-3", fired, getProjectileSceneScale(grid)));
  tower.level = 10;
  assert.equal(room.getProjectileTier(projectile), fired, "seviye atlayinca telin kademesi degisti");
  room.towers.delete(tower.id);
  assert.equal(room.getProjectileTier(projectile), fired, "satilinca kademe kayboldu");
  fly(context, projectile, 400);
  assert.equal(hits.length, 1, "vurmadi");
  // Ucu govdeye degdiginde duruyor: cizilen kenar.
  assert.ok(boundaryDistance(worldPolygon(enemy.body), [hits[0].contactX, hits[0].contactY]) <= 1e-6, "temas kenarda degil");
  const contact = sent.find((entry) => entry.type === "projectile:contact").payload;
  assert.equal(contact.tier, fired, "temasin kademesi atis anindaki degil");
});

test("meka kalkani: mermi govdesinin cizgiye en yakin noktasi kalkanin cizilen yuzune varinca duruyor (kafa kafaya uc, siga acida basin yani)", () => {
  for (const [definitionId, degrees] of [["zeynep-1", 0], ["zeynep-1", 80], ["zeynep-1", 85], ["warrior-6", 0], ["warrior-6", 70]]) {
    const context = setup();
    const { room, center } = context;
    const now = room.runtime.now();
    const lineX = center.x + 12;
    room.mekaShields.push({ id: 9, ownerEnemyId: "x", ox: lineX, oy: center.y, x1: lineX, y1: center.y - 400, x2: lineX, y2: center.y + 400, landAt: now - 1, expiresAt: now + 1e7 });
    room.updateMekaShields(now);
    // Cizgiye (normal +x) aci: 0 kafa kafaya, 80-85 derece siga.
    const angle = (degrees * Math.PI) / 180;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const projectile = shoot(context, definitionId, center, angle, { vx: ux * 120, vy: uy * 120, flown: 0 });
    fly(context, projectile, 600);
    assert.ok(!room.projectiles.has(projectile.id), `${definitionId} ${degrees}: mermi durmadi`);
    assert.equal(room.mekaBlockPending.get(9)?.length, 1, `${definitionId} ${degrees}: kalkan durdurmadi`);
    const shape = getProjectileShape(definitionId, 1, getProjectileSceneScale(context.grid));
    // Cizilen govdenin cizgiye (+x) en yakin noktasi kalkanin cizilen yuzunde
    // (levha ve kenar cizgisi, `getMekaShieldFace`): eskiden cizginin kendisinde,
    // mermi gorunen levhanin icine 3-4 birim giriyordu.
    const support = writeProjectileSupport(shape, getProjectileReach(shape, projectile.flown ?? 0), ux, uy, 1, 0, { x: 0, y: 0 });
    near(projectile.x + support.x, lineX - getMekaShieldFace(context.grid), `${definitionId} ${degrees}: govdenin en ileri noktasi`, 1e-6);
  }
});

/** Meka kalkaninin cizilen levhasi dunyada: parca arti eksi yuz, uclar dahil (saat yonunun tersine). */
function platePolygon(shield, face) {
  const length = Math.hypot(shield.x2 - shield.x1, shield.y2 - shield.y1);
  const nx = -(shield.y2 - shield.y1) / length;
  const ny = (shield.x2 - shield.x1) / length;
  return [
    [shield.x1 - nx * face, shield.y1 - ny * face],
    [shield.x2 - nx * face, shield.y2 - ny * face],
    [shield.x2 + nx * face, shield.y2 + ny * face],
    [shield.x1 + nx * face, shield.y1 + ny * face]
  ];
}

/**
 * Meka kalkaninin iki uc kertigi dunyada (race-traits `drawMekaShield`):
 * ucun uzerinde, cizgiye dik, iki yana `getMekaShieldTickHalf`, parca
 * boyunca `tickWidth` kalin (saat yonunun tersine).
 */
function tickPolygons(shield, grid) {
  const length = Math.hypot(shield.x2 - shield.x1, shield.y2 - shield.y1);
  const ux = (shield.x2 - shield.x1) / length;
  const uy = (shield.y2 - shield.y1) / length;
  const nx = -uy;
  const ny = ux;
  const tick = getMekaShieldTickHalf(grid);
  const w = MEKA_SHIELD_DRAWN.tickWidth / 2;
  return [[shield.x1, shield.y1], [shield.x2, shield.y2]].map(([x, y]) => [
    [x - ux * w - nx * tick, y - uy * w - ny * tick],
    [x + ux * w - nx * tick, y + uy * w - ny * tick],
    [x + ux * w + nx * tick, y + uy * w + ny * tick],
    [x - ux * w + nx * tick, y - uy * w + ny * tick]
  ]);
}

/** Kalkanin cizilen opak parcalari: levha ve iki kertik. */
const shieldPolygons = (shield, face, grid) => [platePolygon(shield, face), ...tickPolygons(shield, grid)];

/** Inmis, suresi uzun bir meka kalkani (odaya yazilir). */
function landShield(room, cx, cy, angle, half = 34) {
  const now = room.runtime.now();
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  const shield = { id: 9, ownerEnemyId: "x", ox: cx, oy: cy, x1: cx - tx * half, y1: cy - ty * half, x2: cx + tx * half, y2: cy + ty * half, landAt: now - 1, expiresAt: now + 1e7 };
  room.mekaShields.length = 0;
  room.mekaShields.push(shield);
  room.mekaBlockPending.clear();
  return shield;
}

/**
 * Bagimsiz durus. Ana levha: mermi levhanin cizgisine gidiyorsa (merkezin
 * yanindan cizgiye dogru normal `m`, `u . m > 0`) cizilen parcalarin levhaya
 * ilk degdigi an (`referenceContact`) ile merkezin parcayi kestigi an (eski
 * kural) en erkeni. Uc kertikleri kendi govdeleriyle: cizgiye gitmeyen mermi
 * de kertige degince duruyor; yalnizca kertigin icinde baslayip hem ondan
 * hem cizgiden uzaklasan mermi durmuyor. Hicbiri yoksa -1.
 */
function referencePlateStop(shield, face, id, tier, flown, fx, fy, ux, uy, travel, grid = 34) {
  const length = Math.hypot(shield.x2 - shield.x1, shield.y2 - shield.y1);
  const nx = -(shield.y2 - shield.y1) / length;
  const ny = (shield.x2 - shield.x1) / length;
  const side = (fx - shield.x1) * nx + (fy - shield.y1) * ny;
  const rate = ux * nx + uy * ny;
  const closing = (side > 0 ? -rate : side < 0 ? rate : Math.abs(rate)) > 0;
  let best = -1;
  if (closing) {
    const t = referenceContact(platePolygon(shield, face), id, tier, flown, fx, fy, ux, uy, travel);
    if (t >= 0) best = t;
  }
  for (const polygon of tickPolygons(shield, grid)) {
    const t = referenceContact(polygon, id, tier, flown, fx, fy, ux, uy, travel);
    if (t < 0) continue;
    if (t === 0 && !closing) {
      const cx = polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length;
      const cy = polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length;
      if ((cx - fx) * ux + (cy - fy) * uy <= 0) continue;
    }
    if (best < 0 || t < best) best = t;
  }
  if (!closing) return best;
  const a = [fx, fy];
  const b = [fx + ux * travel, fy + uy * travel];
  const c = [shield.x1, shield.y1];
  const d = [shield.x2, shield.y2];
  if (segmentsCross(a, b, c, d)) {
    const t = cross(c, d, a) / (cross(c, d, a) - cross(c, d, b));
    if (best < 0 || t * travel < best) best = t * travel;
  }
  return best;
}

test("meka kalkaninin levhasi: cizilen govde levhaya (uclar ve koseler dahil) degdigi anda duruyor, bagimsiz hesapla ayni; uzaklasan ya da paralel giden mermi levhada durmuyor, uc kertiginde duruyor", () => {
  const context = setup();
  const { room, center, grid } = context;
  const face = getMekaShieldFace(grid);
  const rnd = random(5150);
  const ids = ["zeynep-1", "warrior-1", "warrior-4", "warrior-6", "warrior-2", "warrior-3", "zeynep-3", "archer-5", "archer-1", "onur-2"];
  let stops = 0;
  let starts = 0;
  let ends = 0;
  let away = 0;
  for (let index = 0; index < 600; index += 1) {
    const shield = landShield(room, center.x, center.y, rnd() * Math.PI);
    const tx = (shield.x2 - shield.x1) / 68;
    const ty = (shield.y2 - shield.y1) / 68;
    const id = ids[index % ids.length];
    const tier = 1 + (index % 3);
    const shape = getProjectileShape(id, tier, getProjectileSceneScale(grid));
    // Baslangic levhanin cevresinde; yarisi uclarin yakininda.
    const along = index % 2 === 0 ? (rnd() * 2 - 1) * 46 : (rnd() < 0.5 ? -1 : 1) * (26 + rnd() * 16);
    const offset = (rnd() * 2 - 1) * 26;
    const fx = center.x + tx * along - ty * offset;
    const fy = center.y + ty * along + tx * offset;
    // Yon: cogunlukla levhanin bir noktasina (uclar dahil), bazen rastgele.
    let angle = rnd() * Math.PI * 2;
    if (index % 4 !== 0) {
      const aim = (rnd() * 2 - 1) * 40;
      angle = Math.atan2(center.y + ty * aim - fy, center.x + tx * aim - fx) + (rnd() - 0.5) * 0.6;
    }
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const flown = [0, rnd() * 4, 1000][index % 3];
    const travel = 2 + rnd() * 14;
    const model = room.getProjectileBlockCrossing({ flown }, shape, fx, fy, ux, uy, travel);
    const reference = referencePlateStop(shield, face, id, tier, flown, fx, fy, ux, uy, travel, grid);
    const label = `${id} T${tier} ucus ${flown.toFixed(2)} boy ${along.toFixed(2)} yan ${offset.toFixed(2)}`;
    if (reference < 0) {
      assert.equal(model, undefined, `${label}: bagimsiz durmuyor, sunucu ${model}'de durdurdu`);
      continue;
    }
    // Bagimsiz hesabin diski ve kapsulu cokgen (yaricapin ~2e-4'u): levhaya siga acida
    // yaklasan yuvarlak govdede bu fark zamanda yaklasma hizina bolunuyor.
    const closing = Math.abs(ux * -ty + uy * tx);
    const tolerance = 2e-3 + (shape.disc !== 0 ? (shape.radius * 4e-4) / Math.max(closing, 1e-3) : 0);
    assert.ok(model !== undefined && Math.abs(model - reference) <= tolerance, `${label}: sunucu ${model} / bagimsiz ${reference}`);
    stops += 1;
    if (model === 0) starts += 1;
    if (Math.abs(along + ux * model * tx + uy * model * ty) > 30) ends += 1;
    // Durus isareti levhanin kenarinda; mermi cizgiyi gecmeden (merkez gelen yanda).
    const stopX = fx + ux * model;
    const stopY = fy + uy * model;
    const markX = stopX + room.blockSupport.x;
    const markY = stopY + room.blockSupport.y;
    assert.ok(Math.min(...shieldPolygons(shield, face, grid).map((polygon) => boundaryDistance(polygon, [markX, markY]))) <= 1e-6, `${label}: isaret levhanin kenarinda degil`);
    if (model > 0) {
      const drawn = projectileWorldParts(id, tier, flown, fx, fy, ux, uy, model);
      let gap = Math.min(...drawn.map((part) => pointDistance(part, [markX, markY])));
      if (shape.disc === 2) {
        const rear = Math.max(shape.wide, -getProjectileReach(shape, flown));
        gap = Math.min(gap, segmentPointDistance([markX, markY], [stopX + ux * rear, stopY + uy * rear], [stopX + ux * shape.nose, stopY + uy * shape.nose]));
      }
      assert.ok(gap <= 2e-3, `${label}: isaret merminin govdesinde degil (${gap})`);
    }
    // Merkez kalkanin parcasini gecmeden duruyor (eski kural ust sinir: hicbir durus ondan gec degil).
    assert.ok(!segmentsCross([fx, fy], [stopX - ux * 1e-7, stopY - uy * 1e-7], [shield.x1, shield.y1], [shield.x2, shield.y2]), `${label}: merkez kalkani gecip durdu`);
  }
  // Uzaklasan mermi: levhanin icinde dogsa da durmuyor.
  for (let index = 0; index < 120; index += 1) {
    const shield = landShield(room, center.x, center.y, rnd() * Math.PI);
    const nx = -(shield.y2 - shield.y1) / 68;
    const ny = (shield.x2 - shield.x1) / 68;
    const id = ids[index % ids.length];
    const shape = getProjectileShape(id, 1 + (index % 3), getProjectileSceneScale(grid));
    const side = (rnd() < 0.5 ? -1 : 1) * rnd() * (face + shape.front);
    const along = (rnd() - 0.5) * 60;
    const fx = center.x + nx * side + along * ny;
    const fy = center.y + ny * side - along * nx;
    const angle = Math.atan2(ny, nx) + (side >= 0 ? 0 : Math.PI) + (rnd() - 0.5) * Math.PI * 0.98;
    if (side === 0) continue;
    // Levhada durmuyor; uca yakin dogup capraz uzaklasan mermi cizilen kertige
    // degerse orada duruyor (kertik opak cizim) -- yalnizca bagimsiz hesap da
    // kertige degdigini soyluyorsa.
    const flown = [0, 1000][index % 2];
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const model = room.getProjectileBlockCrossing({ flown }, shape, fx, fy, ux, uy, 10);
    const reference = referencePlateStop(shield, face, id, 1 + (index % 3), flown, fx, fy, ux, uy, 10, grid);
    if (reference < 0) assert.equal(model, undefined, `${id}: uzaklasan mermi durdu`);
    else {
      assert.ok(model !== undefined && Math.abs(model - reference) < 2e-2, `${id}: uzaklasan mermi kertikte ${reference}'de durmali, sunucu ${model}`);
      assert.ok(room.plateBlockPart !== undefined, `${id}: uzaklasan mermi ana levhada durdu`);
    }
    away += 1;
  }
  assert.ok(stops > 150 && starts > 40 && ends > 40 && away > 100, `${stops} / ${starts} / ${ends} / ${away}`);
});

test("meka kalkani: mermi zaten levhaya degiyorsa (kalkan o tikte indi) yerinde duruyor; ucun yaninda ve capraz uclarda geciremiyor; namlunun gerisindeki ve gecilmis kalkan durdurmuyor", () => {
  // Turun dogrulayicilarinin ornekleri. Eskiden yalnizca govdenin cizgiye
  // en yakin noktasi tikte cizgiyi kesince duruyordu: kalkan mermi zaten
  // levhanin icindeyken indiyse (o nokta coktan gecmis) Hiza 10, Ucube 6,
  // Takipci 4 birime kadar levhanin icinden geciyor, kalkanin gerisinde
  // 9-16 birim "duruyordu"; ucun hemen yaninda levhaya degen Ucube hic
  // durmuyordu. Namlunun 6 birim gerisindeki kalkan da Ucube'yi dogarken
  // durduruyordu (diskin destek noktasi kesimi gozetmiyordu).
  const context = setup();
  const { room, center, grid } = context;
  const face = getMekaShieldFace(grid);
  const scale = getProjectileSceneScale(grid);
  // Kalkan dikey (normal +x) ve merminin onunde: merkez cizgiden `gap` geride, kafa kafaya.
  for (const [id, limit] of [["zeynep-1", 10], ["warrior-6", 6], ["warrior-1", 4]]) {
    const shape = getProjectileShape(id, 1, scale);
    for (let gap = 0.5; gap <= 14; gap += 0.5) {
      landShield(room, center.x + gap, center.y, Math.PI / 2);
      const projectile = shoot(context, id, center, 0, { flown: 1000 });
      room.rebuildEnemyGrid();
      room.updateProjectiles(1 / 60);
      const touching = gap < face + shape.front;
      if (touching) {
        // Degiyor: tikin basinda yerinde duruyor (merkez cizginin gelen yaninda).
        assert.ok(!room.projectiles.has(projectile.id), `${id} ${gap}: degen mermi gecti`);
        near(projectile.x, center.x, `${id} ${gap}: yerinde durmadi`, 1e-9);
        assert.equal(room.mekaBlockPending.get(9)?.length, 1, `${id} ${gap}: kalkan durdurmadi`);
      } else {
        fly(context, projectile, 60);
        assert.ok(!room.projectiles.has(projectile.id), `${id} ${gap}: mermi durmadi`);
        near(projectile.x + shape.front, center.x + gap - face, `${id} ${gap}: cizilen yuzde durmadi`, 1e-6);
      }
      if (gap <= limit) assert.ok(touching, `${id} ${gap}: eski durumun kapsami`);
      room.projectiles.delete(projectile.id);
    }
  }
  // Ucun yaninda: Ucube'nin ekseni kalkanin ucundan 0,5-3 birim disarida, basi levhanin ucuna degiyor.
  const ucube = getProjectileShape("warrior-6", 1, scale);
  for (const beyond of [0.5, 1, 2, 3]) {
    const shield = landShield(room, center.x + 40, center.y, Math.PI / 2);
    assert.ok(beyond < ucube.halfWidth, "bas ucun otesine uzanmiyor");
    const projectile = shoot(context, "warrior-6", { x: center.x, y: shield.y2 + beyond }, 0, { flown: 1000 });
    fly(context, projectile, 60);
    assert.equal(room.mekaBlockPending.get(9)?.length, 1, `ucun ${beyond} otesi: kalkani gecti`);
    assert.ok(projectile.x < center.x + 40 - face, `ucun ${beyond} otesi: levhanin icinde durdu`);
    room.projectiles.delete(projectile.id);
  }
  // Capraz, ucun yakininda ve uctan uzaklasarak: merkez parcayi kesiyor, govde levhaya daha once degiyor.
  for (const degrees of [45, 60]) {
    for (const fromEnd of [1, 2, 4, 6]) {
      const shield = landShield(room, center.x + 40, center.y, Math.PI / 2);
      const angle = (degrees * Math.PI) / 180;
      // Merkez cizgiyi ucun `fromEnd` icinde kesecek sekilde, uctan uzaklasarak (+y uc).
      const crossY = shield.y2 - fromEnd;
      const start = { x: center.x, y: crossY + Math.tan(angle) * 40 };
      const projectile = shoot(context, "zeynep-1", start, -angle, { flown: 1000 });
      const trail = fly(context, projectile, 60);
      assert.equal(room.mekaBlockPending.get(9)?.length, 1, `${degrees} derece, uctan ${fromEnd}: kalkani gecti`);
      assert.ok(projectile.x <= center.x + 40 + 1e-9, `${degrees} derece, uctan ${fromEnd}: cizginin gerisinde durdu`);
      assert.ok(trail.length > 0);
      room.projectiles.delete(projectile.id);
    }
  }
  // Namlunun gerisindeki kalkan: dogan mermi (ucus 0) ondan uzaklasiyor, durmuyor.
  for (const id of ["warrior-6", "archer-5", "archer-1", "zeynep-1", "warrior-1"]) {
    for (const behind of [0.5, 2, 4, 6, 9, 12]) {
      landShield(room, center.x - behind, center.y, Math.PI / 2);
      const projectile = shoot(context, id, center, 0, { flown: 0 });
      room.rebuildEnemyGrid();
      room.updateProjectiles(1 / 60);
      assert.ok(room.projectiles.has(projectile.id), `${id}: namlunun ${behind} gerisindeki kalkan durdurdu`);
      assert.equal(room.mekaBlockPending.get(9), undefined);
      room.projectiles.delete(projectile.id);
    }
  }
  // Gecilmis kalkan: merkez cizginin otesinde, govdesi hala levhada, uzaklasiyor: durmuyor.
  for (const id of ["zeynep-1", "warrior-6", "warrior-1"]) {
    landShield(room, center.x - 1, center.y, Math.PI / 2);
    const projectile = shoot(context, id, center, 0, { flown: 1000 });
    room.rebuildEnemyGrid();
    room.updateProjectiles(1 / 60);
    assert.ok(room.projectiles.has(projectile.id), `${id}: gecilmis kalkan arkadan durdurdu`);
    room.projectiles.delete(projectile.id);
  }
  // Yeni inen kalkan sayacini (dusman tikinde guncelleniyor) beklemiyor: indigi tikte kesiyor.
  const shield = landShield(room, center.x + 30, center.y, Math.PI / 2);
  room.activeMekaShieldCount = 0;
  const projectile = shoot(context, "zeynep-1", center, 0, { flown: 1000, vx: 3000, vy: 0 });
  room.rebuildEnemyGrid();
  room.updateProjectiles(1 / 60);
  assert.ok(!room.projectiles.has(projectile.id), "yeni inen kalkan sayilmadan gecti");
  assert.equal(room.mekaBlockPending.get(shield.id)?.length, 1);
});

/** Merminin cizilen govdesi `along` kadar ilerlemisken: parcalar ve (Melis dokularinda) igne, parca olarak. */
function projectileWorldShapes(id, tier, flown, fx, fy, ux, uy, along) {
  const shapes = projectileWorldParts(id, tier, flown, fx, fy, ux, uy, along);
  const shape = getProjectileShape(id, tier);
  if (shape.disc === 2 && shape.nose > shape.wide + shape.radius) {
    const rear = Math.max(shape.wide, -getProjectileReach(shape, flown));
    const cx = fx + ux * along;
    const cy = fy + uy * along;
    shapes.push([[cx + ux * rear, cy + uy * rear], [cx + ux * shape.nose, cy + uy * shape.nose]]);
  }
  return shapes;
}

/** Kayittaki opak (govde) ilkellerin dis bukey zarflari, dunyada (saat yonunun tersine). */
function opaqueHulls(...recorders) {
  const out = [];
  for (const recorder of recorders) {
    for (const prim of recorder.prims) {
      if (!isBodyPrim(prim)) continue;
      const polygon = hull(prim.points);
      if (polygon.length >= 3) out.push(polygon);
    }
  }
  return out;
}

/** Dis bukey cokgenin `depth` kadar iceri kaydirilmisi (bossa bos dizi). */
function erode(polygon, depth) {
  let out = polygon;
  for (let i = 0; i < polygon.length && out.length >= 3; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (b[1] - a[1]) / length;
    const ny = -(b[0] - a[0]) / length;
    out = clip(out, nx, ny, nx * a[0] + ny * a[1] - depth);
  }
  return out.length >= 3 ? out : [];
}

/**
 * Kaba kuvvet: engelin cizgisine giden (normal `n`, cizgide `p`) rastgele
 * atislar. Sunucunun durusu (`getProjectileBlockCrossing`) cizimin kendisine
 * karsi: durustan once merminin cizilen govdesi cizilen opak bir parcaya
 * (renderer'in kaydi) 0,3'ten derin girmiyor (gec ya da hic durmayan atis
 * yok); durdugu an cizilen govde bir opak parcaya 0,3'ten yakin (cizim
 * degmeden durus yok). `trial(rnd)` atisin baslangicini ve yonunu veriyor.
 */
function bruteShieldTrials(room, drawn, line, trial, { trials, frontOnly = false, seed }) {
  const box = (polygon) => {
    const xs = polygon.map(([x]) => x);
    const ys = polygon.map(([, y]) => y);
    return { polygon, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const drawnBoxes = drawn.map(box);
  const erodedBoxes = drawn.map((polygon) => erode(polygon, 0.3)).filter((polygon) => polygon.length >= 3).map(box);
  // Yolun cevresindeki parcalar (merminin govdesi merkezden en fazla ~25 birim).
  const near = (boxes, x0, y0, x1, y1) => boxes.filter((entry) => entry.x1 >= Math.min(x0, x1) - 25 && entry.x0 <= Math.max(x0, x1) + 25 && entry.y1 >= Math.min(y0, y1) - 25 && entry.y0 <= Math.max(y0, y1) + 25).map((entry) => entry.polygon);
  const rnd = random(seed);
  const ids = ["zeynep-1", "warrior-1", "warrior-4", "warrior-6", "warrior-2", "warrior-3", "zeynep-3", "archer-5", "archer-1", "onur-2"];
  const stats = { approaching: 0, stops: 0, touching: 0, passed: 0 };
  for (let index = 0; index < trials; index += 1) {
    const { fx, fy, angle } = trial(rnd);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const side = (fx - line.x) * line.nx + (fy - line.y) * line.ny;
    const rate = ux * line.nx + uy * line.ny;
    const closing = side > 0 ? -rate : side < 0 ? rate : Math.abs(rate);
    if (!(closing > 1e-3) || (frontOnly && !(side > 0))) continue;
    stats.approaching += 1;
    const id = ids[index % ids.length];
    const tier = 1 + (index % 3);
    const flown = [0, rnd() * 4, 1000][Math.floor(index / ids.length) % 3];
    const travel = 2 + rnd() * 14;
    const shape = getProjectileShape(id, tier);
    const model = room.getProjectileBlockCrossing({ flown }, shape, fx, fy, ux, uy, travel);
    const label = `${id} T${tier} ucus ${flown.toFixed(2)} (${fx.toFixed(2)}, ${fy.toFixed(2)}) ${((angle * 180) / Math.PI).toFixed(1)} derece`;
    const end = model ?? travel;
    const eroded = near(erodedBoxes, fx, fy, fx + ux * travel, fy + uy * travel);
    const local = near(drawnBoxes, fx, fy, fx + ux * travel, fy + uy * travel);
    // Durustan once: cizilen govde opak bir parcaya 0,3'ten derin girmiyor.
    for (let s = 0; s < end - 1e-9; s += 0.1) {
      const parts = projectileWorldShapes(id, tier, flown, fx, fy, ux, uy, s);
      for (const part of parts) {
        for (const polygon of eroded) assert.ok(polygonDistance(polygon, part) > 0, `${label}: ${s.toFixed(2)}'de cizilen parcaya 0,3'ten derin girdi, sunucu ${model}`);
      }
    }
    if (model === undefined) {
      stats.passed += 1;
      continue;
    }
    stats.stops += 1;
    // Durusta: cizilen govde cizilen bir opak parcaya degiyor (0,3 pay: siperin direginin on koseleri).
    const parts = projectileWorldShapes(id, tier, flown, fx, fy, ux, uy, model);
    let gap = Infinity;
    for (const part of parts) for (const polygon of local) gap = Math.min(gap, polygonDistance(polygon, part));
    assert.ok(gap <= 0.3 + 1e-6, `${label}: cizim degmeden durdu (${gap.toFixed(3)}, ${model})`);
    if (gap <= 1e-6) stats.touching += 1;
  }
  return stats;
}

test("meka kalkaninin uclari: cizilen kertikler de levha; kaba kuvvette cizilen govde cizilen opak parcaya 0,3'ten derin girmeden duruyor, cizim degmeden durmuyor", async () => {
  // Turun dogrulayicisinin ornegi: uc kertikleri (alfa 1, 1,6 kalin) yuzun
  // 1,8, ucun 0,8 otesine tasiyordu; levha onlari kapsamadigindan mermi
  // kertigin icine girip duruyor ya da icinden geciyordu. Cizim gercek
  // cizicinin (race-traits `drawMekaShield`) kaydi.
  const race = await importWebModule("apps/web/src/vfx/race-traits.ts");
  const context = setup();
  const { room, center, grid } = context;
  assert.equal(getProjectileSceneScale(grid), 1);
  const face = getMekaShieldFace(grid);
  const tick = getMekaShieldTickHalf(grid);
  assert.ok(tick > face + 1, `kertik ${tick} / yuz ${face}`);
  let total = { approaching: 0, stops: 0, touching: 0, passed: 0 };
  for (let shieldIndex = 0; shieldIndex < 6; shieldIndex += 1) {
    const angle = (shieldIndex / 6) * Math.PI + 0.13;
    const shield = landShield(room, center.x, center.y, angle);
    const recorder = createGeometryRecorder();
    race.drawMekaShield(recorder, { id: 9, x1: shield.x1, y1: shield.y1, x2: shield.x2, y2: shield.y2, ms: 2000 }, undefined, grid, { now: 0, reducedMotion: true });
    const drawn = opaqueHulls(recorder);
    // Cizilen kertikler yuzun otesinde: kaydin en uzak noktasi kertigin ucu.
    const tx = Math.cos(angle);
    const ty = Math.sin(angle);
    const reachN = Math.max(...drawn.flat().map(([x, y]) => Math.abs(-(x - center.x) * ty + (y - center.y) * tx)));
    near(reachN, tick, "kertigin cizilen ucu", 1e-6);
    const line = { x: center.x, y: center.y, nx: -ty, ny: tx };
    const stats = bruteShieldTrials(room, drawn, line, (rnd) => {
      // Uclarin cevresinden, cogunlukla ucun yakinina dogru.
      const end = rnd() < 0.5 ? -1 : 1;
      const along = end * (28 + rnd() * 16);
      const offset = (rnd() < 0.5 ? -1 : 1) * (1 + rnd() * 14);
      const fx = center.x + tx * along - ty * offset;
      const fy = center.y + ty * along + tx * offset;
      const aim = end * (31 + rnd() * 6);
      const lateral = (rnd() * 2 - 1) * (tick + 3);
      const angleTo = Math.atan2(center.y + ty * aim + tx * lateral - fy, center.x + tx * aim - ty * lateral - fx);
      return { fx, fy, angle: rnd() < 0.15 ? rnd() * Math.PI * 2 : angleTo + (rnd() - 0.5) * 0.4 };
    }, { trials: 400, seed: 7100 + shieldIndex });
    for (const key of Object.keys(total)) total[key] += stats[key];
  }
  assert.ok(total.approaching > 1400 && total.stops > 500 && total.touching > 350 && total.passed > 150, JSON.stringify(total));
});

test("siperin direkleri: cizilen direkler de levha; kaba kuvvette onden gelen atisin cizilen govdesi cizilen opak parcaya 0,3'ten derin girmeden duruyor, cizim degmeden durmuyor", async () => {
  // Turun dogrulayicisinin ornegi: uclardaki iki direk (alfa 0,92, 0,28
  // kare) seridin 4,8 disina ve on cizginin 2,9 onune tasiyordu; levha
  // yalnizca on cizgi arti eksi 1,2 oldugundan mermi diregin icinden
  // geciyordu. Cizim gercek cizicinin (counter-surge `drawCounterSurge`)
  // kaydi; bant istemcinin kurdugu gibi (\`getCounterSurgeBand\`, telin kaydindan).
  const surgeVfx = await importWebModule("apps/web/src/vfx/counter-surge.ts");
  const realNow = Date.now;
  const clock = { now: 1_800_000_000_000 };
  Date.now = () => clock.now;
  try {
    const room = createRoom("warrior");
    room.broadcast = () => {};
    room.clients = [{ sessionId: "p1", ref: { bufferedAmount: 0 }, send() {} }];
    room.mapScale = 1;
    room.configureArenaForScale();
    room.buildZones = undefined;
    room.stage = 3;
    room.wave = 8;
    const map = room.activeMap;
    const grid = getMapGridSize(map);
    assert.equal(getProjectileSceneScale(grid), 1);
    const surge = room.launchCounterSurge({ atSpawn: 0, kind: "aegis", travel: "down", lane: 3, width: getCounterSurgeWidthCells("aegis", map.cols, map.rows) }, clock.now);
    const target = surge.launchAt + (9.5 / map.rows) * surge.crossMs;
    while (clock.now < target) {
      clock.now = Math.min(target, clock.now + 20);
      room.updateCounterSurge(clock.now);
    }
    assert.equal(room.activeAegis, surge, "siper kalkmadi");
    const plate = room.getAegisPlate(surge);
    const band = surgeVfx.getCounterSurgeBand(room.getCounterSurgeWire(surge, clock.now), getMapOrigin(map), grid, map.cols, map.rows);
    band.front = surge.frontAlong;
    // Istemcinin bandi sunucunun levhasiyla ayni yerde.
    near(band.baseX + band.axX * band.width / 2 + band.dirX * band.front, plate.x, "bandin on ortasi x", 1e-6);
    near(band.baseY + band.axY * band.width / 2 + band.dirY * band.front, plate.y, "bandin on ortasi y", 1e-6);
    const fill = createGeometryRecorder();
    const edge = createGeometryRecorder();
    surgeVfx.drawCounterSurge(fill, edge, band, grid, { now: 0, reducedMotion: true, lod: 0 });
    const drawn = opaqueHulls(fill, edge);
    // Cizilen direk seridin disina tasiyor (yarim direk arti kenar cizgisinin yarisi).
    const across = drawn.flat().map(([x, y]) => (x - band.baseX) * band.axX + (y - band.baseY) * band.axY);
    near(Math.min(...across), -((grid * AEGIS_DRAWN.postCells) / 2 + AEGIS_DRAWN.postRim / 2), "diregin cizilen dis yani", 1e-6);
    const line = { x: plate.x, y: plate.y, nx: band.dirX, ny: band.dirY };
    const stats = bruteShieldTrials(room, drawn, line, (rnd) => {
      // Onden (seridin yol yonunde), uclarin cevresinden; cogunlukla diregin yakinina dogru.
      const end = rnd() < 0.5 ? 0 : band.width;
      const a = end + (rnd() * 2 - 1) * 14;
      const s = band.front + 1 + rnd() * 24;
      const fx = band.baseX + band.axX * a + band.dirX * s;
      const fy = band.baseY + band.axY * a + band.dirY * s;
      const aimA = end + (rnd() * 2 - 1) * 9;
      const aimS = band.front + (rnd() * 2 - 1) * 6;
      const angleTo = Math.atan2(band.baseY + band.axY * aimA + band.dirY * aimS - fy, band.baseX + band.axX * aimA + band.dirX * aimS - fx);
      return { fx, fy, angle: rnd() < 0.15 ? rnd() * Math.PI * 2 : angleTo + (rnd() - 0.5) * 0.4 };
    }, { trials: 1600, frontOnly: true, seed: 8800 });
    assert.ok(stats.approaching > 800 && stats.stops > 300 && stats.touching > 200 && stats.passed > 100, JSON.stringify(stats));
  } finally {
    Date.now = realNow;
  }
});

test("merminin destek noktasi kesik govdenin en ilerisi: disk ve Melis kapsulu de merkezin `reach` gerisinde kesik (bagimsiz ornekleme)", () => {
  // Eskiden diskin destek noktasi kesimi gozetmiyordu: dogan Ucube'nin
  // (`reach` 0) geriye bakan destegi -3,36'da, kesik govde 0'da bitiyordu.
  const rnd = random(31);
  for (const id of ["warrior-6", "archer-5", "archer-1", "archer-2", "archer-6", "mage-1", "zeynep-1", "warrior-3"]) {
    for (const tier of [1, 3]) {
      const shape = getProjectileShape(id, tier);
      for (const reach of [0, 0.7, 2.5, 6, getProjectileReach(shape, 1000)]) {
        if (reach > shape.tail) continue;
        const parts = projectileLocalParts(id, tier, shape, reach);
        for (let index = 0; index < 24; index += 1) {
          const angle = index < 4 ? (index * Math.PI) / 2 : rnd() * Math.PI * 2;
          const mx = Math.cos(angle);
          const my = Math.sin(angle);
          const support = writeProjectileSupport(shape, reach, 1, 0, mx, my, { x: 0, y: 0 });
          const value = support.x * mx + support.y * my;
          let expected = Math.max(...parts.flat().map(([px, py]) => px * mx + py * my));
          if (shape.disc === 2 && shape.nose > shape.wide + shape.radius) expected = Math.max(expected, shape.nose * mx);
          // Disk cevreleyen 180-gen, kapsul ic 360-gen: fark en fazla r x 1,5e-4.
          assert.ok(Math.abs(value - expected) <= shape.radius * 2e-4 + 1e-9, `${id} T${tier} reach ${reach} aci ${angle.toFixed(2)}: ${value} / ${expected}`);
          assert.ok(support.x >= -reach - 1e-9, `${id}: destek kesimin gerisinde (${support.x})`);
        }
      }
    }
  }
});

test("sorgu payi en buyuk govdeyi kapsiyor; tik icinde itilen dusman ayni tikin mermisine yeni yerinde", () => {
  const context = setup();
  const { center, hits, room } = context;
  // Havadaki tam yigin (10) ruh cekici dusmus brute: sunucunun yigini `raceTrait.stacks`.
  const giant = enemyAt(context, center.x, center.y, { race: "fallen", type: "brute", movementKind: "air", raceTrait: { trait: "drawer", stacks: 10, baseMaxHp: 1, baseSpeed: 0 } }, [1, 0]);
  assert.ok(giant.body.reach > 28, `${giant.body.reach}`);
  assert.ok(room.enemyBodyReachMax >= giant.body.reach, "sorgu payi en buyuk govdeyi bilmiyor");
  const shape = getProjectileShape("warrior-1", 1);
  // Govdenin ust kenarinin hemen icinden gecen mermi degiyor.
  const top = getBodyProjectionMax(giant.body, 0, 1);
  const projectile = shoot(context, "warrior-1", { x: center.x - 80, y: top + shape.halfWidth - 0.05 }, 0);
  fly(context, projectile, 120);
  assert.equal(hits.length, 1, "kenardan gecen mermi en buyuk govdeye degmedi (sorgu payi dar)");

  // Itme: izgara kurulduktan sonra dusman 150 birim oteye itiliyor; ayni tikteki mermi onu buluyor.
  const pushed = setup();
  // Hava dusmani: itme yalnizca harita sinirina bakiyor. 150 birim: izgaranin 128'lik hucresini her zaman asiyor.
  const enemy = enemyAt(pushed, pushed.center.x, pushed.center.y, { type: "grunt", movementKind: "air" });
  pushed.room.rebuildEnemyGrid();
  const from = { x: enemy.x, y: enemy.y };
  assert.equal(pushed.room.tryDisplaceEnemy(enemy, 0, 150), 1, "itilemedi");
  assert.deepEqual([enemy.body.x, enemy.body.y], [enemy.x, enemy.y], "govde itilen yerde degil");
  shoot(pushed, "warrior-1", { x: enemy.x - 20, y: enemy.y }, 0);
  pushed.room.updateProjectiles((1 / 60) * 20);
  assert.equal(pushed.hits.length, 1, `itilen dusman bulunmadi (${from.y} -> ${enemy.y})`);
});

test("izgara: sayi anahtarli hucreler; ayni hucrede tasima hicbir seyi degistirmiyor, hucre degisince sira korunuyor", () => {
  const grid = new SpatialGrid(128);
  const items = [{ id: "a", x: 10, y: 10 }, { id: "b", x: 20, y: 20 }, { id: "c", x: 30, y: 30 }, { id: "d", x: -300, y: 400 }];
  grid.rebuild(items);
  assert.deepEqual(grid.queryCircle(0, 0, 60).map((item) => item.id), ["a", "b", "c"]);
  // Ayni hucrede yer degistiren oge: hucrenin dizisi ayni sirada.
  items[0].x = 100;
  grid.relocate(items[0], 10, 10);
  assert.deepEqual(grid.queryCircle(64, 64, 80).map((item) => item.id), ["a", "b", "c"]);
  // Hucre degistiren oge: eski hucreden cikiyor (sira korunarak), yenisinde bulunuyor.
  items[1].x = 300;
  grid.relocate(items[1], 20, 20);
  assert.deepEqual(grid.queryCircle(64, 64, 80).map((item) => item.id), ["a", "c"]);
  assert.deepEqual(grid.queryCircle(300, 20, 5).map((item) => item.id), ["b"]);
  assert.deepEqual(grid.queryCircle(-300, 400, 1).map((item) => item.id), ["d"], "eksi koordinat");
});

test("saldiri dronu cizilen govdesiyle vuruyor: dronun diski gorunen govdeye degdiginde", () => {
  const radius = getAttackDroneBodyRadius();
  // 30 piksellik doku x 1,55 x 2/3; ortalama golge yaricapi ~10,7.
  assert.ok(radius > 10 && radius < 11.5, `${radius}`);
  const body = Object.assign(createEnemyBody({ race: "holyGuardian", type: "runner" }, 34, 0, 0), { headingX: 1, headingY: 0 });
  const front = getBodyProjectionMax(body, 1, 0);
  const side = getBodyProjectionMax(body, 0, 1);
  assert.ok(isPointInBody(body, front + radius - 0.01, 0, radius) && !isPointInBody(body, 0, side + radius + 0.01, radius));
  const server = read("apps/server/src/rooms/MatchRoom.ts");
  assert.match(server, /isPointInBody\(target\.body, drone\.x, drone\.y, getAttackDroneBodyRadius\(getMapGridSize\(this\.activeMap\)\)\)/);
});

test("istemci carpmanin dusmanini govdenin kenarindan buluyor: merkezi daha yakin dusman degil; buyuk govde de", () => {
  const big = { id: "big", x: 0, y: 0, race: "fallen", type: "brute", movementKind: "air", ds: 10 };
  const small = { id: "small", x: 30, y: 22, race: "meka", type: "grunt" };
  const scratch = bodies.writeSnapshotEnemyBody(bodies.createBodyScratch(), big, undefined, 34);
  // Temas buyuk govdenin sag kenarinda (merkezden ~30 birim: eski 26 birimlik arama bulamazdi).
  const contact = { x: getBodyProjectionMax(scratch.body, 1, 0), y: 0 };
  assert.ok(contact.x > 26, `${contact.x}`);
  assert.ok(Math.hypot(contact.x - small.x, contact.y - small.y) < Math.hypot(contact.x, contact.y), "kucuk dusman merkezce daha yakin degil");
  assert.equal(bodies.findContactEnemy([small, big], contact.x, contact.y, undefined, 34)?.id, "big");
  assert.equal(bodies.findContactEnemy([small, big], 400, 400, undefined, 34), undefined);
  // Yonu verilmis govde: istemcinin izledigi yonle.
  const tracker = { get: (id) => (id === "runner" ? { headingX: 1, headingY: 0 } : undefined) };
  const runner = { id: "runner", x: 0, y: 0, race: "holyGuardian", type: "runner" };
  const shape = bodies.writeSnapshotEnemyBody(bodies.createBodyScratch(), runner, tracker.get("runner"), 34);
  assert.equal(bodies.findContactEnemy([runner], getBodyProjectionMax(shape.body, 1, 0), 0, tracker, 34)?.id, "runner");
});

test("istemci: duran mermi ve carpma cizimi vurulan dusmana bagli; carpmanin ani temasin tiki", () => {
  // Temas mesaji sunucunun tik N'sinde: snapshot o tikin yuruyusunden sonra,
  // temas yuruyusten once (tik N - 1'in konumlari). Carpmanin ani bir tik geri.
  near(bodies.getContactServerTime(1000), 1000 - SERVER_TICK_MS, "temasin ani");
  // Sunucu t = 130'da temas: dusmanin kenari (10, 0). Gelen snapshot'lar t = 100
  // (dusman 0, 0) ve t = 160 (dusman 6, 0): carpma anindaki konum (3, 0), temas
  // dusmana gore (7, 0). Oynatmada dusman yurudukce mermi de onunla.
  const anchor = { enemyId: "e1", x: 10, y: 0, at: 130, offsetX: 0, offsetY: 0, state: "pending" };
  const before = { serverTime: 100, enemies: [{ id: "e1", x: 0, y: 0 }] };
  const after = { serverTime: 160, enemies: [{ id: "e1", x: 6, y: 0 }] };
  assert.equal(bodies.resolveHitAnchor(anchor, [{ snapshot: before }]), false, "carpmanin otesinde snapshot yokken cozuldu");
  assert.equal(bodies.resolveHitAnchor(anchor, [{ snapshot: before }], after), true);
  near(anchor.offsetX, 7, "temas dusmana gore x", 1e-9);
  near(anchor.offsetY, 0, "temas dusmana gore y", 1e-9);
  assert.equal(bodies.resolveHitAnchor(anchor, []), true);
  const dead = { enemyId: "e2", x: 10, y: 0, at: 130, offsetX: 0, offsetY: 0, state: "pending" };
  assert.equal(bodies.resolveHitAnchor(dead, [{ snapshot: before }, { snapshot: after }]), false);
  assert.equal(dead.state, "free");
  const scene = read("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /x: enemy\.x \+ anchor!\.offsetX, y: enemy\.y \+ anchor!\.offsetY/);
  assert.match(scene, /mover\.sprite\.x - \(mover\.knockDx \?\? 0\) \+ anchor\.offsetX/);
});

test("meka kalkaninin uc kertigi kendi govdesiyle duruyor: cizgiye paralel ya da cizgiyi gecmis mermi kertige carpinca duruyor", () => {
  const context = setup();
  const { room, center, grid } = context;
  const face = getMekaShieldFace(grid);
  const ids = ["zeynep-1", "warrior-1", "warrior-4", "warrior-6"];
  let parallelStops = 0;
  for (const id of ids) {
    const shape = getProjectileShape(id, 1, getProjectileSceneScale(grid));
    for (const angle of [0, 0.7, 1.9]) {
      const shield = landShield(room, center.x, center.y, angle);
      const tx = (shield.x2 - shield.x1) / 68;
      const ty = (shield.y2 - shield.y1) / 68;
      // Cizgi boyunca, kalkanin uzantisindan uca dogru (cizgiye paralel), cizgiden 3 birim yanda.
      const fx = shield.x2 + tx * 30 - ty * 3;
      const fy = shield.y2 + ty * 30 + tx * 3;
      const model = room.getProjectileBlockCrossing({ flown: 1000 }, shape, fx, fy, -tx, -ty, 40);
      const reference = referencePlateStop(shield, face, id, 1, 1000, fx, fy, -tx, -ty, 40, grid);
      assert.ok(reference >= 0, `${id}: kurgu kertige degmiyor`);
      assert.ok(model !== undefined && Math.abs(model - reference) < 2e-2, `${id} ${angle}: paralel mermi kertikte ${reference}'de durmali, sunucu ${model}`);
      assert.ok(room.plateBlockPart !== undefined, `${id}: kertik yerine ana levha`);
      parallelStops += 1;
    }
  }
  assert.equal(parallelStops, ids.length * 3);
});

test("ara karede sprite onceki snapshot'in yonuyle: sunucu o araliktaki vuruslari o yonle yapiyor", () => {
  const source = readFileSync(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = source.indexOf("  private interpolateSnapshot(");
  const body = source.slice(start, source.indexOf("\n  }\n", start));
  assert.match(body, /hx: oldEnemy\?\.hx \?\? enemy\.hx,\n\s+hy: oldEnemy\?\.hy \?\? enemy\.hy/);
});
