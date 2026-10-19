/**
 * Zeynep atislarinin paylasilan geometrisi: sunucunun karari ve istemcinin
 * imzasi ayni kuraldan.
 *
 * Istemci Zeynep'in mekaniklerini (delen mermi, Abarti gecisi, Kin dalgasinin
 * bandi, Gosteri hattinin vurdugu dusmanlar) ekranda gostermek icin sunucunun
 * hesabini yeniden yapiyor; kural iki yerde yazilirsa biri digerinden kayar.
 * Burada tek yerde: sunucu da bunlari cagiriyor.
 */

// Dusmanin isabet govdesi `enemy-body` modulunde (gorunen govdenin yonlu
// dis bukey cokgeni): sunucunun carpisma, isin ve dalga hesabiyla
// istemcinin Gosteri / Kin secimi ayni fonksiyonlardan; Kin dalgasinin yayi
// ve Kin gosterisinin ucgeni de (`writeKinWaveSector`, `writeKinShowcaseTriangle`).

/**
 * Kin dalgasinin cizgileri (combat-vfx `drawPressureWave`; dunya birimi,
 * sahnenin mermi olcegiyle `getProjectileSceneScale`): on kenarda
 * `front + frontPerTier x kademe` kalinliginda yay, arkasinda `step` arayla
 * `trailing` dolu yay, her biri `stroke` kalinliginda. Arkadaki kirik
 * kiymiklar (seyrek, sonen, 0,8 kalinlik) ve yaylarin dalgalanmasi (+/-0,4
 * ve +/-1,2, istemcinin saatiyle; ortalamasi sifir) efekt.
 */
export const KIN_WAVE_STROKES = { front: 1.2, frontPerTier: 0.4, trailing: 3, step: 2.5, stroke: 2.5 } as const;

/** On kenarin cizgisinin kalinligi (olcekten once). */
export function getKinWaveFrontStroke(tier: number) {
  return KIN_WAVE_STROKES.front + KIN_WAVE_STROKES.frontPerTier * tier;
}

/**
 * Sahibin karari (2026-10): dalga cizilen derinligiyle vuruyor (eskiden 30
 * birimlik bir oyun bandi; cizilen dolu yaylar ~10 birim). Bant on kenarin
 * gerisinde en arkadaki dolu yayin arka yanina kadar...
 */
export function getKinWaveBandBehind(scale: number) {
  return (KIN_WAVE_STROKES.trailing * KIN_WAVE_STROKES.step + KIN_WAVE_STROKES.stroke / 2) * scale;
}

/** ...onunde on cizginin yarisi kadar (cizilen dis kenar). */
export function getKinWaveBandAhead(tier: number, scale: number) {
  return (getKinWaveFrontStroke(tier) / 2) * scale;
}

/**
 * Dalganin menzile varinca ne kadar daha (dunya birimi, olcekten once;
 * sunucu `scaleWorldDistance` ile) yasadigi: cizilen dalga bu yol boyunca
 * menzilde duruyor, sonra sonuyor. Vurusun derinligi degil (bkz.
 * `getKinWaveBandBehind`); eski bant derinliginin suresi korunuyor.
 */
export const KIN_WAVE_LINGER_DISTANCE = 30;

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
