import { FINAL_WAVE, KILL_STREAK_RULES, getWaveAirMode, type KillStreakTier } from "../balance/index.js";
import type { KillAssistKind } from "../feedback/assists.js";
import type { CharacterId } from "../index.js";
import { TOWER_TIER_3_LEVEL } from "../tower-stats/index.js";

/**
 * Kosu izi: dalga karnesi, kosu raporu, rekor ve yildizlarin tek veri omurgasi.
 *
 * Sunucu her olguyu (sizinti, oldurme, hasar, seri kademesi, onuncu seviye)
 * bir kez buraya yaziyor; dalga sonu karnesi de mac sonu raporu da ayni
 * defterden cikiyor. Her ozellik kendi sayacini ayrica tutsaydi karne bir sey,
 * rapor baska bir sey soylerdi.
 *
 * Temiz dalga ve yildiz kalan nexus canina degil **sizintiya** bakiyor. Can
 * savunmayi olcmuyor: kan bankasi her kurulum sonunda can dusuruyor (bir kart
 * secimini cezalandirirdi), iyilestirmeler sizintiyi sakliyor, nexus kalkani
 * sizintiyi can degismeden yutuyor. Kalkanin tuttugu dusman da sizinti
 * sayiliyor; karne onu ayrica "kalkan tuttu" diye yazabilsin diye ayri tutuluyor.
 *
 * Oyuncular yuvayla (0-3) anahtarlaniyor, oturum kimligiyle degil: yeniden
 * baglanan oyuncu ayni yuvayi aliyor ama oturum kimligi degisiyor. Kimlikle
 * tutulsaydi kopup donen oyuncunun oldurmeleri iki kisiye bolunurdu.
 *
 * Buradaki her sey tanima icin; hicbir sayi oyuna guc olarak geri donmuyor.
 */

/** Kosu raporunun bicim surumu; istemci kaydi eski bicimi bununla ayiriyor. */
export const RUN_SUMMARY_VERSION = 1;

/**
 * Raporun tuttugu en fazla dalga.
 *
 * Normal kosu en fazla `FINAL_WAVE` dalga yaziyor. Yaratici mod dalgayi geri
 * sarabildigi icin ayni numara tekrar gelebilir; sinir, sonsuz bir yaratici
 * oturumun raporu sisirmesini engelliyor. Toplamlar ayri sayildigi icin eski
 * dalganin dusmesi toplamlari bozmuyor.
 */
export const RUN_WAVE_HISTORY_LIMIT = FINAL_WAVE * 2;

/** Bir dalgada kac oyuncu yuvasi olabilir; bozuk yuvanin seyrek dizi acmasini engelliyor. */
const MAX_RUN_SLOTS = 16;

/**
 * Bir dalganin karnesi.
 *
 * Anahtarlar tek harfli: dalga sonunda herkese bir kez, yeniden baglanmada bir
 * kez daha ve kosu raporunda dalga basina bir kez gidiyor. Sifir olan
 * ayrintilar (ucan sizinti, kalkan, can kaybi) yazilmiyor.
 */
export type WaveRecord = {
  /** Dalga numarasi. */
  w: number;
  /** Nexus'a ulasan dusman; kalkanin tuttugu da sayiliyor. */
  l: number;
  /** Sizintilarin ucan olanlari; yoksa alan yok. Kara sizintisi `l - (a ?? 0)`. */
  a?: number;
  /** Nexus kalkaninin can degismeden yuttugu sizinti; yoksa alan yok. */
  s?: number;
  /** Sizintilarin nexus'tan gercekten goturdugu can; yoksa alan yok. */
  h?: number;
  /** Takimin bu dalgadaki oldurmesi. */
  k: number;
  /** Yuva sirasiyla oyuncu basina oldurme: `p[slot]`. Sahipsiz oldurme yalnizca `k`da. */
  p: number[];
  /** Dalganin hava duzeni (`getWaveAirMode`); kara dalgasinda alan yok. */
  m?: "all" | "mixed";
  /** Bu dalga dahil ust uste temiz dalga sayisi; sizintili dalgada 0. */
  c: number;
  /** Kosu bu dalgada bitti (nexus dustu); yoksa alan yok. */
  d?: 1;
  /*
   * Co-op rol unvaninin olgulari (`pickRoleTitles`), yuva sirasiyla. Yalnizca
   * odada birden cok oyuncu varken ve dizide sifirdan buyuk bir deger varsa
   * yaziliyor; solo karne eskisiyle bayt bayt ayni kaliyor.
   */
  /** Isaret, donma ve yavaslatma asisti: `n[slot]`. */
  n?: number[];
  /** Zeynep komutunun asisti: `z[slot]`. */
  z?: number[];
  /** Iscilerin onardigi can (yuvarli): `r[slot]`. */
  r?: number[];
  /** Kule hasari (yuvarli): `t[slot]`. */
  t?: number[];
};

export type RunTowerSummary = {
  towerId: string;
  definitionId: string;
  name: string;
  /** Sahibinin yuvasi; sahibi bilinmiyorsa -1. */
  slot: number;
  /** Kosu boyunca verdigi hasar. Satilan ya da yikilan kule de sayiliyor. */
  damage: number;
  /** Son vurusundaki seviyesi. */
  level: number;
};

export type RunPlayerSummary = {
  slot: number;
  name: string;
  characterId: CharacterId;
  /** Oyuncunun kaynaklarinin (kule, yetenek, ulti) oldurdugu dusman. */
  kills: number;
  /** Oyuncunun kaynaklarinin gercekten verdigi hasar (asiri oldurme sayilmiyor). */
  damage: number;
  /** Secilen kartlar, secim sirasiyla; yigilan kart her alimda bir kez. */
  cards: string[];
  /** Kosuda ulastigi en yuksek oldurme serisi kademesi; hic seri yoksa alan yok. */
  bestStreakTier?: KillStreakTier;
  /** Oyuncunun en cok hasar veren kulesi; co-op satiri icin. */
  topTower?: RunTowerSummary;
  /*
   * Co-op rol unvaninin kosu olgulari; yalnizca co-op raporunda ve sifirdan
   * buyukse yaziliyor. Unvan istemcide degil bu sayilardan seciliyor.
   */
  /** Isaret, donma ve yavaslatma asisti. */
  assists?: number;
  /** Zeynep komutunun takim arkadasinin oldurmesindeki asisti. */
  commandAssists?: number;
  /** Iscilerin onardigi can (yuvarli). */
  repaired?: number;
  /** Kulelerin toplam hasari (yuvarli); `damage` yetenek ve ultiyi de sayiyor. */
  towerDamage?: number;
  /**
   * Kosu boyunca yalnizligin ve dizilimin kattigi tahmini hasar
   * (`estimateSynergyShare`); sifirsa alan yok. Raporun "en iyi an"i icin.
   */
  isolationShare?: number;
  formationShare?: number;
};

/** Kosunun en yuksek seri ani: kademe, sahibi ve dalgasi. */
export type RunStreakMoment = { tier: KillStreakTier; slot: number; wave: number };

/** Kosuda bir kulenin ilk kez onuncu seviyeye cikisi. */
export type RunLevelMoment = { wave: number; slot: number; towerId: string; definitionId: string; name: string };

/**
 * Mac sonu raporu. Macta bir kez (ve yeniden baglanmada bir kez daha)
 * gidiyor; bu yuzden anahtarlar okunur, yalnizca dalga karneleri kisa.
 */
export type RunSummary = {
  version: typeof RUN_SUMMARY_VERSION;
  /** Kosunun kimligi: yeniden baglanan istemci ayni kosuyu iki kez kaydetmesin. */
  id: string;
  result: "victory" | "defeat";
  stage: number;
  /** Kosunun bittigi dalga: yenilgide dusulen dalga, zaferde son dalga. */
  wave: number;
  finalWave: number;
  /** Yaratici kosu; hicbir kayda yazilmaz (`canRecordProgress`). Degilse alan yok. */
  creative?: boolean;
  /**
   * Odadaki oyuncu sayisi. Co-op kosusu solo kayitlarla karismasin diye kayit
   * anahtarinin parcasi.
   */
  playerCount: number;
  /** Oynanan haritanin anahtari (`getRunMapKey`); kayit anahtarinin parcasi. */
  mapKey: string;
  /** Takimin toplam oldurmesi. */
  kills: number;
  /** Toplam sizinti (kalkanin tuttugu dahil). */
  leaks: number;
  /** Sizintisiz biten dalga sayisi (ust uste olmasi gerekmiyor). */
  cleanWaves: number;
  /** Kosu bittiginde suren temiz dalga serisi. */
  cleanStreak: number;
  bestCleanStreak: number;
  waves: WaveRecord[];
  players: RunPlayerSummary[];
  /** Kosunun en cok hasar veren kulesi; hic kule hasari yoksa alan yok. */
  mvp?: RunTowerSummary;
  bestStreak?: RunStreakMoment;
  firstLevel10?: RunLevelMoment;
};

/** `match:victory` / `match:defeat` mesaji. */
export type MatchResultPayload = {
  result: "victory" | "defeat";
  wave: number;
  kills: number;
  stage: number;
  creative?: boolean;
  run: RunSummary;
};

/** Sizintinin defterin ilgilendigi yanlari. */
export type RunLeak = {
  /** Ucan dusman mi. */
  air: boolean;
  /** Nexus kalkani tuttu mu. */
  absorbed: boolean;
  /** Nexus'un bu sizintida gercekten kaybettigi can. */
  hpLost: number;
};

/** Hasar veren kulenin defterin okudugu alanlari; sunucunun kule modeli bunu sagliyor. */
export type RunLedgerTower = {
  id: string;
  level: number;
  definition: { id: string; name: string };
};

/** Raporun oyuncu satirinin defter disindan gelen kismi. */
export type RunLedgerPlayer = {
  slot: number;
  name: string;
  characterId: CharacterId;
  cards: readonly string[];
};

export type RunSummaryContext = {
  id: string;
  result: "victory" | "defeat";
  stage: number;
  wave: number;
  creative: boolean;
  mapKey: string;
  players: readonly RunLedgerPlayer[];
};

/**
 * Kayit anahtarinin harita parcasi.
 *
 * Sunucu oyun basladiginda haritayi olcekteki acik arenaya ceviriyor; menude
 * secili ozel harita oyuna girmiyor. Anahtar bu yuzden sunucudan geliyor ve
 * yalnizca olcege bakiyor. Ozel harita bir gun oyuna girerse anahtar onun
 * ozetini de tasimali, yoksa farkli yollar ayni rekoru paylasirdi.
 */
export function getRunMapKey(mapScale: number) {
  return `arena@${Math.round(mapScale)}`;
}

/** Kosu kimligi: zaman ve rastgele kuyruk; ayni odanin iki kosusu da ayrisiyor. */
export function createRunId(now = Date.now(), random = Math.random) {
  return `${Math.max(0, Math.floor(now)).toString(36)}-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;
}

/**
 * Temiz dalga: sizintisiz ve kosunun bittigi dalga degil.
 *
 * Gercek oyunda yenilgi yalnizca bir sizintiyla geliyor; ikinci kosul yine de
 * burada, cunku olunen dalgayi "temiz" diye yazan bir rapor yalan soylerdi.
 */
export function isCleanWave(record: Pick<WaveRecord, "l" | "d">) {
  return record.l === 0 && !record.d;
}

/**
 * Seri kademesinin sirasi: kademe yoksa 0, en dusuk kademe 1.
 *
 * Kurallar listesi en yuksekten asagi dizili (sunucu ilk tutani seciyor); sira
 * buradan turetiliyor ki yeni bir kademe eklendiginde iki yer ayrismasin.
 */
export function getKillStreakTierRank(tier: KillStreakTier | undefined) {
  if (!tier) return 0;
  const index = KILL_STREAK_RULES.findIndex((rule) => rule.tier === tier);
  return index < 0 ? 0 : KILL_STREAK_RULES.length - index;
}

function isRunSlot(slot: number | undefined): slot is number {
  return typeof slot === "number" && Number.isInteger(slot) && slot >= 0 && slot < MAX_RUN_SLOTS;
}

type RunPlayerStats = {
  kills: number;
  damage: number;
  bestStreakTier?: KillStreakTier;
  isolationShare?: number;
  formationShare?: number;
  assists?: number;
  commandAssists?: number;
  repaired?: number;
};

/** Yuva dizisine ekler; yuva zaten dogrulanmis olmali (seyrek dizi acmasin). */
function addAt(values: number[], slot: number, amount: number) {
  for (let index = values.length; index < slot; index += 1) values[index] = 0;
  values[slot] = (values[slot] ?? 0) + amount;
}

/** Karnenin derin kopyasi: rapordaki dizi defterin dizisini paylasmasin. */
function copyWaveRecord(record: WaveRecord): WaveRecord {
  const copy: WaveRecord = { ...record, p: [...record.p] };
  if (record.n) copy.n = [...record.n];
  if (record.z) copy.z = [...record.z];
  if (record.r) copy.r = [...record.r];
  if (record.t) copy.t = [...record.t];
  return copy;
}

/** En cok hasar veren kule; esitlikte once hasar yazan kazaniyor (Map sirasi). */
function pickTopTower(towers: Iterable<RunTowerSummary>): RunTowerSummary | undefined {
  let best: RunTowerSummary | undefined;
  for (const tower of towers) {
    if (tower.damage > 0 && (!best || tower.damage > best.damage)) best = tower;
  }
  return best ? { ...best, damage: Math.round(best.damage) } : undefined;
}

/**
 * Kosunun defteri.
 *
 * Dalga sayaclari dalga kapaninca sifirlaniyor, savas basinda degil: kapanis
 * tek bir yer (dalga temizlenmesi ya da yenilgi), baslangic ise birkac yol
 * (kurulumun bitmesi, yaratici modda dusman gondermek). Kurulumda sizinti ve
 * oldurme olmadigi icin ikisi ayni sonucu veriyor.
 */
export class RunLedger {
  private waveLeaks = 0;
  private waveAirLeaks = 0;
  private waveShieldLeaks = 0;
  private waveHpLost = 0;
  private waveKills = 0;
  private waveKillsBySlot: number[] = [];
  private waveAssistsBySlot: number[] = [];
  private waveCommandAssistsBySlot: number[] = [];
  private waveRepairBySlot: number[] = [];
  private waveTowerDamageBySlot: number[] = [];
  private readonly history: WaveRecord[] = [];
  private cleanStreak = 0;
  private bestCleanStreak = 0;
  private cleanWaves = 0;
  private totalLeaks = 0;
  private totalKills = 0;
  private readonly playerStats = new Map<number, RunPlayerStats>();
  private readonly towerStats = new Map<string, RunTowerSummary>();
  private bestStreak?: RunStreakMoment;
  private firstLevel10?: RunLevelMoment;

  /** Nexus'a ulasan dusman. Yenilgiyi getiren sizinti da once buraya yaziliyor. */
  recordLeak(leak: RunLeak) {
    this.waveLeaks += 1;
    if (leak.air) this.waveAirLeaks += 1;
    if (leak.absorbed) this.waveShieldLeaks += 1;
    if (leak.hpLost > 0) this.waveHpLost += leak.hpLost;
  }

  /** Olen dusman; sahibi biliniyorsa yuvasi. Sahipsiz oldurme yalnizca takima yaziliyor. */
  recordKill(slot?: number) {
    this.waveKills += 1;
    this.totalKills += 1;
    if (!isRunSlot(slot)) return;
    this.waveKillsBySlot[slot] = (this.waveKillsBySlot[slot] ?? 0) + 1;
    this.getPlayerStats(slot).kills += 1;
  }

  /** Oyuncunun herhangi bir kaynagindan (kule, yetenek, ulti) gercekten inen hasar. */
  recordPlayerDamage(slot: number | undefined, amount: number) {
    if (!isRunSlot(slot) || !(amount > 0)) return;
    this.getPlayerStats(slot).damage += amount;
  }

  /**
   * Co-op asisti: oldurmeyi baskasi yapti, bu yuva hazirladi. Komut asisti
   * ayri sayiliyor (Komutan unvani), geri kalani birlikte (Nişancı Ortağı).
   */
  recordAssist(slot: number | undefined, kind: KillAssistKind) {
    if (!isRunSlot(slot)) return;
    const stats = this.getPlayerStats(slot);
    if (kind === "command") {
      addAt(this.waveCommandAssistsBySlot, slot, 1);
      stats.commandAssists = (stats.commandAssists ?? 0) + 1;
    } else {
      addAt(this.waveAssistsBySlot, slot, 1);
      stats.assists = (stats.assists ?? 0) + 1;
    }
  }

  /** Iscinin onardigi can; iscinin sahibine yaziliyor (onaran o, kulenin sahibi degil). */
  recordRepair(slot: number | undefined, amount: number) {
    if (!isRunSlot(slot) || !(amount > 0) || !Number.isFinite(amount)) return;
    addAt(this.waveRepairBySlot, slot, amount);
    const stats = this.getPlayerStats(slot);
    stats.repaired = (stats.repaired ?? 0) + amount;
  }

  /**
   * Yerlesim kararinin bir vurustaki tahmini payi (yalnizlik ya da dizilim).
   * Vurus basina cagriliyor; sifir pay hicbir sey acmiyor.
   */
  recordSynergyShare(slot: number | undefined, kind: "isolation" | "formation", amount: number) {
    if (!isRunSlot(slot) || !(amount > 0) || !Number.isFinite(amount)) return;
    const stats = this.getPlayerStats(slot);
    if (kind === "isolation") stats.isolationShare = (stats.isolationShare ?? 0) + amount;
    else stats.formationShare = (stats.formationShare ?? 0) + amount;
  }

  /**
   * Kulenin verdigi hasar; MVP buradan.
   *
   * Kule kaydi kule silinince de kaliyor: MVP butun dalgalarin toplami, satilan
   * ya da yikilan kule de yarisiyor. Vurus basina cagriliyor, bu yuzden yeni
   * nesne yalnizca kulenin ilk vurusunda aciliyor.
   */
  recordTowerDamage(tower: RunLedgerTower, slot: number | undefined, amount: number) {
    if (!(amount > 0)) return;
    let entry = this.towerStats.get(tower.id);
    if (!entry) {
      entry = {
        towerId: tower.id,
        definitionId: tower.definition.id,
        name: tower.definition.name,
        slot: isRunSlot(slot) ? slot : -1,
        damage: 0,
        level: tower.level
      };
      this.towerStats.set(tower.id, entry);
    }
    entry.damage += amount;
    entry.level = tower.level;
    if (isRunSlot(slot)) addAt(this.waveTowerDamageBySlot, slot, amount);
  }

  /** Tetiklenen seri kademesi. Esit kademede ilk an kaliyor: "ilk kez ulastigin an". */
  recordStreak(slot: number | undefined, tier: KillStreakTier, wave: number) {
    if (!isRunSlot(slot)) return;
    const rank = getKillStreakTierRank(tier);
    const stats = this.getPlayerStats(slot);
    if (rank > getKillStreakTierRank(stats.bestStreakTier)) stats.bestStreakTier = tier;
    if (rank > getKillStreakTierRank(this.bestStreak?.tier)) this.bestStreak = { tier, slot, wave };
  }

  /** Kule seviye atladi; kosudaki ilk onuncu seviye an olarak kaliyor. */
  recordTowerLevel(tower: RunLedgerTower, slot: number | undefined, wave: number) {
    if (this.firstLevel10 || tower.level < TOWER_TIER_3_LEVEL) return;
    this.firstLevel10 = {
      wave,
      slot: isRunSlot(slot) ? slot : -1,
      towerId: tower.id,
      definitionId: tower.definition.id,
      name: tower.definition.name
    };
  }

  /**
   * Dalgayi kapatir, karnesini dondurur ve dalga sayaclarini sifirlar.
   *
   * `slots` odadaki oyuncularin yuvalari: hic oldurmeyen oyuncu da `p`de 0
   * olarak gorunsun diye dizinin boyu onlardan da cikiyor.
   */
  closeWave(wave: number, options: { died?: boolean; slots?: readonly number[] } = {}): WaveRecord {
    const clean = isCleanWave({ l: this.waveLeaks, d: options.died ? 1 : undefined });
    this.cleanStreak = clean ? this.cleanStreak + 1 : 0;
    this.bestCleanStreak = Math.max(this.bestCleanStreak, this.cleanStreak);
    if (clean) this.cleanWaves += 1;
    this.totalLeaks += this.waveLeaks;

    let size = this.waveKillsBySlot.length;
    for (const slot of options.slots ?? []) {
      if (isRunSlot(slot)) size = Math.max(size, slot + 1);
    }
    const record: WaveRecord = {
      w: wave,
      l: this.waveLeaks,
      k: this.waveKills,
      p: Array.from({ length: size }, (_, index) => this.waveKillsBySlot[index] ?? 0),
      c: this.cleanStreak
    };
    if (this.waveAirLeaks > 0) record.a = this.waveAirLeaks;
    if (this.waveShieldLeaks > 0) record.s = this.waveShieldLeaks;
    const hpLost = Math.round(this.waveHpLost);
    if (hpLost > 0) record.h = hpLost;
    const airMode = getWaveAirMode(wave);
    if (airMode !== "none") record.m = airMode;
    if (options.died) record.d = 1;
    // Rol olgulari yalnizca co-op'ta: soloda unvan yok, karne de buyumesin.
    const coopSlots = new Set((options.slots ?? []).filter(isRunSlot));
    if (coopSlots.size > 1) {
      const pack = (values: readonly number[]) => {
        const rounded = Array.from({ length: size }, (_, index) => Math.max(0, Math.round(values[index] ?? 0)));
        return rounded.some((value) => value > 0) ? rounded : undefined;
      };
      const assists = pack(this.waveAssistsBySlot);
      if (assists) record.n = assists;
      const commands = pack(this.waveCommandAssistsBySlot);
      if (commands) record.z = commands;
      const repaired = pack(this.waveRepairBySlot);
      if (repaired) record.r = repaired;
      const towerDamage = pack(this.waveTowerDamageBySlot);
      if (towerDamage) record.t = towerDamage;
    }

    this.history.push(record);
    if (this.history.length > RUN_WAVE_HISTORY_LIMIT) this.history.shift();
    this.waveLeaks = 0;
    this.waveAirLeaks = 0;
    this.waveShieldLeaks = 0;
    this.waveHpLost = 0;
    this.waveKills = 0;
    this.waveKillsBySlot = [];
    this.waveAssistsBySlot = [];
    this.waveCommandAssistsBySlot = [];
    this.waveRepairBySlot = [];
    this.waveTowerDamageBySlot = [];
    return record;
  }

  /** Son kapanan dalganin karnesi; yeniden baglanan oyuncuya gidiyor. */
  get latestWave(): WaveRecord | undefined {
    return this.history.at(-1);
  }

  get waves(): readonly WaveRecord[] {
    return this.history;
  }

  /** Kosunun raporu. Defteri degistirmiyor; ayni an icin iki kez cagrilabilir. */
  summarize(context: RunSummaryContext): RunSummary {
    const coop = context.players.length > 1;
    const players = [...context.players]
      .sort((left, right) => left.slot - right.slot)
      .map((player) => {
        const stats = this.playerStats.get(player.slot);
        const row: RunPlayerSummary = {
          slot: player.slot,
          name: player.name,
          characterId: player.characterId,
          kills: stats?.kills ?? 0,
          damage: Math.round(stats?.damage ?? 0),
          cards: [...player.cards]
        };
        if (stats?.bestStreakTier) row.bestStreakTier = stats.bestStreakTier;
        const isolationShare = Math.round(stats?.isolationShare ?? 0);
        if (isolationShare > 0) row.isolationShare = isolationShare;
        const formationShare = Math.round(stats?.formationShare ?? 0);
        if (formationShare > 0) row.formationShare = formationShare;
        const ownTowers = [...this.towerStats.values()].filter((tower) => tower.slot === player.slot);
        const topTower = pickTopTower(ownTowers);
        if (topTower) row.topTower = topTower;
        if (coop) {
          // Rol unvaninin olgulari: solo rapor eskisiyle ayni kalsin diye yalnizca co-op'ta.
          const assists = Math.round(stats?.assists ?? 0);
          if (assists > 0) row.assists = assists;
          const commandAssists = Math.round(stats?.commandAssists ?? 0);
          if (commandAssists > 0) row.commandAssists = commandAssists;
          const repaired = Math.round(stats?.repaired ?? 0);
          if (repaired > 0) row.repaired = repaired;
          const towerDamage = Math.round(ownTowers.reduce((sum, tower) => sum + tower.damage, 0));
          if (towerDamage > 0) row.towerDamage = towerDamage;
        }
        return row;
      });
    const summary: RunSummary = {
      version: RUN_SUMMARY_VERSION,
      id: context.id,
      result: context.result,
      stage: context.stage,
      wave: context.wave,
      finalWave: FINAL_WAVE,
      playerCount: players.length,
      mapKey: context.mapKey,
      kills: this.totalKills,
      leaks: this.totalLeaks,
      cleanWaves: this.cleanWaves,
      cleanStreak: this.cleanStreak,
      bestCleanStreak: this.bestCleanStreak,
      waves: this.history.map(copyWaveRecord),
      players
    };
    if (context.creative) summary.creative = true;
    const mvp = pickTopTower(this.towerStats.values());
    if (mvp) summary.mvp = mvp;
    if (this.bestStreak) summary.bestStreak = { ...this.bestStreak };
    if (this.firstLevel10) summary.firstLevel10 = { ...this.firstLevel10 };
    return summary;
  }

  private getPlayerStats(slot: number) {
    let stats = this.playerStats.get(slot);
    if (!stats) {
      stats = { kills: 0, damage: 0 };
      this.playerStats.set(slot, stats);
    }
    return stats;
  }
}
