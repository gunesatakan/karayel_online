/**
 * Co-op asisti: bir dusmani baskasi bitirdi ama sen hazirladin.
 *
 * Co-op'un en guzel ani iki oyuncunun ayni dusmanda bulusmasi: Atakan
 * isaretliyor, Zeynep'in kulesi bitiriyor. Bu an hic soylenmiyordu; oldurme
 * yalnizca son vurana yaziliyordu ve isaretleyen oyuncu katkisini hicbir
 * yerde gormuyordu.
 *
 * Sunucu oldurme aninda dusmanin uzerindeki kaynaklara bakiyor:
 *
 * - Takip isareti (Takipci): isareti koyan kulenin sahibi.
 * - Zeynep komutu: hiz ya da menzil komutu acikken kuleyle gelen oldurme,
 *   yavaslatma komutu acikken her oldurme.
 * - Donma, yavaslatma, sogutma kanali: durumun kaynagindaki oyuncu (ucuz
 *   oldugu icin; durum zaten sahibini tasiyor).
 *
 * Oldurenle ayni oyuncu asist sayilmiyor. Soloda hic asist yok.
 *
 * Tel bicimi kucuk tutuluyor: oldurme olayi 2.2 sn boyunca her snapshotta
 * yeniden gidiyor (otuz kez). Asist `a` dizisinde yuva*4+tur olarak tek
 * kucuk tam sayi; asist yoksa alan hic yok.
 *
 * Saf mantik: DOM, saat ve ses yok. Taninma: hicbir asist oyuna guc olarak
 * donmuyor (altin, XP ve ulti sarji eskisi gibi).
 */

export type KillAssistKind = "mark" | "command" | "freeze" | "slow";

/**
 * Turlerin tel kodu. Sira ayni zamanda oncelik: ayni oyuncu birden cok yoldan
 * katki verdiyse en "kasitli" olan yaziliyor (isaret bir hedefe konuyor,
 * komut butun sahaya).
 */
export const KILL_ASSIST_KINDS: readonly KillAssistKind[] = ["mark", "command", "freeze", "slow"];

/** Bir oldurmede en fazla kac asist yazilir: odada en fazla dort oyuncu var. */
export const KILL_ASSIST_LIMIT = 3;

/** Iki oyuncu arasi asist bildiriminin en kisa araligi. */
export const ASSIST_TOAST_PAIR_GAP_MS = 5000;

export type KillAssist = { slot: number; kind: KillAssistKind };

/** Sunucunun oldurme anindaki adaylari; yuvasi bilinmeyen aday atlaniyor. */
export type KillAssistCandidate = { slot: number | undefined; kind: KillAssistKind };

const KIND_STRIDE = 4;
const MAX_SLOT = 15;

function isSlot(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_SLOT;
}

/**
 * Oldurmenin asistleri: oldurenden farkli, her oyuncu bir kez, en fazla uc.
 *
 * Aday sirasi korunuyor ama ayni oyuncunun iki adayi varsa oncelikli tur
 * kaliyor (`KILL_ASSIST_KINDS` sirasi). Oldurenin yuvasi bilinmiyorsa (sahipsiz
 * vurus) asist yok: "kime asist?" sorusunun cevabi yok.
 */
export function resolveKillAssists(killerSlot: number | undefined, candidates: readonly KillAssistCandidate[]): KillAssist[] {
  if (!isSlot(killerSlot)) return [];
  const bySlot = new Map<number, KillAssistKind>();
  for (const candidate of candidates) {
    if (!isSlot(candidate.slot) || candidate.slot === killerSlot) continue;
    if (!KILL_ASSIST_KINDS.includes(candidate.kind)) continue;
    const current = bySlot.get(candidate.slot);
    if (current === undefined || KILL_ASSIST_KINDS.indexOf(candidate.kind) < KILL_ASSIST_KINDS.indexOf(current)) {
      bySlot.set(candidate.slot, candidate.kind);
    }
  }
  return [...bySlot.entries()]
    .map(([slot, kind]) => ({ slot, kind }))
    .sort((left, right) => KILL_ASSIST_KINDS.indexOf(left.kind) - KILL_ASSIST_KINDS.indexOf(right.kind) || left.slot - right.slot)
    .slice(0, KILL_ASSIST_LIMIT);
}

/** Tel bicimi: yuva*4+tur. Bos liste icin `undefined` (alan yazilmasin). */
export function encodeKillAssists(assists: readonly KillAssist[]): number[] | undefined {
  if (assists.length === 0) return undefined;
  return assists.map((assist) => assist.slot * KIND_STRIDE + KILL_ASSIST_KINDS.indexOf(assist.kind));
}

/** Telden gelen `a` alani; bozuk deger sessizce atlaniyor. */
export function decodeKillAssists(raw: unknown): KillAssist[] {
  if (!Array.isArray(raw)) return [];
  const assists: KillAssist[] = [];
  // Gecerli olanlardan en fazla uc; bozuk dizi de 16 elemandan fazlasina bakilmiyor.
  for (const value of raw.slice(0, 16)) {
    if (assists.length >= KILL_ASSIST_LIMIT) break;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) continue;
    const slot = Math.floor(value / KIND_STRIDE);
    const kind = KILL_ASSIST_KINDS[value % KIND_STRIDE];
    if (!isSlot(slot) || !kind) continue;
    assists.push({ slot, kind });
  }
  return assists;
}

const ASSIST_VERBS: Readonly<Record<KillAssistKind, string>> = {
  mark: "işaretledi",
  command: "komut verdi",
  freeze: "dondurdu",
  slow: "yavaşlattı"
};

/** "Atakan işaretledi → Zeynep bitirdi". Ad yoksa "Takım arkadaşın". */
export function getKillAssistText(kind: KillAssistKind, assisterName: string | undefined, killerName: string | undefined) {
  const assister = assisterName?.trim() || "Takım arkadaşın";
  const killer = killerName?.trim() || "Takım arkadaşın";
  return `${assister} ${ASSIST_VERBS[kind] ?? ASSIST_VERBS.mark} → ${killer} bitirdi`;
}

/**
 * Yerel oyuncunun gormesi gereken asist: yalnizca iki taraftan biriysen.
 *
 * Oldurense ilk asist (oncelik sirasiyla), asist verense kendi asistin.
 * Ucuncu oyuncu hicbir sey gormuyor -- baskasinin ortakligi senin ekraninda
 * gurultu olurdu.
 */
export function pickLocalKillAssist(killerSlot: number | undefined, assists: readonly KillAssist[], localSlot: number): KillAssist | undefined {
  if (!isSlot(killerSlot) || !isSlot(localSlot)) return undefined;
  if (killerSlot === localSlot) return assists.find((assist) => assist.slot !== localSlot);
  return assists.find((assist) => assist.slot === localSlot);
}

/**
 * Oyuncu cifti basina hiz siniri: ayni iki kisi arasinda 5 sn'de en fazla bir
 * bildirim. Komut acikken her oldurme asist sayiliyor; sinir olmasa yigin
 * ayni satirla dolardi.
 *
 * Cift sirasiz: "Atakan → Zeynep" ile "Zeynep → Atakan" ayni cift, ayni ani
 * iki yonden anlatmak tekrar olurdu.
 */
export class AssistToastGate {
  private readonly lastShown = new Map<string, number>();

  constructor(private readonly gapMs = ASSIST_TOAST_PAIR_GAP_MS) {}

  /** Bildirim gosterilsin mi; gosterilecekse ani kaydediyor. */
  allow(firstSlot: number, secondSlot: number, now: number) {
    if (!isSlot(firstSlot) || !isSlot(secondSlot) || firstSlot === secondSlot || !Number.isFinite(now)) return false;
    const key = firstSlot < secondSlot ? `${firstSlot}:${secondSlot}` : `${secondSlot}:${firstSlot}`;
    const last = this.lastShown.get(key);
    if (last !== undefined && now - last < this.gapMs && now >= last) return false;
    this.lastShown.set(key, now);
    return true;
  }

  reset() {
    this.lastShown.clear();
  }
}
