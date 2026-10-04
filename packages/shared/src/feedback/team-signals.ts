/**
 * Takimi etkileyen sessiz kararlarin sinyali.
 *
 * Iki ortak oyun ani vardi ve ikisi de yalnizca yapan oyuncunun ekraninda
 * yasiyordu:
 *
 * - Atakan'in Sessiz Mod'u sahadaki BUTUN kuleleri (her sahibin) bir sure
 *   susturuyor, sonra hasar kulelerine 3x atis hizi veriyor. Takim arkadasi
 *   kulelerinin neden sustugunu bilmiyor, "oyun bozuldu" saniyordu.
 * - Sunucu (warrior-2) takim arkadasinin kulesine baglanabiliyor ve bag 5 ve
 *   10 dalgada olgunlasip o kuleye bonus veriyor; kulenin sahibi ne baglandigini
 *   ne de olgunlastigini goruyordu.
 *
 * Burasi tel mesajlarinin sekli, metinler ve geri sayimin saf hesabi. Sunucu
 * tek seferlik mesaj yolluyor (her tick'te veri degil); istemci geri sayimi
 * kendi saatiyle yurutuyor.
 */

/**
 * Sessiz Mod'un oyun suresi cinsinden sureleri. Sunucu bunlari oyun hizina
 * gore olcekleyip uyguluyor; metin ise beceri kartindaki gibi oyun saniyesini
 * soyluyor. Ayni sabit iki tarafta: metin ve kural ayrismasin.
 */
export const SILENT_MODE_SILENCE_GAME_MS = 5000;
/** Atistan itibaren hizlanmanin bittigi an (oyun suresi); sessizlik bunun icinde. */
export const SILENT_MODE_HASTE_GAME_MS = 10000;
/** Hizlanma penceresinde hasar kulelerinin atis hizi carpani (bilgi icin; kural sunucuda). */
export const SILENT_MODE_BURST_MULTIPLIER = 3;

/**
 * `silent:mode`: Sessiz Mod atildi (ya da hala suruyor ve istemci yeniden
 * baglandi). Herkese gidiyor, atana da: geri sayim herkesin.
 *
 * Zamanlar sunucu saatinde (ms). `serverTime` mesajin yollandigi an; istemci
 * kalan sureyi `until - serverTime` diye kendi saatine tasiyor, iki saatin
 * farki hesaba girmiyor.
 */
export type SilentModeMessage = {
  casterId: string;
  castAt: number;
  silentUntil: number;
  burstUntil: number;
  serverTime: number;
};

/** `link:joined`: Sunucu senin kulene baglandi. Yalnizca hedef kulenin sahibine. */
export type ServerLinkJoinedMessage = {
  serverTowerId: string;
  targetTowerId: string;
  serverOwnerId: string;
};

/**
 * Bagin olgunlastigi dalga yaslari: 5'te carpma bonusu, 10'da azami can
 * hasari. Sunucunun `getStrongestServerLinkLevel(tower, 5 | 10)` esikleriyle
 * ayni; test ikisini birlikte tutuyor.
 */
export const SERVER_LINK_MATURITY_WAVES = [5, 10] as const;
export type ServerLinkMaturityWave = (typeof SERVER_LINK_MATURITY_WAVES)[number];

/** `link:matured`: bag 5 ya da 10 dalgaya ulasti. Iki sahibe de (ayni kisiyse bir kez). */
export type ServerLinkMaturedMessage = {
  serverTowerId: string;
  targetTowerId: string;
  serverOwnerId: string;
  targetOwnerId: string;
  waves: ServerLinkMaturityWave;
};

/** Yas bir dalgada `previous`tan `next`e cikti; bir olgunluk esigi gecildiyse o. */
export function getServerLinkMaturity(previousAge: number, nextAge: number): ServerLinkMaturityWave | undefined {
  for (const waves of SERVER_LINK_MATURITY_WAVES) {
    if (previousAge < waves && nextAge >= waves) {
      return waves;
    }
  }
  return undefined;
}

/**
 * Ayni Sunucu-kule cifti icin "baglandi" bildirimleri arasi en kisa sure.
 * Bag dokunusla acilip kapaniyor; ac-kapa yapan biri arkadasinin ekranini
 * bildirimle doldurmasin.
 */
export const SERVER_LINK_NOTICE_COOLDOWN_MS = 8000;

/** Sessiz Mod geri sayiminin iki evresi. */
export type SilentModePhaseKind = "silent" | "burst";

/** Herhangi bir saatte (istemcide performance.now) zaman cizelgesi. */
export type SilentModeTimeline = {
  castAt: number;
  silentUntil: number;
  burstUntil: number;
};

export type SilentModePhase = {
  phase: SilentModePhaseKind;
  remainingMs: number;
  totalMs: number;
  /** Evrenin kalan payi, 1'den 0'a; cubuk bununla doluyor. */
  fraction: number;
};

/**
 * Sunucu mesajini istemcinin saatine tasir.
 *
 * `localNow` mesajin geldigi an, `delayMs` istemcinin oynatma gecikmesi:
 * ekrandaki dunya sunucunun ~yarim saniye gerisinden oynadigi icin geri sayim
 * da o kadar kayiyor, susan kuleyle cubuk ayni anda bitsin. Gecersiz ya da
 * coktan bitmis mesajda undefined.
 */
export function toLocalSilentModeTimeline(message: unknown, localNow: number, delayMs = 0): SilentModeTimeline | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const { castAt, silentUntil, burstUntil, serverTime } = message as Partial<SilentModeMessage>;
  if (![castAt, silentUntil, burstUntil, serverTime].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return undefined;
  }
  const cast = castAt as number;
  const silent = silentUntil as number;
  const burst = Math.max(silent, burstUntil as number);
  const sent = serverTime as number;
  if (silent < cast || burst <= sent) {
    return undefined;
  }
  const offset = localNow + Math.max(0, delayMs) - sent;
  return { castAt: cast + offset, silentUntil: silent + offset, burstUntil: burst + offset };
}

/** O an hangi evre ve ne kadar kaldi; ikisi de bittiyse undefined. */
export function getSilentModePhase(timeline: SilentModeTimeline | undefined, now: number): SilentModePhase | undefined {
  if (!timeline) {
    return undefined;
  }
  if (now < timeline.silentUntil) {
    const totalMs = Math.max(1, timeline.silentUntil - timeline.castAt);
    const remainingMs = timeline.silentUntil - Math.max(now, timeline.castAt);
    return { phase: "silent", remainingMs, totalMs, fraction: clampFraction(remainingMs / totalMs) };
  }
  if (now < timeline.burstUntil) {
    const totalMs = Math.max(1, timeline.burstUntil - timeline.silentUntil);
    const remainingMs = timeline.burstUntil - now;
    return { phase: "burst", remainingMs, totalMs, fraction: clampFraction(remainingMs / totalMs) };
  }
  return undefined;
}

/** Geri sayim cipinin etiketi. */
export const SILENT_MODE_PHASE_LABELS: Readonly<Record<SilentModePhaseKind, string>> = {
  silent: "Sessizlik",
  burst: `${SILENT_MODE_BURST_MULTIPLIER}x ateş`
};

/** Kalan sure, yukari yuvarli tam saniye: "3 sn". 0'a inmeden "0 sn" yazmasin. */
export function formatSilentModeSeconds(remainingMs: number) {
  return `${Math.max(1, Math.ceil(Math.max(0, remainingMs) / 1000))} sn`;
}

/** Iki satirlik takim bildirimi: ust satir kim/ne, alt satir sonucu. */
export type TeamSignalText = { title: string; detail: string };

/**
 * "Atakan Sessiz Mod" / "5 sn sessizlik → 3x ateş".
 *
 * Saniye oyun saniyesi, beceri kartindaki gibi; ekrandaki geri sayim gercek
 * sureyi sayiyor.
 */
export function getSilentModeNoticeText(casterName: string | undefined): TeamSignalText {
  const name = casterName?.trim() || "Takım arkadaşın";
  return {
    title: `${name} Sessiz Mod`,
    detail: `${Math.round(SILENT_MODE_SILENCE_GAME_MS / 1000)} sn sessizlik → ${SILENT_MODE_BURST_MULTIPLIER}x ateş`
  };
}

/** "Atakan'ın Sunucusu" / "kulene bağlandı". */
export function getServerLinkJoinedText(ownerName: string | undefined): TeamSignalText {
  const name = ownerName?.trim();
  return {
    title: name ? `${getTurkishGenitive(name)} Sunucusu` : "Takım arkadaşının Sunucusu",
    detail: "kulene bağlandı"
  };
}

/** "Bağ olgunlaştı · 5 dalga". */
export function getServerLinkMaturedText(waves: ServerLinkMaturityWave) {
  return `Bağ olgunlaştı · ${waves} dalga`;
}

const BACK_VOWELS = "aıou";
const FRONT_VOWELS = "eiöü";
const GENITIVE_VOWEL: Readonly<Record<string, string>> = { a: "ı", "ı": "ı", o: "u", u: "u", e: "i", i: "i", "ö": "ü", "ü": "ü" };

/**
 * Ozel adin tamlayan eki: Atakan'ın, Zeynep'in, Onur'un, Ülkü'nün.
 *
 * Unlu uyumu son unluden; adin sonu unluyse araya "n" giriyor. Unlusu
 * olmayan ad (kisaltma) "'in" aliyor; yanlis bir ek bos birakmaktan iyi.
 */
export function getTurkishGenitive(name: string) {
  const trimmed = name.trim();
  const lower = trimmed.toLocaleLowerCase("tr");
  let vowel = "";
  for (let index = lower.length - 1; index >= 0; index -= 1) {
    const character = lower[index];
    if (BACK_VOWELS.includes(character) || FRONT_VOWELS.includes(character)) {
      vowel = character;
      break;
    }
  }
  const suffixVowel = GENITIVE_VOWEL[vowel] ?? "i";
  const last = lower.at(-1) ?? "";
  const endsWithVowel = BACK_VOWELS.includes(last) || FRONT_VOWELS.includes(last);
  return `${trimmed}'${endsWithVowel ? "n" : ""}${suffixVowel}n`;
}

function clampFraction(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
