/**
 * Bounty Board Arcade koprusu (`@bountyboard/arcade-sdk`).
 *
 * Bounty Board oyunu saydam olmayan kokenli (opaque origin) bir cercevede
 * calistiriyor: orada `localStorage`, `sessionStorage`, IndexedDB ve cerezler
 * bos degil, erisildiginde hata firlatiyor. Oyunun butun ilerlemesi (asamalar,
 * operator ustaligi, nisanlar, rekorlar, kart arsivi) `localStorage`da oldugu
 * icin hicbir sey kaydedilmiyor, operatorlerin ve asamalarin cogu kilitli
 * kaliyordu. SDK'nin depolama katmani (`storage.install`) firlatan
 * `localStorage`in yerine oyuncunun Bounty Board bulut kaydina yazan bir
 * kopya koyuyor; oyunun depo kodu degismiyor.
 *
 * Kurallar:
 * - SDK hicbir zaman yuk tasimiyor. Her cagri `try/catch` icinde; barindirici
 *   yokken (Vercel, itch.io, gelistirme) oyun aynen calisiyor. Gercek depolama
 *   calisan yerde katman hicbir seye dokunmuyor (`native`).
 * - Katman, depolamaya dokunan ilk koddan once kuruluyor: bu modul `boot.ts`in
 *   ilk ice aktarimi ve kurulum modul yuklenirken yapiliyor.
 * - Acilis bulut okumasini bekliyor (yoksa ilk karede ilerleme bos okunur),
 *   ama en fazla `ARCADE_STORAGE_WAIT_MS`: barindirici cevap vermezse oyun yine
 *   aciliyor.
 * - Giris yapmamis oyuncuda katman bellek kipinde: oturum boyunca calisiyor,
 *   kalici degil. Uyari gosterilmiyor (sahibin karari).
 * - Odullu reklam kapali: reklam betigi hic yuklenmiyor.
 *
 * Barindiriciya gidenler: yasam dongusu sinyalleri, kosu sonu skoru ve (giris
 * yapmis oyuncuda) `localStorage` icerigi. Kaynak kod ya da sunucu verisi yok.
 *
 * Bu modul SDK disinda hicbir sey ice aktarmiyor: `boot.ts` onu oyunun geri
 * kalanindan once yukluyor ve giris parcasi kucuk kalmali (skor hesabi bu
 * yuzden `arcade-score.ts`te).
 */
import { BBArcade } from "@bountyboard/arcade-sdk";

/** Koprunun kullandigi SDK yuzeyi; testler sahtesini veriyor. */
export type ArcadeHost = {
  init(options?: { rewardedAds?: { enabled?: boolean } }): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  gameOver(score: number): void;
  storage: {
    install(): string;
    ready(): Promise<string>;
    flush(): Promise<void>;
  };
};

/** Bulut okumasi icin acilisin bekledigi en uzun sure (ms). */
export const ARCADE_STORAGE_WAIT_MS = 8000;

export function createArcadeBridge(host: ArcadeHost) {
  let loadingReported = false;
  let playing = false;
  let runOpen = false;
  const safely = (call: () => unknown) => {
    try {
      const result = call();
      // Reddedilen soz (misafir, barindirici yok, ag) oyunu ilgilendirmiyor.
      if (result && typeof (result as Promise<unknown>).then === "function") (result as Promise<unknown>).then(undefined, () => undefined);
    } catch {
      // SDK yuk tasimiyor.
    }
  };

  return {
    /** Depolama katmanini kurar ve el sikismayi baslatir; beklemez. */
    start() {
      safely(() => host.storage.install());
      safely(() => host.init({ rewardedAds: { enabled: false } }));
    },

    /**
     * Bulut okumasi indi (ya da gerek yok): depolama kipiyle cozulur. Hicbir
     * zaman reddetmez; sure dolarsa `"timeout"`.
     */
    whenStorageReady(timeoutMs = ARCADE_STORAGE_WAIT_MS): Promise<string> {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (mode: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(mode);
        };
        const timer = setTimeout(() => finish("timeout"), timeoutMs);
        try {
          host.storage.ready().then((mode) => finish(mode), () => finish("error"));
        } catch {
          finish("error");
        }
      });
    },

    /** Ilk oynanabilir ekran (menu) hazir; bir kez. */
    loadingFinished() {
      if (loadingReported) return;
      loadingReported = true;
      safely(() => host.gameLoadingFinished());
    },

    /** Canli mac basladi. Ayni kosuda yinelenen cagri yok sayilir. */
    gameplayStart() {
      if (playing) return;
      playing = true;
      runOpen = true;
      safely(() => host.gameplayStart());
    },

    /** Mac durdu: sonuc ekrani ya da menuye donus. */
    gameplayStop() {
      if (!playing) return;
      playing = false;
      safely(() => host.gameplayStop());
    },

    /**
     * Kosu bitti: oynanis durur ve skor bir kez gider. Canli baslamamis bir
     * kosu (mac bittikten sonra katilan) ya da ayni kosunun ikinci sonucu skor
     * yollamaz.
     */
    gameOver(score: number) {
      if (!runOpen) return;
      runOpen = false;
      if (playing) {
        playing = false;
        safely(() => host.gameplayStop());
      }
      const value = Number.isFinite(score) ? Math.max(0, Math.trunc(score)) : 0;
      safely(() => host.gameOver(value));
    },

    /** Bekleyen kaydi hemen yollar (kosu sonu); katman zaten gecikmeli de yaziyor. */
    flushStorage() {
      safely(() => host.storage.flush());
    }
  };
}

export const arcade = createArcadeBridge(BBArcade as ArcadeHost);

// Depolamaya dokunan ilk koddan once: `boot.ts` bu modulu ilk ice aktariyor.
arcade.start();
