/**
 * Duvar sistemi.
 *
 * Duvar ayri bir varlik turu degil, bir kule varyanti: yerlestirme, can, hasar,
 * satis ve yukseltme hatti oldugu gibi calisiyor. Duvara ozel olan uc sey var --
 * ne kadar dayandigi, kalinlastirilabilmesi ve onarilabilmesi -- ve testler
 * bunlari sabitliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  STRUCTURE_BREACH_HEALTH_RATIO,
  WALL_TOWER_ID,
  getCharacterTowers,
  getStructureHealthMultiplier,
  getStructureRepairCost,
  getStructureTravelCost,
  getTowerBuildCost,
  isSharedStructure,
  occupiesTowerSlot,
  towerCatalog,
  wallTower,
  getEnemyCombatDefinition,
  gridToWorld,
  getMapGridSize,
  getMapOrigin,
  SIEGE_STRUCTURE_DAMAGE_MULTIPLIER,
  SIEGE_FIRST_WAVE,
  SIEGE_SPAWN_RATIO
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot, findEdgeSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function buildWall(characterId = "warrior", orientation = "vertical") {
  const room = createRoom(characterId);
  const spot = findEdgeSpot(room, orientation, WALL_TOWER_ID);
  assert.ok(spot, "duvar icin kenar bulunamadi");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: WALL_TOWER_ID });
  const wall = [...room.towers.values()][0];
  assert.ok(wall, "duvar kurulamadi");
  return { room, wall, player: room.state.players.get("p1") };
}

test("duvar her karakterin listesinde var ama kimsenin kiti değil", () => {
  for (const characterId of Object.keys(towerCatalog)) {
    assert.ok(
      towerCatalog[characterId].some((tower) => tower.id === WALL_TOWER_ID),
      `${characterId} duvar kuramiyor`
    );
    assert.equal(
      getCharacterTowers(characterId).some((tower) => tower.id === WALL_TOWER_ID),
      false,
      `${characterId} kitinde duvar gorunuyor`
    );
  }
  assert.equal(isSharedStructure(wallTower), true);
});

test("duvar ateş etmez ve ucuzdur", () => {
  assert.equal(wallTower.damage, 0);
  assert.equal(wallTower.range, 0);
  const cheapest = Math.min(...getCharacterTowers("warrior").map((tower) => tower.cost));
  assert.ok(wallTower.cost < cheapest, "duvar en ucuz kuleden pahali");
});

test("duvarın canı kule tabanından yüksek ve kalınlaştırmayla büyür", () => {
  assert.ok(getStructureHealthMultiplier(wallTower, 1) > 1, "duvar normal kule kadar dayaniyor");
  assert.ok(
    getStructureHealthMultiplier(wallTower, 3) > getStructureHealthMultiplier(wallTower, 1),
    "kalinlastirma cani buyutmuyor"
  );
  // Silah kuleleri bundan etkilenmez.
  const tower = getCharacterTowers("warrior")[0];
  assert.equal(getStructureHealthMultiplier(tower, 1), 1);
  assert.equal(getStructureHealthMultiplier(tower, 10), 1);
});

test("kurulan duvar normal kuleden daha çok can taşır ve yolu daha pahalı yapar", () => {
  const { wall } = buildWall();
  const other = createRoom("warrior");
  const spot = findBuildableSpot(other, "warrior-1");
  other.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const tower = [...other.towers.values()][0];

  assert.ok(wall.maxHp > tower.maxHp, "duvar kuleden dayaniksiz");
  assert.ok(
    getStructureTravelCost(wall.hp) > getStructureTravelCost(tower.hp),
    "duvar gecisi kuleden daha pahali yapmiyor"
  );
});

test("towerHealth kartları duvara da işler", () => {
  // Karar bilincli: duvar ormek roguelike katmaniyla sinerji tasisin.
  const room = createRoom("warrior");
  room.state.players.get("p1").runModifiers.push({ source: "card:kalin-zirh", scope: "player", stat: "towerHealth", add: 0.8 });
  const spot = findEdgeSpot(room, "vertical", WALL_TOWER_ID);
  assert.ok(spot, "duvar icin kenar bulunamadi");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: WALL_TOWER_ID });
  const buffed = [...room.towers.values()][0];

  const { wall } = buildWall();
  assert.ok(buffed.maxHp > wall.maxHp, "kart duvarin canini buyutmedi");
});

test("onarım eksik canla orantılı ve yeniden inşadan ucuz", () => {
  const buildCost = getTowerBuildCost(wallTower.cost);
  assert.equal(getStructureRepairCost(buildCost, 0), 0, "tam canli yapi bedel istiyor");
  assert.ok(getStructureRepairCost(buildCost, 1) < buildCost, "tam onarim yeniden insadan pahali");
  assert.ok(
    getStructureRepairCost(buildCost, 0.5) < getStructureRepairCost(buildCost, 1),
    "onarim eksik canla olceklenmiyor"
  );
});

test("hasarlı duvar altın karşılığı onarılır, yıkılan onarılmaz", () => {
  const { room, wall, player } = buildWall();
  const goldBefore = player.gold;
  wall.hp = wall.maxHp * 0.25;

  room.repairStructure(client, { towerId: wall.id });
  assert.equal(wall.hp, wall.maxHp, "duvar onarilmadi");
  assert.ok(player.gold < goldBefore, "onarim bedelsiz");

  // Yikilan duvar geri gelmez; oyuncu yeniden insa etmeli.
  wall.hp = 0;
  const goldAfterRepair = player.gold;
  room.repairStructure(client, { towerId: wall.id });
  assert.equal(wall.hp, 0, "yikilan duvar onarildi");
  assert.equal(player.gold, goldAfterRepair, "yikilan duvar icin altin alindi");
});

test("gedik uyarısı eşik geçilince bir kez yayılır", () => {
  const { room, wall } = buildWall();
  const events = [];
  room.broadcast = (type, payload) => { if (type === "structure:breach") events.push(payload); };

  // Esigin ustunde kalan hasar uyari uretmez.
  room.damageTower(wall, wall.maxHp * 0.2);
  assert.equal(events.length, 0, "esik asilmadan uyari yayildi");

  // Esigi gecince tek uyari.
  wall.hp = wall.maxHp * (STRUCTURE_BREACH_HEALTH_RATIO + 0.05);
  room.damageTower(wall, wall.maxHp * 0.1);
  assert.equal(events.length, 1, "gedik uyarisi yayilmadi");
  assert.equal(events[0].towerId, wall.id);

  room.damageTower(wall, 1);
  assert.equal(events.length, 1, "uyari her hasarda tekrarlaniyor");
});

test("onarılan duvar tekrar kırılırsa yeniden uyarır", () => {
  const { room, wall } = buildWall();
  const events = [];
  room.broadcast = (type, payload) => { if (type === "structure:breach") events.push(payload); };

  wall.hp = wall.maxHp * (STRUCTURE_BREACH_HEALTH_RATIO + 0.05);
  room.damageTower(wall, wall.maxHp * 0.1);
  assert.equal(events.length, 1);

  room.repairStructure(client, { towerId: wall.id });
  wall.hp = wall.maxHp * (STRUCTURE_BREACH_HEALTH_RATIO + 0.05);
  room.damageTower(wall, wall.maxHp * 0.1);
  assert.equal(events.length, 2, "onarim sonrasi ikinci gedik uyarilmadi");
});

test("kuşatma düşmanı yapılara çok daha sert vurur ama canı düşüktür", () => {
  const siege = getEnemyCombatDefinition("siege");
  const grunt = getEnemyCombatDefinition("grunt");
  assert.ok(siege.maxHp < grunt.maxHp, "kusatma canı grunt'tan yuksek");
  assert.ok(SIEGE_STRUCTURE_DAMAGE_MULTIPLIER > 1, "yapi hasar carpani yok");

  // Turtle cezasi gercek olsun: kalin bir duvar kusatma karsisinda erimeli.
  const wallHp = 250;
  const normalHits = Math.ceil(wallHp / grunt.attack);
  const siegeHits = Math.ceil(wallHp / (siege.attack * SIEGE_STRUCTURE_DAMAGE_MULTIPLIER));
  assert.ok(siegeHits * 2 < normalHits, `kusatma yeterince hizli kirmiyor: ${siegeHits} / ${normalHits}`);
});

test("kuşatma düşmanı erken dalgalarda çıkmaz", () => {
  assert.ok(SIEGE_FIRST_WAVE > 1, "kusatma 1. dalgada cikiyor");
  assert.ok(SIEGE_SPAWN_RATIO > 0 && SIEGE_SPAWN_RATIO < 0.5, "kusatma orani makul degil");
});

test("akış ana kapısı değişince sunucu uyarı yayar", () => {
  const room = createRoom("warrior");
  room.state.players.get("p1").runModifiers.push({ source: "test", scope: "player", stat: "towerCapacity", add: 40 });
  const events = [];
  room.broadcast = (type, payload) => { if (type === "flow:shift") events.push(payload); };

  // Acik haritada yogunlasma noktasi yok, dolayisiyla uyari da yok.
  room.getFlowField();
  assert.equal(events.length, 0, "acik haritada kayma uyarisi yayildi");

  // Hatti bastan sona muhurle: her yol en ucuz duvardan gecmek zorunda.
  const wallRow = 4;
  const walls = [];
  for (let col = 0; col < room.activeMap.cols; col += 1) {
    const world = gridToWorld(col, wallRow, room.activeMap);
    if (!room.canPlaceTower(world.x, world.y, "warrior-1", "horizontal")) continue;
    room.placeTower({ sessionId: "p1" }, { x: world.x, y: world.y, definitionId: "warrior-1" });
    walls.push([...room.towers.values()].at(-1));
  }
  assert.ok(walls.length >= 4, "test icin yeterli duvar kurulamadi");

  // Sol uctaki duvari ac: kutle oraya akar ve ilk huni olusur.
  walls[0].hp = 0;
  room.markFlowFieldDirty();
  room.getFlowField();
  assert.ok(events.length >= 1, "ilk huni olusunca uyarilmadi");
  const firstGate = events.at(-1).to;

  // Simdi sag uctaki duvari da ac ve solu kapat: kapi karsi uca kaymali.
  walls[0].hp = walls[0].maxHp;
  walls.at(-1).hp = 0;
  room.markFlowFieldDirty();
  room.getFlowField();

  const lastEvent = events.at(-1);
  assert.notDeepEqual(lastEvent.to, firstGate, "kapi karsi uca kaymadi");
  assert.deepEqual(lastEvent.from, firstGate, "kayma nereden geldigini bildirmiyor");
});

test("duvar 20 altına mal olur", () => {
  assert.equal(getTowerBuildCost(wallTower.cost), 20);
});

test("duvarın yönü bırakıldığı kenardan gelir", () => {
  // Oyuncu yon secmez: dikey bir cizgiye getirilen duvar dikey, yatay bir
  // cizgiye getirilen yatay doner.
  for (const orientation of ["vertical", "horizontal"]) {
    const room = createRoom("warrior");
    const spot = findEdgeSpot(room, orientation, WALL_TOWER_ID);
    assert.ok(spot, `${orientation} kenar bulunamadi`);
    room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: WALL_TOWER_ID });
    const wall = [...room.towers.values()].at(-1);
    assert.ok(wall, `${orientation} kenara duvar kurulamadi`);
    assert.equal(wall.orientation, orientation);
  }
});

test("istemciden gelen yön duvarda yok sayılır", () => {
  // Yon konumdan turetildigi icin istemcinin gonderdigi deger baglayici degil;
  // aksi halde arayuz ile sunucu ayrisabilirdi.
  const room = createRoom("warrior");
  const spot = findEdgeSpot(room, "vertical", WALL_TOWER_ID);
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: WALL_TOWER_ID, orientation: "horizontal" });
  assert.equal([...room.towers.values()].at(-1)?.orientation, "vertical");
});

test("kenardaki duvar hücreyi değil geçişi pahalılaştırır", () => {
  const { room, wall } = buildWall("warrior", "vertical");
  // Duvarin gercekte oturdugu kenari kendi segmentinden oku: konumu varsaymak
  // testi haritanin sekline baglar.
  const [segment] = room.getAbartiEdgeSegments(wall.x, wall.y, wall.orientation, 1);
  assert.ok(segment);

  // Iki yandaki hucreler bos kalmali: duvar kare kaplamaz.
  assert.equal(room.getCellTravelCost(segment.col, segment.row), 1, "duvar hucreyi isgal etmis");
  assert.equal(room.getCellTravelCost(segment.col - 1, segment.row), 1, "duvar komsu hucreyi isgal etmis");

  // Ama o iki hucre arasindaki gecis pahali olmali.
  const crossing = room.getEdgeTravelCost(segment.col - 1, segment.row, segment.col, segment.row);
  assert.ok(crossing > 0, "kenar gecisi bedelsiz");
  assert.equal(crossing, getStructureTravelCost(wall.hp) - 1);

  // Duvarla ilgisi olmayan bir gecis bedelsiz kalmali.
  assert.equal(room.getEdgeTravelCost(segment.col, segment.row, segment.col, segment.row + 1), 0);
});

test("yıkılan kenar duvarı geçişi serbest bırakır", () => {
  const { room, wall } = buildWall("warrior", "vertical");
  const [segment] = room.getAbartiEdgeSegments(wall.x, wall.y, wall.orientation, 1);

  assert.ok(room.getEdgeTravelCost(segment.col - 1, segment.row, segment.col, segment.row) > 0);
  wall.hp = 0;
  room.markFlowFieldDirty();
  assert.equal(
    room.getEdgeTravelCost(segment.col - 1, segment.row, segment.col, segment.row),
    0,
    "yikilan duvar hala gecisi kapatiyor"
  );
});

/**
 * Kule kontenjani savas kuleleri icindir.
 *
 * Duvar hattini ormek icin hasar kulesinden vazgecmek gerekseydi duvar sistemi
 * hicbir zaman kullanilmazdi: bir duvar tek basina bir kulenin yerini tutmaz.
 */
test("duvar kule kontenjanından yer kapmaz", () => {
  assert.equal(occupiesTowerSlot(wallTower), false);
  for (const tower of getCharacterTowers("warrior")) {
    assert.equal(occupiesTowerSlot(tower), true, `${tower.id} kontenjandan sayilmiyor`);
  }
});

test("kontenjan dolduğunda duvar hâlâ kurulabilir", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");

  // Kontenjani doldur.
  let built = 0;
  for (let attempt = 0; attempt < 40 && built < 12; attempt += 1) {
    const spot = findBuildableSpot(room, "warrior-1");
    if (!spot) break;
    const before = room.towers.size;
    room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
    if (room.towers.size === before) break;
    built += 1;
  }
  assert.ok(built > 0, "test icin kule kurulamadi");

  // Bu noktada kontenjan dolu olmali: bir kule daha kurulmamali.
  const towersBefore = room.towers.size;
  const extra = findBuildableSpot(room, "warrior-1");
  if (extra) {
    room.placeTower({ sessionId: "p1" }, { x: extra.x, y: extra.y, definitionId: "warrior-1" });
    assert.equal(room.towers.size, towersBefore, "kontenjan sinir uygulamiyor; test varsayimi gecersiz");
  }

  // Duvar yine de kurulabilmeli.
  const edge = findEdgeSpot(room, "vertical", WALL_TOWER_ID);
  assert.ok(edge, "duvar icin kenar bulunamadi");
  room.placeTower({ sessionId: "p1" }, { x: edge.x, y: edge.y, definitionId: WALL_TOWER_ID });
  assert.equal(room.towers.size, towersBefore + 1, "kontenjan dolu diye duvar reddedildi");
});

test("duvar kurmak towersBuilt sayacını artırmaz", () => {
  // Istemci sinir kontrolunu bu sayidan yapiyor; duvar burayi kirletirse
  // birkac duvar sonrasi gercek kuleler kurulamaz hale gelir.
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  const before = player.towersBuilt;

  const edge = findEdgeSpot(room, "vertical", WALL_TOWER_ID);
  room.placeTower({ sessionId: "p1" }, { x: edge.x, y: edge.y, definitionId: WALL_TOWER_ID });
  assert.equal(player.towersBuilt, before, "duvar sayaci artirdi");

  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  assert.equal(player.towersBuilt, before + 1, "gercek kule sayaci artirmadi");
});
