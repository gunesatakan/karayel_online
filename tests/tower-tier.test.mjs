import assert from "node:assert/strict";
import test from "node:test";
import { getTowerTier, TOWER_TIER_2_LEVEL, TOWER_TIER_3_LEVEL } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { getCharacterTowers } from "../packages/shared/dist/index.js";

/**
 * Gorsel kademe sunucu ile istemci arasinda bir sozlesme: sunucu mermiye hangi
 * kademeyi yazacagini, istemci hangi dokuyu ve efekt buyuklugunu secegini ayni
 * fonksiyondan okur. Ayrilirlarsa seviye atlayan kule yanlis mermiyi atar --
 * gozle fark edilmesi zor, cunku mermi yine cizilir, sadece yanlis olani.
 */

test("kademe esikleri on seviyeyi uce boler", () => {
  assert.equal(getTowerTier(1), 1);
  assert.equal(getTowerTier(4), 1);
  assert.equal(getTowerTier(TOWER_TIER_2_LEVEL), 2);
  assert.equal(getTowerTier(9), 2);
  assert.equal(getTowerTier(TOWER_TIER_3_LEVEL), 3);
});

test("kademe monotoniktir: seviye atlamak kademeyi dusurmez", () => {
  let previous = 0;
  for (let level = 1; level <= 10; level += 1) {
    const tier = getTowerTier(level);
    assert.ok(tier >= previous, `seviye ${level} kademeyi dusurdu`);
    previous = tier;
  }
});

test("aralik disi seviyeler guvenli araliga sikisir", () => {
  assert.equal(getTowerTier(0), 1);
  assert.equal(getTowerTier(-5), 1);
  assert.equal(getTowerTier(99), 3);
});

function buildRoomWithTower(level) {
  const room = createRoom("warrior");
  const definition = getCharacterTowers("warrior").find((tower) => !tower.resourceProvider && tower.damage > 0);
  const spot = findBuildableSpot(room, definition.id);
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: definition.id });
  const tower = [...room.towers.values()][0];
  tower.level = level;
  return { room, tower };
}

function addProjectile(room, tower, { id, hitType }) {
  const projectile = {
    id,
    kind: "arrow",
    source: "tower",
    definitionId: tower.definition.id,
    hitType,
    towerId: tower.id,
    x: tower.x,
    y: tower.y,
    vx: 10,
    vy: 0
  };
  room.projectiles.set(id, projectile);
  return projectile;
}

test("snapshot mermisi atisi yapan kulenin kademesini tasir", () => {
  // `focus` balistik degildir, yani snapshot dizisine girer.
  for (const [level, expected] of [[1, undefined], [4, undefined], [5, 2], [9, 2], [10, 3]]) {
    const { room, tower } = buildRoomWithTower(level);
    addProjectile(room, tower, { id: "p1", hitType: "focus" });
    const sent = room.getSnapshot().projectiles.find((projectile) => projectile.id === "p1");
    assert.ok(sent, `seviye ${level}: mermi snapshot'a girmedi`);
    // Kademe 1 yazilmaz: telde varsayilan odur.
    assert.equal(sent.tier, expected, `seviye ${level} yanlis kademe`);
  }
});

test("balistik merminin spawn ve hit mesajlari da kademeyi tasir", () => {
  for (const [level, expected] of [[1, undefined], [5, 2], [10, 3]]) {
    const { room, tower } = buildRoomWithTower(level);
    const messages = {};
    room.broadcast = (type, payload) => { messages[type] = payload; };
    const projectile = addProjectile(room, tower, { id: "p2", hitType: "projectile" });

    room.broadcastProjectileSpawn(projectile);
    room.removeProjectile(projectile.id, projectile);

    assert.equal(messages["projectile:spawn"]?.tier, expected, `seviye ${level} spawn kademesi`);
    assert.equal(messages["projectile:hit"]?.tier, expected, `seviye ${level} hit kademesi`);
  }
});

test("kulesi yok olmus mermi kademesiz kalir, hata vermez", () => {
  const { room, tower } = buildRoomWithTower(10);
  const projectile = addProjectile(room, tower, { id: "p3", hitType: "focus" });
  // Kule satildi ya da yikildi; mermi havada.
  projectile.towerId = "artik-yok";

  const sent = room.getSnapshot().projectiles.find((candidate) => candidate.id === "p3");
  assert.ok(sent);
  assert.equal(sent.tier, undefined);
});
