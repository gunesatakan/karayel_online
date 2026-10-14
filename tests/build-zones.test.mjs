/**
 * Kurulum yasak bolgelerin uretimi (packages/shared/src/build-zones.ts).
 *
 * Saf fonksiyonun sozleri, her olcekte ve yuzlerce tohumda:
 * - 1x'te 2-4 leke, 3-8 kare; buyuk haritada sayi ve boy alanla buyuyor.
 * - Toplam insa edilebilir karelerin %8-12'si.
 * - Dogum/nexus satirlarinda ve bitisiginde yok; yan kenardan bir kare iceride.
 * - Bir leke bir satirin %40'indan fazlasini kaplamiyor; hepsi birlikte %50.
 * - Alt ucte bir en az %85 insa edilebilir.
 * - Lekeler dik bagli, birbirine (kosegen dahil) degmiyor.
 * - Ayni tohum ayni bolge; engelli kareye bolge yok.
 * - Kaynak dugumleri bolgeye hic dusmuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILD_ZONE_BASE_BLOB_COUNT,
  BUILD_ZONE_BASE_BLOB_SIZE,
  MAP_RESOURCE_NODES,
  createBuildZoneLookup,
  createBuildZoneRandom,
  createResourceLayoutRandom,
  generateBuildZones,
  getBuildZoneLimits,
  groupBuildZoneBlobs,
  isEdgeTouchingBuildZone,
  isFootprintInBuildZone,
  placeResourceNodes
} from "../packages/shared/dist/index.js";

const ARENAS = [[12, 18], [16, 24], [20, 30], [24, 36]];
const SEEDS = 300;

function cellOf(index, cols) {
  return { col: index % cols, row: Math.floor(index / cols) };
}

function generate(cols, rows, seed, extra = {}) {
  return generateBuildZones({ cols, rows, random: createBuildZoneRandom(seed), ...extra });
}

test("1x arenada 2-4 leke, 3-8 kare; toplam insa alaninin %8-12'si", () => {
  const limits = getBuildZoneLimits({ cols: 12, rows: 18 });
  assert.deepEqual([...limits.blobCount], [...BUILD_ZONE_BASE_BLOB_COUNT]);
  assert.deepEqual([...limits.blobSize], [...BUILD_ZONE_BASE_BLOB_SIZE]);
  assert.deepEqual([...limits.blobCount], [2, 4]);
  assert.deepEqual([...limits.blobSize], [3, 8]);
  assert.equal(limits.buildable, 12 * 16);
  assert.deepEqual([limits.totalMin, limits.totalMax], [16, 23]);
  const seenCounts = new Set();
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const zones = generate(12, 18, seed);
    assert.equal(zones.source, "random", `tohum ${seed}`);
    assert.ok(zones.blobs.length >= 2 && zones.blobs.length <= 4, `tohum ${seed}: ${zones.blobs.length} leke`);
    for (const blob of zones.blobs) assert.ok(blob.length >= 3 && blob.length <= 8, `tohum ${seed}: leke ${blob.length} kare`);
    const share = zones.cells.length / limits.buildable;
    assert.ok(share >= 0.08 && share <= 0.12, `tohum ${seed}: pay ${share}`);
    seenCounts.add(zones.blobs.length);
  }
  assert.deepEqual([...seenCounts].sort(), [2, 3, 4], "leke sayisi araligin tamamini kullanmiyor");
});

test("her olcekte butun kurallar tutuyor", () => {
  for (const [cols, rows] of ARENAS) {
    const limits = getBuildZoneLimits({ cols, rows });
    // Sayi ve boy olcekle buyuyor (alan oraninin karekoku), asla kuculmuyor.
    assert.ok(limits.blobCount[0] >= 2 && limits.blobSize[0] >= 3);
    assert.ok(limits.totalMin >= Math.ceil(limits.buildable * 0.08) && limits.totalMax <= Math.floor(limits.buildable * 0.12));
    const bottomFirstRow = rows - Math.ceil(rows / 3);
    assert.equal(limits.bottomFirstRow, bottomFirstRow);
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const label = `${cols}x${rows} tohum ${seed}`;
      const zones = generate(cols, rows, seed);
      assert.equal(zones.source, "random", label);
      assert.deepEqual([zones.cols, zones.rows], [cols, rows]);
      assert.ok(zones.blobs.length >= limits.blobCount[0] && zones.blobs.length <= limits.blobCount[1], `${label}: leke sayisi`);
      const total = zones.cells.length;
      assert.ok(total >= limits.totalMin && total <= limits.totalMax, `${label}: toplam ${total}`);
      const share = total / (cols * (rows - 2));
      assert.ok(share >= 0.08 && share <= 0.12, `${label}: pay ${share}`);
      assert.equal(new Set(zones.cells).size, total, `${label}: tekrar eden kare`);
      assert.deepEqual(zones.cells, [...zones.cells].sort((a, b) => a - b), `${label}: telde artan sira`);

      const owner = new Map();
      zones.blobs.forEach((blob, blobIndex) => {
        assert.ok(blob.length >= limits.blobSize[0] && blob.length <= limits.blobSize[1], `${label}: leke boyu ${blob.length}`);
        for (const index of blob) owner.set(index, blobIndex);
        const rowsOfBlob = new Map();
        for (const index of blob) {
          const { col, row } = cellOf(index, cols);
          // Dogum (0) ve nexus (son) satiri ile bitisikleri yok; yan kenardan bir kare iceride.
          assert.ok(row >= 2 && row <= rows - 3, `${label}: satir ${row}`);
          assert.ok(col >= 1 && col <= cols - 2, `${label}: sutun ${col}`);
          rowsOfBlob.set(row, (rowsOfBlob.get(row) ?? 0) + 1);
        }
        for (const [row, count] of rowsOfBlob) assert.ok(count <= Math.floor(cols * 0.4), `${label}: leke satir ${row}'da ${count}/${cols}`);
      });
      // Lekeler dik bagli: her leke tek parca.
      const groups = groupBuildZoneBlobs(zones);
      assert.equal(groups.length, zones.blobs.length, `${label}: leke kopuk ya da iki leke birlesik`);
      // Lekeler birbirine degmiyor (kosegen dahil).
      for (const [index, blobIndex] of owner) {
        const { col, row } = cellOf(index, cols);
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            const other = owner.get((row + dr) * cols + col + dc);
            if (col + dc < 0 || col + dc >= cols) continue;
            assert.ok(other === undefined || other === blobIndex, `${label}: lekeler degiyor`);
          }
        }
      }
      // Satir toplami: harita insa icin ikiye bolunmuyor.
      const rowTotals = new Map();
      for (const index of zones.cells) rowTotals.set(cellOf(index, cols).row, (rowTotals.get(cellOf(index, cols).row) ?? 0) + 1);
      for (const [row, count] of rowTotals) assert.ok(count <= Math.floor(cols * 0.5), `${label}: satir ${row} toplam ${count}`);
      // Adil baslangic: alt ucte bir en az %85 insa edilebilir (nexus satiri haric).
      const bottomBuildable = cols * (rows - bottomFirstRow - 1);
      const bottomZones = zones.cells.filter((index) => cellOf(index, cols).row >= bottomFirstRow).length;
      assert.ok((bottomBuildable - bottomZones) / bottomBuildable >= 0.85, `${label}: alt ucte bir ${bottomZones}/${bottomBuildable}`);
    }
  }
});

test("ayni tohum ayni bolge, farkli tohum farkli; zar akisi tohumdan", () => {
  for (const [cols, rows] of ARENAS) {
    for (const seed of [1, 99, 4242]) {
      assert.deepEqual(generate(cols, rows, seed), generate(cols, rows, seed));
    }
    assert.notDeepEqual(generate(cols, rows, 1).cells, generate(cols, rows, 2).cells);
  }
  // Bolge zari kaynak zarindan ayri bir akis (ayni tohumla ayni sayilari vermiyor).
  const zoneRandom = createBuildZoneRandom(5);
  const resourceRandom = createResourceLayoutRandom(5);
  assert.notDeepEqual([zoneRandom(), zoneRandom()], [resourceRandom(), resourceRandom()]);
});

test("engelli kareler (ayakta yapi) bolgeye girmiyor", () => {
  const blocked = [];
  for (let row = 2; row <= 15; row += 1) for (let col = 1; col <= 10; col += 1) if ((col + row) % 3 === 0) blocked.push({ col, row });
  const blockedSet = new Set(blocked.map((cell) => cell.row * 12 + cell.col));
  for (let seed = 0; seed < 100; seed += 1) {
    const zones = generate(12, 18, seed, { blockedCells: blocked });
    for (const index of zones.cells) assert.equal(blockedSet.has(index), false, `tohum ${seed}: bolge yapinin altinda`);
  }
});

test("kaynak dugumleri bolgeye dusmuyor (bolge once, dugum sonra)", () => {
  for (const [cols, rows] of ARENAS) {
    for (let seed = 0; seed < 150; seed += 1) {
      const zones = generate(cols, rows, seed);
      const lookup = createBuildZoneLookup(zones, cols, rows);
      const result = placeResourceNodes({
        cols,
        rows,
        nodes: MAP_RESOURCE_NODES,
        forbiddenCells: zones.cells.map((index) => cellOf(index, cols)),
        random: createResourceLayoutRandom(seed)
      });
      assert.equal(result.source, "random", `${cols}x${rows} tohum ${seed}`);
      for (const [id, cell] of Object.entries(result.cells)) {
        assert.equal(lookup.has(cell.col, cell.row), false, `${cols}x${rows} tohum ${seed}: ${id} bolgede`);
      }
    }
  }
  // Zar yerlesim cikaramazsa bile (sabit yerlesime donus) dugum bolgeye kaymaz.
  const forbidden = [];
  for (let row = 0; row < 18; row += 1) for (let col = 0; col < 12; col += 1) if (row !== 9) forbidden.push({ col, row });
  const fallback = placeResourceNodes({ cols: 12, rows: 18, nodes: MAP_RESOURCE_NODES, forbiddenCells: forbidden, random: createResourceLayoutRandom(1), attemptsPerSpacing: 1 });
  assert.equal(fallback.source, "fallback");
  const forbiddenSet = new Set(forbidden.map((cell) => `${cell.col}:${cell.row}`));
  for (const cell of Object.values(fallback.cells)) assert.equal(forbiddenSet.has(`${cell.col}:${cell.row}`), false);
});

test("sorgu yardimcilari: ayak izi ve kenar", () => {
  // 12x18'de (4,5) ve (5,5) bolge.
  const zones = { cols: 12, rows: 18, cells: [5 * 12 + 4, 5 * 12 + 5] };
  const lookup = createBuildZoneLookup(zones, 12, 18);
  assert.equal(lookup.has(4, 5), true);
  assert.equal(lookup.has(6, 5), false);
  // Olcu tutmayan bolge yok sayiliyor.
  assert.equal(createBuildZoneLookup(zones, 16, 24).size, 0);
  assert.equal(isFootprintInBuildZone(lookup, [{ col: 3, row: 4 }, { col: 4, row: 4 }, { col: 3, row: 5 }, { col: 4, row: 5 }]), true, "2x2'nin tek karesi yeter");
  assert.equal(isFootprintInBuildZone(lookup, [{ col: 6, row: 5 }]), false);
  // Dikey (col,row): (col-1,row)|(col,row). Yatay (col,row): (col,row-1)/(col,row).
  assert.equal(isEdgeTouchingBuildZone(lookup, { orientation: "vertical", col: 4, row: 5 }), true, "sol kenar");
  assert.equal(isEdgeTouchingBuildZone(lookup, { orientation: "vertical", col: 6, row: 5 }), true, "sag kenar");
  assert.equal(isEdgeTouchingBuildZone(lookup, { orientation: "vertical", col: 7, row: 5 }), false);
  assert.equal(isEdgeTouchingBuildZone(lookup, { orientation: "horizontal", col: 4, row: 5 }), true, "ust kenar");
  assert.equal(isEdgeTouchingBuildZone(lookup, { orientation: "horizontal", col: 5, row: 6 }), true, "alt kenar");
  assert.equal(isEdgeTouchingBuildZone(lookup, { orientation: "horizontal", col: 5, row: 7 }), false);
  assert.equal(isEdgeTouchingBuildZone(lookup, { orientation: "vertical", col: 4, row: 6 }), false, "koseden degen kenar sayilmiyor");
});
