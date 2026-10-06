import { cardCatalog, getCardRarity, type CardRarity } from "../cards/index.js";
import type { RunSummary } from "../run-trace/index.js";
import { shopCatalog, type ShopItemCategory } from "../shop/index.js";

/**
 * Kart Arsivi: bu tarayicida kart seciminde ya da altin magazasinda goruldu
 * olan kartlar ve esyalar, bir de kartin kac kosuda secildigi.
 *
 * Kural burada, depo istemcide (apps/web/src/card-archive.ts). Ayrim testler
 * icin: birlestirme, sayim ve menu gorunumu tarayici olmadan dogrulanabilsin.
 *
 * Hepsi taninma. Arsiv hicbir yoldan stat, altin, kart ya da cekilis agirligi
 * olarak oyuna donmuyor; %100 arsiv de bir sey acmiyor (tam arsiv olcumde
 * 75-125 kosu surdu, zorunlu bir hedef olamaz). "YENİ" etiketi yalnizca bir
 * etiket: secimi yeniligin cekimine kaptirmasin diye sessiz ve bonussuz.
 *
 * Depo kurcalanabilir (stage-progress.ts ayni bedeli kabul ediyor); ustune
 * siralama kurulmuyor.
 */

/** Deponun bicim surumu; anahtar da surumlu (`karayel_archive_v1`). */
export const CARD_ARCHIVE_VERSION = 1;

/**
 * Arsiv listelerinin tavani. Katalog 113 kart ve 85 esya; tavan kurcalanmis
 * bir deponun menuyu yavaslatmasini engelliyor ve katalog buyudukce payi var.
 */
export const MAX_ARCHIVE_IDS = 512;

/**
 * "Kac kosuda secildi" sayilan son kosularin kimlikleri. Sonuc yeniden
 * baglanmada ve `run:sync` ile tekrar gelebiliyor; ayni kosu iki kez
 * sayilmasin. Kosu kaydinin tavani (50) kadar tutmaya gerek yok: ayni kosu
 * yalnizca ayni sayfada tekrar geliyor.
 */
export const ARCHIVE_RUN_ID_LIMIT = 30;

/** Kart ve esya kimlikleri katalogda boyle yaziliyor (`namlu-asinmasi`). */
const ARCHIVE_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
/** Kosu kimligi `createRunId` bicimi; kayit modulundeki desenle ayni. */
const ARCHIVE_RUN_ID_PATTERN = /^[a-z0-9-]{1,40}$/i;
const MAX_PICK_COUNT = 1_000_000;

export type ArchiveKind = "cards" | "items";

export type CardArchive = {
  /** Gorulen kartlar, ilk gorulme sirasiyla. */
  cards: string[];
  /** Gorulen magaza esyalari, ilk gorulme sirasiyla. */
  items: string[];
  /** Kartin secildigi kosu sayisi; ayni kosuda yigilan kart bir kez. */
  picks: Record<string, number>;
  /** Sayilmis kosularin kimlikleri, eskiden yeniye. */
  runs: string[];
};

/** Depoya yazilan bicim. */
export type StoredCardArchive = { v: typeof CARD_ARCHIVE_VERSION } & CardArchive;

export function createEmptyCardArchive(): CardArchive {
  return { cards: [], items: [], picks: {}, runs: [] };
}

function isArchiveId(value: unknown): value is string {
  return typeof value === "string" && ARCHIVE_ID_PATTERN.test(value);
}

/**
 * Kimlik listesini temizler: bicimi tutmayan ve yinelenen kimlik dusuyor.
 *
 * Katalogda olmayan ama bicimi dogru kimlik kaliyor. Eski bir sekme (daha az
 * karti bilen onbellekli surum) okuyup geri yazdiginda yeni surumun gordugu
 * kartlari silmesin; sayim zaten yalnizca katalogdakileri sayiyor.
 */
function sanitizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (seen.size >= MAX_ARCHIVE_IDS) break;
    if (isArchiveId(value)) seen.add(value);
  }
  return [...seen];
}

/**
 * Depodan okunan arsiv; her zaman temiz bir arsiv donuyor.
 *
 * Surumu tutmayan ya da bicimi bozuk her sey eleniyor. Bozuk depo menuyu ve
 * kart secimini kirmamali; en kotu durumda arsiv bos.
 */
export function sanitizeCardArchive(raw: unknown): CardArchive {
  const archive = createEmptyCardArchive();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return archive;
  const stored = raw as Partial<StoredCardArchive>;
  if (stored.v !== CARD_ARCHIVE_VERSION) return archive;
  archive.cards = sanitizeIds(stored.cards);
  archive.items = sanitizeIds(stored.items);
  if (stored.picks && typeof stored.picks === "object" && !Array.isArray(stored.picks)) {
    let count = 0;
    for (const [id, value] of Object.entries(stored.picks)) {
      if (count >= MAX_ARCHIVE_IDS) break;
      const picks = Math.floor(Number(value));
      if (!isArchiveId(id) || !Number.isFinite(picks) || picks <= 0) continue;
      archive.picks[id] = Math.min(MAX_PICK_COUNT, picks);
      count += 1;
    }
  }
  if (Array.isArray(stored.runs)) {
    const runs = [...new Set(stored.runs.filter((id): id is string => typeof id === "string" && ARCHIVE_RUN_ID_PATTERN.test(id)))];
    archive.runs = runs.slice(-ARCHIVE_RUN_ID_LIMIT);
  }
  return archive;
}

export function serializeCardArchive(archive: CardArchive): StoredCardArchive {
  return { v: CARD_ARCHIVE_VERSION, cards: archive.cards, items: archive.items, picks: archive.picks, runs: archive.runs };
}

/**
 * Sunulan kimlikleri gorulmus olarak isaretler.
 *
 * `fresh` daha once hic gorulmemis olanlar, sunulus sirasiyla: "YENİ" etiketi
 * bunlara iniyor. Yeni bir sey yoksa ayni arsiv nesnesi donuyor; cagiran taraf
 * boyle anliyor ki depoya yazmaya gerek yok. Arsiv yalnizca buyuyor --
 * gorulmus bir kart hicbir yoldan "gorulmedi"ye donmuyor.
 */
export function markArchiveSeen(
  archive: CardArchive,
  kind: ArchiveKind,
  ids: readonly unknown[]
): { archive: CardArchive; fresh: string[] } {
  const known = new Set(archive[kind]);
  const fresh: string[] = [];
  for (const id of ids) {
    if (!isArchiveId(id) || known.has(id)) continue;
    if (known.size >= MAX_ARCHIVE_IDS) break;
    known.add(id);
    fresh.push(id);
  }
  if (fresh.length === 0) return { archive, fresh };
  return { archive: { ...archive, [kind]: [...archive[kind], ...fresh] }, fresh };
}

/** Bu kimliklerden hangileri daha once gorulmedi; sirayla, yinelenmeden. */
export function findUnseenArchiveIds(archive: CardArchive, kind: ArchiveKind, ids: readonly unknown[]) {
  return markArchiveSeen(archive, kind, ids).fresh;
}

/** Arsive yazilacak kosu: sunucunun kimligi ve yerel oyuncunun destesi. */
export type ArchiveRun = { id: string; cards: string[] };

/**
 * Bitmis kosudan arsive gidecek kisim.
 *
 * Yaratici kosu hic sayilmiyor: orada her kart elle acilip kapatilabiliyor,
 * "secildi" demek yalan olurdu. Bayrak iki kaynaktan birlesiyor (rapor ve
 * istemci); biri acik diyorsa acik. Deste yerel oyuncunun yuvasindan;
 * takim arkadasinin secimi bu tarayicinin arsivi degil.
 */
export function getArchiveRun(
  run: Pick<RunSummary, "id" | "creative" | "players"> | undefined,
  local: { slot: number; creative?: boolean }
): ArchiveRun | undefined {
  if (!run || run.creative === true || local.creative === true) return undefined;
  if (typeof run.id !== "string" || !ARCHIVE_RUN_ID_PATTERN.test(run.id)) return undefined;
  const own = Array.isArray(run.players) ? run.players.find((player) => player?.slot === local.slot) : undefined;
  if (!own || !Array.isArray(own.cards)) return undefined;
  return { id: run.id, cards: own.cards.filter(isArchiveId) };
}

/**
 * Kosunun destesini "kac kosuda secildi" sayacina yazar.
 *
 * Ayni kosu iki kez sayilmiyor (kimlik listesi). Yigilan kart kosu basina bir
 * kez: soru "kac kez aldin" degil, "kac kosuda buna yaslandin". Secilen kart
 * zaten gorulmustur; kart secimi isaretlenemeden sayfa kapandiysa bile burada
 * gorulmus sayiliyor.
 */
export function recordArchiveRun(archive: CardArchive, run: ArchiveRun | undefined): { archive: CardArchive; counted: boolean } {
  if (!run || !ARCHIVE_RUN_ID_PATTERN.test(run.id) || archive.runs.includes(run.id)) return { archive, counted: false };
  const unique = [...new Set(run.cards.filter(isArchiveId))];
  const picks = { ...archive.picks };
  for (const id of unique) {
    if (!(id in picks) && Object.keys(picks).length >= MAX_ARCHIVE_IDS) continue;
    picks[id] = Math.min(MAX_PICK_COUNT, (picks[id] ?? 0) + 1);
  }
  const seen = markArchiveSeen(archive, "cards", unique).archive;
  return {
    archive: { ...seen, picks, runs: [...archive.runs, run.id].slice(-ARCHIVE_RUN_ID_LIMIT) },
    counted: true
  };
}

export type ArchiveProgress = { seen: number; total: number };

/** Katalogdaki kartlardan ya da esyalardan kacinin goruldugu. */
export function getArchiveProgress(archive: CardArchive, kind: ArchiveKind): ArchiveProgress {
  const seen = new Set(archive[kind]);
  const catalog = kind === "cards" ? cardCatalog : shopCatalog;
  return { seen: catalog.filter((entry) => seen.has(entry.id)).length, total: catalog.length };
}

/** "64/113". */
export function formatArchiveProgress(progress: ArchiveProgress) {
  return `${Math.max(0, Math.floor(progress.seen))}/${Math.max(0, Math.floor(progress.total))}`;
}

/**
 * Tamamlanma yuzdesi, asagi yuvarlanmis: son kart gorulmeden %100 yazmasin.
 */
export function getArchivePercent(progress: ArchiveProgress) {
  if (progress.total <= 0) return 0;
  return Math.floor((Math.min(progress.seen, progress.total) / progress.total) * 100);
}

/** Arsiv gruplarinin adlari; kart ekranindaki nadirlik adlariyla ayni sozcukler. */
export const ARCHIVE_RARITY_LABELS: Record<CardRarity, string> = {
  common: "Yaygın",
  uncommon: "Seyrek",
  rare: "Nadir",
  epic: "Epik"
};

/**
 * Magaza esyasi kategorilerinin oyuncuya donuk adi. Kimlik ("utility")
 * magazada ham haliyle Turkce arayuzun ortasinda Ingilizce kaliyordu.
 */
export const SHOP_CATEGORY_LABELS: Record<ShopItemCategory, string> = {
  power: "Güç",
  class: "Sınıf",
  utility: "Yardımcı",
  map: "Harita",
  risk: "Risk"
};

/** Grup sirasi: en sik gorulenden en seyrege; menu yukaridan asagi dolsun. */
const ARCHIVE_RARITY_ORDER: readonly CardRarity[] = ["common", "uncommon", "rare", "epic"];
const ARCHIVE_CATEGORY_ORDER: readonly ShopItemCategory[] = ["power", "class", "utility", "map", "risk"];

/**
 * Menu satiri. Gorulmemis satirda ad ve aciklama bilerek yok: gorunum
 * nesnesinde olmayan metin HTML'e de sizamaz. Siluet yalnizca nadirligi
 * (esyada kategoriyi) soyluyor.
 */
export type ArchiveEntryView =
  | { id: string; seen: true; group: string; tag: string; name: string; description: string; picks: number }
  | { id: string; seen: false; group: string; tag: string };

export type ArchiveGroupView = {
  /** Nadirlik ya da kategori kimligi; CSS cercevesi bundan. */
  key: string;
  label: string;
  seen: number;
  total: number;
  /** Once gorulenler katalog sirasiyla, sonra siluetler katalog sirasiyla. */
  entries: ArchiveEntryView[];
};

export type ArchiveSectionView = {
  kind: ArchiveKind;
  label: string;
  seen: number;
  total: number;
  percent: number;
  groups: ArchiveGroupView[];
};

export type CardArchiveView = { cards: ArchiveSectionView; items: ArchiveSectionView };

function buildSection<Key extends string>(
  kind: ArchiveKind,
  label: string,
  order: readonly Key[],
  labels: Record<Key, string>,
  entries: ReadonlyArray<{ id: string; name: string; description: string; group: Key }>,
  seenIds: ReadonlySet<string>,
  picks: Readonly<Record<string, number>>
): ArchiveSectionView {
  const groups = order.map((key): ArchiveGroupView => {
    const members = entries.filter((entry) => entry.group === key);
    const seen: ArchiveEntryView[] = [];
    const locked: ArchiveEntryView[] = [];
    for (const entry of members) {
      if (seenIds.has(entry.id)) {
        seen.push({ id: entry.id, seen: true, group: key, tag: labels[key], name: entry.name, description: entry.description, picks: picks[entry.id] ?? 0 });
      } else {
        locked.push({ id: entry.id, seen: false, group: key, tag: labels[key] });
      }
    }
    return { key, label: labels[key], seen: seen.length, total: members.length, entries: [...seen, ...locked] };
  }).filter((group) => group.total > 0);
  const progress = {
    seen: groups.reduce((sum, group) => sum + group.seen, 0),
    total: groups.reduce((sum, group) => sum + group.total, 0)
  };
  return { kind, label, seen: progress.seen, total: progress.total, percent: getArchivePercent(progress), groups };
}

/**
 * Menudeki Kart Arsivi'nin gorunumu: iki bolum (kartlar nadirlige, esyalar
 * kategoriye gore gruplu), her grupta sayac ve satirlar.
 *
 * Secim sayisi yalnizca kartlarda: esya alimi kosu raporuna gelmiyor ve
 * sayilmayan bir seyi "0 kez" diye yazmak yanlis olurdu.
 */
export function buildCardArchiveView(archive: CardArchive): CardArchiveView {
  const cards = buildSection(
    "cards",
    "Kartlar",
    ARCHIVE_RARITY_ORDER,
    ARCHIVE_RARITY_LABELS,
    cardCatalog.map((card) => ({ id: card.id, name: card.name, description: card.description, group: getCardRarity(card) })),
    new Set(archive.cards),
    archive.picks
  );
  const items = buildSection(
    "items",
    "Eşyalar",
    ARCHIVE_CATEGORY_ORDER,
    SHOP_CATEGORY_LABELS,
    shopCatalog.map((item) => ({ id: item.id, name: item.name, description: item.description, group: item.category })),
    new Set(archive.items),
    {}
  );
  return { cards, items };
}

/**
 * Bir sunumun (kart eli ya da magaza vitrini) "YENİ" etiketleri.
 *
 * Kimlikler sunulur sunulmaz gorulmus sayiliyor, ama etiket o sunum ekranda
 * kaldikca kalmali: hedef kule listesinden karta donus, magazanin kapanip
 * acilmasi ya da her anlik goruntude yeniden kurulan panel etiketi
 * silmemeli. Anahtar sunumu tanimliyor (kart elinde dalga ve kimlikler);
 * anahtar ayniysa ilk hesap aynen donuyor, depo bir daha okunmuyor. Yeni bir
 * anahtar onceki sunumu unutturuyor: bir onceki dalgada gorulen kart bu
 * dalgada yeni degil.
 *
 * Magaza vitrini baska: satin alinan esya vitrinden dusuyor ama bu yeni bir
 * sunum degil. Orada kapsam kimliklerden degil sunumun kendisinden geliyor
 * (dalga ve yenileme bedeli) ve `resolveNarrowing` kullaniliyor: ayni
 * kapsamda kimlikler ilk sunumun alt kumesiyse kalanlarin etiketi yerinde,
 * depo okunmuyor. Kimlik listesiyle anahtarlamak her satin almada kalan
 * esyalari yeniden hesaplatirdi; hepsi acilista gorulmus sayildigi icin
 * butun "YENİ" etiketleri ayni vitrin ekrandayken silinirdi.
 */
export class ArchiveOfferLatch {
  private key: string | undefined;
  private fresh: ReadonlySet<string> = new Set();
  /** Daraltmali sunumda ilk hesabin kimlikleri; alt kume kontrolu buna bakiyor. */
  private offered: ReadonlySet<string> = new Set();
  /** Son daraltmanin kimlikleri ve sonucu; her cizimde yeni bir kume kurulmasin. */
  private narrowedIds: readonly string[] = [];
  private narrowed: ReadonlySet<string> = new Set();

  resolve(key: string, compute: () => Iterable<string>): ReadonlySet<string> {
    if (key === this.key) return this.fresh;
    this.latch(key, [], compute);
    return this.fresh;
  }

  /**
   * Kapsam ayni ve kimlikler ilk sunumun alt kumesi: ilk hesabin kalanlara
   * dusen kismi, depo okunmadan. Yeni kapsam ya da ilk sunumda olmayan bir
   * kimlik: yeniden hesap.
   */
  resolveNarrowing(scope: string, ids: readonly string[], compute: () => Iterable<string>): ReadonlySet<string> {
    if (scope !== this.key || !ids.every((id) => this.offered.has(id))) {
      this.latch(scope, ids, compute);
    } else if (ids.length === this.narrowedIds.length && ids.every((id, index) => id === this.narrowedIds[index])) {
      return this.narrowed;
    }
    this.narrowedIds = [...ids];
    this.narrowed = new Set(ids.filter((id) => this.fresh.has(id)));
    return this.narrowed;
  }

  private latch(key: string, ids: readonly string[], compute: () => Iterable<string>) {
    this.key = key;
    this.offered = new Set(ids);
    this.fresh = new Set(compute());
    this.narrowedIds = [];
    this.narrowed = new Set();
  }

  reset() {
    this.key = undefined;
    this.fresh = new Set();
    this.offered = new Set();
    this.narrowedIds = [];
    this.narrowed = new Set();
  }
}
