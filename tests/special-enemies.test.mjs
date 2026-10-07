/**
 * Ozel dusmanlar ve karsi atak (2. asamadan itibaren).
 *
 * Dort mekanik normal dalganin icinde: kule avcisi, isitici, enerji yiyici ve
 * dusman olmayan karsi atak seridi. Testler gercek odayi suruyor; yol, vurus,
 * emme ve isi kurallari MatchRoom'un kendisinden geciyor. Her davranisin bir
 * de kontrolu var (dokunulmamasi gereken yapi gercekten dokunulmamis mi),
 * yoksa "her seyi vuruyor" hatasi da gecerdi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAMPION_HP_BONUS,
  COUNTER_SURGE_CROSS_MS,
  COUNTER_SURGE_DAMAGE_RATIO,
  COUNTER_SURGE_TELEGRAPH_MS,
  ENERGY_EATER_HP_MULTIPLIER,
  ENERGY_EATER_SPAWN_BOTTOM_MARGIN_ROWS,
  HEATER_HEAT_PER_SECOND_RATIO,
  SPECIAL_KIND_FIRST_WAVE,
  SPECIAL_MAX_SLOT_SHARE,
  SPECIAL_MIN_NORMAL_SHARE,
  TOWER_HUNTER_MAX_PER_WAVE,
  createSpecialRandom,
  getArenaWaveEnemyCount,
  getCounterSurgeChance,
  getEnemySpawnHealth,
  getMapGridSize,
  getMapOrigin,
  getSpecialEnemyTotal,
  getWaveChampionPlan,
  getWaveSpecialEnemyCount,
  gridToWorld,
  planWaveSpecials,
  worldToGrid
} from "../packages/shared/dist/index.js";
import { createStaticEnemySnapshot } from "../apps/server/dist/snapshot/static-data.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

/** Acik 12x18 arena, istenen asama. Yayinlar `room.sent`e yaziliyor. */
function oda(stage = 2) {
  const room = createRoom("warrior");
  const sent = [];
  room.broadcast = (type, payload) => sent.push({ type, payload });
  room.clients = [client];
  room.mapScale = 1;
  room.configureArenaForScale();
  room.stage = stage;
  room.sent = sent;
  return room;
}

function kur(room, definitionId, col, row) {
  const point = gridToWorld(col, row, room.activeMap);
  const before = room.towers.size;
  room.placeTower(client, { x: point.x, y: point.y, definitionId });
  assert.equal(room.towers.size, before + 1, `${definitionId} (${col},${row}) kurulamadi`);
  return [...room.towers.values()].at(-1);
}

/** Hucrenin bir kenarina duvar orer. */
function duvar(room, col, row, side) {
  const grid = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const point = {
    top: { x: origin.x + col * grid + grid / 2, y: origin.y + row * grid },
    bottom: { x: origin.x + col * grid + grid / 2, y: origin.y + (row + 1) * grid },
    left: { x: origin.x + col * grid, y: origin.y + row * grid + grid / 2 },
    right: { x: origin.x + (col + 1) * grid, y: origin.y + row * grid + grid / 2 }
  }[side];
  const before = room.towers.size;
  room.placeTower(client, { ...point, definitionId: "wall-1" });
  assert.equal(room.towers.size, before + 1, `duvar (${col},${row},${side}) orulemedi`);
  return [...room.towers.values()].at(-1);
}

/** Kuleyi dort yandan duvarla cevirir; duvarlari yon adiyla dondurur. */
function cevir(room, col, row) {
  return {
    top: duvar(room, col, row, "top"),
    bottom: duvar(room, col, row, "bottom"),
    left: duvar(room, col, row, "left"),
    right: duvar(room, col, row, "right")
  };
}

function ozel(room, kind, col, row, { type = "grunt", healthMultiplier = 1 } = {}) {
  room.spawnEnemy(undefined, { kind, type, healthMultiplier, start: gridToWorld(col, row, room.activeMap) });
  return [...room.enemies.values()].at(-1);
}

/** Dusman tikini `saniye` boyunca surer; kosul tutunca durur. */
function sur(room, saniye, kosul = () => false, dt = 0.05) {
  for (let elapsed = 0; elapsed < saniye; elapsed += dt) {
    room.updateEnemies(dt);
    if (kosul()) return true;
  }
  return false;
}

function hucre(room, enemy) {
  return worldToGrid(enemy.x, enemy.y, room.activeMap);
}

/** Sahte duvar saati: karsi atak duvar saatiyle ilerliyor. */
function sahteSaat(fn) {
  const gercek = Date.now;
  const saat = { now: 1_800_000_000_000 };
  Date.now = () => saat.now;
  try {
    return fn(saat);
  } finally {
    Date.now = gercek;
  }
}

/** Bir dalganin butun dogumlarini sirayla dogurur (zamanlayicisiz). */
function dalgayiDogur(room, wave) {
  room.wave = wave;
  room.waveSpawned = 0;
  room.planWaveSpawns(wave);
  const spawned = [];
  const before = new Set(room.enemies.keys());
  for (let index = 0; index < room.waveTarget; index += 1) room.spawnNextWaveEnemy();
  for (const enemy of room.enemies.values()) if (!before.has(enemy.id)) spawned.push(enemy);
  return spawned;
}

// --- Kule avcisi ------------------------------------------------------------------

test("avcı nexusa değil, yoldan en yakın kuleye yürüyüp vuruyor", () => {
  const room = oda();
  const yakin = kur(room, "warrior-1", 2, 8);
  const uzak = kur(room, "warrior-1", 9, 8);
  const avci = ozel(room, "hunter", 4, 1);
  const vurdu = sur(room, 30, () => yakin.hp < yakin.maxHp);
  assert.ok(vurdu, "avci en yakin kuleye hic vurmadi");
  assert.equal(uzak.hp, uzak.maxHp, "uzaktaki kule vuruldu");
  const yer = hucre(room, avci);
  assert.equal(Math.abs(yer.col - 2) + Math.abs(yer.row - 8), 1, "avci kuleye bitisik degil");
  assert.equal(room.teamHealth, 100, "avci nexusa gitti");
});

test("avcı kaynak binasını da hedef alıyor, duvarı hedef almıyor", () => {
  const room = oda();
  const kule = kur(room, "warrior-1", 9, 12);
  const reaktor = kur(room, "warrior-8", 4, 6);
  const ortaDuvar = duvar(room, 7, 3, "bottom");
  ozel(room, "hunter", 4, 1);
  assert.ok(sur(room, 30, () => reaktor.hp < reaktor.maxHp), "avci enerji binasina vurmadi");
  assert.equal(kule.hp, kule.maxHp);
  assert.equal(ortaDuvar.hp, ortaDuvar.maxHp, "yoldaki olmayan duvar vuruldu");
});

test("avcının yapı vuruşu sert ama anında değil: orta bir kule 8–15 sn'de düşüyor", () => {
  const room = oda();
  const kule = kur(room, "warrior-1", 5, 4);
  kule.maxHp = 130;
  kule.hp = 130;
  const avci = ozel(room, "hunter", 5, 3);
  let saniye = 0;
  const dt = 0.05;
  while (kule.hp > 0 && saniye < 60) {
    room.updateEnemies(dt);
    saniye += dt;
  }
  assert.equal(kule.hp, 0, "avci kuleyi yikamadi");
  assert.ok(saniye >= 8 && saniye <= 15, `yikim ${saniye.toFixed(1)} sn surdu`);
  assert.ok(room.enemies.has(avci.id));
});

test("bütün kuleler duvarla kapalıysa en yakın kuleye giden yoldaki, kuleye en yakın duvarı kırıyor", () => {
  const room = oda();
  const kule = kur(room, "warrior-1", 5, 8);
  const duvarlar = cevir(room, 5, 8);
  const uzakKule = kur(room, "warrior-1", 10, 15);
  const uzakDuvarlar = cevir(room, 10, 15);
  ozel(room, "hunter", 5, 2);
  assert.ok(sur(room, 30, () => duvarlar.top.hp < duvarlar.top.maxHp), "ust duvar kirilmaya baslanmadi");
  for (const side of ["bottom", "left", "right"]) assert.equal(duvarlar[side].hp, duvarlar[side].maxHp, `${side} duvari vuruldu`);
  for (const wall of Object.values(uzakDuvarlar)) assert.equal(wall.hp, wall.maxHp, "uzak kulenin duvari vuruldu");
  assert.equal(kule.hp, kule.maxHp, "duvar kirilmadan kule vuruldu");
  assert.equal(uzakKule.hp, uzakKule.maxHp);

  // Duvar devrilince ayni avci kuleye geciyor.
  duvarlar.top.hp = 1;
  assert.ok(sur(room, 10, () => kule.hp < kule.maxHp), "duvardan sonra kuleye gecmedi");
  assert.equal(duvarlar.top.hp, 0);
});

test("düz bir duvar hattında avcı hat boyunca kulenin tam üstündeki duvara yürüyor", () => {
  const room = oda();
  const kule = kur(room, "warrior-1", 9, 10);
  const hat = [];
  for (let col = 0; col < room.activeMap.cols; col += 1) hat.push(duvar(room, col, 6, "top"));
  ozel(room, "hunter", 2, 2);
  assert.ok(sur(room, 40, () => hat.some((wall) => wall.hp < wall.maxHp)), "hat kirilmadi");
  const vurulan = hat.findIndex((wall) => wall.hp < wall.maxHp);
  assert.equal(vurulan, 9, `kulenin ustundeki (9) yerine ${vurulan}. duvar kirildi`);
  assert.equal(kule.hp, kule.maxHp);
});

test("avcı yıktığı kuleden sonra sıradaki kuleye dönüyor", () => {
  const room = oda();
  const ilk = kur(room, "warrior-1", 3, 5);
  const ikinci = kur(room, "warrior-1", 8, 10);
  ozel(room, "hunter", 3, 1);
  assert.ok(sur(room, 30, () => ilk.hp < ilk.maxHp), "ilk kuleye varmadi");
  assert.equal(ikinci.hp, ikinci.maxHp);
  ilk.hp = 1;
  assert.ok(sur(room, 5, () => ilk.hp === 0), "ilk kule yikilmadi");
  assert.ok(sur(room, 40, () => ikinci.hp < ikinci.maxHp), "ikinci kuleye donmedi");
});

test("yapı kalmayınca avcı normal düşman gibi nexusa iniyor", () => {
  const room = oda();
  const avci = ozel(room, "hunter", 5, 1);
  const vardi = sur(room, 120, () => !room.enemies.has(avci.id));
  assert.ok(vardi, "avci nexusa inmedi");
  assert.ok(room.teamHealth < 100, "avci sizmadi");
});

test("avcının canı o dalganın şampiyonunun canı; şampiyon bayrağı yok", () => {
  for (const wave of [6, 9, 14]) {
    const room = oda(3);
    room.wave = wave;
    room.waveSpawned = 0;
    room.planWaveSpawns(wave);
    const slots = room.getScaledWaveEnemyCount(wave);
    const champion = getWaveChampionPlan(wave, slots);
    assert.ok(champion, `${wave}. dalgada sampiyon plani yok`);
    room.spawnEnemy(champion);
    const sampiyon = [...room.enemies.values()].at(-1);
    room.waveSpecialPlan = { stage: 3, wave, spawns: [{ index: 0, kind: "hunter", replaced: champion.replaced }], replaced: champion.replaced, hunter: { ...champion } };
    room.spawnSpecialEnemy({ index: 0, kind: "hunter", replaced: champion.replaced });
    const avci = [...room.enemies.values()].at(-1);
    assert.equal(avci.special.kind, "hunter");
    assert.equal(avci.type, sampiyon.type);
    assert.equal(avci.maxHp, sampiyon.maxHp, `${wave}. dalga: avci cani sampiyonunkiyle ayni degil`);
    assert.equal(avci.maxShield, sampiyon.maxShield);
    assert.ok(avci.maxHp >= CHAMPION_HP_BONUS * 3 * getEnemySpawnHealth(avci.type, wave).maxHp, "avci kalin degil");
    assert.equal(avci.champion, undefined, "avci sampiyon sayiliyor");
    const statik = createStaticEnemySnapshot(avci);
    assert.equal(statik.special, "hunter");
    assert.equal(statik.champion, undefined, "avci telde tacli");
  }
});

test("avcı öldüğünde şampiyon değil: 'şampiyon devrildi' ve şampiyon primi yok, bütçesi kadar ödül var", () => {
  const room = oda(3);
  const wave = 8;
  room.wave = wave;
  room.planWaveSpawns(wave);
  const champion = getWaveChampionPlan(wave, room.getScaledWaveEnemyCount(wave));
  room.waveSpecialPlan = { stage: 3, wave, spawns: [], replaced: 0, hunter: { ...champion } };
  room.spawnSpecialEnemy({ index: 0, kind: "hunter", replaced: champion.replaced });
  const avci = [...room.enemies.values()].at(-1);
  const player = room.state.players.get("p1");
  const gold = player.gold;
  room.damageEnemy(avci, avci.hp + avci.shield * 3 + 10, 0, "test", "p1", "true");
  assert.ok(!room.enemies.has(avci.id), "avci olmedi");
  assert.equal(room.sent.filter((entry) => entry.type === "champion:down").length, 0, "avci sampiyon gibi duyuruldu");
  assert.ok(player.gold - gold >= champion.gold, "avcinin butce altini odenmedi");
});

// --- Karsi atak ---------------------------------------------------------------------

test("karşı atak şeridindeki her yapıyı bir kez, azami canın payı kadar vuruyor; dışarısına, düşmana ve nexusa dokunmuyor", () => {
  sahteSaat((saat) => {
    const room = oda();
    const ust = kur(room, "warrior-1", 4, 3);
    const alt = kur(room, "warrior-1", 5, 14);
    const reaktor = kur(room, "warrior-8", 6, 9);
    const icDuvar = duvar(room, 5, 7, "bottom");
    const sinirDuvar = duvar(room, 3, 11, "right");
    const disari = kur(room, "warrior-1", 8, 9);
    const disariDuvar = duvar(room, 9, 5, "bottom");
    const dusman = ozel(room, "heater", 5, 6);
    const dusmanCani = dusman.hp;
    // Dikey duvar seridin sinirinda: o da serit gectigi yerde sayiliyor.
    const icerdekiler = [ust, alt, reaktor, icDuvar, sinirDuvar];
    const canlar = new Map(icerdekiler.map((tower) => [tower.id, tower.hp]));
    const maxlar = new Map(icerdekiler.map((tower) => [tower.id, tower.maxHp]));

    room.startCounterSurge(4, 3, saat.now);
    for (let t = 0; t <= COUNTER_SURGE_TELEGRAPH_MS + COUNTER_SURGE_CROSS_MS + 500; t += 50) {
      saat.now += 50;
      room.updateCounterSurge(saat.now);
    }
    for (const tower of icerdekiler) {
      const beklenen = canlar.get(tower.id) - maxlar.get(tower.id) * COUNTER_SURGE_DAMAGE_RATIO;
      assert.ok(Math.abs(tower.hp - beklenen) < 0.001, `${tower.definition.id} bir kez vurulmadi: ${tower.hp} (beklenen ${beklenen})`);
    }
    assert.equal(disari.hp, disari.maxHp, "seridin disindaki kule vuruldu");
    assert.equal(disariDuvar.hp, disariDuvar.maxHp, "seridin disindaki duvar vuruldu");
    assert.equal(dusman.hp, dusmanCani, "serit dusmana vurdu");
    assert.equal(room.teamHealth, 100, "serit nexusa vurdu");
    assert.equal(room.counterSurge, undefined, "serit bitince kalkmadi");
    const vuruslar = room.sent.filter((entry) => entry.type === "surge:hit").flatMap((entry) => entry.payload.hits);
    const ids = vuruslar.map((hit) => hit.towerId);
    assert.equal(new Set(ids).size, ids.length, "bir yapi iki kez vuruldu");
    assert.ok(ids.includes(ust.id) && ids.includes(alt.id) && ids.includes(reaktor.id) && ids.includes(icDuvar.id));
    assert.ok(!ids.includes(disari.id));
    assert.ok(vuruslar.every((hit) => hit.amount > 0));
  });
});

test("karşı atak önce uyarılıyor, sonra yavaşça iniyor", () => {
  sahteSaat((saat) => {
    const room = oda();
    const tepe = kur(room, "warrior-1", 5, 1);
    const dip = kur(room, "warrior-1", 5, 16);
    room.startCounterSurge(4, 3, saat.now);
    // Uyari: ust satirdaki kuleye bile dokunulmuyor, telde `warn` var.
    saat.now += COUNTER_SURGE_TELEGRAPH_MS - 100;
    room.updateCounterSurge(saat.now);
    assert.equal(tepe.hp, tepe.maxHp, "uyari evresinde vurdu");
    const uyari = room.getSnapshot().surges;
    assert.deepEqual(uyari, [{ id: room.counterSurge.id, col: 4, w: 3, p: 0, warn: true }]);
    // Kalkistan 10 sn sonra serit haritanin yarisina bile gelmemis.
    saat.now += 100 + 10_000;
    room.updateCounterSurge(saat.now);
    const kare = room.getSnapshot().surges[0];
    assert.equal(kare.warn, undefined);
    assert.ok(kare.p > 0 && kare.p < 0.5, `ilerleme ${kare.p}`);
    assert.ok(tepe.hp < tepe.maxHp, "tepedeki kule vurulmadi");
    assert.equal(dip.hp, dip.maxHp, "dipteki kule erken vuruldu");
    // Gecis suresi 25-40 sn araliginda.
    assert.ok(COUNTER_SURGE_CROSS_MS >= 25_000 && COUNTER_SURGE_CROSS_MS <= 40_000);
    assert.ok(COUNTER_SURGE_TELEGRAPH_MS >= 2500 && COUNTER_SURGE_TELEGRAPH_MS <= 4000);
  });
});

test("karşı atağın başlangıç sütunu tohuma göre değişiyor", () => {
  const cols = new Set();
  for (let seed = 1; seed <= 60; seed += 1) {
    const plan = planWaveSpecials({ stage: 5, wave: 12, slotCount: 40, cols: 12, random: createSpecialRandom(seed, 12) });
    if (plan?.surge) {
      cols.add(plan.surge.col);
      assert.ok(plan.surge.col >= 0 && plan.surge.col + plan.surge.width <= 12);
    }
  }
  assert.ok(cols.size >= 4, `yalnizca ${cols.size} farkli baslangic`);
  // Ayni tohum ayni plani veriyor.
  const a = planWaveSpecials({ stage: 4, wave: 9, slotCount: 30, cols: 12, random: createSpecialRandom(77, 9) });
  const b = planWaveSpecials({ stage: 4, wave: 9, slotCount: 30, cols: 12, random: createSpecialRandom(77, 9) });
  assert.deepEqual(a, b);
});

test("dalgada en fazla bir karşı atak; 4. dalgadan önce ve 1. aşamada hiç yok", () => {
  for (let stage = 1; stage <= 5; stage += 1) {
    for (let wave = 1; wave <= 20; wave += 1) {
      const chance = getCounterSurgeChance(stage, wave);
      if (stage === 1 || wave < 4) assert.equal(chance, 0, `${stage}/${wave}`);
      else assert.ok(chance >= 0.2 && chance <= 0.45, `${stage}/${wave}: ${chance}`);
    }
  }
  assert.ok(getCounterSurgeChance(5, 10) > getCounterSurgeChance(2, 10));

  // Gercek odada: seritli bir dalganin butun dogumlari tek serit baslatiyor.
  let found = false;
  for (let seed = 1; seed <= 80 && !found; seed += 1) {
    const room = oda(5);
    room.specialSeed = seed;
    room.planWaveSpawns(12);
    if (!room.waveSpecialPlan?.surge) continue;
    found = true;
    dalgayiDogur(room, 12);
    assert.ok(room.counterSurge, "serit baslamadi");
    assert.equal(room.nextCounterSurgeId, 2, "birden fazla serit basladi");
    room.maybeStartCounterSurge();
    assert.equal(room.nextCounterSurgeId, 2);
  }
  assert.ok(found, "seritli dalga bulunamadi");
});

test("karşı atak dalga değişince kalkıyor ve 1. aşamada snapshotta hiç yok", () => {
  const room = oda(1);
  for (let wave = 1; wave <= 20; wave += 1) {
    dalgayiDogur(room, wave);
    assert.equal(room.counterSurge, undefined);
    assert.equal(room.waveSpecialPlan, undefined);
    assert.ok(!("surges" in room.getSnapshot()), "1. asamada surges anahtari var");
  }
  const sonraki = oda(4);
  sonraki.startCounterSurge(2, 3);
  assert.ok(sonraki.getSnapshot().surges);
  sonraki.planWaveSpawns(5);
  assert.equal(sonraki.counterSurge, undefined);
});

// --- Enerji yiyici ------------------------------------------------------------------

test("enerji yiyici sol ya da sağ kenardan, nexusa dayanmadan doğuyor", () => {
  const sides = new Set();
  for (let seed = 1; seed <= 30; seed += 1) {
    const room = oda(2);
    room.specialRandom = createSpecialRandom(seed, 3);
    room.spawnSpecialEnemy({ index: 0, kind: "eater", replaced: 1 });
    const yiyici = [...room.enemies.values()].at(-1);
    const yer = hucre(room, yiyici);
    assert.ok(yer.col === 0 || yer.col === room.activeMap.cols - 1, `sutun ${yer.col}`);
    assert.ok(yer.row >= 1 && yer.row <= room.activeMap.rows - 1 - ENERGY_EATER_SPAWN_BOTTOM_MARGIN_ROWS, `satir ${yer.row}`);
    assert.equal(yiyici.movementKind, "ground");
    sides.add(yer.col === 0 ? "sol" : "sag");
  }
  assert.deepEqual([...sides].sort(), ["sag", "sol"]);
});

test("enerji yiyicinin canı normal düşmanın 1,5 katı", () => {
  const room = oda(2);
  room.wave = 7;
  room.spawnEnemy(undefined, { kind: "heater", type: "grunt", healthMultiplier: 1, start: gridToWorld(2, 0, room.activeMap) });
  const normal = [...room.enemies.values()].at(-1);
  room.specialRandom = createSpecialRandom(1, 7);
  room.spawnSpecialEnemy({ index: 0, kind: "eater", replaced: 1 });
  const yiyici = [...room.enemies.values()].at(-1);
  assert.ok(Math.abs(yiyici.maxHp / normal.maxHp - ENERGY_EATER_HP_MULTIPLIER) < 0.05, `${yiyici.maxHp} / ${normal.maxHp}`);
});

test("enerji yiyici en yakın enerji binasını emiyor, boşalınca yıkıyor ve sıradakine dönüyor", () => {
  const room = oda(2);
  const kule = kur(room, "warrior-1", 3, 7);
  const ilk = kur(room, "warrior-8", 5, 8);
  const ikinci = kur(room, "warrior-8", 9, 13);
  ilk.energy = 120;
  ikinci.energy = 120;
  const yiyici = ozel(room, "eater", 0, 6);
  assert.ok(sur(room, 30, () => ilk.energy < 120), "yiyici ilk binayi emmedi");
  assert.equal(ilk.hp, ilk.maxHp, "emme can vurusu degil");
  assert.equal(room.getSnapshot().enemies.find((entry) => entry.id === yiyici.id).drain, ilk.id, "telde emme yok");
  assert.ok(sur(room, 10, () => ilk.hp === 0), "bosalan bina yikilmadi");
  assert.equal(ilk.energy, 0, "emilen enerji bir yere gitmeli degil");
  assert.equal(kule.hp, kule.maxHp, "yiyici savas kulesine vurdu");
  assert.ok(sur(room, 40, () => ikinci.energy < 120), "yiyici ikinci binaya donmedi");
  // Emmiyorken telde alan yok.
  ikinci.energy = 0;
  sur(room, 2, () => ikinci.hp === 0);
  assert.equal(ikinci.hp, 0);
  room.updateEnemies(0.05);
  assert.ok(!("drain" in room.getSnapshot().enemies.find((entry) => entry.id === yiyici.id)), "emmeden sonra drain kaldi");
});

test("enerji binası kalmayınca yiyici nexusa iniyor", () => {
  const room = oda(2);
  kur(room, "warrior-1", 3, 7);
  const yiyici = ozel(room, "eater", 0, 6);
  assert.ok(sur(room, 120, () => !room.enemies.has(yiyici.id)), "yiyici nexusa inmedi");
  assert.ok(room.teamHealth < 100);
});

test("duvarla kapalı enerji binası için yiyici duvarı kırıyor", () => {
  const room = oda(2);
  const reaktor = kur(room, "warrior-8", 6, 8);
  reaktor.energy = 50;
  const duvarlar = cevir(room, 6, 8);
  ozel(room, "eater", 0, 8);
  assert.ok(sur(room, 30, () => Object.values(duvarlar).some((wall) => wall.hp < wall.maxHp)), "yiyici duvara vurmadi");
  assert.ok(duvarlar.left.hp < duvarlar.left.maxHp, "binaya en yakin yoldaki (sol) duvar degil");
  assert.equal(reaktor.energy, 50);
});

test("işçiler yıkılan enerji binasından sonra çökmeden diğer binaya dönüyor", () => {
  const room = oda(2);
  room.setupPhase = false;
  const ilk = kur(room, "warrior-8", 2, 9);
  const ikinci = kur(room, "warrior-8", 9, 9);
  ilk.energy = 40;
  ikinci.energy = 40;
  room.ensureLogisticsWorkers();
  const toplayici = room.drones.get("logistics-p1-crystalCollector");
  const tasiyici = room.drones.get("logistics-p1-energyTransport");
  assert.ok(toplayici && tasiyici);
  for (let tick = 0; tick < 40; tick += 1) room.updateDrones(50, 0.05);
  const bagli = toplayici.targetTowerId;
  assert.ok(bagli === ilk.id || bagli === ikinci.id, "toplayici reaktore baglanmadi");
  const hedef = bagli === ilk.id ? ilk : ikinci;
  const diger = hedef === ilk ? ikinci : ilk;
  hedef.energy = 0;
  const hedefHucre = worldToGrid(hedef.x, hedef.y, room.activeMap);
  ozel(room, "eater", hedefHucre.col, hedefHucre.row - 1);
  assert.ok(sur(room, 10, () => hedef.hp === 0), "yiyici binayi yikmadi");
  assert.doesNotThrow(() => {
    for (let tick = 0; tick < 120; tick += 1) {
      room.updateDrones(50, 0.05);
      room.updateEnemies(0.05);
    }
  });
  assert.equal(toplayici.targetTowerId, diger.id, "toplayici ayakta kalan reaktore donmedi");
  assert.ok(room.drones.has(tasiyici.id), "tasiyici kayboldu");
});

// --- Isitici --------------------------------------------------------------------------

test("ısıtıcı yalnızca yakınındaki ateş eden kuleleri ısıtıyor", () => {
  const room = oda(2);
  const yakin = kur(room, "warrior-1", 5, 6);
  const uzak = kur(room, "warrior-1", 9, 6);
  const reaktor = kur(room, "warrior-8", 7, 7);
  const yakinDuvar = duvar(room, 6, 7, "top");
  const isitici = ozel(room, "heater", 6, 7);
  isitici.speed = 0;
  room.applyHeaterHeat(isitici, 1);
  const beklenen = HEATER_HEAT_PER_SECOND_RATIO * 100;
  assert.ok(Math.abs(yakin.temperature - beklenen) < 0.001, `yakin kule ${yakin.temperature}`);
  assert.equal(uzak.temperature, 0, "uzak kule isindi");
  assert.equal(reaktor.temperature, 0, "kaynak binasi isindi");
  assert.equal(yakinDuvar.temperature, 0, "duvar isindi");
});

test("ısıtıcının ısısı kilit kuralına uyuyor ve normal yolda yürüyor", () => {
  const room = oda(2);
  const kule = kur(room, "warrior-1", 5, 6);
  const isitici = ozel(room, "heater", 6, 6);
  isitici.speed = 0;
  for (let step = 0; step < 100 && !kule.heatLocked; step += 1) room.applyHeaterHeat(isitici, 0.1);
  assert.equal(kule.heatLocked, true, "kule kilide girmedi");
  assert.ok(kule.temperature <= 100);
  // Isitici kendi basina nexusa yuruyor (yol alani yok, normal yol).
  const yuruyen = ozel(room, "heater", 2, 0);
  assert.ok(sur(room, 120, () => !room.enemies.has(yuruyen.id)), "isitici nexusa inmedi");
});

// --- Dogum plani ----------------------------------------------------------------------

test("1. aşamada özel düşman yok ve zar hiç atılmıyor", () => {
  const room = oda(1);
  const gercek = Math.random;
  let calls = 0;
  Math.random = () => {
    calls += 1;
    return gercek();
  };
  try {
    for (let wave = 1; wave <= 20; wave += 1) room.planWaveSpawns(wave);
  } finally {
    Math.random = gercek;
  }
  assert.equal(calls, 0, "1. asama plani zar atti");
  assert.equal(room.specialSeed, undefined);
  for (let wave = 1; wave <= 20; wave += 1) {
    assert.equal(getSpecialEnemyTotal(1, wave), 0);
    const spawned = dalgayiDogur(room, wave);
    assert.ok(spawned.every((enemy) => !enemy.special), `${wave}. dalgada ozel dusman`);
  }
});

test("2. aşamadan itibaren özel düşmanlar dalganın içinde doğuyor ve sayılar tabloya uyuyor", () => {
  for (const stage of [2, 3, 4, 5]) {
    for (const wave of [1, 4, 8, 13, 19]) {
      const room = oda(stage);
      room.specialSeed = 1000 + stage * 31 + wave;
      const spawned = dalgayiDogur(room, wave);
      const plan = room.waveSpecialPlan;
      assert.ok(plan, `${stage}/${wave}: plan yok`);
      const specials = spawned.filter((enemy) => enemy.special);
      assert.equal(specials.length, plan.spawns.length, `${stage}/${wave}: dogan ozel sayisi plandan farkli`);
      assert.ok(specials.length >= 1, `${stage}/${wave}: hic ozel yok`);
      assert.equal(spawned.length, room.waveTarget);
      for (const kind of ["hunter", "heater", "eater"]) {
        assert.equal(specials.filter((enemy) => enemy.special.kind === kind).length, plan.spawns.filter((spawn) => spawn.kind === kind).length);
      }
      assert.ok(spawned.length - specials.length >= 1, "dalga yalnizca ozel dusman");
    }
  }
});

test("plan tabloyu, tür kilitlerini ve payları tutuyor; dalga hiçbir zaman yalnızca özel düşman değil", () => {
  // 2. asama erken dalgalar adil: 1-2. dalga tek isitici.
  assert.equal(getSpecialEnemyTotal(2, 1), 1);
  assert.equal(getSpecialEnemyTotal(2, 2), 1);
  for (let wave = 1; wave < 20; wave += 1) {
    for (let stage = 2; stage <= 5; stage += 1) {
      assert.ok(getSpecialEnemyTotal(stage, wave + 1) >= getSpecialEnemyTotal(stage, wave), "dalgayla azaliyor");
      if (stage < 5) assert.ok(getSpecialEnemyTotal(stage + 1, wave) > getSpecialEnemyTotal(stage, wave), "asamayla artmiyor");
    }
  }
  let hunters = 0;
  let heaters = 0;
  for (let stage = 2; stage <= 5; stage += 1) {
    for (let wave = 1; wave <= 20; wave += 1) {
      for (const [scale, players] of [[1, 1], [2, 1], [2, 4]]) {
        const slots = getArenaWaveEnemyCount(wave, scale, players);
        const champion = getWaveChampionPlan(wave, slots);
        for (let seed = 1; seed <= 6; seed += 1) {
          const plan = planWaveSpecials({
            stage,
            wave,
            slotCount: slots,
            champion: champion ? { replaced: champion.replaced, slot: champion.slot } : undefined,
            cols: 12 * scale,
            random: createSpecialRandom(seed, wave)
          });
          const total = getWaveSpecialEnemyCount(stage, wave, slots);
          assert.ok(plan.spawns.length <= total);
          if (scale === 1 && players === 1 && stage === 2) assert.equal(plan.spawns.length, total, `2/${wave}: tablodan az`);
          assert.ok(plan.replaced <= Math.floor(slots * SPECIAL_MAX_SLOT_SHARE), "ozel pay asildi");
          const normal = slots - (champion ? champion.replaced : 0) - plan.replaced;
          assert.ok(normal >= Math.ceil(slots * SPECIAL_MIN_NORMAL_SHARE), `${stage}/${wave}: normal pay ${normal}/${slots}`);
          const spawnCount = slots - (champion ? champion.replaced - 1 : 0) - plan.spawns.reduce((sum, spawn) => sum + spawn.replaced - 1, 0);
          const indices = plan.spawns.map((spawn) => spawn.index);
          assert.equal(new Set(indices).size, indices.length, "ayni yere iki ozel");
          assert.ok(indices.every((index) => index >= 1 && index < spawnCount), "yer dalga disinda");
          if (champion) assert.ok(!indices.includes(champion.slot), "sampiyonun yerine ozel kondu");
          const kindCount = (kind) => plan.spawns.filter((spawn) => spawn.kind === kind).length;
          for (const kind of ["hunter", "heater", "eater"]) {
            if (wave < SPECIAL_KIND_FIRST_WAVE[kind][stage]) assert.equal(kindCount(kind), 0, `${stage}/${wave}: ${kind} erken`);
          }
          assert.ok(kindCount("hunter") <= TOWER_HUNTER_MAX_PER_WAVE[stage]);
          hunters += kindCount("hunter");
          heaters += kindCount("heater");
        }
      }
    }
  }
  assert.ok(hunters > 0, "hic avci yok");
  assert.ok(heaters > hunters * 2, `avci (${hunters}) isiticidan (${heaters}) seyrek degil`);
});

test("özel düşmanlar telde türleriyle gidiyor; normal düşmanın kaydında alan yok", () => {
  const room = oda(2);
  const normal = (room.spawnEnemy(), [...room.enemies.values()].at(-1));
  const isitici = ozel(room, "heater", 3, 0);
  assert.ok(!("special" in createStaticEnemySnapshot(normal)));
  assert.equal(createStaticEnemySnapshot(isitici).special, "heater");
  const spawnMessages = room.sent.filter((entry) => entry.type === "enemy:spawn");
  assert.equal(spawnMessages.at(-1).payload.special, "heater");
  const kare = room.getSnapshot();
  assert.ok(kare.enemies.every((entry) => !("drain" in entry)));
  assert.ok(!("surges" in kare));
});
