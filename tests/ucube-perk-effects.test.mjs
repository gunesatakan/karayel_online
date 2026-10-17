/**
 * Ucube'nin sekiz seviye seciminin her biri aciklamasinda yazdigini yapiyor mu.
 *
 * tests/ucube-perks.test.mjs secim akisini (hangi seviyede, hangi secenek,
 * kule basina) kilitliyor; burasi etkilerin kendisini: her ozellik icin bir
 * oda kuruluyor, Ucube o ozellikle (ve ayni kademenin oteki secenegiyle
 * karsilastirmali) yukseltiliyor ve aciklamadaki sayi olculuyor. Istemcinin
 * gordugu taraf da burada: anlik goruntu (menzil, can, yigin tavani, ozellik
 * listesi) ve zincirin isini.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getUcubePerkTier, gridToWorld, worldToGrid } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const client = { sessionId: "p1", send() {} };

/**
 * `level` seviyesinde bir Ucube; secimler `picks`ten (seviye -> ozellik),
 * yazilmayan kademede ilk secenek.
 */
function ucube(level, picks = {}) {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  room.lastSnapshotBroadcastAt = Infinity;
  room.lastPerfBroadcastAt = Infinity;
  const spot = findBuildableSpot(room, "warrior-6");
  room.placeTower(client, { ...spot, definitionId: "warrior-6" });
  const tower = [...room.towers.values()].find((entry) => entry.definition.id === "warrior-6");
  const player = room.state.players.get("p1");
  player.experience = 10_000_000;
  player.gold = 10_000_000;
  while (tower.level < level) {
    room.upgradeTower(client, { towerId: tower.id });
    if (tower.ucubePendingLevel > 0) {
      const pending = tower.ucubePendingLevel;
      room.chooseUcubePerk(client, { towerId: tower.id, perkId: picks[pending] ?? getUcubePerkTier(pending).options[0].id });
    }
  }
  return { room, tower };
}

function spawnAt(room, x, y) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x, y, hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, armor: 0 });
  return enemy;
}

/** Kuleden gercek bir mermi: hasari ve kimligi `spawnTowerProjectile`dan. */
function fire(room, tower, target) {
  const before = new Set(room.projectiles.keys());
  room.spawnTowerProjectile(tower, target);
  return [...room.projectiles.values()].find((projectile) => !before.has(projectile.id));
}

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6 * Math.max(1, Math.abs(expected)), `${message}: ${actual} != ${expected}`);

/** Hedefte duran, ates edebilen kule: yiginin ritmi `seconds` boyunca. */
function runRhythm(room, tower, seconds) {
  const enemy = spawnAt(room, tower.x + 30, tower.y);
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 50) {
    tower.ammo = tower.maxAmmo;
    tower.energy = tower.maxEnergy;
    tower.heatLocked = false;
    tower.temperature = 0;
    room.updateUcubeRhythm(tower, enemy, 50);
  }
  return enemy;
}

/* ------------------------------------------------------------------ */
/* Seviye 4: Zincir / Geri Itme                                         */
/* ------------------------------------------------------------------ */

test("Zincir: vurulan hedefin yakinindaki iki dusmana sicriyor, uzaktakine degil; sicrama hasari seviyeyle buyuyor", () => {
  const chainDamage = (level) => {
    const { room, tower } = ucube(level, { 4: "chain" });
    const target = spawnAt(room, tower.x + 40, tower.y);
    const near1 = spawnAt(room, target.x + 20, target.y);
    const near2 = spawnAt(room, target.x, target.y + 25);
    const far = spawnAt(room, target.x + 400, target.y + 400);
    const projectile = fire(room, tower, target);
    room.applyPostHitEffects(projectile, target);
    const lost = (enemy) => 1e9 - enemy.hp;
    assert.ok(lost(near1) > 0 && lost(near2) > 0, "yakindaki dusmanlara sicramadi");
    assert.equal(lost(far), 0, "uzaktaki dusmana sicradi");
    const beams = [...room.beams.values()].filter((beam) => beam.definitionId === "warrior-6" && beam.id.startsWith("chain-"));
    assert.equal(beams.length, 2, "zincirin isini (istemcinin cizdigi) yok");
    return lost(near1) / projectile.damage;
  };
  const at4 = chainDamage(4);
  const at10 = chainDamage(10);
  assert.ok(at4 > 0.3 && at4 < 0.6, `seviye 4 sicrama orani ${at4}`);
  assert.ok(at10 > at4 * 1.5, `sicrama hasari seviyeyle buyumuyor: ${at4} -> ${at10}`);
});

test("Zincir secilmeyen Ucube sicramiyor", () => {
  const { room, tower } = ucube(4, { 4: "pushback" });
  const target = spawnAt(room, tower.x + 40, tower.y);
  const other = spawnAt(room, target.x + 20, target.y);
  room.applyPostHitEffects(fire(room, tower, target), target);
  assert.equal(other.hp, 1e9);
});

test("Geri Itme: vurulan dusman yolda gercekten geri gidiyor (konumu, yalniz sayaci degil)", () => {
  const { room, tower } = ucube(4, { 4: "pushback" });
  const target = spawnAt(room, tower.x, tower.y + 80);
  // Asagi yuruyor (nexusa dogru): itme yukari, geldigi yere.
  target.moveVx = 0;
  target.moveVy = 30;
  const before = { x: target.x, y: target.y, pathDistance: target.pathDistance };
  room.applyPostHitEffects(fire(room, tower, target), target);
  const push = room.scaleWorldDistance(18);
  assert.ok(Math.abs(target.x - before.x) < 1e-6, `yana kaydi: ${target.x - before.x}`);
  assert.ok(Math.abs(before.y - target.y - push) < 1e-6, `konum geri gitmedi: ${before.y} -> ${target.y}`);
  assert.ok(target.pathDistance < before.pathDistance || before.pathDistance === 0, "yol sayaci geri gitmedi");

  // Duran (yuruyus hizi olmayan) dusman kuleden disa itiliyor.
  const still = spawnAt(room, tower.x + 50, tower.y);
  still.moveVx = 0;
  still.moveVy = 0;
  const stillX = still.x;
  room.applyPostHitEffects(fire(room, tower, still), still);
  assert.ok(still.x > stillX, "duran dusman itilmedi");
});

test("Geri Itme dusmani kulenin icine ya da harita disina atmiyor", () => {
  const { room, tower } = ucube(4, { 4: "pushback" });
  const cells = room.getTowerFootprintCells(tower.x, tower.y, tower.definition.id, tower.orientation);
  const bottom = Math.max(...cells.map((cell) => cell.row));
  // Kulenin hemen altindaki karenin ust kenarinda, kuleye dogru geri itilecek.
  const below = gridToWorld(cells[0].col, bottom + 1, room.activeMap);
  const half = room.getMapCellRadius();
  const target = spawnAt(room, below.x, below.y - half * 0.7);
  target.moveVx = 0;
  target.moveVy = 30;
  room.applyPostHitEffects(fire(room, tower, target), target);
  const cell = worldToGrid(target.x, target.y, room.activeMap);
  assert.ok(!cells.some((entry) => entry.col === cell.col && entry.row === cell.row), `kulenin icine itildi (${cell.col}:${cell.row})`);

  // Haritanin ust kenarinda: disari atilmiyor.
  const top = spawnAt(room, below.x, room.getActiveWorldBounds().top + 2);
  top.moveVx = 0;
  top.moveVy = 30;
  room.applyPostHitEffects(fire(room, tower, top), top);
  assert.ok(top.y >= room.getActiveWorldBounds().top, `harita disina itildi: ${top.y}`);
});

test("Geri Itme secilmeyen Ucube dusmani itmiyor", () => {
  const { room, tower } = ucube(4, { 4: "chain" });
  const target = spawnAt(room, tower.x, tower.y + 40);
  target.moveVy = 30;
  const y = target.y;
  room.applyPostHitEffects(fire(room, tower, target), target);
  assert.equal(target.y, y);
});

/* ------------------------------------------------------------------ */
/* Seviye 6: Kalibrasyon / Genis Sarj                                   */
/* ------------------------------------------------------------------ */

test("Kalibrasyon: hasar %20 artiyor (mermide de)", () => {
  const withPerk = ucube(6, { 6: "damage-step" });
  const without = ucube(6, { 6: "stacks-15" });
  near(withPerk.room.getTowerDamage(withPerk.tower) / without.room.getTowerDamage(without.tower), 1.2, "hasar orani");
  const a = fire(withPerk.room, withPerk.tower, spawnAt(withPerk.room, withPerk.tower.x + 40, withPerk.tower.y));
  const b = fire(without.room, without.tower, spawnAt(without.room, without.tower.x + 40, without.tower.y));
  near(a.damage / b.damage, 1.2, "mermi hasari orani");
});

test("Genis Sarj: atis hizi yigini 15'e kadar cikiyor ve araligi kisaltmaya devam ediyor; istemci tavani goruyor", () => {
  const capped = ucube(8, { 6: "damage-step", 8: "endurance" });
  const wide = ucube(8, { 6: "stacks-15", 8: "endurance" });
  runRhythm(capped.room, capped.tower, 18);
  runRhythm(wide.room, wide.tower, 18);
  assert.equal(capped.tower.focusStacks, 10, "varsayilan tavan 10 olmali");
  assert.equal(wide.tower.focusStacks, 15, "Genis Sarj tavani 15 degil");
  assert.ok(wide.room.getTowerFireInterval(wide.tower) < capped.room.getTowerFireInterval(capped.tower) * 0.85, "ek yigin atis araligini kisaltmiyor");
  assert.equal(wide.room.getAtakanStackWire(wide.tower).m, 15, "istemcinin yigin gostergesine tavan gitmiyor");
});

/* ------------------------------------------------------------------ */
/* Seviye 8: Genis Govde / Sogukkanlilik                                */
/* ------------------------------------------------------------------ */

test("Genis Govde: menzil ve azami can iki katina cikiyor, can doluyor; sonraki seviyelerde de korunuyor", () => {
  for (const level of [8, 10]) {
    const hull = ucube(level, { 8: "range-hull" });
    const plain = ucube(level, { 8: "endurance" });
    near(hull.room.getTowerRange(hull.tower) / plain.room.getTowerRange(plain.tower), 2, `seviye ${level} menzil orani`);
    near(hull.tower.maxHp / plain.tower.maxHp, 2, `seviye ${level} can orani`);
    assert.equal(hull.tower.hp, hull.tower.maxHp, "can dolmadi");
    const snapshot = hull.room.getSnapshot().towers.find((entry) => entry.id === hull.tower.id);
    assert.ok(Math.abs(snapshot.range - hull.room.getTowerRange(hull.tower)) < 0.6, "istemcinin menzil halkasi buyumuyor");
    assert.deepEqual(snapshot.ucubePerks.includes("range-hull"), true);
  }
});

test("Sogukkanlilik: 20 sn'lik zorunlu kapanma kalkiyor; seviye 8'de x1.5, 10'da x1.3 hasar", () => {
  const calm = ucube(8, { 8: "endurance" });
  const hull = ucube(8, { 8: "range-hull" });
  runRhythm(calm.room, calm.tower, 25);
  runRhythm(hull.room, hull.tower, 25);
  assert.equal(hull.tower.overheatMs > 0, true, "Sogukkanlilik olmadan 20 sn'de kapanmali (kontrol)");
  assert.equal(calm.tower.overheatMs, 0, "Sogukkanlilik kapanmayi kaldirmadi");
  assert.equal(calm.tower.focusStacks, 10, "yigin dusmemeli");

  near(ucube(8, { 8: "endurance" }).room.getTowerDamage(ucube(8, { 8: "endurance" }).tower) / ucube(8, { 8: "range-hull" }).room.getTowerDamage(ucube(8, { 8: "range-hull" }).tower), 1.5, "seviye 8 hasar");
  const at10 = ucube(10, { 8: "endurance", 10: "stacks-20" });
  const ref10 = ucube(10, { 8: "range-hull", 10: "stacks-20" });
  near(at10.room.getTowerDamage(at10.tower) / ref10.room.getTowerDamage(ref10.tower), 1.3, "seviye 10 hasar");
});

/* ------------------------------------------------------------------ */
/* Seviye 10: Asiri Yuk / Derin Sarj                                    */
/* ------------------------------------------------------------------ */

test("Asiri Yuk: hasar iki katina cikiyor (mermide de)", () => {
  const over = ucube(10, { 10: "damage-double" });
  const deep = ucube(10, { 10: "stacks-20" });
  near(over.room.getTowerDamage(over.tower) / deep.room.getTowerDamage(deep.tower), 2, "hasar orani");
  const a = fire(over.room, over.tower, spawnAt(over.room, over.tower.x + 40, over.tower.y));
  const b = fire(deep.room, deep.tower, spawnAt(deep.room, deep.tower.x + 40, deep.tower.y));
  near(a.damage / b.damage, 2, "mermi hasari orani");
});

test("Derin Sarj: yigin tavani 20; 15'lik tavanla birlikte de 20", () => {
  for (const picks of [{ 6: "damage-step", 8: "endurance", 10: "stacks-20" }, { 6: "stacks-15", 8: "endurance", 10: "stacks-20" }]) {
    const { room, tower } = ucube(10, picks);
    runRhythm(room, tower, 24);
    assert.equal(tower.focusStacks, 20, `tavan ${tower.focusStacks}`);
    assert.equal(room.getAtakanStackWire(tower).m, 20);
  }
  const plain = ucube(10, { 6: "damage-step", 8: "endurance", 10: "damage-double" });
  runRhythm(plain.room, plain.tower, 24);
  assert.equal(plain.tower.focusStacks, 10);
});

/* ------------------------------------------------------------------ */
/* Istemci                                                              */
/* ------------------------------------------------------------------ */

const { BeamRenderer } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");
const { VfxLod } = await importWebModule("apps/web/src/vfx/lod.ts");

test("istemci zincirin isinini ciziyor; seviye 5 ve 10'da ton mermiyle birlikte degisiyor", () => {
  const colors = [1, 2, 3].map((tier) => {
    const recorder = createRecorder();
    new BeamRenderer(recorder, createRecorder(), new VfxLod()).render([
      { id: "chain-p1-1", definitionId: "warrior-6", tier: tier === 1 ? undefined : tier, x1: 40, y1: 40, x2: 120, y2: 70, width: 5, color: 0xadf765, ttlMs: 190 }
    ], { now: 300, sceneNow: 300, scale: 1 });
    const strokes = recorder.calls.filter(([name]) => name === "lineStyle" || name === "fillStyle");
    assert.ok(strokes.length > 0, `kademe ${tier}: zincir cizilmiyor`);
    return strokes[0][2] ?? strokes[0][1];
  });
  assert.equal(new Set(colors).size, 3, `zincir tonu kademeyle degismiyor: ${colors.map((color) => color.toString(16))}`);
});
