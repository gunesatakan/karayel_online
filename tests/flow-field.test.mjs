/**
 * Akis alani.
 *
 * Yol bulma once her dusman icin ayri BFS kosuyordu; maliyet dogrudan dusman
 * sayisiyla buyuyordu. Alan hedeften geriye bir kez cozulur ve dusman yalnizca
 * bulundugu hucreye bakar.
 *
 * Buradaki testler modulun iki sozunu tutar: ayni girdi ayni cikti verir
 * (esitlik durumlarinda bile), ve uniform maliyette sonuc eski BFS ile ayni
 * uzunlukta yol uretir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeFlowField,
  getFlowCost,
  getFlowNext
} from "../packages/shared/dist/index.js";

const COLS = 11;
const ROWS = 18;
/** Nexus satiri: dusmanlarin ulasmaya calistigi en alt sira. */
const GOALS = Array.from({ length: COLS }, (_, col) => ({ col, row: ROWS - 1 }));

/** `#` gecilmez, `.` bos. Satirlar yukaridan asagiya. */
function fieldFromMap(rows) {
  const blocked = new Set();
  rows.forEach((line, row) => {
    [...line].forEach((char, col) => {
      if (char === "#") blocked.add(`${col}:${row}`);
    });
  });
  return computeFlowField({
    cols: rows[0].length,
    rows: rows.length,
    goals: Array.from({ length: rows[0].length }, (_, col) => ({ col, row: rows.length - 1 })),
    getCost: (col, row) => (blocked.has(`${col}:${row}`) ? Number.POSITIVE_INFINITY : 1)
  });
}

/** Akisi takip ederek hedefe kadar yuruyup adim sayisini dondurur. */
function walk(field, start) {
  let current = start;
  const seen = new Set();
  let steps = 0;
  while (steps < 500) {
    const key = `${current.col}:${current.row}`;
    assert.equal(seen.has(key), false, `akis dongude: ${key}`);
    seen.add(key);
    if (current.row === field.rows - 1) return steps;
    const next = getFlowNext(field, current.col, current.row);
    if (!next) return undefined;
    current = next;
    steps += 1;
  }
  return undefined;
}

test("engelsiz haritada her hücreden nexusa ulaşılır", () => {
  const field = computeFlowField({
    cols: COLS,
    rows: ROWS,
    goals: GOALS,
    getCost: () => 1
  });

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      assert.ok(Number.isFinite(getFlowCost(field, col, row)), `${col}:${row} ulasilamiyor`);
      assert.notEqual(walk(field, { col, row }), undefined, `${col}:${row} akisi hedefe varmiyor`);
    }
  }
});

test("engelsiz haritada maliyet nexusa olan satır mesafesidir", () => {
  const field = computeFlowField({ cols: COLS, rows: ROWS, goals: GOALS, getCost: () => 1 });
  for (let row = 0; row < ROWS; row += 1) {
    assert.equal(getFlowCost(field, 0, row), ROWS - 1 - row, `satir ${row} maliyeti yanlis`);
  }
});

test("engelin etrafından dolaşır ve adım sayısı en kısa yolu verir", () => {
  //  Ortadaki duvar tek bir gedik birakiyor.
  const field = fieldFromMap([
    ".....",
    ".....",
    "##.##",
    ".....",
    "....."
  ]);
  // Sol ustten baslayan dusman gedige gidip asagi inmeli: 2 asagi + 2 saga + 2 asagi.
  assert.equal(walk(field, { col: 0, row: 0 }), 6);
  assert.equal(getFlowCost(field, 0, 0), 6);
});

test("ulaşılamayan hücre sonsuz maliyet taşır ve akışı yoktur", () => {
  const field = fieldFromMap([
    ".....",
    "#####",
    ".....",
    ".....",
    "....."
  ]);
  assert.equal(getFlowCost(field, 2, 0), Number.POSITIVE_INFINITY);
  assert.equal(getFlowNext(field, 2, 0), undefined);
  // Duvarin altindaki taraf hala saglam calisir.
  assert.equal(getFlowCost(field, 2, 2), 2);
});

test("geçilmez hücrenin kendisi de ulaşılamaz sayılır", () => {
  const field = fieldFromMap([
    ".....",
    "..#..",
    ".....",
    ".....",
    "....."
  ]);
  assert.equal(getFlowCost(field, 2, 1), Number.POSITIVE_INFINITY);
});

test("aynı girdi aynı çıktıyı verir", () => {
  const build = () => fieldFromMap([
    ".....",
    ".#.#.",
    ".....",
    "#...#",
    "....."
  ]);
  const first = build();
  const second = build();
  assert.deepEqual(Array.from(first.cost), Array.from(second.cost));
  assert.deepEqual(Array.from(first.next), Array.from(second.next));
});

test("eşit maliyetli komşularda akış nexusa doğru olanı seçer", () => {
  // Simetrik izgarada her hucrenin iki esit secenegi var. Kural acik: komsular
  // once asagi (nexusa dogru), sonra sol, sag, yukari taranir. Bu yuzden esitlik
  // her zaman hedefe dogru bozulur -- dusman yana kaykilmaz.
  const field = computeFlowField({ cols: 3, rows: 3, goals: [{ col: 1, row: 2 }], getCost: () => 1 });
  assert.deepEqual(getFlowNext(field, 1, 1), { col: 1, row: 2 }, "hedefin ustundeki hucre asagi gitmeli");
  assert.deepEqual(getFlowNext(field, 0, 1), { col: 0, row: 2 }, "esitlikte yana degil asagi gitmeli");
  assert.deepEqual(getFlowNext(field, 0, 0), { col: 0, row: 1 }, "esitlikte yana degil asagi gitmeli");
});

/**
 * Duvar sisteminin temeli: duvar gecilmez degil, pahali.
 *
 * Bir duvarin bedeli oraya **girerken** odenir. Uzerinde duran bir dusman kendi
 * duvarinin bedelini tasimaz, cunku o bedeli girerken zaten odemistir.
 */
test("pahalı hücrenin bedeli girerken ödenir, üstünde dururken değil", () => {
  const withWall = (wallCost) => computeFlowField({
    cols: 3,
    rows: 3,
    goals: [{ col: 0, row: 2 }, { col: 1, row: 2 }, { col: 2, row: 2 }],
    getCost: (col, row) => (col === 1 && row === 1 ? wallCost : 1)
  });

  const field = withWall(50);
  // Duvarin uzerinden hedefe tek adim kaldi, o adim da ucuz.
  assert.equal(getFlowCost(field, 1, 1), 1, "duvarin ustunde durmak bedelli sayilmis");
  // Ustteki hucre duvardan gecmek (50 + 1) yerine kenardan dolasir (1 + 2).
  assert.equal(getFlowCost(field, 1, 0), 3);
  assert.notDeepEqual(getFlowNext(field, 1, 0), { col: 1, row: 1 }, "pahali duvardan gecmis");
});

test("duvar yeterince ucuzsa akış dolaşmak yerine içinden geçer", () => {
  // Ayni harita, ince duvar: dolasmak 3, icinden gecmek 1 + 1 = 2.
  const field = computeFlowField({
    cols: 3,
    rows: 3,
    goals: [{ col: 0, row: 2 }, { col: 1, row: 2 }, { col: 2, row: 2 }],
    getCost: (col, row) => (col === 1 && row === 1 ? 1.2 : 1)
  });

  assert.deepEqual(getFlowNext(field, 1, 0), { col: 1, row: 1 }, "ucuz duvardan gecmedi");
  assert.equal(Math.round(getFlowCost(field, 1, 0) * 10) / 10, 2.2);
});
