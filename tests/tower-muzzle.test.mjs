/**
 * Namlu agzi: mermi ya da isin boyali resimdeki namlunun ucundan cikiyor.
 *
 * Kademe resmi olan kulelerde (tower-art.ts) namlu diskin kenarina uzaniyor.
 * Merkezden cikan atis namlunun ortasindan dogmus gibi gorunuyordu; Ucube 2x2
 * olunca bu bir kare kadar fark ediyordu. Motor tanimindaki
 * `attack.muzzleOffset` agzin kule izinin yari genisligine orani; agiz
 * kulenin baktigi yonde, yani kuleyle birlikte donuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { TOWER_GRID_SIZE } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function kur(definitionId) {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer bulunamadi`);
  room.placeTower(client, { ...spot, definitionId });
  const tower = [...room.towers.values()].find((entry) => entry.definition.id === definitionId);
  assert.ok(tower, `${definitionId} kurulamadi`);
  return { room, tower };
}

/** Dirensiz, olmeyecek kadar canli bir dusman; `uzaklik` kadar kulenin `aci` yonunde. */
function dusman(room, tower, aci, uzaklik) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    x: tower.x + Math.cos(aci) * uzaklik, y: tower.y + Math.sin(aci) * uzaklik,
    hp: 1_000_000, maxHp: 1_000_000, shield: 0, maxShield: 0, armor: 0,
    damageResistances: {}, hitTypeResistances: {}, statusResistances: {}
  });
  return enemy;
}

function ates(room, tower, enemy) {
  const before = new Set(room.projectiles.keys());
  room.spawnTowerProjectile(tower, enemy);
  const projectile = [...room.projectiles.values()].find((entry) => !before.has(entry.id));
  assert.ok(projectile, "mermi cikmadi");
  return projectile;
}

const yakin = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);

test("Ucube'nin mermisi top agzindan cikiyor ve agiz kuleyle donuyor; Takipci merkezden atiyor", () => {
  const { room, tower } = kur("warrior-6");
  const agiz = room.scaleWorldDistance(TOWER_GRID_SIZE * 0.97);
  for (const aci of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
    tower.facing = aci;
    const projectile = ates(room, tower, dusman(room, tower, aci, 200));
    yakin(projectile.x, tower.x + Math.cos(aci) * agiz, `aci ${aci} x`);
    yakin(projectile.y, tower.y + Math.sin(aci) * agiz, `aci ${aci} y`);
  }

  const takipci = kur("warrior-1");
  takipci.tower.facing = 0;
  const projectile = ates(takipci.room, takipci.tower, dusman(takipci.room, takipci.tower, 0, 200));
  assert.equal(projectile.x, takipci.tower.x);
  assert.equal(projectile.y, takipci.tower.y);
});

test("Obsesyon (1x1) mercek namlusunun ucundan atiyor: agiz yarim kare ileride", () => {
  const { room, tower } = kur("warrior-4");
  const agiz = room.scaleWorldDistance(TOWER_GRID_SIZE / 2 * 0.97);
  tower.facing = Math.PI / 4;
  const projectile = ates(room, tower, dusman(room, tower, Math.PI / 4, 200));
  yakin(Math.hypot(projectile.x - tower.x, projectile.y - tower.y), agiz, "uzaklik");
  yakin(Math.atan2(projectile.y - tower.y, projectile.x - tower.x), Math.PI / 4, "yon");
});

test("namludan yakin dusman (kulenin ustundeki hava hedefi) iskalanmiyor", () => {
  const { room, tower } = kur("warrior-6");
  tower.facing = 0;
  const enemy = dusman(room, tower, 0, 8);
  const projectile = ates(room, tower, enemy);
  // Agiz hedefin on yuzunde kesiliyor: mermi dusmanin arkasinda dogmuyor.
  assert.ok(projectile.x <= enemy.x, "mermi hedefin arkasinda dogdu");
  room.enemySpatialGrid.rebuild(room.enemies.values());
  room.updateProjectiles(0.05);
  assert.ok(enemy.hp < enemy.maxHp, "yakin hedef vurulmadi");
});

test("Debug Lazer'in isini nozulun ucundan cikiyor; asiri yuklemenin kirisleri prizmadan", () => {
  const { room, tower } = kur("warrior-5");
  const nozul = room.scaleWorldDistance(TOWER_GRID_SIZE / 2 * 0.89);
  tower.facing = Math.PI / 2;
  const enemy = dusman(room, tower, Math.PI / 2, 100);
  room.fireDebugLaser(tower, enemy);
  const beam = room.beams.get(`beam-${tower.id}`);
  assert.ok(beam, "isin cizilmedi");
  yakin(beam.x1, tower.x, "isin x1");
  yakin(beam.y1, tower.y + nozul, "isin y1");
  // Ucu yine hedefte; hasar hedefe uygulandi.
  assert.equal(beam.x2, enemy.x);
  assert.equal(beam.y2, enemy.y);
  assert.ok(enemy.hp < enemy.maxHp, "hedef vurulmadi");

  // Asiri yukleme: namlu kirisle donmuyor, kirisler kule merkezindeki prizmadan.
  room.startDebugLaserOverdrive(tower, enemy, Date.now());
  const sweep = room.beams.get(`beam-${tower.id}`);
  assert.equal(sweep.overdrive, true);
  assert.equal(sweep.x1, tower.x);
  assert.equal(sweep.y1, tower.y);
});
