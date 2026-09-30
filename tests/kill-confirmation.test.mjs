/**
 * Oldurme onayi: olum patlamasi ve vurus flasi.
 *
 * Dusman eskiden yalnizca yok oluyordu. Istemci artik kaldirdigi dusmanin
 * izini kisa bir sure sakliyor ve sunucunun oldurme olayi gelince o izden
 * 180-220 ms'lik bir patlama ciziyor; vurulan dusman 60 ms beyaza donuyor.
 * Buradaki testler bu sozleri kilitliyor:
 *
 * - Patlama 180-220 ms; siradan dusmanda 5 kiymik, brute/kusatmada 8 ve toz
 *   halkasi. Govde once x1.3 / y0.6 basiliyor, sonra soner; hareket azaltma
 *   aciksa basma yok.
 * - Sizinti patlamiyor: sunucu sizintiya oldurme olayi yazmiyor, iz de
 *   alinmadan suresi dolup siliniyor.
 * - Flas 60 ms, ayni dusmanda en fazla 334 ms'de bir: surekli isinda bile
 *   saniyede en fazla 3 flas (isiga duyarlilik siniri).
 * - Kamera durtmesi yalnizca senin agir dusman ya da kritik oldurmende;
 *   takim arkadasininki kamerana dokunmuyor.
 * - Bayat oldurme olayi (arka plandan donus) patlama, ses ve altin acmiyor.
 * - Hasar sayisi havuzu: sabit 24 Text, birlesen oldurucu kritik "✕" tasiyor.
 * - Kiymik rengi dusmanin dokusundan: koyu zirh degil, baskin vurgu.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import {
  DEATH_BURST_SQUASH,
  DEATH_BURST_SQUASH_END,
  ENEMY_HIT_FLASH_GAP_MS,
  ENEMY_HIT_FLASH_MS,
  ENEMY_TRACE_TTL_MS,
  FEEDBACK_LIMITS,
  FeedbackGovernor,
  RecentEnemyTraces,
  getDeathBurstPose,
  getDeathBurstShape,
  getKillFeedbackWeight,
  isEnemyHitFlashActive,
  pickAccentColor,
  shouldStartEnemyHitFlash,
  tintAccentColor
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const ENEMY_TYPES = ["grunt", "runner", "shooter", "brute", "siege"];
const channels = (color) => [(color >> 16) & 255, (color >> 8) & 255, color & 255];

test("patlama 180-220 ms; siradan dusman 5 kiymik, brute ve kusatma 8 kiymik + toz halkasi", () => {
  for (const type of ENEMY_TYPES) {
    const shape = getDeathBurstShape(type);
    assert.ok(shape.durationMs >= 180 && shape.durationMs <= 220, `${type}: ${shape.durationMs} ms`);
    const heavy = type === "brute" || type === "siege";
    assert.equal(shape.heavy, heavy, type);
    assert.equal(shape.shards, heavy ? 8 : 5, type);
    assert.equal(shape.dustRing, heavy, type);
  }
  assert.ok(getDeathBurstShape("brute").durationMs >= getDeathBurstShape("grunt").durationMs,
    "agir dusman daha kisa patlamamali");
});

test("govde once x1.3 / y0.6 basilir, sonra soner", () => {
  const start = getDeathBurstPose(0, false);
  assert.deepEqual([start.scaleX, start.scaleY, start.alpha], [1, 1, 1]);
  assert.equal(start.flash, 1, "ilk an beyaz cekirdek tam");

  const squashed = getDeathBurstPose(DEATH_BURST_SQUASH_END, false);
  assert.ok(Math.abs(squashed.scaleX - DEATH_BURST_SQUASH.scaleX) < 1e-9);
  assert.ok(Math.abs(squashed.scaleY - DEATH_BURST_SQUASH.scaleY) < 1e-9);
  assert.equal(DEATH_BURST_SQUASH.scaleX, 1.3);
  assert.equal(DEATH_BURST_SQUASH.scaleY, 0.6);
  assert.equal(squashed.alpha, 1, "basilirken sonmez");

  const end = getDeathBurstPose(1, false);
  assert.equal(end.alpha, 0, "sonunda tamamen kaybolur");
  assert.equal(end.flash, 0);

  let previousAlpha = Infinity;
  let previousFlash = Infinity;
  for (let step = 0; step <= 100; step += 1) {
    const pose = getDeathBurstPose(step / 100, false);
    assert.ok(pose.alpha <= previousAlpha + 1e-12, `alpha geri parlamamali (${step}%)`);
    assert.ok(pose.flash <= previousFlash + 1e-12, `cekirdek geri parlamamali (${step}%)`);
    assert.ok(pose.scaleX >= 1 && pose.scaleX <= 1.5, `scaleX sinirda (${step}%)`);
    assert.ok(pose.scaleY > 0 && pose.scaleY <= 1, `scaleY sinirda (${step}%)`);
    previousAlpha = pose.alpha;
    previousFlash = pose.flash;
  }
});

test("hareket azaltma: basma yok, govde yerinde soner", () => {
  for (let step = 0; step <= 10; step += 1) {
    const pose = getDeathBurstPose(step / 10, true);
    assert.equal(pose.scaleX, 1);
    assert.equal(pose.scaleY, 1);
    assert.ok(Math.abs(pose.alpha - (1 - step / 10)) < 1e-9);
  }
  assert.equal(getDeathBurstPose(Number.NaN, false).alpha, 0, "bozuk ilerleme bitmis sayilir");
});

test("vurus flasi: can dususunde baslar, 60 ms surer, ayni dusmanda saniyede en fazla 3 kez", () => {
  assert.equal(ENEMY_HIT_FLASH_MS, 60);
  assert.ok(ENEMY_HIT_FLASH_GAP_MS >= 334, `flas araligi ${ENEMY_HIT_FLASH_GAP_MS} ms: saniyede 3 flas siniri`);

  assert.equal(shouldStartEnemyHitFlash(undefined, 90, undefined, 0), false, "ilk karede kiyas yok");
  assert.equal(shouldStartEnemyHitFlash(100, 100, undefined, 0), false, "can ayni");
  assert.equal(shouldStartEnemyHitFlash(100, 101, undefined, 0), false, "can artiyor (yenilenme)");
  assert.equal(shouldStartEnemyHitFlash(100, 99.99, undefined, 0), false, "ara degerleme gurultusu");
  assert.equal(shouldStartEnemyHitFlash(100, 92, undefined, 0), true, "vurus");

  assert.equal(shouldStartEnemyHitFlash(92, 80, 0, ENEMY_HIT_FLASH_GAP_MS - 1), false, "aralik dolmadan yeniden yanmaz");
  assert.equal(shouldStartEnemyHitFlash(92, 80, 0, ENEMY_HIT_FLASH_GAP_MS), true);

  assert.equal(isEnemyHitFlashActive(undefined, 10), false);
  assert.equal(isEnemyHitFlashActive(1000, 1000), true);
  assert.equal(isEnemyHitFlashActive(1000, 1059), true);
  assert.equal(isEnemyHitFlashActive(1000, 1060), false);

  // Surekli isin: her karede can kaybeden dusman saniyede en fazla 3 kez
  // duz beyaza donuyor (120 ms'de ~8 kezdi) ve zamanin cogunda kendi renginde.
  let flashAt;
  let hp = 1000;
  let lit = 0;
  const starts = [];
  const frames = 600;
  for (let frame = 0; frame < frames; frame += 1) {
    const now = frame * 16;
    const next = hp - 0.5;
    if (shouldStartEnemyHitFlash(hp, next, flashAt, now)) {
      flashAt = now;
      starts.push(now);
    }
    hp = next;
    if (isEnemyHitFlashActive(flashAt, now)) lit += 1;
  }
  for (const start of starts) {
    const inSecond = starts.filter((at) => at >= start && at < start + 1000).length;
    assert.ok(inSecond <= 3, `${start} ms'den sonraki bir saniyede ${inSecond} flas`);
  }
  assert.ok(lit / frames <= 0.2, `surekli hasarda beyaz kare orani ${lit / frames}`);
  assert.ok(lit > 0);
});

test("iz: oldurme olayi bir kez alir; alinmayan iz (sizinti) suresi dolunca silinir", () => {
  const traces = new RecentEnemyTraces();
  traces.remember("e1", { x: 1 }, 0);
  traces.remember("leak", { x: 2 }, 0);
  assert.deepEqual(traces.take("e1", 10), { x: 1 });
  assert.equal(traces.take("e1", 11), undefined, "ayni olay iki kez patlatmaz");

  traces.prune(ENEMY_TRACE_TTL_MS + 1);
  assert.equal(traces.size, 0, "oldurme olayi gelmeyen iz birikmez");
  assert.equal(traces.take("leak", ENEMY_TRACE_TTL_MS + 2), undefined);

  traces.remember("late", { x: 3 }, 0);
  assert.equal(traces.take("late", ENEMY_TRACE_TTL_MS + 1), undefined,
    "eski ize patlama acilmaz (yeniden baglanmada gelen eski olay)");
});

test("iz: sinirli; en eski once duser, sira zamana gore kalir", () => {
  const traces = new RecentEnemyTraces(250, 3);
  for (let index = 0; index < 5; index += 1) traces.remember(`e${index}`, index, index);
  assert.equal(traces.size, 3);
  assert.equal(traces.take("e0", 5), undefined);
  assert.equal(traces.take("e1", 5), undefined);
  assert.equal(traces.take("e4", 5), 4);

  const ordered = new RecentEnemyTraces(100, 10);
  ordered.remember("a", "a", 0);
  ordered.remember("b", "b", 10);
  ordered.remember("a", "a2", 90);
  // "a" basta kalsaydi taze sayilip budama orada dururdu; yeniden yazmak onu sona tasiyor.
  ordered.prune(115);
  assert.equal(ordered.size, 1, "yalnizca 100 ms'yi gecen b silinir");
  assert.equal(ordered.take("b", 115), undefined);
  assert.equal(ordered.take("a", 115), "a2", "yeniden yazilan iz tazelenmis sayilir");
});

test("kamera durtmesi yalnizca senin agir dusman ya da kritik oldurmende; takim arkadasi hic sallamaz", () => {
  const ownHeavy = new FeedbackGovernor().decide("kill", { own: true, x: 0, y: 0, weight: getKillFeedbackWeight("brute") }, 0);
  assert.ok(ownHeavy.shakePx > 0 && ownHeavy.shakePx <= 1.5, `kucuk durtme: ${ownHeavy.shakePx}px`);
  assert.ok(ownHeavy.shakePx <= FEEDBACK_LIMITS.maxShakePx);
  assert.ok(ownHeavy.vibrateMs >= FEEDBACK_LIMITS.minVibrateMs && ownHeavy.vibrateMs <= FEEDBACK_LIMITS.maxVibrateMs);
  assert.equal(ownHeavy.show, true);

  const siege = new FeedbackGovernor().decide("kill", { own: true, weight: getKillFeedbackWeight("siege") }, 0);
  assert.ok(siege.shakePx > 0);

  for (const type of ["grunt", "runner", "shooter"]) {
    const ordinary = new FeedbackGovernor().decide("kill", { own: true, weight: getKillFeedbackWeight(type) }, 0);
    assert.equal(ordinary.shakePx, 0, `${type}: dakikada 22-30 oldurme ekrani sallamamali`);
    assert.equal(ordinary.vibrateMs, 0, type);
    assert.equal(ordinary.show, true, `${type}: patlama yine cizilir`);
    assert.equal(new FeedbackGovernor().decide("kill", { own: true, weight: getKillFeedbackWeight(type, false) }, 0).shakePx, 0);
  }

  // Kritik oldurme siradan dusmanda da tam agirlik: kucuk durtme ve kisa titresim.
  const critKill = new FeedbackGovernor().decide("kill", { own: true, x: 0, y: 0, weight: getKillFeedbackWeight("grunt", true) }, 0);
  assert.ok(critKill.shakePx > 0 && critKill.shakePx <= 1.5, `kritik oldurme durtmesi: ${critKill.shakePx}px`);
  assert.ok(critKill.vibrateMs >= FEEDBACK_LIMITS.minVibrateMs && critKill.vibrateMs <= FEEDBACK_LIMITS.maxVibrateMs);
  const teammateCrit = new FeedbackGovernor().decide("kill", { own: false, weight: getKillFeedbackWeight("grunt", true) }, 0);
  assert.equal(teammateCrit.shakePx, 0, "takim arkadasinin kritik oldurmesi de senin kamerana dokunmaz");
  assert.equal(teammateCrit.vibrateMs, 0);

  const teammate = new FeedbackGovernor().decide("kill", { own: false, weight: getKillFeedbackWeight("brute") }, 0);
  assert.equal(teammate.shakePx, 0, "baskasinin oldurmesi senin kamerani oynatmaz");
  assert.equal(teammate.vibrateMs, 0);
  assert.equal(teammate.show, true, "olum gercek: takim arkadasinin oldurdugu dusman da patlar (soluk)");

  const reduced = new FeedbackGovernor({ reducedMotion: true }).decide("kill", { own: true, weight: 1 }, 0);
  assert.equal(reduced.shakePx, 0);
  assert.equal(reduced.reducedMotion, true, "cizim basma ve kiymigi atlasin");
});

test("vurgu rengi: koyu zirh degil, en genis doygun renk; saydam piksel sayilmaz", () => {
  const pixels = [];
  const push = (count, rgba) => { for (let index = 0; index < count; index += 1) pixels.push(...rgba); };
  push(300, [40, 40, 46, 255]); // koyu gri zirh
  push(60, [190, 20, 40, 255]); // kirmizi cekirdek
  push(10, [120, 230, 40, 255]); // yesil goz: parlak ama kucuk
  push(400, [0, 200, 255, 0]); // saydam arka plan
  const [r, g, b] = channels(pickAccentColor(pixels, 0x123456));
  assert.ok(r > 200 && g < 60 && b < 80, `kirmizi bekleniyordu: ${r},${g},${b}`);
  assert.equal(Math.max(r, g, b), 235, "koyu haritada okunsun diye parlatilir");

  // Kirmizi 0/360 sinirinda bolunse de kazanir.
  const split = [];
  for (let index = 0; index < 20; index += 1) split.push(200, 10, 30, 255, 200, 30, 10, 255);
  for (let index = 0; index < 25; index += 1) split.push(20, 60, 200, 255);
  const [sr] = channels(pickAccentColor(split, 0));
  assert.ok(sr > 200, "iki kovaya bolunen kirmizi tek bir maviye yenilmemeli");

  assert.equal(pickAccentColor([60, 60, 60, 255, 90, 90, 92, 255], 0xd6d3d1), 0xd6d3d1, "doygun renk yoksa yedek");
  assert.equal(pickAccentColor([], 0xabcdef), 0xabcdef);
});

test("vurgu sprite tonuyla carpilir: beyaz ton degistirmez, ucan dusman camgobegine kayar", () => {
  const red = 0xeb325f;
  assert.equal(tintAccentColor(red, 0xffffff), red);
  const [r, g, b] = channels(tintAccentColor(red, 0x67e8f9));
  const [, rg, rb] = channels(red);
  assert.ok(g > rg && b > rb, "camgobegi ton yesil ve maviyi one cikarir");
  assert.equal(Math.max(r, g, b), 235);
});

test("sunucu: oldurme olayi dusmanin kimligini tasir, sizinti hic oldurme olayi yazmaz", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};

  room.spawnEnemy();
  const victim = [...room.enemies.values()].at(-1);
  Object.assign(victim, { hp: 10, maxHp: 10, shield: 0, maxShield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
  room.killEvents.clear();
  room.damageEnemy(victim, 50, 0, "skill", "p1", "true");
  assert.equal(room.enemies.has(victim.id), false);
  const kills = [...room.killEvents.values()];
  assert.equal(kills.length, 1);
  assert.equal(kills[0].enemyId, victim.id, "istemci izi bu kimlikle buluyor");
  assert.equal(kills[0].ownerId, "p1");

  room.spawnEnemy();
  const leaker = [...room.enemies.values()].at(-1);
  const exit = room.activePaths[0].points.at(-1);
  leaker.x = exit.x;
  leaker.y = exit.y;
  room.killEvents.clear();
  for (let tick = 0; tick < 400 && room.enemies.has(leaker.id); tick += 1) {
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateEnemies(0.05);
  }
  assert.equal(room.enemies.has(leaker.id), false, "dusman sizmali");
  assert.equal(room.killEvents.size, 0, "sizinti patlamaz: oldurme olayi yok");
});

// --- istemci kablolamasi (kaynak) ------------------------------------------

async function readScene() {
  const client = await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8");
  const body = (name) => {
    const start = client.indexOf(`private ${name}(`);
    assert.ok(start >= 0, `${name} yok`);
    const next = client.indexOf("\n  private ", start + 10);
    return client.slice(start, next < 0 ? undefined : next);
  };
  return body;
}

test("kaynak: iz ayni karede once yaziliyor sonra aliniyor; oldurme olayi hasar olayindan once", async () => {
  const body = await readScene();
  // Patlama izi `renderEnemies` yaziyor, `renderKillEvents` (snapshot yukunun
  // icinde) aliyor. Sira degisirse her oldurme izsiz kalir, patlama ve ses
  // sessizce kaybolur.
  const frame = body("renderPlaybackFrame");
  const enemies = frame.indexOf("this.renderEnemies(");
  assert.ok(enemies >= 0, "kare dusmanlari ciziyor");
  assert.ok(enemies < frame.indexOf("this.renderSnapshotPayload("), "dusmanlar snapshot yukunden once");
  // Ara degerleme dusman listesini sonraki snapshot'tan aliyor: olen dusman
  // o karede listeden duser ve izi yazilir.
  assert.ok(body("interpolateSnapshot").includes("next.enemies.map("), "dusman listesi sonraki snapshot'tan");
  // Kritik oldurme agirligi henuz gorulmemis kritik son vurus olayina bakiyor.
  const payload = body("renderSnapshotPayload");
  assert.ok(payload.indexOf("this.renderKillEvents(") >= 0);
  assert.ok(payload.indexOf("this.renderKillEvents(") < payload.indexOf("this.renderDamageEvents("), "oldurme olaylari hasar olaylarindan once");
});

test("kaynak: bayat oldurme olayi (arka plandan donus) patlama, ses ve altin acmiyor", async () => {
  const body = await readScene();
  const kills = body("renderKillEvents");
  assert.match(kills, /const stale = isStaleKillEvent\(event\.serverTime, snapshot\.serverTime\)/, "bayatlik kombonun kuraliyla");
  assert.match(kills, /if \(event\.ownerId && !stale\)/, "kombo bayat olayi saymiyor");
  assert.match(kills, /this\.playKillConfirmation\(event, comboStep, stale/, "onay bayatligi biliyor");
  const confirm = body("playKillConfirmation");
  const take = confirm.indexOf("removedEnemyTraces.take(");
  const gate = confirm.indexOf("if (!trace || stale)");
  assert.ok(take >= 0 && gate > take, "iz bayat olayda da tuketiliyor, sonra onay kesiliyor");
  assert.ok(gate < confirm.indexOf("this.feedback?.emit(\"kill\""), "ses ve durtmeden once");
  assert.ok(gate < confirm.indexOf("this.playKillCoin("), "altin sayisindan once");
  assert.ok(gate < confirm.indexOf("this.combatVfx?.emitDeath("), "patlamadan once");
});

// --- hasar sayisi havuzu ----------------------------------------------------

const require = createRequire(new URL("../package.json", import.meta.url));

/** Istemci modulu derlenmeden: tipler silinip veri adresinden yukleniyor. */
async function loadDamageNumbers() {
  const ts = require("typescript");
  const source = await readFile(new URL("../apps/web/src/vfx/damage-numbers.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

/** Phaser olmadan sahne: `add.text` zincirlenebilir bir kayit donduruyor. */
function stubScene() {
  const texts = [];
  const scene = {
    add: {
      text(x, y, text, style) {
        const object = {
          text,
          x,
          y,
          style: { ...style },
          visible: true,
          active: true,
          depth: 0,
          scale: 1,
          alpha: 1,
          setOrigin() { return this; },
          setDepth(depth) { this.depth = depth; return this; },
          setVisible(visible) { this.visible = visible; return this; },
          setActive(active) { this.active = active; return this; },
          setPosition(nextX, nextY) { this.x = nextX; this.y = nextY; return this; },
          setScale(scale) { this.scale = scale; return this; },
          setAlpha(alpha) { this.alpha = alpha; return this; },
          setText(value) { this.text = value; return this; },
          updateText() { return this; },
          destroy() {}
        };
        texts.push(object);
        return object;
      }
    }
  };
  return { scene, texts };
}

const numberSpec = (overrides = {}) => ({
  key: "hit",
  x: 0,
  y: 0,
  amount: 10,
  own: true,
  crit: false,
  killingBlow: false,
  bucket: 0,
  lifetimeMs: 900,
  still: false,
  ...overrides
});

test("havuz: oldurucu kritik onceki kritige eklenince sayi '✕' tasiyor, toplam gercek hasar", async () => {
  const { DamageNumberPool } = await loadDamageNumbers();
  const { scene, texts } = stubScene();
  const pool = new DamageNumberPool(scene);
  pool.spawn(numberSpec({ key: "crit", amount: 43, crit: true }), 0);
  assert.equal(texts[0].text, "43!");
  // Ayni yerde 90 ms sonra ikinci kritik dusmani olduruyor: yonetmen birlestiriyor.
  assert.equal(pool.merge("crit", 43, { crit: true, killingBlow: true }), true);
  assert.equal(texts[0].text, "✕ 86!", "oldurmenin tek isareti birlesmede kaybolmamali");
  // Isaret bir kez geldiyse sonraki olumsuz vurus onu silmiyor.
  pool.merge("crit", 10, { crit: true, killingBlow: false });
  assert.equal(texts[0].text, "✕ 96!");
  assert.equal(texts.length, 1, "birlesme yeni Text acmiyor");
});

test("havuz: 24 Text'i asmiyor; 25. sayi canli bir yuvayi geri donusturuyor", async () => {
  const { DamageNumberPool } = await loadDamageNumbers();
  const { scene, texts } = stubScene();
  const pool = new DamageNumberPool(scene);
  for (let index = 0; index < 25; index += 1) {
    pool.spawn(numberSpec({ key: `k${index}`, amount: index + 1, lifetimeMs: 900 + index }), 0);
  }
  assert.equal(texts.length, 24, "havuz 24 nesneyle sinirli");
  assert.equal(pool.activeCount(), 24);
  // En once bitecek (ilk) sayinin yuvasi 25. sayiya gecti.
  assert.equal(texts[0].text, "25");
  assert.equal(pool.merge("k0", 5), false, "yuvasi baska anahtara gecen sayiya eklenmiyor");
  assert.equal(pool.merge("k24", 5), true);
});

test("havuz: recycle en once bitecek canli sayiyi birakiyor; bos yuva olsa bile", async () => {
  const { DamageNumberPool } = await loadDamageNumbers();
  const { scene, texts } = stubScene();
  const pool = new DamageNumberPool(scene);
  pool.spawn(numberSpec({ key: "a", amount: 1, lifetimeMs: 900 }), 0);
  pool.spawn(numberSpec({ key: "b", amount: 2, lifetimeMs: 500 }), 0);
  pool.spawn(numberSpec({ key: "c", amount: 3, lifetimeMs: 700 }), 0);
  pool.spawn(numberSpec({ key: "crit", amount: 4, crit: true }), 10, true);
  assert.equal(texts.length, 3, "geri donusum yeni Text acmiyor");
  assert.equal(texts[1].text, "4!", "en once bitecek (b, 500 ms) yer acti");
  assert.equal(pool.activeCount(), 3, "ekrandaki sayi adedi butceyi asmiyor");
  assert.equal(pool.merge("b", 1), false, "geri donusturulen anahtara ekleme yok");
  assert.equal(pool.merge("crit", 1, { crit: true }), true);

  // Sonen sayiya da eklenmiyor; karar cagiranda (kendi kritigin yeni sayi acar).
  pool.update(2000);
  assert.equal(pool.activeCount(), 0);
  assert.equal(pool.merge("a", 1), false);
});
