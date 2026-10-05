/**
 * Agir, sert dil: vurus efektleri sekerleme gibi degil.
 *
 * Sahibin geri bildirimi: "Vurus efektleri cok kotu. Sanki candy crush
 * oynuyorum." Secilen yon Debug Lazer gibi agir ve sert: az renk, beyaz-sicak
 * cekirdek, kivilcim, duman, metal kirintisi, kisa sert parlama; tac, muhur,
 * serit ve yaldiz yok; kademe sus degil renk ve guc. Buradaki testler bu
 * sozu kilitliyor:
 *
 * - Hicbir saldiri profili kaldirilan sus turlerini (serit, muhur, tac,
 *   yaldiz, gecit toreni, ikinci perde, kod biti, kosan parlama, aksan,
 *   cikartma) tasimiyor; o cizim yordamlari modullerden de gitti.
 * - Ramalar eski pembe -> altin -> beyaz altin rutbe rampasi degil.
 * - Mermi ve carpmanin cizdigi her renk yere indirilmis: ya doygunlugu
 *   sinirli bir ton, ya beyaz-sicak cekirdek, ya koyu dusum.
 * - Olum irkin malzemesiyle (metal, kitin, kristal, tas, kul), agirlikla
 *   buyuyor, hareket azaltmada hareketsiz, ucanda yer izi yok; LOD once
 *   kivilcimi, sonra dumani, sonra yer izini kesiyor.
 * - Kozmetik itme yalnizca kendi agir vurusunda, hareket azaltmada hic.
 * - Renk ya ton (doygunluk <= 0.62, aciklik <= 0.7), ya beyaz-sicak (aciklik
 *   >= 0.9 ya da acik ama neredeyse gri), ya koyu dusum: aradaki pastel bant
 *   (acik ve doygun: `eba8c9` pembe, `a8ebd2` nane) hicbir yerde yok -- mermi,
 *   carpma, parlama, isaret, Melis isinlari, Zeynep sutunu, olum, hasar
 *   sayilari ve sampiyon isareti dahil.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { towerCatalog } from "../packages/shared/dist/index.js";
import { createCountingGraphics, createRecorder, importWebModule } from "./helpers/web-module.mjs";

const profiles = await importWebModule("apps/web/src/vfx/vfx-profiles.ts");
const kit = await importWebModule("apps/web/src/vfx/kit.ts");
const zeynep = await importWebModule("apps/web/src/vfx/zeynep-signatures.ts");
const atakan = await importWebModule("apps/web/src/vfx/atakan-signatures.ts");
const combat = await importWebModule("apps/web/src/vfx/combat-vfx.ts");
const { AttackVfx } = await importWebModule("apps/web/src/vfx/attack-vfx.ts");
const { VfxLod } = await importWebModule("apps/web/src/vfx/lod.ts");

const attacking = [...new Map(Object.values(towerCatalog).flat().map((tower) => [tower.id, tower])).values()]
  .filter((tower) => profiles.isAttackingDefinition(tower));

const REMOVED_ORNAMENTS = ["chevrons", "seal", "crown", "giltMotes", "parade", "encore", "snap", "codeSparks", "glints", "accent", "decal", "trailMotif", "motes", "corona", "trim", "act", "secondBeat", "signatureTier"];
const OLD_RANK_COLORS = [0xf59e0b, 0xfde68a, 0x22c55e];

const channels = (color) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map((value) => value / 255);
function hsl(color) {
  const [r, g, b] = channels(color);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}
/**
 * Yere indirilmis renk: ton (doygunluk <= 0.62, orta aciklik), beyaz-sicak
 * (aciklik >= 0.9; ya da acik ama neredeyse gri, s <= 0.35) ya da koyu dusum.
 * Acik ve doygun pastel bant (0.7 < l < 0.9, s > 0.35) yok.
 */
const GROUNDED_MAX_SATURATION = 0.625;
const grounded = (color) => {
  const { s, l } = hsl(color);
  if (l <= 0.22 || l >= 0.9) return true;
  if (l > 0.7) return s <= 0.35;
  return s <= GROUNDED_MAX_SATURATION;
};
const hexToColor = (hex) => Number.parseInt(hex.replace("#", ""), 16);
const colorsOf = (...recorders) => recorders.flatMap((recorder) => recorder.calls
  .filter(([name]) => name === "lineStyle" || name === "fillStyle")
  .map(([name, a, b]) => (name === "lineStyle" ? b : a)));
const keysDeep = (value, out = new Set()) => {
  if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      out.add(key);
      keysDeep(inner, out);
    }
  }
  return out;
};
const lodAt = (level) => {
  const lod = new VfxLod();
  lod.force(level);
  return lod;
};

test("hiçbir saldırı profili kaldırılan süs türlerini taşımıyor", () => {
  const ids = [...attacking.map((tower) => tower.id), "zeynep-8"];
  for (const id of ids) {
    const keys = keysDeep(profiles.getVfxProfile(id));
    for (const ornament of REMOVED_ORNAMENTS) assert.ok(!keys.has(ornament), `${id} profili "${ornament}" tasiyor`);
  }
  for (const [id, profile] of Object.entries(profiles.ULTIMATE_PROFILES)) {
    const keys = keysDeep(profile);
    for (const ornament of REMOVED_ORNAMENTS) assert.ok(!keys.has(ornament), `${id} profili "${ornament}" tasiyor`);
  }
});

test("süs yordamları modüllerden gitti: kod biti, paket, yaldız, şerit, mühür, taç, altın", () => {
  for (const name of ["ATAKAN_ACCENT", "drawCodeSparks", "drawDataPackets", "drawTrailMotif", "drawGridTicks", "drawMotes", "drawPointCorona", "strokePointProfile", "strokeRingProfile"]) {
    assert.equal(kit[name], undefined, `kit.${name} hala var`);
  }
  for (const name of ["drawChevron", "drawWaxSeal", "drawCrownSigil", "drawDecreeSeal", "drawDecreeInsignia", "COURT_ENCORE_MS"]) {
    assert.equal(zeynep[name], undefined, `zeynep-signatures.${name} hala var`);
  }
  for (const name of ["ZEYNEP_GOLD", "ZEYNEP_WHITE_GOLD", "getCourtTier", "getSignatureTier"]) {
    assert.equal(profiles[name], undefined, `vfx-profiles.${name} hala var`);
  }
  assert.equal(combat.getZeynepTrim, undefined, "rutbe trimi (altin) gitti");
});

test("rampa eski pembe → altın → beyaz altın rütbe rampası değil: ton aynı, kademe sıcaklık", () => {
  for (const id of ["zeynep-1", "zeynep-2", "zeynep-3", "zeynep-6", "zeynep-8", "archer-1", "archer-2", "archer-5", "onur-2", "tank-1", "warrior-6"]) {
    const { ramp } = profiles.getVfxProfile(id);
    for (const old of OLD_RANK_COLORS) assert.ok(!ramp.includes(old), `${id} rampasi ${old.toString(16)} tasiyor`);
    assert.ok(profiles.hueDistance(ramp[0], ramp[2]) <= 6, `${id} rampa tonu kayiyor`);
    assert.ok(hsl(ramp[2]).l > hsl(ramp[0]).l, `${id} kademe 3 daha sicak olmali`);
  }
  // Zeynep'in kenari kademeyle isiniyor, altina donmuyor.
  for (const tier of [1, 2, 3]) {
    const edge = combat.getTierEdge(tier, 0xdc2626);
    assert.ok(!OLD_RANK_COLORS.includes(edge));
    assert.ok(profiles.hueDistance(edge, 0xdc2626) <= 6, `kademe ${tier} kenari kizilin tonunda degil`);
  }
});

test("mermi ve çarpmanın çizdiği her renk yere indirilmiş: sınırlı ton, beyaz-sıcak çekirdek ya da koyu düşüm", () => {
  const lod = lodAt(0);
  for (const tower of attacking) {
    if (tower.id === "warrior-5") continue; // Debug Lazer'in kendi cizimi (dokunulmadi).
    for (const tier of [1, 2, 3]) {
      const body = createRecorder();
      const glow = createRecorder();
      const events = createRecorder();
      const ground = createRecorder();
      const flashes = [];
      const vfx = new AttackVfx(body, glow, events, { flash: (spec) => flashes.push(spec) }, { lod, ground });
      for (let frame = 0; frame < 6; frame += 1) {
        vfx.renderProjectiles([{ id: "p1", kind: "tower", source: "tower", definitionId: tower.id, x: 100 + frame * 4, y: 200, vx: 240, vy: 0, tier: tier === 1 ? undefined : tier }], 1000 + frame * 16, 1);
      }
      vfx.emitAnticipation({ x: 0, y: 0, angle: 0, definitionId: tower.id, tier, bornAt: 2000 });
      vfx.emitMuzzle({ x: 0, y: 0, angle: 0, definitionId: tower.id, tier, bornAt: 2000 });
      vfx.emitImpact({ x: 50, y: 50, angle: 0.3, definitionId: tower.id, tier, bornAt: 2000, key: "c1", radius: 30 });
      for (const at of [2010, 2040, 2090, 2160, 2300, 2600]) vfx.render(at, 1);
      for (const color of [...colorsOf(body, glow, events, ground), ...flashes.filter((spec) => spec.tint !== 0xffffff).map((spec) => spec.tint)]) {
        assert.ok(grounded(color), `${tower.id} kademe ${tier}: sekerleme renk ${color.toString(16).padStart(6, "0")} (s ${hsl(color).s.toFixed(2)}, l ${hsl(color).l.toFixed(2)})`);
        assert.ok(!OLD_RANK_COLORS.includes(color), `${tower.id} kademe ${tier}: altin ya da terminal yesili`);
      }
    }
  }
});

test("Atakan ve Zeynep işaretleri de yere indirilmiş; altın ve terminal yeşili yok", () => {
  const surfaces = () => [createRecorder(), createRecorder(), createRecorder(), createRecorder()];
  for (const tier of [1, 2, 3]) {
    const court = surfaces();
    const vfx = new zeynep.ZeynepSignatureVfx(...court, { lod: lodAt(0) });
    vfx.emit({ kind: "spotlight", key: "e1", x: 100, y: 100, color: 0xf9a8d4, tier }, 0);
    vfx.emit({ kind: "brand", key: "e2", x: 140, y: 100, color: 0xda3232, durationMs: 1200, strength: 2, tier }, 0);
    vfx.emit({ kind: "crossing", x: 60, y: 100, vertical: true, railHalf: 34, color: 0x7c3aed, tier }, 0);
    vfx.emit({ kind: "bounce", key: "b", x: 30, y: 200, angle: 0, color: 0xf0abfc, tier }, 0);
    vfx.render({ enemies: [{ id: "e1", x: 100, y: 100 }, { id: "e2", x: 140, y: 100 }], now: 30, scale: 1, enemySize: () => 34 });
    const marks = surfaces();
    const level = tier === 3 ? 10 : tier === 2 ? 5 : 1;
    new atakan.AtakanSignatureVfx(...marks, { lod: lodAt(0) }).render({
      towers: [
        { id: "t1", definitionId: "warrior-1", x: 0, y: 0, level },
        { id: "t2", definitionId: "warrior-2", x: 20, y: 0, level, linkedTowerIds: ["t1"] },
        { id: "t3", definitionId: "warrior-3", x: 200, y: 200, level, range: 40, auraActive: true },
        { id: "t4", definitionId: "warrior-4", x: 40, y: 0, level, o: 6, t: "e1" },
        { id: "t6", definitionId: "warrior-6", x: 60, y: 60, level, u: 5 }
      ],
      enemies: [{ id: "e1", x: 100, y: 100, trackingStacks: 2, k: "t1" }],
      now: 30,
      scale: 1,
      cellSize: 28,
      enemySize: () => 34
    });
    for (const color of colorsOf(...court, ...marks)) {
      assert.ok(!OLD_RANK_COLORS.includes(color), `kademe ${tier}: ${color.toString(16)} altin ya da terminal yesili`);
      // Izolasyon ihlali kehribar bir uyari: islevsel, sus degil.
      if (color === 0xf59e0b) continue;
      assert.ok(grounded(color), `kademe ${tier}: sekerleme renk ${color.toString(16).padStart(6, "0")}`);
    }
  }
});

test("hareket azaltmada çarpma yerinde: kıvılcım ve kırıntı yok, şekil zamanla kaymıyor", () => {
  for (const definitionId of ["onur-3", "warrior-6", "mage-1", "warrior-2"]) {
    const geometry = (at) => {
      const events = createRecorder();
      const vfx = new AttackVfx(createRecorder(), createRecorder(), events, undefined, { lod: lodAt(0), reducedMotion: () => true });
      vfx.emitImpact({ x: 50, y: 50, angle: 0.3, definitionId, tier: 3, bornAt: 0, key: "c", radius: 30 });
      vfx.render(at, 1);
      return JSON.stringify(events.calls.filter(([name]) => name !== "lineStyle" && name !== "fillStyle" && name !== "clear"));
    };
    assert.equal(geometry(70), geometry(100), `${definitionId}: hareket azaltmada sekil kaymamali`);
  }
});

test("kozmetik itme yalnızca kendi ağır tek vuruşunda (kademe 2+), 1-2 px; hızlı atan kuleler titretmiyor; hareket azaltmada hiç", () => {
  const knocks = [];
  const make = (reducedMotion = false) => new AttackVfx(createRecorder(), createRecorder(), createRecorder(), undefined, {
    lod: lodAt(0),
    reducedMotion: () => reducedMotion,
    onKnock: (x, y, angle, px) => knocks.push(px)
  });
  const vfx = make();
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "onur-3", tier: 1, own: true, bornAt: 0 });
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "onur-3", tier: 3, own: false, bornAt: 0 });
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "warrior-6", tier: 3, own: true, bornAt: 0 });
  assert.deepEqual(knocks, [], "kademe 1, takim arkadasi ve enerji vurusu itmiyor");
  // Hizli atan kinetik kuleler (Onur oklari, Melis kirigi, Hiza, Takipci) itmiyor.
  for (const id of ["onur-3", "onur-5", "archer-2", "zeynep-1", "warrior-1"]) {
    vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: id, tier: 3, own: true, bornAt: 0 });
  }
  assert.deepEqual(knocks, [], "hafif kinetik vurus itmiyor");
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "warrior-2", tier: 2, own: true, bornAt: 0 });
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "onur-2", tier: 3, own: true, bornAt: 0 });
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "tank-1", tier: 3, own: true, bornAt: 0 });
  assert.deepEqual(knocks, [1, 2, 2]);
  make(true).emitImpact({ x: 0, y: 0, angle: 0, definitionId: "onur-2", tier: 3, own: true, bornAt: 0 });
  assert.deepEqual(knocks, [1, 2, 2], "hareket azaltmada itme yok");
});

/* ------------------------------------------------------------------ */
/* Olum                                                                  */
/* ------------------------------------------------------------------ */

const deathBurst = (overrides = {}) => ({
  x: 100, y: 100, size: 34, color: 0xdc2626, shards: 5, durationMs: 190, intensity: 1, still: false, bornAt: 0,
  texture: "enemy-grunt", heavy: false, air: false, ...overrides
});

/** Olumu birkac karede ciz; yuzeylerin cagri ve renkleri. */
function drawDeath(overrides = {}, { level = 0, times = [10, 60, 140, 300, 600, 900] } = {}) {
  const graphics = createRecorder();
  const ground = createRecorder();
  const counting = createCountingGraphics();
  const countingGround = createCountingGraphics();
  const vfx = new combat.CombatVfx(graphics, ground, lodAt(level));
  const counted = new combat.CombatVfx(counting, countingGround, lodAt(level));
  vfx.emitDeath(deathBurst(overrides));
  counted.emitDeath(deathBurst(overrides));
  const frames = [];
  for (const at of times) {
    graphics.calls.length = 0;
    ground.calls.length = 0;
    vfx.render(at, 1);
    counted.render(at, 1);
    frames.push({ at, calls: graphics.calls.filter(([name]) => name !== "clear"), ground: ground.calls.filter(([name]) => name !== "clear") });
  }
  return { frames, vertices: counting.stats.vertices + countingGround.stats.vertices, groundVertices: countingGround.stats.vertices };
}
const count = (calls, name) => calls.filter(([call]) => call === name).length;

test("ölümün malzemesi ırkın dokusundan: meka ve muhafız metal, böcek kitin, 4. boyut kristal, golem taş, düşmüş kül", () => {
  assert.equal(combat.getDeathMaterial("enemy-grunt"), "metal");
  assert.equal(combat.getDeathMaterial("enemy-brute"), "metal");
  assert.equal(combat.getDeathMaterial("enemy-holyGuardian-runner"), "metal");
  assert.equal(combat.getDeathMaterial("enemy-spaceBug-grunt"), "chitin");
  assert.equal(combat.getDeathMaterial("enemy-fourthDimensional-shooter"), "crystal");
  assert.equal(combat.getDeathMaterial("enemy-golem-brute"), "stone");
  assert.equal(combat.getDeathMaterial("enemy-fallen-grunt"), "ash");
  assert.equal(combat.getDeathMaterial(undefined), "metal");
});

test("ölüm malzemesine göre: metal kıvılcım, kül yükselen kor, kristal çatırtı, böcek kıvılcımsız leke; hepsi yerde iz", () => {
  const lineCount = (frames, from, to) => frames.filter(({ at }) => at >= from && at <= to).reduce((sum, frame) => sum + count(frame.calls, "lineBetween"), 0);
  const metal = drawDeath({ texture: "enemy-grunt" });
  const chitin = drawDeath({ texture: "enemy-spaceBug-grunt", color: 0xadf765 });
  const crystal = drawDeath({ texture: "enemy-fourthDimensional-grunt", color: 0x8b5cf6 });
  const ash = drawDeath({ texture: "enemy-fallen-grunt" });
  assert.ok(lineCount(metal.frames, 10, 140) >= 5, "metal kivilcim saciyor");
  assert.equal(lineCount(chitin.frames, 10, 900), 0, "bocek kivilcim sacmiyor");
  assert.ok(lineCount(crystal.frames, 10, 60) > 0 && lineCount(crystal.frames, 300, 900) === 0, "kristal kisa bir catirti");
  for (const [label, drawn] of [["metal", metal], ["kitin", chitin], ["kristal", crystal], ["kul", ash]]) {
    assert.ok(drawn.frames.some((frame) => count(frame.ground, "fillTriangle") > 0), `${label}: yer izi`);
    assert.ok(drawn.frames.some((frame) => count(frame.calls, "fillTriangle") > 0), `${label}: kirinti`);
  }
  // Kul: korlar yukseliyor (cizgilerin uclari zamanla yukari).
  const emberTop = (frame) => Math.min(...frame.calls.filter(([name]) => name === "lineBetween").map(([, , y1, , y2]) => Math.min(y1, y2)));
  const early = ash.frames.find(({ at }) => at === 60);
  const late = ash.frames.find(({ at }) => at === 300);
  assert.ok(emberTop(late) < emberTop(early), "korlar yukselmeli");
});

test("ölümün renkleri yere indirilmiş: düşmanın vurgusu (pembe, limon, mor) parçaları boyamıyor", () => {
  for (const [texture, color] of [["enemy-grunt", 0xec4899], ["enemy-spaceBug-runner", 0xadf765], ["enemy-fourthDimensional-grunt", 0xa855f7], ["enemy-golem-brute", 0x22c55e], ["enemy-fallen-grunt", 0xdc2626], ["enemy-holyGuardian-grunt", 0xfacc15]]) {
    const drawn = drawDeath({ texture, color });
    for (const frame of drawn.frames) {
      for (const used of colorsOf({ calls: frame.calls }, { calls: frame.ground })) {
        assert.notEqual(used, color, `${texture}: ham vurgu rengi ${color.toString(16)}`);
        assert.ok(grounded(used), `${texture}: sekerleme renk ${used.toString(16).padStart(6, "0")}`);
      }
    }
  }
});

test("ağır düşman daha çok ve daha iri parça; uçan düşmanda yer izi yok; hareket azaltmada parça ve kıvılcım yok", () => {
  const debris = (drawn) => Math.max(...drawn.frames.map((frame) => count(frame.calls, "fillTriangle")));
  const normal = drawDeath({ texture: "enemy-grunt" });
  const heavy = drawDeath({ texture: "enemy-brute", shards: 8, durationMs: 220, heavy: true, size: 43 });
  assert.ok(debris(heavy) > debris(normal), `agir ${debris(heavy)} / siradan ${debris(normal)}`);
  assert.ok(heavy.groundVertices >= normal.groundVertices, "agir dusmanin izi daha buyuk");
  const air = drawDeath({ texture: "enemy-grunt", air: true });
  assert.equal(air.frames.reduce((sum, frame) => sum + frame.ground.length, 0), 0, "ucan dusmanin altinda zemin yok");
  const still = drawDeath({ texture: "enemy-grunt", still: true });
  for (const frame of still.frames) assert.equal(count(frame.calls, "lineBetween"), 0, `hareket azaltma: ${frame.at} ms'de kivilcim`);
  // Govdenin cokusu ve sonusu yine gorunuyor.
  assert.ok(still.frames[0].calls.some(([name]) => name === "fillTriangle"), "hareket azaltmada da govde soner");
});

test("ölüm LOD'u: önce kıvılcım, sonra duman, sonra yer izi; silüet (çöküş ve kırıntı) kalıyor", () => {
  const costs = [0, 1, 2, 3].map((level) => drawDeath({ texture: "enemy-grunt" }, { level }).vertices);
  assert.ok(costs[0] > costs[1] && costs[1] > costs[2] && costs[2] > costs[3], `LOD ${costs.join(" / ")}`);
  const shed = drawDeath({ texture: "enemy-grunt" }, { level: 3 });
  // Yer izi (yanik rengi) LOD 3'te yok; yere inen kirinti zeminde kalabilir.
  assert.ok(!shed.frames.some((frame) => frame.ground.some(([name, color]) => name === "fillStyle" && color === kit.SCORCH)), "LOD 3 yer izini dokuyor");
  assert.ok(shed.frames.some((frame) => count(frame.calls, "fillTriangle") > 0), "kirinti ve cokus kaliyor");
});

test("ölüm bütçesi: saniyede 6 öldürmede birkaç yüz köşe; 40 ölümlük ulti anı eskisinden ucuz", async () => {
  const { runDeathBench } = await import("../tools/vfx-bench.mjs");
  const steady = await runDeathBench({ lodLevel: 0 });
  const ulti = await runDeathBench({ lodLevel: 0, burst: 40 });
  assert.ok(steady.verticesPerFrame < 600, `olum kosesi ${steady.verticesPerFrame}`);
  // Eski renkli kiymik patlamasi ayni ulti aninda 6.45k kose ciziyordu.
  assert.ok(ulti.peakVertices < 6450, `ulti tepe ${ulti.peakVertices}`);
  assert.ok(ulti.liveDeaths <= 40);
});

/* ------------------------------------------------------------------ */
/* Isinlar, hasar sayilari ve sampiyon                                  */
/* ------------------------------------------------------------------ */

const { BeamRenderer } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");
const damage = await importWebModule("apps/web/src/vfx/damage-numbers.ts");
const MELIS_BEAMS = [
  { definitionId: "archer-2-rage", color: 0xdb2777, width: 70, point: true },
  { definitionId: "archer-3-curse", color: 0x7f1dff, width: 40 },
  { definitionId: "archer-3-curse-burst", color: 0x7f1dff, width: 60 },
  { definitionId: "archer-3-curse-pool", color: 0x7f1dff, width: 60 },
  { definitionId: "archer-4-underworld-link", color: 0x14b8a6, width: 4 },
  { definitionId: "archer-4-underworld-execute", color: 0x14b8a6, width: 30 },
  { definitionId: "archer-5-mirror", color: 0xe879f9, width: 50 },
  { definitionId: "archer-6-whisper", color: 0x14b8a6, width: 40 },
  { definitionId: "archer-6-whisper-turn", color: 0xa855f7, width: 6 },
  { definitionId: "archer-6-whisper-suicide", color: 0xef4444, width: 50 }
];
const beamOf = (entry, tier, extra = {}) => ({ id: `${entry.definitionId}-b1`, definitionId: entry.definitionId, tier: tier === 1 ? undefined : tier, x1: 40, y1: 40, x2: entry.point ? 40 : 140, y2: entry.point ? 40 : 90, width: entry.width, color: entry.color, ttlMs: 160, ...extra });

test("Melis ışınları ve Zeynep sütunu yere indirilmiş: pastel, altın ve döner yıldız yok", () => {
  for (const entry of [...MELIS_BEAMS, { definitionId: "zeynep-ultimate-column", color: 0xfde68a, width: 40 }, { definitionId: "onur-sympathy", color: 0x2dd4bf, width: 3 }, { definitionId: "zeynep-2", color: 0xfb7185, width: 18 }, { definitionId: "zeynep-3-kin-showcase", color: 0xef4444, width: 115 }, { definitionId: "zeynep-6", color: 0x7f1d1d, width: 60 }, { definitionId: "zeynep-3-burn-trail", color: 0x0e7490, width: 32 }, { definitionId: "warrior-6", color: 0xadf765, width: 5 }]) {
    for (const tier of [1, 2, 3]) {
      const recorder = createRecorder();
      const glow = createRecorder();
      new BeamRenderer(recorder, glow, lodAt(0)).render([beamOf(entry, tier)], { now: 300, sceneNow: 300, scale: 1 });
      for (const color of colorsOf(recorder, glow)) {
        assert.ok(grounded(color), `${entry.definitionId} kademe ${tier}: sekerleme renk ${color.toString(16).padStart(6, "0")}`);
        assert.ok(!OLD_RANK_COLORS.includes(color), `${entry.definitionId}: altin`);
      }
    }
  }
  // Melis'in catlaklari donmuyor: ayni omurde zaman ilerleyince cizgiler yerinde.
  for (const entry of MELIS_BEAMS.filter((candidate) => !candidate.definitionId.startsWith("archer-4"))) {
    const geometry = (now) => {
      const recorder = createRecorder();
      new BeamRenderer(recorder, undefined, lodAt(0)).render([beamOf(entry, 2)], { now, sceneNow: now, scale: 1 });
      return JSON.stringify(recorder.calls.filter(([name]) => name === "lineBetween"));
    };
    assert.equal(geometry(100), geometry(700), `${entry.definitionId}: donen yildiz`);
  }
  // Zeynep sutunu: sert kenarlar ve beyaz-sicak cekirdek; dokulen cizgi kivilcimi yok.
  const column = createRecorder();
  new BeamRenderer(column, undefined, lodAt(0)).render([{ id: "col", definitionId: "zeynep-ultimate-column", tier: 3, x1: 100, y1: 0, x2: 100, y2: 400, width: 40, color: 0xfde68a, ttlMs: 400 }], { now: 50, sceneNow: 50, scale: 1 });
  assert.equal(column.calls.filter(([name]) => name === "lineBetween").length, 2, "yalnizca iki sert kenar");
  assert.ok(colorsOf(column).some((color) => hsl(color).l >= 0.9), "beyaz-sicak cekirdek");
  // Bilinmeyen isinin rengi notr (pembe degil).
  const unknown = createRecorder();
  new BeamRenderer(unknown).render([{ id: "x", definitionId: "mystery", x1: 0, y1: 0, x2: 50, y2: 0, width: 3, ttlMs: 100 }], { now: 0, sceneNow: 0, scale: 1 });
  assert.ok(!colorsOf(unknown).includes(0xfb7185), "pembe yedek renk yok");
});

test("hasar sayıları sert: beyaz/gri, koyu kontur; kritik altın değil, pop 1.2 katı ve esnemesiz, kayma tohumlu", async () => {
  const { readFile } = await import("node:fs/promises");
  const palette = damage.DAMAGE_NUMBER_PALETTE;
  for (const [key, { fill, stroke }] of Object.entries(palette)) {
    for (const old of ["#ff9f1a", "#ffd23f", "#fbbf24", "#e3ad72", "#dccb86"]) assert.notEqual(fill.toLowerCase(), old, `${key}: eski turuncu/altin`);
    assert.ok(grounded(hexToColor(fill)), `${key} dolgu sekerleme: ${fill}`);
    assert.ok(hsl(hexToColor(stroke)).l <= 0.25, `${key} kontur koyu degil: ${stroke}`);
  }
  // Kritik okunur kaliyor: dolgu acik, kontur koyu ve kendi vurusundan farkli.
  assert.notEqual(palette.ownCrit.stroke, palette.ownHit.stroke);
  assert.ok(hsl(hexToColor(palette.ownCrit.fill)).l >= 0.9);
  const source = (await readFile(new URL("../apps/web/src/vfx/damage-numbers.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(source, /const CRIT_POP_FROM = 1\.2;/, "kritik pop 1.2 kati");
  assert.ok(!source.includes("Math.random"), "kayma tohumlu (Math.random yok)");
  assert.match(source, /const settle = age \/ CRIT_POP_MS;/, "pop dogrusal iniyor (esneyen egri yok)");
});

test("şampiyon işareti sabit ve yere indirilmiş: altın taç ve sallanma yok, kalın koyu kızıl kontur", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const constant = (name) => new RegExp(`const ${name} = "?(#?[0-9a-fx]+|\\[Ş\\])"?;`, "i").exec(source)?.[1];
  const fill = constant("CHAMPION_FILL");
  const stroke = constant("CHAMPION_STROKE");
  const frame = constant("CHAMPION_BAR_FRAME");
  assert.ok(fill && stroke && frame);
  assert.ok(grounded(hexToColor(fill)), `sampiyon yazisi ${fill}`);
  assert.ok(grounded(Number(frame)), `sampiyon cercevesi ${frame}`);
  assert.ok(hsl(hexToColor(stroke)).l <= 0.25, "kontur koyu");
  for (const old of ["#fbbf24", "0xfbbf24"]) assert.ok(!source.includes(`CHAMPION_FILL = "${old}"`) && !source.includes(`CHAMPION_BAR_FRAME = ${old}`), "altin yok");
  assert.ok(!source.includes('"♛"'), "tac glifi yok");
  assert.match(source, /const CHAMPION_MARK = "\[Ş\]";/, "sabit isaret tanınır: [Ş]");
  assert.ok(!/mover\.crown\.setPosition\([^)]*bob/.test(source), "isaret sallanmiyor");
});

test("kule vuruş nabzı kısa ve esnemesiz; buz kabuğu dönmüyor", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const start = source.indexOf("  private punchTower(");
  const punch = source.slice(start, source.indexOf("\n  }\n", start));
  assert.ok(!punch.includes("Back.easeOut"), "esneyen egri yok");
  const peaks = [...punch.matchAll(/value: strong \? ([\d.]+) : ([\d.]+)/g)].flatMap((match) => [Number(match[1]), Number(match[2])]);
  assert.ok(peaks.length === 2 && peaks.every((value) => value <= 1.06), `nabiz ${peaks.join(" / ")}`);
  const frostStart = source.indexOf("  private drawEnemyFrostEffect(");
  const frost = source.slice(frostStart, source.indexOf("\n  }\n", frostStart));
  assert.ok(!/performance\.now\(\)|now \/ \d+/.test(frost), "buz kabugu zamanla donmuyor");
  for (const pastel of ["0x67e8f9", "0xa5f3fc", "0xbae6fd", "0x7dd3fc", "0xe0f2fe"]) assert.ok(!frost.includes(pastel), `pastel camgobegi ${pastel}`);
});
