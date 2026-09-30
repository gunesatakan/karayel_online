import { FINAL_WAVE } from "../balance/index.js";
import type { DefenseRow, DefenseSummary } from "../defense-insights.js";
import { getUltimateStampText, type UltimateAimTier } from "../feedback/ultimate.js";
import type { WaveRecord } from "../run-trace/index.js";
import { formatRunCount, pickBetterUltimate, scoreUltimateMoment, type RunUltimateMoment } from "./run-report.js";

/**
 * Dalga karnesi: kart secim perdesinin basligindaki serit.
 *
 * Dalga sonu zaten bir duraklama: sunucu temizlenmeden sonra 2 sn bekliyor,
 * sonra kart ekrani aciliyor. Karne yeni bir pencere acmiyor, o perdenin
 * basligina oturuyor ("Kusursuz ×6 · 23 öldürme · ◆ +412 · MVP Takipçi 1.240")
 * ve altinda tek bir one cikan satir var. Dalga ortasinda hicbir sey acilmiyor.
 *
 * Her sayi zaten var olan bir olgudan: sizinti ve temiz seri sunucunun
 * `wave:report`undan (kosu defteri), en iyi kule sahibine giden savunma
 * ozetinden, altin dalga damgasinin sayisindan (`WaveClearWatch`), ulti
 * derecesi `ultimate:result`tan. Karne kendi sayacini tutmuyor; rapor ve
 * rekorlarla ayni defteri okuyor.
 *
 * Co-op'ta karne senin: oldurme senin yuvanin sayisi, kule senin kulen, altin
 * senin altinin. Takim arkadasinin sayisi yok -- yan yana konan iki sayi bir
 * yarisa donerdi. Sizinti ve temiz seri takimin ortak olgusu, o yuzden ortak.
 *
 * Saf mantik: DOM yok. Istemci (apps/web/src/wave-report-ui.ts) bunu ciziyor;
 * testler metni ve secim kurallarini dogrudan olcuyor. Karne taninma: hicbir
 * satiri oyuna guc olarak donmuyor.
 */

/**
 * Temiz serinin kutlandigi adim: 5, 10, 15, 20.
 *
 * Seri her temiz dalgada sessizce bir artiyor; neredeyse her dalga olan bir
 * seye her seferinde gosteri yapmak onu gurultuye cevirirdi. Yalnizca bu
 * esiklerde kucuk bir parilti var.
 */
export const CLEAN_STREAK_MILESTONE_STEP = 5;

/**
 * "Kıl payı" esigi: dalga bittiginde nexus cani bunun altinda.
 *
 * Can bir derece degil (kan bankasi, iyilestirme ve kalkan onu bozuyor; yildiz
 * bu yuzden sizintiya bakiyor). Burada yalnizca bir an olarak soyleniyor:
 * dalga gercekten can goturdu ve nexus bu esigin altinda kaldi.
 */
export const NEAR_MISS_HEALTH_RATIO = 0.3;

/** Temiz seri kutlanacak bir esikte mi (5/10/15/20). Kosunun son dalgasindan otesi yok. */
export function isCleanStreakMilestone(streak: number) {
  return Number.isInteger(streak) && streak > 0 && streak <= FINAL_WAVE && streak % CLEAN_STREAK_MILESTONE_STEP === 0;
}

export type WaveReportChipKind = "clean" | "leak" | "kills" | "gold" | "mvp";

export type WaveReportChip = {
  kind: WaveReportChipKind;
  /** Seritte gorunen kisa metin. */
  text: string;
  /** Ekran okuyucu icin acik hali ("◆ +412" yerine "+412 altın"). */
  label: string;
  /** Temiz seri 5/10/15/20'de: cip bir kez parliyor. */
  milestone?: true;
};

export type WaveReportHighlightKind = "ultimate" | "nearMiss" | "assist";

export type WaveReportHighlight = {
  kind: WaveReportHighlightKind;
  text: string;
  /** Yalnizca sutun ultisi: nisanin derecesi (renk icin). */
  tier?: UltimateAimTier;
};

export type WaveReportCard = {
  wave: number;
  chips: WaveReportChip[];
  highlight?: WaveReportHighlight;
  /** Kutlanan temiz seri (5/10/15/20); yoksa alan yok. */
  milestone?: number;
  /** Tek cumle: seridin erisilebilir adi. Istemci degisti mi diye de buna bakiyor. */
  label: string;
};

export type WaveReportHealth = { health: number; maxHealth: number };

export type WaveReportCardInput = {
  /** Kart perdesinin dalgasi. */
  wave: number | undefined;
  /** Sunucunun karnesi; baska bir dalganinsa kullanilmiyor. */
  record?: WaveRecord;
  localSlot: number;
  /** Odada birden cok oyuncu var: oldurme senin yuvanin sayisi. */
  coop: boolean;
  /** Yaratici kosu: dusmani sen seciyorsun, seri kutlanmiyor. */
  creative: boolean;
  /** Sahibine giden savunma ozeti (yalnizca senin kulelerin). */
  defense?: DefenseSummary;
  /** Bu dalgada kazandigin altin (dalga damgasinin sayisi); bilinmiyorsa yok. */
  gold?: number;
  /** Karne yokken solo oyunda dalga damgasinin oldurme sayisi. */
  kills?: number;
  /** Dalga bittigindeki nexus cani. */
  health?: WaveReportHealth;
  /** Bu dalganin en iyi kendi ultin. */
  ultimate?: RunUltimateMoment;
};

function toCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function toWave(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : undefined;
}

/** Savunma ozetinin en cok hasar veren kulesi; esitlikte ozetin ilk satiri (sunucu hasara gore diziyor). */
function pickTopDefenseRow(rows: readonly DefenseRow[]): DefenseRow | undefined {
  let best: DefenseRow | undefined;
  for (const row of rows) {
    if (typeof row?.name !== "string" || !(toCount(row.damage) > 0)) continue;
    if (!best || toCount(row.damage) > toCount(best.damage)) best = row;
  }
  return best;
}

/**
 * Tek one cikan satir, oncelik sirasiyla:
 *
 * 1. Bu dalgadaki kendi ultinin sonucu ve (sutunda) nisan derecesi. Iskalanan
 *    ulti an degil; raporun "en iyi an"i ile ayni olcu (`scoreUltimateMoment`).
 * 2. "Kıl payı": dalga can goturdu ve nexus %30'un altinda bitirdi.
 * 3. Yalnizca co-op'ta: takip isaretinin takima kattigi hasar
 *    (`markAssistDamage`). Sunucu Takipci disindaki her kulenin isaretli
 *    dusmana vurusunu sayiyor, oyuncunun kendi kuleleri de dahil. Soloda bu
 *    satir neredeyse her dalga ayni seyi (kendi kulelerinin kendi isaretinden
 *    yararlandigini) tekrar ederdi ve takim diyecek kimse yok; o yuzden
 *    atlaniyor. Co-op'ta sayi "senin kulelerin dahil takimin kuleleri"; yalnizca
 *    arkadaslarin payini ayirmak sunucuda bir sahip ayrimi isterdi.
 *
 * Uymayan satir atlaniyor; hicbiri uymuyorsa satir yok.
 */
export function pickWaveReportHighlight(input: {
  record?: WaveRecord;
  defense?: DefenseSummary;
  health?: WaveReportHealth;
  ultimate?: RunUltimateMoment;
  /** Odada birden cok oyuncu var: takip katkisi satiri ancak o zaman. */
  coop?: boolean;
}): WaveReportHighlight | undefined {
  if (input.ultimate && scoreUltimateMoment(input.ultimate) > 0) {
    const stamp = getUltimateStampText(input.ultimate);
    // Rapordaki "en iyi an" ile ayni metin: oyuncu ayni ani iki yerde ayni sozle gorsun.
    const highlight: WaveReportHighlight = { kind: "ultimate", text: stamp.grade ? `${stamp.title} · ${stamp.grade.text}` : stamp.title };
    if (stamp.grade) highlight.tier = stamp.grade.tier;
    return highlight;
  }

  const health = input.health;
  if (input.record && toCount(input.record.h) > 0 && health && health.maxHealth > 0 && health.health > 0) {
    const ratio = health.health / health.maxHealth;
    if (ratio < NEAR_MISS_HEALTH_RATIO) {
      // Asagi yuvarlaniyor: %29,6 "%30" yazsaydi esigin altinda oldugu okunmazdi.
      const percent = Math.max(1, Math.floor(ratio * 100));
      return { kind: "nearMiss", text: `Kıl payı · nexus %${percent} canla dayandı` };
    }
  }

  if (!input.coop) return undefined;
  const assist = (input.defense?.rows ?? []).reduce((sum, row) => sum + toCount(row?.markAssistDamage), 0);
  if (assist > 0) {
    return { kind: "assist", text: `Takip işaretin takıma +${formatRunCount(assist)} hasar kattı` };
  }
  return undefined;
}

/**
 * Karnenin satirlari.
 *
 * Her parca ancak kendi dalgasinin verisiyle yaziliyor: baska dalganin karnesi,
 * ozeti ya da damgasi karismiyor (yaratici mod dalgayi degistirebiliyor,
 * yeniden baglanmada veri sirasiz gelebiliyor). Bilinmeyen parca yazilmiyor;
 * yanlis bir sayi gostermektense hic gostermemek. Hicbir parca yoksa karne yok.
 */
export function buildWaveReportCard(input: WaveReportCardInput): WaveReportCard | undefined {
  const wave = toWave(input.wave);
  if (wave === undefined) return undefined;
  const record = input.record && input.record.w === wave ? input.record : undefined;
  const defense = input.defense && input.defense.wave === wave ? input.defense : undefined;
  const chips: WaveReportChip[] = [];
  let milestone: number | undefined;

  // Olunen dalganin karnesi kart perdesine hic gelmiyor (rapor aciliyor); yine
  // de ne temiz ne sizintili diye yaziliyor, "0 sızıntı" yalan olurdu.
  if (record && !record.d) {
    const leaks = toCount(record.l);
    if (leaks === 0) {
      // Seri her temiz dalgada sessizce artiyor; parilti yalnizca esiklerde.
      const streak = Math.max(1, toCount(record.c));
      const celebrated = !input.creative && isCleanStreakMilestone(streak);
      const chip: WaveReportChip = {
        kind: "clean",
        text: `Kusursuz ×${streak}`,
        label: celebrated ? `${streak} dalga üst üste kusursuz` : `Kusursuz dalga, seri ${streak}`
      };
      if (celebrated) {
        chip.milestone = true;
        milestone = streak;
      }
      chips.push(chip);
    } else {
      const shielded = toCount(record.s);
      chips.push({
        kind: "leak",
        text: `${formatRunCount(leaks)} sızıntı`,
        label: `${formatRunCount(leaks)} sızıntı${shielded > 0 ? `, ${shielded} tanesini kalkan tuttu` : ""}`
      });
    }
  }

  // Co-op'ta yalnizca senin oldurmen: takimin toplami senin sayin gibi okunurdu.
  const kills = record
    ? (input.coop ? toCount(record.p?.[input.localSlot]) : toCount(record.k))
    : (input.coop || input.kills === undefined ? undefined : toCount(input.kills));
  if (kills !== undefined) {
    const text = input.coop ? `${formatRunCount(kills)} öldürmen` : `${formatRunCount(kills)} öldürme`;
    chips.push({ kind: "kills", text, label: input.coop ? `senin ${formatRunCount(kills)} öldürmen` : text });
  }

  const gold = toCount(input.gold);
  if (gold > 0) {
    chips.push({ kind: "gold", text: `◆ +${formatRunCount(gold)}`, label: `+${formatRunCount(gold)} altın` });
  }

  const top = defense ? pickTopDefenseRow(defense.rows ?? []) : undefined;
  if (top) {
    const damage = formatRunCount(top.damage);
    chips.push({ kind: "mvp", text: `MVP ${top.name} ${damage}`, label: `en iyi kulen ${top.name}, ${damage} hasar` });
  }

  if (chips.length === 0) return undefined;
  const card: WaveReportCard = {
    wave,
    chips,
    label: `Dalga ${wave} karnesi: ${chips.map((chip) => chip.label).join(", ")}`
  };
  // Ulti yalnizca kendi karnesiyle eslesiyorsa: hangi dalgaya ait oldugunu karne belirliyor.
  const highlight = pickWaveReportHighlight({ record, defense, health: input.health, ultimate: record ? input.ultimate : undefined, coop: input.coop });
  if (highlight) {
    card.highlight = highlight;
    card.label += `. ${highlight.text}`;
  }
  if (milestone !== undefined) card.milestone = milestone;
  return card;
}

/**
 * Telden gelen karneyi dogrular ve kopyalar; bozuk karne yok sayiliyor.
 * Sunucunun kendi yuku ama istemci ona guvenip dizi indeksliyor.
 */
export function sanitizeWaveRecord(raw: unknown): WaveRecord | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const wave = toWave(source.w);
  if (wave === undefined || typeof source.l !== "number" || typeof source.k !== "number" || typeof source.c !== "number") return undefined;
  const slots = Array.isArray(source.p) ? source.p.slice(0, 16) : [];
  const record: WaveRecord = { w: wave, l: toCount(source.l), k: toCount(source.k), p: slots.map(toCount), c: toCount(source.c) };
  if (toCount(source.a) > 0) record.a = toCount(source.a);
  if (toCount(source.s) > 0) record.s = toCount(source.s);
  if (toCount(source.h) > 0) record.h = toCount(source.h);
  if (source.m === "all" || source.m === "mixed") record.m = source.m;
  if (source.d === 1) record.d = 1;
  return record;
}

function isSameWaveRecord(left: WaveRecord, right: WaveRecord) {
  return left.w === right.w && left.l === right.l && left.k === right.k && left.c === right.c
    && left.a === right.a && left.s === right.s && left.h === right.h && left.m === right.m && left.d === right.d
    && left.p.length === right.p.length && left.p.every((value, index) => value === right.p[index]);
}

/** Dalga temizlendigi an istemcinin gordugu: damganin sayilari ve nexus cani. */
export type WaveClearCapture = {
  wave: number;
  gold?: number;
  kills?: number;
  health?: number;
  maxHealth?: number;
};

/**
 * Karnenin parcalarini dalgasina baglayan defter.
 *
 * Parcalar farkli yollardan geliyor: karne ve savunma ozeti sunucudan kart
 * seciminden hemen once, altin ve can dalga damgasiyla (oynatma 500 ms
 * geriden), ulti sonucu atis aninda ya da suresi bitince. Ulti hangi dalgaya
 * ait? Sunucunun mesaj sirasi: bir karneden once gelen her ulti o karnenin
 * dalgasinda atildi. Snapshot'taki dalga numarasi bunu soyleyemezdi --
 * oynatma geriden geldigi icin yeni dalganin ilk ultisi eski dalgaya
 * yazilirdi.
 *
 * Suresi olan ultiler (Kabus, Sempati) ve drone'lar sonucunu bittiklerinde
 * yolluyor; dalganin son saniyelerinde atilan biri karneden sonra, kurulumda
 * gelebiliyor. Karne ile bir sonraki dalganin basladigi an arasi bu yuzden bir
 * "kapanis" araligi: orada gelen sonuc az once biten dalgaya yaziliyor, bir
 * sonrakine degil. Aralik sahnenin gordugu dalga baslangiciyla kapaniyor
 * (`noteWaveStarted`). Kurulumda atilan bir ulti hic isabet etmediginden 0
 * puan alir ve biten dalganin ultisini ezemez.
 *
 * Ayni karnenin yeniden gonderimi (yeniden baglanma, `run:sync`) yeni bir
 * dalga sayilmiyor: o dalganin ultisi silinmiyor, siradakine de gecmiyor.
 */
export class WaveReportTracker {
  private record?: WaveRecord;
  private recordUltimate?: RunUltimateMoment;
  private pendingUltimate?: RunUltimateMoment;
  private clear?: WaveClearCapture;
  /** Karne geldi, bir sonraki dalga henuz baslamadi: gelen ulti sonucu biten dalganin. */
  private settling = false;

  /**
   * Kendi ultinin sonucu. Kapanis araliginda az once biten dalganin karnesine
   * yaziliyor (true: o dalganin perdesi aciksa tazelenmeli), yoksa karnesi
   * henuz gelmemis dalgaya (false).
   */
  noteUltimate(result: RunUltimateMoment | undefined) {
    if (this.settling && this.record) {
      this.recordUltimate = pickBetterUltimate(this.recordUltimate, result);
      return true;
    }
    this.pendingUltimate = pickBetterUltimate(this.pendingUltimate, result);
    return false;
  }

  /** `wave:report`. Yeni bir karneyse true; bozuk karne ya da yeniden gonderim false. */
  receiveReport(raw: unknown) {
    const record = sanitizeWaveRecord(raw);
    if (!record || (this.record && isSameWaveRecord(this.record, record))) return false;
    this.record = record;
    this.recordUltimate = this.pendingUltimate;
    this.pendingUltimate = undefined;
    this.settling = true;
    return true;
  }

  /**
   * Bir sonraki dalga basladi: kapanis araligi bitti, bundan sonraki ulti
   * sonuclari siradaki karneyi bekliyor. Ayni dalgada tekrar cagrilmasi zararsiz.
   */
  noteWaveStarted() {
    this.settling = false;
  }

  /** Dalga damgasinin ani. Ayni dalga icin sonraki yakalama oncekinin yerine geciyor. */
  noteClear(capture: WaveClearCapture) {
    const wave = toWave(capture.wave);
    if (wave === undefined) return false;
    this.clear = { ...capture, wave };
    return true;
  }

  get latestWave() {
    return this.record?.w;
  }

  /**
   * Karne. `wave` kart perdesinin dalgasi; bilinmiyorsa son karnenin dalgasi.
   * Nexus cani once temizlenme anindan; o an gorulmediyse cagiranin verdigi
   * (molada ve kart secimi boyunca can degismiyor).
   */
  build(input: Omit<WaveReportCardInput, "wave" | "record" | "gold" | "kills" | "ultimate"> & { wave?: number }) {
    const wave = toWave(input.wave) ?? this.record?.w;
    if (wave === undefined) return undefined;
    const record = this.record?.w === wave ? this.record : undefined;
    const clear = this.clear?.wave === wave ? this.clear : undefined;
    const health = clear && typeof clear.health === "number" && typeof clear.maxHealth === "number"
      ? { health: clear.health, maxHealth: clear.maxHealth }
      : input.health;
    return buildWaveReportCard({
      ...input,
      wave,
      record,
      gold: clear?.gold,
      kills: clear?.kills,
      health,
      ultimate: record ? this.recordUltimate : undefined
    });
  }

  /** Yeni oda: eski kosunun karnesi yeni oyuna sizmasin. */
  reset() {
    this.record = undefined;
    this.recordUltimate = undefined;
    this.pendingUltimate = undefined;
    this.clear = undefined;
    this.settling = false;
  }
}
