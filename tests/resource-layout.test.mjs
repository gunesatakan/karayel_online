/**
 * Kaynak dugumlerinin rastgele yerlesimi: saf fonksiyon.
 *
 * Dugumler bir donem her macta ayni karelerdeydi. Simdi mac basinda tohumlu
 * zarla dagitiliyor; burada kurallarin kendisi tutuluyor: harita ici, kenar
 * payi, dogum ve nexus bandi, dugumler arasi aralik, adil baslangic, acik
 * (haritanin verdigi) konumlar, yol dogrulamasi ve sabit yerlesime donus.
 *
 * Kurallar burada fonksiyonun kendi dogrulayicisindan **bagimsiz** olarak da
 * yeniden hesaplaniyor: dogrulayici ile uretecin ayni hatayi paylasmasi testi
 * sessizce degersiz kilardi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAP_RESOURCE_NODES,
  RESOURCE_LAYOUT_ATTEMPTS_PER_SPACING,
  RESOURCE_LAYOUT_SPACINGS,
  createResourceLayoutRandom,
  createSpecialRandom,
  getFixedResourceLayout,
  getNearestResourceNodeId,
  getResourceNearBaseFirstRow,
  normalizeMapData,
  createOpenArenaMap,
  placeResourceNodes,
  projectMapResourceNodes,
  scaleEditableMap,
  validateResourceLayout
} from "../packages/shared/dist/index.js";

/** Sunucunun kademe basina kurdugu arenalar (`configureArenaForScale`). */
const ARENAS = [[12, 18], [16, 24], [20, 30], [24, 36]];
const IDS = MAP_RESOURCE_NODES.map((node) => node.id);

const chebyshev = (a, b) => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
const roll = (cols, rows, seed, extra = {}) => placeResourceNodes({ cols, rows, nodes: MAP_RESOURCE_NODES, random: createResourceLayoutRandom(seed), ...extra });
const signature = (cells) => IDS.map((id) => `${cells[id].col},${cells[id].row}`).join("|");

/** Kurallarin bagimsiz hesabi; ihlalleri metin olarak dondurur. */
function violations(cols, rows, cells, spacing) {
  const found = [];
  for (const id of IDS) {
    const cell = cells[id];
    if (!cell || !Number.isInteger(cell.col) || !Number.isInteger(cell.row)) { found.push(`${id}: konum yok`); continue; }
    if (cell.col < 1 || cell.col > cols - 2) found.push(`${id}: yan kenar payi (${cell.col})`);
    if (cell.row < 2) found.push(`${id}: dogum bandi (${cell.row})`);
    if (cell.row > rows - 3) found.push(`${id}: nexus bitisigi (${cell.row})`);
  }
  for (let a = 0; a < IDS.length; a += 1) {
    for (let b = a + 1; b < IDS.length; b += 1) {
      if (chebyshev(cells[IDS[a]], cells[IDS[b]]) < spacing) found.push(`${IDS[a]} / ${IDS[b]}: aralik`);
    }
  }
  const lowerFirstRow = Math.ceil(rows * 0.4);
  const crystals = MAP_RESOURCE_NODES.filter((node) => node.kind === "energy");
  if (!crystals.some((node) => cells[node.id].row >= lowerFirstRow)) found.push("alt %60'ta enerji kristali yok");
  if (cells["ammo-source-1"].row < lowerFirstRow) found.push("barut alt %60'ta degil");
  return found;
}

test("dugum listesi: uc kristal ve dort hammadde, kimlik ve tur sabit", () => {
  assert.deepEqual(MAP_RESOURCE_NODES, [
    { id: "crystal-1", kind: "energy" },
    { id: "crystal-2", kind: "energy" },
    { id: "crystal-3", kind: "energy" },
    { id: "ammo-source-1", kind: "gunpowder" },
    { id: "ammo-source-2", kind: "mystic" },
    { id: "ammo-source-3", kind: "plasma" },
    { id: "iron-1", kind: "iron" }
  ]);
});

test("usse yakin bolge haritanin alt %60'i", () => {
  assert.deepEqual(ARENAS.map(([, rows]) => getResourceNearBaseFirstRow(rows)), [8, 10, 12, 15]);
  for (let rows = 4; rows <= 48; rows += 1) {
    assert.equal(getResourceNearBaseFirstRow(rows), Math.ceil(rows * 0.4 - 1e-9), `${rows} satir`);
  }
});

test("her arena olcusunde ve cok sayida tohumda butun kurallar tutuyor", () => {
  for (const [cols, rows] of ARENAS) {
    for (let seed = 0; seed < 400; seed += 1) {
      const result = roll(cols, rows, seed * 7919 + cols);
      assert.equal(result.source, "random", `${cols}x${rows} tohum ${seed}: ${result.source}`);
      assert.equal(result.spacing, 3, `${cols}x${rows} tohum ${seed}: aralik gevsedi`);
      assert.deepEqual(Object.keys(result.cells), IDS, "dugum kimlikleri ya da sirasi degisti");
      assert.deepEqual(violations(cols, rows, result.cells, 3), [], `${cols}x${rows} tohum ${seed}`);
      assert.deepEqual(validateResourceLayout({ cols, rows, nodes: MAP_RESOURCE_NODES }, result.cells, { spacing: 3 }), []);
    }
  }
});

test("ayni tohum ayni yerlesimi, farkli tohum farkli yerlesimi veriyor", () => {
  for (const [cols, rows] of ARENAS) {
    const seen = new Set();
    for (let seed = 1; seed <= 200; seed += 1) {
      const first = roll(cols, rows, seed);
      assert.deepEqual(roll(cols, rows, seed), first, `${cols}x${rows} tohum ${seed} tekrarlanmadi`);
      seen.add(signature(first.cells));
    }
    assert.ok(seen.size >= 198, `${cols}x${rows}: 200 tohumdan yalnizca ${seen.size} farkli yerlesim`);
  }
});

test("yerlesim gercekten dagiliyor: her gecerli satir ve sutun kullaniliyor, sabit yerlesim tekrarlanmiyor", () => {
  const [cols, rows] = ARENAS[0];
  const usedCols = new Set();
  const usedRows = new Set();
  const fixed = signature(getFixedResourceLayout(cols, rows));
  let sameAsFixed = 0;
  for (let seed = 0; seed < 600; seed += 1) {
    const { cells } = roll(cols, rows, seed);
    for (const id of IDS) { usedCols.add(cells[id].col); usedRows.add(cells[id].row); }
    if (signature(cells) === fixed) sameAsFixed += 1;
  }
  assert.deepEqual([...usedCols].sort((a, b) => a - b), Array.from({ length: cols - 2 }, (_, index) => index + 1));
  assert.deepEqual([...usedRows].sort((a, b) => a - b), Array.from({ length: rows - 4 }, (_, index) => index + 2));
  assert.equal(sameAsFixed, 0);
});

test("yerlesim zari ozel dusman zarindan ayri bir dizi", () => {
  const layout = createResourceLayoutRandom(1234);
  const special = createSpecialRandom(1234, 1);
  const a = Array.from({ length: 8 }, () => layout());
  const b = Array.from({ length: 8 }, () => special());
  assert.notDeepEqual(a, b);
  assert.ok(a.every((value) => value >= 0 && value < 1));
  const again = createResourceLayoutRandom(1234);
  assert.deepEqual(Array.from({ length: 8 }, () => again()), a);
});

test("kucuk haritada aralik 3'ten 2'ye gevsiyor, kurallarin gerisi tutuyor", () => {
  for (const [cols, rows] of [[8, 9], [8, 10], [7, 9]]) {
    for (let seed = 0; seed < 150; seed += 1) {
      const result = roll(cols, rows, seed);
      assert.equal(result.source, "random", `${cols}x${rows} tohum ${seed}`);
      assert.equal(result.spacing, 2, `${cols}x${rows} tohum ${seed}`);
      assert.ok(result.attempts > RESOURCE_LAYOUT_ATTEMPTS_PER_SPACING, "3 aralik denenmeden 2'ye inildi");
      assert.deepEqual(violations(cols, rows, result.cells, 2), [], `${cols}x${rows} tohum ${seed}`);
    }
  }
  assert.deepEqual([...RESOURCE_LAYOUT_SPACINGS], [3, 2]);
});

test("sigmayan haritada sinirli denemeden sonra eski sabit yerlesime donuluyor", () => {
  for (const [cols, rows] of [[6, 8], [5, 8], [6, 9]]) {
    let calls = 0;
    const random = createResourceLayoutRandom(5);
    const result = placeResourceNodes({ cols, rows, nodes: MAP_RESOURCE_NODES, random: () => { calls += 1; return random(); } });
    assert.equal(result.source, "fallback");
    assert.equal(result.attempts, RESOURCE_LAYOUT_ATTEMPTS_PER_SPACING * RESOURCE_LAYOUT_SPACINGS.length);
    assert.deepEqual(result.cells, getFixedResourceLayout(cols, rows));
    assert.ok(calls > 0 && calls < 2000, `zar sayisi sinirsiz: ${calls}`);
  }
});

test("hic aday kare yoksa zar atilmadan sabit yerlesim; verilen yedek yerlesim kullaniliyor", () => {
  const noRandom = () => { throw new Error("zar atilmamali"); };
  const tiny = placeResourceNodes({ cols: 4, rows: 4, nodes: MAP_RESOURCE_NODES, random: noRandom });
  assert.equal(tiny.source, "fallback");
  assert.equal(tiny.attempts, 0);
  assert.deepEqual(tiny.cells, getFixedResourceLayout(4, 4));

  const everything = [];
  for (let row = 0; row < 18; row += 1) for (let col = 0; col < 12; col += 1) everything.push({ col, row });
  const fallback = Object.fromEntries(IDS.map((id, index) => [id, { col: 1 + index, row: 9 }]));
  const closed = placeResourceNodes({ cols: 12, rows: 18, nodes: MAP_RESOURCE_NODES, random: noRandom, forbiddenCells: everything, fallback });
  assert.equal(closed.source, "fallback");
  assert.deepEqual(closed.cells, fallback);
});

test("eski sabit yerlesim: 12x18 arenada ve 11x18 varsayilan haritada bilinen kareler", () => {
  assert.deepEqual(getFixedResourceLayout(12, 18), {
    "crystal-1": { col: 2, row: 6 },
    "crystal-2": { col: 6, row: 11 },
    "crystal-3": { col: 9, row: 6 },
    "ammo-source-1": { col: 2, row: 12 },
    "ammo-source-2": { col: 6, row: 5 },
    "ammo-source-3": { col: 9, row: 12 },
    "iron-1": { col: 3, row: 8 }
  });
  assert.deepEqual(getFixedResourceLayout(11, 18)["crystal-2"], { col: 5, row: 11 });
  // Sabit yerlesim yeni kurallarin da icinde (aralik 2 ile).
  for (const [cols, rows] of ARENAS) {
    assert.deepEqual(validateResourceLayout({ cols, rows, nodes: MAP_RESOURCE_NODES }, getFixedResourceLayout(cols, rows), { spacing: 2 }), []);
  }
});

test("yasak ve engelli karelere dugum konmuyor; dogum ve nexus kareleri haritadan okunuyor", () => {
  const cols = 12;
  const rows = 18;
  // Sol yari yasak, ortada engelli bir blok.
  const forbiddenCells = [];
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < 6; col += 1) forbiddenCells.push({ col, row });
  const blockedCells = [{ col: 8, row: 9 }, { col: 9, row: 9 }, { col: 8, row: 10 }, { col: 9, row: 10 }];
  // Tek dogum ve tek nexus karesi (duzenlenebilir harita gibi): yasak bolge yalnizca cevreleri.
  const spawnCells = [{ col: 10, row: 3 }];
  const nexusCells = [{ col: 7, row: 14 }];
  let nearSpawnRowUsed = false;
  for (let seed = 0; seed < 300; seed += 1) {
    const { cells, source } = roll(cols, rows, seed, { forbiddenCells, blockedCells, spawnCells, nexusCells });
    assert.equal(source, "random");
    for (const id of IDS) {
      const cell = cells[id];
      assert.ok(cell.col >= 6, `${id} yasak yarida`);
      assert.ok(!blockedCells.some((blocked) => blocked.col === cell.col && blocked.row === cell.row), `${id} yapinin ustunde`);
      assert.ok(chebyshev(cell, spawnCells[0]) > 1, `${id} dogum karesinin dibinde`);
      assert.ok(chebyshev(cell, nexusCells[0]) > 1, `${id} nexusun dibinde`);
      // Ust satir artik dogum bandi degil: kenar payi disinda serbest.
      if (cell.row === 1) nearSpawnRowUsed = true;
    }
    assert.deepEqual(validateResourceLayout({ cols, rows, nodes: MAP_RESOURCE_NODES, forbiddenCells, blockedCells, spawnCells, nexusCells }, cells), []);
  }
  assert.ok(nearSpawnRowUsed, "dogum bandi haritadan degil sabit satirdan okunuyor");
});

test("yapilarla usten kopan bolgeye dugum konmuyor (isci ulasamazdi)", () => {
  const cols = 12;
  const rows = 18;
  // 6. satirda boydan boya yapi: ustu usten kopuk.
  const blockedCells = Array.from({ length: cols }, (_, col) => ({ col, row: 6 }));
  for (let seed = 0; seed < 200; seed += 1) {
    const { cells, source } = roll(cols, rows, seed, { blockedCells });
    assert.equal(source, "random");
    for (const id of IDS) assert.ok(cells[id].row > 6, `${id} kopuk bolgede (satir ${cells[id].row})`);
  }
  // Kopuk bolgedeki bir yerlesimi dogrulayici da yakaliyor.
  const stranded = { ...roll(cols, rows, 1, { blockedCells }).cells, "iron-1": { col: 5, row: 3 } };
  assert.ok(validateResourceLayout({ cols, rows, nodes: MAP_RESOURCE_NODES, blockedCells }, stranded).includes("unreachable:iron-1"));
});

test("dugumler engel sayilirsa: dogumdan nexusa yol kapanmiyor ve her dugume bitisikten ulasiliyor", () => {
  const cols = 9;
  const rows = 16;
  // 8. satirda duvar, tek gedik (4,8): oraya dusen dugum yolu keserdi.
  const blockedCells = Array.from({ length: cols }, (_, col) => ({ col, row: 8 })).filter((cell) => cell.col !== 4);
  const input = { cols, rows, nodes: MAP_RESOURCE_NODES, blockedCells, nodesBlockMovement: true };
  let checked = 0;
  for (let seed = 0; seed < 300; seed += 1) {
    const result = placeResourceNodes({ ...input, random: createResourceLayoutRandom(seed) });
    if (result.source !== "random") continue;
    checked += 1;
    const closed = new Set([...blockedCells, ...Object.values(result.cells)].map((cell) => `${cell.col}:${cell.row}`));
    assert.ok(!closed.has("4:8"), "dugum gedigi kapatti");
    // Bagimsiz tasma: ust satirdan alt satira.
    const seen = new Set();
    const queue = [];
    for (let col = 0; col < cols; col += 1) if (!closed.has(`${col}:0`)) { queue.push([col, 0]); seen.add(`${col}:0`); }
    let reached = false;
    while (queue.length > 0) {
      const [col, row] = queue.shift();
      if (row === rows - 1) { reached = true; break; }
      for (const [dc, dr] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const key = `${col + dc}:${row + dr}`;
        if (col + dc < 0 || col + dc >= cols || row + dr < 0 || row + dr >= rows || closed.has(key) || seen.has(key)) continue;
        seen.add(key);
        queue.push([col + dc, row + dr]);
      }
    }
    assert.ok(reached, `tohum ${seed}: dugumler dogum-nexus yolunu kapatti`);
    assert.deepEqual(validateResourceLayout(input, result.cells), []);
  }
  assert.ok(checked > 200, `yalnizca ${checked} tohum rastgele yerlesim verdi`);

  // Gedige oturan dugum dogrulamada yakalaniyor.
  const cells = { ...placeResourceNodes({ ...input, random: createResourceLayoutRandom(3) }).cells, "iron-1": { col: 4, row: 8 } };
  assert.ok(validateResourceLayout(input, cells).includes("spawn-route"));
});

test("haritanin acikca verdigi konumlar aynen kaliyor; digerleri onlara aralik birakiyor", () => {
  const cols = 12;
  const rows = 18;
  // Kurallarin disinda bile olsa (dogum bandi, kenar) acik konum degismez.
  const fixed = { "crystal-1": { col: 0, row: 1 }, "iron-1": { col: 6, row: 9 } };
  for (let seed = 0; seed < 200; seed += 1) {
    const { cells, source } = roll(cols, rows, seed, { fixed });
    assert.equal(source, "random");
    assert.deepEqual(cells["crystal-1"], fixed["crystal-1"]);
    assert.deepEqual(cells["iron-1"], fixed["iron-1"]);
    for (const id of IDS.filter((entry) => !(entry in fixed))) {
      assert.ok(chebyshev(cells[id], fixed["iron-1"]) >= 3, `${id} acik konuma yapisik`);
      assert.ok(chebyshev(cells[id], fixed["crystal-1"]) >= 3, `${id} acik konuma yapisik`);
      assert.ok(cells[id].row >= 2 && cells[id].row <= rows - 3 && cells[id].col >= 1 && cells[id].col <= cols - 2);
    }
    // Adil baslangic serbest kristallerden biriyle saglaniyor.
    assert.ok(["crystal-2", "crystal-3"].some((id) => cells[id].row >= 8));
    assert.deepEqual(validateResourceLayout({ cols, rows, nodes: MAP_RESOURCE_NODES, fixed }, cells, { spacing: 3 }), []);
  }
});

test("butun dugumleri acik verilmis harita hic zar atmiyor", () => {
  const fixed = Object.fromEntries(IDS.map((id, index) => [id, { col: 1 + index, row: 3 }]));
  const result = placeResourceNodes({ cols: 12, rows: 18, nodes: MAP_RESOURCE_NODES, fixed, random: () => { throw new Error("zar atilmamali"); } });
  assert.equal(result.source, "explicit");
  assert.equal(result.attempts, 0);
  assert.deepEqual(result.cells, fixed);
  // Harita disi ya da bozuk acik konum yok sayiliyor, o dugum zarla yerlesiyor.
  const partial = roll(12, 18, 9, { fixed: { ...fixed, "iron-1": { col: 40, row: 3 }, "crystal-2": { col: 1.5, row: 3 } } });
  assert.equal(partial.source, "random");
  assert.deepEqual(partial.cells["crystal-1"], fixed["crystal-1"]);
  assert.ok(partial.cells["iron-1"].col <= 10 && Number.isInteger(partial.cells["crystal-2"].col));
});

test("harita verisi acik dugum konumlarini tasiyor: dogrulama ve olcek", () => {
  const base = createOpenArenaMap(12, 18);
  assert.equal("resourceNodes" in normalizeMapData(base), false, "konumsuz haritaya bos alan eklendi");
  const map = normalizeMapData({
    ...base,
    resourceNodes: [
      { id: "crystal-1", col: 3, row: 4 },
      { id: "crystal-1", col: 9, row: 9 },
      { id: "iron-1", col: 12, row: 4 },
      { id: "ammo-source-1", col: 2.5, row: 4 },
      { id: 7, col: 1, row: 1 },
      null,
      { id: "crystal-3", col: 11, row: 17 }
    ]
  });
  assert.deepEqual(map.resourceNodes, [{ id: "crystal-1", col: 3, row: 4 }, { id: "crystal-3", col: 11, row: 17 }]);
  assert.equal("resourceNodes" in normalizeMapData({ ...base, resourceNodes: "x" }), false);

  // Ayni olcude konumlar aynen; baska olcude kare merkezinin orani korunuyor.
  assert.deepEqual(projectMapResourceNodes(map.resourceNodes, { cols: 12, rows: 18 }, { cols: 12, rows: 18 }), map.resourceNodes);
  assert.deepEqual(projectMapResourceNodes(map.resourceNodes, { cols: 12, rows: 18 }, { cols: 24, rows: 36 }),
    [{ id: "crystal-1", col: 7, row: 9 }, { id: "crystal-3", col: 23, row: 35 }]);
  assert.deepEqual(scaleEditableMap(map, 1).resourceNodes, map.resourceNodes);
  const scaled = scaleEditableMap(map, 2);
  assert.equal(scaled.resourceNodes.length, 2);
  for (const node of scaled.resourceNodes) {
    assert.ok(node.col >= 0 && node.col < scaled.cols && node.row >= 0 && node.row < scaled.rows);
  }
});

test("turun usse en yakin dugumu: nexusa uzaklik, esitlikte iscinin dogdugu kareye yakinlik", () => {
  const baseCells = Array.from({ length: 12 }, (_, col) => ({ col, row: 17 }));
  const cells = {
    "crystal-1": { col: 2, row: 4 },
    "crystal-2": { col: 9, row: 12 },
    "crystal-3": { col: 3, row: 12 },
    "ammo-source-1": { col: 6, row: 8 },
    "ammo-source-2": { col: 6, row: 14 },
    "ammo-source-3": { col: 1, row: 15 },
    "iron-1": { col: 10, row: 15 }
  };
  const nearest = (kind, from) => getNearestResourceNodeId({ nodes: MAP_RESOURCE_NODES, cells, kind, baseCells, from });
  // Iki kristal ayni satirda: iscinin dogdugu sol alt koseye yakin olan.
  assert.equal(nearest("energy", { col: 1, row: 16 }), "crystal-3");
  assert.equal(nearest("energy", { col: 10, row: 16 }), "crystal-2");
  // Esitlik bozulmazsa listedeki ilk.
  assert.equal(nearest("energy"), "crystal-2");
  // Tek dugumlu tur: o dugum; mistik oz daha asagida olsa bile barut barut.
  assert.equal(nearest("gunpowder", { col: 1, row: 16 }), "ammo-source-1");
  assert.equal(nearest("iron"), "iron-1");
  assert.equal(nearest("yok"), undefined);
  // Tek nexus kareli haritada olcu o kareye uzaklik.
  assert.equal(getNearestResourceNodeId({ nodes: MAP_RESOURCE_NODES, cells, kind: "energy", baseCells: [{ col: 2, row: 0 }] }), "crystal-1");
});
