import { getTowerMaxLevel, getWarehouseCapacity, RESOURCE_NAMES, RESOURCE_NAMES_EN, AMMO_RECIPES, getResourceProviderCapacity, getAmmoFactoryProductionRate, getRepairPartRate, REPAIR_PART_ENERGY_COST, REPAIR_PART_IRON_COST, type EconomyStock, type ResourceKind, type AmmoType } from "@karayel/shared";
import { getLocale } from "./i18n";
import {
  BLAST_RADIUS_CELLS,
  CHAIN_JUMPS,
  GAME_SPEED_MULTIPLIER,
  TOWER_HEAT_BRAKE_TEMPERATURE,
  getCardDefinition,
  getCriticalSlowFraction,
  getLevelScaledSlowFraction,
  getShopItem,
  getTowerTier,
  isOperationalTower,
  towerAims,
  towerCatalog,
  towerDealsDamage,
  towerFiresProjectiles,
  towerNeverAttacks,
  type DamageType,
  type HitType,
  type TowerDefinition,
  type TowerSlowCurve,
  type TowerStatSource,
  type TowerStatValue,
  type TowerStatsWire
} from "@karayel/shared";
import { ammoTypeLabels, damageTypeCodex, hitTypeCodex } from "./codex";
import { describeTowerAmmo, makeAmmoMarker, type TowerAmmoKey } from "./tower-ammo";
import { assetUrl } from "./asset-url";
import { lower, numberLocale, t, tMaybe, upper } from "./i18n";
import { localizeTowerStatusText } from "./server-text";
import { getTieredTowerArtPath, getSupplyTowerArtPath } from "./tower-art";

/**
 * Kule paneli: secili kulenin sayilari, gruplu ve dokumlu.
 *
 * Model (`buildTowerSheetModel`) saf: sunucunun blogu (`TowerStatsWire`),
 * anlik goruntunun canli sayilari ve sahnenin notlari girip ekrana yazilacak
 * metinler cikiyor. DOM tarafi (`renderTowerSheet`, `patchTowerSheet`) modeli
 * bir kez kuruyor, sonra yalnizca degisen metni yaziyor: canli sayilar
 * saniyede birkac kez geliyor ve her seferinde paneli yikmak hem dokunusu
 * yutuyor hem kaydirmayi basa atiyordu.
 *
 * Sayilar gercek saatte: sunucu oyun zamaninda sayiyor (`GAME_SPEED_MULTIPLIER`),
 * oyuncunun hissettigi saniye ondan uzun. Kule Kodeksi de boyle yaziyor.
 */

export type TowerSheetSectionId = "knowledge" | "attack" | "aim" | "effects" | "resources" | "progress";

/** Sahnenin metin notlari; ait olduklari bolumun altinda duruyor. */
export type TowerSheetNote = { section: TowerSheetSectionId | "status"; text: string };

export type TowerSheetLive = EconomyStock & {
  hp?: number;
  maxHp?: number;
  armor?: number;
  temperature?: number;
  ammo?: number;
  maxAmmo?: number;
  rawAmmo?: number;
  maxRawAmmo?: number;
  energy?: number;
  maxEnergy?: number;
  shotFuel?: "ammo" | "energy";
  resourceProvider?: "ammunition" | "energy";
  performance?: number;
  damageDealt?: number;
  currentDps?: number;
  /** Sunucunun kisa durum metni ("Isı freni %50", "Beklemede"). */
  status?: string;
  /** Savunma okumasi (neden atmiyor, neyi bekliyor). */
  insight?: string;
};

export type TowerSheetProgress = {
  maxed: boolean;
  upgradeXp: number;
  upgradeGold: number;
  poolXp: number;
  poolGold: number;
  /** Satis ya da kurulum iadesi; yalnizca sahibi satabiliyorsa. */
  refund?: { amount: number; undoable: boolean };
};

/**
 * Sunucu bilgisi (`server-knowledge`): tur basina biriken bilgi ve verdigi artis.
 * `bonus` simdiki artis (0..1), `next` bir oldurme daha gelirse artis.
 */
export type TowerSheetKnowledgeEntry = {
  type: KnowledgeEnemyType;
  effect: "slow" | "shieldDamage" | "armorBreak" | "damage";
  kills: number;
  bonus: number;
  next: number;
  /** Bagli kulede: artisi veren Sunucu'nun seviyesi. */
  serverLevel?: number;
};

export type TowerSheetKnowledge =
  /** Sunucu'nun kendi paneli: bes turun hepsi (sifirlar dahil), seviyenin agirligi, bag sayisi. */
  | { role: "server"; level: number; weight: number; links: number; linkLimit: number; entries: TowerSheetKnowledgeEntry[] }
  /** Sunucu'ya bagli kulenin paneli: bu kulenin aldigi artislar (en bilgili Sunucu'dan). */
  | { role: "linked"; entries: TowerSheetKnowledgeEntry[] };

type KnowledgeEnemyType = "runner" | "shooter" | "brute" | "grunt" | "siege";

export type TowerSheetInput = {
  towerId: string;
  definitionId: string;
  characterId: string;
  name: string;
  level: number;
  color: string;
  /** Kule takim arkadasinin: adi ve salt okunur. */
  ownerName?: string;
  readOnly?: boolean;
  /** Panelin yeri: kule ekranin alt yarisindaysa ust. */
  dock?: "top" | "bottom";
  stats?: TowerStatsWire;
  live: TowerSheetLive;
  notes: TowerSheetNote[];
  progress?: TowerSheetProgress;
  /** Sunucu bilgisi: Sunucu'nun kendisi ya da ona bagli kule. */
  knowledge?: TowerSheetKnowledge;
};

export type TowerSheetLine = { label: string; value: string };

export type TowerSheetRow = {
  key: string;
  label: string;
  value: string;
  /** "+%X" ya da "−%X"; degismemisse yok. */
  bonus?: string;
  tone?: "up" | "down";
  sub?: string;
  /** Dokunca acilan dokum. Satirlar degisebilir; yapiya yalnizca varligi giriyor. */
  detail: TowerSheetLine[];
  /** Stat satiri: dugme, dokumu var (blok gelmeden bos). */
  expandable?: boolean;
  /** Mühimmat turu isareti (cekmece ve cephanelikle ayni renk). */
  ammoMarker?: TowerAmmoKey;
};

export type TowerSheetBar = {
  key: string;
  label: string;
  value: string;
  /** 0..1 */
  ratio: number;
  /** Esik cizgisi (0..1), isi freninin basladigi yer gibi. */
  marker?: number;
  /** Esik cizgisinin adi (ipucu); yoksa isi freni. */
  markerLabel?: string;
  tone?: "ok" | "warn" | "hot";
  sub?: string;
};

export type TowerSheetSection = {
  id: TowerSheetSectionId;
  title: string;
  summary: string;
  rows: TowerSheetRow[];
  bars: TowerSheetBar[];
  notes: string[];
};

/**
 * Uretim ve depo binalarinin stoku: panelin en ustunde, buyuk sayilarla.
 * Hammadde Deposu, cephanelik, Tamir Merkezi ve enerji binasi; oyuncu binaya
 * dokundugu anda ne kadar tuttugunu gormeli. Eskiden ayni sayilar varsayilan
 * kapali Kaynak bolumunde ince cubuklardi.
 */
export type TowerSheetStockKind = "warehouse" | "armory" | "repair" | "energy";

/** Isaret: mühimmat turu (cekmeceyle ayni), hammadde, onarim parcasi. */
export type TowerSheetStockMarker = TowerAmmoKey | ResourceKind | "parts";

export type TowerSheetStockItem = {
  key: string;
  label: string;
  /** Buyuk sayi ("128"). */
  value: string;
  /** Kapasite ("/200"); ortak kapasitede bos, grup ozetinde. */
  max: string;
  /** 0..1 */
  ratio: number;
  marker: TowerSheetStockMarker;
  tone?: "ok" | "warn" | "hot";
  /** Secili uretim ya da onun hammaddesi. */
  active?: boolean;
  sub?: string;
};

export type TowerSheetStockGroup = {
  key: string;
  title: string;
  summary: string;
  /** Izgara sutunu; sayinin genisligine gore. */
  columns: 1 | 2 | 3 | 4;
  items: TowerSheetStockItem[];
};

export type TowerSheetStock = { kind: TowerSheetStockKind; groups: TowerSheetStockGroup[] };

/**
 * Gelismis sekmesinin kaynak karti (isi, enerji, mühimmat): buyuk deger,
 * cubuk ve alttaki birkac olcu ("Atış başına +10", "Soğuma 2,4/sn"). Kartin
 * ve olculerin varligi yapiya giriyor; degerler yerinde yaziliyor.
 */
export type TowerSheetSpecItem = { key: string; label: string; value: string; tone?: "up" | "down" | "warn" };

export type TowerSheetSpecCard = {
  key: "heat" | "energy" | "ammo";
  title: string;
  value: string;
  /** 0..1 */
  ratio: number;
  marker?: number;
  markerLabel?: string;
  tone?: "ok" | "warn" | "hot";
  /** Mühimmat kartinda turun isareti ve adi. */
  ammoMarker?: TowerAmmoKey;
  caption?: string;
  items: TowerSheetSpecItem[];
};

export type TowerSheetModel = {
  towerId: string;
  title: string;
  subtitle: string;
  owner?: string;
  readOnly: boolean;
  color: string;
  portrait?: string;
  monogram: string;
  dock: "top" | "bottom";
  /** Sunucunun blogu henuz gelmedi: sayilar "—". */
  pending: boolean;
  /** Kisa durum ("Isı freni %50 · Enerji yok"). */
  status: string;
  /** Savunma okumasi; kendi satirinda, kesilmeden. */
  insight: string;
  /** Uretim/depo binasinin stoku; panelin en ustunde. */
  stock?: TowerSheetStock;
  figures: TowerSheetRow[];
  sections: TowerSheetSection[];
  /** Gelismis sekmesi: isi, enerji ve mühimmat kartlari (savas kulesi; binada yok). */
  specs: TowerSheetSpecCard[];
};

const PENDING = "—";

const ALL_DEFINITIONS: ReadonlyMap<string, TowerDefinition> = new Map(
  Object.values(towerCatalog).flat().map((definition) => [definition.id, definition])
);

/** Boyali kule resimleri (`PreloaderScene`); digerleri rengiyle bir harf. */
const PORTRAITS: Readonly<Record<string, string>> = {
  "zeynep-1": assetUrl("images/towers/tower-zeynep-1.webp"),
  "zeynep-2": assetUrl("images/towers/tower-zeynep-2.webp"),
  "zeynep-3": assetUrl("images/towers/tower-zeynep-3.webp"),
  "zeynep-6": assetUrl("images/towers/tower-zeynep-6.webp"),
  "zeynep-7": assetUrl("images/towers/tower-zeynep-7.webp")
};

function getPortrait(definitionId: string, level: number, characterId: string) {
  const tiered = getTieredTowerArtPath(definitionId, level) ?? getSupplyTowerArtPath(definitionId, level, characterId);
  return tiered ? assetUrl(tiered) : PORTRAITS[definitionId];
}

// ------------------------------------------------------------------ Bicim

const numberFormats = new Map<string, Intl.NumberFormat>();

/** Dile gore: Turkcede ondalik virgul, Ingilizcede nokta. */
function formatNumber(value: number, digits: number) {
  const key = `${numberLocale()}:${digits}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(numberLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(key, format);
  }
  return format.format(Number.isFinite(value) ? value : 0);
}

/** Buyuk sayida basamak az, kucukte cok: genislik kabaca sabit kaliyor. */
function formatSmart(value: number) {
  const magnitude = Math.abs(value);
  return formatNumber(value, magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2);
}

/** XP: tam sayiysa basamaksiz, degilse bir basamak (HUD gibi). */
function formatXp(value: number) {
  const rounded = Math.round(Math.max(0, value) * 10) / 10;
  return formatNumber(rounded, Number.isInteger(rounded) ? 0 : 1);
}

/** Turkcede yuzde isareti onde ("%15"), Ingilizcede arkada ("15%"). Kucuk kesirde bir basamak. */
function formatPercent(fraction: number) {
  const percent = fraction * 100;
  const digits = Math.abs(percent) < 10 && Math.abs(percent - Math.round(percent)) > 0.05 ? 1 : 0;
  return t("format.percent", { v: formatNumber(percent, digits) });
}

function formatSignedPercent(fraction: number) {
  const percent = Math.round(fraction * 100);
  if (percent === 0) return t("format.zeroPercent");
  return t("format.signedPercent", { sign: percent > 0 ? "+" : "−", v: Math.abs(percent) });
}

/** Bonus gostergesi; bir puandan az fark gurultu. */
function bonusOf(delta: number): Pick<TowerSheetRow, "bonus" | "tone"> {
  const percent = Math.round(delta * 100);
  if (percent === 0) return {};
  return { bonus: formatSignedPercent(delta), tone: percent > 0 ? "up" : "down" };
}

const realRate = (perGameSecond: number) => perGameSecond * GAME_SPEED_MULTIPLIER;
const realSeconds = (gameMs: number) => gameMs / GAME_SPEED_MULTIPLIER / 1000;

// ------------------------------------------------------------------ Kaynak adlari

/** Kosullu paylar (donus, isabet, mermi hizi, atis hizi, menzil) ayni ad altinda. */
const CONDITIONAL_SOURCES: ReadonlySet<string> = new Set(["cond:turnRate", "cond:accuracy", "cond:projectileSpeed", "cond:fireRate", "cond:range"]);

/** Dokum kaynaklarinin adi (`sheet.source.*`). */
function sourceLabel(source: string) {
  const known = CONDITIONAL_SOURCES.has(source) ? t("sheet.source.conditional") : tMaybe(`sheet.source.${source}`);
  if (known) return known;
  if (source === "engine:critical") return t("sheet.source.engine");
  if (source.startsWith("card:")) return getCardDefinition(source.slice(5))?.name ?? t("sheet.source.card");
  if (source.startsWith("shop:")) return getShopItem(source.slice(5))?.name ?? t("sheet.source.item");
  if (source.startsWith("conversion:")) {
    const cardId = source.split(":")[1] ?? "";
    return t("sheet.source.conversion", { name: getCardDefinition(cardId)?.name ?? t("sheet.source.epicCard") });
  }
  if (source.startsWith("tower:warrior-6")) return t("sheet.source.ucube");
  if (source.startsWith("tower:")) return t("sheet.source.tower");
  if (source.startsWith("character:")) return t("sheet.source.character");
  if (source.startsWith("engine:")) return t("sheet.source.engine");
  if (source.startsWith("unlock:")) return t("sheet.source.unlock");
  return source;
}

/** Durum etkisinin adi (`sheet.status.*`); bilinmeyen tur kimligiyle. */
function statusLabel(kind: string) {
  return tMaybe(`sheet.status.${kind}`) ?? kind;
}

/**
 * Efsanevi etki satiri (`lg:<etki>`): "saniyede %20 · 3 sıçrama × 85 hasar".
 * `extra` etkiye gore: zincir sicrama basina hasar, patlama hasari, infaz
 * esigi, parcalanma / geri odeme / bag payi, cekim yaricapi (kare). Sure
 * gercek saniyeyle, diger etkiler gibi.
 */
function formatLegendaryEffect(effect: string, chance: number, durationMs: number | undefined, extra: number | undefined) {
  const parts = [t("sheet.fx.lg.chance", { v: formatPercent(chance) })];
  const has = extra !== undefined && Number.isFinite(extra);
  if (effect === "chain" && has) parts.push(t("sheet.fx.lg.chain", { n: CHAIN_JUMPS, d: formatSmart(extra) }));
  else if (effect === "blast" && has) parts.push(t("sheet.fx.lg.blast", { d: formatSmart(extra), r: formatNumber(BLAST_RADIUS_CELLS, 1) }));
  else if (effect === "execute" && has) parts.push(t("sheet.fx.lg.execute", { v: formatPercent(extra) }));
  else if (effect === "shatter" && has) parts.push(t("sheet.fx.lg.shatter", { v: formatPercent(extra) }));
  else if (effect === "chrono" && has) parts.push(t("sheet.fx.lg.chrono", { v: formatPercent(extra) }));
  else if (effect === "link" && has) parts.push(t("sheet.fx.lg.link", { v: formatPercent(extra) }));
  else if (effect === "gravity" && has) parts.push(t("sheet.fx.lg.gravity", { r: formatNumber(extra, 1) }));
  if (durationMs) parts.push(t("sheet.unit.seconds", { v: formatNumber(realSeconds(durationMs), 1) }));
  return parts.join(" · ");
}

/** Hedefe bagli hasar paylarinin adi (`TowerStatsWire.dx`). */
function targetDamageLabel(kind: string) {
  return tMaybe(`sheet.target.${kind}`) ?? kind;
}

function conditionLabel(condition: string) {
  if (condition === "frozen") return t("sheet.cond.frozen");
  if (condition === "marked") return t("sheet.cond.marked");
  if (condition === "air") return t("sheet.cond.air");
  if (condition === "far") return t("sheet.cond.far");
  if (condition.startsWith("st:")) return t("sheet.cond.status", { status: statusLabel(condition.slice(3)) });
  return condition;
}

// ------------------------------------------------------------------ Dokum

type StatFormat = (value: number) => string;

/**
 * Bir statin dokum satirlari. `relative` paylar tabanin kesri, `absolute`
 * paylar dogrudan ekleniyor (kritik), `cone` paylari isabet kesri (koni daraliyor).
 */
function breakdownLines(stat: TowerStatValue | undefined, format: StatFormat, mode: "relative" | "absolute" | "cone"): TowerSheetLine[] {
  if (!stat) return [];
  const lines: TowerSheetLine[] = [{ label: t("sheet.base"), value: format(stat.b ?? stat.v) }];
  for (const [source, add] of stat.s ?? []) {
    lines.push({ label: sourceLabel(source), value: mode === "cone" ? t("sheet.accuracyShare", { v: formatSignedPercent(add) }) : formatSignedPercent(add) });
  }
  for (const [source, multiplier] of stat.m ?? []) {
    lines.push({ label: sourceLabel(source), value: `×${formatNumber(multiplier, 2)}` });
  }
  lines.push({ label: t("sheet.now"), value: format(stat.v) });
  return lines;
}

function relativeBonus(stat: TowerStatValue | undefined) {
  if (!stat || stat.b === undefined || stat.b <= 0) return {};
  return bonusOf(stat.v / stat.b - 1);
}

function absoluteBonus(stat: TowerStatValue | undefined) {
  if (!stat || stat.b === undefined) return {};
  return bonusOf(stat.v - stat.b);
}

// ------------------------------------------------------------------ Model

type Relevance = { combat: boolean; aims: boolean; projectiles: boolean; operational: boolean };

function getRelevance(definition: TowerDefinition | undefined): Relevance {
  if (!definition) return { combat: false, aims: false, projectiles: false, operational: false };
  const operational = !definition.resourceProvider && isOperationalTower(definition);
  return {
    operational,
    combat: operational && towerDealsDamage(definition),
    aims: operational && towerAims(definition.id),
    projectiles: operational && towerFiresProjectiles(definition)
  };
}

function getSlowCurves(definition: TowerDefinition | undefined): { hit?: TowerSlowCurve; aura?: TowerSlowCurve } {
  return {
    hit: definition?.engine?.statusEffects?.find((effect) => effect.type === "slow")?.slowByLevel,
    aura: definition?.engine?.auras?.find((aura) => aura.affects === "enemies" && aura.stat === "slow")?.slowByLevel
  };
}

const tierNames = ["I", "II", "III"];

export function buildTowerSheetModel(input: TowerSheetInput): TowerSheetModel {
  const definition = ALL_DEFINITIONS.get(input.definitionId);
  const relevance = getRelevance(definition);
  const stats = input.stats && input.stats.id === input.towerId ? input.stats : undefined;
  const pending = !stats;
  const live = input.live;
  const cell = stats?.c && stats.c > 0 ? stats.c : 1;
  const tiles = (world: number) => t("sheet.unit.tiles", { v: formatNumber(world / cell, world / cell >= 1 ? 1 : 2) });
  const notesFor = (section: TowerSheetNote["section"]) => input.notes.filter((note) => note.section === section).map((note) => note.text);

  const damageType = (stats?.dt ?? definition?.damageType) as DamageType | undefined;
  const hitType = (stats?.ht ?? definition?.hitType) as HitType | undefined;
  // Saldirmayan kulenin (Sunucu) vurus ve hasar tipi yok: "Elektrik carpma" yaniltirdi.
  const neverAttacks = towerNeverAttacks({ id: input.definitionId });
  const typeText = neverAttacks ? "" : [damageType && damageType !== "none" ? damageTypeCodex[damageType]?.name : undefined, hitType && hitType !== "none" ? lower(hitTypeCodex[hitType]?.name ?? "") : undefined]
    .filter(Boolean).join(" ");
  const tier = getTowerTier(input.level);
  const ownerText = input.ownerName ? t("sheet.ownerReadOnly", { owner: input.ownerName }) : input.readOnly ? t("sheet.readOnly") : undefined;
  const subtitle = [ownerText, t("sheet.level", { level: input.level, max: getTowerMaxLevel(definition ?? { id: input.definitionId }) }), t("sheet.tier", { tier: tierNames[tier - 1] }), typeText].filter(Boolean).join(" · ");

  // -------------------------------------------------------------- Figurler
  const figures: TowerSheetRow[] = [];
  const effectRhythm = stats ? stats.e === 1 : Boolean(definition && (definition.hitType === "focus" || definition.engine?.auras?.length));
  const orbit = definition?.engine?.attack.executor === "orbit";
  const rateLabel = orbit ? t("sheet.rate.orbit") : effectRhythm ? t("sheet.rate.effect") : t("sheet.rate.fire");
  const rateFormat: StatFormat = (value) => t("sheet.unit.perSecond", { v: formatNumber(realRate(value), 2) });

  const showCombat = relevance.combat && (pending || Boolean(stats?.d));
  if (showCombat) {
    if (stats?.dps !== undefined) {
      figures.push({ key: "dps", label: t("sheet.dps"), value: formatSmart(realRate(stats.dps)), sub: t("sheet.dps.single"), detail: [] });
    } else if (pending) {
      figures.push({ key: "dps", label: t("sheet.dps"), value: PENDING, detail: [] });
    } else {
      figures.push({ key: "dps", label: t("sheet.dps"), value: formatSmart(live.currentDps ?? 0), sub: t("sheet.dps.measured"), detail: [] });
    }
    figures.push({
      key: "d",
      label: t("sheet.damage"),
      value: stats?.d ? formatSmart(stats.d.v) : PENDING,
      ...relativeBonus(stats?.d),
      sub: stats?.n && stats.n > 1 ? t("sheet.damage.perTrigger", { n: stats.n }) : undefined,
      detail: breakdownLines(stats?.d, formatSmart, "relative"),
      expandable: true
    });
  }
  if (relevance.operational) {
    const rateSub = stats?.e
      ? t("sheet.rate.effectSub")
      : stats?.fx
        ? t("sheet.rate.fixed")
        : stats?.su !== undefined
          ? t("sheet.rate.heatCap", { v: formatNumber(realRate(stats.su), 2) })
          : undefined;
    if (!neverAttacks) figures.push({
      key: "f",
      label: rateLabel,
      value: stats?.f ? rateFormat(stats.f.v) : PENDING,
      ...relativeBonus(stats?.f),
      sub: rateSub,
      detail: breakdownLines(stats?.f, rateFormat, "relative"),
      expandable: true
    });
    figures.push({
      key: "r",
      label: t("sheet.range"),
      value: stats?.rg ? t("sheet.range.global") : stats?.r ? tiles(stats.r.v) : PENDING,
      ...(stats?.rg ? {} : relativeBonus(stats?.r)),
      detail: stats?.rg ? [] : breakdownLines(stats?.r, tiles, "relative"),
      expandable: !stats?.rg
    });
  }

  const sections: TowerSheetSection[] = [];

  // -------------------------------------------------------------- Saldiri
  if (showCombat) {
    const rows: TowerSheetRow[] = [];
    const chance: StatFormat = (value) => formatPercent(value);
    const multiplier: StatFormat = (value) => `×${formatNumber(value, 2)}`;
    rows.push({
      key: "cc",
      label: t("sheet.critChance"),
      value: stats?.cc ? chance(stats.cc.v) : PENDING,
      ...absoluteBonus(stats?.cc),
      sub: stats?.ccx?.length ? stats.ccx.map(([condition, add]) => `${conditionLabel(condition)} +${formatPercent(add)}`).join(" · ") : undefined,
      detail: breakdownLines(stats?.cc, chance, "absolute"),
      expandable: true
    });
    rows.push({
      key: "cm",
      label: t("sheet.critDamage"),
      value: stats?.cm ? multiplier(stats.cm.v) : PENDING,
      ...absoluteBonus(stats?.cm),
      detail: breakdownLines(stats?.cm, multiplier, "absolute"),
      expandable: true
    });
    // Hedefe bagli hasar paylari (hava, kalkan, tur, yavaslamis, isaretli):
    // hedef olmadan tek sayi degil; Hasar'in altinda kosul listesi.
    if (stats?.dx?.length) {
      rows.unshift({
        key: "dx",
        label: t("sheet.damageByTarget"),
        value: t("sheet.conditions", { n: stats.dx.length }),
        sub: stats.dx.map(([kind, add]) => `${targetDamageLabel(kind)} ${formatSignedPercent(add)}`).join(" · "),
        detail: []
      });
    }
    if (typeText) rows.push({ key: "type", label: t("sheet.damageType"), value: typeText, detail: [] });
    if (stats?.a) rows.push({ key: "aoe", label: t("sheet.aoe"), value: tiles(stats.a), detail: [] });
    if (stats?.pl) rows.push({ key: "pierce", label: t("sheet.pierce"), value: t("sheet.targets", { n: stats.pl }), detail: [] });
    if (stats?.ca) rows.push({ key: "cone", label: t("sheet.cone"), value: `${formatNumber(stats.ca, 0)}°`, detail: [] });
    if (stats?.bl) rows.push({ key: "blades", label: t("sheet.blades"), value: String(stats.bl), detail: [] });
    const summary = stats?.cc && stats.cm ? t("sheet.attack.summary", { chance: chance(stats.cc.v), multiplier: multiplier(stats.cm.v) }) : PENDING;
    sections.push({ id: "attack", title: t("sheet.section.attack"), summary, rows, bars: [], notes: notesFor("attack") });
  }

  // -------------------------------------------------------------- Nisan
  const showAim = relevance.aims && (pending || Boolean(stats?.tr));
  const showProjectile = relevance.projectiles && (pending || Boolean(stats?.ps));
  if (showAim || showProjectile) {
    const rows: TowerSheetRow[] = [];
    const degreesPerSecond: StatFormat = (value) => t("sheet.unit.degreesPerSecond", { v: formatNumber(realRate(value), 0) });
    const coneDegrees: StatFormat = (value) => `${formatNumber(value, 1)}°`;
    if (showAim) {
      rows.push({ key: "tr", label: t("sheet.turnRate"), value: stats?.tr ? degreesPerSecond(stats.tr.v) : PENDING, ...relativeBonus(stats?.tr), detail: breakdownLines(stats?.tr, degreesPerSecond, "relative"), expandable: true });
      const coneBonus = stats?.ac && stats.ac.b ? bonusOf(1 - stats.ac.v / stats.ac.b) : {};
      rows.push({
        key: "ac",
        label: t("sheet.aimCone"),
        value: stats?.ac ? coneDegrees(stats.ac.v) : PENDING,
        ...coneBonus,
        sub: t("sheet.aimCone.sub"),
        detail: breakdownLines(stats?.ac, coneDegrees, "cone"),
        expandable: true
      });
    }
    if (showProjectile) {
      const relativeOnly = stats?.pr === 1;
      const speed: StatFormat = relativeOnly ? (value) => `×${formatNumber(value, 2)}` : (value) => t("sheet.unit.tilesPerSecond", { v: formatNumber(realRate(value) / cell, 1) });
      rows.push({
        key: "ps",
        label: t("sheet.projectileSpeed"),
        value: stats?.ps ? speed(stats.ps.v) : PENDING,
        ...(relativeOnly && stats?.ps ? bonusOf(stats.ps.v - 1) : relativeBonus(stats?.ps)),
        detail: breakdownLines(stats?.ps, speed, "relative"),
        expandable: true
      });
    }
    const summary = rows.filter((row) => row.key !== "ac" || showAim).map((row) => row.value).join(" · ");
    sections.push({ id: "aim", title: showAim ? t("sheet.section.aim") : t("sheet.section.projectile"), summary, rows, bars: [], notes: [] });
  }

  // -------------------------------------------------------------- Etkiler
  const effectRows: TowerSheetRow[] = [];
  const curves = getSlowCurves(definition);
  for (const [kind, magnitude, durationMs, extra] of stats?.fe ?? []) {
    const label = statusLabel(kind);
    const duration = durationMs ? ` · ${t("sheet.unit.seconds", { v: formatNumber(realSeconds(durationMs), 1) })}` : "";
    let value = "";
    let sub: string | undefined;
    if (kind.startsWith("lg:")) {
      // Efsanevi vurus etkisi: once saniyelik ihtimal, sonra etkinin buyuklugu.
      effectRows.push({ key: `fx:${kind}`, label, value: formatLegendaryEffect(kind.slice(3), magnitude, durationMs, extra), sub: t("sheet.fx.lg.sub"), detail: [] });
      continue;
    }
    if (kind === "slow" || kind === "aslow" || kind === "coolant") {
      const far = kind === "slow" && extra !== undefined ? extra : undefined;
      value = far !== undefined && far !== magnitude
        ? `−${formatPercent(Math.min(magnitude, far))}…${formatPercent(Math.max(magnitude, far))}${duration}`
        : `−${formatPercent(magnitude)}${duration}`;
      const curve = kind === "slow" ? curves.hit : kind === "aslow" ? curves.aura : undefined;
      const parts: string[] = [];
      if (far !== undefined && far !== magnitude) parts.push(t("sheet.fx.byDistance"));
      if (curve && input.level < 10) parts.push(t("sheet.fx.nextLevel", { v: formatPercent(getLevelScaledSlowFraction(curve, input.level + 1)) }));
      if (kind === "slow" && stats?.sc) {
        const near = getCriticalSlowFraction(magnitude);
        const distant = far === undefined ? near : getCriticalSlowFraction(far);
        parts.push(near === distant
          ? t("sheet.fx.onCrit", { v: formatPercent(near) })
          : t("sheet.fx.onCrit", { v: `${formatPercent(Math.min(near, distant))}…${formatPercent(Math.max(near, distant))}` }));
      }
      sub = parts.length > 0 ? parts.join(" · ") : undefined;
    } else if (kind === "burn" || kind === "bleed") {
      value = `${t("sheet.fx.dot", { v: formatPercent(magnitude) })}${duration}`;
    } else if (kind === "mark") {
      value = `${t("sheet.fx.mark", { v: formatPercent(magnitude) })}${duration}`;
    } else if (kind === "armor" || kind === "armorAura") {
      value = t("sheet.fx.armor", { v: formatSmart(magnitude) });
    } else if (kind.startsWith("arc:")) {
      // Saray Arsivi: alandaki kule sayisi ve seviyenin etkileri.
      value = kind === "arc:cover" ? t("sheet.fx.arc.cover", { n: magnitude })
        : kind === "arc:cooling" || kind === "arc:range" ? `+${formatPercent(magnitude)}`
        : kind === "arc:burn" ? `+${t("sheet.unit.seconds", { v: formatNumber(realSeconds(durationMs ?? 0), 1) })}`
        : `+${formatNumber(magnitude, 0)}`;
      effectRows.push({ key: `fx:${kind}`, label, value, detail: [] });
      continue;
    } else {
      value = durationMs ? t("sheet.unit.seconds", { v: formatNumber(realSeconds(durationMs), 1) }) : t("sheet.fx.onHit");
    }
    if (extra !== undefined && kind !== "slow") sub = t("sheet.fx.maxStacks", { n: extra });
    effectRows.push({ key: `fx:${kind}`, label, value, sub, detail: [] });
  }
  // Hasarsiz kontrol kulesinde ana sayi etkinin kendisi (Izolasyon: yavaslatma).
  if (!showCombat && effectRows.length > 0) {
    const lead = effectRows[0];
    figures.unshift({ key: "fx", label: lead.label, value: lead.value.split(" · ")[0], detail: [] });
  }
  const effectNotes = notesFor("effects");
  if (effectRows.length > 0 || effectNotes.length > 0) {
    sections.push({
      id: "effects",
      title: t("sheet.section.effects"),
      summary: effectRows.length > 0 ? effectRows.slice(0, 2).map((row) => `${lower(row.label)} ${row.value.split(" · ")[0]}`).join(" · ") : t("sheet.notes", { n: effectNotes.length }),
      rows: effectRows,
      bars: [],
      notes: effectNotes
    });
  }

  // -------------------------------------------------------------- Bilgi
  // Sunucu'nun bilgisi panelin en ustunde (kaynak bolumunden de once):
  // Sunucu ates etmiyor, isi bu sayi. Bagli kulede de ayni yerde.
  // Bagli kulede artisin isleyip islemedigi kulenin kendi etkisinden (sunucuyla
  // ayni kural): yavaslatma yavaslatan, zirh kirma zirh kiran, hasar ve kalkan
  // hasari hasar veren kuleye. Blok henuz gelmediyse bilinmiyor: hepsi gosteriliyor.
  const effectKinds = new Set((stats?.fe ?? []).map(([kind]) => kind));
  const knowledgeApplies = (effect: TowerSheetKnowledgeEntry["effect"]) => {
    if (!stats) return true;
    if (effect === "slow") return effectKinds.has("slow") || effectKinds.has("aslow");
    if (effect === "armorBreak") return effectKinds.has("armor") || effectKinds.has("armorAura");
    return definition ? towerDealsDamage(definition) : true;
  };
  const knowledge = input.knowledge ? buildKnowledgeSection(input.knowledge, notesFor("knowledge"), knowledgeApplies) : undefined;
  if (knowledge?.figures) figures.push(...knowledge.figures);

  // -------------------------------------------------------------- Kaynak
  const bars: TowerSheetBar[] = [];
  const resourceRows: TowerSheetRow[] = [];
  if (live.maxHp !== undefined && live.maxHp > 0) {
    const ratio = (live.hp ?? 0) / live.maxHp;
    bars.push({ key: "hp", label: t("sheet.hull"), value: `${Math.round(live.hp ?? 0)}/${Math.round(live.maxHp)}`, ratio, tone: ratio < 0.3 ? "hot" : ratio < 0.6 ? "warn" : "ok", sub: live.armor ? t("sheet.armor", { v: formatNumber(live.armor, 0) }) : undefined });
  }
  if (relevance.operational) {
    const temperature = Math.max(0, Math.min(100, live.temperature ?? 0));
    const brake = stats?.nb ? undefined : TOWER_HEAT_BRAKE_TEMPERATURE / 100;
    const heatParts = [
      stats?.hs !== undefined ? t("sheet.heat.perShot", { v: formatSmart(stats.hs) }) : undefined,
      stats?.hc !== undefined ? t("sheet.heat.cooling", { v: formatSmart(realRate(stats.hc)) }) : undefined,
      // Sogumanin kaynaklari (Saray Arsivi aurasi): "Saray Arşivi +%40".
      ...(stats?.hcs ?? []).map(([source, add]) => `${sourceLabel(source)} +${formatPercent(add)}`),
      stats?.hl !== undefined && stats.hl < 100 ? t("sheet.heat.lock", { v: stats.hl }) : undefined
    ].filter(Boolean);
    bars.push({
      key: "heat",
      label: t("sheet.heat"),
      value: t("format.percent", { v: Math.round(temperature) }),
      ratio: temperature / 100,
      marker: brake,
      tone: temperature >= (stats?.hl ?? 100) - 5 ? "hot" : brake !== undefined && temperature > TOWER_HEAT_BRAKE_TEMPERATURE ? "warn" : "ok",
      sub: heatParts.length > 0 ? heatParts.join(" · ") : undefined
    });
  }
  // Uretim/depo binasinda stok, enerji ve hammadde en ustteki stok blogunda;
  // Kaynak bolumu ayni sayilari ikinci kez yazmiyor (yalnizca govde).
  const stock = buildStock(input, definition, stats);
  if (!stock && live.resourceProvider === "ammunition") {
    bars.push({ key: "ammo", label: t("sheet.product"), value: `${Math.floor(live.ammo ?? 0)}/${live.maxAmmo ?? 0}`, ratio: ratioOf(live.ammo, live.maxAmmo), tone: "ok" });
    if (!live.materials) bars.push({ key: "raw", label: t("sheet.raw"), value: `${Math.floor(live.rawAmmo ?? 0)}/${live.maxRawAmmo ?? 0}`, ratio: ratioOf(live.rawAmmo, live.maxRawAmmo), tone: "ok" });
  } else if (relevance.operational && live.shotFuel !== "energy" && (live.maxAmmo ?? 0) > 0) {
    const ratio = ratioOf(live.ammo, live.maxAmmo);
    bars.push({ key: "ammo", label: t("sheet.ammo"), value: `${Math.floor(live.ammo ?? 0)}/${live.maxAmmo ?? 0}`, ratio, tone: ratio < 0.15 ? "hot" : ratio < 0.35 ? "warn" : "ok", sub: stats?.am !== undefined ? t("sheet.perShot", { v: formatSmart(stats.am) }) : undefined });
  }
  if (!stock && (live.maxEnergy ?? 0) > 0) {
    const ratio = ratioOf(live.energy, live.maxEnergy);
    const energyParts = [
      stats?.ec !== undefined ? t("sheet.perShot", { v: formatSmart(stats.ec) }) : undefined,
      stats?.oe !== undefined ? t("sheet.energy.upkeep", { v: formatNumber(realRate(stats.oe), 2) }) : undefined
    ].filter(Boolean);
    bars.push({ key: "energy", label: live.resourceProvider === "energy" ? t("sheet.energyStore") : t("sheet.energy"), value: `${input.definitionId === "repair-depot-1" ? formatNumber(live.energy ?? 0, 2) : Math.floor(live.energy ?? 0)}/${live.maxEnergy ?? 0}`, ratio, tone: ratio < 0.15 ? "hot" : ratio < 0.35 ? "warn" : "ok", sub: energyParts.length > 0 ? energyParts.join(" · ") : undefined });
  }
  // Hangi mühimmat: sunucunun ikmal hattiyla ayni kaynaktan (`getTowerAmmoUsage`).
  // Eski "Atis yakiti: Mühimmat" satiri turu soylemiyordu; bu satir onun yerinde.
  // Uretim binasinda "Mühimmat türü: Kullanmaz" gurultu; urunu stokta yaziyor.
  if (definition && !stock) {
    const ammo = describeTowerAmmo(definition);
    resourceRows.push({ key: "ammoType", label: t("sheet.ammoType"), value: ammo.key === "none" ? t("sheet.ammoNone") : ammo.label, ammoMarker: ammo.key, detail: [] });
  }
  if (relevance.operational) {
    if (live.performance !== undefined) resourceRows.push({ key: "perf", label: t("sheet.performance"), value: t("format.percent", { v: Math.round(live.performance * 100) }), detail: [] });
  }
  // Gelismis sekmesinin kartlari: ayni sayilar, cubugun alt metni yerine
  // ayri olculer. Isi: atis basina ne kadar isiniyor, saniyede ne kadar
  // soguyor, frene kac atis kaldi, surekli atis hizi. Enerji ve mühimmat:
  // atis basina harcama, calisma gideri, dolu deponun kac atis ettigi.
  const specs: TowerSheetSpecCard[] = [];
  if (!stock && relevance.operational) {
    const temperature = Math.max(0, Math.min(100, live.temperature ?? 0));
    const brakeAt = stats?.nb ? undefined : TOWER_HEAT_BRAKE_TEMPERATURE;
    const perShot = stats?.hs;
    const heatItems: TowerSheetSpecItem[] = [
      { key: "hs", label: t("sheet.spec.perShot"), value: perShot !== undefined ? `+${formatSmart(perShot)}` : PENDING },
      { key: "hc", label: t("sheet.spec.cooling"), value: stats?.hc !== undefined ? t("sheet.unit.perSecond", { v: formatSmart(realRate(stats.hc)) }) : PENDING },
      {
        key: "brake",
        label: t("sheet.spec.toBrake"),
        value: brakeAt === undefined
          ? t("sheet.spec.noBrake")
          : temperature >= brakeAt
            ? t("sheet.spec.braking")
            : perShot !== undefined && perShot > 0
              ? t("sheet.spec.shots", { n: Math.max(1, Math.ceil((brakeAt - temperature) / perShot)) })
              : PENDING,
        tone: brakeAt !== undefined && temperature >= brakeAt ? "warn" : undefined
      }
    ];
    if (stats?.su !== undefined) heatItems.push({ key: "su", label: t("sheet.spec.sustained"), value: t("sheet.unit.perSecond", { v: formatNumber(realRate(stats.su), 2) }) });
    const coolingSources = (stats?.hcs ?? []).map(([source, add]) => `${sourceLabel(source)} +${formatPercent(add)}`);
    specs.push({
      key: "heat",
      title: t("sheet.heat"),
      value: t("format.percent", { v: Math.round(temperature) }),
      ratio: temperature / 100,
      marker: brakeAt !== undefined ? brakeAt / 100 : undefined,
      markerLabel: t("sheet.heatBrakeMarker"),
      tone: temperature >= (stats?.hl ?? 100) - 5 ? "hot" : brakeAt !== undefined && temperature > brakeAt ? "warn" : "ok",
      caption: [
        coolingSources.length > 0 ? coolingSources.join(" · ") : undefined,
        stats?.hl !== undefined && stats.hl < 100 ? t("sheet.heat.lock", { v: stats.hl }) : undefined
      ].filter(Boolean).join(" · ") || undefined,
      items: heatItems
    });
  }
  if (!stock && (live.maxEnergy ?? 0) > 0) {
    specs.push({
      key: "energy",
      title: t("sheet.energy"),
      value: `${Math.floor(live.energy ?? 0)}/${live.maxEnergy ?? 0}`,
      ratio: ratioOf(live.energy, live.maxEnergy),
      tone: ratioOf(live.energy, live.maxEnergy) < 0.15 ? "hot" : ratioOf(live.energy, live.maxEnergy) < 0.35 ? "warn" : "ok",
      items: [
        { key: "ec", label: t("sheet.spec.perShot"), value: stats?.ec !== undefined ? formatSmart(stats.ec) : stats ? t("sheet.spec.none") : PENDING },
        { key: "oe", label: t("sheet.spec.upkeep"), value: stats?.oe !== undefined ? t("sheet.unit.perSecond", { v: formatNumber(realRate(stats.oe), 2) }) : stats ? t("sheet.spec.none") : PENDING }
      ]
    });
  }
  if (!stock && definition && relevance.operational && live.shotFuel !== "energy" && (live.maxAmmo ?? 0) > 0) {
    const ammo = describeTowerAmmo(definition);
    const perShotAmmo = stats?.am;
    specs.push({
      key: "ammo",
      title: t("sheet.ammo"),
      value: `${Math.floor(live.ammo ?? 0)}/${live.maxAmmo ?? 0}`,
      ratio: ratioOf(live.ammo, live.maxAmmo),
      tone: ratioOf(live.ammo, live.maxAmmo) < 0.15 ? "hot" : ratioOf(live.ammo, live.maxAmmo) < 0.35 ? "warn" : "ok",
      ammoMarker: ammo.key,
      caption: ammo.key === "none" ? t("sheet.ammoNone") : ammo.label,
      items: [
        { key: "am", label: t("sheet.spec.perShot"), value: perShotAmmo !== undefined ? formatSmart(perShotAmmo) : PENDING },
        { key: "full", label: t("sheet.spec.fullStore"), value: perShotAmmo !== undefined && perShotAmmo > 0 ? t("sheet.spec.shots", { n: Math.floor((live.maxAmmo ?? 0) / perShotAmmo) }) : PENDING }
      ]
    });
  }

  const resourceNotes = notesFor("resources");
  if (bars.length > 0 || resourceNotes.length > 0) {
    // Ana sayilarin hemen altinda: isi, mühimmat ve enerji ayrintidan once okunuyor.
    sections.unshift({
      id: "resources",
      title: t("sheet.section.resources"),
      summary: bars.filter((bar) => bar.key !== "hp" || bars.length === 1).slice(0, 3).map((bar) => `${lower(bar.label)} ${bar.value}`).join(" · "),
      rows: resourceRows,
      bars,
      notes: resourceNotes
    });
  }

  // -------------------------------------------------------------- Gelisim
  const progressRows: TowerSheetRow[] = [];
  const progress = input.progress;
  if (progress) {
    progressRows.push(progress.maxed
      ? { key: "next", label: t("sheet.next"), value: t("sheet.maxLevel"), detail: [] }
      : {
        key: "next",
        label: t("sheet.next"),
        value: progress.upgradeGold > 0
          ? t("sheet.upgradePrice", { xp: formatXp(progress.upgradeXp), gold: progress.upgradeGold })
          : `${formatXp(progress.upgradeXp)} XP`,
        sub: t("sheet.pool", { xp: formatXp(progress.poolXp), gold: Math.floor(progress.poolGold) }),
        tone: progress.poolXp >= progress.upgradeXp && progress.poolGold >= progress.upgradeGold ? "up" : undefined,
        detail: []
      });
    if (progress.refund) progressRows.push({ key: "refund", label: progress.refund.undoable ? t("sheet.refund.undo") : t("sheet.refund.sell"), value: `${progress.refund.amount}g`, detail: [] });
  }
  if (relevance.combat) {
    progressRows.push({ key: "total", label: t("sheet.totalDamage"), value: formatNumber(live.damageDealt ?? 0, 0), detail: [] });
    progressRows.push({ key: "live-dps", label: t("sheet.liveDps"), value: formatNumber(live.currentDps ?? 0, 1), detail: [] });
    progressRows.push({ key: "kills", label: t("sheet.kills"), value: String(stats?.k ?? 0), detail: [] });
  }
  if (progressRows.length > 0) {
    const next = progressRows.find((row) => row.key === "next");
    sections.push({
      id: "progress",
      title: t("sheet.section.progress"),
      summary: [next ? (progress?.maxed ? t("sheet.progress.max") : t("sheet.progress.next", { v: next.value })) : undefined, relevance.combat ? t("sheet.progress.kills", { n: stats?.k ?? 0 }) : undefined].filter(Boolean).join(" · "),
      rows: progressRows,
      bars: [],
      notes: notesFor("progress")
    });
  }

  if (knowledge) sections.unshift(knowledge.section);

  // Durum ve ozet sunucunun Turkce metni; Ingilizcede kaliplardan cevriliyor.
  const status = [localizeTowerStatusText(live.status), ...notesFor("status")].filter((text) => Boolean(text && text.trim())).join(" · ");
  const insight = localizeTowerStatusText(live.insight?.trim() ?? "");

  return {
    towerId: input.towerId,
    title: input.name,
    subtitle,
    owner: input.ownerName,
    readOnly: Boolean(input.readOnly ?? stats?.ro),
    color: input.color,
    portrait: getPortrait(input.definitionId, input.level, input.characterId),
    monogram: upper(input.name.trim().charAt(0)) || "?",
    dock: input.dock ?? "bottom",
    pending,
    status,
    insight,
    stock,
    figures,
    sections,
    specs
  };
}

// ------------------------------------------------------------------ Stok

const REPAIR_DEPOT_ID = "repair-depot-1";
const WAREHOUSE_ID = "warehouse-1";
const AMMO_TYPES: readonly AmmoType[] = ["bullet", "auraCrystal", "powerCrystal"];

function stockKindOf(input: TowerSheetInput, definition: TowerDefinition | undefined): TowerSheetStockKind | undefined {
  if (input.definitionId === WAREHOUSE_ID) return "warehouse";
  if (input.definitionId === REPAIR_DEPOT_ID) return "repair";
  const provider = definition?.resourceProvider ?? input.live.resourceProvider;
  if (provider === "ammunition") return "armory";
  if (provider === "energy") return "energy";
  return undefined;
}

/** Girdi azaldikca: bos kirmizi, azsa amber. */
function inputTone(ratio: number): TowerSheetStockItem["tone"] {
  return ratio <= 0 ? "hot" : ratio < 0.2 ? "warn" : "ok";
}

/** Tamir Merkezi'nin enerjisi kesirli: sifir "uretim enerjisi yok" demek, 0,4 yuvarlanip kaybolmasin. */
function formatStockAmount(value: number, fractional = false) {
  const amount = Math.max(0, value);
  if (!fractional || amount >= 10 || amount === 0) return formatNumber(Math.floor(amount), 0);
  return formatNumber(Math.floor(amount * 100) / 100, amount < 1 ? 2 : 1);
}

/**
 * Binanin stok blogu. Sayilar anlik goruntuden (`materials`, `ammoStock`,
 * `repairParts`, `energy`); kapasiteler sunucunun kullandigi paylasilan
 * egriden (`getWarehouseCapacity`, `getResourceProviderCapacity`), uretim hizi
 * sunucunun blogundan (`pp`, kart ve esya carpanlari dahil), blok gelmeden
 * taban egriden.
 */
function buildStock(input: TowerSheetInput, definition: TowerDefinition | undefined, stats: TowerStatsWire | undefined): TowerSheetStock | undefined {
  const kind = stockKindOf(input, definition);
  if (!kind) return undefined;
  const live = input.live;
  const names = getLocale() === "tr" ? RESOURCE_NAMES : RESOURCE_NAMES_EN;
  const material = (resource: ResourceKind) => Math.max(0, live.materials?.[resource] ?? 0);
  const per = (value: number) => t("sheet.unit.perSecond", { v: formatNumber(realRate(value), realRate(value) >= 10 ? 0 : 1) });
  const energyItem = (capacity: number, tone: (ratio: number) => TowerSheetStockItem["tone"], fractional = false): TowerSheetStockItem => {
    const max = (live.maxEnergy ?? 0) > 0 ? live.maxEnergy! : capacity;
    const ratio = ratioOf(live.energy, max);
    return { key: "energy", label: t("sheet.energy"), value: formatStockAmount(live.energy ?? 0, fractional), max: `/${max}`, ratio, marker: "energy", tone: tone(ratio) };
  };

  if (kind === "warehouse") {
    const capacity = getWarehouseCapacity(input.level);
    const kinds: ResourceKind[] = ["gunpowder", "mystic", "plasma", "iron"];
    const total = kinds.reduce((sum, resource) => sum + material(resource), 0);
    return {
      kind,
      groups: [{
        key: "materials",
        title: t("sheet.stock.materials"),
        summary: t("sheet.stock.perKind", { total: formatNumber(Math.floor(total), 0), n: capacity }),
        columns: 2,
        items: kinds.map((resource) => ({
          key: `m-${resource}`, label: names[resource], value: formatStockAmount(material(resource)), max: `/${capacity}`,
          ratio: Math.min(1, material(resource) / capacity), marker: resource, tone: material(resource) >= capacity ? "warn" : "ok"
        }))
      }]
    };
  }

  const capacity = getResourceProviderCapacity(input.level);
  if (kind === "armory") {
    const production = live.productionAmmo ?? "bullet";
    const rate = stats?.pp ?? getAmmoFactoryProductionRate(input.level);
    const stockOf = (type: AmmoType) => Math.max(0, live.ammoStock?.[type] ?? (live.ammoStock ? 0 : type === production ? live.ammo ?? 0 : 0));
    const total = AMMO_TYPES.reduce((sum, type) => sum + stockOf(type), 0);
    const recipe = AMMO_RECIPES[production];
    return {
      kind,
      groups: [
        {
          key: "ammo",
          title: t("sheet.stock.ammo"),
          summary: `${formatNumber(Math.floor(total), 0)}/${capacity}`,
          columns: 3,
          items: AMMO_TYPES.map((type) => ({
            key: `a-${type}`, label: ammoTypeLabels[type], value: formatStockAmount(stockOf(type)), max: "",
            ratio: Math.min(1, stockOf(type) / capacity), marker: type, tone: "ok",
            active: type === production,
            sub: type === production ? t("sheet.stock.producing", { v: per(rate) }) : undefined
          }))
        },
        {
          key: "input",
          title: t("sheet.stock.input"),
          summary: t("sheet.stock.recipe", { raw: names[recipe], ammo: lower(ammoTypeLabels[production]) }),
          columns: 2,
          items: [
            ...(["gunpowder", "mystic", "plasma"] as ResourceKind[]).map((resource): TowerSheetStockItem => {
              const ratio = Math.min(1, material(resource) / capacity);
              const needed = resource === recipe;
              return {
                key: `m-${resource}`, label: names[resource], value: formatStockAmount(material(resource)), max: `/${capacity}`,
                ratio, marker: resource, tone: needed ? inputTone(ratio) : "ok", active: needed
              };
            }),
            energyItem(capacity, inputTone)
          ]
        }
      ]
    };
  }

  if (kind === "repair") {
    const parts = Math.max(0, live.repairParts ?? 0);
    const rate = stats?.pp ?? getRepairPartRate(input.level);
    return {
      kind,
      groups: [
        {
          key: "parts",
          title: t("sheet.stock.parts"),
          summary: t("sheet.stock.partsRate", { v: per(rate) }),
          columns: 1,
          items: [{ key: "parts", label: t("sheet.stock.partsLabel"), value: formatStockAmount(parts), max: `/${capacity}`, ratio: Math.min(1, parts / capacity), marker: "parts", tone: "ok" }]
        },
        {
          key: "input",
          title: t("sheet.stock.input"),
          summary: t("sheet.stock.repairRecipe", { iron: REPAIR_PART_IRON_COST, energy: REPAIR_PART_ENERGY_COST }),
          columns: 2,
          items: [
            { key: "m-iron", label: names.iron, value: formatStockAmount(material("iron")), max: `/${capacity}`, ratio: Math.min(1, material("iron") / capacity), marker: "iron", tone: inputTone(material("iron") / capacity), active: true },
            { ...energyItem(capacity, inputTone, true), active: true }
          ]
        }
      ]
    };
  }

  // Enerji binasi: toplayicilarin getirdigi kristal enerji olarak burada.
  return {
    kind,
    groups: [{
      key: "energy",
      title: t("sheet.stock.energy"),
      summary: t("sheet.stock.energyFlow"),
      columns: 1,
      items: [energyItem(capacity, (ratio) => (ratio < 0.15 ? "hot" : ratio < 0.35 ? "warn" : "ok"))]
    }]
  };
}

/** Ust satirdaki sayilarin aciklamalari: "DPS: tek hedef · Atış hızı: ısı sınırı …". */
/**
 * Sunucu bilgisinin bolumu.
 *
 * Sunucu'nun panelinde bes turun hepsi bir cubuk: tur -> buyuttugu etki,
 * simdiki artis, oldurme sayisi ve bir oldurmenin daha katacagi pay; +%50'de
 * "Bilgi Bankasi" nisaninin cizgisi. Sifir olan tur de gorunuyor: oyuncu neyi
 * toplayabilecegini goruyor. Cubugun doluluğu artisin kendisi (+%20 = beste bir);
 * artis hicbir zaman +%100'e varmiyor. Altta nasil toplandigi ve seviyenin
 * agirligi. Bagli kulenin panelinde yalnizca bu kulenin aldigi artislar.
 */
function buildKnowledgeSection(knowledge: TowerSheetKnowledge, extraNotes: string[], applies: (effect: TowerSheetKnowledgeEntry["effect"]) => boolean) {
  const label = (entry: TowerSheetKnowledgeEntry) => t("sheet.knowledge.bar", { type: t(`menu.enemy.type.${entry.type}`), effect: t(`scene.sheet.knowledge.${entry.effect}`) });
  const plus = (fraction: number) => `+${formatPercent(fraction)}`;
  // Bagli kulede "en yuksek" yalnizca bu kulede isleyen artislar arasindan.
  const counts = (entry: TowerSheetKnowledgeEntry) => knowledge.role === "server" || applies(entry.effect);
  let best: TowerSheetKnowledgeEntry | undefined;
  for (const entry of knowledge.entries) {
    if (entry.bonus > 0 && counts(entry) && (!best || entry.bonus > best.bonus)) best = entry;
  }
  const summary = best ? t("sheet.knowledge.summary", { what: label(best), v: plus(best.bonus) }) : t("sheet.knowledge.summaryEmpty");
  const bars: TowerSheetBar[] = [];
  const notes: string[] = [];
  let figures: TowerSheetRow[] | undefined;
  if (knowledge.role === "server") {
    for (const entry of knowledge.entries) {
      bars.push({
        key: `kn:${entry.type}`,
        label: label(entry),
        value: plus(entry.bonus),
        ratio: Math.max(0, Math.min(1, entry.bonus)),
        marker: KNOWLEDGE_BADGE_MARK,
        markerLabel: t("sheet.knowledge.marker"),
        tone: entry === best ? "ok" : undefined,
        sub: entry.kills > 0
          ? t("sheet.knowledge.kills", { n: formatNumber(entry.kills, 0), v: plus(entry.next - entry.bonus) })
          : t("sheet.knowledge.noKills", { v: plus(entry.next) })
      });
    }
    figures = [
      {
        key: "kn",
        label: t("sheet.knowledge.best"),
        value: best ? plus(best.bonus) : plus(0),
        // Bos bilgide alt satir yok: bolumun ozeti zaten "henuz bilgi yok" diyor.
        sub: best ? label(best) : undefined,
        detail: []
      },
      { key: "links", label: t("sheet.knowledge.links"), value: `${knowledge.links}/${knowledge.linkLimit}`, detail: [] }
    ];
    notes.push(...extraNotes);
    notes.push(t("sheet.knowledge.howGather"));
    notes.push(t("sheet.knowledge.howApply"));
    notes.push(t("sheet.knowledge.weight", { level: knowledge.level, w: formatNumber(knowledge.weight, 2) }));
  } else {
    // Bu kulede isleyen artislar once; islemeyenler altta, nedeniyle.
    const ordered = [...knowledge.entries].sort((a, b) => Number(applies(b.effect)) - Number(applies(a.effect)));
    for (const entry of ordered) {
      if (entry.bonus <= 0) continue;
      const active = applies(entry.effect);
      bars.push({
        key: `kn:${entry.type}`,
        label: label(entry),
        // Islemeyen artis sifir cubuk ve neden: kule o etkiyi yapmiyor.
        value: active ? plus(entry.bonus) : t("sheet.knowledge.inactiveValue"),
        ratio: active ? Math.max(0, Math.min(1, entry.bonus)) : 0,
        tone: entry === best ? "ok" : undefined,
        sub: active
          ? t("sheet.knowledge.linkedSub", { level: entry.serverLevel ?? 1, n: formatNumber(entry.kills, 0) })
          : t("sheet.knowledge.inactive", { effect: t(`scene.sheet.knowledge.${entry.effect}`), v: plus(entry.bonus) })
      });
    }
    notes.push(...extraNotes);
    notes.push(bars.length > 0 ? t("sheet.knowledge.linkedApply") : t("sheet.knowledge.linkedEmpty"));
  }
  const section: TowerSheetSection = {
    id: "knowledge",
    title: knowledge.role === "server" ? t("sheet.section.knowledge") : t("sheet.section.serverKnowledge"),
    summary,
    rows: [],
    bars,
    notes
  };
  return { section, figures };
}

/** "Bilgi Bankasi" nisaninin esigi (+%50) cubukta. */
const KNOWLEDGE_BADGE_MARK = 0.5;

export function getFigureNote(model: TowerSheetModel) {
  return model.figures.filter((figure) => figure.sub).map((figure) => `${figure.label}: ${figure.sub}`).join(" · ");
}

function ratioOf(value: number | undefined, max: number | undefined) {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(1, (value ?? 0) / max));
}

/**
 * Panelin yapisi: hangi satir, hangi cubuk, hangi dokum kalemi var.
 * Canli sayilar disarida; bu anahtar degismedikce panel yeniden kurulmuyor.
 */
export function getTowerSheetStructureKey(model: TowerSheetModel) {
  // Dokum kalemleri yapiya girmiyor: isi freni, kol, kosullu paylar birkac
  // saniyede bir girip cikiyor ve her biri paneli yikip acik secimi kapatirdi.
  // Kalemler `patchTowerSheet` icinde yerinde yeniden yaziliyor.
  const rowKey = (row: TowerSheetRow) => `${row.key}${row.expandable ? "+" : ""}`;
  return [
    model.towerId,
    model.dock,
    model.readOnly ? "ro" : "rw",
    model.portrait ?? model.monogram,
    model.owner ?? "",
    // Stok: tur ve kalemler; sayi, secili uretim ve aciklama yerinde yaziliyor.
    model.stock ? `${model.stock.kind}{${model.stock.groups.map((group) => `${group.key}:${group.items.map((item) => item.key).join(",")}`).join(";")}}` : "",
    model.figures.map(rowKey).join(";"),
    model.sections.map((section) => `${section.id}[${section.rows.map(rowKey).join(";")}|${section.bars.map((bar) => `${bar.key}${bar.marker === undefined ? "" : "^"}`).join(",")}|${section.notes.length}]`).join(""),
    // Kaynak kartlari: kart, olcu ve isaret varligi; degerler yerinde.
    model.specs.map((card) => `${card.key}${card.marker === undefined ? "" : "^"}${card.ammoMarker ?? ""}:${card.items.map((item) => item.key).join(",")}`).join(";")
  ].join("|");
}

// ------------------------------------------------------------------ Bolum durumu

const SECTION_STORAGE_KEY = "uzay_tower_sheet_sections_v1";
// Kaynak (isi, mühimmat, enerji) varsayilan acik: harita paneli kule
// paneliyle ortusecekken gizleniyor ve ayni sayilar burada okunuyor. Nisan
// ayrinti: varsayilan kapali, ozeti basliginda.
// Kartlar ve esyalar artik kendi sekmesinde (Etkiler): varsayilan acik.
const DEFAULT_OPEN: Readonly<Record<string, boolean>> = { attack: true, aim: false, effects: true, resources: true, progress: false, cards: true, controls: true };
let sectionState: Record<string, boolean> | undefined;

/** Bolumlerin acik/kapali durumu; depo yoksa (gizli pencere) varsayilan. */
function readSectionState(): Record<string, boolean> {
  if (sectionState) return sectionState;
  sectionState = { ...DEFAULT_OPEN };
  try {
    const raw = window.localStorage.getItem(SECTION_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    if (parsed && typeof parsed === "object") {
      for (const [id, open] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof open === "boolean") sectionState[id] = open;
      }
    }
  } catch {
    // Depo kapali ya da bozuk: varsayilanla devam.
  }
  return sectionState;
}

function writeSectionState(id: string, open: boolean) {
  const state = readSectionState();
  state[id] = open;
  try {
    window.localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Kaydedilemedi; bu oturumda yine de hatirlaniyor.
  }
}

export function isTowerSheetSectionOpen(id: string) {
  return readSectionState()[id] ?? true;
}


export function setTowerSheetSectionOpen(id: string, open: boolean) {
  writeSectionState(id, open);
}

// ------------------------------------------------------------------ Boy

const EXPANDED_STORAGE_KEY = "uzay_tower_sheet_expanded_v1";
let expandedState: boolean | undefined;

/** Panel genis mi (yaklasik 75vh); depo yoksa dar baslar. */
export function isTowerSheetExpanded() {
  if (expandedState !== undefined) return expandedState;
  expandedState = false;
  try {
    expandedState = window.localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    // Depo kapali: dar baslar.
  }
  return expandedState;
}

function writeExpandedState(expanded: boolean) {
  expandedState = expanded;
  try {
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    // Kaydedilemedi; bu oturumda yine de hatirlaniyor.
  }
}

/** Acik dokum: ayni anda tek satir. Panel yeniden kurulunca da acik kaliyor. */
let focusedRowKey: string | undefined;

// ------------------------------------------------------------------ DOM

export type TowerSheetHandlers = {
  close: () => void;
  /** Panel daraldi ya da genisledi; boy degisti, yer yeniden olculmeli. */
  resize?: (expanded: boolean) => void;
};

export type TowerSheetSlots = {
  /** Basligin altinda, sayilardan once (yaratici mod seviye satiri). */
  lead?: HTMLElement[];
  /** Bolumlerden sonra: kartlar/esyalar ve kule ayarlari. */
  tail?: HTMLElement[];
  /** Sabit alt serit: Gelistir, Onar, Sat. */
  footer?: HTMLElement;
};

const registries = new WeakMap<HTMLElement, Map<string, HTMLElement>>();

/** Pointer ve klavye: dugmeler pointerup ile calisiyor (panelin geri kalani gibi). */
export function onActivate(element: HTMLElement, action: () => void) {
  element.addEventListener("pointerup", action);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setText(element: HTMLElement | undefined, text: string) {
  if (element && element.textContent !== text) element.textContent = text;
}

function setHidden(element: HTMLElement | undefined, hidden: boolean) {
  if (element && element.hidden !== hidden) element.hidden = hidden;
}

function setTone(element: HTMLElement | undefined, tone: string | undefined) {
  if (!element) return;
  const next = tone ?? "";
  if (element.dataset.tone !== next) element.dataset.tone = next;
}

const domId = (model: TowerSheetModel, suffix: string) => `ts-${model.towerId}-${suffix}`.replace(/[^a-zA-Z0-9_-]/g, "_");

/**
 * Paneli `sheet` icine kurar. Dondurulen eleman `patchTowerSheet` ile
 * tazeleniyor; yapi anahtari degismedikce yeniden kurmaya gerek yok.
 */
export function renderTowerSheet(sheet: HTMLElement, model: TowerSheetModel, handlers: TowerSheetHandlers, slots: TowerSheetSlots = {}) {
  const registry = new Map<string, HTMLElement>();
  registries.set(sheet, registry);
  const keep = (key: string, element: HTMLElement) => {
    registry.set(key, element);
    return element;
  };
  const expanded = isTowerSheetExpanded();
  sheet.replaceChildren();
  sheet.className = `tower-sheet tower-sheet--${model.dock}${expanded ? " tower-sheet--expanded" : ""}${model.readOnly ? " tower-sheet--readonly" : ""}`;
  sheet.setAttribute("aria-label", t("sheet.aria.tower", { name: model.title }));
  sheet.style.setProperty("--tower-color", model.color);

  // Baslik: dokunmak paneli buyutup kucultur (kapatma dugmesi haric).
  const head = el("header", "tower-sheet__head");
  const grip = el("span", "tower-sheet__grip");
  grip.setAttribute("aria-hidden", "true");
  const portrait = el("span", "tower-sheet__portrait");
  portrait.setAttribute("aria-hidden", "true");
  if (model.portrait) {
    const image = el("img");
    image.src = model.portrait;
    image.alt = "";
    image.decoding = "async";
    image.draggable = false;
    portrait.append(image);
  } else {
    portrait.textContent = model.monogram;
  }
  const titles = el("div", "tower-sheet__titles");
  const title = el("h2", "tower-sheet__title", model.title);
  title.id = domId(model, "title");
  const subtitle = keep("subtitle", el("p", "tower-sheet__subtitle", model.subtitle));
  titles.append(title, subtitle);

  const expand = el("button", "tower-sheet__expand");
  expand.type = "button";
  expand.setAttribute("aria-expanded", String(expanded));
  expand.setAttribute("aria-label", expanded ? t("sheet.aria.collapse") : t("sheet.aria.expand"));
  expand.append(el("span", "tower-sheet__expand-icon"));
  const toggleExpanded = () => {
    const next = !sheet.classList.contains("tower-sheet--expanded");
    sheet.classList.toggle("tower-sheet--expanded", next);
    expand.setAttribute("aria-expanded", String(next));
    expand.setAttribute("aria-label", next ? t("sheet.aria.collapse") : t("sheet.aria.expand"));
    writeExpandedState(next);
    handlers.resize?.(next);
  };
  onActivate(expand, toggleExpanded);
  head.addEventListener("pointerup", (event) => {
    if (event.target instanceof Element && event.target.closest("button")) return;
    toggleExpanded();
  });

  const close = el("button", "tower-sheet__close", "×");
  close.type = "button";
  close.setAttribute("aria-label", t("sheet.aria.close"));
  onActivate(close, handlers.close);
  head.append(grip, portrait, titles, expand, close);
  sheet.append(head);

  // Govde: sekmeler. Genel (ana sayilar ve canli kaynaklar) kaydirmadan
  // okunuyor; ayrinti Gelismis'te kartlar halinde, etkiler ve ayarlar kendi
  // sekmelerinde. Eskiden yedi katlanir bolum alt alta, panelin alti kati
  // kaydirma istiyordu.
  const body = el("div", "tower-sheet__body");
  const panes: Record<TowerSheetTab, HTMLElement> = {
    basic: el("div", "ts-pane ts-pane--basic"),
    advanced: el("div", "ts-pane ts-pane--advanced"),
    effects: el("div", "ts-pane ts-pane--effects"),
    settings: el("div", "ts-pane ts-pane--settings")
  };
  const basic = panes.basic;
  basic.append(...(slots.lead ?? []));
  // Binanin stoku: basligin (ve cephanelikte uretim secicisinin) hemen altinda.
  if (model.stock) basic.append(buildStockBlock(model, model.stock, keep));
  // Canli bolge degil: sayilar saniyede birkac kez degisiyor ve ekran
  // okuyucu her birini okurdu. Oyuncu baktiginda okunuyor. Durum ve okuma
  // tek satirda: okuma durumu zaten tekrar ediyorsa durum gizli.
  const status = keep("status", el("p", "tower-sheet__status", model.status));
  status.setAttribute("aria-live", "off");
  status.hidden = !model.status || isStatusInInsight(model);
  const insight = keep("insight", el("p", "tower-sheet__insight", model.insight));
  insight.setAttribute("aria-live", "off");
  insight.hidden = !model.insight;
  basic.append(status, insight);

  if (model.figures.length > 0) {
    const figures = el("div", "ts-figures");
    figures.dataset.count = String(model.figures.length);
    const details: HTMLElement[] = [];
    for (const figure of model.figures) {
      const cell = buildRow(model, figure, "ts-fig", keep);
      figures.append(cell.row);
      if (cell.detail) details.push(cell.detail);
    }
    basic.append(figures, ...details);
  }
  // Canli kaynaklar tek sirada: govde, isi, mühimmat, enerji. Ayrintisi Gelismis'te.
  const resources = model.sections.find((section) => section.id === "resources");
  if (resources && resources.bars.length > 0) {
    const vitals = el("div", "ts-vitals");
    vitals.dataset.count = String(resources.bars.length);
    for (const bar of resources.bars) vitals.append(buildBar(bar, keep, true));
    basic.append(vitals);
  }

  // Gelismis: ana sayilarin aciklamasi, kaynak kartlari, saldiri, nisan, gelisim.
  const advanced = panes.advanced;
  const figureNote = keep("fignote", el("p", "ts-pane__lead", getFigureNote(model)));
  figureNote.hidden = !figureNote.textContent;
  advanced.append(figureNote);
  if (model.specs.length > 0) {
    const specs = el("div", "ts-specs");
    for (const card of model.specs) specs.append(buildSpecCard(card, keep));
    advanced.append(specs);
  }
  // Kaynak bolumunun satirlari: mühimmat turu mühimmat kartinda, performans
  // Ayarlar'daki kolda; kartsiz binada (duvar) turu yine yaziliyor.
  if (resources && model.specs.length === 0) {
    const rows = resources.rows.filter((row) => row.key !== "perf");
    if (rows.length > 0) advanced.append(buildCard(model, { ...resources, rows, bars: [], notes: [] }, keep, "grid"));
  }
  for (const section of model.sections) {
    if (section.id === "resources") continue;
    if (section.id === "knowledge") {
      // Sunucu'nun kendi bilgisi isi: Genel'de. Bagli kulede etkilerin yaninda.
      const own = section.title === t("sheet.section.knowledge");
      (own ? basic : panes.effects).append(buildCard(model, section, keep, "list"));
      // Sunucu'nun Genel'i bilgiyle uzun: ayrinti sekmeleri gibi uzayabiliyor.
      if (own) sheet.dataset.tall = "1";
      continue;
    }
    if (section.id === "effects") {
      panes.effects.append(buildCard(model, section, keep, "list"));
      continue;
    }
    // Nisan Saldiri kartinin icinde (tek baslik): asagida birlikte.
    if (section.id === "aim" && model.sections.some((other) => other.id === "attack")) continue;
    let rows = section.rows;
    let title = section.title;
    if (section.id === "attack") {
      // Hasar tipi basligin alt satirinda zaten yaziyor.
      rows = rows.filter((row) => row.key !== "type");
      const aim = model.sections.find((other) => other.id === "aim");
      if (aim) {
        rows = [...rows, ...aim.rows];
        title = t("sheet.section.attackAim");
      }
    }
    // Gelisim: gelistirme bedeli ve iade alttaki seritte zaten yaziyor.
    if (section.id === "progress") rows = rows.filter((row) => row.key !== "next" && row.key !== "refund");
    if (rows.length === 0 && section.bars.length === 0 && section.notes.length === 0) continue;
    advanced.append(buildCard(model, { ...section, title, rows }, keep, "grid"));
  }
  // Sahnenin eklentileri (kartlar ve esyalar, ayarlar) kendi sekmelerine.
  for (const element of slots.tail ?? []) {
    const tab = element.dataset.sheetTab as TowerSheetTab | undefined;
    (tab && panes[tab] ? panes[tab] : basic).append(element);
  }

  const available = TOWER_SHEET_TABS.filter((tab) => panes[tab].childElementCount > 0 && hasVisibleContent(panes[tab]));
  let active = readTowerSheetTab();
  if (!available.includes(active)) active = available[0] ?? "basic";
  if (available.length > 1) {
    const bar = el("div", "ts-tabs");
    bar.setAttribute("role", "tablist");
    const buttons = new Map<TowerSheetTab, HTMLButtonElement>();
    const select = (tab: TowerSheetTab) => {
      for (const [id, button] of buttons) {
        const on = id === tab;
        button.setAttribute("aria-selected", String(on));
        button.tabIndex = on ? 0 : -1;
        panes[id].hidden = !on;
      }
      writeTowerSheetTab(tab);
      sheet.dataset.tab = tab;
      body.scrollTop = 0;
      handlers.resize?.(sheet.classList.contains("tower-sheet--expanded"));
    };
    for (const tab of available) {
      const button = el("button", "ts-tab", t(`sheet.tab.${tab}`));
      button.type = "button";
      button.setAttribute("role", "tab");
      button.id = domId(model, `tab-${tab}`);
      button.setAttribute("aria-controls", domId(model, `pane-${tab}`));
      onActivate(button, () => select(tab));
      buttons.set(tab, button);
      bar.append(button);
    }
    sheet.dataset.tabs = "1";
    sheet.dataset.tab = active;
    for (const tab of TOWER_SHEET_TABS) {
      panes[tab].id = domId(model, `pane-${tab}`);
      panes[tab].setAttribute("role", "tabpanel");
      panes[tab].hidden = tab !== active;
    }
    for (const [id, button] of buttons) {
      button.setAttribute("aria-selected", String(id === active));
      button.tabIndex = id === active ? 0 : -1;
    }
    head.after(bar);
    body.append(...TOWER_SHEET_TABS.filter((tab) => available.includes(tab)).map((tab) => panes[tab]));
  } else {
    body.append(...TOWER_SHEET_TABS.filter((tab) => available.includes(tab)).map((tab) => panes[tab]));
  }

  sheet.append(body);
  if (slots.footer) sheet.append(slots.footer);
  return body;
}

/** Panelin sekmeleri; sira gosterim sirasi. */
export const TOWER_SHEET_TABS = ["basic", "advanced", "effects", "settings"] as const;
export type TowerSheetTab = (typeof TOWER_SHEET_TABS)[number];

const TAB_STORAGE_KEY = "uzay_tower_sheet_tab_v1";
let tabState: TowerSheetTab | undefined;

/** Son secilen sekme (kuleden kuleye kaliyor); depo yoksa Genel. */
export function readTowerSheetTab(): TowerSheetTab {
  if (tabState) return tabState;
  tabState = "basic";
  try {
    const raw = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (raw && (TOWER_SHEET_TABS as readonly string[]).includes(raw)) tabState = raw as TowerSheetTab;
  } catch {
    // Depo kapali: Genel.
  }
  return tabState;
}

function writeTowerSheetTab(tab: TowerSheetTab) {
  tabState = tab;
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // Kaydedilemedi; bu oturumda yine de hatirlaniyor.
  }
}

/** Sekmede gizli olmayan bir sey var mi (yalnizca gizli durum satiri bos sayiliyor). */
function hasVisibleContent(pane: HTMLElement) {
  for (const child of Array.from(pane.children)) {
    if (!(child as HTMLElement).hidden) return true;
  }
  return false;
}

/** Durum satiri okumanin icinde zaten geciyor mu ("Pasif" ve "Pasif | Yalnızlık açık"). */
function isStatusInInsight(model: TowerSheetModel) {
  const status = model.status.trim();
  return Boolean(status && model.insight && model.insight.includes(status));
}

/**
 * Bolumun kart hali (sekmelerin icinde katlanmiyor): baslik ve ozet, sonra
 * satirlar -- "grid" iki sutunlu olcu kutulari (saldiri, nisan, gelisim),
 * "list" tam genislikte satirlar (etkiler, bilgi) -- cubuklar ve notlar.
 */
function buildCard(model: TowerSheetModel, section: TowerSheetSection, keep: (key: string, element: HTMLElement) => HTMLElement, layout: "grid" | "list") {
  const card = el("section", `ts-card ts-card--${section.id}`);
  const head = el("header", "ts-card__head");
  head.append(el("h3", "ts-card__title", section.title), keep(`sum:${section.id}`, el("span", "ts-card__summary", section.summary)));
  card.append(head);
  if (section.rows.length > 0) {
    const rows = el("div", layout === "grid" ? "ts-metrics" : "ts-list");
    const details: HTMLElement[] = [];
    for (const row of section.rows) {
      const built = buildRow(model, row, layout === "grid" ? "ts-metric" : "ts-row", keep);
      // Uzun deger ("Fiziksel mermi", alt metinli satir) iki kutu genisliginde.
      if (layout === "grid" && (row.value.length > 11 || row.sub)) built.row.classList.add("is-wide");
      rows.append(built.row);
      if (built.detail) details.push(built.detail);
    }
    card.append(rows, ...details);
  }
  for (const bar of section.bars) card.append(buildBar(bar, keep));
  const notes = section.notes.map((note, index) => keep(`n:${section.id}:${index}`, el("p", "ts-note", note)));
  if (section.id === "knowledge" && notes.length > 1) {
    // Bilginin nasil toplandigi ve islendigi uzun: varsayilan kapali tek satir.
    const more = el("details", "ts-card__more");
    more.append(el("summary", "ts-card__more-toggle", t("sheet.knowledge.how")), ...notes);
    card.append(more);
  } else {
    card.append(...notes);
  }
  return card;
}

/** Kaynak karti: baslik ve buyuk deger, cubuk (isi freni cizgisi), olculer. */
function buildSpecCard(card: TowerSheetSpecCard, keep: (key: string, element: HTMLElement) => HTMLElement) {
  const wrapper = el("section", `ts-spec ts-spec--${card.key}`);
  const head = el("header", "ts-spec__head");
  const title = el("h3", "ts-spec__title", card.title);
  head.append(title, keep(`spv:${card.key}`, el("span", "ts-spec__value", card.value)));
  const track = keep(`spt:${card.key}`, el("div", "ts-spec__track"));
  track.setAttribute("role", "meter");
  track.setAttribute("aria-label", card.title);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(Math.round(card.ratio * 100)));
  const fill = keep(`spf:${card.key}`, el("span", "ts-spec__fill"));
  fill.style.setProperty("--fill", card.ratio.toFixed(3));
  setTone(fill, card.tone);
  track.append(fill);
  if (card.marker !== undefined) {
    const marker = el("span", "ts-spec__marker");
    marker.style.left = `${(card.marker * 100).toFixed(1)}%`;
    marker.title = card.markerLabel ?? "";
    track.append(marker);
  }
  wrapper.append(head, track);
  const caption = keep(`spc:${card.key}`, el("p", "ts-spec__caption", card.caption ?? ""));
  if (card.ammoMarker) caption.prepend(makeAmmoMarker(card.ammoMarker));
  caption.hidden = !card.caption;
  const items = el("dl", "ts-spec__items");
  for (const item of card.items) {
    const cell = el("div", "ts-spec__item");
    const value = keep(`spi:${card.key}:${item.key}`, el("dd", "ts-spec__item-value", item.value));
    setTone(value, item.tone);
    cell.append(el("dt", "ts-spec__item-label", item.label), value);
    items.append(cell);
  }
  wrapper.append(items, caption);
  return wrapper;
}

/**
 * Dokum kalemlerini yazar. Kalemler (isi freni, kol, kosullu paylar)
 * degisirse yalnizca bu kutu yeniden doluyor; panel yikilmiyor.
 */
function fillBreakdown(container: HTMLElement, lines: readonly TowerSheetLine[]) {
  const signature = lines.map((line) => line.label).join("\u0001");
  if (container.dataset.signature !== signature) {
    container.dataset.signature = signature;
    container.replaceChildren(...lines.map((line) => {
      const item = el("div", "ts-breakdown__line");
      item.append(el("span", "ts-breakdown__label", line.label), el("span", "ts-breakdown__value", line.value));
      return item;
    }));
    return;
  }
  lines.forEach((line, index) => {
    const value = container.children[index]?.lastElementChild;
    if (value instanceof HTMLElement) setText(value, line.value);
  });
}

function buildRow(model: TowerSheetModel, row: TowerSheetRow, className: string, keep: (key: string, element: HTMLElement) => HTMLElement) {
  const interactive = Boolean(row.expandable);
  const element = interactive ? el("button", `${className} is-expandable`) : el("div", className);
  if (element instanceof HTMLButtonElement) element.type = "button";
  element.dataset.key = row.key;
  const label = el("span", `${className}__label`, row.label);
  if (row.ammoMarker) label.prepend(makeAmmoMarker(row.ammoMarker));
  const value = keep(`v:${row.key}`, el("span", `${className}__value`, row.value));
  const bonus = keep(`b:${row.key}`, el("span", `${className}__bonus`, row.bonus ?? ""));
  bonus.hidden = !row.bonus;
  setTone(bonus, row.tone);
  const sub = keep(`s:${row.key}`, el("span", `${className}__sub`, row.sub ?? ""));
  sub.hidden = !row.sub;
  element.append(label, value, bonus, sub);
  if (!interactive) return { row: element };

  const detail = keep(`dc:${row.key}`, el("div", "ts-breakdown"));
  detail.id = domId(model, `d-${row.key}`);
  detail.setAttribute("role", "region");
  detail.setAttribute("aria-label", t("sheet.aria.breakdown", { label: row.label }));
  fillBreakdown(detail, row.detail);
  const focusKey = `${model.towerId}:${row.key}`;
  const open = focusedRowKey === focusKey;
  detail.hidden = !open;
  element.setAttribute("aria-expanded", String(open));
  element.setAttribute("aria-controls", detail.id);
  onActivate(element, () => {
    const next = focusedRowKey === focusKey ? undefined : focusKey;
    // Tek acik dokum: oncekini kapat.
    const scope = element.closest(".tower-sheet");
    scope?.querySelectorAll<HTMLElement>(".is-expandable[aria-expanded=\"true\"]").forEach((other) => {
      if (other === element) return;
      other.setAttribute("aria-expanded", "false");
      const controlled = other.getAttribute("aria-controls");
      const panel = controlled ? scope.querySelector<HTMLElement>(`#${controlled}`) : null;
      if (panel) panel.hidden = true;
    });
    focusedRowKey = next;
    element.setAttribute("aria-expanded", String(Boolean(next)));
    detail.hidden = !next;
  });
  return { row: element, detail };
}

/**
 * Katlanir bolum kabugu. Acik/kapali durumu yerel depoda (`writeSectionState`);
 * katlamak paneli yeniden kurmuyor, yalnizca govdeyi gizliyor.
 * `onToggle` verilirse durum degistikten sonra cagriliyor.
 */
export function createTowerSheetPanel(towerId: string, id: string, title: string, summary: string, onToggle?: (open: boolean) => void) {
  const wrapper = el("section", `ts-section ts-section--${id}`);
  const heading = el("h3", "ts-section__heading");
  const toggle = el("button", "ts-section__toggle");
  toggle.type = "button";
  const bodyId = `ts-${towerId}-sec-${id}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const open = isTowerSheetSectionOpen(id);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-controls", bodyId);
  const summaryElement = el("span", "ts-section__summary", summary);
  toggle.append(el("span", "ts-section__title", title), summaryElement, el("span", "ts-section__chevron"));
  heading.append(toggle);
  const content = el("div", "ts-section__body");
  content.id = bodyId;
  content.hidden = !open;
  onActivate(toggle, () => {
    const next = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(next));
    content.hidden = !next;
    writeSectionState(id, next);
    onToggle?.(next);
  });
  wrapper.append(heading, content);
  return { wrapper, content, summary: summaryElement };
}

function buildSection(model: TowerSheetModel, section: TowerSheetSection, keep: (key: string, element: HTMLElement) => HTMLElement) {
  const { wrapper, content, summary } = createTowerSheetPanel(model.towerId, section.id, section.title, section.summary);
  keep(`sum:${section.id}`, summary);
  // Kaynak bolumunde cubuklar (govde, isi, mühimmat, enerji) once: satirlar ayrinti.
  if (section.id === "resources") for (const bar of section.bars) content.append(buildBar(bar, keep));
  for (const row of section.rows) {
    const built = buildRow(model, row, "ts-row", keep);
    content.append(built.row);
    if (built.detail) content.append(built.detail);
  }
  if (section.id !== "resources") for (const bar of section.bars) content.append(buildBar(bar, keep));
  section.notes.forEach((note, index) => content.append(keep(`n:${section.id}:${index}`, el("p", "ts-note", note))));
  return wrapper;
}

function buildBar(bar: TowerSheetBar, keep: (key: string, element: HTMLElement) => HTMLElement, compact = false) {
  const wrapper = el("div", compact ? "ts-bar ts-bar--compact" : "ts-bar");
  wrapper.dataset.key = bar.key;
  const top = el("div", "ts-bar__top");
  top.append(el("span", "ts-bar__label", bar.label), keep(`bv:${bar.key}`, el("span", "ts-bar__value", bar.value)));
  const track = keep(`bt:${bar.key}`, el("div", "ts-bar__track"));
  track.setAttribute("role", "meter");
  track.setAttribute("aria-label", bar.label);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(Math.round(bar.ratio * 100)));
  const fill = keep(`bf:${bar.key}`, el("span", "ts-bar__fill"));
  fill.style.setProperty("--fill", bar.ratio.toFixed(3));
  setTone(fill, bar.tone);
  track.append(fill);
  if (bar.marker !== undefined) {
    const marker = el("span", "ts-bar__marker");
    marker.style.left = `${(bar.marker * 100).toFixed(1)}%`;
    marker.title = bar.markerLabel ?? t("sheet.heatBrakeMarker");
    track.append(marker);
  }
  const sub = keep(`bs:${bar.key}`, el("small", "ts-bar__sub", bar.sub ?? ""));
  // Kucuk hal (Genel'deki canli sira): alt metin Gelismis'in kartinda.
  sub.hidden = compact || !bar.sub;
  wrapper.append(top, track, sub);
  return wrapper;
}

/** Hammadde, mühimmat, enerji ve parca isareti; anlam metinde. */
function makeStockMarker(marker: TowerSheetStockMarker) {
  if (marker === "bullet" || marker === "auraCrystal" || marker === "powerCrystal" || marker === "energy" || marker === "none") return makeAmmoMarker(marker);
  const element = el("i", `res-mark res-mark--${marker}`);
  element.setAttribute("aria-hidden", "true");
  return element;
}

function buildStockBlock(model: TowerSheetModel, stock: TowerSheetStock, keep: (key: string, element: HTMLElement) => HTMLElement) {
  const block = el("section", `ts-stock ts-stock--${stock.kind}`);
  block.setAttribute("aria-label", t("sheet.stock.aria"));
  for (const group of stock.groups) {
    const wrapper = el("div", "ts-stock__group");
    const head = el("div", "ts-stock__head");
    const title = el("h3", "ts-stock__title", group.title);
    title.id = domId(model, `stock-${group.key}`);
    head.append(title, keep(`sg:${group.key}`, el("span", "ts-stock__summary", group.summary)));
    const grid = el("div", "ts-stock__grid");
    grid.dataset.cols = String(group.columns);
    grid.setAttribute("role", "list");
    grid.setAttribute("aria-labelledby", title.id);
    for (const item of group.items) {
      const tile = keep(`st:${item.key}`, el("div", "ts-tile"));
      tile.setAttribute("role", "listitem");
      tile.dataset.key = item.key;
      tile.dataset.active = item.active ? "true" : "false";
      const label = el("span", "ts-tile__label");
      label.append(makeStockMarker(item.marker), el("span", "ts-tile__name", item.label));
      const value = el("span", "ts-tile__value");
      value.append(keep(`sv:${item.key}`, el("b", "ts-tile__number", item.value)), keep(`sm:${item.key}`, el("small", "ts-tile__max", item.max)));
      const track = keep(`str:${item.key}`, el("span", "ts-tile__track"));
      track.setAttribute("role", "meter");
      track.setAttribute("aria-label", item.label);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(Math.round(item.ratio * 100)));
      const fill = keep(`sf:${item.key}`, el("span", "ts-tile__fill"));
      fill.style.setProperty("--fill", item.ratio.toFixed(3));
      setTone(fill, item.tone);
      track.append(fill);
      const sub = keep(`ss:${item.key}`, el("small", "ts-tile__sub", item.sub ?? ""));
      sub.hidden = !item.sub;
      tile.append(label, value, track, sub);
      grid.append(tile);
    }
    wrapper.append(head, grid);
    block.append(wrapper);
  }
  return block;
}

function patchStock(registry: Map<string, HTMLElement>, stock: TowerSheetStock | undefined) {
  for (const group of stock?.groups ?? []) {
    setText(registry.get(`sg:${group.key}`), group.summary);
    for (const item of group.items) {
      const tile = registry.get(`st:${item.key}`);
      const active = item.active ? "true" : "false";
      if (tile && tile.dataset.active !== active) tile.dataset.active = active;
      setText(registry.get(`sv:${item.key}`), item.value);
      setText(registry.get(`sm:${item.key}`), item.max);
      const fill = registry.get(`sf:${item.key}`);
      const ratio = item.ratio.toFixed(3);
      if (fill && fill.style.getPropertyValue("--fill") !== ratio) fill.style.setProperty("--fill", ratio);
      setTone(fill, item.tone);
      const track = registry.get(`str:${item.key}`);
      const now = String(Math.round(item.ratio * 100));
      if (track && track.getAttribute("aria-valuenow") !== now) track.setAttribute("aria-valuenow", now);
      const sub = registry.get(`ss:${item.key}`);
      setText(sub, item.sub ?? "");
      setHidden(sub, !item.sub);
    }
  }
}

/** Yalnizca degisen metni, dokumu ve cubugu yazar; yapi ayni varsayiliyor. */
export function patchTowerSheet(sheet: HTMLElement, model: TowerSheetModel) {
  const registry = registries.get(sheet);
  if (!registry) return;
  setText(registry.get("subtitle"), model.subtitle);
  const status = registry.get("status");
  setText(status, model.status);
  setHidden(status, !model.status || isStatusInInsight(model));
  const insight = registry.get("insight");
  setText(insight, model.insight);
  setHidden(insight, !model.insight);
  patchStock(registry, model.stock);
  const patchRow = (row: TowerSheetRow) => {
    setText(registry.get(`v:${row.key}`), row.value);
    const bonus = registry.get(`b:${row.key}`);
    setText(bonus, row.bonus ?? "");
    setHidden(bonus, !row.bonus);
    setTone(bonus, row.tone);
    const sub = registry.get(`s:${row.key}`);
    setText(sub, row.sub ?? "");
    setHidden(sub, !row.sub);
    const detail = registry.get(`dc:${row.key}`);
    if (detail) fillBreakdown(detail, row.detail);
  };
  model.figures.forEach(patchRow);
  const note = registry.get("fignote");
  const noteText = getFigureNote(model);
  setText(note, noteText);
  setHidden(note, !noteText);
  for (const section of model.sections) {
    setText(registry.get(`sum:${section.id}`), section.summary);
    section.rows.forEach(patchRow);
    for (const bar of section.bars) {
      setText(registry.get(`bv:${bar.key}`), bar.value);
      const fill = registry.get(`bf:${bar.key}`);
      const ratio = bar.ratio.toFixed(3);
      if (fill && fill.style.getPropertyValue("--fill") !== ratio) fill.style.setProperty("--fill", ratio);
      setTone(fill, bar.tone);
      const track = registry.get(`bt:${bar.key}`);
      const now = String(Math.round(bar.ratio * 100));
      if (track && track.getAttribute("aria-valuenow") !== now) track.setAttribute("aria-valuenow", now);
      const sub = registry.get(`bs:${bar.key}`);
      setText(sub, bar.sub ?? "");
      setHidden(sub, !bar.sub || Boolean(sub?.closest(".ts-bar--compact")));
    }
    section.notes.forEach((note, index) => setText(registry.get(`n:${section.id}:${index}`), note));
  }
  for (const card of model.specs) {
    setText(registry.get(`spv:${card.key}`), card.value);
    const fill = registry.get(`spf:${card.key}`);
    const ratio = card.ratio.toFixed(3);
    if (fill && fill.style.getPropertyValue("--fill") !== ratio) fill.style.setProperty("--fill", ratio);
    setTone(fill, card.tone);
    const track = registry.get(`spt:${card.key}`);
    const now = String(Math.round(card.ratio * 100));
    if (track && track.getAttribute("aria-valuenow") !== now) track.setAttribute("aria-valuenow", now);
    const caption = registry.get(`spc:${card.key}`);
    if (caption && caption.lastChild && caption.lastChild.nodeType === 3 && caption.lastChild.textContent !== (card.caption ?? "")) caption.lastChild.textContent = card.caption ?? "";
    setHidden(caption, !card.caption);
    for (const item of card.items) {
      const value = registry.get(`spi:${card.key}:${item.key}`);
      setText(value, item.value);
      setTone(value, item.tone);
    }
  }
}
