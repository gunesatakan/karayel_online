/**
 * Dalga sampiyonu.
 *
 * Erken dalgalarda dusmanin cogu tek vurusta oluyordu, yani hasar yukseltmesi
 * ekranda gorunmuyordu. Sampiyon tek, tacli, kalin bir govde: kulelerin ne
 * kadar guclendigini "kac saniyede devrildi" olarak gosteriyor. Zorlugu
 * degistirmemesi gerekiyor; testlerin tuttugu sozler:
 *
 *   1. Takvim: hangi dalgada sampiyon var, turu deterministik ve o dalganin
 *      karisimindan, karisik dalgada karada.
 *   2. Butce: sampiyonun efektif cani, altini, deneyimi ve sizinti hasari
 *      yerine gectigi dogumlarin beklenen toplamina esit (belgelenen
 *      yuvarlamayla); dalganin dusman sayisi sampiyonu bir sayiyor.
 *   3. Sunucu: dalgayi bu planla doguruyor, hava sirasi kaymiyor, oldurme ve
 *      sizinti butceyi yaziyor, ulti sarji ve itibar birim birim.
 *   4. Tel: bayrak yalnizca sampiyonun statik kaydinda.
 *   5. Devrilme mesaji: oyun saniyesi ve bir oncekinin suresi.
 *   6. 1. ve 2. dalga (ve sampiyonun basladigi dalgaya kadar hepsi) aynen.
 *   7. Agir dalga uyarisi: "Can ×1,49".
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  AIR_ENEMY_HEALTH_MULTIPLIER,
  CHAMPION_FIRST_WAVE,
  CHAMPION_HP_BONUS,
  CHAMPION_TYPE_ROTATION,
  ENEMY_MIX_BRUTE_FROM,
  ENEMY_MIX_RUNNER_FROM,
  ENEMY_MIX_SHOOTER_FROM,
  FEEDBACK_KIND_RULES,
  FINAL_WAVE,
  GAME_SPEED_MULTIPLIER,
  HEAVY_WAVE_HP_STEP,
  SIEGE_FIRST_WAVE,
  SIEGE_SPAWN_RATIO,
  formatChampionSeconds,
  formatWaveHpStep,
  getArenaWaveEnemyCount,
  getChampionDownText,
  getEffectiveHp,
  getEnemyCombatDefinition,
  getEnemyKillGold,
  getEnemyLeakDamage,
  getEnemyZeynepReputationGain,
  getEnemySpawnHealth,
  getHeavyWaveHpStep,
  getWaveAirMode,
  getWaveChampionPlan,
  getWaveChampionType,
  getWaveEnemyMaxHp,
  getWaveEnemyTypeWeights,
  getWaveHpMultiplier,
  getWaveHpStep,
  getWaveSlotExpectation,
  getWaveSpawnCount,
  getWaveSpawnIntervalMs,
  hasWaveChampion,
  isFlyingWaveSpawn,
  pickWaveEnemyType,
  sanitizeChampionDownMessage,
  splitChampionLeakDamage
} from "../packages/shared/dist/index.js";
import { createStaticEnemySnapshot } from "../apps/server/dist/snapshot/static-data.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const CHAMPION_WAVES = Array.from({ length: FINAL_WAVE }, (_, index) => index + 1).filter((wave) => hasWaveChampion(wave));

/** Tek oyuncu 1x, iki oyuncu 2x, dort oyuncu 4x: orijinal dogum sayilari. */
const SLOT_COUNTS = (wave) => [getArenaWaveEnemyCount(wave, 1, 1), getArenaWaveEnemyCount(wave, 2, 2), getArenaWaveEnemyCount(wave, 4, 4)];

function oda(characterId = "zeynep") {
  const room = createRoom(characterId);
  const yayinlar = [];
  room.broadcast = (type, payload) => yayinlar.push({ type, payload });
  const player = room.state.players.get("p1");
  Object.assign(player, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0 });
  return { room, yayinlar, player };
}

function withRandom(values, run) {
  const original = Math.random;
  let index = 0;
  Math.random = () => values[index++ % values.length];
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

function withClock(start, run) {
  const original = Date.now;
  const clock = { now: start };
  Date.now = () => clock.now;
  try {
    return run(clock);
  } finally {
    Date.now = original;
  }
}

/** Dalgayi odanin kendi dogurma yoluyla sonuna kadar doldurur. */
function dalgayiDogur(room, wave) {
  room.wave = wave;
  room.setupPhase = false;
  room.waveSpawned = 0;
  room.planWaveSpawns(wave);
  const dogumlar = [];
  const araliklar = [];
  let guard = 0;
  while (room.waveSpawned < room.waveTarget && guard++ < 1000) {
    room.spawnCooldownMs = 0;
    const before = room.enemies.size;
    room.updateSpawning(1);
    if (room.enemies.size > before) {
      dogumlar.push([...room.enemies.values()].at(-1));
      araliklar.push(room.spawnCooldownMs);
    }
  }
  return { dogumlar, araliklar };
}

test("takvim: 1-5. ve tam hava dalgalari sampiyonsuz, gerisinde tek ve karada", () => {
  assert.equal(CHAMPION_FIRST_WAVE, 6);
  const beklenen = [6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  assert.deepEqual(CHAMPION_WAVES, beklenen);
  for (let wave = 1; wave <= FINAL_WAVE; wave += 1) {
    for (const slots of SLOT_COUNTS(wave)) {
      const plan = getWaveChampionPlan(wave, slots);
      assert.equal(Boolean(plan), beklenen.includes(wave), `${wave}. dalga, ${slots} dogum`);
    }
  }
  // Tam hava dalgasinda hic yok; karisik dalgada var.
  assert.equal(getWaveAirMode(10), "all");
  assert.equal(getWaveChampionPlan(10, 35), undefined);
  assert.equal(getWaveAirMode(15), "mixed");
  assert.ok(getWaveChampionPlan(15, 71));
});

test("takvim: tur dalga numarasindan, deterministik ve o dalganin karisimindan", () => {
  assert.deepEqual([...CHAMPION_TYPE_ROTATION], ["grunt", "siege"]);
  for (const wave of CHAMPION_WAVES) {
    const type = getWaveChampionType(wave);
    assert.equal(type, wave % 2 === 0 ? "grunt" : "siege", `${wave}. dalga`);
    const mix = getWaveEnemyTypeWeights(wave);
    assert.ok(mix.some((entry) => entry.type === type && entry.weight > 0), `${wave}. dalganin karisiminda ${type} yok`);
    // Harita olcegi ve oyuncu sayisi turu degistirmiyor; plan tekrarlanabilir.
    for (const slots of SLOT_COUNTS(wave)) {
      assert.equal(getWaveChampionPlan(wave, slots).type, type);
      assert.deepEqual(getWaveChampionPlan(wave, slots), getWaveChampionPlan(wave, slots));
    }
  }
  // Kusatma 4. dalgadan once karisimda yok; sira onu atliyor.
  assert.equal(SIEGE_FIRST_WAVE, 4);
  assert.equal(getWaveChampionType(3, ["siege", "grunt"]), undefined, "3. dalga sampiyonsuz");
});

test("karisim: paylasilan zar eski esiklerle ayni, agirliklar zarin olasiliklari", () => {
  const eski = (wave, roll) => (wave >= 4 && roll < 0.18 ? "siege" : roll > 0.88 ? "brute" : roll > 0.66 ? "runner" : roll > 0.48 ? "shooter" : "grunt");
  assert.deepEqual([ENEMY_MIX_SHOOTER_FROM, ENEMY_MIX_RUNNER_FROM, ENEMY_MIX_BRUTE_FROM, SIEGE_SPAWN_RATIO], [0.48, 0.66, 0.88, 0.18]);
  for (const wave of [1, 3, 4, 9, 20]) {
    const counts = new Map();
    const steps = 20000;
    for (let index = 0; index < steps; index += 1) {
      const roll = (index + 0.5) / steps;
      const type = pickWaveEnemyType(wave, roll);
      assert.equal(type, eski(wave, roll), `${wave}. dalga zar ${roll}`);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    const weights = getWaveEnemyTypeWeights(wave);
    assert.ok(Math.abs(weights.reduce((sum, entry) => sum + entry.weight, 0) - 1) < 1e-12);
    for (const { type, weight } of weights) {
      assert.ok(Math.abs((counts.get(type) ?? 0) / steps - weight) < 1e-3, `${wave}. dalga ${type}`);
    }
  }
});

test("butce: can, altin, deneyim ve sizinti yerine gecilen dogumlarin toplamina esit", () => {
  for (const wave of CHAMPION_WAVES) {
    for (const slots of SLOT_COUNTS(wave)) {
      const plan = getWaveChampionPlan(wave, slots);
      const label = `${wave}. dalga, ${slots} dogum`;
      let effectiveHp = 0;
      let gold = 0;
      let exp = 0;
      let leak = 0;
      let reputation = 0;
      for (let index = plan.slot; index < plan.slot + plan.replaced; index += 1) {
        const slot = getWaveSlotExpectation(wave, index);
        effectiveHp += slot.effectiveHp;
        gold += slot.gold;
        exp += slot.exp;
        leak += slot.leakDamage;
        reputation += slot.reputation;
      }
      assert.ok(Math.abs(plan.reputation - reputation) <= 0.005 + 1e-9, `${label}: itibar ${plan.reputation} / ${reputation}`);
      const championHp = getEffectiveHp(getEnemySpawnHealth(plan.type, wave, plan.hpMultiple));
      // Can ve kalkan tam sayiya yuvarlaniyor: binde bes pay.
      // Can butcenin CHAMPION_HP_BONUS kati; odul butcede kaliyor.
      assert.ok(Math.abs(championHp - effectiveHp * CHAMPION_HP_BONUS) / (effectiveHp * CHAMPION_HP_BONUS) < 0.005, `${label}: can ${championHp} / ${effectiveHp * CHAMPION_HP_BONUS}`);
      assert.ok(Number.isInteger(plan.gold) && Math.abs(plan.gold - gold) <= 0.5, `${label}: altin ${plan.gold} / ${gold}`);
      assert.ok(Math.abs(plan.exp - exp) <= 0.005 + 1e-9, `${label}: deneyim ${plan.exp} / ${exp}`);
      assert.ok(Number.isInteger(plan.leakDamage) && Math.abs(plan.leakDamage - leak) <= 0.5, `${label}: sizinti ${plan.leakDamage} / ${leak}`);
      // Kalinlik belgelenen aralikta; dalganin yarisindan fazlasi sampiyona gitmiyor.
      assert.ok(plan.hpMultiple >= 4 * CHAMPION_HP_BONUS && plan.hpMultiple <= 6 * CHAMPION_HP_BONUS, `${label}: kat ${plan.hpMultiple}`);
      assert.ok(plan.replaced >= 2 && plan.replaced <= slots / 2, `${label}: ${plan.replaced} dogum`);
      // Sampiyon dalganin ortasinda; dalganin sayisi onu bir dusman sayiyor.
      assert.equal(plan.slot, Math.floor((slots - plan.replaced) / 2));
      assert.equal(getWaveSpawnCount(wave, slots), slots - plan.replaced + 1);
    }
  }
  // Sampiyonsuz dalgada sayi aynen.
  assert.equal(getWaveSpawnCount(2, 12), 12);
  assert.equal(getWaveSpawnCount(10, 35), 35);
});

test("butce: dalga toplami sampiyonlu ve sampiyonsuz ayni", () => {
  for (const wave of CHAMPION_WAVES) {
    const slots = getArenaWaveEnemyCount(wave, 1, 1);
    const plan = getWaveChampionPlan(wave, slots);
    const sum = (key, skip) => Array.from({ length: slots }, (_, index) => index)
      .filter((index) => !skip || index < plan.slot || index >= plan.slot + plan.replaced)
      .reduce((total, index) => total + getWaveSlotExpectation(wave, index)[key], 0);
    const champion = {
      effectiveHp: getEffectiveHp(getEnemySpawnHealth(plan.type, wave, plan.hpMultiple)) / CHAMPION_HP_BONUS,
      gold: plan.gold,
      exp: plan.exp,
      leakDamage: plan.leakDamage
    };
    for (const [key, tolerance] of [["effectiveHp", 0.005 * sum("effectiveHp")], ["gold", 0.5], ["exp", 0.005 + 1e-9], ["leakDamage", 0.5]]) {
      const before = sum(key, false);
      const after = sum(key, true) + champion[key];
      assert.ok(Math.abs(after - before) <= tolerance, `${wave}. dalga ${key}: ${before} -> ${after}`);
    }
  }
});

test("sizinti birimleri tam sayi ve toplami sizinti hasari", () => {
  for (const [damage, units] of [[35, 4], [26, 3], [44, 5], [61, 7], [7, 3]]) {
    const parts = splitChampionLeakDamage(damage, units);
    assert.equal(parts.length, units);
    assert.ok(parts.every(Number.isInteger));
    assert.equal(parts.reduce((sum, part) => sum + part, 0), damage);
    assert.ok(Math.max(...parts) - Math.min(...parts) <= 1);
  }
});

test("sunucu: dalga planla doguyor, sampiyon ortada ve tek, sayac sampiyonu bir sayiyor", () => {
  for (const wave of [6, 15]) {
    const { room } = oda();
    const { dogumlar, araliklar } = withClock(1_800_000_000_000, () => dalgayiDogur(room, wave));
    const slots = room.getScaledWaveEnemyCount(wave);
    const plan = getWaveChampionPlan(wave, slots);
    assert.equal(room.waveTarget, slots - plan.replaced + 1, `${wave}. dalga hedefi`);
    assert.equal(dogumlar.length, room.waveTarget);
    const champions = dogumlar.filter((enemy) => enemy.champion);
    assert.equal(champions.length, 1, `${wave}. dalgada tek sampiyon`);
    assert.equal(dogumlar.indexOf(champions[0]), plan.slot, "sampiyon kendi sirasinda dogdu");
    assert.equal(champions[0].type, plan.type);
    assert.equal(champions[0].movementKind, "ground", "sampiyon karada");
    // Hava sirasi orijinal dogum sirasindan: sampiyondan sonrakiler kaymiyor.
    dogumlar.forEach((enemy, index) => {
      if (enemy.champion) return;
      const slot = index < plan.slot ? index : index + plan.replaced - 1;
      assert.equal(enemy.movementKind === "air", isFlyingWaveSpawn(wave, slot), `${wave}. dalga ${index}. dogum`);
    });
    // Sampiyondan sonra yerine gectigi dogumlar kadar bekleniyor: dalganin suresi ayni.
    const interval = getWaveSpawnIntervalMs(wave);
    assert.equal(araliklar[plan.slot], interval * plan.replaced);
    assert.ok(araliklar.every((value, index) => index === plan.slot || value === interval));
  }
});

test("sunucu: sampiyon turunun kalin hali; direncler, zirh ve hiz turunden", () => {
  const { room } = oda();
  room.wave = 8;
  room.planWaveSpawns(8);
  const plan = room.waveChampionPlan;
  assert.equal(plan.type, "grunt");
  room.spawnEnemy(plan);
  const champion = [...room.enemies.values()].at(-1);
  // Ayni dalganin normal grunt'u: zar 0.3 kusatma esiginin ustunde, nisancinin altinda.
  withRandom([0.3, 0.5], () => room.spawnEnemy());
  const normal = [...room.enemies.values()].at(-1);
  assert.equal(normal.type, "grunt");
  assert.equal(normal.champion, undefined);

  const definition = getEnemyCombatDefinition("grunt");
  assert.equal(champion.maxHp, getWaveEnemyMaxHp(definition.maxHp, 8, plan.hpMultiple));
  assert.equal(champion.hp, champion.maxHp);
  assert.equal(champion.maxShield, Math.round(definition.shield * getWaveHpMultiplier(8) * plan.hpMultiple));
  assert.ok(Math.abs(champion.maxHp / normal.maxHp - plan.hpMultiple) < 0.01);
  assert.ok(Math.abs(champion.healthRegenPerSecond - normal.healthRegenPerSecond * plan.hpMultiple) < 1e-9);
  for (const key of ["race", "armor", "speed", "attack", "attackRange", "movementKind"]) {
    assert.deepEqual(champion[key], normal[key], key);
  }
  for (const key of ["damageResistances", "hitTypeResistances", "statusResistances", "abilities"]) {
    assert.deepEqual(champion[key], normal[key], key);
  }
});

test("sunucu: sampiyonu oldurmek yerine gectigi dogumlarin altinini, deneyimini, sarjini ve itibarini veriyor", () => {
  const { room, player } = oda("zeynep");
  room.wave = 7;
  room.planWaveSpawns(7);
  const plan = room.waveChampionPlan;
  room.spawnEnemy(plan);
  const champion = [...room.enemies.values()].at(-1);
  const gold = player.gold;
  const experience = player.experience;
  const reputation = player.reputation;
  assert.equal(room.damageEnemy(champion, 1e9, 0, "test", "p1", "true"), true);
  assert.equal(player.gold - gold, plan.gold);
  assert.ok(Math.abs(player.experience - experience - plan.exp) < 1e-9);
  assert.equal(player.ultimateCharge, 7 * plan.replaced, "ulti sarji birim birim");
  assert.equal(room.kills, 1, "oldurme sayaci sampiyonu bir sayiyor");

  // Itibar yerine gecilen karisimin agirlikli toplami (brute 4, nisanci 3,
  // digerleri 2): kendi turunun `replaced` kati degil, o eksik kalirdi.
  const { room: tekli, player: tekOyuncu } = oda("zeynep");
  tekli.wave = 7;
  withRandom([0.1, 0.5], () => tekli.spawnEnemy());
  const normal = [...tekli.enemies.values()].at(-1);
  assert.equal(normal.type, "siege");
  const before = tekOyuncu.reputation;
  tekli.damageEnemy(normal, 1e9, 0, "test", "p1", "true");
  const perBase = (tekOyuncu.reputation - before) / getEnemyZeynepReputationGain("siege");
  assert.ok(Math.abs((player.reputation - reputation) - plan.reputation * perBase) < 1e-9);
  assert.ok(plan.reputation > plan.replaced * getEnemyZeynepReputationGain(plan.type), "karisim kendi turunden agir");
  assert.deepEqual(["brute", "shooter", "grunt", "runner", "siege"].map(getEnemyZeynepReputationGain), [4, 3, 2, 2, 2]);
});

test("sunucu: sampiyonun sizintisi yerine gectigi dogumlarin hasari; kalkan birim birim tutuyor, defterde tek sizinti", () => {
  const sizdir = (room, plan) => {
    room.spawnEnemy(plan);
    const enemy = [...room.enemies.values()].at(-1);
    enemy.y = room.getArenaBottom() + room.getMapCellRadius() + 1;
    room.updateEnemies(0.016);
    assert.equal(room.enemies.has(enemy.id), false, "sampiyon cikmadi");
  };

  const { room } = oda();
  room.wave = 6;
  room.planWaveSpawns(6);
  const plan = room.waveChampionPlan;
  sizdir(room, plan);
  assert.equal(room.teamHealth, 100 - plan.leakDamage);

  const { room: kalkanli, player } = oda();
  kalkanli.wave = 6;
  kalkanli.planWaveSpawns(6);
  player.nexusShieldCharges = 2;
  sizdir(kalkanli, plan);
  const parts = splitChampionLeakDamage(plan.leakDamage, plan.replaced);
  assert.equal(player.nexusShieldCharges, 0, "iki sarj iki birimi tuttu");
  assert.equal(kalkanli.teamHealth, 100 - parts.slice(2).reduce((sum, part) => sum + part, 0));
  const karne = kalkanli.runLedger.closeWave(6, { slots: [0] });
  assert.equal(karne.l, 1, "sampiyon tek sizinti");
  assert.equal(karne.s ?? 0, 0, "nexus can kaybetti: kalkanda kalmadi");
  assert.equal(karne.h, 100 - kalkanli.teamHealth);

  // Tek sarj: bir birimi tutuyor, gerisi vuruyor; kalkan tuttu sayilmiyor.
  const { room: tekSarj, player: tekOyuncu } = oda();
  tekSarj.wave = 6;
  tekSarj.planWaveSpawns(6);
  tekOyuncu.nexusShieldCharges = 1;
  sizdir(tekSarj, plan);
  assert.equal(tekOyuncu.nexusShieldCharges, 0);
  assert.equal(tekSarj.teamHealth, 100 - parts.slice(1).reduce((sum, part) => sum + part, 0));
  assert.equal(tekSarj.runLedger.closeWave(6, { slots: [0] }).s ?? 0, 0);

  // Butun birimler kalkandaysa kalkan tuttu.
  const { room: tamKalkan, player: tamOyuncu } = oda();
  tamKalkan.wave = 6;
  tamKalkan.planWaveSpawns(6);
  tamOyuncu.nexusShieldCharges = plan.replaced;
  sizdir(tamKalkan, plan);
  assert.equal(tamKalkan.teamHealth, 100);
  const tamKarne = tamKalkan.runLedger.closeWave(6, { slots: [0] });
  assert.equal(tamKarne.s, 1);
  assert.equal(tamKarne.h ?? 0, 0);

  // Normal dusmanin sizintisi degismedi.
  assert.equal(getEnemyLeakDamage("grunt"), 8);
  assert.equal(getEnemyLeakDamage("brute"), 14);
});

test("tel: sampiyon bayragi yalnizca sampiyonun statik kaydinda", () => {
  const { room, yayinlar } = oda();
  room.wave = 9;
  room.planWaveSpawns(9);
  room.spawnEnemy();
  room.spawnEnemy(room.waveChampionPlan);
  const dogumlar = yayinlar.filter((entry) => entry.type === "enemy:spawn").map((entry) => JSON.parse(JSON.stringify(entry.payload)));
  assert.equal(dogumlar.length, 2);
  assert.equal("champion" in dogumlar[0], false, "normal dusmanda alan yok");
  assert.equal(dogumlar[1].champion, true);

  const sent = [];
  room.sendFullStaticSnapshot({ send: (type, payload) => sent.push({ type, payload }) });
  const full = JSON.parse(JSON.stringify(sent[0].payload));
  assert.deepEqual(full.enemies.map((enemy) => "champion" in enemy), [false, true]);

  // Karelerde hic yok: bayrak statik.
  const snapshot = JSON.parse(JSON.stringify(room.getSnapshot()));
  assert.ok(snapshot.enemies.every((enemy) => !("champion" in enemy)));

  // Modelin butce kaydi tele cikmiyor; yalnizca `true`.
  const model = [...room.enemies.values()].at(-1);
  assert.equal(createStaticEnemySnapshot(model).champion, true);
  assert.equal(typeof model.champion, "object");
});

test("devrilme mesaji: dogumdan olume oyun saniyesi, ikincide bir oncekinin suresi", () => {
  const { room, yayinlar } = oda();
  withClock(1_800_000_000_000, (clock) => {
    room.wave = 6;
    room.planWaveSpawns(6);
    room.spawnEnemy(room.waveChampionPlan);
    const first = [...room.enemies.values()].at(-1);
    clock.now += 13_250;
    room.damageEnemy(first, 1e9, 0, "test", "p1", "true");

    room.wave = 7;
    room.planWaveSpawns(7);
    room.spawnEnemy(room.waveChampionPlan);
    const second = [...room.enemies.values()].at(-1);
    clock.now += 15_125;
    room.damageEnemy(second, 1e9, 0, "test", "p1", "true");

    // Normal dusman mesaj yollamiyor.
    room.spawnEnemy();
    room.damageEnemy([...room.enemies.values()].at(-1), 1e9, 0, "test", "p1", "true");
  });
  const mesajlar = yayinlar.filter((entry) => entry.type === "champion:down").map((entry) => JSON.parse(JSON.stringify(entry.payload)));
  assert.equal(mesajlar.length, 2);
  assert.equal(GAME_SPEED_MULTIPLIER, 0.8);
  assert.equal(mesajlar[0].ms, Math.round(13_250 * GAME_SPEED_MULTIPLIER));
  assert.equal("prevMs" in mesajlar[0], false, "ilk sampiyonda onceki yok");
  assert.equal(mesajlar[1].ms, Math.round(15_125 * GAME_SPEED_MULTIPLIER));
  assert.equal(mesajlar[1].prevMs, mesajlar[0].ms);
  assert.deepEqual(Object.keys(mesajlar[1]).sort(), ["enemyId", "ms", "prevMs", "x", "y"], "mesaj kucuk kaliyor");

  assert.equal(getChampionDownText(mesajlar[1]), "ŞAMPİYON DEVRİLDİ · 12,1 sn (önceki 10,6)");
  assert.equal(getChampionDownText({ ms: 10_600 }), "ŞAMPİYON DEVRİLDİ · 10,6 sn");
  assert.equal(formatChampionSeconds(10_640), "10,6");
  assert.equal(sanitizeChampionDownMessage({ enemyId: "e1", ms: "x", x: 0, y: 0 }), undefined);
  assert.equal(sanitizeChampionDownMessage({ enemyId: "e1", ms: -5, x: 0, y: 0 }), undefined);
  assert.deepEqual(sanitizeChampionDownMessage({ enemyId: "e1", ms: 10, x: 1, y: 2, prevMs: Number.NaN }), { enemyId: "e1", ms: 10, x: 1, y: 2 });
});

test("1. ve 2. dalga aynen: sampiyon kurali kapali odayla bire bir ayni dogumlar", () => {
  const ozet = (enemy) => [enemy.type, enemy.maxHp, enemy.maxShield, enemy.movementKind, enemy.healthRegenPerSecond, enemy.speed, Boolean(enemy.champion)];
  const seeded = (seed) => { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; };
  for (let wave = 1; wave < CHAMPION_FIRST_WAVE; wave += 1) {
    const kosu = (enabled) => {
      const original = Math.random;
      Math.random = seeded(wave * 97);
      try {
        const { room } = oda();
        room.championsEnabled = enabled;
        return { target: (dalgayiDogur(room, wave), room.waveTarget), dogumlar: [...room.enemies.values()].map(ozet) };
      } finally {
        Math.random = original;
      }
    };
    const acik = withClock(1_800_000_000_000, () => kosu(true));
    const kapali = withClock(1_800_000_000_000, () => kosu(false));
    assert.equal(acik.target, getArenaWaveEnemyCount(wave, 1, 1), `${wave}. dalganin sayisi`);
    assert.deepEqual(acik, kapali, `${wave}. dalga degisti`);
    assert.ok(acik.dogumlar.every((entry) => entry[6] === false));
  }
});

test("sampiyon kurali kapali oda eski davranisi aynen surduruyor (olcum dayanagi)", () => {
  const { room } = oda();
  room.championsEnabled = false;
  const { dogumlar } = withClock(1_800_000_000_000, () => dalgayiDogur(room, 8));
  assert.equal(dogumlar.length, getArenaWaveEnemyCount(8, 1, 1));
  assert.ok(dogumlar.every((enemy) => !enemy.champion));
});

test("agir dalga: dusman basina can adimi bir onceki kara dalgasina gore", () => {
  assert.equal(HEAVY_WAVE_HP_STEP, 1.35);
  const heavy = [];
  for (let wave = 1; wave <= FINAL_WAVE; wave += 1) {
    if (getHeavyWaveHpStep(wave) !== undefined) heavy.push(wave);
  }
  assert.deepEqual(heavy, [6, 7, 8, 9, 11]);
  // 6. dalga 4'e (5 tam hava), 11. dalga 9'a gore.
  assert.ok(Math.abs(getWaveHpStep(6) - getWaveHpMultiplier(6) / getWaveHpMultiplier(4)) < 1e-12);
  assert.ok(Math.abs(getWaveHpStep(11) - getWaveHpMultiplier(11) / getWaveHpMultiplier(9)) < 1e-12);
  assert.equal(getWaveHpStep(1), undefined);
  assert.equal(getWaveHpStep(5), undefined, "tam hava dalgasi olcu disi");
  assert.equal(getWaveHpStep(10), undefined);
  assert.ok(Math.abs(getWaveHpStep(13) - 1.17) < 1e-9, "tam egride adim 1.17");
  assert.equal(formatWaveHpStep(getWaveHpStep(8)), "Can ×1,49");
  assert.equal(formatWaveHpStep(getWaveHpStep(6)), "Can ×1,53");
  assert.equal(formatWaveHpStep(1.4), "Can ×1,40");
});

test("geri bildirim: sampiyon etiketleri P1, takimin ortak ani, sessiz ve sarsintisiz", () => {
  for (const kind of ["champion", "championDown"]) {
    const rule = FEEDBACK_KIND_RULES[kind];
    assert.equal(rule.channel, "label");
    assert.equal(rule.ownPriority, 1);
    assert.equal(rule.shakePx, 0);
    assert.equal(rule.vibrateMs, 0);
    assert.equal(rule.soundMs, 0);
  }
  assert.ok(FEEDBACK_KIND_RULES.champion.visualGapMs > 0, "dogus etiketi hiz sinirli");
  assert.equal(FEEDBACK_KIND_RULES.championDown.visualGapMs, 0, "devrilme damgasi dogus etiketine takilmiyor");
});

test("ucan ve oldurme altini paylasilan sayilardan", () => {
  assert.equal(AIR_ENEMY_HEALTH_MULTIPLIER, 0.25);
  assert.equal(getEnemyKillGold("grunt"), 18);
  assert.equal(getEnemyKillGold("brute"), 27);
});

test("ilk dalga secenegi sabitin altina da iniyor (olcum icin)", () => {
  assert.equal(getWaveChampionPlan(3, 13), undefined);
  const plan = getWaveChampionPlan(3, 13, { firstWave: 3 });
  assert.ok(plan, "3. dalga plani yok");
  // 3. dalga tek ama kusatma 4. dalgadan once karisimda yok: sira grunt'a geciyor.
  assert.equal(plan.type, "grunt");
  assert.equal(hasWaveChampion(3, 3), true);
  assert.equal(hasWaveChampion(5, 3), false, "tam hava dalgasi yine sampiyonsuz");
  assert.equal(getWaveChampionType(4, undefined, 3), "grunt");
  assert.equal(getWaveChampionPlan(7, 23, { firstWave: 8 }), undefined);
});

test("iki oyuncu: sampiyonun cani ve kalkani oyuncu carpani x kalinlik", () => {
  const { room, player } = oda();
  room.state.players.set("p2", { ...player, id: "p2", slot: 1, runModifiers: [], ownedCardIds: [], hiredWorkers: [] });
  room.wave = 8;
  room.planWaveSpawns(8);
  const plan = room.waveChampionPlan;
  assert.equal(plan.slot, getWaveChampionPlan(8, room.getScaledWaveEnemyCount(8)).slot);
  assert.equal(room.getScaledWaveEnemyCount(8), getArenaWaveEnemyCount(8, room.mapScale, 2));
  room.spawnEnemy(plan);
  const champion = [...room.enemies.values()].at(-1);
  const definition = getEnemyCombatDefinition(plan.type);
  const multiplayer = 1.45;
  assert.ok(Math.abs(champion.maxHp - getWaveEnemyMaxHp(definition.maxHp, 8, plan.hpMultiple) * multiplayer) < 1e-9);
  assert.equal(champion.maxShield, Math.round(definition.shield * getWaveHpMultiplier(8) * plan.hpMultiple * multiplayer));
  // Ayni turun normal dusmanina orani yine kalinlik.
  withRandom([0.3, 0.5], () => room.spawnEnemy());
  const normal = [...room.enemies.values()].at(-1);
  assert.equal(normal.type, plan.type);
  assert.ok(Math.abs(champion.maxHp / normal.maxHp - plan.hpMultiple) < 0.01);
});

test("seri ve kule oldurme yiginlari sampiyonu yerine gectigi dogumlar kadar sayiyor", () => {
  const { room } = oda("warrior");
  room.wave = 6;
  room.planWaveSpawns(6);
  const plan = room.waveChampionPlan;
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1", send() {} }, { ...spot, definitionId: "warrior-1" });
  const tower = [...room.towers.values()].at(-1);
  assert.ok(tower, "kule kurulamadi");
  const killTriggers = [];
  room.applyTowerStacksForTrigger = (target, trigger) => { if (trigger === "kill") killTriggers.push(target.id); };
  const towerHasUnlock = room.towerHasUnlock.bind(room);
  room.towerHasUnlock = (target, unlock) => (unlock === "stack:kill" ? Boolean(target) : towerHasUnlock(target, unlock));
  withClock(1_800_000_000_000, () => {
    room.spawnEnemy(plan);
    const champion = [...room.enemies.values()].at(-1);
    room.finishEnemyKill(champion, { sourceOwnerId: "p1", sourceTowerId: tower.id, sourceDefinitionId: "test", now: Date.now(), killAssists: [] });
  });
  assert.equal(killTriggers.length, plan.replaced, "kule 'kill' tetigi birim birim");
  assert.equal(tower.shopKillStacks, plan.replaced, "stack:kill birim birim");
  assert.equal(room.playerKillStreakTimes.get("p1").length, plan.replaced, "seri penceresine birim birim");
  assert.equal(room.kills, 1, "oldurme sayaci dusman basina");

  // Bir normal oldurme daha: 4 + 1 = 5 oldurme, 2 sn icinde -> ilk seri kademesi.
  assert.equal(plan.replaced, 4);
  const events = [];
  withClock(1_800_000_000_500, () => {
    room.spawnEnemy();
    room.damageEnemy([...room.enemies.values()].at(-1), 1e9, 0, "test", "p1", "true");
    for (const event of room.killEvents.values()) events.push(event.streakTier);
  });
  assert.ok(events.includes("granted"), "sampiyon ve bir oldurme seriyi acti");
});

test("Melis'in cevirdigi sampiyon olurken butcesini oduyor; cevrilen normal dusman eskisi gibi odulsuz", () => {
  const cevrilmis = (room, plan, evolution) => {
    room.spawnEnemy(plan);
    const enemy = [...room.enemies.values()].at(-1);
    Object.assign(enemy, {
      melisWhisperTurnedUntil: Date.now() + 60_000,
      melisWhisperTurnedOwnerId: "p1",
      melisWhisperTurnedSourceTowerId: "",
      melisWhisperTurnedEvolutionLevel: evolution
    });
    return enemy;
  };

  for (const evolution of [1, 3]) {
    const { room, player, yayinlar } = oda("archer");
    room.wave = 9;
    room.planWaveSpawns(9);
    const plan = room.waveChampionPlan;
    const gold = player.gold;
    const experience = player.experience;
    withClock(1_800_000_000_000, (clock) => {
      const champion = cevrilmis(room, plan, evolution);
      clock.now += 5000;
      // Evrim 3: yuzde onun altina dusunce patlayarak oluyor; evrim 1: cani bitince.
      room.damageMelisWhisperTurnedBlocker(champion, evolution === 3 ? champion.hp * 0.95 : champion.hp + 1);
      assert.equal(room.enemies.has(champion.id), false, `evrim ${evolution}: sampiyon kalkmadi`);
    });
    assert.equal(player.gold - gold, plan.gold, `evrim ${evolution}: altin`);
    assert.ok(Math.abs(player.experience - experience - plan.exp) < 1e-9, `evrim ${evolution}: deneyim`);
    assert.equal(room.kills, 1);
    assert.equal(player.ultimateCharge, 7 * plan.replaced);
    const down = yayinlar.filter((entry) => entry.type === "champion:down");
    assert.equal(down.length, 1, `evrim ${evolution}: devrilme mesaji`);
    assert.equal(down[0].payload.ms, Math.round(5000 * GAME_SPEED_MULTIPLIER));
    assert.equal([...room.killEvents.values()].filter((event) => event.ownerId === "p1").length, 1, "kredi ceviren oyuncuya");
  }

  const { room, player } = oda("archer");
  room.wave = 9;
  const gold = player.gold;
  const normal = cevrilmis(room, undefined, 1);
  room.damageMelisWhisperTurnedBlocker(normal, normal.hp + 1);
  assert.equal(room.enemies.has(normal.id), false);
  assert.equal(player.gold, gold, "cevrilen normal dusman odul vermiyor");
  assert.equal(room.kills, 0);
});

test("yaratici patlama sampiyonun sirasini gecse de sampiyon bir kez doguyor", () => {
  const { room } = oda("warrior");
  room.creativeMode = true;
  const client = { sessionId: "p1", send() {} };
  room.creativeSetWave(client, { wave: 8 });
  const plan = room.waveChampionPlan;
  const target = room.waveTarget;
  assert.equal(target, getWaveSpawnCount(8, room.getScaledWaveEnemyCount(8)));
  room.creativeSpawnEnemies(client, { count: plan.slot + 3 });
  const champions = () => [...room.enemies.values()].filter((enemy) => enemy.champion);
  assert.equal(champions().length, 1, "patlama sampiyonu atladi");
  assert.equal(room.waveTarget, target, "hedef sayac dogru kaldi");
  room.creativeSpawnEnemies(client, { count: 5 });
  assert.equal(champions().length, 1, "ikinci sampiyon dogdu");
});
