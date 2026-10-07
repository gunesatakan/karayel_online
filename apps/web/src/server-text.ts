import {
  PREVIEW_EQUIP_REJECTED_KEY,
  getCardDefinition,
  getInventoryEquipRejectedCue,
  getRoomRejectionKey,
  getShopItem,
  type DefenseSummary,
  type EquipShopItemFailure,
  type RunSummary,
  type RunTowerSummary,
  type TowerPreview
} from "@karayel/shared";
import { getTowerIdByTurkishName } from "./catalog-locale";
import { getLocale, t, tMaybe, type MessageParams } from "./i18n";
import { enTowers } from "./locales/catalog/en-units";
import { tr } from "./locales/tr";

/**
 * Sunucunun Turkce yazdigi metinleri secili dilde gostermek.
 *
 * Sunucu dili degistirmiyor; metin alani hep Turkce. Turkcede o metin
 * oldugu gibi gosteriliyor (birebir ayni kalsin). Ingilizcede:
 *
 * - Anahtarli mesaj (`key`, `params`): `server.<anahtar>` sozlukten.
 * - Kule durumu ve ozeti (snapshot): anahtar yok, metin Turkce kaliplarla
 *   (`server.status.*`...) parcalaniyor; bkz. `locales/areas/server.ts`.
 * - Kule adlari (savunma ozeti, kosu raporu): tanim kimligiyle katalogdan.
 *
 * Tanimadigi her sey sunucunun Turkcesine dusuyor: eski sunucu da calisir.
 */

function isEnglish() {
  return getLocale() === "en";
}

function toParams(value: unknown): MessageParams | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const params: Record<string, string | number> = {};
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string" || typeof entry === "number") params[name] = entry;
  }
  return params;
}

/**
 * Anahtarli sunucu metni: Turkcede sunucunun metni, Ingilizcede anahtarin
 * karsiligi. Anahtar yoksa ya da taninmiyorsa sunucunun metni.
 */
export function localizeServerText(text: string | undefined, key?: unknown, params?: unknown): string | undefined {
  if (!isEnglish() && typeof text === "string") return text;
  if (typeof key === "string") {
    const localized = tMaybe(`server.${key}`, toParams(params));
    if (localized !== undefined) return localized;
  }
  return text;
}

/**
 * Oda katilim/kurma hatasinin metni. Colyseus yalnizca sunucunun metnini
 * tasiyor; bilinen redler (`getRoomRejectionKey`) secili dilde, obur hatalar
 * oldugu gibi.
 */
export function describeServerError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const key = getRoomRejectionKey(message);
  return (key ? localizeServerText(message, key) : undefined) ?? message;
}

// ------------------------------------------------------------ Kule adlari

/** Kule adi secili dilde: Ingilizcede tanim kimligiyle katalogdan, yoksa gelen ad. */
export function localizeTowerName(definitionId: string | undefined, name: string): string {
  if (!isEnglish() || !definitionId) return name;
  return enTowers[definitionId]?.name || name;
}

/** Sunucunun metnindeki Turkce kule adi; Ingilizcede katalogdan. */
function localizeTurkishTowerName(name: string) {
  if (!isEnglish()) return name;
  return localizeTowerName(getTowerIdByTurkishName(name), name);
}

/** Savunma ozetinin kule adlari secili dilde (`definitionId`; eski sunucuda ad kaliyor). */
export function localizeDefenseSummary<T extends DefenseSummary | undefined>(summary: T): T {
  if (!summary || !isEnglish()) return summary;
  return { ...summary, rows: summary.rows.map((row) => ({ ...row, name: localizeTowerName(row.definitionId, row.name) })) };
}

function localizeRunTower<T extends Pick<RunTowerSummary, "definitionId" | "name"> | undefined>(tower: T): T {
  return tower ? { ...tower, name: localizeTowerName(tower.definitionId, tower.name) } : tower;
}

/** Kosu raporunun kule adlari (en iyi kule, MVP, ilk 10. seviye) secili dilde. */
export function localizeRunSummary<T extends RunSummary | undefined>(run: T): T {
  if (!run || !isEnglish()) return run;
  return {
    ...run,
    // Rapor sunucudan geliyor; bicimi bozuksa dokunulmuyor, rapor kendi yedegine dusuyor.
    players: Array.isArray(run.players)
      ? run.players.map((player) => (player?.topTower ? { ...player, topTower: localizeRunTower(player.topTower) } : player))
      : run.players,
    ...(run.mvp ? { mvp: localizeRunTower(run.mvp) } : {}),
    ...(run.firstLevel10 ? { firstLevel10: localizeRunTower(run.firstLevel10) } : {})
  };
}

// ------------------------------------------------------------ Kule onizlemesi

export type LocalizedTowerPreview = { title?: string; description?: string; lines?: string[]; error?: string };

/**
 * `tower:preview` cevabinin metinleri secili dilde. Turkcede sunucunun
 * metinleri; Ingilizcede baslik ve aciklama kart/esya ve kule kimliginden,
 * satir etiketleri `lineKeys`ten, red `errorKey`den. Sayilar sunucunun
 * satirindan aynen.
 */
export function localizeTowerPreview(preview: TowerPreview): LocalizedTowerPreview {
  const { title, description, lines, error } = preview;
  if (!isEnglish()) return { title, description, lines, error };
  if (error !== undefined) {
    if (preview.errorKey === PREVIEW_EQUIP_REJECTED_KEY) {
      const params = toParams(preview.errorParams);
      const itemId = typeof params?.itemId === "string" ? params.itemId : undefined;
      const reason = typeof params?.reason === "string" ? params.reason as EquipShopItemFailure : undefined;
      return { title, error: getInventoryEquipRejectedCue({ itemId, reason }, { creative: true })?.text ?? error };
    }
    return { title, error: localizeServerText(error, preview.errorKey, preview.errorParams) ?? error };
  }
  const change = preview.cardId ? getCardDefinition(preview.cardId) : preview.itemId ? getShopItem(preview.itemId) : undefined;
  const towerName = preview.definitionId ? enTowers[preview.definitionId]?.name : undefined;
  const localizedTitle = change && towerName ? t("server.preview.title", { change: change.name, tower: towerName }) : undefined;
  const localizedDescription = change ? `${change.description} ${t("server.preview.disclaimer")}` : undefined;
  const keys = preview.lineKeys;
  const localizedLines = lines && keys && keys.length === lines.length
    ? lines.map((line, index) => {
      const label = tMaybe(`server.${keys[index]}`);
      const colon = line.indexOf(":");
      return label !== undefined && colon >= 0 ? `${label}${line.slice(colon)}` : line;
    })
    : lines;
  return { title: localizedTitle ?? title, description: localizedDescription ?? description, lines: localizedLines, error };
}

// ------------------------------------------------------------ Kule durumu ve ozeti

type TextPattern = { key: string; regex: RegExp; names: string[] };

let patterns: TextPattern[] | undefined;

/** Turkce kalip ("Fabrika {ammo}/{max}") -> duzenli ifade; `{towers}` bosluk icerebilir. */
function compilePattern(key: string, template: string): TextPattern {
  const names: string[] = [];
  let source = "";
  let last = 0;
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    source += escapeRegExp(template.slice(last, match.index));
    names.push(match[1]);
    source += match[1] === "towers" ? "(.+)" : "(\\S+)";
    last = (match.index ?? 0) + match[0].length;
  }
  source += escapeRegExp(template.slice(last));
  return { key, regex: new RegExp(`^${source}$`), names };
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPatterns() {
  patterns ??= Object.entries(tr)
    .filter(([key]) => key.startsWith("server.status.") || key.startsWith("server.insight.") || key.startsWith("server.activity."))
    .map(([key, template]) => compilePattern(key, template));
  return patterns;
}

const RESOURCE_KEYS: Readonly<Record<string, string>> = {
  [tr["server.resource.ammo"]]: "server.resource.ammo",
  [tr["server.resource.energy"]]: "server.resource.energy"
};

function localizeParam(name: string, value: string) {
  if (name === "towers") return value.split(", ").map(localizeTurkishTowerName).join(", ");
  if (name === "resource") {
    const key = RESOURCE_KEYS[value];
    return (key ? tMaybe(key) : undefined) ?? value;
  }
  return value;
}

/** Tek parca ("Fabrika 12/40"); kaliba uymuyorsa `undefined`. */
function localizeSegment(segment: string) {
  for (const pattern of getPatterns()) {
    const match = pattern.regex.exec(segment);
    if (!match) continue;
    const params: Record<string, string> = {};
    pattern.names.forEach((name, index) => { params[name] = localizeParam(name, match[index + 1]); });
    return tMaybe(pattern.key, params);
  }
  return undefined;
}

const statusCache = new Map<string, string>();
const STATUS_CACHE_LIMIT = 512;

/**
 * Snapshot'taki kule durumu (`status`) ya da ozeti (`insight`) secili dilde.
 *
 * Metin " | " ile ayrilmis bolumler, bolumler " · " ile ayrilmis parcalar.
 * Once bolumun tamami kaliba bakiyor ("Bu dalga: ..." kendi icinde " · "
 * tasiyor), uymazsa parca parca. Tanimayan parca Turkce kaliyor.
 */
export function localizeTowerStatusText(text: string | undefined): string {
  if (!text) return text ?? "";
  if (!isEnglish()) return text;
  const cached = statusCache.get(text);
  if (cached !== undefined) return cached;
  const localized = text.split(" | ").map((part) => localizeSegment(part)
    ?? part.split(" · ").map((segment) => localizeSegment(segment) ?? segment).join(" · ")).join(" | ");
  if (statusCache.size >= STATUS_CACHE_LIMIT) statusCache.clear();
  statusCache.set(text, localized);
  return localized;
}
