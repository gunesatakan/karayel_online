/**
 * Geri bildirim butcesi.
 *
 * Odul efektleri (oldurme, altin, kritik, seviye, kart) tek bir yonetmenden
 * geciyor. Buradaki testler o yonetmenin sozlerini kilitliyor:
 *
 * - Ekranda en fazla 12 canli sayi, 3 dunya etiketi, 6 efekt sesi.
 * - P0/P1 (kendi kademe, ulti, kritik, oldurme...) hic dusmez, yalnizca
 *   birlesir ya da en eski gorselin yerini alir.
 * - Takim arkadasinin olayi P3: soluk, kisik, dar butceli; senin kamerani
 *   sallamaz, senin sesini hiz sinirina takmaz.
 * - Altin sayisi saniyede en fazla 3; altinin sesi yok (oldurme sesi yetiyor).
 * - Oldurme zinciri sayiliyor ama perde tirmanmiyor (sfx-samples testi).
 * - Sarsinti yalnizca yerel P0/P1 olayinda, en fazla 3 px; hareket
 *   azaltma aciksa hic. Titresim 10-15 ms ve kullanici kapatabiliyor.
 *
 * Saat disaridan veriliyor; hicbiri gercek zamana bagli degil.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FEEDBACK_KIND_RULES,
  FEEDBACK_LIMITS,
  FEEDBACK_MAX_PITCH_STEP,
  FeedbackGovernor,
  getFeedbackPitchRatio,
  getFeedbackPriority
} from "../packages/shared/dist/index.js";

/** Her olayi ayri bir yere koyar; birlestirme penceresine takilmasinlar. */
const spread = (index) => ({ x: (index % 6) * 60, y: Math.floor(index / 6) * 60 });

test("oncelikler: kendi kademe P0, kendi kritik P1, kendi vurus P2, takim arkadasi hep P3", () => {
  assert.equal(getFeedbackPriority("tier", true), 0);
  assert.equal(getFeedbackPriority("ultimate", true), 0);
  assert.equal(getFeedbackPriority("streak", true), 0);
  assert.equal(getFeedbackPriority("crit", true), 1);
  assert.equal(getFeedbackPriority("kill", true), 1);
  assert.equal(getFeedbackPriority("waveClear", true), 1);
  assert.equal(getFeedbackPriority("hit", true), 2);
  assert.equal(getFeedbackPriority("coin", true), 2);
  assert.equal(getFeedbackPriority("level", true), 2);
  for (const kind of Object.keys(FEEDBACK_KIND_RULES)) {
    assert.equal(getFeedbackPriority(kind, false), 3, `${kind} takim arkadasinda P3 olmali`);
  }
});

test("canli sayi butcesi 12: fazlasi P2 ise duser, P1 ise en eskinin yerini alir", () => {
  const governor = new FeedbackGovernor();
  for (let index = 0; index < FEEDBACK_LIMITS.numbers; index += 1) {
    const decision = governor.decide("hit", { own: true, ...spread(index) }, 0);
    assert.equal(decision.show, true, `${index + 1}. sayi gorunmeli`);
  }
  assert.equal(governor.liveCount("number", 1), 12);

  const dropped = governor.decide("hit", { own: true, x: 900, y: 900 }, 1);
  assert.equal(dropped.show, false);
  assert.equal(dropped.merge, false);

  const crit = governor.decide("crit", { own: true, x: 700, y: 700 }, 2);
  assert.equal(crit.show, true, "P1 kritik tam butcede de gorunur");
  assert.equal(crit.recycle, true, "en eski canli sayi geri donusturulmeli");
  assert.equal(governor.liveCount("number", 3), 12, "butce asilmaz");

  // Sayilar 720 ms yasiyor; sonra butce bosaliyor.
  assert.equal(governor.liveCount("number", 800), 1, "yalnizca kritik (900 ms) canli");
  assert.equal(governor.decide("hit", { own: true, x: 1, y: 1 }, 800).show, true);
});

test("takim arkadasinin sayisi ekranda 6 ya da daha fazla sayi varken cikmaz", () => {
  const governor = new FeedbackGovernor();
  for (let index = 0; index < 5; index += 1) {
    governor.decide("hit", { own: true, ...spread(index) }, 0);
  }
  assert.equal(governor.decide("hit", { own: false, x: 500, y: 500 }, 0).show, true, "5 sayida arkadasinki cikar");
  const teammate = governor.decide("hit", { own: false, x: 600, y: 600 }, 0);
  assert.equal(teammate.show, false, "6 sayida arkadasinki cikmaz");
  assert.equal(teammate.priority, 3);
  assert.equal(governor.decide("hit", { own: true, x: 700, y: 700 }, 0).show, true, "kendi sayin hala cikar");
});

test("son vurus sayisi: kendi son vurusun P1 ve sessiz, arkadasininki kalabalikta duser", () => {
  assert.equal(getFeedbackPriority("lastHit", true), 1);
  assert.equal(FEEDBACK_KIND_RULES.lastHit.channel, "number");
  // Oldurme sesi ve sarsintisi "kill" olayinda; sayinin kendisi ses cikarmaz.
  assert.equal(FEEDBACK_KIND_RULES.lastHit.soundMs, 0);
  assert.equal(FEEDBACK_KIND_RULES.lastHit.shakePx, 0);

  const governor = new FeedbackGovernor();
  for (let index = 0; index < FEEDBACK_LIMITS.numbers; index += 1) {
    governor.decide("hit", { own: true, ...spread(index) }, 0);
  }
  const own = governor.decide("lastHit", { own: true, x: 900, y: 900 }, 1);
  assert.equal(own.show, true, "kendi son vurusun tam butcede de gorunur");
  assert.equal(own.recycle, true);
  assert.equal(own.sound, false);
  assert.equal(governor.liveCount("number", 2), FEEDBACK_LIMITS.numbers, "butce asilmaz");

  const teammate = governor.decide("lastHit", { own: false, x: 1000, y: 1000 }, 2);
  assert.equal(teammate.priority, 3);
  assert.equal(teammate.show, false, "kalabalikta arkadasin son vurusu dusmeli");
});

test("dunya etiketi butcesi 3: kademe etiketi dusmez, seviye etiketi duser", () => {
  const governor = new FeedbackGovernor();
  for (let index = 0; index < FEEDBACK_LIMITS.labels; index += 1) {
    assert.equal(governor.decide("level", { own: true, ...spread(index) }, 0).show, true);
  }
  assert.equal(governor.decide("level", { own: true, x: 900, y: 900 }, 0).show, false);
  const tier = governor.decide("tier", { own: true, x: 800, y: 800 }, 0);
  assert.equal(tier.show, true);
  assert.equal(tier.recycle, true);
  assert.equal(governor.liveCount("label", 0), 3);
});

test("ayni yerde ust uste gelen ayni tur olay oncekine eklenir, yeni gorsel acmaz", () => {
  const governor = new FeedbackGovernor();
  assert.equal(governor.decide("crit", { own: true, x: 100, y: 100 }, 0).show, true);
  const second = governor.decide("crit", { own: true, x: 106, y: 104 }, 60);
  assert.equal(second.show, false);
  assert.equal(second.merge, true);
  assert.equal(governor.liveCount("number", 60), 1);
  // Pencere gecince yeniden ayri gorsel.
  assert.equal(governor.decide("crit", { own: true, x: 106, y: 104 }, 60 + FEEDBACK_LIMITS.mergeWindowMs + 1).show, true);
});

test("altin: sayi saniyede en fazla 3 (arasi birlesir), oldurme basina tini yok", () => {
  const governor = new FeedbackGovernor();
  let shown = 0;
  let merged = 0;
  let sounds = 0;
  // Bir saniye boyunca her 50 ms'de bir oldurme altini.
  for (let now = 0; now < 1000; now += 50) {
    const decision = governor.decide("coin", { own: true, x: now, y: 0 }, now);
    if (decision.show) shown += 1;
    if (decision.merge) merged += 1;
    if (decision.sound) sounds += 1;
  }
  assert.ok(shown <= 3, `saniyede ${shown} altin sayisi`);
  assert.equal(sounds, 0, `saniyede ${sounds} altin tinisi`);
  assert.equal(FEEDBACK_KIND_RULES.coin.soundMs, 0, "altin ses butcesine girmiyor");
  assert.equal(shown + merged, 20, "gosterilmeyen altin birlesir, kaybolmaz");
});

test("takim arkadasinin altini dunyada pop yapmaz ve tini calmaz", () => {
  const governor = new FeedbackGovernor();
  const decision = governor.decide("coin", { own: false, x: 0, y: 0 }, 0);
  assert.equal(decision.show, false);
  assert.equal(decision.merge, false);
  assert.equal(decision.sound, false);
});

test("ses butcesi 6: P2 dolu butcede duser, P0 en eski sesin yerini alir", () => {
  const governor = new FeedbackGovernor();
  // Butce yalnizca P1 seslerle doluyor; ardindan gelen P2 hiz sinirina degil butceye takilmali.
  const kinds = ["crit", "kill", "cardFlip", "cardPick", "waveClear", "ultimateReady"];
  for (const kind of kinds) {
    assert.equal(governor.admitSound(kind, true, 0).play, true, `${kind} calmali`);
  }
  assert.equal(governor.activeVoices(0), FEEDBACK_LIMITS.sounds);

  const dropped = governor.admitSound("level", true, 10);
  assert.equal(dropped.play, false, "seviye sesi (P2) dolu butcede calmaz");

  const steal = governor.admitSound("tier", true, 10);
  assert.equal(steal.play, true, "kademe (P0) dusmez");
  assert.equal(steal.steal, true, "en eski ses kisilip yer acilir");
  assert.equal(governor.activeVoices(10), FEEDBACK_LIMITS.sounds, "butce asilmaz");

  // Sesler bitince butce bosaliyor ve P2 yeniden caliyor.
  assert.equal(governor.admitSound("level", true, 2000).play, true);
});

test("takim arkadasinin sesi kisik butceli ve senin hiz sinirini yemiyor", () => {
  const governor = new FeedbackGovernor();
  assert.equal(governor.admitSound("kill", false, 0).play, true);
  // Arkadasin oldurmesinden 10 ms sonra kendi oldurmen: yine calmali.
  assert.equal(governor.admitSound("kill", true, 10).play, true);
  // Arkadasin sesi kendi turunun araliginin 2 kati seyrek.
  const teamGap = FEEDBACK_KIND_RULES.kill.soundGapMs * FEEDBACK_LIMITS.teammateSoundGapFactor;
  assert.equal(governor.admitSound("kill", false, teamGap - 1).play, false);
  assert.equal(governor.admitSound("kill", false, teamGap + 1).play, true);

  // Arkadas sesleri en fazla 3 ses varken calar.
  const busy = new FeedbackGovernor();
  busy.admitSound("level", true, 0);
  busy.admitSound("place", true, 0);
  busy.admitSound("crit", true, 0);
  assert.equal(busy.admitSound("kill", false, 0).play, false, "3 ses varken arkadas sesi girmez");

  // Kart ve altin gibi yalnizca sana ait anlar arkadasta hic ses cikarmaz.
  assert.equal(new FeedbackGovernor().admitSound("cardPick", false, 0).play, false);
});

test("sarsinti: yalnizca yerel P0/P1, en fazla 3 px, aralikli; hareket azaltmada hic", () => {
  const governor = new FeedbackGovernor();
  const tier = governor.decide("tier", { own: true }, 0);
  assert.ok(tier.shakePx > 0 && tier.shakePx <= FEEDBACK_LIMITS.maxShakePx, `kademe sarsintisi ${tier.shakePx}`);

  // Araliktan once ikinci sarsinti yok.
  assert.equal(governor.decide("tier", { own: true }, 100).shakePx, 0);

  const later = FEEDBACK_LIMITS.shakeGapMs + 10;
  assert.equal(governor.decide("tier", { own: false }, later).shakePx, 0, "arkadasin kademesi kamerayi sallamaz");
  assert.equal(governor.decide("streak", { own: false }, later).shakePx, 0, "arkadasin serisi kamerayi sallamaz");

  // Siradan oldurme sallamaz; agir dusman ya da kritik oldurme (agirlik 1) dokunur.
  assert.equal(governor.decide("kill", { own: true }, later).shakePx, 0);
  const heavy = governor.decide("kill", { own: true, weight: 1 }, later + 1);
  assert.ok(heavy.shakePx > 0 && heavy.shakePx <= FEEDBACK_LIMITS.maxShakePx);

  // P2 olay kendi agirligi ne olursa olsun sallamaz.
  assert.equal(governor.admitShake(true, 2, 3, 10_000), 0);
  // Ust sinir cagiran ne isterse istesin 3 px.
  assert.equal(governor.admitShake(true, 0, 40, 20_000), FEEDBACK_LIMITS.maxShakePx);

  const calm = new FeedbackGovernor({ reducedMotion: true });
  const calmTier = calm.decide("tier", { own: true }, 0);
  assert.equal(calmTier.shakePx, 0);
  assert.equal(calmTier.reducedMotion, true);
  assert.equal(calmTier.show, true, "hareket azaltmada olay yine gorunur, yalnizca hareketsiz");
});

test("titresim: 10-15 ms, yalnizca kendi olayin, aralikli ve kapatilabilir", () => {
  const governor = new FeedbackGovernor();
  const tier = governor.decide("tier", { own: true }, 0);
  assert.ok(tier.vibrateMs >= FEEDBACK_LIMITS.minVibrateMs && tier.vibrateMs <= FEEDBACK_LIMITS.maxVibrateMs);
  assert.equal(governor.decide("streak", { own: true }, 50).vibrateMs, 0, "aralik dolmadan ikinci titresim yok");
  assert.equal(governor.decide("streak", { own: false }, 1000).vibrateMs, 0, "arkadasin serisi titretmez");
  assert.equal(governor.decide("kill", { own: true }, 2000).vibrateMs, 0, "siradan oldurme titretmez");
  assert.ok(governor.decide("kill", { own: true, weight: 1 }, 3000).vibrateMs > 0, "kritik oldurme titretir");
  assert.equal(governor.admitVibrate(400, 5000), FEEDBACK_LIMITS.maxVibrateMs, "uzun istek 15 ms'ye kirpilir");
  assert.equal(governor.admitVibrate(2, 6000), FEEDBACK_LIMITS.minVibrateMs);

  const off = new FeedbackGovernor({ vibration: false });
  assert.equal(off.decide("tier", { own: true }, 0).vibrateMs, 0);
  off.setVibration(true);
  assert.ok(off.decide("tier", { own: true }, 1000).vibrateMs > 0);
});

test("oldurme zinciri kendi oldurmelerinle ilerler, 1.5 sn sessizlikte basa doner", () => {
  const governor = new FeedbackGovernor();
  const steps = [0, 200, 400, 600].map((now) => governor.decide("kill", { own: true }, now).step);
  assert.deepEqual(steps, [0, 1, 2, 3]);
  // Arkadasin oldurmesi senin zincirini ilerletmez.
  assert.equal(governor.decide("kill", { own: false }, 700).step, 0);
  assert.equal(governor.decide("kill", { own: true }, 800).step, 4);
  assert.equal(governor.decide("kill", { own: true }, 800 + FEEDBACK_LIMITS.chainResetMs + 1).step, 0);
  // Cagiran kendi kombosunu verirse o kullanilir.
  assert.equal(governor.decide("kill", { own: true, step: 7 }, 5000).step, 7);

  // Perde basamaklari yalnizca arayuz onaylarinin (gelisim kademesi); oldurme
  // sesi zinciri perdeyle degil hafif bir seviye artisiyla duyuruyor.
  let previous = 0;
  for (let step = 0; step <= FEEDBACK_MAX_PITCH_STEP; step += 1) {
    const ratio = getFeedbackPitchRatio(step);
    assert.ok(ratio > previous, `perde ${step}. basamakta yukselmeli`);
    previous = ratio;
  }
  assert.equal(getFeedbackPitchRatio(99), getFeedbackPitchRatio(FEEDBACK_MAX_PITCH_STEP), "iki oktavda durur");
  assert.equal(getFeedbackPitchRatio(-3), 1);
});

test("sessiz istek gorsel butceyi kullanir ama ses kaydi birakmaz", () => {
  const governor = new FeedbackGovernor();
  const decision = governor.decide("crit", { own: true, x: 0, y: 0, silent: true }, 0);
  assert.equal(decision.show, true);
  assert.equal(decision.sound, false);
  assert.equal(governor.activeVoices(0), 0);
  // Ses kaydi olmadigi icin hemen arkasindan gelen kritik sesi calar.
  assert.equal(governor.admitSound("crit", true, 1).play, true);
});

test("reset eski odanin butcesini ve zincirini temizler", () => {
  const governor = new FeedbackGovernor();
  for (let index = 0; index < 12; index += 1) governor.decide("hit", { own: true, ...spread(index) }, 0);
  governor.decide("kill", { own: true }, 0);
  governor.decide("kill", { own: true }, 100);
  governor.reset();
  assert.equal(governor.liveCount("number", 0), 0);
  assert.equal(governor.activeVoices(0), 0);
  assert.equal(governor.decide("kill", { own: true }, 200).step, 0);
});
