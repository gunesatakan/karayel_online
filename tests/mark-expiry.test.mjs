/**
 * Takip isareti yalnizca suresi dolunca kalkiyor.
 *
 * Ortak kule motoruna geciste Debug Lazer'in her vurusu isaretten bir yigin
 * siliyordu (`consumesMarks`). Kural hic oyle degildi: hicbir kulenin vurusu
 * isaret tuketmez. Tuketme yuzunden lazer isaretli bir dusmani birkac vurusta
 * oldururken son vurusa varmadan isareti siliyor ve asiri yukleme acilmiyordu.
 * Debug Lazer isaretli bir dusmana son vurusu yaparsa asiri yuklemeye giriyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function setup(definitionId, level = 1) {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.placeTower(client, { ...findBuildableSpot(room, definitionId), definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower.definition.id, definitionId);
  tower.level = level;
  tower.ammo = tower.maxAmmo;
  tower.energy = tower.maxEnergy;
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    x: tower.x + 40, y: tower.y, hp: 1_000_000, maxHp: 1_000_000, shield: 0, maxShield: 0, armor: 0,
    damageResistances: {}, hitTypeResistances: {}, statusResistances: {}
  });
  return { room, tower, enemy };
}

test("hiçbir kulenin vuruşu işareti tüketmez; işaret yalnızca süresi bitince kalkar", () => {
  for (const definitionId of ["warrior-1", "warrior-4", "warrior-5", "warrior-6"]) {
    const { room, tower, enemy } = setup(definitionId);
    const now = Date.now();
    room.applyTrackingStacks(enemy, now + 5000, 3);
    for (let shot = 0; shot < 5; shot += 1) {
      if (definitionId === "warrior-5") {
        room.fireDebugLaser(tower, enemy);
      } else {
        room.damageEnemy(enemy, 1, 0, definitionId, tower.ownerId, tower.definition.damageType, 0, tower.level, tower.id, tower.definition.hitType);
        room.applyPostHitEffects({ towerId: tower.id, definitionId, damageType: tower.definition.damageType, hitType: tower.definition.hitType, maxHealthDamageRatio: 0, luck: undefined }, enemy);
      }
    }
    assert.ok(room.enemies.has(enemy.id), `${definitionId}: dusman oldu, test bir sey olcmez`);
    assert.equal(room.getTrackingStackCount(enemy, now), 3, `${definitionId} vurusu isaret tuketti`);
    // Takipci'nin vurusu isareti kendisi yeniden koyuyor (6,5 sn); digerleri dokunmuyor.
    const expiry = definitionId === "warrior-1" ? now + 60_000 : now + 5001;
    assert.equal(room.getTrackingStackCount(enemy, expiry), 0, `${definitionId}: isaret suresi dolunca kalkmadi`);
  }
});

test("Debug Lazer işaretli düşmana birkaç vuruştan sonra son vuruşu yapınca overdrive'a girer", () => {
  const { room, tower, enemy } = setup("warrior-5", 5);
  const now = Date.now();
  room.applyTrackingStacks(enemy, now + 5000, 1);
  const hit = room.getTowerDamage(tower);
  // Birkac vurusta olecek kadar can: tuketme olsaydi ilk vurus isareti silerdi.
  enemy.hp = hit * 4.5;
  enemy.maxHp = enemy.hp;
  let shots = 0;
  while (room.enemies.has(enemy.id) && shots < 50) {
    room.fireDebugLaser(tower, enemy);
    shots += 1;
  }
  assert.equal(room.enemies.has(enemy.id), false, "dusman olmedi");
  assert.ok(shots >= 3, `tek vurusta oldu (${shots}), test bir sey olcmez`);
  assert.ok(tower.debugOverdriveUntil > now, "son vurus isaretliydi ama asiri yukleme acilmadi");
});
