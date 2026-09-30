/**
 * Canli kombo, gorunur seri gucu ve co-op afis duzeni.
 *
 * Kombo tamamen kozmetik: sunucunun seri esikleri ve buff'i degismedi, testler
 * bunu da kilitliyor. Kilitlenen sozler:
 *
 * - Dogum araligi formulu paylasilan pakete tasindi, degeri ayni; sunucu onu
 *   kullaniyor. Kombo penceresi o araligin iki kati, gercek saatle.
 * - Kombo kendi oldurmelerini sayiyor, pencere asilinca kopuyor; hap ×3'te
 *   beliriyor, ×8'de isinmasi doyuyor ama sayi gercek kaliyor. 350 ms'lik
 *   patlama "ÇİFT!" / "ÜÇLÜ!" / "ÇOKLU!" diyor ve bir kez.
 * - Takimin soluk kombosu yalnizca co-op'ta ve senin kombon yokken.
 * - Afisin ikinci satiri sunucunun kademe tablosundan; kule parlamasi buff'in
 *   gercek suresi (3000 oyun-ms = 3750 ms) ve yalnizca gercekten guc alan
 *   (ates eden) kuleler. Sunucunun verdigi buff bununla birebir ayni.
 * - Afisler silinmiyor, siraya giriyor; bayat afis gosterilmiyor.
 * - Takim arkadasinin serisi kamerani oynatmiyor, titretmiyor.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COMBO_HEAT_MAX,
  COMBO_STALE_EVENT_MS,
  COMBO_VISIBLE_MIN,
  FEEDBACK_LIMITS,
  FeedbackGovernor,
  GAME_SPEED_MULTIPLIER,
  KILL_STREAK_BUFF_DURATION_MS,
  KILL_STREAK_RETRIGGER_LOCK_MS,
  KILL_STREAK_RULES,
  KillComboWatch,
  MULTI_KILL_LABEL_MS,
  MULTI_KILL_WINDOW_MS,
  STREAK_BANNER_MIN_VISIBLE_MS,
  STREAK_BANNER_QUEUE_LIMIT,
  STREAK_GLOW_FADE_IN_MS,
  STREAK_GLOW_FADE_OUT_MS,
  StreakBannerQueue,
  countsAsTower,
  getComboHeat,
  getComboWindowMs,
  getKillStreakBuffRealMs,
  getKillStreakBuffText,
  getKillStreakRule,
  getMultiKillLabel,
  getStreakBuffedTowerIds,
  getStreakGlowAlpha,
  getWaveSpawnIntervalMs,
  getWaveSpawnIntervalRealMs,
  isOperationalTower,
  isStaleKillEvent,
  occupiesTowerSlot,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { toKillEventWire } from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

/** Date.now'u sabitler; seri penceresi sunucu saatiyle sayiliyor. */
function withClock(run) {
  const real = Date.now;
  let now = 1_700_000_000_000;
  Date.now = () => now;
  try {
    return run(() => now, (ms) => { now += ms; });
  } finally {
    Date.now = real;
  }
}

test("dogum araligi: paylasilan formul eski degerle ayni, sunucu onu kullaniyor", () => {
  for (let wave = 0; wave <= 25; wave += 1) {
    assert.equal(getWaveSpawnIntervalMs(wave), Math.max(310, 980 - wave * 34), `dalga ${wave}`);
  }

  for (const wave of [1, 7, 20]) {
    const room = createRoom("warrior");
    room.broadcast = () => {};
    room.wave = wave;
    room.waveTarget = 50;
    room.waveSpawned = 0;
    room.spawnCooldownMs = 0;
    room.updateSpawning(1);
    assert.equal(room.waveSpawned, 1, `dalga ${wave}: dusman dogmadi`);
    assert.equal(room.spawnCooldownMs, getWaveSpawnIntervalMs(wave), `dalga ${wave}: sunucunun araligi`);
  }
});

test("kombo penceresi: dogum araliginin iki kati, gercek saatle", () => {
  assert.equal(getWaveSpawnIntervalRealMs(1), 946 / GAME_SPEED_MULTIPLIER);
  assert.equal(getComboWindowMs(1), 2 * 946 / GAME_SPEED_MULTIPLIER);
  assert.equal(getComboWindowMs(20), 2 * 310 / GAME_SPEED_MULTIPLIER);
  assert.ok(getComboWindowMs(20) > MULTI_KILL_WINDOW_MS, "patlama her zaman bir kombonun icinde kaliyor");
});

test("kombo: kendi oldurmelerin pencere icinde buyur, pencere asilinca kopar", () => {
  const combo = new KillComboWatch();
  const window = getComboWindowMs(3);
  let at = 10_000;
  assert.equal(combo.record(at, true, window), 1);
  assert.equal(combo.getHudState(at, window, false), undefined, "tek oldurme hap degil");
  at += window * 0.9;
  assert.equal(combo.record(at, true, window), 2);
  assert.equal(combo.getHudState(at, window, false), undefined, "×2 henuz tesaduf");
  at += window * 0.9;
  assert.equal(combo.record(at, true, window), COMBO_VISIBLE_MIN);

  const shown = combo.getHudState(at, window, false);
  assert.equal(shown.count, 3);
  assert.equal(shown.team, false);
  assert.equal(shown.heat, 0);
  assert.equal(shown.pop, true, "artis bir kez atiyor");
  assert.equal(shown.durationMs, window, "hap tam kombonun kopacagi anda kalkiyor");
  assert.equal(combo.getHudState(at + 100, window, false).pop, false, "atim tekrar edilmiyor");
  assert.equal(combo.getHudState(at + window + 1, window, false), undefined, "pencere gecti: hap yok");

  at += window + 1;
  assert.equal(combo.record(at, true, window), 1, "pencereden gec gelen oldurme yeni zincir baslatiyor");
});

test("kombo: isi ×3'te baslar, ×8'de doyar; sayi yine gercek", () => {
  assert.equal(getComboHeat(COMBO_VISIBLE_MIN), 0);
  assert.equal(getComboHeat(COMBO_HEAT_MAX), COMBO_HEAT_MAX - COMBO_VISIBLE_MIN);
  assert.equal(getComboHeat(COMBO_HEAT_MAX + 7), COMBO_HEAT_MAX - COMBO_VISIBLE_MIN);
  assert.equal(getComboHeat(1), 0);

  const combo = new KillComboWatch();
  const window = getComboWindowMs(10);
  for (let index = 0; index < 12; index += 1) {
    combo.record(1000 + index * 500, true, window);
  }
  const state = combo.getHudState(1000 + 11 * 500, window, false);
  assert.equal(state.count, 12, "sayi ×8'de durmuyor");
  assert.equal(state.heat, COMBO_HEAT_MAX - COMBO_VISIBLE_MIN);
});

test("patlama: 350 ms icinde ikinci oldurme ÇİFT, ucuncu ÜÇLÜ, dorduncu ÇOKLU; etiket bir kez", () => {
  assert.equal(getMultiKillLabel(1), undefined);
  assert.equal(getMultiKillLabel(2), "ÇİFT!");
  assert.equal(getMultiKillLabel(3), "ÜÇLÜ!");
  assert.equal(getMultiKillLabel(4), "ÇOKLU!");

  const combo = new KillComboWatch();
  const window = getComboWindowMs(5);
  combo.record(5000, true, window);
  combo.record(5000 + MULTI_KILL_WINDOW_MS - 50, true, window);
  let state = combo.getHudState(5000 + MULTI_KILL_WINDOW_MS - 50, window, false);
  assert.equal(state.multi, "ÇİFT!");
  assert.equal(state.count, 2, "etiketle hap ×2'de de gorunuyor");
  assert.equal(state.multiMs, MULTI_KILL_LABEL_MS);
  assert.equal(combo.getHudState(5400, window, false).multi, undefined, "ayni etiket tekrar gelmiyor");

  combo.record(5000 + MULTI_KILL_WINDOW_MS, true, window);
  state = combo.getHudState(5000 + MULTI_KILL_WINDOW_MS, window, false);
  assert.equal(state.multi, "ÜÇLÜ!");

  // Ayni snapshot'ta dort oldurme: etiket son sayiyi soyluyor.
  const burst = new KillComboWatch();
  for (let index = 0; index < 4; index += 1) burst.record(9000 + index * 20, true, window);
  assert.equal(burst.getHudState(9060, window, false).multi, "ÇOKLU!");

  // Patlamanin disinda: 351 ms sonra gelen oldurme etiket degil.
  const spaced = new KillComboWatch();
  spaced.record(1000, true, window);
  spaced.record(1000 + MULTI_KILL_WINDOW_MS + 1, true, window);
  assert.equal(spaced.getHudState(1000 + MULTI_KILL_WINDOW_MS + 1, window, false), undefined);
});

test("takim kombosu: yalnizca co-op'ta, senin kombon yokken, soluk ve atmadan", () => {
  const window = getComboWindowMs(8);
  const combo = new KillComboWatch();
  for (let index = 0; index < 4; index += 1) combo.record(2000 + index * 300, false, window);
  const at = 2000 + 3 * 300;
  assert.equal(combo.getHudState(at, window, false), undefined, "tek basina oynarken takim kombosu yok");
  const team = combo.getHudState(at, window, true);
  assert.equal(team.team, true);
  assert.equal(team.count, 4);
  assert.equal(team.pop, false);
  assert.equal(team.multi, undefined, "takimin patlamasi senin etiketin degil");

  // Kendi kombon gelince o gorunuyor.
  for (let index = 0; index < 3; index += 1) combo.record(at + 100 + index * 200, true, window);
  const own = combo.getHudState(at + 500, window, true);
  assert.equal(own.team, false);
  assert.equal(own.count, 3);
});

test("bayat oldurme olayi komboya sayilmiyor (yeniden baglanma)", () => {
  assert.equal(isStaleKillEvent(1000, 1000 + 60), false, "normal: bir sonraki snapshot");
  assert.equal(isStaleKillEvent(1000, 1000 + COMBO_STALE_EVENT_MS), false);
  assert.equal(isStaleKillEvent(1000, 1000 + COMBO_STALE_EVENT_MS + 1), true);
  assert.equal(isStaleKillEvent(1000, 3200), true, "2.2 sn'lik olay listesinin sonu");
});

test("seri esikleri ve buff'i degismedi; afisin ikinci satiri tablodan", () => {
  assert.deepEqual(KILL_STREAK_RULES.map((rule) => [rule.tier, rule.windowMs, rule.kills, rule.damageMultiplier, rule.hasteMultiplier, rule.fearAllMs]), [
    ["legendary", 11000, 22, 1.2, 1.2, 3000],
    ["rampage", 8000, 16, 1.2, 1.2, 0],
    ["unstoppable", 5000, 10, 1.2, 1, 0],
    ["granted", 2000, 5, 1.1, 1, 0]
  ]);
  assert.equal(KILL_STREAK_BUFF_DURATION_MS, 3000);
  assert.equal(KILL_STREAK_RETRIGGER_LOCK_MS, 60000);
  assert.equal(getKillStreakBuffRealMs(), 3750, "3000 oyun-ms gercek saatte 3.75 sn");

  assert.equal(getKillStreakBuffText("granted"), "+%10 hasar · 3 sn");
  assert.equal(getKillStreakBuffText("unstoppable"), "+%20 hasar · 3 sn");
  assert.equal(getKillStreakBuffText("rampage"), "+%20 hasar · +%20 atış hızı · 3 sn");
  assert.equal(getKillStreakBuffText("legendary"), "+%20 hasar · +%20 atış hızı · düşmanlar korkar · 3 sn");
});

test("sunucu: seri buff'i afisin yazdigi ve parlamanin surdugu kadar; parlayan kuleler gercekten guc aliyor", () => {
  withClock((now, advance) => {
    const room = createRoom("warrior");
    room.broadcast = () => {};
    const p1 = room.state.players.get("p1");
    room.state.players.set("p2", { ...p1, id: "p2", slot: 1, characterId: "zeynep" });
    const quiet = (sessionId) => ({ sessionId, send() {} });

    for (const definitionId of ["warrior-1", "warrior-3", "warrior-7"]) {
      const spot = findBuildableSpot(room, definitionId);
      assert.ok(spot, definitionId);
      room.placeTower(quiet("p1"), { ...spot, definitionId });
    }
    const mateSpot = findBuildableSpot(room, "zeynep-1");
    room.placeTower(quiet("p2"), { ...mateSpot, definitionId: "zeynep-1" });
    const towers = [...room.towers.values()];
    assert.equal(towers.length, 4, "kuleler kurulamadi");

    room.killEvents.clear();
    for (let index = 0; index < 5; index += 1) {
      room.spawnEnemy();
      const enemy = [...room.enemies.values()].at(-1);
      Object.assign(enemy, { hp: 5, maxHp: 5, shield: 0, maxShield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
      room.damageEnemy(enemy, 50, 0, "skill", "p1", "true");
      advance(100);
    }
    const events = [...room.killEvents.values()];
    assert.deepEqual(events.map((event) => event.streakTier), [undefined, undefined, undefined, undefined, "granted"]);
    assert.equal(toKillEventWire(events[4]).streakTier, "granted", "kademe tele gidiyor");

    const grantedAt = events[4].serverTime;
    const granted = getKillStreakRule("granted");
    const asSnapshot = towers.map((tower) => ({ id: tower.id, ownerId: tower.ownerId, characterId: tower.characterId, definitionId: tower.definition.id }));
    const glowing = getStreakBuffedTowerIds(asSnapshot, "p1");

    for (const tower of towers) {
      const mine = tower.ownerId === "p1";
      const firing = countsAsTower(tower.definition) && occupiesTowerSlot(tower.definition) && isOperationalTower(tower.definition);
      assert.equal(glowing.includes(tower.id), mine && firing, `${tower.definition.id}: parlama`);
      if (!mine) {
        assert.equal(room.getTowerStreakDamageMultiplier(tower, now()), 1, "takim arkadasinin kulesi buff almiyor");
        continue;
      }
      assert.equal(tower.streakDamageUntil - grantedAt, getKillStreakBuffRealMs(), "parlama suresi sunucunun buff suresi");
      if (firing) {
        assert.equal(room.getTowerStreakDamageMultiplier(tower, now()), granted.damageMultiplier, "afisin '+%10'u");
      }
    }
    assert.ok(glowing.length >= 1, "en az bir ates eden kule parlamali");
    assert.ok(!glowing.includes(towers.find((tower) => tower.definition.id === "warrior-7")?.id),
      "ates etmeyen yapi guc gosterirmis gibi parlamiyor");

    advance(getKillStreakBuffRealMs());
    const mineFiring = towers.find((tower) => glowing.includes(tower.id));
    assert.equal(room.getTowerStreakDamageMultiplier(mineFiring, now()), 1, "3.75 sn sonra buff bitti, parlama da");
  });
});

test("parlama: yumusak girer, buff boyunca durur, son 600 ms'de soner", () => {
  assert.equal(getStreakGlowAlpha(0, 3750), 0);
  assert.equal(getStreakGlowAlpha(STREAK_GLOW_FADE_IN_MS / 2, 3000), 0.5);
  assert.equal(getStreakGlowAlpha(1000, 2000), 1);
  assert.equal(getStreakGlowAlpha(3000, STREAK_GLOW_FADE_OUT_MS / 2), 0.5);
  assert.equal(getStreakGlowAlpha(3750, 0), 0);
  assert.equal(getStreakGlowAlpha(5000, -10), 0);
});

test("afis sirasi: yeni afis eskisini silmez; eskisi en az 1.1 sn kalir, bayat afis atlanir", () => {
  const queue = new StreakBannerQueue();
  assert.equal(queue.offer("granted", 0), "show");
  assert.equal(queue.handoffAt(), undefined, "bekleyen yok: afis tam suresini oynuyor");
  assert.equal(queue.offer("unstoppable", 400), "queued");
  assert.equal(queue.handoffAt(), STREAK_BANNER_MIN_VISIBLE_MS, "ekrandaki afis okunacak kadar kaliyor");

  assert.equal(queue.finish(STREAK_BANNER_MIN_VISIBLE_MS + 260), "unstoppable");
  assert.equal(queue.active, true);
  assert.equal(queue.finish(5000), undefined);
  assert.equal(queue.active, false);

  // Sira sinirli: en eskisi dusuyor (kademeler yukseliyor).
  const crowded = new StreakBannerQueue();
  crowded.offer("a", 0);
  for (const item of ["b", "c", "d"]) crowded.offer(item, 100);
  assert.equal(crowded.pending, STREAK_BANNER_QUEUE_LIMIT);
  assert.equal(crowded.finish(1500), "c");
  assert.equal(crowded.finish(2000), "d");

  // Buff'i coktan bitmis afis gosterilmiyor: "+%20 hasar · 3 sn" artik dogru degil.
  const stale = new StreakBannerQueue();
  stale.offer("a", 0);
  stale.offer("b", 100);
  assert.equal(stale.finish(100 + getKillStreakBuffRealMs() + 1), undefined);
  assert.equal(stale.active, false);
});

test("takim arkadasinin serisi kamerani oynatmiyor ve telefonunu titretmiyor", () => {
  const governor = new FeedbackGovernor();
  const mate = governor.decide("streak", { own: false }, 1000);
  assert.equal(mate.shakePx, 0);
  assert.equal(mate.vibrateMs, 0);
  const own = governor.decide("streak", { own: true }, 2000);
  assert.ok(own.shakePx > 0 && own.shakePx <= FEEDBACK_LIMITS.maxShakePx);
  assert.ok(own.vibrateMs > 0);

  // Melis temasinin uzun titremesi de ayni kapidan: en fazla 3 px, hareket azaltmada hic.
  assert.equal(governor.admitShake(true, 0, 1 + 4 * 0.5, 5000), FEEDBACK_LIMITS.maxShakePx);
  assert.equal(governor.admitShake(false, 0, 3, 9000), 0);
  const still = new FeedbackGovernor({ reducedMotion: true });
  assert.equal(still.admitShake(true, 0, 3, 1000), 0);
});

test("kaynak: seri yalnizca sunucudan, kamera yonetmenden, HUD olaylari eslesiyor", async () => {
  const server = await readFile(new URL("../apps/server/src/rooms/MatchRoom.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8");
  const hud = await readFile(new URL("../apps/web/src/game-control-ui.ts", import.meta.url), "utf8");

  assert.ok(server.includes("getWaveSpawnIntervalMs(this.wave)"), "sunucu paylasilan araligi kullaniyor");
  assert.ok(!/980\s*-\s*this\.wave/.test(server), "sunucuda formulun ikinci kopyasi kalmadi");
  assert.ok(!/const KILL_STREAK_RULES/.test(server), "seri tablosu tek yerde");

  assert.ok(!client.includes("cameras.main.shake("), "afis kamerayi yonetmeni atlayarak sallamiyor");
  assert.ok(!client.includes("getTriggeredKillStreakRule"), "istemci kendi serisini hesaplamiyor");
  assert.ok(!/showKillStreakAnnouncement\([^)]*\)\s*\{[^}]*rampageContainer\?\.destroy/.test(client), "yeni afis eskisini silmiyor");

  for (const event of ["game:hud-combo", "game:hud-combo-hide", "game:hud-team-streak", "game:hud-team-streak-hide"]) {
    assert.ok(client.includes(`"${event}"`), `sahne ${event} yolluyor`);
    assert.ok(hud.includes(`"${event}"`), `HUD ${event} dinliyor`);
  }

  const body = (name) => {
    const start = client.indexOf(`private ${name}(`);
    assert.ok(start >= 0, `${name} yok`);
    const next = client.indexOf("\n  private ", start + 10);
    return client.slice(start, next < 0 ? undefined : next);
  };
  const announce = body("announceKillStreak");
  // Kart perdesi acikken takim arkadasinin toast'u ve sesi perdenin ustune binmez.
  const guard = announce.indexOf("if (this.cardChoiceRoot)");
  assert.ok(guard >= 0, "takim arkadasi dali kart perdesine bakiyor");
  assert.ok(guard < announce.indexOf("\"game:hud-team-streak\""), "toast perde kontrolunden sonra");
  assert.ok(guard < announce.indexOf("this.playKillStreakAnnouncement(rule, false)"), "takim arkadasi klibi perde kontrolunden sonra");
  // Kendi klibin afis ekrana gelince: siradaki afis ekrandakinin klibini kesmez.
  assert.ok(!announce.includes("this.playKillStreakAnnouncement(rule, true)"), "kendi klibin sira aninda calmiyor");
  assert.ok(body("showKillStreakAnnouncement").includes("this.playKillStreakAnnouncement(rule, true)"), "kendi klibin afisle birlikte");
});
