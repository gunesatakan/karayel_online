/**
 * Kin dalgasi ve Kin gosterisi cizildikleri sekille vuruyor; sunucunun vurusu
 * ile istemcinin damgasi ayni fonksiyonu ayni sayilarla cagiriyor.
 *
 * - Dalga cizildigi gibi (combat-vfx `drawPressureWave`): kuleden on kenara
 *   (isinin gorunen boyu) yaricapli yay, yari aci isinin genisliginden,
 *   cizilen dolu yaylarin kalinligi kadar (sahibin karari: ~10 birim; on
 *   cizginin yarisi onde, en arkadaki dolu yayin arka yani geride; eskiden
 *   30 birimlik oyun bandi). Eskiden bant duz bir on kenardi ve yari aci
 *   menzilde olculuyordu (yayin yanlarinda dusman cizilen yaydan once
 *   vuruluyordu); istemci ise sektoru on kenarda kesiyordu (yanlardaki
 *   dusmani sunucudan sonra damgaliyordu).
 * - Yaya kulenin hizasinin gerisinden degen govde (yandan ya da kulenin
 *   ustunden): sunucu vuruyor, istemci de damgaliyor (uzaklik 0'a kirpiliyor).
 * - Gosteri cizildigi gibi (beam-renderer `drawKinShowcaseLight`): tepe kule,
 *   uzak kenar menzilde duz ucgen. Eskiden dairesel dilimdi (ucgenin
 *   koselerindeki dusman vurulmuyordu).
 * - Esitlik izgarada sinaniyor: her tik ayni dusmanlar, istemci ne erken ne
 *   gec (sunucu tikin isinini teldeki yuvarlamayla yaziyor).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  KIN_WAVE_STROKES,
  createEnemyBody,
  createKinWaveSector,
  getKinWaveBandAhead,
  getKinWaveBandBehind,
  getKinWaveFrontStroke,
  getMapGridSize,
  getProjectileSceneScale,
  isBodyInKinShowcase,
  isBodyTouchingKinWave,
  writeKinWaveSector
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const zeynep = await importWebModule("apps/web/src/vfx/zeynep-signatures.ts");
const { BeamRenderer } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");
const client = { sessionId: "p1", send() {} };
const RACES = ["meka", "spaceBug", "fourthDimensional", "holyGuardian", "fallen", "golem"];
const TYPES = ["grunt", "brute", "runner", "shooter"];

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const inside = (polygon, q) => polygon.every((a, i) => cross(a, polygon[(i + 1) % polygon.length], q) >= -1e-12);
function segmentPointDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
}
function segmentsCross(a, b, c, d) {
  return ((cross(a, b, c) > 0) !== (cross(a, b, d) > 0)) && ((cross(c, d, a) > 0) !== (cross(c, d, b) > 0));
}
function polygonDistance(a, b) {
  if (a.some((q) => inside(b, q)) || b.some((q) => inside(a, q))) return 0;
  for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1) if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return 0;
  let best = Infinity;
  for (const q of a) for (let j = 0; j < b.length; j += 1) best = Math.min(best, segmentPointDistance(q, b[j], b[(j + 1) % b.length]));
  for (const q of b) for (let i = 0; i < a.length; i += 1) best = Math.min(best, segmentPointDistance(q, a[i], a[(i + 1) % a.length]));
  return best;
}
/** Dokunun Phaser donusuyle (atan2 - 90 derece) dunyadaki cokgen. */
function worldPolygon(body) {
  const angle = Math.atan2(body.headingY, body.headingX) - Math.PI / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return Array.from({ length: body.poly.count }, (_, k) => {
    const x = body.poly.vx[k] * body.scale;
    const y = body.poly.vy[k] * body.scale;
    return [body.x + x * c - y * s, body.y + x * s + y * c];
  });
}
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

test("Kin dalgasinin vurdugu yay cizilen yay: yaricap, aci ve cizilen dolu yaylarin kalinligi cizimden; govdesi yaya degen damgalaniyor", () => {
  for (const tier of [1, 3]) {
    // Cizilen yaylar: her yolun cizgi kalinligi ve yaricapi (kipirti ortalamasi sifir).
    const probe = { id: "kin-wave-kw0", definitionId: "zeynep-6", tier, x1: 0, y1: 0, x2: 60, y2: 0, width: Math.tan(Math.PI / 6) * 120, color: 0x7f1d1d, ttlMs: 120 };
    const rec = createRecorder();
    new BeamRenderer(rec).render([probe], { now: 0, sceneNow: 0, scale: 1, reducedMotion: true });
    const strokes = [];
    let width = 0;
    let open;
    for (const [call, x, y] of rec.calls) {
      if (call === "lineStyle") width = x;
      else if (call === "beginPath") strokes.push((open = { width, radii: [] }));
      else if ((call === "moveTo" || call === "lineTo") && open) open.radii.push(Math.hypot(x, y));
    }
    assert.equal(strokes.length, KIN_WAVE_STROKES.trailing + 1, "dolu yay sayisi");
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const drawnOuter = mean(strokes.at(-1).radii) + strokes.at(-1).width / 2;
    const drawnInner = mean(strokes[0].radii) - strokes[0].width / 2;
    const sector = createKinWaveSector();
    assert.ok(writeKinWaveSector(sector, probe.x1, probe.y1, probe.x2, probe.y2, probe.width, getKinWaveBandBehind(1), getKinWaveBandAhead(tier, 1)));
    // Kipirtinin ortalamasi 17 noktada tam sifir degil: 0,15 pay.
    assert.ok(Math.abs(sector.outer - drawnOuter) < 0.15, `kademe ${tier}: dis kenar ${sector.outer} / cizilen ${drawnOuter}`);
    assert.ok(Math.abs(sector.inner - drawnInner) < 0.15, `kademe ${tier}: ic kenar ${sector.inner} / cizilen ${drawnInner}`);
    assert.ok(Math.abs(strokes.at(-1).width - getKinWaveFrontStroke(tier)) < 1e-9, "on cizginin kalinligi paylasilan sayi");
    // Cizilen derinlik ~10 birim (eskiden 30).
    assert.ok(sector.outer - sector.inner > 9 && sector.outer - sector.inner < 10.5, `${sector.outer - sector.inner}`);
  }
  const beam = { id: "kin-wave-kw1", definitionId: "zeynep-6", tier: 1, x1: 100, y1: 80, x2: 100 + 70 * Math.cos(0.4), y2: 80 + 70 * Math.sin(0.4), width: Math.tan(Math.PI / 6) * 140, color: 0x7f1d1d, ttlMs: 120 };
  const recorder = createRecorder();
  new BeamRenderer(recorder).render([beam], { now: 0, sceneNow: 0, scale: 1, reducedMotion: true });
  // On kenar: cizilen son yol (bant 0), yaricapi kipirtiyla (+/-0,4).
  const paths = [];
  let current;
  for (const [call, x, y] of recorder.calls) {
    if (call === "beginPath") paths.push((current = []));
    else if ((call === "moveTo" || call === "lineTo") && current) current.push([x, y]);
  }
  const front = paths.at(-1);
  const radii = front.map(([x, y]) => Math.hypot(x - beam.x1, y - beam.y1));
  const angles = front.map(([x, y]) => Math.atan2(y - beam.y1, x - beam.x1));
  const sector = createKinWaveSector();
  assert.ok(writeKinWaveSector(sector, beam.x1, beam.y1, beam.x2, beam.y2, beam.width, getKinWaveBandBehind(1), getKinWaveBandAhead(1, 1)));
  const centre = sector.outer - getKinWaveBandAhead(1, 1);
  assert.ok(radii.every((r) => Math.abs(r - centre) <= 0.4 + 1e-9), `yay yaricapi ${Math.min(...radii)}-${Math.max(...radii)} / ${centre}`);
  assert.ok(Math.abs(angles[0] - Math.atan2(sector.startY, sector.startX)) < 1e-9 && Math.abs(angles.at(-1) - Math.atan2(sector.endY, sector.endX)) < 1e-9, "yayin uclari");
  assert.ok(Math.abs(sector.sweep - (angles.at(-1) - angles[0])) < 1e-9, "yayin acisi");
  // Govde: cizilen yayin bandina (yaricap [on - bant, on], yayin acisinda) degen.
  const rnd = random(5150);
  let hits = 0;
  for (let index = 0; index < 1500; index += 1) {
    const r = 20 + rnd() * 70;
    const a = 0.4 + (rnd() - 0.5) * 1.6;
    const body = createEnemyBody({ race: RACES[index % 6], type: TYPES[index % 4] }, 34, beam.x1 + Math.cos(a) * r, beam.y1 + Math.sin(a) * r);
    const heading = rnd() * Math.PI * 2;
    body.headingX = Math.cos(heading);
    body.headingY = Math.sin(heading);
    // Bagimsiz: cokgenin orneklenmis noktalarindan biri yayin bandinda mi (sinirda 0,2 pay).
    const polygon = worldPolygon(body);
    const band = (q, slack) => {
      const d = Math.hypot(q[0] - beam.x1, q[1] - beam.y1);
      const t = Math.atan2(q[1] - beam.y1, q[0] - beam.x1) - angles[0];
      return d >= sector.inner - slack && d <= sector.outer + slack && t >= -slack / d && t <= sector.sweep + slack / d;
    };
    const samples = [];
    const centre = polygon.reduce((sum, p) => [sum[0] + p[0] / polygon.length, sum[1] + p[1] / polygon.length], [0, 0]);
    for (let i = 0; i < polygon.length; i += 1) {
      for (let s = 0; s < 30; s += 1) {
        const p = [polygon[i][0] + (polygon[(i + 1) % polygon.length][0] - polygon[i][0]) * s / 30, polygon[i][1] + (polygon[(i + 1) % polygon.length][1] - polygon[i][1]) * s / 30];
        for (let f = 0; f <= 6; f += 1) samples.push([centre[0] + (p[0] - centre[0]) * f / 6, centre[1] + (p[1] - centre[1]) * f / 6]);
      }
    }
    const touched = isBodyTouchingKinWave(body, sector);
    if (samples.some((q) => band(q, -0.2))) assert.equal(touched, true, "bandin icindeki govdeye degmedi");
    if (!samples.some((q) => band(q, 0.2))) assert.equal(touched, false, "bandin disindaki govdeye degdi");
    if (touched) hits += 1;
  }
  assert.ok(hits > 200, `${hits}`);
});

test("Kin gosterisinin vurdugu yer cizilen ucgen: govdesi ucgene degen (koselerdekiler de) vuruluyor", () => {
  const beam = { id: "kin-showcase-t-1", definitionId: "zeynep-3-kin-showcase", x1: 50, y1: 40, x2: 50 + 100 * Math.cos(-0.7), y2: 40 + 100 * Math.sin(-0.7), width: Math.tan(Math.PI / 6) * 200, color: 0xef4444, ttlMs: 260 };
  const recorder = createRecorder();
  new BeamRenderer(recorder).render([beam], { now: 0, sceneNow: 0, scale: 1 });
  const fill = recorder.calls.find(([call]) => call === "fillPoints");
  const triangle = fill[1].map((point) => [point.x, point.y]);
  assert.equal(triangle.length, 3);
  const ccw = cross(triangle[0], triangle[1], triangle[2]) > 0 ? triangle : [triangle[0], triangle[2], triangle[1]];
  const rnd = random(31337);
  let hits = 0;
  let corners = 0;
  for (let index = 0; index < 1500; index += 1) {
    const r = 10 + rnd() * 130;
    const a = -0.7 + (rnd() - 0.5) * 1.8;
    const body = createEnemyBody({ race: RACES[index % 6], type: TYPES[index % 4] }, 34, beam.x1 + Math.cos(a) * r, beam.y1 + Math.sin(a) * r);
    const heading = rnd() * Math.PI * 2;
    body.headingX = Math.cos(heading);
    body.headingY = Math.sin(heading);
    const gap = polygonDistance(worldPolygon(body), ccw);
    if (gap > 0 && gap < 1e-6) continue;
    const hit = isBodyInKinShowcase(body, beam.x1, beam.y1, beam.x2, beam.y2, beam.width);
    assert.equal(hit, gap === 0, `ucgene uzaklik ${gap}`);
    if (hit) hits += 1;
    // Eski dairesel dilimin disinda kalan koselerdeki govde de vuruluyor.
    if (hit && Math.hypot(body.x - beam.x1, body.y - beam.y1) > 100 + body.reach) corners += 1;
  }
  assert.ok(hits > 200 && corners > 5, `${hits} / ${corners}`);
  // Istemcinin spot isigi ayni fonksiyon.
  const enemy = { id: "e", x: beam.x2, y: beam.y2, type: "grunt" };
  assert.equal(zeynep.isInKinShowcaseCone(beam, enemy, 34), isBodyInKinShowcase(zeynep.getReceiptEnemyBody(enemy, 34).body, beam.x1, beam.y1, beam.x2, beam.y2, beam.width));
});

/** Kin kulesi (zeynep-6) ve kutupsal izgarada sabit dusmanlar; yonleri karisik. */
function kinRoom(definitionId = "zeynep-6") {
  const room = createRoom("zeynep");
  room.broadcast = () => {};
  const spot = findBuildableSpot(room, definitionId);
  room.placeTower(client, { ...spot, definitionId }, { free: true, ignoreLimit: true });
  const tower = [...room.towers.values()].at(-1);
  return { room, tower, grid: getMapGridSize(room.activeMap) };
}

function placeGrid(room, tower, angle, range, step) {
  const rnd = random(2024);
  const enemies = [];
  for (let degrees = -55; degrees <= 55; degrees += step) {
    for (let distance = 4; distance <= range + 26; distance += 3) {
      const a = angle + (degrees * Math.PI) / 180;
      room.spawnEnemy();
      const enemy = [...room.enemies.values()].at(-1);
      // Teldeki yuvarlama (0,1) konumu degistirmesin: konumlar tek ondalikli.
      const x = Math.round((tower.x + Math.cos(a) * distance) * 10) / 10;
      const y = Math.round((tower.y + Math.sin(a) * distance) * 10) / 10;
      Object.assign(enemy, { x, y, race: RACES[enemies.length % 6], type: TYPES[enemies.length % 4], champion: undefined, special: undefined, raceTrait: undefined, movementKind: enemies.length % 7 === 0 ? "air" : "ground", hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, statusResistances: {}, speed: 0 });
      room.assignEnemyBody(enemy);
      const heading = rnd() * Math.PI * 2;
      Object.assign(enemy.body, { x, y, headingX: Math.cos(heading), headingY: Math.sin(heading), fromX: x, fromY: y });
      enemies.push(enemy);
    }
  }
  // Kulenin yaninda ve hizasinin gerisinde (dalganin ekseninde merkezi eksi):
  // yayin tepesine kulenin ustunden ya da yandan degen govdeler, havadaki
  // iri govdeler de. Eski istemci bunlari eksi uzaklikla "bantta degil" sayiyordu.
  for (let degrees = 70; degrees <= 180; degrees += 12) {
    for (const side of [-1, 1]) {
      for (let distance = 0; distance <= 22; distance += 4) {
        const a = angle + (side * degrees * Math.PI) / 180;
        room.spawnEnemy();
        const enemy = [...room.enemies.values()].at(-1);
        const x = Math.round((tower.x + Math.cos(a) * distance) * 10) / 10;
        const y = Math.round((tower.y + Math.sin(a) * distance) * 10) / 10;
        const air = enemies.length % 3 === 0;
        Object.assign(enemy, { x, y, race: RACES[enemies.length % 6], type: air ? "brute" : TYPES[enemies.length % 4], champion: undefined, special: undefined, raceTrait: undefined, movementKind: air ? "air" : "ground", hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, statusResistances: {}, speed: 0 });
        room.assignEnemyBody(enemy);
        const heading = rnd() * Math.PI * 2;
        Object.assign(enemy.body, { x, y, headingX: Math.cos(heading), headingY: Math.sin(heading), fromX: x, fromY: y });
        enemies.push(enemy);
      }
    }
  }
  return enemies;
}

/** Istemcinin gordugu dusman: dogum kaydi alanlari ve sunucunun yonu (izlenen yon). */
const views = (enemies) => enemies.map((enemy) => ({ id: enemy.id, x: enemy.x, y: enemy.y, race: enemy.race, type: enemy.type, movementKind: enemy.movementKind }));
const headingsOf = (room) => ({ get: (id) => room.enemies.get(id)?.body });

test("Kin dalgasi: sunucunun vurusu ve istemcinin damgasi her tikte ayni dusmanlar (izgara; ne erken ne gec)", () => {
  for (const angle of [0.3, -2.1]) {
    const { room, tower, grid } = kinRoom();
    const range = room.getTowerRange(tower);
    const enemies = placeGrid(room, tower, angle, range, 5);
    const target = enemies.find((enemy) => Math.abs(Math.hypot(enemy.x - tower.x, enemy.y - tower.y) - range / 2) < 2) ?? enemies[0];
    target.x = tower.x + Math.cos(angle) * range * 0.6;
    target.y = tower.y + Math.sin(angle) * range * 0.6;
    room.rebuildEnemyGrid();
    for (const enemy of enemies) Object.assign(enemy.body, { fromX: enemy.x, fromY: enemy.y });
    room.fireKinWave(tower, target);
    const [wave] = [...room.kinWaves.values()];
    const serverFirst = new Map();
    const clientFirst = new Map();
    const seen = views(enemies);
    const headings = headingsOf(room);
    for (let tick = 0; tick < 400 && room.kinWaves.size > 0; tick += 1) {
      const before = new Set(wave.hitEnemyIds);
      room.updateKinWaves(1 / 60);
      for (const id of wave.hitEnemyIds) if (!before.has(id)) serverFirst.set(id, tick);
      const beam = room.beams.get(`kin-wave-${wave.id}`);
      if (!beam) continue;
      for (const enemy of seen) {
        if (clientFirst.has(enemy.id)) continue;
        if (zeynep.getKinWaveHitDistance(beam, enemy, grid, headings) >= 0) clientFirst.set(enemy.id, tick);
      }
    }
    assert.ok(serverFirst.size > 50, `${serverFirst.size} vurus`);
    // Merkezi kulenin hizasinin gerisinde olup vurulanlar var (yeni izgara durumlari).
    const behind = enemies.filter((enemy) => serverFirst.has(enemy.id) && (enemy.x - tower.x) * Math.cos(angle) + (enemy.y - tower.y) * Math.sin(angle) < 0);
    assert.ok(behind.length >= 5, `kulenin gerisinden degen ${behind.length}`);
    for (const enemy of enemies) {
      assert.equal(clientFirst.get(enemy.id), serverFirst.get(enemy.id), `${enemy.id} (${enemy.race} ${enemy.type}, ${Math.hypot(enemy.x - tower.x, enemy.y - tower.y).toFixed(1)} birim): istemci ${clientFirst.get(enemy.id)} / sunucu ${serverFirst.get(enemy.id)}. tik`);
    }
  }
});

test("Kin dalgasi: on kenara yakin, eksenin yanindaki dusman (eski istemci sektoru on kenarda kesip gec damgaliyordu) ayni tikte", () => {
  // Turun ikinci dogrulayicisinin ornegi: meka kosucusu kuleden 148,7 birimde
  // ve -20,5 derecede, on kenar merkezinin gerisinde ama govdesinin yakin
  // ucunun 0,5 otesinde. Sunucu vuruyor; eski istemci sektoru on kenarda
  // kesip o snapshot'ta damgalamiyordu. Simdi ikisi ayni yaydan.
  const a = (-20.5 * Math.PI) / 180;
  const enemy = { id: "r", x: Math.round(Math.cos(a) * 148.7 * 10) / 10, y: Math.round(Math.sin(a) * 148.7 * 10) / 10, race: "meka", type: "runner" };
  const body = createEnemyBody({ race: "meka", type: "runner" }, 34, enemy.x, enemy.y);
  const nearest = Math.min(...worldPolygon(body).map(([x, y]) => Math.hypot(x, y)));
  const front = Math.round((nearest + 0.5) * 10) / 10;
  assert.ok(front < Math.hypot(enemy.x, enemy.y) - 5, `${front}`);
  const beam = { id: "kin-wave-kw7", definitionId: "zeynep-6", x1: 0, y1: 0, x2: front, y2: 0, width: Math.round(Math.max(8, Math.tan(Math.PI / 6) * front * 2) * 10) / 10, color: 0x7f1d1d, ttlMs: 120 };
  const sector = createKinWaveSector();
  const behind = getKinWaveBandBehind(1);
  const ahead = getKinWaveBandAhead(1, 1);
  writeKinWaveSector(sector, beam.x1, beam.y1, beam.x2, beam.y2, beam.width, behind, ahead);
  assert.equal(isBodyTouchingKinWave(body, sector), true, "sunucu vurmuyor");
  assert.ok(zeynep.getKinWaveHitDistance(beam, enemy, 34) >= 0, "istemci damgalamiyor");
  // Yayin bir onceki konumunda (0,5 + 1 birim geride; dis kenar on cizginin yarisi kadar onde) ikisi de degmiyor.
  const earlier = { ...beam, x2: front - 1.5, width: Math.round(Math.max(8, Math.tan(Math.PI / 6) * (front - 1.5) * 2) * 10) / 10 };
  writeKinWaveSector(sector, earlier.x1, earlier.y1, earlier.x2, earlier.y2, earlier.width, behind, ahead);
  assert.equal(isBodyTouchingKinWave(body, sector), false, "sunucu erken");
  assert.equal(zeynep.getKinWaveHitDistance(earlier, enemy, 34), -1, "istemci erken");
});

test("Kin dalgasi: govdesi yayin tepesine kulenin hizasinin gerisinden degen dusman istemcide de damgalaniyor (uzaklik 0)", () => {
  // Turun dogrulayicisinin ornekleri (kulenin yaninda ve ustunde; hava iri).
  // Merkezleri kulenin hizasinin gerisinde (eksendeki izdusumu eksi); dalga
  // buyurken govdeleri yaya degiyor. Eskiden istemci eksi uzakligi "bantta
  // degil" sayiyordu: sunucunun vurdugu dusman damgalanmiyordu.
  let cases = 0;
  for (const [race, type, movementKind, distance, degrees] of [
    ["golem", "siege", "air", 10, -98],
    ["golem", "brute", "ground", 9, 100],
    ["golem", "grunt", "ground", 6, 95],
    ["meka", "brute", "air", 4, 160],
    ["fallen", "brute", "ground", 3, -150]
  ]) {
    const a = (degrees * Math.PI) / 180;
    const enemy = { id: `e${cases}`, x: Math.round(Math.cos(a) * distance * 10) / 10, y: Math.round(Math.sin(a) * distance * 10) / 10, race, type, movementKind };
    const body = zeynep.getReceiptEnemyBody(enemy, 34).body;
    assert.ok(enemy.x < 0, "merkez kulenin hizasinin gerisinde degil");
    // Dalga buyurken (on kenar 1'den 40'a) sunucunun ilk degdigi an.
    let first;
    for (let front = 1; front <= 40 && first === undefined; front += 0.5) {
      const beam = { id: "kin-wave-kw9", definitionId: "zeynep-6", x1: 0, y1: 0, x2: front, y2: 0, width: Math.round(Math.max(8, Math.tan(Math.PI / 6) * front * 2) * 10) / 10, color: 0x7f1d1d, ttlMs: 120 };
      const sector = createKinWaveSector();
      writeKinWaveSector(sector, beam.x1, beam.y1, beam.x2, beam.y2, beam.width, getKinWaveBandBehind(1), getKinWaveBandAhead(1, 1));
      if (isBodyTouchingKinWave(body, sector)) first = beam;
      else assert.equal(zeynep.getKinWaveHitDistance(beam, enemy, 34), -1, `${race} ${type}: istemci erken`);
    }
    if (!first) continue;
    cases += 1;
    assert.equal(zeynep.getKinWaveHitDistance(first, enemy, 34), 0, `${race} ${type} ${movementKind}: istemci damgalamiyor`);
  }
  assert.ok(cases >= 4, `${cases}`);
});

test("Kin dalgasi cizilen derinligiyle vuruyor: en arkadaki dolu yayin hemen gerisindeki govde vurulmuyor (eski 30'luk bant vururdu)", () => {
  const beam = { id: "kin-wave-kw8", definitionId: "zeynep-6", x1: 0, y1: 0, x2: 90, y2: 0, width: Math.round(Math.tan(Math.PI / 6) * 180 * 10) / 10, color: 0x7f1d1d, ttlMs: 120 };
  const sector = createKinWaveSector();
  const behind = getKinWaveBandBehind(1);
  writeKinWaveSector(sector, beam.x1, beam.y1, beam.x2, beam.y2, beam.width, behind, getKinWaveBandAhead(1, 1));
  const enemy = { id: "g", x: 0, y: 0, race: "meka", type: "grunt" };
  const body = zeynep.getReceiptEnemyBody(enemy, 34).body;
  // Yon (0, 1): dokunun x ekseni dunyanin x ekseni. Govdenin dalgaya bakan (+x) en uzak noktasi on kenarin `behind` + 0,5 / - 0,5 gerisinde.
  let far = -Infinity;
  for (let k = 0; k < body.poly.count; k += 1) far = Math.max(far, body.poly.vx[k] * body.scale);
  for (const [gap, touched] of [[0.5, false], [-0.5, true]]) {
    enemy.x = 90 - behind - gap - far;
    const moved = zeynep.getReceiptEnemyBody(enemy, 34).body;
    assert.equal(isBodyTouchingKinWave(moved, sector), touched, `dolu yaylarin ${gap} gerisi`);
    assert.equal(zeynep.getKinWaveHitDistance(beam, enemy, 34) >= 0, touched, `istemci ${gap}`);
    // Eski bant (30) ikisini de vururdu.
    const old = createKinWaveSector();
    writeKinWaveSector(old, beam.x1, beam.y1, beam.x2, beam.y2, beam.width, 30, 0);
    assert.equal(isBodyTouchingKinWave(moved, old), true);
  }
  // Sunucu ayni sayilarla: sahnenin mermi olcegi ve isinin kademesi.
  assert.equal(getProjectileSceneScale(34), 1);
});

test("Kin gosterisi: sunucunun sectigi hedefler istemcinin spot isigininkiyle ayni (izgara, cizilen ucgen)", () => {
  const { room, tower, grid } = kinRoom("zeynep-3");
  const range = room.getTowerRange(tower);
  const enemies = placeGrid(room, tower, 1.1, range, 4);
  room.rebuildEnemyGrid();
  for (const enemy of enemies) Object.assign(enemy.body, { fromX: enemy.x, fromY: enemy.y });
  const result = room.findBestKinShowcaseCone(tower);
  assert.ok(result && result.targets.length > 10, `${result?.targets.length}`);
  const beam = { x1: result.x1, y1: result.y1, x2: result.x2, y2: result.y2, width: result.width };
  const headings = headingsOf(room);
  const picked = new Set(result.targets.map((enemy) => enemy.id));
  for (const enemy of views(enemies)) {
    assert.equal(zeynep.isInKinShowcaseCone(beam, enemy, grid, headings), picked.has(enemy.id), `${enemy.id}`);
  }
  // Atis: isinin teldeki sayilari secimin ucgeni.
  room.fireZeynepSynthesisKinShowcase(tower, enemies[0]);
  const fired = [...room.beams.values()].find((entry) => entry.definitionId === "zeynep-3-kin-showcase");
  assert.ok(fired);
  const snapshot = room.getSnapshot().beams.find((entry) => entry.id === fired.id);
  for (const key of ["x1", "y1", "x2", "y2", "width"]) assert.equal(snapshot[key], fired[key], `${key} teldeki sayi`);
});
