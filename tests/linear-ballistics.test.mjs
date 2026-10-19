import test from "node:test";
import assert from "node:assert/strict";
import { createEnemyBodyPolygon, getBallisticMovementSpeed, getProjectileBodyContact, usesLinearBallistics } from "../packages/shared/dist/index.js";
import { createProjectileDiscShape } from "./helpers/body-shapes.mjs";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

// Carpisma artik vurus tipine bagli bir yaricaptan (eskiden mermi 4, carpma 8,
// dalga 4) degil, merminin cizilen govdesinden (projectile-body) ve dusmanin
// yonlu gorunen govdesinden (enemy-body): o testler tests/visible-hitbox ve
// tests/projectile-body'de, cizimle olculerek. Burada yolun sirasi.
// Disk mermi (yaricap 2, kuyrugu diskin kendisi).
const POINT = createProjectileDiscShape(2);
/** Daireye yakin govde: 24 koseli duzgun cokgen (yari kenar = yaricap); sira testleri icin. */
const ROUND = createEnemyBodyPolygon(Array.from({ length: 24 }, (_, i) => [Math.cos((i / 24) * Math.PI * 2), Math.sin((i / 24) * Math.PI * 2)]).flat());
const circle = (x, y, radius) => ({ x, y, headingX: 0, headingY: 1, fromX: x, fromY: y, scale: radius, reach: radius * ROUND.radius, poly: ROUND });
// Mermi coktan ucmus (kuyrugu cizildigi kadar).
const contact = (body) => getProjectileBodyContact(0, 0, 1, 0, 100, POINT, 1000, body);

test("impact, wave ve projectile hareket hızları tekrar mevcut hızın üçte ikisine iner", () => {
  assert.ok(Math.abs(getBallisticMovementSpeed(340, "projectile") - 680 / 9) < 0.0001);
  assert.equal(getBallisticMovementSpeed(360, "wave"), 80);
  assert.ok(Math.abs(getBallisticMovementSpeed(520, "impact") - 1040 / 9) < 0.0001);
  assert.equal(getBallisticMovementSpeed(340, "focus"), 340);
});

test("impact wave ve projectile doğrusal balistik kullanır", () => {
  assert.equal(usesLinearBallistics("impact"), true);
  assert.equal(usesLinearBallistics("wave"), true);
  assert.equal(usesLinearBallistics("projectile"), true);
  assert.equal(usesLinearBallistics("focus"), false);
});

test("mermi hattın dışındaki hedefi ıskalar", () => {
  assert.equal(contact(circle(50, 20, 5)), -1);
});

test("mermi isimden bağımsız olarak yolundaki ilk düşmana çarpar", () => {
  const original = contact(circle(90, 0, 5));
  const interceptor = contact(circle(35, 1, 5));
  assert.ok(interceptor >= 0 && original >= 0 && interceptor < original, `${interceptor} / ${original}`);
});

test("delinen düşman sonraki taramada tekrar vurulmaz", () => {
  // Sunucunun taramasi: delinen dusman (`piercedEnemyIds`) atlaniyor, mermi
  // yolundaki ikinciye gidiyor ve ilkine bir daha degmiyor.
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1", send() {} }, { ...spot, definitionId: "warrior-1" });
  const tower = [...room.towers.values()].at(-1);
  const bounds = room.getActiveWorldBounds();
  const y = bounds.top + (bounds.bottom - bounds.top) * 0.3;
  const x = (bounds.left + bounds.right) / 2;
  const place = (offset) => {
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    Object.assign(enemy, { x: x + offset, y, hp: 1e9, maxHp: 1e9, shield: 0, armor: 0, speed: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, movementKind: "ground" });
    // Yon olcumunun son konumu burasi: izgara kurulurken govde donmuyor.
    enemy.body.fromX = enemy.x;
    enemy.body.fromY = enemy.y;
    return enemy;
  };
  const first = place(0);
  const second = place(60);
  const hits = [];
  const apply = room.applyProjectileHit.bind(room);
  room.applyProjectileHit = (projectile, enemy, ...rest) => { hits.push(enemy.id); return apply(projectile, enemy, ...rest); };
  room.projectiles.set("pp", {
    id: "pp", towerId: tower.id, definitionId: "zeynep-1", kind: "tower", damageType: "physical", hitType: "projectile", source: "tower",
    targetId: "", x: x - 60, y, vx: 120, vy: 0, damage: 1, maxHealthDamageRatio: 0, aoeRadius: 0, slowMs: 0,
    pierceLimit: 3, armorBreakAmount: 0, piercedEnemyIds: [], tier: 1, flown: 1000
  });
  for (let tick = 0; tick < 180 && room.projectiles.has("pp"); tick += 1) {
    room.rebuildEnemyGrid();
    room.updateProjectiles(1 / 60);
  }
  assert.deepEqual(hits, [first.id, second.id]);
});

test("ilk temas en yakın geçişe göre değil, gövdeye ilk değme anına göre sıralanıyor", () => {
  // Eski tarama en yakin gecisin anina gore siraliyordu: yolun ortasinda ama
  // yana yakin duran govde, yolun hemen onundekinin onune geciyordu. Ilk
  // degme aninda iri govde once, cunku kenari yola daha erken giriyor.
  const small = contact(circle(30, 0, 1));
  const large = contact(circle(33, 5, 10));
  assert.ok(large >= 0 && small >= 0 && large < small, `${large} / ${small}`);
});
