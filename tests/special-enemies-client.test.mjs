/**
 * Ozel dusmanlar ve karsi atak, istemci tarafi: `surge:hit` temizligi,
 * seridin geometrisi ve ara degeri, bildirim kapisi, isaret renklerinin
 * sert dili ve sahnenin baglantilari.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const special = await importWebModule("apps/web/src/vfx/special-threats.ts");
const damage = await importWebModule("apps/web/src/vfx/damage-numbers.ts");

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
const colorsOf = (...recorders) => recorders.flatMap((recorder) => recorder.calls
  .filter(([name]) => name === "lineStyle" || name === "fillStyle")
  .map(([name, a, b]) => (name === "lineStyle" ? b : a)));

test("surge:hit temizligi: bozuk kayit atlaniyor, tutar yuvarlaniyor, yapi basina bir vurus", () => {
  const clean = special.sanitizeSurgeHitMessage({
    id: 3,
    hits: [
      { towerId: "t1", amount: 35.4 },
      { towerId: "t1", amount: 12 },
      { towerId: "", amount: 10 },
      { towerId: "t2", amount: -4 },
      { towerId: "t3", amount: Number.NaN },
      { towerId: 7, amount: 10 },
      null,
      { towerId: "t4", amount: 80 }
    ]
  });
  assert.deepEqual(clean, { id: 3, hits: [{ towerId: "t1", amount: 35 }, { towerId: "t4", amount: 80 }] });
  for (const raw of [undefined, null, "x", 5, {}, { id: 1 }, { id: "1", hits: [] }, { id: 1, hits: "t1" }, { id: 1, hits: [{ towerId: "t1", amount: 0 }] }]) {
    assert.equal(special.sanitizeSurgeHitMessage(raw), undefined, JSON.stringify(raw));
  }
  const many = special.sanitizeSurgeHitMessage({ id: 1, hits: Array.from({ length: 500 }, (_, index) => ({ towerId: `t${index}`, amount: 5 })) });
  assert.equal(many.hits.length, special.SURGE_HIT_MAX_ENTRIES);
});

test("serit okunuyor: ilk gecerli kayit, yoksa gorsel kalkiyor", () => {
  assert.equal(special.readCounterSurge(undefined), undefined);
  assert.equal(special.readCounterSurge([]), undefined);
  assert.equal(special.readCounterSurge([{ id: 1, col: 2, w: 0, p: 0 }]), undefined);
  assert.equal(special.readCounterSurge([{ id: 1, col: "2", w: 3, p: 0 }]), undefined);
  const surge = { id: 2, col: 4, w: 3, p: 0.5 };
  assert.equal(special.readCounterSurge([null, surge]), surge);
});

test("serit geometrisi: sutunlardan x, ilerlemeden on kenar; uyari ust kenarda; haritaya sigiyor", () => {
  const origin = { x: 100, y: 40 };
  const band = special.getCounterSurgeBand({ col: 2, w: 3, p: 0.5 }, origin, 32, 12, 20);
  assert.equal(band.left, 100 + 2 * 32);
  assert.equal(band.right, 100 + 5 * 32);
  assert.equal(band.top, 40);
  assert.equal(band.bottom, 40 + 20 * 32);
  assert.equal(band.frontY, 40 + 0.5 * 20 * 32);
  assert.equal(band.columns, 3);
  assert.equal(band.warn, false);

  const warn = special.getCounterSurgeBand({ col: 2, w: 3, p: 0.7, warn: true }, origin, 32, 12, 20);
  assert.equal(warn.frontY, warn.top, "uyari evresinde serit kalkmadi");
  assert.equal(warn.warn, true);

  const clamped = special.getCounterSurgeBand({ col: 11, w: 3, p: 4 }, origin, 32, 12, 20);
  assert.equal(clamped.right, 100 + 12 * 32, "sag kenari tasmiyor");
  assert.equal(clamped.frontY, clamped.bottom, "ilerleme 1'de duruyor");

  const out = { left: 0, right: 0, top: 0, bottom: 0, frontY: 0, columns: 0, warn: false };
  assert.equal(special.getCounterSurgeBand({ col: 0, w: 3, p: 0 }, origin, 32, 12, 20, out), out, "nesne yeniden kullaniliyor");
});

test("ara deger: ayni serit kalkmissa p dogrusal; uyari ve yeni serit oldugu gibi", () => {
  const next = [{ id: 1, col: 2, w: 3, p: 0.4 }];
  const mid = special.interpolateCounterSurges([{ id: 1, col: 2, w: 3, p: 0.2 }], next, 0.5);
  assert.ok(Math.abs(mid[0].p - 0.3) < 1e-9);
  assert.equal(next[0].p, 0.4, "kaynak kayit degismiyor");
  assert.equal(special.interpolateCounterSurges([{ id: 9, col: 2, w: 3, p: 0.2 }], next, 0.5), next);
  assert.equal(special.interpolateCounterSurges([{ id: 1, col: 2, w: 3, p: 0, warn: true }], next, 0.5), next);
  assert.equal(special.interpolateCounterSurges(undefined, next, 0.5), next);
  assert.equal(special.interpolateCounterSurges(next, undefined, 0.5), undefined);
});

test("bildirim kapisi: tur basina macta bir kez, serit basina bir kez, yeni macta yeniden", () => {
  const notices = new special.SpecialThreatNotices();
  assert.equal(notices.noteKind("hunter"), true);
  assert.equal(notices.noteKind("hunter"), false);
  assert.equal(notices.noteKind("eater"), true);
  assert.equal(notices.noteSurge(4), true);
  assert.equal(notices.noteSurge(4), false);
  assert.equal(notices.noteSurge(5), true);
  notices.reset();
  assert.equal(notices.noteKind("hunter"), true);
  assert.equal(notices.noteSurge(4), true);
  assert.equal(special.isSpecialEnemyKind("heater"), true);
  assert.equal(special.isSpecialEnemyKind("grunt"), false);
});

test("isaretler ve serit sert dilde: her renk yere indirilmis, parilti yok", () => {
  for (const color of [special.HUNTER_MARK_COLOR, special.HEATER_MARK_COLOR, special.EATER_MARK_COLOR, special.EATER_CORE_COLOR, special.SURGE_COLOR, special.SURGE_EDGE_COLOR]) {
    assert.ok(grounded(color), `sekerleme renk ${color.toString(16)}`);
  }
  const options = { now: 1234, reducedMotion: false };
  const marks = createRecorder();
  for (const kind of ["hunter", "heater", "eater"]) special.drawSpecialEnemyMarker(marks, kind, 100, 100, 30, 48, options);
  special.drawEaterDrain(marks, 100, 100, 160, 140, 32, options);
  const fill = createRecorder();
  const edge = createRecorder();
  const origin = { x: 0, y: 0 };
  special.drawCounterSurge(fill, edge, special.getCounterSurgeBand({ col: 1, w: 3, p: 0, warn: true }, origin, 32, 10, 18), 32, options);
  special.drawCounterSurge(fill, edge, special.getCounterSurgeBand({ col: 1, w: 3, p: 0.4 }, origin, 32, 10, 18), 32, options);
  for (const color of colorsOf(marks, fill, edge)) assert.ok(grounded(color), `cizimde sekerleme renk ${color.toString(16)}`);
  // Dolgu yari saydam: tahta okunur kaliyor.
  const fillAlphas = fill.calls.filter(([name]) => name === "fillStyle").map(([, , alpha]) => alpha);
  assert.ok(fillAlphas.length > 0 && fillAlphas.every((alpha) => alpha <= 0.2), `serit dolgusu opak: ${fillAlphas.join(", ")}`);
  // Isaret cizimi Graphics'i temizlemiyor ve parilti yordamlari yok.
  const names = new Set([...marks.calls, ...fill.calls, ...edge.calls].map(([name]) => name));
  assert.ok(!names.has("clear"));
  for (const name of Object.keys(special)) assert.ok(!/sparkle|glitter|mote|star/i.test(name), `sus yordami: ${name}`);
});

test("yapi hasari sayisi: eksi isaretli, kendi yere indirilmis rengi, koyu kontur", () => {
  assert.equal(damage.formatStructureDamage(35.4), "-35");
  const { fill, stroke } = damage.DAMAGE_NUMBER_PALETTE.structure;
  assert.ok(grounded(Number.parseInt(fill.slice(1), 16)));
  assert.ok(hsl(Number.parseInt(stroke.slice(1), 16)).l <= 0.25);
});

test("sahne baglantilari: surge:hit dinleniyor, isaret dusmanla yikiliyor, serit karede ve ara degerde", async () => {
  const source = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(source, /room\.onMessage\("surge:hit"/);
  assert.match(source, /mover\.specialEffect\?\.destroy\(\);/);
  assert.match(source, /this\.renderCounterSurge\(frame\.snapshot\.surges, now\);/);
  assert.match(source, /surges: interpolateCounterSurges\(previous\.surges, next\.surges, alpha\)/);
  assert.match(source, /this\.specialNotices\.reset\(\);/);
});
