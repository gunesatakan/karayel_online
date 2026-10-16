/**
 * Efektlerin ayrinti seviyesi (LOD): yuk altinda neyin once dusecegi.
 *
 * Sira sabit ve kural (agir, sert dil): once kivilcimlar (ve carpmanin
 * metal kirintilari), sonra duman (ve ADD isi parlamalari), sonra yer
 * izleri (yanik, sivi lekesi), en son iz uzunlugu ve -- ayni son basamakta --
 * bilgi isaretlerinin sikismasi (kertikler tek seride). Renk ve siluet hicbir
 * seviyede dusmuyor -- kademeyi onlar tasiyor (cekirdegin sicakligi ve
 * govdenin agirligi); yuk altinda bile oyuncu seviye 10 kulesini seviye
 * 1'den ayirt edebilmeli.
 *
 * Olcu iki tane: efektlerin bu karedeki CPU suresi (butce 3 ms, orta sinif
 * Android'de 20 kademe-3 kule ateslerken) ve kare araligi (cihazin kendi
 * yenileme araliginin 1.25 katinin ustu).
 * Ikisi de ustel ortalamayla yumusatiliyor; tek bir takilma seviyeyi
 * dusurmuyor. Yukselmek hizli (yarim saniyelik asim), geri donmek yavas
 * (iki saniyelik rahatlik): seviye her karede inip cikmasin.
 *
 * Saat disaridan veriliyor: test ve galeri ayni kurali calistiriyor.
 */
export const VFX_BUDGET_MS = 3;
/**
 * Kare araligi esigi, cihazin kendi yenileme araliginin kati.
 *
 * Sabit 20 ms esik 30 Hz'e kilitli tarayicida (iOS dusuk guc kipi) her kareyi
 * "yavas" sayiyor ve LOD'u bütün mac 3'te tutuyordu. Olcu artik cihazin
 * gozlenen en kisa araligina gore: 60 Hz'de ~20.8 ms, 30 Hz'de ~41.7 ms.
 */
export const VFX_SLOW_FRAME_RATIO = 1.25;
/** Rahatlama esigi: yavas esiginin altinda bir tampon (histerezis). */
export const VFX_CALM_FRAME_RATIO = 1.1;
export const VFX_LOD_RAISE_AFTER_MS = 500;
export const VFX_LOD_LOWER_AFTER_MS = 2000;
/** Dort basamak: 1 kivilcim, 2 duman, 3 yer izi, 4 iz uzunlugu. */
export const VFX_LOD_MAX = 4;
/** Yenileme tahmininin penceresi (kare) ve kac karede bir yenilendigi. */
export const VFX_REFRESH_WINDOW = 120;
const VFX_REFRESH_RECALC_EVERY = 30;
/** Pencerenin bu yuzdeligi yenileme araligi sayiliyor. */
const VFX_REFRESH_PERCENTILE = 0.25;
/** 144 Hz'den kisa aralik zamanlayici gurultusu: tahmine girmiyor. */
const VFX_REFRESH_FLOOR_MS = 1000 / 144;
/**
 * Hedef hicbir zaman 60 FPS'ten hizli degil: 90/120 Hz ekranda 60 FPS iyi
 * bir kare hizi, efektleri kisip 120'ye zorlamak gereksiz.
 */
const VFX_TARGET_FRAME_MIN_MS = 1000 / 60;
/** Tahmin asagi hemen iniyor, yukari her yenilemede bu oranla (~10 sn). */
const VFX_REFRESH_RELAX = 0.05;

export class VfxLod {
  level = 0;
  private vfxEma = 0;
  private frameEma = 16.7;
  /**
   * Cihazin gozlenen yenileme araligi: son karelerin alt ceyregi.
   *
   * Eskiden gorulen en kisa kareydi. Degisken ya da yuksek yenilemeli
   * ekranda (90/120 Hz Android) arada gelen tek bir kisa kare tahmini 8-11
   * ms'ye indiriyordu; sonra duzgun 60 FPS'lik her kare "yavas" sayiliyor ve
   * LOD bütün mac 4'te kaliyordu (kayitta FPS 58, kare p95 17 ms, LOD 4).
   * Yuzdelik tek bir kisa kareye bakmiyor.
   */
  private refreshMs?: number;
  private readonly recentFrames: number[] = [];
  private recentCursor = 0;
  private framesSinceRecalc = 0;
  private overSince?: number;
  private calmSince?: number;
  private forced?: number;

  /** Karenin olcusu: efekt suresi ve kare araligi (ms). */
  note(vfxMs: number, frameMs: number, now: number) {
    if (this.forced !== undefined) return this.level;
    this.vfxEma += (vfxMs - this.vfxEma) * 0.1;
    // Sekme arka plana gidip donunce gelen dev aralik olcu degil.
    const frame = Math.min(100, Math.max(0, frameMs));
    this.frameEma += (frame - this.frameEma) * 0.1;
    // Kayan pencere; cihaz kipi degisirse (dusuk guc acildi) tahmin pencere
    // dolunca yeni araliga oturuyor.
    if (frame >= VFX_REFRESH_FLOOR_MS) this.noteRefreshSample(frame);
    const refresh = Math.max(VFX_TARGET_FRAME_MIN_MS, this.refreshMs ?? 16.7);
    const over = this.vfxEma > VFX_BUDGET_MS || this.frameEma > refresh * VFX_SLOW_FRAME_RATIO;
    const calm = this.vfxEma < VFX_BUDGET_MS * 0.6 && this.frameEma < refresh * VFX_CALM_FRAME_RATIO;
    if (over) {
      this.calmSince = undefined;
      this.overSince ??= now;
      if (now - this.overSince >= VFX_LOD_RAISE_AFTER_MS && this.level < VFX_LOD_MAX) {
        this.level += 1;
        this.overSince = now;
      }
    } else {
      this.overSince = undefined;
      if (calm) {
        this.calmSince ??= now;
        if (now - this.calmSince >= VFX_LOD_LOWER_AFTER_MS && this.level > 0) {
          this.level -= 1;
          this.calmSince = now;
        }
      } else {
        this.calmSince = undefined;
      }
    }
    return this.level;
  }

  private noteRefreshSample(frame: number) {
    if (this.recentFrames.length < VFX_REFRESH_WINDOW) this.recentFrames.push(frame);
    else this.recentFrames[this.recentCursor] = frame;
    this.recentCursor = (this.recentCursor + 1) % VFX_REFRESH_WINDOW;
    this.framesSinceRecalc += 1;
    // Ilk tahmin hemen, sonrasi seyrek: 120 sayiyi her karede siralamaya gerek yok.
    if (this.refreshMs !== undefined && this.framesSinceRecalc < VFX_REFRESH_RECALC_EVERY) return;
    this.framesSinceRecalc = 0;
    const sorted = [...this.recentFrames].sort((a, b) => a - b);
    const estimate = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * VFX_REFRESH_PERCENTILE))];
    // Uzun suren gercek yavaslama hemen "normal" sayilmasin: tahmin asagi
    // hemen, yukari yavas (cihaz kipi degisirse yine de yeni araliga oturur).
    if (this.refreshMs === undefined || estimate < this.refreshMs) this.refreshMs = estimate;
    else this.refreshMs += (estimate - this.refreshMs) * VFX_REFRESH_RELAX;
  }

  /** Galeri ve olcum icin seviyeyi sabitle; `undefined` otomatige doner. */
  force(level: number | undefined) {
    this.forced = level === undefined ? undefined : Math.max(0, Math.min(VFX_LOD_MAX, Math.round(level)));
    if (this.forced !== undefined) this.level = this.forced;
  }

  /** Balistik kivilcimlar, korlar ve carpmanin metal kirintilari (ilk dusen). */
  get sparks() {
    return this.level < 1;
  }

  /** Duman ve ADD isi parlamalari (ikinci). */
  get smoke() {
    return this.level < 2;
  }


  /** Yer izleri: yanik, sivi lekesi (ucuncu). */
  get decals() {
    return this.level < 3;
  }

  /**
   * Ayni karede cizilen agir sok halkasi siniri (kademe 3, agir vurus): 2'de
   * dort, 3 ve ustunde iki. Halkanin kendisi tek ince cizgi.
   */
  get shockRingCap() {
    return this.level >= 3 ? 2 : this.level >= 2 ? 4 : Number.POSITIVE_INFINITY;
  }

  /** Iz uzunlugunun carpani (dorduncu basamak). */
  get trailScale() {
    return this.level >= 4 ? 0.5 : 1;
  }

  /**
   * Bilgi isaretlerinin sikismasi (Takipci kertikleri ve Kin damgasi tek
   * seride, Kin yayi iki parcaya): en son, iz kisalmasiyla ayni basamakta
   * (VFX_LOD_MAX). Sayi ve renk yine okunuyor.
   */
  get compactMarks() {
    return this.level >= VFX_LOD_MAX;
  }

  get smoothedVfxMs() {
    return this.vfxEma;
  }

  get smoothedFrameMs() {
    return this.frameEma;
  }
}
