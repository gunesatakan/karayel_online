/**
 * Zeynep atislarinin paylasilan geometrisi: sunucunun karari ve istemcinin
 * imzasi ayni kuraldan.
 *
 * Istemci Zeynep'in mekaniklerini (delen mermi, Abarti gecisi, Kin dalgasinin
 * bandi, Gosteri hattinin vurdugu dusmanlar) ekranda gostermek icin sunucunun
 * hesabini yeniden yapiyor; kural iki yerde yazilirsa biri digerinden kayar.
 * Burada tek yerde: sunucu da bunlari cagiriyor.
 */

/**
 * Dusman tipinin carpisma yaricapi (dunya birimi, harita olceginden once).
 *
 * Sunucunun carpisma, isin ve dalga hesabi bunu kullaniyor; istemci Gosteri
 * hattinin ve Kin dalgasinin kimi vurdugunu ayni yaricapla seciyor.
 */
export function getEnemyTypeCollisionRadius(type: string | undefined) {
  return type === "brute" ? 19 : type === "runner" ? 13 : 15;
}

/**
 * Kin dalgasinin bandi (dunya birimi, olcekten once): on kenarin arkasinda
 * dusmana degdigi derinlik. Sunucu `scaleWorldDistance` ile olcekliyor.
 */
export const KIN_WAVE_BAND_DEPTH = 30;

/**
 * Abarti'nin zirh kirma ekledigi mermiler: fiziksel delici Zeynep atislari
 * (Hiza, Taht'in cift ve Kin mizragi, kopyalanan Hiza). Isinlar (Gosteri,
 * yanik, ayna, Kin dalgasi) gecisi renklerinin koyulasmasiyla tasiyor.
 */
export function isAbartiArmorBreakProjectile(definitionId: string | undefined) {
  return definitionId === "zeynep-1" || definitionId === "zeynep-3" || definitionId === "zeynep-3-kin-projectile";
}

/**
 * Abarti'nin Gosteri hattina ve Kin dalgasina kattigi menzil carpani:
 * seviye 1'de 1.1, 10'da 2.0 (dogrusal). Kin dalgasi yavaslatmanin gucunu
 * bu uzatilmis menzile gore hesapliyor; istemcinin damgasi da.
 */
export function getAbartiShowcaseRangeMultiplier(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  return 1.1 + ((clampedLevel - 1) / 9) * 0.9;
}

export type AbartiRailRect = { left: number; right: number; top: number; bottom: number };

/**
 * Abarti'nin gecis dikdortgeni: kenar boyunca iki kare, kalinlik karenin
 * %16'si (en az 5 birim). Atis yolu bu dikdortgeni keserse Abarti uygulanir;
 * istemcinin gecis nabzi da ayni dikdortgende.
 */
export function getAbartiRailRect(x: number, y: number, orientation: "horizontal" | "vertical" | undefined, gridSize: number): AbartiRailRect {
  const thickness = Math.max(5, gridSize * 0.16);
  if (orientation === "vertical") {
    return { left: x - thickness / 2, right: x + thickness / 2, top: y - gridSize, bottom: y + gridSize };
  }
  return { left: x - gridSize, right: x + gridSize, top: y - thickness / 2, bottom: y + thickness / 2 };
}

/**
 * Dogru parcasinin dikdortgene ilk girdigi nokta (parca boyunca 0..1); kesmiyorsa
 * `undefined`. Liang-Barsky: bolme yok denecek kadar ucuz, nesne uretmiyor.
 * Baslangic dikdortgenin icindeyse 0.
 */
export function getSegmentRectEntry(x1: number, y1: number, x2: number, y2: number, rect: AbartiRailRect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const span = SPAN;
  span.enter = 0;
  span.exit = 1;
  if (!clipEdge(-dx, x1 - rect.left, span)) return undefined;
  if (!clipEdge(dx, rect.right - x1, span)) return undefined;
  if (!clipEdge(-dy, y1 - rect.top, span)) return undefined;
  if (!clipEdge(dy, rect.bottom - y1, span)) return undefined;
  return span.enter <= span.exit ? span.enter : undefined;
}

/** Kesme araligi: cagri basina nesne yok (tek is parcacigi, yeniden giris yok). */
const SPAN = { enter: 0, exit: 1 };

function clipEdge(p: number, q: number, span: { enter: number; exit: number }) {
  if (p === 0) return q >= 0;
  const t = q / p;
  if (p < 0) {
    if (t > span.exit) return false;
    if (t > span.enter) span.enter = t;
  } else {
    if (t < span.enter) return false;
    if (t < span.exit) span.exit = t;
  }
  return true;
}
