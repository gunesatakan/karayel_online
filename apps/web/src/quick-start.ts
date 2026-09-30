import { parseQuickStartIntent, type QuickStartIntent } from "@karayel/shared";

/**
 * Kosu raporunun "Tekrar" ve "Sonraki aşama" dugmeleri sayfayi yeniden
 * yukluyor ve menuye bir not birakiyor; menu acilista notu okuyup siliyor ve
 * oyunu hemen baslatiyor.
 *
 * Phaser `scene.restart` bilerek kullanilmiyor: sahnenin durumu buyuk olcude
 * alan baslaticilarinda ve restart onlari yeniden calistirmiyor. Yeniden
 * yukleme her seyi sifirliyor ve menunun normal baslatma yolu kullaniliyor.
 *
 * sessionStorage: not yalnizca bu sekmede ve bu oturumda anlamli. Surumlu
 * anahtar; her okuma ve yazma try/catch icinde (depo kapali olabilir). Depo
 * yoksa dugme yine sayfayi yeniliyor ve menu normal aciliyor.
 */
const QUICK_START_STORAGE_KEY = "karayel_quick_start_v1";

export function saveQuickStartIntent(intent: QuickStartIntent) {
  try {
    window.sessionStorage.setItem(QUICK_START_STORAGE_KEY, JSON.stringify(intent));
    return true;
  } catch {
    // Yazilamadiysa yeniden yukleme menude biter; oyuncu bir dokunusla baslatir.
    return false;
  }
}

/**
 * Notu okur ve hemen siler: bozuk ya da eski not bir kez yok sayiliyor, bir
 * sonraki yenilemede oyunu tekrar tekrar baslatamiyor.
 */
export function takeQuickStartIntent(now = Date.now()): QuickStartIntent | undefined {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(QUICK_START_STORAGE_KEY);
    window.sessionStorage.removeItem(QUICK_START_STORAGE_KEY);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  try {
    return parseQuickStartIntent(JSON.parse(raw), now);
  } catch {
    return undefined;
  }
}
