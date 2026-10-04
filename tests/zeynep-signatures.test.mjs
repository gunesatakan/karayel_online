/**
 * Zeynep imzalari: kulenin mekanigi ekranda.
 *
 * Hiza'nin kimligi delmek ama hic gosterilmiyordu; Gosteri hattindaki
 * dusmanlar geri bildirim almiyordu; Taht'in uc kipi ayni pembe atisti ve
 * ayna isini koseyi kesen bir kiris olarak ciziliyordu; Kin dalgasi sonmeden
 * kayboluyor, vurdugu dusmanda iz birakmiyordu; Abarti gecisi gorunmuyordu.
 * Buradaki testler cizimin davranisini olcuyor (kaynak metni degil):
 *
 * - Ferman cizgisi ve kertik: iki temasta cizgi, kertik dusmanin boyunda.
 * - Spot isigi ve damga dusmani kimlikle izliyor, govdeyi sariyor; damganin
 *   serit sayisi okunur (en az 3 birim, 2 birim aralik) ve durum yazisi /
 *   can cubugu bandina girmiyor; LOD 3'te tek serit.
 * - Izleyici olaylari mevcut veriden ve gelen snapshot'in konumlarindan
 *   turetiyor: hattaki dusmanlar, Kin bandi ve gucu, Abarti gecisi (yalnizca
 *   ayni sahibin rayi), Taht dizilimi (paylasilan kural), sekme.
 * - Ayna mizragi sekmeyi kirik ciziyor; Kin gosterisi gercek 60 derece; yanik
 *   izi canli; Kin dalgasi sonerek kayboluyor.
 * - Hareket azaltma, saniyede 3 parlama ve takim arkadasinin %70'i.
 * - Yuk: 60 dusmanin hepsi Kin damgaliyken bile butce icinde.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createCountingGraphics, createRecorder, importWebModule } from "./helpers/web-module.mjs";

const zeynep = await importWebModule("apps/web/src/vfx/zeynep-signatures.ts");
const { VfxLod } = await importWebModule("apps/web/src/vfx/lod.ts");
const { AttackVfx } = await importWebModule("apps/web/src/vfx/attack-vfx.ts");
const { BeamRenderer } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");
const scenarioModule = await importWebModule("apps/web/src/vfx/vfx-scenario.ts");

const GOLD = 0xf59e0b;
const WHITE_GOLD = 0xfde68a;
const surfaces = () => [createRecorder(), createRecorder(), createRecorder(), createRecorder()];
const lines = (recorder) => recorder.calls.filter(([name]) => name === "lineBetween");
const styled = (recorder, name) => recorder.calls.filter(([call]) => call === name);
const lodAt = (level) => {
  const lod = new VfxLod();
  lod.force(level);
  return lod;
};

test("ferman çizgisi iki temastan sonra delinen düşmanları birleştiriyor; kertik düşmanın boyunda", () => {
  const [ground, links, glow, marks] = surfaces();
  const vfx = new zeynep.ZeynepSignatureVfx(ground, links, glow, marks, { lod: lodAt(0) });
  vfx.emit({ kind: "pierce", key: "p1", x: 100, y: 100, angle: 0, definitionId: "zeynep-1", tier: 1 }, 0);
  vfx.render({ enemies: [], now: 10, scale: 1 });
  assert.equal(lines(links).length, 0, "tek temasta cizgi yok");
  vfx.emit({ kind: "pierce", key: "p1", x: 150, y: 100, angle: 0, definitionId: "zeynep-1", tier: 1 }, 40);
  vfx.render({ enemies: [], now: 60, scale: 1 });
  const drawn = lines(links);
  assert.ok(drawn.length >= 1);
  const [, x1, , x2] = drawn[0];
  assert.ok(x1 < 100 && x2 > 150, "cizgi iki temasi kapsiyor (uclari tasiyor)");
  assert.equal(vfx.countLive("pierce"), 1, "ayni mermi tek cizgi");

  // Kertik dusmanin ekrandaki capinda: grunt 34, iri brute 56; govdeyi sariyor.
  const tick = (size) => {
    const events = createRecorder();
    const attack = new AttackVfx(createRecorder(), createRecorder(), events, undefined, { lod: lodAt(0) });
    attack.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "zeynep-1", tier: 1, bornAt: 0, key: "c", size });
    attack.render(60, 1);
    const [, x1, y1, x2, y2] = lines(events)[0];
    return Math.hypot(x2 - x1, y2 - y1);
  };
  assert.ok(tick(56) > tick(34) * 1.4, `kertik boyu dusmanla: ${tick(34)} / ${tick(56)}`);
  assert.ok(tick(34) <= 34 && tick(56) <= 56, "kertik govdeden tasmiyor");
});

test("regalya: ferman çizgisi son temasa kapanıyor ve orada taç; hareket azaltmada kapanmıyor", () => {
  const run = (reducedMotion) => {
    const [ground, links, glow, marks] = surfaces();
    const vfx = new zeynep.ZeynepSignatureVfx(ground, links, glow, marks, { lod: lodAt(0), reducedMotion: () => reducedMotion });
    vfx.emit({ kind: "pierce", key: "p1", x: 0, y: 0, angle: 0, definitionId: "zeynep-1", tier: 3 }, 0);
    vfx.emit({ kind: "pierce", key: "p1", x: 100, y: 0, angle: 0, definitionId: "zeynep-1", tier: 3 }, 0);
    const starts = [];
    for (const now of [20, 200, 380, 460]) {
      links.calls.length = 0;
      marks.calls.length = 0;
      vfx.render({ enemies: [], now, scale: 1 });
      starts.push(lines(links)[0]?.[1]);
    }
    return { starts, crown: marks.calls.some(([name]) => name === "strokePath") };
  };
  const live = run(false);
  assert.ok(live.starts[3] > live.starts[0] + 20, `cizgi kapanmali: ${live.starts.join(" / ")}`);
  assert.ok(live.crown, "kapandigi yerde tac");
  const still = run(true);
  assert.equal(still.starts[0], still.starts[2], "hareket azaltmada cizgi kapanmiyor");
});

test("spot ışığı ve damga düşmanı kimlikle izliyor, gövdeyi sarıyor; yazı ve can çubuğu bandına girmiyor", () => {
  const size = 34;
  for (const tier of [1, 2, 3]) {
    const [ground, links, glow, marks] = surfaces();
    const vfx = new zeynep.ZeynepSignatureVfx(ground, links, glow, marks, { lod: lodAt(0), reducedMotion: () => true });
    vfx.emit({ kind: "spotlight", key: "e1", x: 0, y: 0, color: 0xf9a8d4, tier }, 0);
    vfx.emit({ kind: "brand", key: "e2", x: 0, y: 0, color: 0x7f1d1d, tier, durationMs: 1200, strength: 3 }, 0);
    // Dusmanlar yurudu: isaretler oynatma konumunda.
    vfx.render({ enemies: [{ id: "e1", x: 200, y: 100 }, { id: "e2", x: 400, y: 100 }], now: 100, scale: 1, enemySize: () => size });
    const pointsOf = (recorder, cx) => recorder.calls.flatMap(([name, ...args]) => {
      if (name === "lineBetween") return [[args[0], args[1]], [args[2], args[3]]];
      if (name === "fillTriangle") return [[args[0], args[1]], [args[2], args[3]], [args[4], args[5]]];
      if (name === "fillRect") return [[args[0], args[1]], [args[0] + args[2], args[1] + args[3]]];
      return [];
    }).filter(([x]) => Math.abs(x - cx) < 60);
    for (const [cx, label] of [[200, "spot"], [400, "damga"]]) {
      const points = pointsOf(marks, cx);
      assert.ok(points.length > 0, `${label} cizilmeli (kademe ${tier})`);
      for (const [, y] of points) {
        // Ust: durum yazisi (y - max(18, 0.42 * boy)); alt: can cubugu (y + boy/2 + 5).
        assert.ok(y > 100 - size * 0.5 && y < 100 + size * 0.5 + 4, `${label} kademe ${tier}: y ${y.toFixed(1)} yazi ya da can cubugu bandinda`);
      }
    }
  }
});

test("Kin damgası: şerit sayısı yavaşlatmanın gücü, okunur boyda; LOD 3'te tek şerit", () => {
  for (const strength of [1, 2, 3]) {
    const draw = (level) => {
      const [ground, links, glow, marks] = surfaces();
      const vfx = new zeynep.ZeynepSignatureVfx(ground, links, glow, marks, { lod: lodAt(level), reducedMotion: () => true });
      vfx.emit({ kind: "brand", key: "e", x: 100, y: 100, color: 0x7f1d1d, tier: 2, durationMs: 1000, strength }, 0);
      vfx.render({ enemies: [{ id: "e", x: 100, y: 100 }], now: 50, scale: 1, enemySize: () => 34 });
      return marks;
    };
    const pips = styled(draw(0), "fillTriangle").filter(([, x]) => x > 100 + 34 * 0.44);
    assert.equal(pips.length, strength, `guc ${strength}`);
    const ys = pips.map(([, , y]) => y).sort((a, b) => a - b);
    for (const [, x0, y0, x1, y1, , y2] of pips) {
      assert.ok(x1 - x0 >= zeynep.BRAND_PIP_SIZE && y2 - y1 >= zeynep.BRAND_PIP_SIZE, "serit en az 3 birim");
      assert.ok(y0 >= 100 - 17 && y0 <= 100 + 17);
    }
    for (let index = 1; index < ys.length; index += 1) {
      assert.ok(ys[index] - ys[index - 1] - zeynep.BRAND_PIP_SIZE >= zeynep.BRAND_PIP_GAP, "aralik en az 2 birim");
    }
    const strip = styled(draw(3), "fillRect").filter(([, x]) => x > 100 + 34 * 0.44);
    assert.equal(strip.length, 1, "LOD 3 tek serit");
    assert.equal(strip[0][4], strength * zeynep.BRAND_PIP_SIZE + (strength - 1) * zeynep.BRAND_PIP_GAP);
  }
  assert.deepEqual([0.1, 0.5, 0.9].map((ratio) => zeynep.getKinBrandStrength(ratio * 90, 90)), [1, 2, 3]);
});

test("takım arkadaşının regalyası %70, beyaz iç parlama saniyede en fazla 3 kez", () => {
  const sealAlpha = (own) => {
    const [ground, links, glow, marks] = surfaces();
    const vfx = new zeynep.ZeynepSignatureVfx(ground, links, glow, marks, { lod: lodAt(0), reducedMotion: () => true });
    vfx.emit({ kind: "crossing", x: 0, y: 0, vertical: true, railHalf: 34, tier: 3, own }, 0);
    vfx.render({ enemies: [], now: 10, scale: 1 });
    // Muhrun kabartmasi beyaz altin dikdortgen.
    return marks.calls.filter(([name, color]) => name === "fillStyle" && color === WHITE_GOLD).map(([, , alpha]) => alpha)[0];
  };
  assert.ok(Math.abs(sealAlpha(false) / sealAlpha(true) - 0.7) < 1e-6, "arkadasin muhru %70");

  const [ground, links, glow, marks] = surfaces();
  const vfx = new zeynep.ZeynepSignatureVfx(ground, links, glow, marks, { lod: lodAt(0) });
  const enemies = [];
  for (let at = 0; at < 1000; at += 100) {
    for (let index = 0; index < 6; index += 1) {
      enemies.push({ id: `e${at}-${index}`, x: index * 40, y: 0 });
      vfx.emit({ kind: "spotlight", key: `e${at}-${index}`, x: index * 40, y: 0, color: 0xf9a8d4, tier: 1 }, at);
    }
  }
  let flashes = 0;
  for (let now = 0; now < 1100; now += 16) {
    glow.calls.length = 0;
    vfx.render({ enemies, now, scale: 1 });
    if (glow.calls.some(([name]) => name === "fillTriangle" || name === "fillRect")) flashes += 1;
  }
  // Her parlama ~70 ms (4-5 kare): 1 saniyede en fazla 3 parlama, ~14 kare.
  assert.ok(flashes <= 3 * 5, `parlama karesi ${flashes}`);
});

/* ------------------------------------------------------------------ */
/* Izleyici: olaylar mevcut veriden                                     */
/* ------------------------------------------------------------------ */

const context = { gridSize: 34, worldScale: 1, isOwnOwner: (ownerId) => ownerId === undefined || ownerId === "me" };
const collect = () => {
  const events = [];
  const tracker = new zeynep.ZeynepReceiptTracker((event, delayMs) => events.push({ ...event, delayMs }));
  return { events, tracker };
};

test("Gösteri hattı: hattaki düşmanlar (sunucunun sorgusu, çarpışma yarıçapıyla) yeni ışında bir kez spot alıyor", () => {
  const { events, tracker } = collect();
  const towers = [{ id: "t2", definitionId: "zeynep-2", x: 0, y: 0, level: 5, ownerId: "me" }];
  const beam = { id: "showcase-t2-1", definitionId: "zeynep-2", tier: 2, x1: 0, y1: 0, x2: 200, y2: 0, width: 18, color: 0xf9a8d4, ttlMs: 260 };
  const enemies = [
    { id: "on", x: 80, y: 3 },
    // Yaricap: grunt 15 + hattin yari genisligi 9 = 24.
    { id: "edge", x: 120, y: 22 },
    { id: "brute", x: 150, y: 27, type: "brute" },
    { id: "off", x: 120, y: 40 },
    { id: "behind", x: -40, y: 0 }
  ];
  tracker.noteSnapshot([beam], enemies, towers, context, 0);
  assert.deepEqual(events.filter((event) => event.kind === "spotlight").map((event) => event.key).sort(), ["brute", "edge", "on"]);
  assert.ok(events.every((event) => event.own === true && event.tier === 2 && event.color === 0xf9a8d4));
  events.length = 0;
  tracker.noteSnapshot([{ ...beam, ttlMs: 200 }], enemies, towers, context, 60);
  assert.equal(events.filter((event) => event.kind === "spotlight").length, 0, "ayni isin ikinci kez spot vermiyor");
  // Kin gosterisi: gercek koni (genislikten), merkez menzil icinde.
  events.length = 0;
  const cone = { id: "kin-showcase-t3-4", definitionId: "zeynep-3-kin-showcase", x1: 0, y1: 0, x2: 100, y2: 0, width: Math.tan(Math.PI / 6) * 200, color: 0xef4444, ttlMs: 260 };
  tracker.noteSnapshot([cone], [{ id: "in", x: 80, y: 40 }, { id: "out", x: 60, y: 45 }, { id: "far", x: 110, y: 0 }], [], context, 120);
  assert.deepEqual(events.filter((event) => event.kind === "spotlight").map((event) => event.key), ["in"]);
});

test("Kin dalgası: bandı geçen düşman bir kez damgalanıyor; güç uzaklıktan, süre kulenin yavaşlatmasından", () => {
  const { events, tracker } = collect();
  const towers = [{ id: "k", definitionId: "zeynep-6", x: 0, y: 0, level: 5, range: 90, ownerId: "mate" }];
  const enemies = [{ id: "near", x: 15, y: 0 }, { id: "mid", x: 45, y: 4 }, { id: "far", x: 80, y: -5 }, { id: "aside", x: 40, y: 60 }];
  for (let front = 10; front <= 90; front += 7) {
    const width = Math.max(8, Math.tan(Math.PI / 6) * front * 2);
    tracker.noteSnapshot([{ id: "kin-wave-kw1", definitionId: "zeynep-6", tier: 2, x1: 0, y1: 0, x2: front, y2: 0, width, color: 0x7f1d1d, ttlMs: 120 }], enemies, towers, context, front);
  }
  const brands = events.filter((event) => event.kind === "brand");
  assert.deepEqual(brands.map((event) => event.key), ["near", "mid", "far"], "her dusman bir kez, konide olmayan hic");
  assert.deepEqual(brands.map((event) => event.strength), [1, 2, 3]);
  // Sunucu: (1150 + (5 - 1) * 80) oyun ms, gercek saatte / 0.8.
  assert.ok(brands.every((event) => Math.abs(event.durationMs - (1150 + 320) / 0.8) < 1e-6));
  assert.ok(brands.every((event) => event.own === false), "takim arkadasinin Kin'i");
});

test("Abartı geçişi: yalnızca aynı sahibin rayı; mermide uçuş süresi kadar sonra", () => {
  const { events, tracker } = collect();
  const towers = [
    { id: "h", definitionId: "zeynep-1", x: 0, y: 0, level: 1, ownerId: "me" },
    { id: "a-me", definitionId: "zeynep-8", x: 60, y: 0, level: 10, ownerId: "me", orientation: "vertical" },
    { id: "a-mate", definitionId: "zeynep-8", x: 30, y: 0, level: 5, ownerId: "mate", orientation: "vertical" }
  ];
  tracker.noteProjectileSpawn({ id: "p1", definitionId: "zeynep-1", x: 0, y: 0, vx: 200, vy: 0, tier: 1 }, towers, context, 0);
  const crossings = events.filter((event) => event.kind === "crossing");
  assert.equal(crossings.length, 1, "takim arkadasinin rayi atisi degistirmiyor");
  assert.equal(crossings[0].x, 60);
  assert.equal(crossings[0].tier, 3, "nabzin kademesi Abarti'nin seviyesinden");
  assert.equal(crossings[0].projectileId, "p1");
  const thickness = Math.max(5, 34 * 0.16);
  assert.ok(Math.abs(crossings[0].delayMs - ((60 - thickness / 2) / 200) * 1000) < 1e-6, `gecikme ${crossings[0].delayMs}`);

  // Isin: on kenarin yolu rayi kestiginde; Gosteri'nin ilk gorunusunde kuleden.
  events.length = 0;
  const showcase = { id: "showcase-h-2", definitionId: "zeynep-2", x1: 0, y1: 0, x2: 120, y2: 0, width: 18, color: 0xbf8399, ttlMs: 260 };
  tracker.noteSnapshot([showcase], [], towers, context, 10);
  assert.equal(events.filter((event) => event.kind === "crossing").length, 1);
  events.length = 0;
  tracker.noteSnapshot([showcase], [], towers, context, 70);
  assert.equal(events.filter((event) => event.kind === "crossing").length, 0, "ayni isin ikinci kez nabiz vermiyor");
});

test("Taht atışı: dizilim paylaşılan kuraldan; kopyalanan Hiza mermisi Taht'ın mızrağı", () => {
  const { events, tracker } = collect();
  const trio = [
    { id: "t", definitionId: "zeynep-3", x: 0, y: 0, level: 5, ownerId: "me", characterId: "zeynep" },
    { id: "a", definitionId: "zeynep-1", x: 34, y: 0, level: 5, ownerId: "me", characterId: "zeynep" },
    { id: "b", definitionId: "zeynep-6", x: 0, y: 34, level: 5, ownerId: "me", characterId: "zeynep" }
  ];
  assert.equal(tracker.noteProjectileSpawn({ id: "p1", definitionId: "zeynep-3-kin-projectile", x: 2, y: 0, vx: 100, vy: 0, tier: 2 }, trio, context, 0), undefined);
  const formation = events.filter((event) => event.kind === "formation");
  assert.equal(formation.length, 1);
  assert.deepEqual(formation[0].members.map((member) => member.definitionId).sort(), ["zeynep-1", "zeynep-6"]);
  // Cift Hiza iki mizrak: ayni atis tek dizilim.
  tracker.noteProjectileSpawn({ id: "p2", definitionId: "zeynep-3", x: 2, y: 0, vx: 100, vy: 0, tier: 2 }, trio, context, 20);
  assert.equal(events.filter((event) => event.kind === "formation").length, 1);
  // Kopya: Taht'tan cikan Hiza mermisi.
  const copy = tracker.noteProjectileSpawn({ id: "p3", definitionId: "zeynep-1", x: 1, y: 1, vx: 100, vy: 0 }, trio, context, 400);
  assert.equal(copy, zeynep.TAHT_COPY_ID);
  assert.equal(tracker.noteProjectileSpawn({ id: "p4", definitionId: "zeynep-1", x: 34, y: 0, vx: 100, vy: 0 }, trio, context, 800), undefined, "Hiza'nin kendi atisi kopya degil");
  // Dorduncu bagli kule dizilimi bozuyor: Taht atsa bile dizilim cizilmiyor.
  events.length = 0;
  const crowded = [...trio, { id: "c", definitionId: "zeynep-2", x: 34, y: 34, level: 5, ownerId: "me", characterId: "zeynep" }];
  tracker.noteProjectileSpawn({ id: "p5", definitionId: "zeynep-3", x: 0, y: 0, vx: 100, vy: 0 }, crowded, context, 2000);
  assert.equal(events.filter((event) => event.kind === "formation").length, 0);
});

test("ayna ışını: sekme köşesi bir kez, duvarın normaliyle; mızrak köşeyi kesmiyor, gerçek genişlikte", () => {
  const { events, tracker } = collect();
  // Alt duvara (y = 100) carpip yukari sekiyor.
  const ray = { id: "zeynep-ray-zr1", definitionId: "zeynep-3-ray", tier: 2, x1: 20, y1: 60, x2: 80, y2: 60, b: [50, 100], width: 20, color: 0xf0abfc, ttlMs: 140 };
  tracker.noteSnapshot([ray], [], [], context, 0);
  tracker.noteSnapshot([{ ...ray, x1: 30, y1: 73.3, x2: 90, y2: 46.7 }], [], [], context, 60);
  const bounces = events.filter((event) => event.kind === "bounce");
  assert.equal(bounces.length, 1, "kose bir kez");
  assert.ok(Math.abs(Math.abs(Math.sin(bounces[0].angle)) - 1) < 1e-6, "alt duvarin normali dikey");

  const recorder = createRecorder();
  new BeamRenderer(recorder).render([ray], { now: 50, sceneNow: 50, scale: 1, reducedMotion: true });
  const segments = lines(recorder).map(([, x1, y1, x2, y2]) => `${x1},${y1}->${x2},${y2}`);
  assert.ok(segments.includes("20,60->50,100") && segments.includes("50,100->80,60"), "kuyruk -> sekme -> bas");
  assert.ok(!segments.includes("20,60->80,60"), "koseyi kesen kiris cizilmemeli");
  const envelope = styled(recorder, "lineStyle").some(([, width]) => width === 20);
  assert.ok(envelope, "zarf isinin gercek genisliginde (vurdugu bant)");
});

test("Kin gösterisi gerçek 60 derece; yanık izi canlı; Kin dalgası sönerek kayboluyor", () => {
  const range = 100;
  const cone = { id: "kin-showcase-t-1", definitionId: "zeynep-3-kin-showcase", x1: 0, y1: 0, x2: range, y2: 0, width: Math.tan(Math.PI / 6) * range * 2, color: 0xef4444, ttlMs: 200 };
  const recorder = createRecorder();
  new BeamRenderer(recorder).render([cone], { now: 0, sceneNow: 0, scale: 1 });
  const edge = lines(recorder).find(([, x1, y1, x2, y2]) => x1 === 0 && y1 === 0 && x2 === range && Math.abs(Math.abs(y2) - cone.width / 2) < 1e-6);
  assert.ok(edge, "koninin kenari gercek yari genislikte (60 derece)");
  const chevrons = (tier) => {
    const r = createRecorder();
    new BeamRenderer(r).render([{ ...cone, tier }], { now: 0, sceneNow: 0, scale: 1 });
    return styled(r, "lineStyle").filter(([, , color]) => color === GOLD).length;
  };
  assert.equal(chevrons(undefined), 0);
  assert.ok(chevrons(2) > 0, "kademe 5'te altin seritler");

  const trail = { id: "zeynep-burn-trail-t-1", definitionId: "zeynep-3-burn-trail", x1: 0, y1: 0, x2: 120, y2: 0, width: 32, color: 0x0e7490, ttlMs: 2000 };
  const trailCalls = (now, reducedMotion, extra = {}) => {
    const r = createRecorder();
    new BeamRenderer(r).render([{ ...trail, ...extra }], { now, sceneNow: now, scale: 1, reducedMotion });
    return r.calls;
  };
  assert.notDeepEqual(trailCalls(100, false), trailCalls(400, false), "iz duragan bir serit degil");
  assert.deepEqual(trailCalls(100, true), trailCalls(400, true), "hareket azaltmada iz sabit");
  // Regalya: son 320 ms'de uclarindan kapaniyor.
  const firstLine = (calls) => calls.find(([name]) => name === "lineBetween");
  const open = firstLine(trailCalls(0, false, { tier: 3, ttlMs: 1000 }));
  const closing = firstLine(trailCalls(0, false, { tier: 3, ttlMs: 100 }));
  assert.ok(closing[1] > open[1] + 20 && closing[3] < open[3] - 20, "iz kapanmali");

  // Kin dalgasi kaybolunca son halinde 200 ms'de soner.
  const wave = { id: "kin-wave-kw9", definitionId: "zeynep-6", x1: 0, y1: 0, x2: 60, y2: 0, width: 66, color: 0x7f1d1d, ttlMs: 120 };
  const waveRecorder = createRecorder();
  const renderer = new BeamRenderer(waveRecorder);
  renderer.render([wave], { now: 0, sceneNow: 0, scale: 1 });
  const alphaAt = (now) => {
    waveRecorder.calls.length = 0;
    renderer.render([], { now, sceneNow: now, scale: 1 });
    return Math.max(0, ...styled(waveRecorder, "lineStyle").map(([, , , alpha]) => alpha));
  };
  const early = alphaAt(40);
  const late = alphaAt(160);
  assert.ok(early > 0 && late > 0 && late < early, `sonme ${early} -> ${late}`);
  assert.equal(alphaAt(260), 0, "200 ms sonra hicbir sey");
});

test("hareket azaltma: zerre, büyüme ve kayma yok; çizim zamandan bağımsız ve tohumlu", () => {
  const draw = (now, reducedMotion) => {
    const [ground, links, glow, marks] = surfaces();
    const vfx = new zeynep.ZeynepSignatureVfx(ground, links, glow, marks, { lod: lodAt(0), reducedMotion: () => reducedMotion });
    for (const input of [
      { kind: "spotlight", key: "e1", x: 0, y: 0, color: 0xf9a8d4 },
      { kind: "crossing", x: 60, y: 0, vertical: false, railHalf: 34 },
      { kind: "bounce", key: "b", x: 10, y: 50, angle: 0, color: 0xe879f9 }
    ]) vfx.emit({ ...input, tier: 3 }, 0);
    vfx.render({ enemies: [{ id: "e1", x: 0, y: 0 }], now, scale: 1, enemySize: () => 34 });
    const geometry = [ground, links, glow, marks].flatMap((recorder) => recorder.calls.filter(([name]) => name !== "lineStyle" && name !== "fillStyle" && name !== "clear"));
    return JSON.stringify(geometry.map((call) => call.map((value) => (typeof value === "number" ? Math.round(value * 100) / 100 : value))));
  };
  // Ikinci perde 80 ms'de basliyor (zaman, hareket degil); iki an da ondan sonra.
  assert.equal(draw(120, true), draw(300, true), "hareket azaltmada sekiller yerinde");
  assert.notEqual(draw(120, false), draw(300, false));
  assert.equal(draw(123, false), draw(123, false), "ayni an ayni cizim (Math.random yok)");
});

/* ------------------------------------------------------------------ */
/* Galeri ve yuk                                                         */
/* ------------------------------------------------------------------ */

test("galeri: Zeynep satırları mekaniği gösteren sahnelerde (delme, dizilim kurulup bozuluyor, sekme, yanık, damga, Abartı)", () => {
  const rows = scenarioModule.getGalleryRows();
  const keys = rows.map((row) => row.key);
  for (const key of ["zeynep-1", "zeynep-2", "zeynep-3", "zeynep-3:ayna", "zeynep-3:yanik", "zeynep-3:kin", "zeynep-6", "zeynep-8"]) assert.ok(keys.includes(key), `${key} satiri yok`);

  const walkers = [];
  const towers = [];
  const add = (court, definitionId, x, y, extra = {}) => {
    const first = walkers.length;
    // Kin: yakin, orta, uzak (menzil 88'in ucte birleri); digerleri sira halinde.
    const start = court === "kin" ? 22 : 40;
    const spacing = court === "kin" ? 26 : 16;
    for (let index = 0; index < 3; index += 1) walkers.push({ id: `w-${court}-${index}`, cx: x + start + index * spacing, cy: y, rx: 0, ry: 10, periodMs: 3600, phase: 0 });
    towers.push({ id: `g-${court}`, definitionId, level: 10, x, y, color: 0xec4899, own: true, walker: first, walkers: [first, first + 1, first + 2], intervalMs: 1000, court, ...extra });
  };
  add("pierce", "zeynep-1", 20, 50);
  add("lances", "zeynep-3", 20, 150, { intervalMs: 1300 });
  add("ray", "zeynep-3", 20, 250, { intervalMs: 1400, bounds: { left: 0, right: 130, top: 230, bottom: 290 } });
  add("burn", "zeynep-3", 20, 350, { intervalMs: 4200 });
  add("kin", "zeynep-6", 20, 450, { intervalMs: 2400, displayRange: 88 });
  add("abarti", "zeynep-8", 46, 550, { intervalMs: 1100, anchor: { x: 14, y: 550 } });
  const scenario = new scenarioModule.VfxScenario(towers, walkers);
  const emitted = [];
  const vfx = { emit: (event) => emitted.push(event) };
  const feed = new scenarioModule.ScenarioCourtFeed(vfx, { gridSize: 22, worldScale: 22 / 34, isOwnOwner: () => true });
  const modes = new Set();
  let brokenShots = 0;
  let bounced = 0;
  let trails = 0;
  for (let now = 0; now <= 17000; now += 20) {
    const frame = scenario.frame(now, now - 20);
    feed.feed(frame, now);
    const mode = scenarioModule.getCourtLanceMode(now);
    modes.add(mode);
    if (mode === "broken") brokenShots += frame.projectiles.filter((projectile) => projectile.id.startsWith("g-lances") && projectile.id.endsWith(`p${Math.floor((now - 0) / 1300)}`)).length;
    bounced += frame.beams.filter((beam) => beam.definitionId === "zeynep-3-ray" && beam.b).length;
    trails += frame.beams.filter((beam) => beam.definitionId === "zeynep-3-burn-trail").length;
  }
  const kinds = (kind) => emitted.filter((event) => event.kind === kind);
  const pierces = new Map();
  for (const event of kinds("pierce")) pierces.set(event.key, (pierces.get(event.key) ?? 0) + 1);
  assert.ok([...pierces.values()].some((count) => count >= 2), "Hiza iki dusmani delmeli");
  assert.deepEqual([...modes].sort(), ["broken", "copy", "dual", "kin"]);
  assert.equal(brokenShots, 0, "bozuk dizilimde Taht atmiyor");
  assert.ok(kinds("formation").length > 0, "dizilim Taht atisinda");
  assert.ok(bounced > 0 && kinds("bounce").length > 0, "ayna isini sekiyor");
  assert.ok(trails > 0, "yanik izi");
  assert.deepEqual([...new Set(kinds("brand").map((event) => event.strength))].sort(), [1, 2, 3], "Kin damgasi yakin/orta/uzak");
  assert.ok(kinds("crossing").length > 0, "Abarti gecisi");
});

test("yük testi: 60 düşmanın hepsi Kin damgalıyken bile LOD 0 bütçe içinde, LOD damgayı döküyor", async () => {
  const { runVfxBench } = await import("../tools/vfx-bench.mjs");
  const full = await runVfxBench({ lodLevel: 0, kinBrandEvery: 1 });
  const shed = await runVfxBench({ lodLevel: 3, kinBrandEvery: 1 });
  assert.ok(full.kinBranded === 60);
  assert.ok(full.verticesPerFrame < 20000, `kose ${full.verticesPerFrame}`);
  assert.ok(full.earcutPerFrame < 16, `earcut ${full.earcutPerFrame}`);
  assert.ok(shed.courtVerticesPerFrame < full.courtVerticesPerFrame * 0.75, `damga LOD: ${shed.courtVerticesPerFrame} / ${full.courtVerticesPerFrame}`);
  // Birlesik en kotu durum: 60 dusmanin hepsi hem Takipci isaretli hem Kin damgali.
  // Yalnizca isaret 20.5k (Atakan'in olcumu); damga isaretli dusmanda besige
  // iniyor. LOD 2 butcenin cok altinda.
  const both = await runVfxBench({ lodLevel: 0, markEvery: 1, kinBrandEvery: 1 });
  const bothShed = await runVfxBench({ lodLevel: 2, markEvery: 1, kinBrandEvery: 1 });
  const markedOnly = await runVfxBench({ lodLevel: 0, markEvery: 1 });
  assert.ok(both.verticesPerFrame - markedOnly.verticesPerFrame < 1600, `isaretli dalgada damganin payi ${both.verticesPerFrame - markedOnly.verticesPerFrame}`);
  assert.ok(bothShed.verticesPerFrame < 16000, `LOD 2 birlesik kose ${bothShed.verticesPerFrame}`);
});

/* ------------------------------------------------------------------ */
/* Inceleme duzeltmeleri                                                */
/* ------------------------------------------------------------------ */

const { BeamInterpolator } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");
const atakan = await importWebModule("apps/web/src/vfx/atakan-signatures.ts");

test("sekme köşesi (b) ara değerleyiciden geçiyor; havuzdaki eski köşe yeni ışına sızmıyor", () => {
  const interpolator = new BeamInterpolator();
  const ray = (extra) => ({ id: "zeynep-ray-zr1", definitionId: "zeynep-3-ray", x1: 20, y1: 60, x2: 80, y2: 60, width: 20, color: 0xf0abfc, ttlMs: 140, ...extra });
  const first = interpolator.interpolate([ray({ b: [50, 100] })], [ray({ b: [50, 100], x1: 24, y1: 66, x2: 84, y2: 54 })], 0.5, 60);
  assert.deepEqual(first[0].b, [50, 100], "kose ara degerlenmis isinda");
  // Oyundaki yol: ara degerlenmis isin cizicide kirik ciziliyor.
  const recorder = createRecorder();
  new BeamRenderer(recorder).render(first, { now: 50, sceneNow: 50, scale: 1, reducedMotion: true });
  const segments = lines(recorder).map(([, x1, y1, x2, y2]) => [x1, y1, x2, y2]);
  assert.ok(segments.some(([, , x2, y2]) => x2 === 50 && y2 === 100), "kuyruk -> kose");
  assert.ok(segments.some(([x1, y1]) => x1 === 50 && y1 === 100), "kose -> bas");
  // Ayni havuz yuvasina koseyi olmayan baska bir isin: kose silinmeli.
  const other = { id: "showcase-t2-9", definitionId: "zeynep-2", x1: 0, y1: 0, x2: 100, y2: 0, width: 18, color: 0xf9a8d4, ttlMs: 260 };
  const second = interpolator.interpolate([], [other], 0.5, 60);
  assert.equal(second[0], first[0], "havuz nesnesi yeniden kullaniliyor");
  assert.equal(second[0].b, undefined, "eski kose yeni isina sizmamali");
  // Kose sonraki snapshot'ta kalkti (sekme gecildi): o da silinmeli.
  const passed = interpolator.interpolate([ray({ b: [50, 100] })], [ray({ x1: 60, y1: 80, x2: 90, y2: 30 })], 0.5, 60);
  assert.equal(passed[0].b, undefined);
});

test("Kin damgası Abartı rayını geçen dalgada uzayan menzile göre (paylaşılan çarpan)", () => {
  const strengths = (withRail) => {
    const { events, tracker } = collect();
    const towers = [{ id: "k", definitionId: "zeynep-6", x: 0, y: 0, level: 5, range: 90, ownerId: "me" }];
    // Ayni sahibin dikey Abarti'si dalganin taban menzili icinde (x = 40); sv 10 menzili iki katina cikariyor.
    if (withRail) towers.push({ id: "a", definitionId: "zeynep-8", x: 40, y: 0, level: 10, ownerId: "me", orientation: "vertical" });
    // Sahibi baska Abarti hicbir sey degistirmiyor.
    towers.push({ id: "a2", definitionId: "zeynep-8", x: 60, y: 0, level: 10, ownerId: "mate", orientation: "vertical" });
    const enemies = [{ id: "e", x: 55, y: 0 }];
    for (let front = 10; front <= 90; front += 7) {
      tracker.noteSnapshot([{ id: "kin-wave-kw2", definitionId: "zeynep-6", x1: 0, y1: 0, x2: front, y2: 0, width: Math.tan(Math.PI / 6) * front * 2, color: 0x7f1d1d, ttlMs: 120 }], enemies, towers, context, front);
    }
    return events.filter((event) => event.kind === "brand").map((event) => event.strength);
  };
  // 55 / 90 = 0.61 -> 2; 55 / (90 * 2.0) = 0.31 -> 1.
  assert.deepEqual(strengths(false), [2]);
  assert.deepEqual(strengths(true), [1]);
});

test("Kin damgası Takipçi nişangâhına değmiyor (her yığın, her boy); LOD 2'de işaretli düşmanda beşik yok", () => {
  const segmentDistance = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const brandPoints = (recorder) => recorder.calls.flatMap(([name, ...args]) => {
    if (name === "lineBetween") {
      const points = [];
      for (let step = 0; step <= 20; step += 1) points.push([args[0] + (args[2] - args[0]) * step / 20, args[1] + (args[3] - args[1]) * step / 20]);
      return points;
    }
    if (name === "fillTriangle") return [[args[0], args[1]], [args[2], args[3]], [args[4], args[5]]];
    if (name === "fillRect") return [[args[0], args[1]], [args[0] + args[2], args[1] + args[3]], [args[0], args[1] + args[3]], [args[0] + args[2], args[1]]];
    return [];
  });
  for (const size of [26, 34, 56]) {
    for (const stacks of [1, 2, 3]) {
      for (const tier of [1, 2, 3]) {
        const enemy = { id: "e", x: 100, y: 100, trackingStacks: stacks, k: "t" };
        const reticle = createRecorder();
        const reticleGlow = createRecorder();
        new atakan.AtakanSignatureVfx(createRecorder(), createRecorder(), reticleGlow, reticle, { lod: lodAt(0), reducedMotion: () => true })
          .render({ towers: [{ id: "t", definitionId: "warrior-1", x: 0, y: 0, level: 1 }], enemies: [enemy], now: 0, scale: 1, cellSize: 34, enemySize: () => size });
        const brackets = [...lines(reticle), ...lines(reticleGlow)];
        const [ground, links, glow, marks] = surfaces();
        const vfx = new zeynep.ZeynepSignatureVfx(ground, links, glow, marks, { lod: lodAt(0), reducedMotion: () => true });
        vfx.emit({ kind: "brand", key: "e", x: 100, y: 100, color: 0xdc2626, tier, durationMs: 1000, strength: 3 }, 0);
        vfx.render({ enemies: [enemy], now: 200, scale: 1, enemySize: () => size });
        let gap = Number.POSITIVE_INFINITY;
        for (const [px, py] of brandPoints(marks)) {
          for (const [, ax, ay, bx, by] of brackets) gap = Math.min(gap, segmentDistance(px, py, ax, ay, bx, by));
        }
        assert.ok(gap >= 1.5, `boy ${size}, yigin ${stacks}, kademe ${tier}: damga nisangaha ${gap.toFixed(2)} birim`);
        // Can cubugu bandina girmiyor.
        for (const [, py] of brandPoints(marks)) assert.ok(py < 100 + size / 2 + 4, `boy ${size}: damga can cubugunda (${py.toFixed(1)})`);
      }
    }
  }
  // LOD 2: isaretli dusmanda besik ve muhur dusuyor, sayi seridi kaliyor.
  const [ground, links, glow, marks] = surfaces();
  const vfx = new zeynep.ZeynepSignatureVfx(ground, links, glow, marks, { lod: lodAt(2), reducedMotion: () => true });
  vfx.emit({ kind: "brand", key: "e", x: 100, y: 100, color: 0xdc2626, tier: 3, durationMs: 1000, strength: 2 }, 0);
  vfx.render({ enemies: [{ id: "e", x: 100, y: 100, trackingStacks: 2 }], now: 100, scale: 1, enemySize: () => 34 });
  assert.equal(lines(marks).length, 0, "LOD 2 isaretli dusmanda besik yok");
  assert.equal(styled(marks, "fillRect").length, 1, "sayi seridi kaliyor");
});

test("Zorba'nın, Ölüler'in ve Fısıltı'nın aldığı düşman spot ışığı ve damga almıyor; damga yavaşlatma direncine göre", () => {
  const { events, tracker } = collect();
  const towers = [{ id: "k", definitionId: "zeynep-6", x: 0, y: 0, level: 1, range: 90, ownerId: "me" }];
  const enemies = [
    { id: "free", x: 30, y: 0 },
    { id: "runner", x: 36, y: 2, type: "runner" },
    { id: "dominated", x: 40, y: 0, isDominated: true },
    { id: "undead", x: 44, y: 0, isUndead: true },
    { id: "turned", x: 48, y: 0, isWhisperTurned: true }
  ];
  tracker.noteSnapshot([{ id: "showcase-t-1", definitionId: "zeynep-2", x1: 0, y1: 0, x2: 100, y2: 0, width: 18, color: 0xf9a8d4, ttlMs: 260 }], enemies, towers, context, 0);
  for (let front = 10; front <= 90; front += 7) {
    tracker.noteSnapshot([{ id: "kin-wave-kw3", definitionId: "zeynep-6", x1: 0, y1: 0, x2: front, y2: 0, width: Math.tan(Math.PI / 6) * front * 2, color: 0x7f1d1d, ttlMs: 120 }], enemies, towers, context, front);
  }
  assert.deepEqual(events.filter((event) => event.kind === "spotlight").map((event) => event.key).sort(), ["free", "runner"]);
  const brands = events.filter((event) => event.kind === "brand");
  assert.deepEqual(brands.map((event) => event.key).sort(), ["free", "runner"]);
  // Sv 1 Kin: 1150 oyun ms; kosucu %35 direncli; gercek saatte / 0.8.
  assert.ok(Math.abs(brands.find((event) => event.key === "free").durationMs - 1150 / 0.8) < 1e-6);
  assert.ok(Math.abs(brands.find((event) => event.key === "runner").durationMs - (1150 * 0.65) / 0.8) < 1e-6);
});

test("Abartı geçişi: oyun saatinden gerçek saate, durmuş merminin doğmamış nabzı iptal", () => {
  const { events, tracker } = collect();
  const towers = [
    { id: "h", definitionId: "zeynep-1", x: 0, y: 0, level: 1, ownerId: "me" },
    { id: "a", definitionId: "zeynep-8", x: 60, y: 0, level: 1, ownerId: "me", orientation: "vertical" }
  ];
  tracker.noteProjectileSpawn({ id: "p1", definitionId: "zeynep-1", x: 0, y: 0, vx: 200, vy: 0 }, towers, { ...context, timeScale: 1 / 0.8 }, 0);
  const thickness = Math.max(5, 34 * 0.16);
  assert.ok(Math.abs(events[0].delayMs - ((60 - thickness / 2) / 200) * 1000 / 0.8) < 1e-6, "sunucu mermiyi oyun hiziyla yurutuyor");

  const [ground, links, glow, marks] = surfaces();
  const vfx = new zeynep.ZeynepSignatureVfx(ground, links, glow, marks, { lod: lodAt(0) });
  vfx.emit({ kind: "crossing", x: 60, y: 0, vertical: true, railHalf: 34, projectileId: "p1" }, 500);
  vfx.emit({ kind: "crossing", x: 60, y: 0, vertical: true, railHalf: 34, projectileId: "p2" }, 500);
  vfx.render({ enemies: [], now: 300, scale: 1 });
  assert.equal(lines(links).length, 0, "dogmamis nabiz cizilmiyor");
  // p1 raya varmadan durdu (kaldirma 400'de); p2 raydan sonra (600'de).
  vfx.cancelCrossing("p1", 400);
  vfx.cancelCrossing("p2", 600);
  vfx.render({ enemies: [], now: 520, scale: 1 });
  assert.equal(vfx.countLive("crossing"), 1, "yalnizca raya varan merminin nabzi");
  assert.ok(lines(links).length > 0);
});

test("ferman kertiğinin beyaz çekirdeği saniyede en fazla 3 kez, hareket azaltmada hiç; yanık izleri aynı nabızda", () => {
  const dots = (reducedMotion) => {
    const events = createRecorder();
    const attack = new AttackVfx(createRecorder(), createRecorder(), events, undefined, { lod: lodAt(0), reducedMotion: () => reducedMotion });
    const white = 0xec4899;
    let count = 0;
    for (let at = 0; at < 1000; at += 50) {
      attack.emitImpact({ x: at, y: 0, angle: 0, definitionId: "zeynep-1", tier: 1, bornAt: at, key: `c${at}` });
      events.calls.length = 0;
      attack.render(at, 1);
      // Yeni dogan olayin cekirdegi tam parlaklikta (yas 0).
      count += events.calls.filter(([name, color, alpha]) => name === "fillStyle" && color !== white && alpha === 1 && color === liftWhite(white)).length;
    }
    return count;
  };
  const liftWhite = (color) => {
    const lift = (channel) => Math.round(channel + (255 - channel) * 0.8);
    return (lift((color >> 16) & 0xff) << 16) | (lift((color >> 8) & 0xff) << 8) | lift(color & 0xff);
  };
  const live = dots(false);
  assert.ok(live >= 1 && live <= 3, `bir saniyede ${live} cekirdek`);
  assert.equal(dots(true), 0);

  const trail = (id) => ({ id, definitionId: "zeynep-3-burn-trail", x1: 0, y1: 0, x2: 120, y2: 0, width: 32, color: 0x0e7490, ttlMs: 2000 });
  const recorder = createRecorder();
  new BeamRenderer(recorder).render([trail("zeynep-burn-trail-a-1"), trail("zeynep-burn-trail-b-7")], { now: 123, sceneNow: 123, scale: 1 });
  const bodyAlphas = styled(recorder, "lineStyle").filter(([, , color]) => color === 0x0e7490).map(([, , , alpha]) => alpha);
  assert.ok(bodyAlphas.length >= 4 && new Set(bodyAlphas.map((alpha) => alpha.toFixed(6))).size === 2, "iki iz ayni nabizda (zarf ve govde)");
});

test("dizilim şeridi synergy-marks elmasının (ortada) üstünde değil", () => {
  const [ground, links, glow, marks] = surfaces();
  const vfx = new zeynep.ZeynepSignatureVfx(ground, links, glow, marks, { lod: lodAt(0), reducedMotion: () => true });
  vfx.emit({ kind: "formation", key: "t", x: 0, y: 0, tier: 2, members: [{ x: 34, y: 0, definitionId: "zeynep-1" }] }, 0);
  vfx.render({ enemies: [], now: 50, scale: 1 });
  const goldLines = [];
  let gold = false;
  for (const [name, ...args] of marks.calls) {
    if (name === "lineStyle") gold = args[1] === GOLD;
    else if (name === "lineBetween" && gold) goldLines.push(args);
  }
  assert.ok(goldLines.length > 0, "nisan seridi cizilmeli");
  for (const [x1, y1, x2, y2] of goldLines) {
    for (const [px, py] of [[x1, y1], [x2, y2]]) assert.ok(Math.hypot(px - 17, py) > 3, "serit dizilim elmasinin uzerinde");
  }
});
