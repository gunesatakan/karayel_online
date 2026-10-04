/**
 * Efektlerin ayrinti seviyesi (LOD): yuk altinda neyin once dusecegi.
 *
 * Sira sabit ve kural: once kivilcim ve zerreler, sonra haleler, en son
 * iz uzunlugu. Renk ve siluet hicbir seviyede dusmuyor -- kademeyi onlar
 * tasiyor; yuk altinda bile oyuncu seviye 10 kulesini seviye 1'den ayirt
 * edebilmeli.
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
export const VFX_LOD_MAX = 3;

export class VfxLod {
  level = 0;
  private vfxEma = 0;
  private frameEma = 16.7;
  /** Cihazin gozlenen yenileme araligi: en kisa kare, yavasca gevseyen. */
  private refreshMs?: number;
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
    // 4 ms'nin alti zamanlayici gurultusu; en kisa aralik hizla iniyor,
    // cihaz kipi degisirse (dusuk guc acildi) yavasca yukseliyor.
    if (frame >= 4) {
      if (this.refreshMs === undefined || frame < this.refreshMs) this.refreshMs = frame;
      else this.refreshMs += (frame - this.refreshMs) * 0.002;
    }
    const refresh = this.refreshMs ?? 16.7;
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

  /** Galeri ve olcum icin seviyeyi sabitle; `undefined` otomatige doner. */
  force(level: number | undefined) {
    this.forced = level === undefined ? undefined : Math.max(0, Math.min(VFX_LOD_MAX, Math.round(level)));
    if (this.forced !== undefined) this.level = this.forced;
  }

  /** Kivilcim ve zerreler (ilk dusen). */
  get sparks() {
    return this.level < 1;
  }

  /** Haleler ve kosan parlamalar. */
  get corona() {
    return this.level < 2;
  }

  /**
   * Ayni anda cizilen kademe 3 imza carpmasi siniri; ikinci vurusun ince
   * halkasi da 2. seviyede dusuyor (parlama dokusu kaliyor).
   */
  get signatureCap() {
    return this.level >= 3 ? 2 : this.level >= 2 ? 4 : Number.POSITIVE_INFINITY;
  }

  get secondBeatRing() {
    return this.level < 2;
  }

  /** Iz uzunlugunun carpani (en son dusen). */
  get trailScale() {
    return this.level >= 3 ? 0.5 : 1;
  }

  get smoothedVfxMs() {
    return this.vfxEma;
  }

  get smoothedFrameMs() {
    return this.frameEma;
  }
}
