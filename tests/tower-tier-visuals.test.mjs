/**
 * Vurus efektlerinin gorsel kademesi.
 *
 * Kademe seviyeden cikiyor: 1-4, 5-9, 10. Bir sure yalnizca mermilere
 * yaziliyordu, isinlara yazilmiyordu -- yani isinla vuran kuleler seviye
 * atladikca ekranda hicbir sey degistirmiyordu. Zeynep'in bes saldiri
 * kulesinin dordu tam olarak bu durumdaydi.
 *
 * Buradaki testler kademe **verisinin** her saldiri kulesine ulastigini
 * sabitler. Efektin nasil gorundugu istemcinin isi; ama gorunmesi icin once
 * kademenin tele cikmasi gerekiyor, ve sessizce dusen sey buydu.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getPointAlongRuntimePath, getTowerTier, towerCatalog } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

/** Kule kuran, onune dusman koyan ve bir sure suren kucuk bir sahne. */
function fireTower(characterId, definitionId, level) {
  const room = createRoom(characterId);
  const spot = findBuildableSpot(room, definitionId);
  if (!spot) return undefined;
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()].find((entry) => entry.definition.id === definitionId);
  if (!tower) return undefined;

  tower.level = level;
  tower.ammo = tower.maxAmmo;
  tower.energy = tower.maxEnergy;

  const path = room.activePaths[0];
  let closest = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let distance = 0; distance < path.totalLength; distance += 2) {
    const point = getPointAlongRuntimePath(path, distance);
    const gap = Math.hypot(point.x - tower.x, point.y - tower.y);
    if (gap < bestGap) {
      bestGap = gap;
      closest = distance;
    }
  }

  // Bir kac dusman: bazi kuleler tek hedefe, bazilari hatta ates ediyor.
  for (let index = 0; index < 5; index += 1) {
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    enemy.pathDistance = closest + index * 6;
    const point = getPointAlongRuntimePath(path, enemy.pathDistance);
    enemy.x = point.x;
    enemy.y = point.y;
    enemy.hp = 10_000_000;
    enemy.maxHp = enemy.hp;
    enemy.shield = 0;
  }

  const mermiKademeleri = new Set();
  const isinKademeleri = new Set();
  room.broadcast = (type, payload) => {
    if (type === "projectile:spawn") mermiKademeleri.add(payload.tier ?? 1);
  };

  for (let tick = 0; tick < 300; tick += 1) {
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.resetAuraSlows();
    room.updateTowers(50);
    room.updateProjectiles(0.05);
    room.updateZeynepRays(0.05);
    room.updateKinWaves(0.05);
    room.updateBeams(50);
    // Kademe **telden** okunuyor, `room.beams`ten degil.
    //
    // Bu test bir donem model nesnesine bakiyordu ve gecerken kademenin
    // snapshota hic girmedigini goremiyordu: `getSnapshot` isinlarin alanlarini
    // tek tek sayiyor ve `tier` listede yoktu. Sunucuda dogru hesaplanan sayi
    // istemciye hicbir zaman ulasmadi, testler de yesil kaldi. Olcum artik
    // istemcinin gercekten aldigi seyin uzerinde.
    for (const beam of room.getSnapshot().beams) isinKademeleri.add(beam.tier ?? 1);
  }

  return { mermiKademeleri, isinKademeleri, atesEtti: mermiKademeleri.size > 0 || isinKademeleri.size > 0 };
}

/** Atakan ve Zeynep'in gercekten saldiran kuleleri. */
function attackTowers(characterId) {
  return towerCatalog[characterId].filter((tower) => tower.damage > 0 && !tower.resourceProvider);
}

test("kademe sınırları 5 ve 10", () => {
  // Iki gorsel guncelleme sozu tam olarak bu iki esikten geliyor.
  assert.deepEqual([1, 4, 5, 9, 10, 12].map(getTowerTier), [1, 1, 2, 2, 3, 3]);
});

test("Atakan ve Zeynep'in saldıran her kulesi 5 ve 10'da kademe atlar", () => {
  const atlanan = [];

  for (const characterId of ["warrior", "zeynep"]) {
    for (const definition of attackTowers(characterId)) {
      const beklenen = { 1: 1, 5: 2, 10: 3 };
      const olculen = {};

      for (const level of [1, 5, 10]) {
        const sonuc = fireTower(characterId, definition.id, level);
        if (!sonuc || !sonuc.atesEtti) {
          // Bazi kuleler yalniz basina ates etmiyor (Taht Muhru ucgen bekler).
          // Onlari sessizce gecmek yerine listeye yaz: kapsamin nerede
          // bittigini testin kendisi soylesin.
          olculen[level] = "atesEtmedi";
          continue;
        }
        const kademeler = new Set([...sonuc.mermiKademeleri, ...sonuc.isinKademeleri]);
        olculen[level] = Math.max(...kademeler);
      }

      if (Object.values(olculen).includes("atesEtmedi")) {
        atlanan.push(definition.id);
        continue;
      }

      for (const level of [1, 5, 10]) {
        assert.equal(
          olculen[level],
          beklenen[level],
          `${definition.id} ("${definition.name}") sv${level}: kademe ${olculen[level]}, beklenen ${beklenen[level]}`
        );
      }
    }
  }

  // Kapsam disinda kalanlar bilinsin, ama sessizce buyumesinler.
  assert.deepEqual(atlanan, ["zeynep-3"], `beklenmeyen kule tek basina ates etmiyor: ${atlanan.join(", ")}`);
});

test("ışınla vuran kuleler de kademe taşır", () => {
  // Regresyonun tam yeri burasi: mermi tarafi zaten calisiyordu, dusen sey
  // isindi. Isinla vuran bir kule sv10'da hala kademe 1 gonderiyorsa, o kule
  // oyuncuya seviye atladigini hic gostermiyor demektir.
  const isinKuleleri = [
    ["warrior", "warrior-5"],
    ["zeynep", "zeynep-2"],
    ["zeynep", "zeynep-6"]
  ];

  for (const [characterId, definitionId] of isinKuleleri) {
    const sonuc = fireTower(characterId, definitionId, 10);
    assert.ok(sonuc?.atesEtti, `${definitionId} ates etmedi`);
    assert.ok(
      sonuc.isinKademeleri.has(3),
      `${definitionId} sv10'da isin kademesi gondermiyor: ${[...sonuc.isinKademeleri].join(", ")}`
    );
  }
});

test("kule yıkılmışsa ışın sade çizilir", () => {
  // Kademe kuleden okunuyor; kule satildiysa veya yikildiysa okunacak bir sey
  // yok. Bu durumda kademe yazilmamali, cunku telde varsayilan 1.
  const room = createRoom("warrior");
  assert.equal(room.getBeamTier(undefined), undefined);
  assert.equal(room.getBeamTier("yok-boyle-bir-kule"), undefined);
});

/**
 * Debug Lazerin rengi kademeyle isiniyor.
 *
 * Kenar hatti ve kafes yakindan bakinca okunuyor; renk haritanin obur ucundan
 * da okunuyor. Kademe 1 kendi kimlik rengini koruyor ki degisim bir gelisme
 * gibi gorunsun, rastgele bir renk degil.
 */
function debugLaserBeam(level) {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-5");
  assert.ok(spot, "Debug Lazer icin yer bulunamadi");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "warrior-5" });
  const tower = [...room.towers.values()][0];
  tower.level = level;
  tower.ammo = tower.maxAmmo;
  tower.energy = tower.maxEnergy;

  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.x = tower.x + 20;
  enemy.y = tower.y;
  enemy.hp = 10_000_000;
  enemy.maxHp = enemy.hp;
  enemy.shield = 0;
  enemy.armor = 0;
  enemy.damageResistances = {};
  enemy.hitTypeResistances = {};
  enemy.statusResistances = {};
  room.enemySpatialGrid.rebuild(room.enemies.values());

  for (let tick = 0; tick < 40; tick += 1) {
    room.resetAuraSlows();
    room.updateTowers(50);
  }
  const beam = room.getSnapshot().beams.find((entry) => entry.id === `beam-${tower.id}`);
  assert.ok(beam, `seviye ${level} icin isin cizilmedi`);
  return beam;
}

test("Debug Lazer 5'te maviye, 10'da beyaza döner", () => {
  assert.equal(debugLaserBeam(1).color, 0xfb7185);
  assert.equal(debugLaserBeam(4).color, 0xfb7185);
  assert.equal(debugLaserBeam(5).color, 0x60a5fa);
  assert.equal(debugLaserBeam(9).color, 0x60a5fa);
  assert.equal(debugLaserBeam(10).color, 0xffffff);
});

test("renk kademeyle birlikte değişir, ayrı bir eşikle değil", () => {
  // Renk ile vurgu ayni sayidan cikmali: ayri esikler tutulursa biri 5'te,
  // digeri 6'da donerdi ve kimse fark etmezdi.
  for (const level of [1, 4, 5, 9, 10]) {
    const beam = debugLaserBeam(level);
    const tier = beam.tier ?? 1;
    assert.equal(tier, getTowerTier(level), `seviye ${level} kademesi tutmuyor`);
    const beklenen = tier === 3 ? 0xffffff : tier === 2 ? 0x60a5fa : 0xfb7185;
    assert.equal(beam.color, beklenen, `seviye ${level} rengi kademesiyle uyusmuyor`);
  }
});

test("diğer ışın kuleleri kendi renginde kalır", () => {
  // Isinma yalnizca Debug Lazere ait; obur kuleler kimlik renklerini koruyor.
  const room = createRoom("zeynep");
  const spot = findBuildableSpot(room, "zeynep-2");
  assert.ok(spot, "Zeynep isin kulesi icin yer bulunamadi");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "zeynep-2" });
  const tower = [...room.towers.values()][0];
  const definition = towerCatalog.zeynep.find((entry) => entry.id === "zeynep-2");

  for (const level of [1, 5, 10]) {
    tower.level = level;
    assert.notEqual(
      room.getDebugLaserBeamColor(tower, false),
      0xffffff,
      `zeynep-2 seviye ${level}'te Debug Lazer rengine kaydi`
    );
    assert.equal(room.getDebugLaserBeamColor(tower, false), 0xfb7185);
  }
  assert.ok(definition, "zeynep-2 katalogda yok");
});
