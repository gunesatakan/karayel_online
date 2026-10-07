import {
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
  type DamageType,
  type HitType,
  type TowerDefinition,
  type TowerSlowCurve,
  type TowerStatSource,
  type TowerStatValue,
  type TowerStatsWire
} from "@karayel/shared";
import { damageTypeCodex, hitTypeCodex } from "./codex";
import { assetUrl } from "./asset-url";

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

export type TowerSheetSectionId = "attack" | "aim" | "effects" | "resources" | "progress";

/** Sahnenin metin notlari; ait olduklari bolumun altinda duruyor. */
export type TowerSheetNote = { section: TowerSheetSectionId | "status"; text: string };

export type TowerSheetLive = {
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
};

export type TowerSheetBar = {
  key: string;
  label: string;
  value: string;
  /** 0..1 */
  ratio: number;
  /** Esik cizgisi (0..1), isi freninin basladigi yer gibi. */
  marker?: number;
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
  figures: TowerSheetRow[];
  sections: TowerSheetSection[];
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

function getPortrait(definitionId: string, level: number) {
  if (definitionId === "warrior-1") {
    const tier = getTowerTier(level);
    return assetUrl(`images/towers/tower-warrior-1-${tier === 3 ? "level-10" : tier === 2 ? "levels-5-9" : "levels-1-4"}.png`);
  }
  return PORTRAITS[definitionId];
}

// ------------------------------------------------------------------ Bicim

const numberFormats = new Map<number, Intl.NumberFormat>();

function formatNumber(value: number, digits: number) {
  let format = numberFormats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(digits, format);
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

/** Turkcede yuzde isareti onde: "%15". Kucuk kesirde bir basamak. */
function formatPercent(fraction: number) {
  const percent = fraction * 100;
  const digits = Math.abs(percent) < 10 && Math.abs(percent - Math.round(percent)) > 0.05 ? 1 : 0;
  return `%${formatNumber(percent, digits)}`;
}

function formatSignedPercent(fraction: number) {
  const percent = Math.round(fraction * 100);
  if (percent === 0) return "±%0";
  return `${percent > 0 ? "+" : "−"}%${Math.abs(percent)}`;
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

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  hit: "Vuruş bonusları",
  perf: "Performans kolu",
  heat: "Isı freni",
  etc: "Diğer (karakter, beceri, aura)",
  "cond:turnRate": "Koşullu (şu an)",
  "cond:accuracy": "Koşullu (şu an)",
  "cond:projectileSpeed": "Koşullu (şu an)",
  "cond:own": "Kulenin kendi koşulu",
  "cond:cold": "Soğuk namlu",
  "engine:stack": "Yığınlar",
  "engine:aura": "Aura",
  "engine:critical": "Kule motoru",
  "engine:impact-compensation": "Çarpma dengesi",
  "grant:surge": "Dalgalanma",
  "unlock:heat:runHot": "Kızgın namlu (ısı)",
  "character:atakan-passive": "Yalnızlık pasifi",
  "character:onur-gambler": "Kumarbaz zarı",
  "character:zeynep-formation": "Formasyon",
  "character:melis-favorite": "Favori kule",
  "character:melis-evolution": "Evrim",
  "character:melis-nightmare": "Gotik kâbus",
  "tower:kill-streak": "Öldürme serisi",
  "tower:warrior-2:server-link": "Sunucu bağı",
  "tower:warrior-4:obsession": "Obsesyon",
  "tower:warrior-5:debug": "Debug seviyesi",
  "tower:zeynep-1:compensation": "Hiza dengesi",
  "tower:archer-1:focus": "Odak"
};

const STATUS_LABELS: Readonly<Record<string, string>> = {
  slow: "Yavaşlatma",
  aslow: "Aura yavaşlatması",
  coolant: "Soğutucu yavaşlatma",
  burn: "Yanma",
  bleed: "Kanama",
  chill: "Üşütme",
  stun: "Sersemletme",
  fear: "Korku",
  bind: "Bağlama",
  convert: "Ele geçirme",
  curse: "Lanet",
  freeze: "Dondurma",
  mark: "İşaret",
  armor: "Zırh kırma",
  armorAura: "Zırh kırma (geçen mermiler)"
};

/** Hedefe bagli hasar paylarinin adi (`TowerStatsWire.dx`). */
const TARGET_DAMAGE_LABELS: Readonly<Record<string, string>> = {
  air: "Hava",
  shielded: "Kalkanlı",
  brute: "Ezici",
  grunt: "Er",
  runner: "Koşucu",
  shooter: "Nişancı",
  siege: "Kuşatma",
  slowed: "Yavaşlamış",
  marked: "İşaretli (işarete ek)"
};

function sourceLabel(source: string) {
  const known = SOURCE_LABELS[source];
  if (known) return known;
  if (source.startsWith("card:")) return getCardDefinition(source.slice(5))?.name ?? "Kart";
  if (source.startsWith("shop:")) return getShopItem(source.slice(5))?.name ?? "Eşya";
  if (source.startsWith("conversion:")) {
    const cardId = source.split(":")[1] ?? "";
    return `${getCardDefinition(cardId)?.name ?? "Epik kart"} (çevrim)`;
  }
  if (source.startsWith("tower:warrior-6")) return "Ucube gelişimi";
  if (source.startsWith("tower:")) return "Kule özelliği";
  if (source.startsWith("character:")) return "Karakter";
  if (source.startsWith("engine:")) return "Kule motoru";
  if (source.startsWith("unlock:")) return "Kilit";
  return source;
}

function conditionLabel(condition: string) {
  if (condition === "frozen") return "Donmuş hedefe";
  if (condition === "marked") return "İşaretli hedefe";
  if (condition === "air") return "Hava hedefine";
  if (condition.startsWith("st:")) return `${STATUS_LABELS[condition.slice(3)] ?? condition.slice(3)} altındaki hedefe`;
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
  const lines: TowerSheetLine[] = [{ label: "Taban", value: format(stat.b ?? stat.v) }];
  for (const [source, add] of stat.s ?? []) {
    lines.push({ label: sourceLabel(source), value: mode === "cone" ? `${formatSignedPercent(add)} isabet` : formatSignedPercent(add) });
  }
  for (const [source, multiplier] of stat.m ?? []) {
    lines.push({ label: sourceLabel(source), value: `×${formatNumber(multiplier, 2)}` });
  }
  lines.push({ label: "Şu an", value: format(stat.v) });
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
  const tiles = (world: number) => `${formatNumber(world / cell, world / cell >= 1 ? 1 : 2)} kare`;
  const notesFor = (section: TowerSheetNote["section"]) => input.notes.filter((note) => note.section === section).map((note) => note.text);

  const damageType = (stats?.dt ?? definition?.damageType) as DamageType | undefined;
  const hitType = (stats?.ht ?? definition?.hitType) as HitType | undefined;
  const typeText = [damageType && damageType !== "none" ? damageTypeCodex[damageType]?.name : undefined, hitType && hitType !== "none" ? hitTypeCodex[hitType]?.name.toLocaleLowerCase("tr-TR") : undefined]
    .filter(Boolean).join(" ");
  const tier = getTowerTier(input.level);
  const ownerText = input.ownerName ? `${input.ownerName} · salt okunur` : input.readOnly ? "salt okunur" : undefined;
  const subtitle = [ownerText, `Sv ${input.level}/10`, `Kademe ${tierNames[tier - 1]}`, typeText].filter(Boolean).join(" · ");

  // -------------------------------------------------------------- Figurler
  const figures: TowerSheetRow[] = [];
  const effectRhythm = stats ? stats.e === 1 : Boolean(definition && (definition.hitType === "focus" || definition.engine?.auras?.length));
  const orbit = definition?.engine?.attack.executor === "orbit";
  const rateLabel = orbit ? "Dönüş temposu" : effectRhythm ? "Etki hızı" : "Atış hızı";
  const rateFormat: StatFormat = (value) => `${formatNumber(realRate(value), 2)}/sn`;

  const showCombat = relevance.combat && (pending || Boolean(stats?.d));
  if (showCombat) {
    if (stats?.dps !== undefined) {
      figures.push({ key: "dps", label: "DPS", value: formatSmart(realRate(stats.dps)), sub: "tek hedef, kritik ortalamalı", detail: [] });
    } else if (pending) {
      figures.push({ key: "dps", label: "DPS", value: PENDING, detail: [] });
    } else {
      figures.push({ key: "dps", label: "DPS", value: formatSmart(live.currentDps ?? 0), sub: "ölçülen, son saniyeler", detail: [] });
    }
    figures.push({
      key: "d",
      label: "Hasar",
      value: stats?.d ? formatSmart(stats.d.v) : PENDING,
      ...relativeBonus(stats?.d),
      sub: stats?.n && stats.n > 1 ? `tetik başına ${stats.n} mermi` : undefined,
      detail: breakdownLines(stats?.d, formatSmart, "relative"),
      expandable: true
    });
  }
  if (relevance.operational) {
    const rateSub = stats?.e
      ? "etki aralığı; atış hızı kartları işlemez"
      : stats?.fx
        ? "sabit aralık"
        : stats?.su !== undefined
          ? `ısı sınırı: sürekli ${formatNumber(realRate(stats.su), 2)}/sn`
          : undefined;
    figures.push({
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
      label: "Menzil",
      value: stats?.rg ? "Global" : stats?.r ? tiles(stats.r.v) : PENDING,
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
      label: "Kritik ihtimali",
      value: stats?.cc ? chance(stats.cc.v) : PENDING,
      ...absoluteBonus(stats?.cc),
      sub: stats?.ccx?.length ? stats.ccx.map(([condition, add]) => `${conditionLabel(condition)} +${formatPercent(add)}`).join(" · ") : undefined,
      detail: breakdownLines(stats?.cc, chance, "absolute"),
      expandable: true
    });
    rows.push({
      key: "cm",
      label: "Kritik hasarı",
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
        label: "Hasar: hedefe göre",
        value: `${stats.dx.length} koşul`,
        sub: stats.dx.map(([kind, add]) => `${TARGET_DAMAGE_LABELS[kind] ?? kind} ${formatSignedPercent(add)}`).join(" · "),
        detail: []
      });
    }
    if (typeText) rows.push({ key: "type", label: "Hasar tipi", value: typeText, detail: [] });
    if (stats?.a) rows.push({ key: "aoe", label: "Alan yarıçapı", value: tiles(stats.a), detail: [] });
    if (stats?.pl) rows.push({ key: "pierce", label: "Delme", value: `${stats.pl} hedef`, detail: [] });
    if (stats?.ca) rows.push({ key: "cone", label: "Saldırı konisi", value: `${formatNumber(stats.ca, 0)}°`, detail: [] });
    if (stats?.bl) rows.push({ key: "blades", label: "Bıçak", value: String(stats.bl), detail: [] });
    const summary = stats?.cc && stats.cm ? `kritik ${chance(stats.cc.v)} · ${multiplier(stats.cm.v)}` : PENDING;
    sections.push({ id: "attack", title: "Saldırı", summary, rows, bars: [], notes: notesFor("attack") });
  }

  // -------------------------------------------------------------- Nisan
  const showAim = relevance.aims && (pending || Boolean(stats?.tr));
  const showProjectile = relevance.projectiles && (pending || Boolean(stats?.ps));
  if (showAim || showProjectile) {
    const rows: TowerSheetRow[] = [];
    const degreesPerSecond: StatFormat = (value) => `${formatNumber(realRate(value), 0)}°/sn`;
    const coneDegrees: StatFormat = (value) => `${formatNumber(value, 1)}°`;
    if (showAim) {
      rows.push({ key: "tr", label: "Dönüş hızı", value: stats?.tr ? degreesPerSecond(stats.tr.v) : PENDING, ...relativeBonus(stats?.tr), detail: breakdownLines(stats?.tr, degreesPerSecond, "relative"), expandable: true });
      const coneBonus = stats?.ac && stats.ac.b ? bonusOf(1 - stats.ac.v / stats.ac.b) : {};
      rows.push({
        key: "ac",
        label: "İsabet konisi",
        value: stats?.ac ? coneDegrees(stats.ac.v) : PENDING,
        ...coneBonus,
        sub: "dar koni: namlu hedefe daha yakınken ateşler",
        detail: breakdownLines(stats?.ac, coneDegrees, "cone"),
        expandable: true
      });
    }
    if (showProjectile) {
      const relativeOnly = stats?.pr === 1;
      const speed: StatFormat = relativeOnly ? (value) => `×${formatNumber(value, 2)}` : (value) => `${formatNumber(realRate(value) / cell, 1)} kare/sn`;
      rows.push({
        key: "ps",
        label: "Mermi hızı",
        value: stats?.ps ? speed(stats.ps.v) : PENDING,
        ...(relativeOnly && stats?.ps ? bonusOf(stats.ps.v - 1) : relativeBonus(stats?.ps)),
        detail: breakdownLines(stats?.ps, speed, "relative"),
        expandable: true
      });
    }
    const summary = rows.filter((row) => row.key !== "ac" || showAim).map((row) => row.value).join(" · ");
    sections.push({ id: "aim", title: showAim ? "Nişan" : "Mermi", summary, rows, bars: [], notes: [] });
  }

  // -------------------------------------------------------------- Etkiler
  const effectRows: TowerSheetRow[] = [];
  const curves = getSlowCurves(definition);
  for (const [kind, magnitude, durationMs, extra] of stats?.fe ?? []) {
    const label = STATUS_LABELS[kind] ?? kind;
    const duration = durationMs ? ` · ${formatNumber(realSeconds(durationMs), 1)} sn` : "";
    let value = "";
    let sub: string | undefined;
    if (kind === "slow" || kind === "aslow" || kind === "coolant") {
      const far = kind === "slow" && extra !== undefined ? extra : undefined;
      value = far !== undefined && far !== magnitude
        ? `−${formatPercent(Math.min(magnitude, far))}…${formatPercent(Math.max(magnitude, far))}${duration}`
        : `−${formatPercent(magnitude)}${duration}`;
      const curve = kind === "slow" ? curves.hit : kind === "aslow" ? curves.aura : undefined;
      const parts: string[] = [];
      if (far !== undefined && far !== magnitude) parts.push("uzaklıkla değişir");
      if (curve && input.level < 10) parts.push(`sonraki seviye −${formatPercent(getLevelScaledSlowFraction(curve, input.level + 1))}`);
      if (kind === "slow" && stats?.sc) {
        const near = getCriticalSlowFraction(magnitude);
        const distant = far === undefined ? near : getCriticalSlowFraction(far);
        parts.push(near === distant
          ? `kritikte −${formatPercent(near)}`
          : `kritikte −${formatPercent(Math.min(near, distant))}…${formatPercent(Math.max(near, distant))}`);
      }
      sub = parts.length > 0 ? parts.join(" · ") : undefined;
    } else if (kind === "burn" || kind === "bleed") {
      value = `azami canın ${formatPercent(magnitude)}/sn${duration}`;
    } else if (kind === "mark") {
      value = `+${formatPercent(magnitude)} hasar alır${duration}`;
    } else if (kind === "armor" || kind === "armorAura") {
      value = `−${formatSmart(magnitude)} zırh`;
    } else {
      value = durationMs ? `${formatNumber(realSeconds(durationMs), 1)} sn` : "vuruşta";
    }
    if (extra !== undefined && kind !== "slow") sub = `en fazla ${extra} yığın`;
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
      title: "Etkiler",
      summary: effectRows.length > 0 ? effectRows.slice(0, 2).map((row) => `${row.label.toLocaleLowerCase("tr-TR")} ${row.value.split(" · ")[0]}`).join(" · ") : `${effectNotes.length} not`,
      rows: effectRows,
      bars: [],
      notes: effectNotes
    });
  }

  // -------------------------------------------------------------- Kaynak
  const bars: TowerSheetBar[] = [];
  const resourceRows: TowerSheetRow[] = [];
  if (live.maxHp !== undefined && live.maxHp > 0) {
    const ratio = (live.hp ?? 0) / live.maxHp;
    bars.push({ key: "hp", label: "Gövde", value: `${Math.round(live.hp ?? 0)}/${Math.round(live.maxHp)}`, ratio, tone: ratio < 0.3 ? "hot" : ratio < 0.6 ? "warn" : "ok", sub: live.armor ? `zırh ${formatNumber(live.armor, 0)}` : undefined });
  }
  if (relevance.operational) {
    const temperature = Math.max(0, Math.min(100, live.temperature ?? 0));
    const brake = stats?.nb ? undefined : TOWER_HEAT_BRAKE_TEMPERATURE / 100;
    const heatParts = [
      stats?.hs !== undefined ? `atış başına +${formatSmart(stats.hs)}` : undefined,
      stats?.hc !== undefined ? `soğuma %${formatSmart(realRate(stats.hc))}/sn` : undefined,
      stats?.hl !== undefined && stats.hl < 100 ? `kilit %${stats.hl}` : undefined
    ].filter(Boolean);
    bars.push({
      key: "heat",
      label: "Isı",
      value: `%${Math.round(temperature)}`,
      ratio: temperature / 100,
      marker: brake,
      tone: temperature >= (stats?.hl ?? 100) - 5 ? "hot" : brake !== undefined && temperature > TOWER_HEAT_BRAKE_TEMPERATURE ? "warn" : "ok",
      sub: heatParts.length > 0 ? heatParts.join(" · ") : undefined
    });
  }
  if (live.resourceProvider === "ammunition") {
    bars.push({ key: "ammo", label: "Ürün", value: `${Math.floor(live.ammo ?? 0)}/${live.maxAmmo ?? 0}`, ratio: ratioOf(live.ammo, live.maxAmmo), tone: "ok" });
    bars.push({ key: "raw", label: "Hammadde", value: `${Math.floor(live.rawAmmo ?? 0)}/${live.maxRawAmmo ?? 0}`, ratio: ratioOf(live.rawAmmo, live.maxRawAmmo), tone: "ok" });
  } else if (relevance.operational && live.shotFuel !== "energy" && (live.maxAmmo ?? 0) > 0) {
    const ratio = ratioOf(live.ammo, live.maxAmmo);
    bars.push({ key: "ammo", label: "Mühimmat", value: `${Math.floor(live.ammo ?? 0)}/${live.maxAmmo ?? 0}`, ratio, tone: ratio < 0.15 ? "hot" : ratio < 0.35 ? "warn" : "ok", sub: stats?.am !== undefined ? `atış başına ${formatSmart(stats.am)}` : undefined });
  }
  if ((live.maxEnergy ?? 0) > 0) {
    const ratio = ratioOf(live.energy, live.maxEnergy);
    const energyParts = [
      stats?.ec !== undefined ? `atış başına ${formatSmart(stats.ec)}` : undefined,
      stats?.oe !== undefined ? `çalışma ${formatNumber(realRate(stats.oe), 2)}/sn` : undefined
    ].filter(Boolean);
    bars.push({ key: "energy", label: live.resourceProvider === "energy" ? "Enerji deposu" : "Enerji", value: `${Math.floor(live.energy ?? 0)}/${live.maxEnergy ?? 0}`, ratio, tone: ratio < 0.15 ? "hot" : ratio < 0.35 ? "warn" : "ok", sub: energyParts.length > 0 ? energyParts.join(" · ") : undefined });
  }
  if (relevance.operational) {
    resourceRows.push({ key: "fuel", label: "Atış yakıtı", value: live.shotFuel === "energy" ? "Enerji" : "Mühimmat", detail: [] });
    if (live.performance !== undefined) resourceRows.push({ key: "perf", label: "Performans", value: `%${Math.round(live.performance * 100)}`, detail: [] });
  }
  const resourceNotes = notesFor("resources");
  if (bars.length > 0 || resourceNotes.length > 0) {
    sections.push({
      id: "resources",
      title: "Kaynak",
      summary: bars.filter((bar) => bar.key !== "hp" || bars.length === 1).slice(0, 3).map((bar) => `${bar.label.toLocaleLowerCase("tr-TR")} ${bar.value}`).join(" · "),
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
      ? { key: "next", label: "Sonraki seviye", value: "En üst seviye", detail: [] }
      : {
        key: "next",
        label: "Sonraki seviye",
        value: `${formatXp(progress.upgradeXp)} XP${progress.upgradeGold > 0 ? ` + ${progress.upgradeGold}g` : ""}`,
        sub: `havuz ${formatXp(progress.poolXp)} XP · ${Math.floor(progress.poolGold)}g`,
        tone: progress.poolXp >= progress.upgradeXp && progress.poolGold >= progress.upgradeGold ? "up" : undefined,
        detail: []
      });
    if (progress.refund) progressRows.push({ key: "refund", label: progress.refund.undoable ? "Kurulum iadesi" : "Satış değeri", value: `${progress.refund.amount}g`, detail: [] });
  }
  if (relevance.combat) {
    progressRows.push({ key: "total", label: "Toplam hasar", value: formatNumber(live.damageDealt ?? 0, 0), detail: [] });
    progressRows.push({ key: "live-dps", label: "Anlık DPS", value: formatNumber(live.currentDps ?? 0, 1), detail: [] });
    progressRows.push({ key: "kills", label: "Öldürme", value: String(stats?.k ?? 0), detail: [] });
  }
  if (progressRows.length > 0) {
    const next = progressRows.find((row) => row.key === "next");
    sections.push({
      id: "progress",
      title: "Gelişim",
      summary: [next ? (progress?.maxed ? "en üst seviye" : `sonraki ${next.value}`) : undefined, relevance.combat ? `${stats?.k ?? 0} öldürme` : undefined].filter(Boolean).join(" · "),
      rows: progressRows,
      bars: [],
      notes: notesFor("progress")
    });
  }

  const status = [live.status, ...notesFor("status")].filter((text) => Boolean(text && text.trim())).join(" · ");
  const insight = live.insight?.trim() ?? "";

  return {
    towerId: input.towerId,
    title: input.name,
    subtitle,
    owner: input.ownerName,
    readOnly: Boolean(input.readOnly ?? stats?.ro),
    color: input.color,
    portrait: getPortrait(input.definitionId, input.level),
    monogram: input.name.trim().charAt(0).toLocaleUpperCase("tr-TR") || "?",
    dock: input.dock ?? "bottom",
    pending,
    status,
    insight,
    figures,
    sections
  };
}

/** Ust satirdaki sayilarin aciklamalari: "DPS: tek hedef · Atış hızı: ısı sınırı …". */
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
    model.figures.map(rowKey).join(";"),
    model.sections.map((section) => `${section.id}[${section.rows.map(rowKey).join(";")}|${section.bars.map((bar) => `${bar.key}${bar.marker === undefined ? "" : "^"}`).join(",")}|${section.notes.length}]`).join("")
  ].join("|");
}

// ------------------------------------------------------------------ Bolum durumu

const SECTION_STORAGE_KEY = "uzay_tower_sheet_sections_v1";
const DEFAULT_OPEN: Readonly<Record<string, boolean>> = { attack: true, aim: true, effects: true, resources: false, progress: false, cards: false, controls: true };
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
  sheet.setAttribute("aria-label", `Kule bilgisi: ${model.title}`);
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
  expand.setAttribute("aria-label", expanded ? "Paneli daralt" : "Paneli genişlet");
  expand.append(el("span", "tower-sheet__expand-icon"));
  const toggleExpanded = () => {
    const next = !sheet.classList.contains("tower-sheet--expanded");
    sheet.classList.toggle("tower-sheet--expanded", next);
    expand.setAttribute("aria-expanded", String(next));
    expand.setAttribute("aria-label", next ? "Paneli daralt" : "Paneli genişlet");
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
  close.setAttribute("aria-label", "Paneli kapat");
  onActivate(close, handlers.close);
  head.append(grip, portrait, titles, expand, close);

  // Govde
  const body = el("div", "tower-sheet__body");
  body.append(...(slots.lead ?? []));
  // Canli bolge degil: sayilar saniyede birkac kez degisiyor ve ekran
  // okuyucu her birini okurdu. Oyuncu baktiginda okunuyor.
  const status = keep("status", el("p", "tower-sheet__status", model.status));
  status.setAttribute("aria-live", "off");
  status.hidden = !model.status;
  const insight = keep("insight", el("p", "tower-sheet__insight", model.insight));
  insight.setAttribute("aria-live", "off");
  insight.hidden = !model.insight;
  body.append(status, insight);

  if (model.figures.length > 0) {
    const figures = el("div", "ts-figures");
    figures.dataset.count = String(model.figures.length);
    const details: HTMLElement[] = [];
    for (const figure of model.figures) {
      const cell = buildRow(model, figure, "ts-fig", keep);
      figures.append(cell.row);
      if (cell.detail) details.push(cell.detail);
    }
    // Hucreler dar: aciklamalari tek satirda, izgaranin altinda.
    const note = keep("fignote", el("p", "ts-figures__note", getFigureNote(model)));
    note.hidden = !note.textContent;
    body.append(figures, note, ...details);
  }

  for (const section of model.sections) {
    body.append(buildSection(model, section, keep));
  }
  body.append(...(slots.tail ?? []));

  sheet.append(head, body);
  if (slots.footer) sheet.append(slots.footer);
  return body;
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
  detail.setAttribute("aria-label", `${row.label} dökümü`);
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
  for (const row of section.rows) {
    const built = buildRow(model, row, "ts-row", keep);
    content.append(built.row);
    if (built.detail) content.append(built.detail);
  }
  for (const bar of section.bars) content.append(buildBar(bar, keep));
  section.notes.forEach((note, index) => content.append(keep(`n:${section.id}:${index}`, el("p", "ts-note", note))));
  return wrapper;
}

function buildBar(bar: TowerSheetBar, keep: (key: string, element: HTMLElement) => HTMLElement) {
  const wrapper = el("div", "ts-bar");
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
    marker.title = "Isı freni eşiği";
    track.append(marker);
  }
  const sub = keep(`bs:${bar.key}`, el("small", "ts-bar__sub", bar.sub ?? ""));
  sub.hidden = !bar.sub;
  wrapper.append(top, track, sub);
  return wrapper;
}

/** Yalnizca degisen metni, dokumu ve cubugu yazar; yapi ayni varsayiliyor. */
export function patchTowerSheet(sheet: HTMLElement, model: TowerSheetModel) {
  const registry = registries.get(sheet);
  if (!registry) return;
  setText(registry.get("subtitle"), model.subtitle);
  const status = registry.get("status");
  setText(status, model.status);
  setHidden(status, !model.status);
  const insight = registry.get("insight");
  setText(insight, model.insight);
  setHidden(insight, !model.insight);
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
      setHidden(sub, !bar.sub);
    }
    section.notes.forEach((note, index) => setText(registry.get(`n:${section.id}:${index}`), note));
  }
}
