import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const capacities = [20, 65, 110, 155, 200];
const rates = [0.5, 1, 1.75, 3, 5];
const client = { sessionId: "p1", send() {} };

function setup(characterId, definitionId) {
  const room = createRoom(characterId);
  room.state.players.get("p1").experience = 1_000_000;
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot);
  room.placeTower(client, { ...spot, definitionId });
  const tower = [...room.towers.values()][0];
  assert.ok(tower);
  return { room, tower };
}

for (const [character, id] of [["warrior", "warrior-7"], ["warrior", "warrior-8"], ["zeynep", "zeynep-9"], ["zeynep", "zeynep-10"]]) {
  test(`${id}: capacity, health, production and paid level cap`, () => {
    const { room, tower } = setup(character, id);
    const baseHp = tower.maxHp;
    tower.hp /= 2;
    for (let level = 1; level <= 5; level++) {
      assert.equal(tower.level, level);
      assert.equal(tower.maxEnergy, capacities[level - 1]);
      assert.equal(tower.maxHp, baseHp * (1 + (level - 1) / 4));
      assert.equal(tower.hp, tower.maxHp / 2);
      if (tower.definition.resourceProvider === "ammunition") {
        assert.equal(tower.maxAmmo, capacities[level - 1]);
        assert.equal(tower.maxRawAmmo, capacities[level - 1]);
        tower.ammo = 0;
        tower.energy = 20;
        tower.rawAmmo = 20;
        tower.materials = { gunpowder: 20 };
        tower.ammoStock = {};
        room.updateResourceFactories(1);
        assert.equal(tower.ammo, rates[level - 1]);
        tower.ammo = tower.maxAmmo - 0.1;
        tower.ammoStock = { bullet: tower.ammo };
        room.updateResourceFactories(1);
        assert.equal(tower.ammo, tower.maxAmmo);
      }
      const stock = [tower.ammo, tower.energy, tower.rawAmmo];
      if (level < 5) room.upgradeTower(client, { towerId: tower.id });
      assert.deepEqual([tower.ammo, tower.energy, tower.rawAmmo], stock);
    }
    const player = room.state.players.get("p1");
    const wallet = [player.gold, player.experience];
    room.upgradeTower(client, { towerId: tower.id });
    assert.equal(tower.level, 5);
    assert.deepEqual([player.gold, player.experience], wallet);
  });

  test(`${id}: creative level cap and downgrade clamp stocks`, () => {
    const { room, tower } = setup(character, id);
    const baseHp = tower.maxHp;
    room.getCreativePlayer = () => room.state.players.get("p1");
    room.sendCreativeLoadout = () => {};
    room.creativeSetTowerLevel(client, { towerId: tower.id, level: 10 });
    assert.equal(tower.level, 5);
    assert.equal(tower.maxHp, baseHp * 2);
    assert.equal(tower.maxEnergy, 200);
    tower.energy = 200;
    if (tower.definition.resourceProvider === "ammunition") tower.ammo = tower.rawAmmo = 200;
    room.creativeSetTowerLevel(client, { towerId: tower.id, level: 1 });
    assert.equal(tower.maxHp, baseHp);
    assert.equal(tower.energy, 20);
    if (tower.definition.resourceProvider === "ammunition") {
      assert.equal(tower.ammo, 20);
      assert.equal(tower.rawAmmo, 20);
    }
  });
}
