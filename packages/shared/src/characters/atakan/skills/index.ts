import { makeSkills } from "../../common/factory.js";
import type { EnemyType } from "../../../index.js";
import { lt } from "../../../i18n/index.js";

export const atakanSkills = makeSkills("warrior", [
  ["Yönlendirme", "Basılı tutup sürükleyerek haritada bir alan işaretler. 3 saniye boyunca mermi vuruşlu kuleler menzil sınırını yok sayıp o alandaki düşmanlara ateş eder ve alandaki düşmanlar %30 fazla hasar alır. Hattın uzağında açılan sızıntıyı kapatmak için kullanılır.", 16000],
  ["Refactor", "Seçili kuleyi altın kaybetmeden başka bir uygun kareye taşır. Seviyesi ve birikmiş bonusları korunur; yanlış yerleşimi satıp yeniden kurmak yerine düzeltmeyi sağlar.", 24000],
  ["Execute", "Seçtiğin tek bir düşmanı anında infaz eder. Ezicilere, şampiyonlara ve kule avcılarına etkisizdir; etkisiz ya da geçersiz hedefte bekleme süresi harcanmaz.", 32000]
]);

/**
 * Execute: AttackLord'un ucuncu becerisi (yuva 2). Oyuncu beceriye basip
 * haritada bir dusmana dokunuyor; sunucu o dusmani normal oldurme yolundan
 * (`damageEnemy` -> `finishEnemyKill`) infaz ediyor. Altin, XP, seri, asist
 * ve sampiyon kurallari siradan bir oldurmeyle ayni.
 */
export const ATAKAN_EXECUTE_SLOT = 2;
/** Oldurmenin kaynak kimligi: tasan hasar primi bunu yapay oldurme sayiyor. */
export const ATAKAN_EXECUTE_SOURCE_ID = "warrior-skill-execute";

/**
 * `skill:rejected` gerekcesi. "immune": hedef ezici (brute) ya da sampiyon;
 * istemci "Etkisiz" yaziyor. "invalid": hedef yok, olmus, hukmedilmis,
 * olumsuz ya da cevrilmis.
 */
export type ExecuteRejectReason = "immune" | "invalid";

/** `skill:rejected`: beceri reddedildi, bekleme suresi harcanmadi. Yalnizca atana. */
export type SkillRejectedMessage = { slot: number; reason: ExecuteRejectReason };

/** `skill:execute`: infaz gerceklesti. Herkese; atan kendi gorselini tam goruyor. */
export type SkillExecuteMessage = { casterId: string; enemyId: string; x: number; y: number };

/**
 * Infaza bagisik mi: "tank" sinifi yalnizca ezici (brute) dusman; sampiyon
 * turu ne olursa olsun bagisik; kule avcisi (sampiyon canli ozel dusman) da
 * bagisik. Kusatma, piyade, kosucu, nisanci ve ucan dusmanlar infaz
 * edilebilir. Sunucu ve istemci ayni kurali okuyor.
 */
export function isExecuteImmune(enemy: { type: EnemyType; champion?: unknown; special?: string }) {
  return enemy.type === "brute" || Boolean(enemy.champion) || enemy.special === "hunter";
}

/**
 * Takimin tarafindaki dusman: hukmedilmis (Zorba), olumsuz ya da cevrilmis.
 * Sunucu bunlari "invalid" ile reddediyor; istemci dokunusta hic secmiyor,
 * cunku asil hedefle temas halinde duruyorlar ve dokunusu yutuyorlardi.
 */
export function isExecuteTeamSide(enemy: { isDominated?: boolean; isUndead?: boolean; isWhisperTurned?: boolean }) {
  return Boolean(enemy.isDominated || enemy.isUndead || enemy.isWhisperTurned);
}

export type ExecuteTapCandidate = {
  id: string;
  x: number;
  y: number;
  /** Ekrandaki boy (dunya px); dokunus yaricapi bundan. */
  size: number;
  type?: EnemyType;
  champion: boolean;
  teamSide: boolean;
  /** Ozel dusman turu ("hunter" infaza bagisik). */
  special?: string;
};

/**
 * Execute hedeflemesinde dokunulan dusman: dokunusa en yakin, govdenin biraz
 * disi da sayiliyor (yaricap `max(minRadius, size * 0.75)`). Takimin
 * tarafindaki dusmanlar atlaniyor; bagisik (ezici, sampiyon, kule avcisi) olan seciliyor ki
 * oyuncu "Etkisiz" gorsun. Bos zeminde undefined.
 */
export function pickExecuteTapTarget<T extends ExecuteTapCandidate>(candidates: Iterable<T>, x: number, y: number, minRadius: number): T | undefined {
  let best: T | undefined;
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.teamSide) continue;
    const radius = Math.max(minRadius, candidate.size * 0.75);
    const distanceSq = (candidate.x - x) ** 2 + (candidate.y - y) ** 2;
    if (distanceSq > radius * radius || distanceSq >= bestDistanceSq) continue;
    best = candidate;
    bestDistanceSq = distanceSq;
  }
  return best;
}

/** Red gerekcesinin oyuncuya gorunen metni. */
export function getExecuteRejectText(reason: ExecuteRejectReason) {
  return reason === "immune" ? lt("Etkisiz", "Immune") : lt("Hedef geçersiz", "Invalid target");
}
