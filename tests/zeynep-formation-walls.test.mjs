/**
 * Duvar ve Zeynep dizilimi.
 *
 * Dizilim bonusu grubun buyuklugune bakiyor: iki veya uc kule bir arada durunca
 * calisiyor, dordunculer birlesince dusuyor. Duvar bir kule degil -- kontenjandan
 * yer kapmaz, hedef secmez, hasar vermez -- ama komsulukta durdugu icin gruba
 * katiliyor ve ucluyu dorde cikarip bonusu tumden dusurebiliyordu.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { WALL_TOWER_ID, getMapGridSize, towerCatalog } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

/** Yan yana duran iki Zeynep kulesi ve aralarindaki kenara oturan bir duvar. */
function buildPair() {
  const room = createRoom("zeynep");
  const gridSize = getMapGridSize(room.activeMap);
  const definition = towerCatalog.zeynep.find((tower) => tower.id === "zeynep-1");
  const first = findBuildableSpot(room, definition.id);
  assert.ok(first, "ilk kule icin yer bulunamadi");

  room.placeTower(client, { x: first.x, y: first.y, definitionId: definition.id });
  const second = { x: first.x + gridSize, y: first.y };
  room.placeTower(client, { x: second.x, y: second.y, definitionId: definition.id });

  const towers = [...room.towers.values()];
  assert.equal(towers.length, 2, "iki kule kurulamadi");
  return { room, gridSize, towers, first, second };
}

function formationSizes(room) {
  room.refreshZeynepFormations();
  return [...room.towers.values()]
    .filter((tower) => tower.definition.id !== WALL_TOWER_ID)
    .map((tower) => tower.zeynepFormationSize);
}

test("iki kule dizilim olusturur", () => {
  const { room } = buildPair();
  assert.deepEqual(formationSizes(room), [2, 2]);
});

test("kulelerin arasindaki duvar dizilimi bozmaz", () => {
  const { room, gridSize, first } = buildPair();
  const oncekiBoyutlar = formationSizes(room);

  // Iki kulenin tam ortasindaki dikey kenar: duvarin komsuluk testinden gecmesi
  // icin mumkun olan en yakin yer.
  const wallX = first.x + gridSize / 2;
  room.placeTower(client, { x: wallX, y: first.y, definitionId: WALL_TOWER_ID });
  const wall = [...room.towers.values()].find((tower) => tower.definition.id === WALL_TOWER_ID);
  assert.ok(wall, "duvar kurulamadi");

  assert.deepEqual(formationSizes(room), oncekiBoyutlar, "duvar dizilim boyutunu degistirdi");
});

test("duvar dizilim grubuna uye olarak girmez", () => {
  const { room, gridSize, first } = buildPair();
  room.placeTower(client, { x: first.x + gridSize / 2, y: first.y, definitionId: WALL_TOWER_ID });

  const tower = [...room.towers.values()].find((entry) => entry.definition.id !== WALL_TOWER_ID);
  const group = room.getZeynepFormationGroup(tower);

  assert.equal(
    group.some((member) => member.definition.id === WALL_TOWER_ID),
    false,
    "duvar sentez grubuna girdi"
  );
});

test("duvar kule kontenjanina da dizilime de sayilmaz", () => {
  const { room, gridSize, first } = buildPair();
  room.placeTower(client, { x: first.x + gridSize / 2, y: first.y, definitionId: WALL_TOWER_ID });

  const player = room.state.players.get("p1");
  assert.equal(player.towersBuilt, 2, "duvar kontenjana yazilmis");
  assert.deepEqual(formationSizes(room), [2, 2]);
});
