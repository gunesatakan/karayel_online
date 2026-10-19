/**
 * Zeynep imzalarinin teli: tek yeni alan ayna isininin sekme kosesi (`b`).
 *
 * Imzalarin geri kalani mevcut veriden turuyor (isinlar, temaslar, gelen
 * snapshot'in konumlari); ayna isininin sekmesi turetilemiyordu: gorunen
 * parca kuyruk ve bastan ibaretti ve istemci koseyi kesen bir kiris
 * ciziyordu. Testler:
 *
 * - `b` yalnizca gorunen parca bir sekmeyi asarken yaziliyor; kose dunyanin
 *   kenarinda; yoksa anahtar hic yok (`undefined` bile degil).
 * - Yanik izinin rengi yanigin camgobegi ailesinde; sekmeden sonraki renk
 *   tumuyle beyaz degil (gorsel; hasar ve kurallar ayni).
 * - Istemcinin kullandigi paylasilan kurallar sunucunun kendisi: Abarti
 *   dikdortgeni ve zirh kiran mermiler.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ENEMY_BODY_OUTLINES, getAbartiRailRect, getAbartiShowcaseRangeMultiplier, getMapGridSize, isAbartiArmorBreakProjectile } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1" };

function placeTaht() {
  const room = createRoom("zeynep");
  const spot = findBuildableSpot(room, "zeynep-3");
  assert.ok(spot, "Taht icin yer bulunamadi");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "zeynep-3" }, { free: true, ignoreLimit: true });
  const tower = [...room.towers.values()].find((candidate) => candidate.definition.id === "zeynep-3");
  assert.ok(tower);
  return { room, tower };
}

const rayRecords = (room) => room.getSnapshot().beams.filter((beam) => beam.definitionId === "zeynep-3-ray");

test("ayna ışınının sekme köşesi (b) yalnızca görünen parça sekmeyi aşarken telde", () => {
  const { room, tower } = placeTaht();
  const bounds = room.getActiveWorldBounds();
  // Hedef kulenin hemen sagi-asagisi: isin kenara carpip sekiyor.
  room.fireZeynepSynthesisMirrorBeam(tower, { x: tower.x + 40, y: tower.y + 25 });
  let withKey = 0;
  let without = 0;
  for (let step = 0; step < 400 && room.zeynepRays.size > 0; step += 1) {
    for (const record of rayRecords(room)) {
      if (!("b" in record)) {
        without += 1;
        continue;
      }
      withKey += 1;
      assert.ok(Array.isArray(record.b) && record.b.length >= 2 && record.b.length % 2 === 0);
      const [x, y] = record.b;
      const onEdge = Math.min(Math.abs(x - bounds.left), Math.abs(x - bounds.right), Math.abs(y - bounds.top), Math.abs(y - bounds.bottom)) < 0.6;
      assert.ok(onEdge, `kose dunyanin kenarinda olmali (${x}, ${y})`);
      // Kirik yol kirisinden uzun: kuyruk -> kose -> bas.
      const chord = Math.hypot(record.x2 - record.x1, record.y2 - record.y1);
      const path = Math.hypot(x - record.x1, y - record.y1) + Math.hypot(record.x2 - x, record.y2 - y);
      assert.ok(path > chord, "sekmeyi asan parca kirisinden uzun");
    }
    room.updateZeynepRays(0.008);
  }
  assert.ok(withKey > 0, "sekme gorunurken kose yazilmali");
  assert.ok(without > 0, "sekme yokken anahtar yazilmamali");
});

test("yanık izi camgöbeği, sekmeden sonraki ışın beyaz değil", () => {
  const { room, tower } = placeTaht();
  room.fireZeynepSynthesisBurnImpact(tower, { id: "e", x: tower.x + 40, y: tower.y, pathDistance: 0 });
  const trail = [...room.beams.values()].find((beam) => beam.definitionId === "zeynep-3-burn-trail");
  assert.ok(trail);
  const channels = (color) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
  const [r, g, b] = channels(trail.color);
  assert.ok(b > r && g > r, `iz camgobegi ailesinde olmali (${trail.color.toString(16)})`);

  room.fireZeynepSynthesisMirrorBeam(tower, { x: tower.x + 40, y: tower.y + 25 });
  const colors = new Set();
  for (let step = 0; step < 400 && room.zeynepRays.size > 0; step += 1) {
    for (const record of rayRecords(room)) colors.add(record.color);
    room.updateZeynepRays(0.008);
  }
  assert.ok(colors.size >= 2, "sekmeden once ve sonra ayri renk");
  for (const color of colors) {
    const values = channels(color);
    assert.ok(Math.max(...values) - Math.min(...values) >= 40, `isin tumuyle beyaz okunmamali (${color.toString(16)})`);
  }
});

test("istemcinin paylaşılan kuralları sunucunun kendisi: Abartı dikdörtgeni, zırh kıran mermiler, çarpışma yarıçapı", () => {
  // Dikdortgen: iki kare boyunca, kalinlik max(5, kare * 0.16).
  assert.deepEqual(getAbartiRailRect(120, 200, "horizontal", 34), { left: 86, right: 154, top: 200 - 2.72, bottom: 200 + 2.72 });
  assert.deepEqual(getAbartiRailRect(120, 200, "vertical", 34), { left: 117.28, right: 122.72, top: 166, bottom: 234 });
  assert.deepEqual(getAbartiRailRect(0, 0, undefined, 20), { left: -20, right: 20, top: -2.5, bottom: 2.5 });
  const room = createRoom("zeynep");
  const gridSize = getMapGridSize(room.activeMap);
  const thickness = Math.max(5, gridSize * 0.16);
  assert.deepEqual(room.getAbartiRect({ x: 120, y: 200, orientation: "vertical" }), { left: 120 - thickness / 2, right: 120 + thickness / 2, top: 200 - gridSize, bottom: 200 + gridSize });
  assert.deepEqual(room.getAbartiRect({ x: 120, y: 200, orientation: "horizontal" }), { left: 120 - gridSize, right: 120 + gridSize, top: 200 - thickness / 2, bottom: 200 + thickness / 2 });
  // Gosteri / Kin menzil carpani: sv 1'de 1.1, 10'da 2.0, dogrusal; disi sinirlaniyor.
  assert.deepEqual([0, 1, 4, 10, 12].map((level) => Math.round(getAbartiShowcaseRangeMultiplier(level) * 1000) / 1000), [1.1, 1.1, 1.4, 2, 2]);
  assert.deepEqual(["zeynep-1", "zeynep-3", "zeynep-3-kin-projectile", "zeynep-2", "warrior-1"].map(isAbartiArmorBreakProjectile), [true, true, true, false, false]);
  // Carpisma govdesi gorunen govdeden (eski tur tablosu 19 / 13 / 15 x 0,675
  // yerine). Sunucunun govdesi, istemcinin cizdigi dokudan bagimsiz
  // turetilmis haliyle karsilastiriliyor: GameScene dokuyu
  // `taban boy x 0,675 x kare / 34 / 512` olcegiyle (sampiyon x1,25, havada
  // x1,28) ciziyor, yani dokunun yari kenari o boyun yarisi; govde o kareye
  // oturan doku cokgeni (uretilmis tablo, x yana, y ileri), yonu dondurulmemis
  // doku (+y). Ayrintili tablolar tests/visible-hitbox.test.mjs'te.
  const DISPLAY = { grunt: 34, siege: 38, brute: 43.2, runner: 40, shooter: 38 };
  const BRUTE_RACE = { spaceBug: 1.3, fallen: 1.1 };
  const ART = { grunt: "grunt", siege: "brute", brute: "brute", runner: "runner", shooter: "shooter" };
  const sent = [];
  room.broadcast = (type, payload) => sent.push({ type, payload });
  for (let count = 0; count < 12; count += 1) {
    room.wave = 1 + count;
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    // Istemcinin gordugu: dogum mesaji (statik kayit).
    const view = sent.filter((entry) => entry.type === "enemy:spawn").map((entry) => entry.payload).find((payload) => payload.id === enemy.id);
    assert.ok(view, "enemy:spawn yok");
    const drawn = DISPLAY[view.type] * (view.type === "brute" ? BRUTE_RACE[view.race] ?? 1 : 1) * 0.675 * (gridSize / 34)
      * (view.champion ? 1.25 : 1) * (view.movementKind === "air" ? 1.28 : 1);
    const label = `${view.race} ${view.type} ${view.movementKind}`;
    assert.ok(Math.abs(enemy.body.scale - drawn / 2) < 1e-9, `${label}: yari kenar ${enemy.body.scale} / ${drawn / 2}`);
    const outline = ENEMY_BODY_OUTLINES[view.race][ART[view.type]];
    const poly = enemy.body.poly;
    assert.equal(poly.count * 2, outline.length, label);
    for (let k = 0; k < poly.count; k += 1) assert.ok(poly.vx[k] === outline[2 * k] && poly.vy[k] === outline[2 * k + 1], `${label}: kose ${k}`);
    const far = Math.max(...Array.from({ length: poly.count }, (_, k) => Math.hypot(outline[2 * k], outline[2 * k + 1])));
    assert.ok(Math.abs(enemy.body.reach - far * drawn / 2) < 1e-9, `${label}: erisim`);
    assert.deepEqual([enemy.body.headingX, enemy.body.headingY], [0, 1], `${label}: dogumda yon`);
    assert.deepEqual([enemy.body.x, enemy.body.y], [enemy.x, enemy.y], `${label}: konum`);
  }
});

test("sunucunun Kin dalgası Abartı rayını geçince menzili paylaşılan çarpanla uzatıyor", () => {
  const room = createRoom("zeynep");
  const spot = findBuildableSpot(room, "zeynep-6");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "zeynep-6" }, { free: true, ignoreLimit: true });
  const kin = [...room.towers.values()].find((tower) => tower.definition.id === "zeynep-6");
  const baseRange = room.getTowerRange(kin);
  const fire = () => {
    room.kinWaves.clear();
    room.fireKinWave(kin, { x: kin.x + 100, y: kin.y });
    return [...room.kinWaves.values()][0].range;
  };
  assert.ok(Math.abs(fire() - baseRange) < 1e-9, "Abartisiz taban menzil");
  // Dalga sahibinin sv 7 Abarti'sini geciyor (gecis kurali paylasilan dikdortgende,
  // yukarida test edildi): menzil paylasilan carpanla, 1.7 kat.
  const pass = room.getAbartiPassThroughLevel;
  room.getAbartiPassThroughLevel = () => 7;
  try {
    assert.ok(Math.abs(fire() - baseRange * getAbartiShowcaseRangeMultiplier(7)) < 1e-9);
    assert.ok(Math.abs(getAbartiShowcaseRangeMultiplier(7) - 1.7) < 1e-9);
  } finally {
    room.getAbartiPassThroughLevel = pass;
  }
});
