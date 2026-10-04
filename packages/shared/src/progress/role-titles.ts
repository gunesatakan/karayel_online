/**
 * Co-op rol unvanlari: dalga sonunda ve kosu raporunda her oyuncuya bir unvan.
 *
 * Yalnizca hasara bakan bir MVP ondeki oyuncuya gider; arkadaki oyuncu
 * isaretliyor, komut veriyor, onariyor ama hicbir yerde gorunmuyor. Burada bes
 * olcu var ve her biri bir oyun tarzinin gercek olgusu:
 *
 * - Kasap: oldurme.
 * - Nişancı Ortağı: baskasinin bitirdigi dusmana isaret / donma / yavaslatma
 *   asisti.
 * - Komutan: Zeynep komutunun takim arkadasinin oldurmesine kattigi asist.
 * - Tamirci: iscinin onardigi can.
 * - Kule Ustası: kule hasari.
 *
 * Unvan yalnizca o olcude en cok yapana gidiyor: bir olcude onde olmayan
 * oyuncu o unvani almiyor -- ondeki baska bir unvan aldiysa olcu bos kaliyor,
 * siradakine dusmuyor. Yoksa 10 oldurmeli oyuncu 30 oldurmeli oyuncunun yaninda
 * "Kasap" olurdu. Bir oyuncu birden cok olcude ondeyse en belirgin onde oldugunu
 * aliyor: puan, siradaki oyuncuya farkinin takim toplamina orani. Puanlar
 * esitse once destek unvanlari (`ROLE_TITLE_ORDER`) -- takim oyunu esitlikte
 * one cikiyor.
 *
 * Esik: tek bir asist ya da birkac canlik onarim unvan vermemeli; yalniz
 * yapilan kucuk bir olcunun farki takim toplaminin tamami oldugu icin aksi
 * halde her zaman kazanirdi. Asist ve komut asisti en az
 * `ROLE_TITLE_FLOORS` ve takim oldurmelerinin `ROLE_TITLE_KILL_SHARE_FLOOR`
 * kadari; onarim en az `ROLE_TITLE_FLOORS.repair` can.
 *
 * Ayni olcude ondeki degeri esit tasiyan oyuncular unvani birlikte aliyor:
 * ikisinden birine yuvaya gore vermek keyfi olurdu. Hicbir olcude onde
 * olmayan oyuncu unvansiz kaliyor.
 *
 * Soloda unvan yok: tek oyunculu bir rol dagilimi anlamsiz.
 *
 * Saf mantik: dalga karnesi (`buildWaveReportCard`) ve kosu raporu
 * (`buildPlayerLines`) ayni secimi kullaniyor. Taninma: hicbir unvan oyuna
 * guc olarak donmuyor.
 */

export type RoleTitleKind = "kills" | "assist" | "command" | "repair" | "tower";

export const ROLE_TITLE_LABELS: Readonly<Record<RoleTitleKind, string>> = {
  kills: "Kasap",
  assist: "Nişancı Ortağı",
  command: "Komutan",
  repair: "Tamirci",
  tower: "Kule Ustası"
};

/** Esit puanda oncelik: destek unvanlari once, hasar en sonda. */
export const ROLE_TITLE_ORDER: readonly RoleTitleKind[] = ["command", "assist", "repair", "kills", "tower"];

/**
 * Unvan icin en az deger. Onarim canla sayiliyor: bir iscinin birkac saniyelik
 * dokunusu (saniyede ~4.5 can) "Tamirci" demeye yetmemeli; 60 can bir iscinin
 * dalgada ~13 sn onarmasi. Tek asist de unvan vermiyor.
 */
export const ROLE_TITLE_FLOORS: Readonly<Record<RoleTitleKind, number>> = {
  kills: 1,
  assist: 3,
  command: 3,
  repair: 60,
  tower: 1
};

/** Asist ve komut asisti takim oldurmelerinin en az bu kadari olmali. */
export const ROLE_TITLE_KILL_SHARE_FLOOR = 0.15;

/** Olcunun unvan esigi: asist turleri takimin oldurme hacmiyle buyuyor. */
export function getRoleTitleFloor(kind: RoleTitleKind, teamKills: number): number {
  const floor = ROLE_TITLE_FLOORS[kind];
  if (kind !== "assist" && kind !== "command") return floor;
  return Math.max(floor, ROLE_TITLE_KILL_SHARE_FLOOR * toAmount(teamKills));
}

export type RoleTitleFacts = {
  slot: number;
  kills: number;
  /** Isaret, donma ve yavaslatma asisti (komut haric). */
  assists: number;
  /** Zeynep komutunun takim arkadasinin oldurmesindeki asisti. */
  commandAssists: number;
  /** Iscilerin onardigi can. */
  repaired: number;
  /** Kulelerin verdigi hasar. */
  towerDamage: number;
};

const FACT_BY_KIND: Readonly<Record<RoleTitleKind, keyof Omit<RoleTitleFacts, "slot">>> = {
  kills: "kills",
  assist: "assists",
  command: "commandAssists",
  repair: "repaired",
  tower: "towerDamage"
};

function toAmount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Oyuncu yuvasi -> unvan. Soloda (iki oyuncudan az) bos.
 *
 * Ayni yuva iki kez gelirse ilki sayiliyor. Sonuc girdinin sirasindan
 * bagimsiz: esitlikler sabit kurallarla cozuluyor (puan, unvan sirasi, deger,
 * yuva).
 */
export function pickRoleTitles(players: readonly RoleTitleFacts[]): Map<number, RoleTitleKind> {
  const titles = new Map<number, RoleTitleKind>();
  const unique: RoleTitleFacts[] = [];
  const seen = new Set<number>();
  for (const player of players) {
    if (!player || typeof player.slot !== "number" || !Number.isInteger(player.slot) || seen.has(player.slot)) continue;
    seen.add(player.slot);
    unique.push(player);
  }
  if (unique.length < 2) return titles;

  type Candidate = { slot: number; kind: RoleTitleKind; score: number; value: number };
  const teamKills = unique.reduce((sum, player) => sum + toAmount(player.kills), 0);
  const candidates: Candidate[] = [];
  for (const kind of ROLE_TITLE_ORDER) {
    const field = FACT_BY_KIND[kind];
    const total = unique.reduce((sum, player) => sum + toAmount(player[field]), 0);
    if (!(total > 0)) continue;
    const best = Math.max(...unique.map((player) => toAmount(player[field])));
    if (best < getRoleTitleFloor(kind, teamKills)) continue;
    // Siradaki oyuncu: ondeki degerden kesin dusuk en yuksek deger.
    const runnerUp = unique.reduce((most, player) => {
      const value = toAmount(player[field]);
      return value < best && value > most ? value : most;
    }, 0);
    const score = (best - runnerUp) / total;
    for (const player of unique) {
      if (toAmount(player[field]) === best) candidates.push({ slot: player.slot, kind, score, value: best });
    }
  }
  // Kayan nokta esitligi: 1/3 ile 2/6 ayni puan sayilsin.
  const sameScore = (left: number, right: number) => Math.abs(left - right) < 1e-9;
  candidates.sort((left, right) => (sameScore(left.score, right.score) ? 0 : right.score - left.score)
    || ROLE_TITLE_ORDER.indexOf(left.kind) - ROLE_TITLE_ORDER.indexOf(right.kind)
    || right.value - left.value
    || left.slot - right.slot);

  // Her oyuncu kendi en belirgin onde oldugu olcuyu aliyor; adaylar zaten
  // yalnizca onde olanlar, yani verilmeyen olcu kimseye dusmuyor.
  for (const candidate of candidates) {
    if (!titles.has(candidate.slot)) titles.set(candidate.slot, candidate.kind);
  }
  return titles;
}

/** Dalga karnesinin co-op olgularindan yuvanin olgulari; dizi yoksa 0. */
export function getWaveRoleFacts(record: { p?: readonly number[]; n?: readonly number[]; z?: readonly number[]; r?: readonly number[]; t?: readonly number[] }, slots: readonly number[]): RoleTitleFacts[] {
  return slots.map((slot) => ({
    slot,
    kills: toAmount(record.p?.[slot]),
    assists: toAmount(record.n?.[slot]),
    commandAssists: toAmount(record.z?.[slot]),
    repaired: toAmount(record.r?.[slot]),
    towerDamage: toAmount(record.t?.[slot])
  }));
}
