/**
 * Dusman turlerine karsi oynanabilen icerik.
 *
 * Icerik uzun sure yalnizca uc hedefi taniyordu -- brute, kalkanli ve ucan --
 * oysa dalgayi tasiyan cogunluk piyade, kosucu, nisanci ve kusatmaydi. Bu dort
 * tur hicbir kartta ya da esyada gecmiyordu, yani "bu dalga neyle geliyor"
 * sorusunun oyuncu tarafinda bir cevabi yoktu.
 *
 * Test iki sey tutuyor: her turun bir karsiligi oldugu ve bonusun **yalnizca o
 * ture** islediigi. Ikincisi olmadan dort stat sessizce duz bir hasar artisina
 * donusur ve tur secmenin anlami kalmaz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cardCatalog, shopCatalog } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const TURLER = ["grunt", "runner", "shooter", "siege", "brute"];
const STAT = {
  grunt: "damageVsGrunt",
  runner: "damageVsRunner",
  shooter: "damageVsShooter",
  siege: "damageVsSiege",
  brute: "damageVsBrute"
};

const client = { sessionId: "p1", send() {} };

test("her dusman turunun en az bir karti ya da esyasi var", () => {
  const hepsi = [...cardCatalog, ...shopCatalog];
  for (const tur of TURLER) {
    const sahipler = hepsi.filter((entry) => entry.effects.some(({ stat }) => stat === STAT[tur]));
    assert.ok(sahipler.length > 0, `${tur} turune karsi hicbir icerik yok`);
  }
});

/** Kuleyi kurar, dusmani istenen turde sabitler ve tek atisin hasarini olcer. */
function vurus(tur, modifiers) {
  const room = createRoom("warrior");
  const definitionId = "warrior-1";
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot);
  room.placeTower(client, { ...spot, definitionId });
  const tower = [...room.towers.values()][0];
  // Kritik zari kapatiliyor.
  //
  // Hasar okumasi kritikle birlikte rastgele: iki cagriyi karsilastiran bir
  // test, ikisinden birinde kritik cikinca sebepsiz düşüyordu. Olculen sey
  // bonusun kendisi, sansin degil.
  room.towerCriticalRandom = () => 1;
  room.state.players.get("p1").runModifiers = modifiers;
  room.invalidateTowerGrants();

  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  Object.assign(enemy, {
    type: tur,
    hp: 1_000_000,
    maxHp: 1_000_000,
    shield: 0,
    armor: 0,
    movementKind: "ground",
    damageResistances: {},
    hitTypeResistances: {},
    statusResistances: {}
  });

  const once = enemy.hp;
  room.damageEnemyFromTower(tower, enemy, 100, 0);
  return once - enemy.hp;
}

test("tur bonusu yalnizca o ture isler", () => {
  for (const tur of TURLER) {
    const modifiers = [{ source: "test", scope: "player", stat: STAT[tur], add: 1 }];
    const hedefte = vurus(tur, modifiers);
    const cip = vurus(tur, []);
    assert.ok(hedefte > cip * 1.5, `${tur}: bonus islememis (${cip} -> ${hedefte})`);

    // Baska bir tur ayni bonustan etkilenmemeli.
    const baskaTur = TURLER.find((aday) => aday !== tur);
    assert.ok(
      Math.abs(vurus(baskaTur, modifiers) - vurus(baskaTur, [])) < 1e-6,
      `${tur} bonusu ${baskaTur} turune de isledi`
    );
  }
});

test("kalabalik karti sayiyla gelen iki turu birden tutar", () => {
  const kart = cardCatalog.find(({ id }) => id === "kalabalik-bastirma");
  assert.ok(kart, "Kalabalık Bastırma katalogda yok");
  const statlar = new Set(kart.effects.map(({ stat }) => stat));
  assert.ok(statlar.has("damageVsGrunt") && statlar.has("damageVsRunner"));
});

test("yapiya saldiran iki tur bir bedelle geliyor", () => {
  const kart = cardCatalog.find(({ id }) => id === "karsi-batarya");
  assert.ok(kart, "Karşı Batarya katalogda yok");
  const statlar = new Set(kart.effects.map(({ stat }) => stat));
  assert.ok(statlar.has("damageVsShooter") && statlar.has("damageVsSiege"));
  assert.ok(kart.effects.some(({ stat, add }) => stat === "range" && add < 0), "bedeli yok");
});
