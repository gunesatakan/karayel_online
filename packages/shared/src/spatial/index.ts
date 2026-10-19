export type SpatialPoint = { id: string; x: number; y: number };

/**
 * Hucre anahtari sayi: sutun ve satir tek bir kucuk tam sayida (yazi
 * anahtari her kurulumda, her sorguda ve her tasimada yeni bir dizgi
 * kuruyordu). Anahtar V8'in kucuk tam sayi (Smi) araliginda kaliyor: daha
 * buyuk bir anahtar her hesaplamada kutulanan bir cift sayi olur, Map
 * aramasi da yavaslardi. +/-1024 hucre (128'lik hucrede 131 bin birim)
 * butun haritalari kapsiyor; otesindeki konum kenar hucresine dusuyor,
 * sorgu ayni kirpmayla oraya da bakiyor, uzaklik suzgeci kesin kaliyor.
 */
const KEY_OFFSET = 1 << 10;
const KEY_SPAN = 1 << 11;

function clampIndex(index: number) {
  return index < -KEY_OFFSET ? -KEY_OFFSET : index >= KEY_OFFSET ? KEY_OFFSET - 1 : index;
}

export class SpatialGrid<T extends SpatialPoint> {
  private readonly cells = new Map<number, T[]>();

  constructor(readonly cellSize: number) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error("cellSize must be positive");
  }

  rebuild(items: Iterable<T>) {
    this.cells.clear();
    for (const item of items) this.insertAt(item, item.x, item.y);
  }

  /** Izgarayi bosaltir (`insertAt` ile yeniden doldurulacak). */
  clear() {
    this.cells.clear();
  }

  /**
   * Ogeyi verilen konumun hucresine ekler. Kurulumu kendi dongusunde yapan
   * cagiran konumu bir kez okuyup buraya veriyor (oge alanlari cok bicimli
   * kayitlarda pahali okunuyor).
   */
  insertAt(item: T, x: number, y: number) {
    const key = this.keyAt(x, y);
    const cell = this.cells.get(key);
    if (cell) cell.push(item);
    else this.cells.set(key, [item]);
  }

  /**
   * Izgara kurulduktan sonra yeri degisen ogeyi yeni hucresine tasir (tik
   * icinde itilen dusman: Ucube'nin Geri Itme'si, Kin dalgasi). Sonraki
   * sorgular onu yeni yerinde buluyor; sorgulara itmeyi karsilayacak bir
   * pay eklemek gerekmiyor (birkac itme ust uste de binebilir). Hucre
   * degismediyse (itmelerin cogu) hicbir sey yapilmiyor. Oge eski hucresinde
   * yoksa (izgaradan sonra eklenmis) dokunulmuyor. Tahsis yok: hucredeki
   * sira korunarak kaydiriliyor; yalnizca bos bir hucreye ilk tasima dizi
   * kuruyor.
   */
  relocate(item: T, fromX: number, fromY: number) {
    const fromCol = clampIndex(Math.floor(fromX / this.cellSize));
    const fromRow = clampIndex(Math.floor(fromY / this.cellSize));
    const toCol = clampIndex(Math.floor(item.x / this.cellSize));
    const toRow = clampIndex(Math.floor(item.y / this.cellSize));
    if (fromCol === toCol && fromRow === toRow) return;
    const cell = this.cells.get(this.key(fromCol, fromRow));
    if (!cell) return;
    const index = cell.indexOf(item);
    if (index < 0) return;
    for (let at = index + 1; at < cell.length; at += 1) cell[at - 1] = cell[at];
    cell.pop();
    const key = this.key(toCol, toRow);
    const target = this.cells.get(key);
    if (target) target.push(item);
    else this.cells.set(key, [item]);
  }

  queryCircle(x: number, y: number, radius: number): T[] {
    // Bos izgara (sahada dusman yok, hazirlik fazi): hucre taramasi hicbir
    // sey bulamaz; her hucre icin anahtar kurmaya gerek yok.
    if (this.cells.size === 0) return [];
    const safeRadius = Math.max(0, radius);
    const minCol = clampIndex(Math.floor((x - safeRadius) / this.cellSize));
    const maxCol = clampIndex(Math.floor((x + safeRadius) / this.cellSize));
    const minRow = clampIndex(Math.floor((y - safeRadius) / this.cellSize));
    const maxRow = clampIndex(Math.floor((y + safeRadius) / this.cellSize));
    const radiusSq = safeRadius * safeRadius;
    const results: T[] = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const cell = this.cells.get(this.key(col, row));
        if (cell === undefined) continue;
        for (let index = 0; index < cell.length; index += 1) {
          const item = cell[index];
          const dx = item.x - x;
          const dy = item.y - y;
          if (dx * dx + dy * dy <= radiusSq) results.push(item);
        }
      }
    }
    return results;
  }

  private keyAt(x: number, y: number) {
    return this.key(clampIndex(Math.floor(x / this.cellSize)), clampIndex(Math.floor(y / this.cellSize)));
  }

  private key(col: number, row: number) {
    return (col + KEY_OFFSET) * KEY_SPAN + (row + KEY_OFFSET);
  }
}
