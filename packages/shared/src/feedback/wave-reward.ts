import { FINAL_WAVE, getWaveCompletionGold } from "../balance/index.js";
import type { CardRarity } from "../cards/index.js";
import { enPlural, lt } from "../i18n/index.js";
import { FEEDBACK_KIND_RULES } from "./index.js";

/**
 * Dalga temizleme damgasi ve kart acilisi.
 *
 * Dalga sonu eskiden sessizdi: son dusman kayboluyor, iki saniye bos tahta,
 * sonra sabit "DALGA TAMAMLANDI" baslikli kart ekrani. Dalga bonusu kart
 * ekraninin hemen onunde sessizce yaziliyordu ve kartlarin nadirligi yalnizca
 * Envanter'de gorunuyordu -- nadir kart gelmesi kendi basina bir an degildi.
 *
 * Buradaki kurallar saf: saat ve snapshot disaridan geliyor, cizim istemcide
 * (damga: apps/web/src/game-control-ui.ts, kartlar: GameScene). Testler
 * damganin yalnizca gercek bir temizlenmede ciktigini ve satirlardaki
 * sayilarin sunucunun gercekten verdigiyle ayni oldugunu olcuyor.
 */

/**
 * Damganin ekranda kaldigi sure.
 *
 * Sunucu temizlenmeden kart ekranina kadar 2 sn bekliyor; istemci 500 ms
 * geriden oynattigi icin damganin gercek penceresi ~1.5 sn. Sure yonetmenin
 * etiket butcesindekiyle ayni ki butce ile ekran ayni anda bosalsin.
 */
export const WAVE_CLEAR_STAMP_MS = FEEDBACK_KIND_RULES.waveClear.visualMs;
/** Damga satirlarinin (dusman, altin, bonus) arka arkaya belirme araligi. */
export const WAVE_CLEAR_LINE_STAGGER_MS = 150;

/** Kartlarin dagitim araligi: ucuncu kart 160 ms sonra yola cikiyor. */
export const CARD_DEAL_STAGGER_MS = 80;
/** Tek kartin ters gelip donmesi. */
export const CARD_FLIP_MS = 340;
/**
 * Donusun yuzun gorundugu ani (CSS'teki %45 karesi): cevirme sesi burada.
 * Once calsa ses kartin sirtina, sonra calsa bos bir ana duserdi.
 */
export const CARD_FLIP_FACE_UP_RATIO = 0.45;
/**
 * Kart ancak dagitimi baslayali bu kadar olunca secilebiliyor.
 *
 * Kart ekrani dalga sonunda kendiliginden aciliyor; oyuncunun haritaya
 * yaptigi son dokunus ayni noktadaki karti "secmemeli". Hareket azaltmada da
 * gecerli: bu bir animasyon degil, yanlis dokunus korumasi.
 */
export const CARD_PICKABLE_AFTER_MS = 250;
/** Nadir kartin altin parlamasi, bir kez. */
export const CARD_RARE_SHIMMER_MS = 1200;
/** Secilen kartin damgasi; kule atimi ve toast ondan sonra geliyor. */
export const CARD_PICK_STAMP_MS = 150;

export type WaveClearObservation = {
  /** Snapshot'taki dalga; kurulumda siradaki dalga. */
  wave: number;
  enemiesLeft: number;
  setupPhase: boolean;
  /** Mac bitti (sonuc var): damga yok, sonuc ekrani konusuyor. */
  over: boolean;
  /** Takimin toplam oldurmesi (`team.kills`). */
  kills: number;
  /**
   * Yerel oyuncunun simdiye kadar kazandigi toplam altin: `gold + goldSpent`.
   *
   * Harcama ve satis bunu degistirmiyor (sunucu her harcamada `goldSpent`i
   * artiriyor, satista iade kadar geri aliyor); yalnizca gercek kazanc
   * artiriyor. Oyuncu kaydi yoksa alan yok.
   */
  earned?: number;
};

export type WaveClearSummary = {
  wave: number;
  finalWave: number;
  /** Bu dalgada takimin oldurdugu dusman; dalganin basi gorulmediyse yok. */
  kills?: number;
  /** Bu dalgada yerel oyuncunun kazandigi altin; bilinmiyorsa yok. */
  gold?: number;
  /** Sunucunun molanin sonunda herkese yazacagi dalga bonusu. */
  bonus: number;
};

/**
 * Dalganin temizlendigi an.
 *
 * Kural: ayni dalgada once savas icinde kalan dusman gorulmus, sonra kurulum
 * disinda sifira inmis. Ikisi birlikte sart -- oyuna molada katilan ya da
 * yeniden baglanan oyuncu ilk snapshot'ta "0 kaldi" goruyor ama o an onun
 * icin bir temizlenme degil.
 *
 * Sayilar dalganin basinda alinan tabandan: kurulumdaki son snapshot. Taban
 * yoksa (oyuna dalga ortasinda girildi, yaratici modda dalga degisti) satir
 * gosterilmiyor; yanlis bir sayi gostermektense hic gostermemek.
 *
 * Son dalgada damga yok: sunucu ayni molanin sonunda zaferi yaziyor ve sonuc
 * ekrani o ani anlatiyor.
 */
export class WaveClearWatch {
  private armedWave?: number;
  private stampedWave?: number;
  private baseline?: { wave: number; kills: number; earned?: number };

  observe(observation: WaveClearObservation): WaveClearSummary | undefined {
    const { wave } = observation;
    if (observation.over || !Number.isFinite(wave)) {
      this.armedWave = undefined;
      return undefined;
    }
    if (observation.setupPhase) {
      // Kurulum boyunca taban guncelleniyor: kurulumdaki beceri altini ya da
      // satin alim dalganin kazanci sayilmasin.
      this.baseline = { wave, kills: observation.kills, earned: observation.earned };
      this.armedWave = undefined;
      this.stampedWave = undefined;
      return undefined;
    }
    if (observation.enemiesLeft > 0) {
      this.armedWave = wave;
      return undefined;
    }
    // Molada bir dusman geri gelip yeniden olurse (Melis'in dondurdugu) ikinci
    // damga yok: dalga bir kez temizleniyor.
    if (this.armedWave !== wave || this.stampedWave === wave) {
      return undefined;
    }
    this.armedWave = undefined;
    this.stampedWave = wave;
    if (wave >= FINAL_WAVE) {
      return undefined;
    }

    const base = this.baseline?.wave === wave ? this.baseline : undefined;
    const earnedNow = observation.earned;
    const earnedBase = base?.earned;
    return {
      wave,
      finalWave: FINAL_WAVE,
      kills: base ? Math.max(0, observation.kills - base.kills) : undefined,
      gold: earnedNow !== undefined && earnedBase !== undefined
        ? Math.max(0, Math.floor(earnedNow) - Math.floor(earnedBase))
        : undefined,
      bonus: getWaveCompletionGold(wave)
    };
  }

  /** Yeni mac ya da oda: eski dalganin tabani yeni oyuna sizmasin. */
  reset() {
    this.armedWave = undefined;
    this.stampedWave = undefined;
    this.baseline = undefined;
  }
}

/** `badge`: dalga ortasinda acilip kart perdesine sigmayan nisan bildirimi (`BadgeNoticeQueue`). */
export type WaveClearStampLine = { kind: "kills" | "gold" | "bonus" | "badge"; text: string };

export type WaveClearStampText = { title: string; lines: WaveClearStampLine[] };

/**
 * Damganin metni.
 *
 * Sifir altin satiri yazilmiyor (bilgi tasimiyor); sifir oldurme yaziliyor,
 * cunku tum dalganin sizdigi bir temizlenme de dogru bir haber. Bonus her
 * dalgada sifirdan buyuk. Satirin turu renk icin: altin HUD'daki altin
 * rengiyle ayni olmali ki "bu senin altinin" diye okunsun.
 */
export function getWaveClearStampText(summary: WaveClearSummary): WaveClearStampText {
  const lines: WaveClearStampLine[] = [];
  if (summary.kills !== undefined) {
    lines.push({ kind: "kills", text: lt(`${summary.kills} düşman`, `${summary.kills} ${enPlural(summary.kills, "enemy", "enemies")}`) });
  }
  if (summary.gold !== undefined && summary.gold > 0) {
    lines.push({ kind: "gold", text: `+${summary.gold} ◆` });
  }
  if (summary.bonus > 0) {
    lines.push({ kind: "bonus", text: lt(`+${summary.bonus} dalga bonusu`, `+${summary.bonus} wave bonus`) });
  }
  return { title: lt(`DALGA ${summary.wave}/${summary.finalWave} TEMİZLENDİ`, `WAVE ${summary.wave}/${summary.finalWave} CLEARED`), lines };
}

/**
 * Kart ekraninin ait oldugu dalga.
 *
 * Sunucu kartlari temizlenen dalganin sonunda, dalga numarasini artirdigi
 * adimda gonderiyor. Istemcinin elindeki snapshot o an ya henuz molada
 * (dalga = temizlenen) ya da kurulumda (dalga = siradaki). Yeniden
 * baglanmada gelen kartlar da kurulumda oldugu icin ayni kural tutuyor.
 */
export function getCardDraftWave(snapshot: { wave: number; setupPhase?: boolean } | undefined) {
  if (!snapshot || !Number.isFinite(snapshot.wave)) {
    return undefined;
  }
  const wave = snapshot.setupPhase ? snapshot.wave - 1 : snapshot.wave;
  return wave >= 1 ? wave : undefined;
}

export function getCardDraftTitle(wave: number | undefined) {
  return wave !== undefined ? lt(`DALGA ${wave} ÖDÜLÜ`, `WAVE ${wave} REWARD`) : lt("DALGA ÖDÜLÜ", "WAVE REWARD");
}

export type CardDealTiming = {
  /** Kartin dagitiminin baslamasi (ms). */
  delayMs: number;
  /** Yuzun gorundugu an: cevirme sesi. */
  faceUpMs: number;
  /** Kartin secilebildigi an. */
  pickableAtMs: number;
};

/**
 * Tek kartin dagitim zamani.
 *
 * Hareket azaltmada dagitim ve donus yok: kartlar hemen yuzu acik; yalnizca
 * yanlis dokunus korumasi kaliyor.
 */
export function getCardDealTiming(index: number, reducedMotion: boolean): CardDealTiming {
  if (reducedMotion) {
    return { delayMs: 0, faceUpMs: 0, pickableAtMs: CARD_PICKABLE_AFTER_MS };
  }
  const delayMs = Math.max(0, Math.floor(index)) * CARD_DEAL_STAGGER_MS;
  return {
    delayMs,
    faceUpMs: delayMs + Math.round(CARD_FLIP_MS * CARD_FLIP_FACE_UP_RATIO),
    pickableAtMs: delayMs + CARD_PICKABLE_AFTER_MS
  };
}

export type CardRevealCue = { atMs: number; kind: "cardFlip" | "cardRare"; index: number };

/**
 * Kart acilisinin sesleri.
 *
 * Her kart yuzu gorundugunde kisa bir cevirme sesi. Elde nadir kart varsa o
 * kartin yuzu gorundugunde kendi tinisi, elde kac nadir olursa olsun bir kez:
 * nadir gelmesi bir odul, iki tini ayni haberi iki kez verirdi. Hareket
 * azaltmada donus yok, tek cevirme sesi ve (varsa) tini hemen.
 *
 * Epik kart da ayni tiniyi aliyor -- ayri bir ses yok, tini nadirligin
 * habercisi -- ve elde ikisi birden varsa tini epik kartin yuzunde.
 */
export function getCardRevealCues(rarities: readonly CardRarity[], reducedMotion: boolean): CardRevealCue[] {
  const cues: CardRevealCue[] = [];
  const epicIndex = rarities.indexOf("epic");
  const rareIndex = epicIndex >= 0 ? epicIndex : rarities.indexOf("rare");
  if (reducedMotion) {
    if (rarities.length > 0) cues.push({ atMs: 0, kind: "cardFlip", index: 0 });
    if (rareIndex >= 0) cues.push({ atMs: 0, kind: "cardRare", index: rareIndex });
    return cues;
  }
  rarities.forEach((_, index) => {
    cues.push({ atMs: getCardDealTiming(index, false).faceUpMs, kind: "cardFlip", index });
  });
  if (rareIndex >= 0) {
    cues.push({ atMs: getCardDealTiming(rareIndex, false).faceUpMs, kind: "cardRare", index: rareIndex });
  }
  return cues.sort((a, b) => a.atMs - b.atMs);
}
