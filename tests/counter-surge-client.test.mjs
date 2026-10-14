/**
 * Karsi atak cesitlerinin istemci tarafi: telden seridin cercevesi (her cesit
 * ve yon), cesit basina cizim (renk, siluet, kirpma), LOD ve hareket
 * azaltma, Metal Kalkan kesigi yandan, siperin carpma isaretleri, bildirimler
 * ve sesler. Cizim kayitci Graphics'le okunuyor (piksel degil cagri dizisi).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COUNTER_SURGE_KINDS,
  getCounterSurgeGeometry,
  getSurgeBandSpan
} from "../packages/shared/dist/index.js";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const surgeVfx = await importWebModule("apps/web/src/vfx/counter-surge.ts");
const samples = await importWebModule("apps/web/src/sfx-samples.ts");
const sceneLocales = await importWebModule("apps/web/src/locales/areas/scene.ts");
const menuLocales = await importWebModule("apps/web/src/locales/areas/menu.ts");

const ORIGIN = { x: 100, y: 40 };
const GRID = 32;
const COLS = 12;
const ROWS = 18;
const W = COLS * GRID;
const H = ROWS * GRID;
const KIND_CODE = { band: undefined, lance: 1, wall: 2, sweep: 3, slash: 4, aegis: 5 };

const channels = (color) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map((value) => value / 255);
function hsl(color) {
  const [r, g, b] = channels(color);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}
// tests/vfx-hard-language.test.mjs ile ayni olcu: pastel bant yok.
const grounded = (color) => {
  const { s, l } = hsl(color);
  if (l <= 0.22 || l >= 0.9) return true;
  if (l > 0.7) return s <= 0.35;
  return s <= 0.625;
};

function band(kind, extra = {}) {
  return surgeVfx.getCounterSurgeBand({ id: 7, col: 0, w: 3, p: 0.5, k: KIND_CODE[kind], ...extra }, ORIGIN, GRID, COLS, ROWS);
}

function draw(target, options = {}) {
  const fill = createRecorder();
  const edge = createRecorder();
  surgeVfx.drawCounterSurge(fill, edge, target, GRID, { now: 1234, reducedMotion: false, lod: 0, ...options });
  return { fill, edge };
}

/** Kayittaki cizgiler: [x1, y1, x2, y2, genislik, renk, saydamlik]. */
function lines(recorder) {
  const out = [];
  let style = [1, 0, 1];
  for (const [name, ...args] of recorder.calls) {
    if (name === "lineStyle") style = args;
    if (name === "lineBetween") out.push([...args, ...style]);
  }
  return out;
}

const fillsOf = (recorder) => recorder.calls.filter(([name]) => name === "fillStyle").map(([, color, alpha]) => ({ color, alpha }));

// --- Cerceve ------------------------------------------------------------------------

test("çerçeve her çeşit ve yönde paylaşılan geometriyle bire bir; genişlik ekseni kesik ekseniyle aynı", () => {
  const cases = [
    ["band", { col: 4, w: 3 }, "down"],
    ["lance", { col: 5, w: 1 }, "down"],
    ["wall", { col: 3, w: 6 }, "down"],
    ["sweep", { col: 6, w: 3, d: 1 }, "right"],
    ["sweep", { col: 6, w: 3, d: 2 }, "left"],
    ["slash", { col: 0, w: 3, d: 3 }, "downRight"],
    ["slash", { col: 0, w: 3, d: 4 }, "downLeft"],
    ["aegis", { col: 3, w: 6 }, "down"]
  ];
  for (const [kind, wire, travel] of cases) {
    const frame = band(kind, wire);
    assert.equal(frame.kind, kind);
    assert.equal(frame.travel, travel, `${kind}: yon`);
    const geometry = getCounterSurgeGeometry(travel, wire.col, wire.w, ORIGIN, GRID, COLS, ROWS);
    assert.equal(frame.length, geometry.length);
    assert.equal(frame.width, geometry.width);
    assert.equal(frame.front, 0.5 * geometry.length);
    assert.equal(frame.diagonal, travel === "downRight" || travel === "downLeft");
    // (a, s) noktasi paylasilan eksenlerde: genislik a, yol s.
    const span = getSurgeBandSpan(geometry);
    for (const [a, s] of [[0, 0], [geometry.width, 0], [geometry.width / 3, geometry.length / 2]]) {
      const point = surgeVfx.getSurgeBandPoint(frame, a, s);
      const across = point.x * geometry.dirY - point.y * geometry.dirX;
      const along = (point.x - geometry.originX) * geometry.dirX + (point.y - geometry.originY) * geometry.dirY;
      assert.ok(Math.abs(across - span.from - a) < 1e-6, `${kind}/${travel}: genislik ekseni kaymis`);
      assert.ok(Math.abs(along - s) < 1e-6, `${kind}/${travel}: yol ekseni kaymis`);
    }
  }
  // Yandan gelen seridin yeri: satirlar, harita boyunca; sola giden sag kenardan basliyor.
  const right = band("sweep", { col: 6, w: 3, d: 1 });
  assert.deepEqual([right.dirX, right.dirY], [1, 0]);
  assert.ok(Math.abs(surgeVfx.getSurgeBandPoint(right, 0, 0).x - ORIGIN.x) < 1e-9);
  const left = band("sweep", { col: 6, w: 3, d: 2 });
  assert.ok(Math.abs(surgeVfx.getSurgeBandPoint(left, 0, 0).x - (ORIGIN.x + W)) < 1e-9);
  // Capraz: sol ust koseden sag alt koseye.
  const slash = band("slash", { d: 3 });
  const end = surgeVfx.getSurgeBandPoint(slash, slash.width / 2, slash.length);
  assert.ok(Math.abs(end.x - (ORIGIN.x + W)) < 1e-6 && Math.abs(end.y - (ORIGIN.y + H)) < 1e-6);
});

test("çerçeve bozuk ya da çelişen telde güvenli: bilinmeyen çeşit band, yönsüz süpürme sağa, ustten çeşide yan yön yok", () => {
  assert.equal(band("band", { k: 42 }).kind, "band");
  assert.equal(band("sweep", { d: undefined }).travel, "right");
  assert.equal(band("band", { d: 1 }).travel, "down");
  assert.equal(band("slash", { d: 1 }).travel, "downRight");
  const wide = band("wall", { col: 40, w: 99 });
  assert.ok(wide.baseX + wide.width <= ORIGIN.x + W + 1e-9, "serit haritadan tasti");
  const out = surgeVfx.createCounterSurgeBand();
  assert.equal(surgeVfx.getCounterSurgeBand({ id: 1, col: 0, w: 3, p: 0, k: 3, d: 2 }, ORIGIN, GRID, COLS, ROWS, out), out);
});

// --- Cizim -----------------------------------------------------------------------------

test("her çeşit kendi renginde ve yere indirilmiş tonlarda; dolgu yarı saydam; Graphics temizlenmiyor", () => {
  for (const kind of COUNTER_SURGE_KINDS) {
    const style = surgeVfx.COUNTER_SURGE_STYLES[kind];
    for (const color of [style.body, style.deep, style.edge, style.rim]) assert.ok(grounded(color), `${kind}: sekerleme renk ${color.toString(16)}`);
    for (const extra of [{ warn: true }, {}]) {
      const { fill, edge } = draw(band(kind, extra));
      const colors = [...fillsOf(fill), ...fillsOf(edge)].map((entry) => entry.color).concat(lines(fill).map((line) => line[5]), lines(edge).map((line) => line[5]));
      for (const color of colors) assert.ok(Object.values(style).includes(color), `${kind}: baska cesidin rengi ${color.toString(16)}`);
      assert.ok(colors.includes(kind === "aegis" && extra.warn ? style.rim : style.body) || colors.includes(style.body), `${kind}: govde rengi yok`);
      const fillAlpha = Math.max(...fillsOf(fill).map((entry) => entry.alpha));
      assert.ok(fillAlpha <= 0.35, `${kind}: yer dolgusu opak (${fillAlpha})`);
      const names = new Set([...fill.calls, ...edge.calls].map(([name]) => name));
      assert.ok(!names.has("clear"), `${kind}: cizim Graphics'i temizledi`);
      assert.ok(!names.has("fillCircle") && !names.has("strokeCircle"), `${kind}: parilti dairesi`);
    }
  }
  // Renkler cesitler arasinda ayirt edilebiliyor: govde tonlari hep farkli.
  const bodies = COUNTER_SURGE_KINDS.map((kind) => surgeVfx.COUNTER_SURGE_STYLES[kind].body);
  assert.equal(new Set(bodies).size, bodies.length);
  for (const name of Object.keys(surgeVfx)) assert.ok(!/sparkle|glitter|mote|star|confetti|bloom/i.test(name), `sus yordami: ${name}`);
});

test("ortak anatomi: sert ön kenar, yan sınırlar ön çizginin önünde kesik, iz geride; hepsi seridin yönünde", () => {
  for (const kind of ["band", "lance", "wall", "slash"]) {
    const frame = band(kind, kind === "slash" ? { d: 3 } : { col: 4, w: kind === "lance" ? 1 : kind === "wall" ? 6 : 3 });
    const { edge } = draw(frame);
    const style = surgeVfx.COUNTER_SURGE_STYLES[kind];
    const front = lines(edge).filter((line) => line[5] === style.edge && line[6] >= 0.9);
    assert.ok(front.length > 0, `${kind}: beyaz-sicak on kenar yok`);
    // On kenar yola dik: cizginin yonu genislik ekseninde.
    const along = (x, y) => (x - frame.baseX) * frame.dirX + (y - frame.baseY) * frame.dirY;
    assert.ok(front.some(([x1, y1, x2, y2]) => Math.abs(along(x1, y1) - frame.front) < 1e-6 && Math.abs(along(x2, y2) - frame.front) < 1e-6), `${kind}: on kenar on cizgide degil`);
    const dashes = lines(edge).filter((line) => line[5] === style.rim && line[6] < 0.3 && along(line[0], line[1]) > frame.front);
    assert.ok(dashes.length >= 10, `${kind}: on cizginin onunde kesik yan sinir yok`);
  }
});

test("çeşit silueti: mızrak sivri uç ve çekirdek, perde ağır çizgiler, süpürme cetvel kertikleri, kesme eğik bıçak, siper levhalar", () => {
  const lance = draw(band("lance", { col: 5, w: 1 }));
  assert.ok(lance.edge.calls.some(([name]) => name === "fillTriangle"), "mizragin ucu yok");
  const lanceCore = lines(lance.edge).filter((line) => line[0] === line[2] && line[1] !== line[3] && line[5] === surgeVfx.COUNTER_SURGE_STYLES.lance.edge);
  assert.ok(lanceCore.some((line) => Math.abs(line[3] - line[1]) >= GRID * 3.5), "mizragin uzun parlak cekirdegi yok");

  const wallStyle = surgeVfx.COUNTER_SURGE_STYLES.wall;
  const wall = draw(band("wall", { col: 3, w: 6 }));
  const striations = lines(wall.edge).filter((line) => (line[5] === wallStyle.body || line[5] === wallStyle.rim) && line[0] === line[2] && line[1] !== line[3]);
  assert.ok(striations.length >= 12, `perdenin dikey cizgileri az: ${striations.length}`);
  assert.ok(striations.some((line) => line[4] >= 3), "perdenin agir cizgisi yok");

  const sweepStyle = surgeVfx.COUNTER_SURGE_STYLES.sweep;
  const sweep = band("sweep", { col: 6, w: 3, d: 1 });
  const ticks = lines(draw(sweep).edge).filter((line) => line[5] === sweepStyle.edge && line[1] === line[3] && Math.abs(line[2] - line[0]) <= GRID * 0.5);
  assert.ok(ticks.length >= 12, `supurmenin kertikleri az: ${ticks.length}`);

  const slashFrame = band("slash", { d: 3 });
  const slash = draw(slashFrame);
  const slashStyle = surgeVfx.COUNTER_SURGE_STYLES.slash;
  const bevel = lines(slash.edge).filter((line) => line[5] === slashStyle.rim && line[6] >= 0.7);
  assert.ok(bevel.length >= 1, "kesmenin egik arka kenari yok");
  const along = (x, y) => (x - slashFrame.baseX) * slashFrame.dirX + (y - slashFrame.baseY) * slashFrame.dirY;
  assert.ok(bevel.some(([x1, y1, x2, y2]) => Math.abs(along(x1, y1) - along(x2, y2)) > GRID * 0.5), "bicak egik degil");

  const aegisStyle = surgeVfx.COUNTER_SURGE_STYLES.aegis;
  const aegisFrame = band("aegis", { col: 3, w: 6 });
  const aegis = draw(aegisFrame);
  const plates = lines(aegis.edge).filter((line) => line[5] === aegisStyle.rim && line[0] === line[2] && Math.abs(line[3] - line[1]) < GRID * 0.5);
  assert.ok(plates.length >= 10, `siperin levhalari yok: ${plates.length}`);
  const body = fillsOf(aegis.edge).filter((entry) => entry.color === aegisStyle.body);
  assert.ok(body.some((entry) => entry.alpha >= 0.35 && entry.alpha <= 0.6), "siper koyu ve yari saydam degil");
  // Siper yakmiyor: on cizginin onunde ve arkasinda iz, tarama, sert cizgi yok; golge yalnizca arkada.
  const frontY = ORIGIN.y + aegisFrame.front;
  const groundRects = aegis.fill.calls.filter(([name]) => name === "fillRect");
  assert.ok(groundRects.length > 0 && groundRects.every(([, , y, , h]) => y + h <= frontY + 1e-6), "siperin golgesi on cizginin onune tasti");
  assert.ok(!lines(aegis.fill).length, "siperde yer tarama cizgisi var");
});

test("çapraz kesme harita dışına taşmıyor: bütün çokgenler ve çizgiler harita dikdörtgenine kırpılıyor", () => {
  for (const d of [3, 4]) {
    for (const p of [0, 0.02, 0.5, 0.98, 1]) {
      for (const warn of [false, true]) {
        const { fill, edge } = draw(band("slash", { d, p, ...(warn ? { warn: true } : {}) }));
        const inside = (x, y) => x >= ORIGIN.x - 1e-6 && x <= ORIGIN.x + W + 1e-6 && y >= ORIGIN.y - 1e-6 && y <= ORIGIN.y + H + 1e-6;
        for (const recorder of [fill, edge]) {
          assert.ok(!recorder.calls.some(([name]) => name === "fillRect"), "capraz seritte eksene hizali dikdortgen");
          for (const [name, ...args] of recorder.calls) {
            if (name === "fillTriangle") for (let i = 0; i < 6; i += 2) assert.ok(inside(args[i], args[i + 1]), `ucgen disarida (${d}, ${p})`);
            if (name === "lineBetween") assert.ok(inside(args[0], args[1]) && inside(args[2], args[3]), `cizgi disarida (${d}, ${p})`);
          }
        }
      }
    }
  }
});

test("uyarı: çeşidin giriş kenarında kendi renginde bar ve yol yönüne bakan sivri oklar; tehlike şeridi baştan sona", () => {
  for (const [kind, wire] of [["band", { col: 4 }], ["sweep", { col: 6, d: 2 }], ["slash", { d: 4 }], ["wall", { col: 3, w: 6 }], ["aegis", { col: 3, w: 6 }], ["lance", { col: 5, w: 1 }]]) {
    const frame = band(kind, { ...wire, warn: true });
    const style = surgeVfx.COUNTER_SURGE_STYLES[kind];
    const { fill, edge } = draw(frame);
    const along = (x, y) => (x - frame.baseX) * frame.dirX + (y - frame.baseY) * frame.dirY;
    const across = (x, y) => (x - frame.baseX) * frame.axX + (y - frame.baseY) * frame.axY;
    const accent = kind === "aegis" ? style.rim : style.body;
    // Sivri oklar: her ok ucu (orta nokta) yol yonunde iki kolundan ileride.
    const arms = lines(edge).filter((line) => line[5] === accent && line[6] > 0.5 && Math.abs(along(line[0], line[1]) - along(line[2], line[3])) > 1);
    assert.ok(arms.length >= 2, `${kind}: ok yok`);
    for (let i = 0; i + 1 < arms.length; i += 2) {
      const [ax1, ay1, tipX, tipY] = arms[i];
      assert.ok(along(tipX, tipY) > along(ax1, ay1), `${kind}: ok yol yonune bakmiyor`);
    }
    // Giris barinin cekirdegi seridin tum genisligi boyunca, giris kenarinda.
    const bar = lines(edge).find((line) => line[5] === style.edge && Math.abs(along(line[0], line[1]) - along(line[2], line[3])) < 1e-6);
    assert.ok(bar, `${kind}: giris bari yok`);
    assert.ok(along(bar[0], bar[1]) <= GRID * 2, `${kind}: bar giris kenarinda degil`);
    if (!frame.diagonal) assert.ok(Math.abs(Math.abs(across(bar[2], bar[3]) - across(bar[0], bar[1])) - frame.width) < 1e-6, `${kind}: bar genislik boyunca degil`);
    // Tehlike seridi: soluk dolgu yol boyunca sona kadar.
    const lane = fill.calls.filter(([name]) => name === "fillRect" || name === "fillTriangle");
    assert.ok(lane.length > 0, `${kind}: serit dolgusu yok`);
  }
});

test("LOD ve hareket azaltma: ağır LOD'da sert çizgi ve tarama düşüyor; hareket azaltmada çizim zamandan bağımsız", () => {
  for (const kind of ["band", "lance", "sweep", "slash"]) {
    const frame = band(kind, kind === "sweep" ? { col: 6, d: 1 } : kind === "slash" ? { d: 3 } : { col: 4, w: kind === "lance" ? 1 : 3 });
    const full = draw(frame, { lod: 0 });
    const light = draw(frame, { lod: 4 });
    const count = ({ fill, edge }) => fill.calls.length + edge.calls.length;
    assert.ok(count(light) < count(full), `${kind}: LOD 4 cizimi azaltmadi`);
    const a = draw(frame, { reducedMotion: true, now: 1000 });
    const b = draw(frame, { reducedMotion: true, now: 4321 });
    assert.deepEqual(a.edge.calls, b.edge.calls, `${kind}: hareket azaltmada kenar oynuyor`);
    assert.deepEqual(a.fill.calls, b.fill.calls, `${kind}: hareket azaltmada dolgu oynuyor`);
  }
});

test("Metal Kalkan kesiği yandan süpürmede: durmuş dilim kalkanda düz, ilerleyen dilim ön kenarda", () => {
  const frame = band("sweep", { col: 6, w: 3, d: 1, p: 0.6, cut: [0, 1.5, 0.4] });
  assert.equal(frame.segments.length, 2);
  assert.deepEqual(frame.segments.map((segment) => [segment.cut, segment.front]), [[true, 0.4 * W], [false, 0.6 * W]]);
  const style = surgeVfx.COUNTER_SURGE_STYLES.sweep;
  const { edge } = draw(frame);
  const hot = lines(edge).filter((line) => line[5] === style.edge && line[0] === line[2] && line[6] >= 0.9 && Math.abs(line[3] - line[1]) > GRID);
  assert.ok(hot.length > 0 && hot.every((line) => Math.abs(line[0] - (ORIGIN.x + 0.6 * W)) < 1e-6), "beyaz-sicak on kenar durmus dilimde");
  const stopped = lines(edge).filter((line) => line[5] === style.deep && line[0] === line[2] && Math.abs(line[0] - (ORIGIN.x + 0.4 * W)) < 1e-6);
  assert.ok(stopped.length > 0, "durmus dilimin duz on cizgisi kalkanda degil");
});

// --- Siper carpmalari -----------------------------------------------------------------

test("siperde duran atış: kısa sert işaret ön çizgide, ömrü dolunca yok; mesaj temizleniyor", () => {
  const frame = band("aegis", { id: 9, col: 3, w: 6, p: 0.4 });
  const impacts = new surgeVfx.AegisImpacts();
  impacts.add(9, 2.5, 1000);
  impacts.add(8, 1, 1000);
  const edge = createRecorder();
  impacts.draw(edge, frame, GRID, 1100, false);
  const drawn = lines(edge);
  assert.ok(drawn.length >= 5, "carpma isareti yok");
  const frontY = ORIGIN.y + frame.front;
  const x = frame.baseX + 2.5 * GRID;
  assert.ok(drawn.some(([x1, y1, x2, y2]) => y1 === frontY && y2 === frontY && x1 < x && x2 > x), "isaret on cizgide degil");
  assert.ok(drawn.every((line) => Math.abs(line[0] - x) < GRID && Math.abs(line[2] - x) < GRID), "baska siperin isareti cizildi");
  const late = createRecorder();
  impacts.draw(late, frame, GRID, 1000 + surgeVfx.AEGIS_IMPACT_MS + 1, false);
  assert.equal(late.calls.length, 0, "omru dolan isaret cizildi");
  assert.equal(impacts.has(9, 1100), true);
  assert.equal(impacts.has(9, 5000), false);
  // Tampon sabit: cok sayida isaret eskileri eziyor, buyumuyor.
  for (let index = 0; index < 100; index += 1) impacts.add(9, index % 6, 2000);
  const many = createRecorder();
  impacts.draw(many, frame, GRID, 2050, false);
  assert.ok(lines(many).length <= surgeVfx.AEGIS_IMPACT_SLOTS * 8);

  assert.deepEqual(surgeVfx.sanitizeSurgeBlockMessage({ id: 3, a: [1.2, "x", -1, Number.NaN, 2] }), { id: 3, a: [1.2, 2] });
  for (const raw of [undefined, null, 5, {}, { id: "3", a: [1] }, { id: 3, a: [] }, { id: 3, a: "1" }]) {
    assert.equal(surgeVfx.sanitizeSurgeBlockMessage(raw), undefined, JSON.stringify(raw));
  }
  assert.equal(surgeVfx.sanitizeSurgeBlockMessage({ id: 1, a: Array.from({ length: 50 }, () => 1) }).a.length, surgeVfx.SURGE_BLOCK_READ_MAX);
});

// --- Bildirim, ses, sahne -----------------------------------------------------------

test("bildirimler çeşit başına TR ve EN; sesler kayıtlı örneklerden, çeşide göre farklı perde", () => {
  const { trScene, enScene } = sceneLocales;
  for (const kind of COUNTER_SURGE_KINDS) {
    const key = surgeVfx.COUNTER_SURGE_NOTICE_KEYS[kind];
    assert.ok(trScene[key] && enScene[key], `${kind}: bildirim metni eksik`);
  }
  assert.equal(trScene["scene.special.surge.lance"], "Mızrak geliyor!");
  assert.equal(enScene["scene.special.surge.lance"], "Lance incoming!");
  assert.equal(trScene["scene.special.surge.sweep"], "Yandan süpürme!");
  assert.equal(enScene["scene.special.surge.slash"], "Diagonal slash!");
  assert.match(trScene["scene.special.surge.aegis"], /^Siper dalgası/);
  assert.match(enScene["scene.special.surge.aegis"], /^Aegis wave/);
  const { trMenu, enMenu } = menuLocales;
  for (const id of ["surge-lance", "surge-wall", "surge-sweep", "surge-slash", "surge-aegis"]) {
    for (const part of ["name", "title", "summary"]) {
      assert.ok(trMenu[`menu.enemy.${id}.${part}`] && enMenu[`menu.enemy.${id}.${part}`], `${id}.${part} kodeks metni eksik`);
    }
  }
  const cues = Object.values(surgeVfx.COUNTER_SURGE_SOUND_CUES);
  for (const cue of [...cues, surgeVfx.AEGIS_BLOCK_SOUND_CUE]) {
    assert.ok(samples.SAMPLE_FAMILIES[cue.family], `kayitli olmayan ornek: ${cue.family}`);
    assert.ok(cue.rate >= 0.5 && cue.rate <= 1.5 && cue.gain > 0 && cue.gain <= 1.5);
  }
  assert.equal(new Set(cues.map((cue) => `${cue.family}@${cue.rate}`)).size, cues.length, "iki cesit ayni ses");
});

test("sahne bağlantıları: iki şerit çiziliyor, surge:block dinleniyor, bildirim çeşitten, yapı flaşı çeşidin renginde", async () => {
  const source = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(source, /room\.onMessage\("surge:block"/);
  assert.match(source, /readCounterSurges\(surges, this\.surgeEntries\)/);
  assert.match(source, /t\(COUNTER_SURGE_NOTICE_KEYS\[band\.kind\]\)/);
  assert.match(source, /this\.aegisImpacts\.draw\(edge, band, cellSize, now/);
  assert.match(source, /this\.flashStructureHit\(tower\.x, tower\.y, size, reducedMotion, style\.body, style\.edge\)/);
  assert.match(source, /playSampleCue\(cue\.family, cue\.rate, cue\.gain/);
  const director = (await readFile(new URL("../apps/web/src/feedback-director.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(director, /\n  playSampleCue\(id: SampleFamilyId, rate: number, gain: number, key\?: string\) \{/);
});
