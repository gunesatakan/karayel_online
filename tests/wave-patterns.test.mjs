/**
 * Dalga paternleri: karisim ve ritim dalgayla degisiyor.
 *
 * Eskiden her dalga ayni tarifin buyumus haliydi. Testlerin tuttugu sozler:
 *   1. Secim: 1. dalga dengeli, erken dalgalar sade (her paternin ilk
 *      dalgasi), ayni patern uc dalga ust uste yok, hava dalgalari yerinde
 *      (5/10 hava akini, 15/20 karma hucum), asama agirliklari gercekten
 *      asamayi ayiriyor (Sürü suru, Düşüş zirhli kol).
 *   2. Belirlenim: ayni tohum ayni dizi, ayni karisim, ayni sira; farkli
 *      tohum farkli dizi.
 *   3. Butce: efektif can, oldurme altini ve deneyim bugunku karisimin
 *      beklenen toplamina yakin (patern sayiyi degistiriyor, butceyi degil).
 *   4. Ritim: baskin kisa, sizma uzun, yiginlar arasinda sessizlik; kanat ve
 *      serit girisi gercekten dar sutunlardan.
 *   5. Sunucu: dogan tur plandan, odul olcekli, sampiyon ve hava kurali
 *      eskisi gibi; ongoru paterni tasiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FINAL_WAVE,
  GROUND_WAVE_PATTERN_IDS,
  STAGE_WAVE_FLAVOR,
  WAVE_PATTERN_IDS,
  WAVE_PATTERN_MAX_COUNT_FACTOR,
  WAVE_PATTERN_MIN_COUNT_FACTOR,
  WAVE_PATTERN_TABLE,
  ENEMY_REWARD_MULTIPLIER,
  getArenaWaveEnemyCount,
  getDefaultWaveSlotBudget,
  getEnemyCombatDefinition,
  getEnemyExp,
  getWaveAirMode,
  getWaveChampionPlan,
  getWavePattern,
  getWavePatternBudget,
  getWavePatternEntryColumns,
  getWavePatternSequence,
  getWavePatternShares,
  getWavePatternSlotDelayMs,
  getWaveSpawnIntervalMs,
  hasWaveChampion,
  isFlyingWaveSpawn,
  planWavePattern,
  stageCatalog,
  worldToGrid
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";
import { importWebModule } from "./helpers/web-module.mjs";

const SEEDS = Array.from({ length: 400 }, (_, index) => index * 7919 + 13);

function sayilar(types) {
  const counts = {};
  for (const type of types) counts[type] = (counts[type] ?? 0) + 1;
  return counts;
}

function sure(plan) {
  let total = 0;
  for (let slot = 0; slot < plan.slotCount - 1; slot += 1) total += getWavePatternSlotDelayMs(plan, slot);
  return total;
}

// --- Secim ------------------------------------------------------------------------------

test("secim: 1. dalga dengeli, erken dalgalar sade, hava dalgalari yerinde, ayni patern uc kez ust uste yok", () => {
  for (const stage of [1, 2, 3, 4, 5]) {
    for (const seed of SEEDS) {
      const sequence = getWavePatternSequence(stage, seed);
      assert.equal(sequence.length, FINAL_WAVE);
      assert.equal(sequence[0], "balanced", `${stage}/${seed}: 1. dalga`);
      for (let wave = 1; wave <= FINAL_WAVE; wave += 1) {
        const pattern = sequence[wave - 1];
        assert.ok(WAVE_PATTERN_IDS.includes(pattern));
        const air = getWaveAirMode(wave);
        if (air === "all") assert.equal(pattern, "airRaid", `${wave}. dalga tam hava`);
        else if (air === "mixed") assert.equal(pattern, "airMixed", `${wave}. dalga karisik hava`);
        else {
          assert.ok(GROUND_WAVE_PATTERN_IDS.includes(pattern), `${wave}. dalga kara paterni degil: ${pattern}`);
          assert.ok(wave >= WAVE_PATTERN_TABLE[pattern].minWave, `${stage}/${seed}: ${pattern} ${wave}. dalgada erken`);
          assert.ok((STAGE_WAVE_FLAVOR[stage].patterns[pattern] ?? 0) > 0, `${stage}. asamada ${pattern} yok`);
        }
        if (wave >= 3) {
          assert.ok(!(sequence[wave - 3] === pattern && sequence[wave - 2] === pattern), `${stage}/${seed}: ${pattern} uc kez ust uste (${wave})`);
        }
        // Tek dalganin sorgusu dizinin kendisi.
        if (seed === SEEDS[0]) assert.equal(getWavePattern(stage, wave, seed), pattern);
      }
    }
  }
  // Erken dalgalar: 2. dalgaya kadar yalnizca dengeli ve sizma; yigin ve kiskac ancak sonra.
  assert.equal(WAVE_PATTERN_TABLE.balanced.minWave, 1);
  assert.ok(WAVE_PATTERN_TABLE.swarm.minWave >= 3 && WAVE_PATTERN_TABLE.armored.minWave >= 6 && WAVE_PATTERN_TABLE.burst.minWave >= 8);
});

test("asama tadi: her asamanin kendi agirligi; Sürü suru, Düşüş zirhli kol ve kiskac, Taş Kuşatma dengeli", () => {
  assert.deepEqual(Object.keys(STAGE_WAVE_FLAVOR).map(Number), stageCatalog.map((stage) => stage.id));
  const frekans = (stage) => {
    const counts = {};
    for (const seed of SEEDS) for (const pattern of getWavePatternSequence(stage, seed)) counts[pattern] = (counts[pattern] ?? 0) + 1;
    return counts;
  };
  const f = Object.fromEntries([1, 2, 3, 4, 5].map((stage) => [stage, frekans(stage)]));
  const enCok = (stage) => Object.entries(f[stage]).filter(([pattern]) => GROUND_WAVE_PATTERN_IDS.includes(pattern)).sort((a, b) => b[1] - a[1])[0][0];
  // Sürü (3. asama) en cok suru; suru orada her asamadan sik.
  assert.equal(enCok(3), "swarm");
  for (const stage of [1, 2, 4, 5]) assert.ok(f[3].swarm > f[stage].swarm * 1.5, `suru 3. asamada ${f[3].swarm}, ${stage}. asamada ${f[stage].swarm}`);
  // Düşüş zirhli kola ve kiskaca yaslaniyor; Sürü zirhli kola neredeyse hic.
  assert.ok(f[4].armored > f[3].armored * 3 && f[4].pincer > f[1].pincer * 2);
  // Çelik Hat menzilli taciz; Katlanma yigin.
  assert.ok(f[2].ranged > f[3].ranged * 2 && f[5].burst > f[1].burst * 2);
  // Tur tadi: ayni dengeli dalgada Sürü'de kosucu payi, Taş Kuşatma'da brute payi yuksek.
  const shares = (stage) => getWavePatternShares("balanced", stage, 12);
  assert.ok(shares(3).get("runner") > shares(1).get("runner") * 1.6);
  assert.ok(shares(1).get("brute") > shares(3).get("brute") * 1.8);
  // Farkli asamalarin dizileri ayni tohumda bile farkli bir dagilim.
  assert.notDeepEqual(f[3], f[4]);
});

test("belirlenim: ayni tohum ayni plan, farkli tohum farkli dizi; kusatma 4. dalgadan once yok", () => {
  for (const stage of [1, 3, 5]) {
    for (const wave of [1, 6, 12, 19]) {
      const input = { stage, wave, baseSlotCount: getArenaWaveEnemyCount(wave, 2, 2), seed: 424242 };
      assert.deepEqual(planWavePattern(input), planWavePattern({ ...input }));
    }
  }
  const diziler = new Set(SEEDS.slice(0, 50).map((seed) => getWavePatternSequence(4, seed).join(",")));
  assert.ok(diziler.size >= 45, `50 tohumda ${diziler.size} farkli dizi`);
  for (const seed of SEEDS.slice(0, 50)) {
    for (const wave of [1, 2, 3]) {
      for (const stage of [1, 2, 3, 4, 5]) {
        const plan = planWavePattern({ stage, wave, baseSlotCount: 40, seed });
        assert.ok(!plan.types.includes("siege"), `${wave}. dalgada kusatma`);
      }
    }
  }
});

// --- Butce ------------------------------------------------------------------------------

test("butce: efektif can, altin ve deneyim bugunku karisimin beklenen toplamina yakin; sayi paternle degisiyor", () => {
  let minHp = Infinity;
  let maxHp = 0;
  const factors = {};
  for (const seed of SEEDS.slice(0, 120)) {
    for (const stage of [1, 2, 3, 4, 5]) {
      for (let wave = 1; wave <= FINAL_WAVE; wave += 1) {
        for (const [scale, players] of [[1, 1], [2, 2], [4, 3]]) {
          const base = getArenaWaveEnemyCount(wave, scale, players);
          const plan = planWavePattern({ stage, wave, baseSlotCount: base, seed });
          assert.equal(plan.types.length, plan.slotCount);
          const factor = plan.slotCount / base;
          assert.ok(factor >= WAVE_PATTERN_MIN_COUNT_FACTOR - 0.05 && factor <= WAVE_PATTERN_MAX_COUNT_FACTOR + 0.05, `sayi kati ${factor}`);
          (factors[plan.pattern] ??= []).push(factor);
          const budget = getWavePatternBudget(plan);
          const today = getDefaultWaveSlotBudget(wave);
          const hp = budget.effectiveHp / (base * today.effectiveHp);
          // Kucuk dalgada tam sayi yuvarlamasi pay aliyor; 20+ dogumda dar bant.
          const band = base >= 20 ? 0.08 : 0.2;
          assert.ok(Math.abs(hp - 1) <= band, `${stage}/${wave}/${plan.pattern}/${base}: can ${hp.toFixed(3)}`);
          minHp = Math.min(minHp, hp);
          maxHp = Math.max(maxHp, hp);
          assert.ok(Math.abs(budget.gold / (base * today.gold) - 1) < 1e-3, "altin butcesi (olcek dort basamak)");
          assert.ok(Math.abs(budget.exp / (base * today.exp) - 1) < 1e-3, "deneyim butcesi");
        }
      }
    }
  }
  const ortalama = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  // Suru kalabalik, zirhli kol seyrek, dengeli bugunku sayi civarinda.
  assert.ok(ortalama(factors.swarm) > 1.35, `suru ${ortalama(factors.swarm)}`);
  assert.ok(ortalama(factors.armored) < 0.8, `zirhli ${ortalama(factors.armored)}`);
  assert.ok(Math.abs(ortalama(factors.balanced) - 1) < 0.15, `dengeli ${ortalama(factors.balanced)}`);
  assert.ok(minHp > 0.8 && maxHp < 1.2);
});

test("butce: sunucunun gercek oldurme altini (yuvarlamali) bugunku beklenenin %5'i icinde", () => {
  for (const seed of SEEDS.slice(0, 40)) {
    for (const stage of [1, 3, 4]) {
      for (const wave of [8, 12, 16, 19]) {
        const base = getArenaWaveEnemyCount(wave, 1, 1);
        const plan = planWavePattern({ stage, wave, baseSlotCount: base, seed });
        // Sunucu: `max(1, round(reward * goldScale * 1.5))`.
        const gold = plan.types.reduce((sum, type) => sum + Math.max(1, Math.round(getEnemyCombatDefinition(type).reward * plan.goldScale * ENEMY_REWARD_MULTIPLIER)), 0);
        const exp = plan.types.reduce((sum, type) => sum + getEnemyExp(wave, type, "ground") * plan.expScale, 0);
        const today = getDefaultWaveSlotBudget(wave);
        assert.ok(Math.abs(gold / (base * today.gold) - 1) < 0.05, `${stage}/${wave}/${plan.pattern}: altin ${gold} / ${base * today.gold}`);
        assert.ok(Math.abs(exp / (base * today.exp) - 1) < 1e-3);
      }
    }
  }
});

test("karisim: suru kosucu, zirhli kol brute ve kusatma, menzilli taciz nisanci ve onde piyade perdesi", () => {
  const find = (pattern, stage = 4) => {
    for (const seed of SEEDS) {
      for (let wave = 9; wave <= 19; wave += 1) {
        if (getWavePattern(stage, wave, seed) === pattern) return planWavePattern({ stage, wave, baseSlotCount: getArenaWaveEnemyCount(wave, 1, 1), seed });
      }
    }
    throw new Error(`${pattern} bulunamadi`);
  };
  const swarm = sayilar(find("swarm").types);
  assert.ok(swarm.runner > (swarm.grunt ?? 0) * 2 && !swarm.brute && !swarm.shooter);
  const armored = find("armored");
  const armoredCounts = sayilar(armored.types);
  assert.ok(armoredCounts.brute > armored.slotCount * 0.4 && !armoredCounts.runner);
  // Zirhli kolda brute'lar her parcanin onunde.
  for (let start = 0; start + 6 <= armored.types.length; start += 6) {
    const chunk = armored.types.slice(start, start + 6);
    const lastBrute = chunk.lastIndexOf("brute");
    if (lastBrute >= 0) assert.ok(chunk.slice(0, lastBrute).every((type) => type === "brute"), `parca ${chunk}`);
  }
  const ranged = find("ranged");
  const rangedCounts = sayilar(ranged.types);
  assert.ok(rangedCounts.shooter > 0 && rangedCounts.grunt > 0 && Object.keys(rangedCounts).length === 2);
  for (let start = 0; start + 6 <= ranged.types.length; start += 6) {
    const chunk = ranged.types.slice(start, start + 6);
    const firstShooter = chunk.indexOf("shooter");
    if (firstShooter >= 0) assert.ok(chunk.slice(firstShooter).every((type) => type === "shooter"), `perde onde degil: ${chunk}`);
  }
  // Birim efektif can: suru ince, zirhli kalin (ayni dalgada kiyas).
  const unit = (plan) => getWavePatternBudget(plan).effectiveHp / plan.slotCount;
  const at = (pattern, wave) => planWavePattern({ stage: 4, wave, baseSlotCount: 60, seed: SEEDS.find((seed) => getWavePattern(4, wave, seed) === pattern) });
  assert.ok(unit(at("armored", 14)) > unit(at("balanced", 14)) * 1.25, "zirhli kol kalin degil");
  assert.ok(unit(at("swarm", 14)) < unit(at("balanced", 14)) * 0.8, "suru ince degil");
});

// --- Ritim ------------------------------------------------------------------------------

test("ritim: baskin kisa, sizma uzun, yiginlar arasinda sessizlik; giris sutunlari gercekten daraliyor", () => {
  const wave = 12;
  const base = getArenaWaveEnemyCount(wave, 1, 1);
  const forced = (pattern) => {
    for (const seed of SEEDS) if (getWavePattern(4, wave, seed) === pattern) return planWavePattern({ stage: 4, wave, baseSlotCount: base, seed });
    for (const seed of SEEDS) if (getWavePattern(5, wave, seed) === pattern) return planWavePattern({ stage: 5, wave, baseSlotCount: base, seed });
    throw new Error(pattern);
  };
  const balanced = forced("balanced");
  const today = (balanced.slotCount - 1) * getWaveSpawnIntervalMs(wave);
  const rush = forced("rush");
  const trickle = forced("trickle");
  const burst = forced("burst");
  const pincer = forced("pincer");
  assert.equal(balanced.intervalMs, getWaveSpawnIntervalMs(wave));
  assert.equal(sure(balanced), today, "dengeli: bugunku aralik");
  assert.ok(sure(rush) < sure(balanced) * 0.75, `baskin ${sure(rush)} / ${sure(balanced)}`);
  assert.ok(sure(trickle) > sure(balanced) * 1.3, `sizma ${sure(trickle)} / ${sure(balanced)}`);
  // Yigin: uc yigin (serit), yigin ici aralik tabanin cok altinda ve
  // sessizlik yok (sahibinin istegi): dalga hic beklemeden, cok hizli geliyor.
  assert.equal(burst.groups, 3);
  assert.ok(burst.intervalMs < getWaveSpawnIntervalMs(wave) * 0.5);
  assert.equal(burst.pauseMs, 0, "yiginlar arasi sessizlik kalkti");
  const delays = Array.from({ length: burst.slotCount - 1 }, (_, slot) => getWavePatternSlotDelayMs(burst, slot));
  assert.ok(delays.every((delay) => delay === burst.intervalMs), "her bekleme yigin araligi");
  assert.ok(sure(burst) < sure(balanced) * 0.5, `yigin baskin hizli: ${sure(burst)} / ${sure(balanced)}`);
  assert.ok(sure(pincer) < sure(balanced) * 0.7, `kiskac hizli: ${sure(pincer)} / ${sure(balanced)}`);
  assert.equal(pincer.groups, 2);
  // Kanat: tekler sol ceyrek, ciftler sag ceyrek.
  for (let slot = 0; slot < 8; slot += 1) {
    const range = getWavePatternEntryColumns(pincer, slot, 12);
    assert.ok(slot % 2 === 0 ? range.to <= 2 : range.from >= 9, `kanat ${slot}: ${range.from}..${range.to}`);
  }
  // Serit: yigin basina dar bir serit; dagink giris butun satir.
  const lane = getWavePatternEntryColumns(burst, 0, 12);
  assert.ok(lane.to - lane.from + 1 <= 4, `serit ${lane.from}..${lane.to}`);
  assert.deepEqual(getWavePatternEntryColumns(balanced, 0, 12), { from: 0, to: 11 });
});

// --- Sunucu -----------------------------------------------------------------------------

function oda(stage, seed) {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [{ sessionId: "p1", send() {} }];
  room.mapScale = 1;
  room.stage = stage;
  room.wavePatternSeed = seed;
  room.specialSeed = seed;
  room.configureArenaForScale();
  const player = room.state.players.get("p1");
  Object.assign(player, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0 });
  return room;
}

function dalgayiDogur(room, wave) {
  room.wave = wave;
  room.setupPhase = false;
  room.waveSpawned = 0;
  room.enemies.clear();
  room.planWaveSpawns(wave);
  const dogumlar = [];
  let guard = 0;
  while (room.waveSpawned < room.waveTarget && guard++ < 5000) {
    room.spawnCooldownMs = 0;
    const before = new Set(room.enemies.keys());
    room.updateSpawning(1);
    for (const [id, enemy] of room.enemies) if (!before.has(id)) dogumlar.push(enemy);
  }
  return dogumlar;
}

test("sunucu: normal dogumlar plandan; hava kurali, sampiyon ve sayaclar eskisi gibi; odul olcekli", () => {
  const realNow = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    for (const [stage, seed] of [[1, 11], [3, 22], [4, 33]]) {
      for (const wave of [2, 5, 9, 12, 15, 19]) {
        const room = oda(stage, seed);
        const dogumlar = dalgayiDogur(room, wave).filter((enemy) => !enemy.special);
        const plan = room.wavePatternPlan;
        assert.equal(plan.wave, wave);
        assert.equal(plan.pattern, getWavePattern(stage, wave, seed));
        assert.equal(plan.baseSlotCount, room.getScaledWaveEnemyCount(wave));
        const champion = room.waveChampionPlan;
        assert.equal(Boolean(champion), hasWaveChampion(wave) && Boolean(getWaveChampionPlan(wave, plan.slotCount)));
        if (champion) assert.deepEqual(champion, getWaveChampionPlan(wave, plan.slotCount));
        // Ozel dusmansiz (1. asama) dalgada her normal dogum plandaki sirasinin turu.
        if (stage === 1) {
          let slot = 0;
          for (const enemy of dogumlar) {
            if (enemy.champion) {
              assert.equal(enemy.type, champion.type);
              slot += champion.replaced;
              continue;
            }
            assert.equal(enemy.type, plan.types[slot], `${wave}. dalga ${slot}. dogum`);
            assert.equal(enemy.movementKind === "air", isFlyingWaveSpawn(wave, slot), `${wave}. dalga ${slot}. hava`);
            assert.ok(Math.abs(enemy.reward - getEnemyCombatDefinition(enemy.type).reward * plan.goldScale) < 1e-9, "altin olcekli");
            assert.equal(enemy.expScale ?? 1, plan.expScale);
            slot += 1;
          }
          assert.equal(slot, plan.slotCount, "dalga planin sonuna kadar dogdu");
          assert.equal(dogumlar.length, room.waveTarget);
        }
        assert.equal(room.getSnapshot().team.wavePattern, plan.pattern);
      }
    }
  } finally {
    Date.now = realNow;
  }
});

test("sunucu: oldurme altini ve deneyimi paternin olcegiyle; dalga sonu altini degismiyor", () => {
  const room = oda(3, 5);
  let found;
  for (let wave = 3; wave <= 19 && !found; wave += 1) {
    if (getWavePattern(3, wave, 5) === "swarm") found = wave;
  }
  assert.ok(found, "suru dalgasi yok");
  room.wave = found;
  room.planWaveSpawns(found);
  const plan = room.wavePatternPlan;
  assert.ok(plan.goldScale < 1, "suruda kosucu basina altin dusmedi");
  room.waveSpawned = plan.types.indexOf("runner");
  room.spawnEnemy();
  const runner = [...room.enemies.values()].at(-1);
  assert.equal(runner.type, "runner");
  const player = room.state.players.get("p1");
  const gold = player.gold;
  const experience = player.experience;
  room.damageEnemy(runner, runner.hp + runner.shield * 3 + 10, 0, "test", "p1", "true");
  assert.equal(player.gold - gold, Math.max(1, Math.round(getEnemyCombatDefinition("runner").reward * plan.goldScale * ENEMY_REWARD_MULTIPLIER)));
  assert.ok(Math.abs(player.experience - experience - getEnemyExp(found, "runner", "ground") * plan.expScale) < 1e-6);
});

test("sunucu: kiskac dogumlari kanatlardan, zirhli kol dar seritten giriyor", () => {
  const realNow = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    for (const pattern of ["pincer", "armored"]) {
      let stage;
      let seed;
      let wave;
      outer: for (const candidate of SEEDS) {
        for (let w = 7; w <= 19; w += 1) {
          if (getWavePattern(4, w, candidate) === pattern) { stage = 4; seed = candidate; wave = w; break outer; }
        }
      }
      assert.ok(seed !== undefined, `${pattern} dalgasi bulunamadi`);
      const room = oda(stage, seed);
      const dogumlar = dalgayiDogur(room, wave).filter((enemy) => !enemy.special && !enemy.champion);
      assert.equal(room.wavePatternPlan.pattern, pattern);
      const cols = room.activeMap.cols;
      // Dogum noktasi ust satirda; sutun dunya x'inden.
      const cells = dogumlar.map((enemy) => worldToGrid(enemy.x, enemy.y, room.activeMap).col);
      if (pattern === "pincer") {
        const span = Math.floor(cols / 4);
        assert.ok(cells.every((col) => col < span || col >= cols - span), `kanat disi sutun: ${cells}`);
        assert.ok(cells.some((col) => col < span) && cells.some((col) => col >= cols - span), "iki kanat");
      } else {
        const distinct = new Set(cells);
        assert.ok(distinct.size < cols * 0.75, `zirhli kol butun satira dagildi: ${[...distinct]}`);
      }
    }
  } finally {
    Date.now = realNow;
  }
});

// --- Ongoru (istemci) ------------------------------------------------------------------

test("ongoru: patern adi ve ipucu TR ve EN, kutuda ikinci satir, sahne sunucunun paternini geciriyor", async () => {
  const controls = await importWebModule("apps/web/src/locales/areas/controls.ts");
  for (const pattern of WAVE_PATTERN_IDS) {
    for (const table of [controls.trControls, controls.enControls]) {
      const name = table[`hud.forecast.pattern.${pattern}`];
      const hint = table[`hud.forecast.patternHint.${pattern}`];
      assert.ok(name && hint, `${pattern} metni yok`);
      // 375 px: ad + ipucu tek satirda kisa kaliyor.
      assert.ok(`${name} · ${hint}`.length <= 44, `${pattern}: "${name} · ${hint}" uzun`);
    }
  }
  assert.equal(controls.trControls["hud.forecast.pattern.swarm"], "Sürü");
  assert.equal(controls.enControls["hud.forecast.pattern.armored"], "Armored column");
  const hud = await readFile(new URL("../apps/web/src/game-control-ui.ts", import.meta.url), "utf8");
  assert.ok(hud.includes("data-hud-forecast-pattern"), "kutuda patern satiri yok");
  assert.ok(/forecastPattern\?: WavePatternId/.test(hud));
  const scene = await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8");
  assert.ok(scene.includes("forecastPattern: forecastVisible ? snapshot.team.wavePattern : undefined"), "sahne paterni gecirmiyor");
  const css = await readFile(new URL("../apps/web/src/style.css", import.meta.url), "utf8");
  assert.ok(css.includes(".game-hud__forecast-pattern"), "patern satirinin stili yok");
});
