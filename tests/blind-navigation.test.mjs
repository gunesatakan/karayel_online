/**
 * Kor gezinme.
 *
 * Dusmanlar artik haritanin tamamini bilmiyor: cikisa dogru korlemesine
 * yuruyup onlerine cikani duvar tutarak dolasiyorlar. Bu yaklasimin bilinen
 * tuzagi sonsuz salinim, o yuzden testlerin asil isi **sonlanmayi** kanitlamak:
 * her dizilim icin yurutme adim sinirina takilmadan bitmeli.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createBlindNavigatorState, stepBlindNavigator } from "../packages/shared/dist/index.js";

/**
 * Metin haritada yurutur.
 *
 * `.` acik, `#` kapali. Dusman ilk satirdaki `S` hucresinden baslar, en alt
 * satira ulasmaya calisir. Donen sey: sonuc, gezilen hucreler ve adim sayisi.
 */
function walk(rows, { hand = "left", maxSteps = 400 } = {}) {
  const grid = rows.map((row) => row.split(""));
  const height = grid.length;
  const width = grid[0].length;

  let start;
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (grid[row][col] === "S") {
        start = { col, row };
        grid[row][col] = ".";
      }
    }
  }
  assert.ok(start, "baslangic (S) yok");

  const isOpen = (col, row) => col >= 0 && col < width && row >= 0 && row < height && grid[row][col] !== "#";

  let position = { ...start };
  let state = createBlindNavigatorState(hand);
  const visited = [`${position.col}:${position.row}`];

  for (let steps = 1; steps <= maxSteps; steps += 1) {
    if (position.row === height - 1) {
      return { outcome: "exit", steps, visited, position };
    }

    const result = stepBlindNavigator(position, state, isOpen, () => hand);
    state = result.state;
    if (result.kind !== "move") {
      return { outcome: result.kind, steps, visited, position, target: { col: result.col, row: result.row } };
    }

    position = { col: result.col, row: result.row };
    visited.push(`${position.col}:${position.row}`);
  }

  return { outcome: "loop", steps: maxSteps, visited, position };
}

test("acik haritada duz asagi iner", () => {
  const sonuc = walk([
    ".S..",
    "....",
    "....",
    "...."
  ]);

  assert.equal(sonuc.outcome, "exit");
  // Bos haritada sapma olmamali: her hucre ayni sutunda.
  const sutunlar = new Set(sonuc.visited.map((cell) => cell.split(":")[0]));
  assert.equal(sutunlar.size, 1, `bos haritada dolasti: ${sonuc.visited.join(" ")}`);
  assert.equal(sonuc.visited.length, 4, "her satir bir kez gecilmeli");
});

test("tek engeli dolasip yoluna devam eder", () => {
  const sonuc = walk([
    ".S..",
    "###.",
    "....",
    "...."
  ]);

  assert.equal(sonuc.outcome, "exit", "engeli dolasamadi");
});

test("uzun duvarin ucundan dolanir", () => {
  const sonuc = walk([
    "....S.....",
    ".#########",
    "..........",
    ".........."
  ]);

  assert.equal(sonuc.outcome, "exit");
});

test("spiral dizilimde salinmadan cikar", () => {
  // Salinimin klasik tuzagi: her adimda yeniden karar veren bir gezgin burada
  // iki kare arasinda sikisir.
  const sonuc = walk([
    "S.........",
    "########..",
    "........#.",
    ".######.#.",
    ".#....#.#.",
    ".#.##.#.#.",
    ".#..#.#.#.",
    ".####.#.#.",
    "......#...",
    ".........."
  ], { maxSteps: 600 });

  assert.notEqual(sonuc.outcome, "loop", "spiralde salinima girdi");
});

test("dar gecidi bulur", () => {
  const sonuc = walk([
    "S.........",
    "#####.####",
    "..........",
    ".........."
  ]);

  assert.equal(sonuc.outcome, "exit", "tek karelik gecit bulunamadi");
});

test("bastan basa orulu hat saldiriyla biter", () => {
  // Gedik yok: dusman hattin bir ucundan digerine yuruyup basladigi yere doner.
  // Bu, "bu duvarin altina inen bir yol yok" demektir.
  const sonuc = walk([
    ".S........",
    "##########",
    "..........",
    ".........."
  ], { maxSteps: 300 });

  assert.equal(sonuc.outcome, "attack", `beklenen saldiri, gelen ${sonuc.outcome}`);
});

test("kapali odaya hapsolan dusman saldirir", () => {
  // Dusman odanin **icinde**: cepecevre dolasip basladigi hucreye doner.
  const sonuc = walk([
    "..........",
    "..######..",
    "..#....#..",
    "..#.S..#..",
    "..#....#..",
    "..######..",
    "..........",
    ".........."
  ], { maxSteps: 500 });

  assert.equal(sonuc.outcome, "attack", `beklenen saldiri, gelen ${sonuc.outcome}`);
});

test("odanin disindaki dusman odayi kirmadan dolanir", () => {
  // Ayni oda, ama dusman disarida: kirmak yerine etrafindan gecmeli.
  const sonuc = walk([
    "..........",
    "....S.....",
    "..######..",
    "..#....#..",
    "..#....#..",
    "..######..",
    "..........",
    ".........."
  ], { maxSteps: 500 });

  assert.equal(sonuc.outcome, "exit", `gereksiz yere kirdi: ${sonuc.outcome}`);
});

test("dort yani kapali dusman saldirir", () => {
  const sonuc = walk([
    ".#...",
    "#S#..",
    ".#...",
    "....."
  ], { maxSteps: 50 });

  assert.equal(sonuc.outcome, "attack");
});

test("her iki el de cikisi bulur", () => {
  const harita = [
    "....S.....",
    ".########.",
    "..........",
    ".........."
  ];

  for (const hand of ["left", "right"]) {
    const sonuc = walk(harita, { hand });
    assert.equal(sonuc.outcome, "exit", `${hand} eliyle cikilamadi`);
  }
});

test("el secimi yonu belirler, iki el ayri yollardan gider", () => {
  const harita = [
    "....S.....",
    ".########.",
    "..........",
    ".........."
  ];

  const sol = walk(harita, { hand: "left" });
  const sag = walk(harita, { hand: "right" });

  assert.notDeepEqual(sol.visited, sag.visited, "iki el de ayni yolu izliyor, secimin anlami yok");
});

test("cok sayida cepli haritada takilmaz", () => {
  const sonuc = walk([
    "S.........",
    "#.#.#.#.#.",
    "..#.#.#.#.",
    ".#.#.#.#.#",
    "..........",
    ".#.#.#.#.#",
    ".........."
  ], { maxSteps: 800 });

  assert.notEqual(sonuc.outcome, "loop", "cepler arasinda salindi");
});

/**
 * Duvara toslama ani.
 *
 * Dusman asagi inip duvara carptiginda iki yan varsa yari yariya ayrilmali,
 * yanlardan biri kapaliysa **tamami** acik olana donmeli. El kurali bunu tek
 * basina vermiyordu: secilen yan kapali oldugunda siradaki secenegi yukariydi
 * ve surunun yarisi cikistan uzaklasip geri tirmaniyordu.
 */
function firstContact(rows, hand) {
  const grid = rows.map((row) => row.split(""));
  let start;
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (grid[row][col] === "S") {
        start = { col, row };
        grid[row][col] = ".";
      }
    }
  }
  assert.ok(start, "baslangic (S) yok");

  const isOpen = (col, row) =>
    col >= 0 && col < grid[0].length && row >= 0 && row < grid.length && grid[row][col] !== "#";
  const result = stepBlindNavigator(start, createBlindNavigatorState(hand), isOpen, () => hand);
  if (result.kind !== "move") return "saldiri";
  if (result.col > start.col) return "sag";
  if (result.col < start.col) return "sol";
  return result.row < start.row ? "yukari" : "asagi";
}

test("duvara toslayinca sol kapaliysa tamami saga doner", () => {
  const harita = [
    "..........",
    "..#S......",
    "..########",
    ".........."
  ];

  for (const hand of ["left", "right"]) {
    assert.equal(firstContact(harita, hand), "sag", `${hand} eliyle saga donmedi`);
  }
});

test("duvara toslayinca sag kapaliysa tamami sola doner", () => {
  const harita = [
    "..........",
    "...S#.....",
    "..########",
    ".........."
  ];

  for (const hand of ["left", "right"]) {
    assert.equal(firstContact(harita, hand), "sol", `${hand} eliyle sola donmedi`);
  }
});

test("iki yan da acikken el secimi yonu belirler", () => {
  // Bolunme burada olmali: iki taraf da esitse yari yariya ayrilsinlar.
  const harita = [
    "..........",
    "...S......",
    "..########",
    ".........."
  ];

  assert.equal(firstContact(harita, "left"), "sol");
  assert.equal(firstContact(harita, "right"), "sag");
});

test("iki yan da kapaliyken yukari cikmak hala serbest", () => {
  // Tek cikis yukarisiysa tirmanmak dogru cevap; kural yalnizca acik bir yan
  // varken yukariyi engelliyor.
  const harita = [
    "..........",
    "..#S#.....",
    "..########",
    ".........."
  ];

  for (const hand of ["left", "right"]) {
    assert.equal(firstContact(harita, hand), "yukari", `${hand}: tek cikis yukari iken tirmanmadi`);
  }
});
