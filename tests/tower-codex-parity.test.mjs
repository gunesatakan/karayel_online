/**
 * Arayuzdeki kule kunyesi ile oyunun gercekten uyguladigi degerlerin ayni
 * kalmasini garanti eder.
 *
 * Neden gerek var: bu formuller bir donem iki yerde birden yasadi. Sunucu
 * MatchRoom icinde hesapliyordu, web codex'i menu-ui icinde kendi kopyasiyla
 * hesapliyordu. Her balans commit'i sunucuya inip UI kopyasini geride biraktigi
 * icin panel temel hasar carpanini tamamen atliyor, Jackpot'un DPS'ini bes kat
 * fazla gosteriyordu.
 *
 * Artik iki taraf da shared/tower-stats modulunu okuyor. Bu test gercek bir
 * MatchRoom surerek o modulun sunucudan sapmadigini dogrular; formullerden biri
 * yalniz bir tarafta degisirse burada patlar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  getTowerBaseLevelDamage,
  getTowerBaseLevelFireIntervalMs,
  getTowerBaseLevelRange,
  getTowerBaseLevelMinimumRange,
  hasGlobalTowerRange,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot, isDamageDealingTower } from "./helpers/match-room-harness.mjs";

const LEVELS = [1, 5, 10];
const TOLERANCE = 1e-9;

/**
 * Kuleyi kosullu bonuslarin tamamen kapali oldugu bir dunyaya kurar.
 *
 * Kunye "temel" degeri gosterir: dalga, kart, dukkan, seri ve dizilim bonuslari
 * haric. Tek kule kurulunca dogal olarak aktif olan iki kosullu bonus kalir:
 * Atakan'in yalnizlik pasifi ve Melis'in favori kule bonusu. Ilki yerlesime
 * bagli bir yordam oldugu icin stub'lanir, ikincisi onay 0'a cekilerek dogal
 * yoldan notrlenir. Geri kalan her carpan canli kalir, boylece temel degere
 * yeni bir carpan eklenirse test bunu yakalar.
 */
function createNeutralRoom(characterId) {
  const room = createRoom(characterId);
  const player = room.state.players.get("p1");
  player.approval = 0;
  player.stress = 0;
  room.isTowerIsolated = () => false;
  return room;
}

function placeTower(room, definition) {
  const spot = findBuildableSpot(room, definition.id);
  if (!spot) return undefined;
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: definition.id });
  return [...room.towers.values()][0];
}

/**
 * Kunye yalnizca hasar veren kuleler icin degil, kontrol kuleleri icin de
 * gosteriliyor. Kin Kulesi'nin atis araligi tam da bu yuzden sapmisti: hasari 0
 * oldugu icin DPS blogunu hic gormuyordu ama kunyede yanlis aralik yaziyordu.
 * O yuzden lojistik binalari disindaki her kule olculur.
 */
const testableTowers = [];
for (const [characterId, definitions] of Object.entries(towerCatalog)) {
  for (const definition of definitions) {
    if (definition.resourceProvider) continue;
    testableTowers.push({ characterId, definition });
  }
}

test("kunye her karakterde kule olcebiliyor", () => {
  assert.ok(testableTowers.length > 30, `olculebilir kule sayisi beklenenden az: ${testableTowers.length}`);
  const characters = new Set(testableTowers.map((entry) => entry.characterId));
  assert.equal(characters.size, Object.keys(towerCatalog).length);
  assert.ok(testableTowers.some((entry) => isDamageDealingTower(entry.definition)));
  assert.ok(testableTowers.some((entry) => !isDamageDealingTower(entry.definition)));
});

for (const { characterId, definition } of testableTowers) {
  test(`${definition.name} (${definition.id}) kunye degerleri sunucuyla ayni`, (t) => {
    const room = createNeutralRoom(characterId);
    const tower = placeTower(room, definition);
    if (!tower) {
      // Kenar veya 2x2 yerlesim isteyen kuleler duz bir karede kurulamiyor.
      t.skip(`${definition.id} icin insa edilebilir kare bulunamadi`);
      return;
    }

    for (const level of LEVELS) {
      tower.level = level;
      const where = `${definition.id} seviye ${level}`;

      if (definition.damage > 0) {
        assert.ok(
          Math.abs(room.getTowerDamage(tower) - getTowerBaseLevelDamage(definition, level)) < TOLERANCE,
          `${where} hasari: sunucu ${room.getTowerDamage(tower)}, kunye ${getTowerBaseLevelDamage(definition, level)}`
        );
      }

      assert.ok(
        Math.abs(room.getTowerFireInterval(tower) - getTowerBaseLevelFireIntervalMs(definition, level)) < TOLERANCE,
        `${where} atis araligi: sunucu ${room.getTowerFireInterval(tower)}, kunye ${getTowerBaseLevelFireIntervalMs(definition, level)}`
      );

      if (!hasGlobalTowerRange(definition.id)) {
        assert.ok(
          Math.abs(room.getTowerRange(tower) - getTowerBaseLevelRange(definition, level)) < TOLERANCE,
          `${where} menzili: sunucu ${room.getTowerRange(tower)}, kunye ${getTowerBaseLevelRange(definition, level)}`
        );

        assert.ok(
          Math.abs(room.getTowerMinimumRange(tower) - getTowerBaseLevelMinimumRange(definition, level)) < TOLERANCE,
          `${where} olu bolgesi: sunucu ${room.getTowerMinimumRange(tower)}, kunye ${getTowerBaseLevelMinimumRange(definition, level)}`
        );
      }
    }
  });
}

test("sabit atis araligi olan kuleler seviyeyle hizlanmaz", () => {
  const fixedTowers = Object.values(towerCatalog)
    .flat()
    .filter((definition) => definition.engine?.fixedFireInterval);
  assert.ok(fixedTowers.length > 0, "sabit aralikli kule bulunamadi");

  for (const definition of fixedTowers) {
    assert.equal(
      getTowerBaseLevelFireIntervalMs(definition, 10),
      getTowerBaseLevelFireIntervalMs(definition, 1),
      `${definition.id} sabit aralikli olmasina ragmen seviyeyle degisiyor`
    );
  }
});
