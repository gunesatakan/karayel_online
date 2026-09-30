/**
 * Dalga temizleme damgasi ve nadirlik gosteren kart acilisi.
 *
 * Dalga sonu eskiden sessizdi ve kart ekraninin basligi sabitti ("DALGA
 * TAMAMLANDI"); nadirlik yalnizca Envanter'de gorunuyordu. Buradaki testler
 * yeni anlarin sozlerini kilitliyor:
 *
 *   1. Damga yalnizca gercek bir temizlenmede: ayni dalgada once kalan dusman
 *      gorulmus, sonra kurulum disinda sifira inmis. Molada katilan oyuncu,
 *      ikinci kez sifira inen dalga ve son dalga damga almiyor.
 *   2. Satirlar dogru: dusman sayisi takimin bu dalgadaki gercek oldurmesi,
 *      altin oyuncunun bu dalgada gercekten kazandigi (harcama ve satis
 *      degistirmiyor), bonus sunucunun molanin sonunda yazdigi altinla ayni.
 *      Gercek MatchRoom'un kapanis yolu surulerek olculuyor.
 *   3. Kart ekraninin basligi kartlarin ait oldugu dalga.
 *   4. Kart dagitimi: 80 ms arayla, her kart dagitimi baslayali 250 ms
 *      olmadan secilemiyor; hareket azaltmada dagitim yok. Nadir tini elde
 *      kac nadir olursa olsun bir kez ve takim arkadasina calmiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CARD_DEAL_STAGGER_MS,
  CARD_PICKABLE_AFTER_MS,
  CARD_RARITY_WEIGHT,
  FEEDBACK_KIND_RULES,
  FINAL_WAVE,
  FeedbackGovernor,
  WAVE_CLEAR_STAMP_MS,
  WaveClearWatch,
  cardCatalog,
  getCardDealTiming,
  getCardDraftTitle,
  getCardDraftWave,
  getCardRarity,
  getCardRevealCues,
  getFeedbackPriority,
  getWaveClearStampText,
  getWaveCompletionGold,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

/** Snapshot'tan damga kuralinin okudugu alanlar; istemcideki `watchWaveClear` ile ayni. */
function gozlem(snapshot, playerId = "p1") {
  const player = snapshot.players.find((entry) => entry.id === playerId);
  return {
    wave: snapshot.team.wave,
    enemiesLeft: snapshot.team.enemiesLeft,
    setupPhase: Boolean(snapshot.setupPhase),
    over: Boolean(snapshot.result),
    kills: snapshot.team.kills,
    earned: player ? player.gold + player.goldSpent : undefined
  };
}

/** Tel uzerinden gecmis hali: `undefined` alanlar JSON'da dusuyor. */
const tel = (room) => JSON.parse(JSON.stringify(room.getSnapshot()));

function oda() {
  const room = createRoom("onur");
  room.broadcast = () => {};
  const player = room.state.players.get("p1");
  Object.assign(player, { gold: 400, goldSpent: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0 });
  return room;
}

/** Odanin kendi kapanis yoluyla `wave` icin kurulumu acar (wave-forecast testindeki gibi). */
function kurulumaGec(room, wave) {
  room.wave = wave - 1;
  room.waveTarget = room.getScaledWaveEnemyCount(room.wave);
  room.setupPhase = false;
  room.enemies.clear();
  room.waveSpawned = room.waveTarget;
  room.waveClearedAt = 0;
  molayiBitir(room);
  assert.equal(room.setupPhase, true);
  assert.equal(room.wave, wave);
}

/** Sunucunun 2 sn'lik temizlenme molasini sahte saatle gecirir. */
function molayiBitir(room) {
  const gercekNow = Date.now;
  let simdi = gercekNow();
  Date.now = () => simdi;
  try {
    room.updateSpawning(16); // temizlenme ani: bekleme basliyor
    simdi += 3000;
    room.updateSpawning(16); // bekleme bitti: bonus, kurulum, kartlar
  } finally {
    Date.now = gercekNow;
  }
}

/** Kurulumu odanin kendi kuraliyla bitirir (herkes hazir). */
function savasaBasla(room) {
  room.pendingCardChoices.clear();
  room.setupReadyPlayerIds.add("p1");
  room.tryFinishSetupPhase();
  assert.equal(room.setupPhase, false, "kurulum bitmedi");
}

/** Tek vurusta olen, zirhsiz dusman. */
function kirilganDusman(room) {
  room.spawnEnemy();
  room.waveSpawned += 1;
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { hp: 5, maxHp: 5, shield: 0, maxShield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
  return enemy;
}

test("sunucu: damganin dusman, altin ve bonus satirlari odanin gercekten verdigiyle ayni", () => {
  const room = oda();
  kurulumaGec(room, 3);
  const player = room.state.players.get("p1");
  const watch = new WaveClearWatch();
  watch.observe(gozlem(tel(room)));
  const killsAtStart = room.kills;

  savasaBasla(room);
  room.waveTarget = 3;
  room.waveSpawned = 0;
  const enemies = [kirilganDusman(room), kirilganDusman(room), kirilganDusman(room)];
  watch.observe(gozlem(tel(room)));

  let killGold = 0;
  for (const enemy of enemies.slice(0, 2)) {
    const before = player.gold;
    room.damageEnemy(enemy, 50, 0, "skill", "p1", "true");
    killGold += player.gold - before;
  }
  // Dalga ortasinda kule kurup satmak: harcama ve iade "kazanc" degil.
  const definition = towerCatalog.onur[0];
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot, "kule icin kare yok");
  const spentBefore = player.goldSpent;
  room.placeTower(client, { ...spot, definitionId: definition.id });
  const tower = [...room.towers.values()].at(-1);
  assert.ok(tower && player.goldSpent > spentBefore, "kule altinla kurulmali");
  const goldBeforeSale = player.gold;
  room.sellTower(client, { towerId: tower.id });
  assert.ok(player.gold > goldBeforeSale, "satis iade vermeli");
  // Ucuncu dusman sizdi: oldurme olayi yok, sayilmiyor.
  room.enemies.delete(enemies[2].id);

  const pauseSnapshot = tel(room);
  assert.equal(pauseSnapshot.team.enemiesLeft, 0);
  assert.equal(pauseSnapshot.setupPhase, false, "mola kurulum degil");
  const summary = watch.observe(gozlem(pauseSnapshot));
  assert.ok(summary, "temizlenmede damga cikmali");
  assert.equal(summary.wave, 3);
  assert.equal(summary.finalWave, FINAL_WAVE);
  assert.equal(summary.kills, 2, "sizan dusman sayilmiyor");
  assert.equal(summary.kills, room.kills - killsAtStart);
  assert.equal(summary.gold, Math.floor(killGold), "yalnizca oldurme altini; kurup satmak degistirmiyor");
  assert.equal(summary.bonus, getWaveCompletionGold(3));

  // Kart ekrani molanin sonunda; basligi temizlenen dalga (molada da kurulumda da).
  assert.equal(getCardDraftWave({ wave: pauseSnapshot.team.wave, setupPhase: pauseSnapshot.setupPhase }), 3);

  // Molanin sonunda sunucunun yazdigi bonus damgadaki sayiyla ayni.
  const goldBefore = player.gold;
  molayiBitir(room);
  assert.equal(room.setupPhase, true);
  assert.equal(player.gold - goldBefore, summary.bonus, "damgadaki bonus = sunucunun verdigi");
  assert.ok(room.pendingCardChoices.has("p1"), "kartlar ayni adimda");
  const setupSnapshot = tel(room);
  assert.equal(getCardDraftWave({ wave: setupSnapshot.team.wave, setupPhase: setupSnapshot.setupPhase }), 3);
  assert.equal(watch.observe(gozlem(setupSnapshot)), undefined, "kurulumda ikinci damga yok");
});

test("sunucu: son dalgada damga yok, sonuc ekrani konusuyor", () => {
  const room = oda();
  kurulumaGec(room, FINAL_WAVE);
  const watch = new WaveClearWatch();
  watch.observe(gozlem(tel(room)));
  savasaBasla(room);
  room.waveTarget = 1;
  room.waveSpawned = 0;
  const enemy = kirilganDusman(room);
  watch.observe(gozlem(tel(room)));
  room.damageEnemy(enemy, 50, 0, "skill", "p1", "true");
  assert.equal(watch.observe(gozlem(tel(room))), undefined);
  molayiBitir(room);
  assert.equal(room.matchResult, "victory");
  assert.equal(watch.observe(gozlem(tel(room))), undefined);
});

test("damga: molada katilan oyuncu, geri gelen dusman ve biten mac damga almiyor", () => {
  const base = { setupPhase: false, over: false, kills: 10, earned: 500 };

  // Oyuna molada katildi: ilk gordugu "0 kaldi"; onun icin temizlenme degil.
  const joiner = new WaveClearWatch();
  assert.equal(joiner.observe({ ...base, wave: 4, enemiesLeft: 0 }), undefined);

  // Once kurulum (taban), sonra savas, sonra sifir: tek damga.
  const watch = new WaveClearWatch();
  watch.observe({ ...base, wave: 4, enemiesLeft: 12, setupPhase: true });
  watch.observe({ ...base, wave: 4, enemiesLeft: 12 });
  const summary = watch.observe({ ...base, wave: 4, enemiesLeft: 0, kills: 22, earned: 700 });
  assert.deepEqual(summary, { wave: 4, finalWave: FINAL_WAVE, kills: 12, gold: 200, bonus: getWaveCompletionGold(4) });
  // Molada bir dusman geri gelip yeniden oldu: ikinci damga yok.
  assert.equal(watch.observe({ ...base, wave: 4, enemiesLeft: 1, kills: 22, earned: 700 }), undefined);
  assert.equal(watch.observe({ ...base, wave: 4, enemiesLeft: 0, kills: 23, earned: 718 }), undefined);

  // Mac bitti: sonuc ekrani var, damga yok.
  const over = new WaveClearWatch();
  over.observe({ ...base, wave: 6, enemiesLeft: 3 });
  assert.equal(over.observe({ ...base, wave: 6, enemiesLeft: 0, over: true }), undefined);
});

test("damga: dalganin basi gorulmediyse sayi yerine satir yok", () => {
  // Oyuna dalga ortasinda girildi: taban yok. Baslik ve bonus dogru, sayilar yok.
  const midJoin = new WaveClearWatch();
  midJoin.observe({ wave: 7, enemiesLeft: 5, setupPhase: false, over: false, kills: 90, earned: 2000 });
  const summary = midJoin.observe({ wave: 7, enemiesLeft: 0, setupPhase: false, over: false, kills: 95, earned: 2100 });
  assert.equal(summary.kills, undefined);
  assert.equal(summary.gold, undefined);
  assert.equal(summary.bonus, getWaveCompletionGold(7));

  // Yaratici modda dalga savas icinde degisti: eski dalganin tabani yeni dalgaya uymuyor.
  const creative = new WaveClearWatch();
  creative.observe({ wave: 3, enemiesLeft: 10, setupPhase: true, over: false, kills: 20, earned: 600 });
  creative.observe({ wave: 9, enemiesLeft: 4, setupPhase: false, over: false, kills: 20, earned: 600 });
  const jumped = creative.observe({ wave: 9, enemiesLeft: 0, setupPhase: false, over: false, kills: 24, earned: 680 });
  assert.equal(jumped.kills, undefined);
  assert.equal(jumped.gold, undefined);

  // Oyuncu kaydi yok: altin satiri yok, oldurme var.
  const spectator = new WaveClearWatch();
  spectator.observe({ wave: 2, enemiesLeft: 10, setupPhase: true, over: false, kills: 10 });
  spectator.observe({ wave: 2, enemiesLeft: 10, setupPhase: false, over: false, kills: 10 });
  const noPlayer = spectator.observe({ wave: 2, enemiesLeft: 0, setupPhase: false, over: false, kills: 21 });
  assert.equal(noPlayer.kills, 11);
  assert.equal(noPlayer.gold, undefined);
});

test("damga metni: baslik, satir sirasi; sifir altin yazilmaz, sifir oldurme yazilir", () => {
  const text = getWaveClearStampText({ wave: 7, finalWave: 20, kills: 31, gold: 412, bonus: 44 });
  assert.equal(text.title, "DALGA 7/20 TEMİZLENDİ");
  assert.deepEqual(text.lines, [
    { kind: "kills", text: "31 düşman" },
    { kind: "gold", text: "+412 ◆" },
    { kind: "bonus", text: "+44 dalga bonusu" }
  ]);
  assert.deepEqual(
    getWaveClearStampText({ wave: 2, finalWave: 20, kills: 0, gold: 0, bonus: 29 }).lines.map((line) => line.kind),
    ["kills", "bonus"]
  );
  assert.deepEqual(
    getWaveClearStampText({ wave: 2, finalWave: 20, bonus: 29 }).lines.map((line) => line.kind),
    ["bonus"]
  );
  assert.equal(WAVE_CLEAR_STAMP_MS, FEEDBACK_KIND_RULES.waveClear.visualMs, "ekran ve etiket butcesi ayni anda bosalir");
  assert.ok(WAVE_CLEAR_STAMP_MS >= 1200 && WAVE_CLEAR_STAMP_MS <= 1400, "damga 2 sn'lik molanin icinde kalir");
});

test("kart basligi: kartlarin ait oldugu dalga", () => {
  assert.equal(getCardDraftWave({ wave: 7, setupPhase: false }), 7, "molada gelen kartlar");
  assert.equal(getCardDraftWave({ wave: 8, setupPhase: true }), 7, "kurulumda (yeniden baglanma) gelen kartlar");
  assert.equal(getCardDraftWave(undefined), undefined);
  assert.equal(getCardDraftWave({ wave: 1, setupPhase: true }), undefined, "ilk kurulumda kart yok");
  assert.equal(getCardDraftTitle(7), "DALGA 7 ÖDÜLÜ");
  assert.equal(getCardDraftTitle(undefined), "DALGA ÖDÜLÜ");
});

test("kart dagitimi: 80 ms arayla, dagitimi baslamadan 250 ms gecmeden secilemez", () => {
  const timings = [0, 1, 2, 3].map((index) => getCardDealTiming(index, false));
  timings.forEach((timing, index) => {
    assert.equal(timing.delayMs, index * CARD_DEAL_STAGGER_MS);
    assert.equal(timing.pickableAtMs - timing.delayMs, CARD_PICKABLE_AFTER_MS);
    assert.ok(timing.faceUpMs > timing.delayMs && timing.faceUpMs < timing.pickableAtMs, "yuzu gorunmeden secilemez");
  });
  assert.equal(CARD_DEAL_STAGGER_MS, 80);
  assert.equal(CARD_PICKABLE_AFTER_MS, 250);

  // Hareket azaltma: dagitim ve donus yok, yanlis dokunus korumasi kaliyor.
  for (const index of [0, 1, 2]) {
    assert.deepEqual(getCardDealTiming(index, true), { delayMs: 0, faceUpMs: 0, pickableAtMs: CARD_PICKABLE_AFTER_MS });
  }
});

test("kart acilisi sesleri: kart basina cevirme, nadir tini bir kez", () => {
  const cues = getCardRevealCues(["common", "rare", "uncommon"], false);
  assert.deepEqual(cues.filter((cue) => cue.kind === "cardFlip").map((cue) => cue.index), [0, 1, 2]);
  const rare = cues.filter((cue) => cue.kind === "cardRare");
  assert.equal(rare.length, 1);
  assert.equal(rare[0].atMs, getCardDealTiming(1, false).faceUpMs, "tini nadir kartin yuzu gorundugunde");
  for (let index = 1; index < cues.length; index += 1) {
    assert.ok(cues[index].atMs >= cues[index - 1].atMs, "sirali");
  }

  assert.equal(getCardRevealCues(["rare", "rare", "common"], false).filter((cue) => cue.kind === "cardRare").length, 1);
  assert.equal(getCardRevealCues(["common", "uncommon"], false).some((cue) => cue.kind === "cardRare"), false);
  assert.deepEqual(getCardRevealCues(["uncommon", "rare"], true), [
    { atMs: 0, kind: "cardFlip", index: 0 },
    { atMs: 0, kind: "cardRare", index: 1 }
  ]);
});

test("nadir tini: kendi olayin (P1), takim arkadasina calmaz, bir secimde ikinci kez calmaz", () => {
  assert.equal(getFeedbackPriority("cardRare", true), 1);
  const governor = new FeedbackGovernor();
  assert.equal(governor.admitSound("cardRare", false, 0).play, false, "baskasinin karti senin sesin degil");
  assert.equal(governor.admitSound("cardRare", true, 0).play, true);
  assert.equal(governor.admitSound("cardRare", true, 400).play, false, "ayni acilista ikinci tini yok");
  assert.equal(FEEDBACK_KIND_RULES.cardRare.shakePx, 0);
  assert.equal(FEEDBACK_KIND_RULES.cardRare.vibrateMs, 0);
});

test("nadirlik: her kartin cercevesi var; nadir kart gercekten seyrek", () => {
  const counts = { common: 0, uncommon: 0, rare: 0 };
  for (const card of cardCatalog) {
    const rarity = getCardRarity(card);
    assert.ok(rarity in counts, `${card.id}: ${rarity}`);
    counts[rarity] += 1;
  }
  assert.ok(counts.rare > 0, "katalogda nadir kart var");
  assert.ok(CARD_RARITY_WEIGHT.rare < CARD_RARITY_WEIGHT.uncommon && CARD_RARITY_WEIGHT.uncommon < CARD_RARITY_WEIGHT.common);
});
