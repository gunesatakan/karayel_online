/**
 * Nexusa dogru tek bir akis alani.
 *
 * Once her dusman icin ayri BFS kosuyordu: her tick, her dusman, tum izgara.
 * 20. dalgada 142 dusman ve ~200 hucreyle bu saniyede bir milyonun uzerinde
 * hucre ziyareti demekti ve maliyet dogrudan dusman sayisiyla buyuyordu.
 *
 * Alan bunun yerine hedeften geriye dogru bir kez cozulur ve her hucreye
 * "nexusa varis maliyeti" ile "bir sonraki hucre" yazilir. Dusman yalnizca
 * bulundugu hucreye bakar; yol bulma maliyeti dusman sayisindan bagimsiz olur.
 *
 * Hucre maliyetleri disaridan verilir. Bos hucre 1, kirilabilir bir yapi ise
 * kirma suresiyle orantili daha yuksek bir sayi dondurur; `Infinity` gecilmez
 * demektir. Boylece modul oyunun yapi kurallarini hic bilmeden saf kalir.
 */

export type FlowFieldCell = { col: number; row: number };

export type FlowField = {
  cols: number;
  rows: number;
  /** Duz indeks basina nexusa varis maliyeti; ulasilamayan hucrede Infinity. */
  cost: Float64Array;
  /** Bir sonraki hucrenin duz indeksi; yok ise -1. */
  next: Int32Array;
};

/**
 * Komsu tarama sirasi.
 *
 * Sabit ve acik olmak zorunda: esit maliyetli iki komsu oldugunda hangisinin
 * secildigi buradan belli olur. Rastgele ya da nesne anahtar sirasina birakmak
 * cok oyunculuda desenkronizasyon, testlerde ise kirilganlik uretir.
 */
const NEIGHBOR_OFFSETS: ReadonlyArray<FlowFieldCell> = [
  { col: 0, row: 1 },
  { col: -1, row: 0 },
  { col: 1, row: 0 },
  { col: 0, row: -1 }
];

export function getFlowFieldIndex(field: { cols: number }, col: number, row: number) {
  return row * field.cols + col;
}

export function isInsideFlowField(field: { cols: number; rows: number }, col: number, row: number) {
  return col >= 0 && row >= 0 && col < field.cols && row < field.rows;
}

export function getFlowCost(field: FlowField, col: number, row: number) {
  if (!isInsideFlowField(field, col, row)) return Number.POSITIVE_INFINITY;
  return field.cost[getFlowFieldIndex(field, col, row)];
}

/** Hucrenin akisa gore gidecegi komsu; alan disiysa veya yol yoksa undefined. */
export function getFlowNext(field: FlowField, col: number, row: number): FlowFieldCell | undefined {
  if (!isInsideFlowField(field, col, row)) return undefined;
  const next = field.next[getFlowFieldIndex(field, col, row)];
  if (next < 0) return undefined;
  return { col: next % field.cols, row: Math.floor(next / field.cols) };
}

/**
 * Hedeften geriye Dijkstra.
 *
 * Anlambilim acik olmak zorunda: `cost[h]` = h hucresinden bir hedefe varmanin
 * toplam maliyeti, ve **komsuya girmek** o komsunun maliyeti kadar tutar. Yani
 * bir duvarin bedeli oraya girerken odenir, uzerinde dururken degil. Ters
 * kurgu -- her hucrenin kendi giris bedelini tasimasi -- duvarin ustundeki
 * dusmani kendi duvarinin bedelini odemis sayardi.
 *
 *   cost[hedef] = 0
 *   cost[h]     = min over komsu k  ( maliyet(k) + cost[k] )
 *
 * Maliyeti `Infinity` olan hucreye hicbir zaman girilemez; boyle bir hucre ne
 * baskasina komsu olarak sayilir ne de kendi maliyeti sonlu olur. Bu sayede
 * "sonsuz = gecilmez" degismezi her yerde ayni anlama gelir.
 *
 * Izgara ~200 hucre oldugu icin kuyruk basit tutuldu: her adimda en ucuz
 * islenmemis hucre dogrusal aranir. Ikili yigin bu boyutta olcum edilebilir bir
 * fark uretmez ve okunmasi zor bir kod getirir.
 */
export function computeFlowField(options: {
  cols: number;
  rows: number;
  goals: readonly FlowFieldCell[];
  getCost: (col: number, row: number) => number;
}): FlowField {
  const { cols, rows, goals, getCost } = options;
  const size = Math.max(0, cols * rows);
  const cost = new Float64Array(size).fill(Number.POSITIVE_INFINITY);
  const next = new Int32Array(size).fill(-1);
  const settled = new Uint8Array(size);
  const field: FlowField = { cols, rows, cost, next };

  // Giris maliyetleri bir kez cozulur: Dijkstra ve akis turetme ayni sayilari
  // gormek zorunda, yoksa iki gecis birbirinden ayrisabilir.
  const enterCost = new Float64Array(size);
  for (let index = 0; index < size; index += 1) {
    const raw = getCost(index % cols, Math.floor(index / cols));
    enterCost[index] = Number.isFinite(raw) ? Math.max(0, raw) : Number.POSITIVE_INFINITY;
  }

  for (const goal of goals) {
    if (!isInsideFlowField(field, goal.col, goal.row)) continue;
    const index = getFlowFieldIndex(field, goal.col, goal.row);
    if (!Number.isFinite(enterCost[index])) continue;
    cost[index] = 0;
  }

  for (;;) {
    let currentIndex = -1;
    let currentCost = Number.POSITIVE_INFINITY;
    for (let index = 0; index < size; index += 1) {
      // Esitlikte dusuk indeks kazanir: satir-oncelikli, belirlenimli.
      if (settled[index] === 0 && cost[index] < currentCost) {
        currentCost = cost[index];
        currentIndex = index;
      }
    }
    if (currentIndex < 0) break;

    settled[currentIndex] = 1;
    const col = currentIndex % cols;
    const row = Math.floor(currentIndex / cols);
    // Komsunun odeyecegi bedel: bu hucreye girmek.
    const stepCost = enterCost[currentIndex];
    if (!Number.isFinite(stepCost)) continue;

    for (const offset of NEIGHBOR_OFFSETS) {
      const neighborCol = col + offset.col;
      const neighborRow = row + offset.row;
      if (!isInsideFlowField(field, neighborCol, neighborRow)) continue;

      const neighborIndex = getFlowFieldIndex(field, neighborCol, neighborRow);
      if (settled[neighborIndex] === 1 || !Number.isFinite(enterCost[neighborIndex])) continue;

      const candidate = currentCost + stepCost;
      if (candidate < cost[neighborIndex]) {
        cost[neighborIndex] = candidate;
      }
    }
  }

  // Akis yonu ayri bir gecicte turetilir.
  //
  // Dijkstra sirasinda yazilsaydi yon, "hangi komsu once yerlesti"ye baglanirdi
  // ve esit maliyetli iki komsuda yandan gitmek asagi gitmeye tercih
  // edilebilirdi. Burada sira aciktir: `NEIGHBOR_OFFSETS` once nexusa dogru
  // bakar, dolayisiyla esitlikte dusman hedefe dogru yurur.
  for (let index = 0; index < size; index += 1) {
    if (!Number.isFinite(cost[index]) || cost[index] === 0) continue;
    const col = index % cols;
    const row = Math.floor(index / cols);

    let bestIndex = -1;
    let bestTotal = Number.POSITIVE_INFINITY;
    for (const offset of NEIGHBOR_OFFSETS) {
      const neighborCol = col + offset.col;
      const neighborRow = row + offset.row;
      if (!isInsideFlowField(field, neighborCol, neighborRow)) continue;

      const neighborIndex = getFlowFieldIndex(field, neighborCol, neighborRow);
      if (!Number.isFinite(cost[neighborIndex]) || !Number.isFinite(enterCost[neighborIndex])) continue;
      // Dongu olmasin diye komsu kesinlikle daha yakin olmali.
      if (cost[neighborIndex] >= cost[index]) continue;

      const total = enterCost[neighborIndex] + cost[neighborIndex];
      if (total < bestTotal) {
        bestTotal = total;
        bestIndex = neighborIndex;
      }
    }
    next[index] = bestIndex;
  }

  return field;
}
