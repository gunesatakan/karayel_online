import { FINAL_WAVE, getWaveAirMode, type KillStreakTier } from "../balance/index.js";
import { getCardDefinition, getCardRarity, type CardRarity } from "../cards/index.js";
import { characters } from "../characters/index.js";
import { getTowerLevelLabel } from "../feedback/tower-ceremony.js";
import { getUltimateStampText, type UltimateResultMessage } from "../feedback/ultimate.js";
import type { CharacterId } from "../index.js";
import type { MapScale } from "../map.js";
import { getKillStreakTierRank, type RunSummary, type RunTowerSummary, type WaveRecord } from "../run-trace/index.js";
import { STAGE_COUNT, getHighestUnlockedStage, getStage, isStageUnlocked, stageCatalog } from "../stages/index.js";
import { TOWER_TIER_3_LEVEL } from "../tower-stats/index.js";
import { SYNERGY_SHARE_RUN_FLOOR, getSynergyShareLabel, pickLargerSynergyShare, roundSynergyShare } from "../synergy/index.js";
import { ROLE_TITLE_LABELS, pickRoleTitles, type RoleTitleKind } from "./role-titles.js";
import {
  computeStars,
  formatStars,
  getNextStarCleanWaves,
  getRecordChangeParts,
  isRecordCharacterId,
  nextGoal,
  type RecordMerge,
  type StageStars
} from "./records.js";

/**
 * Kosu raporu: macin son ekrani.
 *
 * Eskiden tek bir sayi (oldurme) ve sayfayi yenileyen bir dugmeydi. Burada
 * raporun her satiri sunucunun kosu defterinden (`RunSummary`) kuruluyor ve
 * rekor satiri kaydin kendisinden (`RecordMerge`): ekranin soyledigi ile
 * menude kalan iz ayni sayilar.
 *
 * Saf mantik: DOM, depo ve ses yok. Istemci (apps/web/src/run-report-ui.ts)
 * bunu HTML'e ceviriyor; testler metni ve kurallari dogrudan olcuyor.
 *
 * Rapor taninma: hicbir satiri oyuna guc olarak donmuyor. Co-op'ta yalnizca
 * hasara bakan bir "MVP" yarisi yok -- ondeki oyuncu hep kazanirdi; her oyuncu
 * kendi satirini ve bir rol unvanini aliyor.
 */

/** Dalga seridinin bir hucresi. `played`: dalga oynandi ama karnesi yok (rapor gelmeden acilan ekran). */
export type RunWaveCellState = "clean" | "leak" | "death" | "played" | "open";

export type RunWaveCell = {
  wave: number;
  state: RunWaveCellState;
  /**
   * Hava dalgasi. Oynanmamis dalgada da isaretli: oyuncu bir sonraki kosuda
   * hangi dalganin havadan gelecegini seritte gorsun.
   */
  air?: "all" | "mixed";
  leaks: number;
  /** Ekran okuyucu ve basili tutma icin tek satir. */
  label: string;
};

function toCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** Sayi binlik ayiracla ("12.400"); arayuz Turkce. */
export function formatRunCount(value: number) {
  return toCount(value).toLocaleString("tr-TR");
}

function airSuffix(air: RunWaveCell["air"]) {
  if (air === "all") return " (hava)";
  if (air === "mixed") return " (karışık hava)";
  return "";
}

function isWaveRecord(value: unknown): value is WaveRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<WaveRecord>;
  return typeof record.w === "number" && Number.isInteger(record.w) && typeof record.l === "number";
}

/**
 * 20 hucrelik dalga seridi: temiz, sizintili, dusulen dalga ve oynanmayanlar.
 *
 * Karne dalga numarasiyla eslesiyor; yaratici mod dalgayi geri sarabildigi
 * icin ayni numara iki kez gelebilir, o durumda son karne gecerli. Rapor yoksa
 * (sonuc snapshot'tan acildi, rapor yolda) ulasilan dalgalar "oynandı" olarak
 * notr ciziliyor: temiz mi sizintili mi bilinmiyor ve uydurulmuyor.
 */
export function buildWaveStrip(input: {
  result: "victory" | "defeat";
  wave: number;
  run?: Pick<RunSummary, "waves" | "finalWave">;
}): RunWaveCell[] {
  const finalWave = input.run?.finalWave && input.run.finalWave > 0 ? Math.min(FINAL_WAVE, Math.round(input.run.finalWave)) : FINAL_WAVE;
  const reached = input.result === "victory" ? finalWave : Math.min(finalWave, toCount(input.wave));
  const records = new Map<number, WaveRecord>();
  for (const record of Array.isArray(input.run?.waves) ? input.run.waves : []) {
    if (isWaveRecord(record)) records.set(record.w, record);
  }
  const cells: RunWaveCell[] = [];
  for (let wave = 1; wave <= finalWave; wave += 1) {
    const mode = getWaveAirMode(wave);
    const air = mode === "none" ? undefined : mode;
    const head = `${wave}. dalga${airSuffix(air)}`;
    const record = records.get(wave);
    let state: RunWaveCellState;
    let leaks = 0;
    let label: string;
    if (record) {
      leaks = toCount(record.l);
      if (record.d) {
        state = "death";
        label = `${head}: düştü${leaks > 0 ? ` · ${leaks} sızıntı` : ""}`;
      } else if (leaks > 0) {
        state = "leak";
        const details: string[] = [];
        if (toCount(record.a) > 0) details.push(`${toCount(record.a)} hava`);
        if (toCount(record.s) > 0) details.push(`kalkan tuttu ${toCount(record.s)}`);
        label = `${head}: ${leaks} sızıntı${details.length ? ` (${details.join(", ")})` : ""}`;
      } else {
        state = "clean";
        label = `${head}: temiz`;
      }
    } else if (!input.run && input.result === "defeat" && wave === reached) {
      state = "death";
      label = `${head}: düştü`;
    } else if (wave <= reached) {
      state = "played";
      label = `${head}: oynandı`;
    } else {
      state = "open";
      label = `${head}: oynanmadı`;
    }
    const cell: RunWaveCell = { wave, state, leaks, label };
    if (air) cell.air = air;
    cells.push(cell);
  }
  return cells;
}

/**
 * Seri kademelerinin adlari; arenadaki seri bannerinin yazdigi adla ayni ki
 * oyuncu raporda gordugunu macta gordugune baglayabilsin.
 */
export const KILL_STREAK_TIER_LABELS: Readonly<Record<KillStreakTier, string>> = {
  granted: "GRANTED",
  unstoppable: "UNSTOPPABLE",
  rampage: "RAMPAGE",
  legendary: "LEGENDARY"
};

/** Raporun hatirladigi ulti: sunucunun `ultimate:result` yukunun sayilari. */
export type RunUltimateMoment = Pick<UltimateResultMessage, "kind" | "hits" | "kills" | "best" | "aim" | "heal">;

/**
 * Ultinin "en iyi an" agirligi.
 *
 * Derece yalnizca sutunda var (nisan olculebiliyor); oteki ultiler oldurme ve
 * isabetle siralaniyor. Hic isabet etmeyen ulti an degil: 0.
 */
export function scoreUltimateMoment(result: RunUltimateMoment | undefined) {
  if (!result || typeof result.kind !== "string") return 0;
  const tier = getUltimateStampText(result).grade?.tier;
  if (tier === "perfect") return 3.5;
  if (tier === "good") return 2.5;
  if (toCount(result.kills) > 0) return 1;
  if (toCount(result.hits) > 0 || toCount(result.heal) > 0) return 0.5;
  return 0;
}

/**
 * Iki ultiden raporda kalacak olan. Esitlikte once gelen kaliyor: "ilk kez
 * ulastigin an", tekrar ayni seyi yapmak onu silmesin.
 */
export function pickBetterUltimate(current: RunUltimateMoment | undefined, next: RunUltimateMoment | undefined) {
  const nextScore = scoreUltimateMoment(next);
  if (!next || nextScore <= 0) return current;
  const currentScore = scoreUltimateMoment(current);
  if (!current || currentScore <= 0) return { ...next };
  if (nextScore !== currentScore) return nextScore > currentScore ? { ...next } : current;
  const kills = toCount(next.kills) - toCount(current.kills);
  if (kills !== 0) return kills > 0 ? { ...next } : current;
  return toCount(next.hits) > toCount(current.hits) ? { ...next } : current;
}

export type RunMomentKind = "level10" | "streak" | "ultimate" | "synergy";

export type RunMoment = {
  kind: RunMomentKind;
  /** Yerel oyuncunun ani mi; takim arkadasininki adiyla yaziliyor. */
  own: boolean;
  text: string;
};

/**
 * Anlarin agirligi. Onuncu seviye en seyrek olan (olcumlerde hic bir bot
 * ulasmadi); seri kademesi sirasiyla; ulti derecesi aralarinda. Sabit bir
 * tablo: "neden bu an" sorusunun cevabi okunabilir kalsin.
 */
const MOMENT_SCORE_LEVEL10 = 6;
/** Kademe sirasi (1-4) + 1: GRANTED 2, UNSTOPPABLE 3, RAMPAGE 4, LEGENDARY 5. */
function streakMomentScore(tier: KillStreakTier) {
  return getKillStreakTierRank(tier) + 1;
}
/**
 * Karar payinin agirligi: oldurmeli bir ultinin (1) ustunde, ilk seri
 * kademesinin (GRANTED 2) altinda. Pay bir an degil kosu boyu bir karar; ancak
 * raporda daha parlak bir an yoksa basligi aliyor.
 */
const MOMENT_SCORE_SYNERGY = 1.5;

/**
 * Raporun tek "en iyi an" satiri.
 *
 * Once kendi, sonra ekip: yerel oyuncunun herhangi bir ani takim arkadasinin
 * en buyuk anindan once geliyor -- baskasinin anı senin raporunun basligini
 * almasin. Kendi anlari arasinda: ilk onuncu seviye, seri kademesi, ulti
 * derecesi (sutunda mukemmel nisan UNSTOPPABLE'in ustunde, RAMPAGE'in altinda).
 * Takim arkadasinin ultisi bu istemciye gelmiyor, o yuzden ekipte yalnizca
 * onuncu seviye ve seri var. Kendi karar payin (yalnizlik ya da dizilim,
 * kosu toplami `SYNERGY_SHARE_RUN_FLOOR` ustunde) en alttaki aday.
 */
export function pickRunMoment(
  run: Pick<RunSummary, "players" | "bestStreak" | "firstLevel10"> | undefined,
  options: { localSlot: number; ultimate?: RunUltimateMoment }
): RunMoment | undefined {
  const players = Array.isArray(run?.players) ? run.players : [];
  const coop = players.length > 1;
  const nameOf = (slot: number) => players.find((player) => player.slot === slot)?.name ?? "Takım arkadaşın";
  const prefix = (own: boolean, slot: number) => (own || !coop ? "" : `${nameOf(slot)}: `);
  const candidates: Array<RunMoment & { score: number }> = [];

  const level10 = run?.firstLevel10;
  if (level10 && typeof level10.name === "string") {
    const own = level10.slot === options.localSlot;
    candidates.push({
      kind: "level10",
      own,
      score: MOMENT_SCORE_LEVEL10,
      text: `${prefix(own, level10.slot)}${level10.name} ${getTowerLevelLabel(TOWER_TIER_3_LEVEL, true)} · Dalga ${toCount(level10.wave)}`
    });
  }

  const ownStreak = players.find((player) => player.slot === options.localSlot)?.bestStreakTier;
  if (ownStreak && KILL_STREAK_TIER_LABELS[ownStreak]) {
    const best = run?.bestStreak;
    const wave = best && best.slot === options.localSlot && best.tier === ownStreak ? toCount(best.wave) : 0;
    candidates.push({
      kind: "streak",
      own: true,
      score: streakMomentScore(ownStreak),
      text: `${KILL_STREAK_TIER_LABELS[ownStreak]} serisi${wave > 0 ? ` · Dalga ${wave}` : ""}`
    });
  }
  const teamStreak = run?.bestStreak;
  if (teamStreak && teamStreak.slot !== options.localSlot && KILL_STREAK_TIER_LABELS[teamStreak.tier]) {
    candidates.push({
      kind: "streak",
      own: false,
      score: streakMomentScore(teamStreak.tier),
      text: `${prefix(false, teamStreak.slot)}${KILL_STREAK_TIER_LABELS[teamStreak.tier]} serisi · Dalga ${toCount(teamStreak.wave)}`
    });
  }

  const ultimateScore = scoreUltimateMoment(options.ultimate);
  if (options.ultimate && ultimateScore > 0) {
    const stamp = getUltimateStampText(options.ultimate);
    candidates.push({
      kind: "ultimate",
      own: true,
      score: ultimateScore,
      text: `${stamp.title}${stamp.grade ? ` · ${stamp.grade.text}` : ""}`
    });
  }

  // Yalnizca kendi payin: takim arkadasinin payi bu istemcinin olcmedigi bir
  // tahmin, basliga baskasinin karari yazilmasin.
  const ownPlayer = players.find((player) => player.slot === options.localSlot);
  const share = pickLargerSynergyShare(ownPlayer);
  if (share && share.amount >= SYNERGY_SHARE_RUN_FLOOR) {
    candidates.push({
      kind: "synergy",
      own: true,
      score: MOMENT_SCORE_SYNERGY,
      text: `${getSynergyShareLabel(share.kind)} · ~${formatRunCount(roundSynergyShare(share.amount))} hasar`
    });
  }

  let best: (RunMoment & { score: number }) | undefined;
  for (const candidate of candidates) {
    if (!best || (candidate.own && !best.own) || (candidate.own === best.own && candidate.score > best.score)) best = candidate;
  }
  return best ? { kind: best.kind, own: best.own, text: best.text } : undefined;
}

/**
 * Co-op satirindaki unvanin kaynagi: bes rol olcusu (`RoleTitleKind`), kosunun
 * iki ani (ilk onuncu seviye, en yuksek seri) ve `role` operatorun kendi rolu.
 */
export type RunRoleTitleKind = RoleTitleKind | "level10" | "streak" | "role";

export type RunPlayerLine = {
  slot: number;
  name: string;
  characterId: CharacterId;
  /** Operatorun adi ("Zeynep"); oyuncu adi ayniysa satirda bir kez. */
  operator: string;
  title: string;
  titleKind: RunRoleTitleKind;
  local: boolean;
  kills: number;
  /** "42 öldürme · Takipçi SV 7 · RAMPAGE". */
  detail: string;
};

/** Rol unvanlari; hepsi kosunun gercek bir olgusu, hicbiri tek basina hasar yarisi degil. */
export const RUN_ROLE_TITLES = {
  ...ROLE_TITLE_LABELS,
  level10: "Kule Ustası",
  streak: "Seri Ustası"
} as const;

/**
 * Co-op'ta oyuncu basina bir satir ve bir rol unvani.
 *
 * Yalnizca hasara bakan bir MVP ondeki oyuncuya gider: arkadaki oyuncu 3-8.
 * dalgalarda oldurmelerin %0'ini aliyor ama yolu o tutuyor. Burada her oyuncu
 * bir unvan aliyor. Once dalga karnesiyle ayni bes rol olcusu, kosunun
 * toplamindan (`pickRoleTitles`): Kasap, Nişancı Ortağı, Komutan, Tamirci,
 * Kule Ustası -- her oyuncu en fazla birini aliyor ve unvan yalnizca o olcude
 * ondeki oyuncuya gidiyor; ondeki baska unvan aldiysa olcu siradakine dusmuyor. Kule hasari bes olcunun yalnizca biri.
 * Olcuden unvan alamayan oyuncuya kosunun anlari: ilk onuncu seviye (Kule
 * Ustası, o unvan baskasinda degilse) ve kosunun en yuksek serisi (Seri
 * Ustası). Hicbiri yoksa operatorun kendi rolu ("Destek", "Tank").
 * Yerel oyuncu once, sonra yuva sirasi.
 */
export function buildPlayerLines(run: Pick<RunSummary, "players" | "firstLevel10" | "bestStreak">, localSlot: number): RunPlayerLine[] {
  const players = Array.isArray(run.players) ? run.players : [];
  // Eski rapor (rol olgulari yok): kule hasari icin en iyi kulesi, digerleri 0.
  const roleTitles = pickRoleTitles(players.map((player) => ({
    slot: player.slot,
    kills: toCount(player.kills),
    assists: toCount(player.assists),
    commandAssists: toCount(player.commandAssists),
    repaired: toCount(player.repaired),
    towerDamage: toCount(player.towerDamage ?? player.topTower?.damage)
  })));
  const towerTitleTaken = [...roleTitles.values()].includes("tower");
  return players
    .map((player): RunPlayerLine => {
      const character = characters.find((candidate) => candidate.id === player.characterId);
      const operator = character?.displayName ?? "Operatör";
      let titleKind: RunRoleTitleKind = "role";
      let title: string = character?.role ?? "Operatör";
      const roleTitle = roleTitles.get(player.slot);
      if (roleTitle) {
        titleKind = roleTitle;
        title = RUN_ROLE_TITLES[roleTitle];
      } else if (!towerTitleTaken && run.firstLevel10 && run.firstLevel10.slot === player.slot) {
        titleKind = "level10";
        title = RUN_ROLE_TITLES.level10;
      } else if (run.bestStreak && run.bestStreak.slot === player.slot) {
        titleKind = "streak";
        title = RUN_ROLE_TITLES.streak;
      }
      const kills = toCount(player.kills);
      const parts = [`${formatRunCount(kills)} öldürme`];
      // Asist oldurmenin hemen yaninda: arkadaki oyuncunun katkisi da bir sayi.
      const assists = toCount(player.assists) + toCount(player.commandAssists);
      if (assists > 0) parts.push(`${formatRunCount(assists)} asist`);
      parts.push(player.topTower ? `${player.topTower.name} ${getTowerLevelLabel(player.topTower.level, false)}` : "kule hasarı yok");
      if (player.bestStreakTier && KILL_STREAK_TIER_LABELS[player.bestStreakTier]) parts.push(KILL_STREAK_TIER_LABELS[player.bestStreakTier]);
      return {
        slot: player.slot,
        name: typeof player.name === "string" && player.name.trim() ? player.name.trim() : operator,
        characterId: player.characterId,
        operator,
        title,
        titleKind,
        local: player.slot === localSlot,
        kills,
        detail: parts.join(" · ")
      };
    })
    .sort((left, right) => Number(right.local) - Number(left.local) || left.slot - right.slot);
}

/** Solo raporun kulesi: "Takipçi · SV 7 · 12.400 hasar". Butun dalgalarin toplami; satilan kule de sayiliyor. */
export function describeRunMvp(mvp: RunTowerSummary | undefined) {
  if (!mvp || typeof mvp.name !== "string" || !(mvp.damage > 0)) return undefined;
  return `${mvp.name} · ${getTowerLevelLabel(mvp.level, false)} · ${formatRunCount(mvp.damage)} hasar`;
}

export type RunDeckCard = {
  id: string;
  name: string;
  rarity: CardRarity;
  /** Yigilan kart her aliminda bir kez; satirda "×2". */
  count: number;
  targeted: boolean;
};

export type RunDeck = {
  cards: RunDeckCard[];
  /** Butun secimler, yigilanlar dahil. */
  total: number;
  /** Secim basina; toplami `total`. */
  rarities: Record<CardRarity, number>;
};

/**
 * Kosunun destesi, secim sirasiyla.
 *
 * Sira kosunun hikayesi: ilk secilen ilk. Yigilan kart ilk gorundugu yerde tek
 * kalemde toplaniyor. Katalogda olmayan kimlik (eski surum, bozuk veri)
 * atlaniyor; raporda adi olmayan bir kart cizilmiyor.
 */
export function buildRunDeck(cardIds: readonly unknown[] | undefined): RunDeck {
  const deck: RunDeck = { cards: [], total: 0, rarities: { common: 0, uncommon: 0, rare: 0 } };
  const byId = new Map<string, RunDeckCard>();
  for (const id of Array.isArray(cardIds) ? cardIds : []) {
    if (typeof id !== "string") continue;
    const definition = getCardDefinition(id);
    if (!definition) continue;
    deck.total += 1;
    const existing = byId.get(id);
    if (existing) {
      existing.count += 1;
      deck.rarities[existing.rarity] += 1;
      continue;
    }
    const rarity = getCardRarity(definition);
    const card: RunDeckCard = { id, name: definition.name, rarity, count: 1, targeted: definition.scope.kind === "targeted" };
    byId.set(id, card);
    deck.cards.push(card);
    deck.rarities[rarity] += 1;
  }
  return deck;
}

/** "84 düşman · 3 sızıntı · 14 temiz dalga". */
export function describeRunTotals(run: Pick<RunSummary, "kills" | "leaks" | "cleanWaves">) {
  const leaks = toCount(run.leaks);
  return [
    `${formatRunCount(run.kills)} düşman`,
    leaks > 0 ? `${formatRunCount(leaks)} sızıntı` : "sızıntı yok",
    `${Math.min(FINAL_WAVE, toCount(run.cleanWaves))} temiz dalga`
  ].join(" · ");
}

export type RunReportTone = "victory" | "defeat" | "finale";

export type RunReportHeading = {
  tone: RunReportTone;
  /** "3. AŞAMA · SÜRÜ". */
  eyebrow: string;
  title: string;
  /** Yalnizca son asamanin temizlenmesi: ayri final metni. */
  finale?: { text: string; races: string };
};

/**
 * Son asama bu tarayicida temizlendi mi: final metni yalnizca o zaman.
 *
 * Yaratici kosu ya da bu oyuncuda kilitli bir asamada (co-op'ta ev sahibinin
 * 5. asamasi) kazanilan zafer "tüm aşamalar tamamlandı" demiyor: oyuncunun
 * kendi yolunda bu dogru degil. `clearedStageIds` bu kosu islendikten sonraki
 * liste.
 */
export function isFinaleClear(input: {
  result: "victory" | "defeat";
  stage?: number;
  creative: boolean;
  clearedStageIds: readonly number[];
}) {
  if (input.result !== "victory" || input.creative || input.stage !== STAGE_COUNT) return false;
  return stageCatalog.every((stage) => input.clearedStageIds.includes(stage.id));
}

export function getRunReportHeading(input: { result: "victory" | "defeat"; stage?: number; finale: boolean }): RunReportHeading {
  const stage = input.stage !== undefined && stageCatalog.some((entry) => entry.id === input.stage) ? getStage(input.stage) : undefined;
  const base = stage ? `${stage.id}. AŞAMA · ${stage.name.toLocaleUpperCase("tr-TR")}` : "KOŞU RAPORU";
  if (input.finale && input.result === "victory") {
    return {
      tone: "finale",
      eyebrow: `${base} · FİNAL`,
      title: "TÜM AŞAMALAR TAMAMLANDI",
      finale: {
        text: `${STAGE_COUNT} aşamanın hepsi temizlendi.`,
        races: stageCatalog.map((entry) => entry.raceName).join(" · ")
      }
    };
  }
  return { tone: input.result, eyebrow: base, title: input.result === "victory" ? "ZAFER" : "YENİLGİ" };
}

/**
 * Raporun basi.
 *
 * Zaferde yildizlar ("★★☆", altinda "16/20 temiz dalga"); yenilgide ulasilan
 * dalga ("Dalga 13/20"). Kayit yazildiysa rozet ayni satirin devami: yenilgide
 * "Dalga 13/20 — YENİ REKOR (önceki 11)", zaferde "İLK TEMİZLEME". Gecilmemis
 * bir zafer rozette kendi temiz dalga sayisini tekrar etmiyor, en iyi kaydi
 * gosteriyor ki arada ne kaldigi okunsun.
 *
 * Yaratici kosuda yildiz yok: istedigin dusmani gonderebildigin bir kosunun
 * yildizi bir sey olcmez.
 */
export type RunReportHero =
  | { kind: "stars"; stars: StageStars; text: string; caption: string }
  | { kind: "wave"; text: string };

export type RunReportBadge = { separator?: " — " | " · "; text: string; celebrated: boolean };

export function buildRunReportHero(input: {
  result: "victory" | "defeat";
  wave: number;
  creative: boolean;
  run?: Pick<RunSummary, "result" | "cleanWaves" | "finalWave">;
  merge?: RecordMerge;
}): { hero: RunReportHero; badge?: RunReportBadge } {
  const finalWave = input.run?.finalWave && input.run.finalWave > 0 ? input.run.finalWave : FINAL_WAVE;
  const victory = input.result === "victory";
  const merge = input.merge;
  if (victory && !input.creative && (merge || input.run)) {
    const stars = merge ? merge.stars : computeStars({ result: "victory", cleanWaves: input.run?.cleanWaves ?? 0 });
    const clean = merge ? merge.cleanWaves : Math.min(finalWave, toCount(input.run?.cleanWaves));
    const hero: RunReportHero = { kind: "stars", stars, text: formatStars(stars), caption: `${clean}/${finalWave} temiz dalga` };
    if (!merge) return { hero };
    const parts = getRecordChangeParts(merge);
    if (parts.celebrated) return { hero, badge: { text: parts.badge, celebrated: true } };
    const previous = merge.previous;
    if (!previous) return { hero };
    // En iyi temiz dalga yenilgileri de sayiyor; bir sonraki yildizin esigini
    // tutan bir en iyi ancak yenilgiden gelmis olabilir ve yildizin yaninda
    // "tuttun ama yildiz yok" diye okunurdu. O zaman yalnizca yildiz.
    const threshold = getNextStarCleanWaves(previous.bestStars);
    const bestClean = threshold === undefined || previous.bestCleanWaves < threshold ? ` · ${previous.bestCleanWaves} temiz dalga` : "";
    return { hero, badge: { text: `En iyi ${formatStars(previous.bestStars)}${bestClean}`, celebrated: false } };
  }
  const reached = victory ? finalWave : Math.min(finalWave, toCount(input.wave));
  const hero: RunReportHero = { kind: "wave", text: `Dalga ${reached}/${finalWave}` };
  if (!merge || victory) return { hero };
  const parts = getRecordChangeParts(merge);
  return { hero: { kind: "wave", text: parts.head }, badge: { separator: parts.separator, text: parts.badge, celebrated: parts.celebrated } };
}

export type RunReportView = {
  heading: RunReportHeading;
  hero: RunReportHero;
  badge?: RunReportBadge;
  strip: RunWaveCell[];
  totals: string;
  /** Solo: kosunun kulesi. Co-op'ta yok; oyuncu satirlari var. */
  mvp?: string;
  players?: RunPlayerLine[];
  moment?: RunMoment;
  deck: RunDeck;
  /** Yalnizca kayit yazildiysa: "Sıradaki hedef: Dalga 14 · ★★ için 16 temiz dalga". */
  goal?: string;
};

export type RunReportInput = {
  result: "victory" | "defeat";
  /** Mesajin ya da snapshot'in dalgasi; rapor yoksa tek kaynak. */
  wave: number;
  kills: number;
  stage?: number;
  creative: boolean;
  run?: RunSummary;
  localSlot: number;
  /** Kayit yazildiysa birlestirme sonucu; rekor rozeti ve hedef satiri buradan. */
  merge?: RecordMerge;
  ultimate?: RunUltimateMoment;
  finale: boolean;
  /** Rapor yokken desteyi snapshot'tan gostermek icin. */
  fallbackCardIds?: readonly string[];
};

/** Raporun butun satirlari; istemci yalnizca bunu ciziyor. */
export function buildRunReportView(input: RunReportInput): RunReportView {
  const run = input.run;
  const heading = getRunReportHeading({ result: input.result, stage: input.stage, finale: input.finale });
  const { hero, badge } = buildRunReportHero({ result: input.result, wave: input.wave, creative: input.creative, run, merge: input.merge });
  const own = run?.players?.find((player) => player.slot === input.localSlot);
  const coop = (run?.players?.length ?? 0) > 1;
  const view: RunReportView = {
    heading,
    hero,
    strip: buildWaveStrip({ result: input.result, wave: input.wave, run }),
    totals: run ? describeRunTotals(run) : `${formatRunCount(input.kills)} düşman`,
    deck: buildRunDeck(own ? own.cards : input.fallbackCardIds)
  };
  if (badge) view.badge = badge;
  if (run && coop) view.players = buildPlayerLines(run, input.localSlot);
  else if (run) {
    const mvp = describeRunMvp(run.mvp);
    if (mvp) view.mvp = mvp;
  }
  const moment = pickRunMoment(run, { localSlot: input.localSlot, ultimate: input.ultimate });
  if (moment) view.moment = moment;
  if (input.merge) view.goal = nextGoal(input.merge.record, run);
  return view;
}

/**
 * Raporun yerel oyuncu yuvasi.
 *
 * Once snapshot'taki yuva (sunucunun). Snapshot yoksa (sonuc ilk mesajla
 * geldi) operatorden: lobide her operator tek oyuncuda. Rapor yoksa 0 --
 * tek kisilik odada zaten 0.
 *
 * Rapor oyuncu listesini tasiyor ama bu operator listede yoksa -1: hicbir
 * satir. 0'a dusmek, kosuda olmayan bir oyuncuya yuva 0'in destesini ve
 * kaydini verirdi (`resolveRunCharacter` satiri olmayan yuvaya kayit
 * yazmiyor).
 */
export function resolveLocalRunSlot(
  run: Pick<RunSummary, "players"> | undefined,
  local: { snapshotSlot?: number; hasSnapshot: boolean; characterId: CharacterId }
) {
  if (local.hasSnapshot) return typeof local.snapshotSlot === "number" ? local.snapshotSlot : 0;
  const players = run?.players;
  if (!Array.isArray(players)) return 0;
  return players.find((player) => player?.characterId === local.characterId)?.slot ?? -1;
}

/**
 * Sonuc mesaji ekranin ve kaydin kapisi.
 *
 * Sonuc uc yoldan gelebiliyor: `match:*` mesaji (raporlu), sonucu tasiyan her
 * snapshot (raporsuz, mac bittikten sonra her tick) ve yeniden baglanmada ya
 * da `run:sync` ile tekrar gelen mesaj. Ekran bir kez aciliyor, kayit kosu
 * kimligi basina bir kez yaziliyor; rapor ekrandan sonra geldiyse acik ekran
 * bir kez tazeleniyor. Sahne kurali buradan okuyor ki "tam bir kez" test
 * edilebilsin.
 */
export type MatchResultStep = {
  /** Rapor ekranini ac. */
  open: boolean;
  /** Kosuyu kayda yaz (kayit modulunun kendi kapisi da var). */
  record: boolean;
  /** Ekran acik ve rapor simdi geldi: yeniden ciz. */
  refresh: boolean;
};

export class MatchResultLatch {
  private opened = false;
  private recordedRunId?: string;
  private runSeen = false;

  receive(input: { run?: Pick<RunSummary, "id"> }): MatchResultStep {
    const open = !this.opened;
    this.opened = true;
    const run = input.run;
    const hasRun = Boolean(run && typeof run.id === "string" && run.id.length > 0);
    const record = hasRun && this.recordedRunId === undefined;
    if (record) this.recordedRunId = run!.id;
    const refresh = !open && hasRun && !this.runSeen;
    if (hasRun) this.runSeen = true;
    return { open, record, refresh };
  }

  /** Ekran acik ama rapor gelmedi; `run:sync` istenmeli. */
  get awaitingRun() {
    return this.opened && !this.runSeen;
  }
}

/** Tekrar niyetinin bicim surumu; depo anahtari da surumlu. */
export const QUICK_START_VERSION = 1;
/**
 * Niyetin gecerli kaldigi sure. Yeniden yukleme bir iki saniye suruyor;
 * sinir, yarim kalmis bir niyetin cok sonraki elle bir yenilemede oyunu
 * kendiliginden baslatmasini engelliyor.
 */
export const QUICK_START_MAX_AGE_MS = 120_000;
/** Saat kaymasina pay: gelecekten gelen niyet ancak bu kadar ileride olabilir. */
const QUICK_START_CLOCK_SKEW_MS = 5_000;
const QUICK_START_MAP_SCALES: readonly MapScale[] = [1, 2, 3, 4];

/** `solo` ve `creative` menuden hemen basliyor; `online` oda kurma ekranini aciyor. */
export type QuickStartMode = "solo" | "creative" | "online";

/**
 * "Tekrar" ve "Sonraki aşama": sayfa yeniden yuklenirken menuye birakilan not.
 *
 * Sahneyi yeniden baslatmak (Phaser `scene.restart`) yerine yeniden yukleme:
 * sahnenin durumunun buyuk kismi alan baslaticilarinda ve restart onlari
 * yeniden calistirmiyor -- ikinci kosu birincinin artiklariyla baslardi.
 */
export type QuickStartIntent = {
  v: typeof QUICK_START_VERSION;
  mode: QuickStartMode;
  stage: number;
  characterId: CharacterId;
  mapScale: MapScale;
  at: number;
};

function isQuickStartMode(value: unknown): value is QuickStartMode {
  return value === "solo" || value === "creative" || value === "online";
}

function isQuickStartStage(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= STAGE_COUNT;
}

function isQuickStartScale(value: unknown): value is MapScale {
  return QUICK_START_MAP_SCALES.includes(value as MapScale);
}

export function createQuickStartIntent(
  input: { mode: QuickStartMode; stage: number; characterId: CharacterId; mapScale: number },
  now: number
): QuickStartIntent | undefined {
  if (!isQuickStartMode(input.mode) || !isQuickStartStage(input.stage) || !isRecordCharacterId(input.characterId) || !isQuickStartScale(input.mapScale)) {
    return undefined;
  }
  return { v: QUICK_START_VERSION, mode: input.mode, stage: input.stage, characterId: input.characterId, mapScale: input.mapScale, at: Math.floor(now) };
}

/**
 * Depodan okunan niyet; her alan yeniden dogrulaniyor. Bozuk, eski ya da
 * baska surumden kalan niyet yok sayiliyor: menu normal aciliyor.
 */
export function parseQuickStartIntent(raw: unknown, now: number): QuickStartIntent | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  if (source.v !== QUICK_START_VERSION || typeof source.at !== "number" || !Number.isFinite(source.at)) return undefined;
  const age = now - source.at;
  if (age > QUICK_START_MAX_AGE_MS || age < -QUICK_START_CLOCK_SKEW_MS) return undefined;
  const characterId = source.characterId;
  if (!isRecordCharacterId(characterId)) return undefined;
  return createQuickStartIntent(
    { mode: source.mode as QuickStartMode, stage: source.stage as number, characterId, mapScale: source.mapScale as number },
    source.at
  );
}

/**
 * Niyetin asamasi bu tarayicida acik mi; degilse acik olan en yuksek asama.
 * Co-op'ta ev sahibinin asamasi katilanda kilitli olabilir; menu kilitli
 * asamayi secemez, niyet de secmemeli.
 */
export function resolveQuickStartStage(intent: Pick<QuickStartIntent, "stage">, clearedStageIds: readonly number[]) {
  return isStageUnlocked(intent.stage, clearedStageIds) ? intent.stage : getHighestUnlockedStage(clearedStageIds);
}

export type RunReportAction = {
  kind: "retry" | "next";
  label: string;
  /** Dugmenin ikinci satiri: nereye gidecegi ("4. aşama · Düşüş"). */
  detail: string;
  intent: QuickStartIntent;
};

export type RunReportActions = {
  retry?: RunReportAction;
  next?: RunReportAction;
  /** Buyuk dugme: zaferde siradaki asama aciksa o, yoksa tekrar. */
  primary: "retry" | "next";
};

function describeActionTarget(mode: QuickStartMode, stage: number) {
  const target = `${stage}. aşama · ${getStage(stage).name}`;
  if (mode === "online") return `yeni oda · ${target}`;
  if (mode === "creative") return `yaratıcı · ${target}`;
  return target;
}

/**
 * Raporun dugmeleri.
 *
 * "Tekrar" ayni operator, ayni asama, ayni harita olcegi ve ayni kip. Co-op
 * grubu bir yeniden yuklemede bir arada tutulamiyor; o yuzden co-op'ta tekrar
 * ayni ayarlarla oda kurma ekranini aciyor ve dugme bunu soyluyor. "Sonraki
 * aşama" yalnizca bu tarayicida acik oldugunda: acilis kosunun kaydindan
 * sonra okunan listeden. Son asamadan sonra yok.
 */
export function planRunReportActions(input: {
  result: "victory" | "defeat";
  stage?: number;
  mode: QuickStartMode;
  characterId: CharacterId;
  mapScale: number;
  clearedStageIds: readonly number[];
  now: number;
}): RunReportActions {
  const actions: RunReportActions = { primary: "retry" };
  const retryStage = input.stage !== undefined && isQuickStartStage(input.stage)
    ? resolveQuickStartStage({ stage: input.stage }, input.clearedStageIds)
    : getHighestUnlockedStage(input.clearedStageIds);
  const retryIntent = createQuickStartIntent({ mode: input.mode, stage: retryStage, characterId: input.characterId, mapScale: input.mapScale }, input.now);
  if (retryIntent) {
    actions.retry = { kind: "retry", label: "Tekrar", detail: describeActionTarget(input.mode, retryStage), intent: retryIntent };
  }
  const nextStage = input.stage !== undefined && isQuickStartStage(input.stage) ? input.stage + 1 : undefined;
  if (nextStage !== undefined && nextStage <= STAGE_COUNT && isStageUnlocked(nextStage, input.clearedStageIds)) {
    const nextIntent = createQuickStartIntent({ mode: input.mode, stage: nextStage, characterId: input.characterId, mapScale: input.mapScale }, input.now);
    if (nextIntent) {
      actions.next = { kind: "next", label: "Sonraki aşama", detail: describeActionTarget(input.mode, nextStage), intent: nextIntent };
      if (input.result === "victory") actions.primary = "next";
    }
  }
  if (!actions.retry && actions.next) actions.primary = "next";
  return actions;
}

/**
 * Raporun acilis sesleri: sonuc tinisi hemen, rekor rozeti gorundugunde
 * ikinci bir kisa tini. Rozetin CSS gecikmesiyle ayni sabit.
 */
export const RUN_REPORT_BADGE_DELAY_MS = 620;

/**
 * Rapor acildiktan sonra dugmelerin dokunusu kabul etmeye basladigi an.
 *
 * Rapor mac bitince kendiliginden aciliyor ve dugmeleri 375 px'te ekranin
 * alt seridinde, HUD'in kule ve ulti dugmelerinin tam yerinde duruyor. Son
 * saniyelerde HUD'a yapilan dokunus "Tekrar"a inmemeli: oyuncu kazandigi
 * raporu hic gormeden yeni kosu baslardi. Kart seciminin bekleme suresiyle
 * ayni fikir; 600 ms panelin 320 ms'lik acilisini da kapsiyor, yani dugme
 * yari saydamken basilmiyor.
 */
export const RUN_REPORT_ACTIONABLE_AFTER_MS = 600;

export type RunReportCue = { atMs: number; kind: "reportWin" | "reportLoss" | "reportRecord" };

/**
 * Hareket azaltma sesi degistirmiyor (kart acilisindaki gibi sesler kaliyor);
 * rozet zaten yerinde duruyorsa ikinci tini de hemen ardindan geliyor.
 */
export function getRunReportCues(input: { result: "victory" | "defeat"; celebrated: boolean; reducedMotion: boolean }): RunReportCue[] {
  const cues: RunReportCue[] = [{ atMs: 0, kind: input.result === "victory" ? "reportWin" : "reportLoss" }];
  if (input.celebrated) cues.push({ atMs: input.reducedMotion ? 240 : RUN_REPORT_BADGE_DELAY_MS, kind: "reportRecord" });
  return cues;
}
