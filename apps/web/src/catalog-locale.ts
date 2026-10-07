import {
  ARCHIVE_RARITY_LABELS,
  BADGE_CATALOG,
  BADGE_GROUP_LABELS,
  KILL_STREAK_TIER_LABELS,
  ROLE_TITLE_LABELS,
  RUN_ROLE_TITLES,
  SHOP_CATEGORY_LABELS,
  STAMP_CATALOG,
  TITLE_CATALOG,
  UCUBE_PERK_TIERS,
  ULTIMATE_RESULT_LABELS,
  WORKER_DEVELOPMENT_CELLS,
  WORKER_DEVELOPMENT_ROWS,
  WORKER_ROLE_DESCRIPTIONS,
  WORKER_ROLE_LABELS,
  WORKER_SKILL_TIERS,
  WORKER_SPECIALIZATION_CHOICES,
  activityLabels,
  cardCatalog,
  characters,
  shopCatalog,
  stageCatalog,
  towerCatalog
} from "@karayel/shared";
import {
  ammoTypeLabels,
  attackShapeLabels,
  cardRarityLabels,
  classTypeCodex,
  damageTypeCodex,
  hitTypeCodex,
  towerAxisLabels
} from "./codex";
import { getLocale } from "./i18n";
import { enCards } from "./locales/catalog/en-cards";
import {
  enActivityLabels,
  enAmmoTypeLabels,
  enArchiveRarityLabels,
  enAttackShapeLabels,
  enBadgeGroupLabels,
  enBadges,
  enCardRarityLabels,
  enClassTypeCodex,
  enDamageTypeCodex,
  enHitTypeCodex,
  enKillStreakTierLabels,
  enMasteryTitle,
  enRoleTitleLabels,
  enRunRoleTitles,
  enShopCategoryLabels,
  enStamps,
  enTitles,
  enTowerAxisLabels,
  enUltimateResultLabels,
  enWorkerRoleDescriptions,
  enWorkerRoleLabels,
  enWorkerSkills
} from "./locales/catalog/en-progression";
import { enShopItems } from "./locales/catalog/en-shop";
import { enCharacters, enSkills, enStages, enTowers, enUcubePerks } from "./locales/catalog/en-units";

/**
 * Katalog metinlerinin dili (kart, esya, kule, operator, beceri, asama).
 *
 * Kaynak Turkce paylasilan katalog; Ingilizce metinler `locales/catalog/`
 * altinda kimlige gore. Burada istemcideki katalog nesnelerinin metin
 * alanlari (`name`, `description`...) dile bakan okuyuculara cevriliyor:
 * `getCardDefinition(id).name` gibi butun yerel aramalar, okuyan kodu
 * degistirmeden secili dilde donuyor. Sunucu kendi kopyasini kullaniyor,
 * ona dokunulmuyor.
 *
 * Sunucudan gelen nesneler (kart secimi, magaza teklifleri, kule adi)
 * katalog nesnesi degil; onlar kimlikle yeniden cozulmeli.
 *
 * Ingilizce metni olmayan alan Turkce kaliyor; eksikler testte listeleniyor.
 */

type TextOverlay = Readonly<Record<string, unknown>> | undefined;

const installed = new WeakSet<object>();

/** Alanlari dile bakan okuyucuya cevirir; nesne bir kez kuruluyor. */
function localizeFields(entry: object, fields: readonly string[], english: () => TextOverlay) {
  if (installed.has(entry)) return;
  installed.add(entry);
  const record = entry as Record<string, unknown>;
  for (const field of fields) {
    let source = record[field];
    if (typeof source !== "string") continue;
    Object.defineProperty(entry, field, {
      configurable: true,
      enumerable: true,
      get() {
        if (getLocale() === "en") {
          const value = english()?.[field];
          if (typeof value === "string" && value.length > 0) return value;
        }
        return source;
      },
      set(value: unknown) {
        source = value;
      }
    });
  }
}

/** Duz etiket haritasi (`anahtar -> metin`): her anahtar dile bakan okuyucu. */
export function localizeLabelMap(map: Record<string, string>, english: Readonly<Record<string, string>>) {
  if (installed.has(map)) return;
  installed.add(map);
  for (const key of Object.keys(map)) {
    let source = map[key];
    Object.defineProperty(map, key, {
      configurable: true,
      enumerable: true,
      get() {
        return getLocale() === "en" ? english[key] ?? source : source;
      },
      set(value: string) {
        source = value;
      }
    });
  }
}

let done = false;

/**
 * Turkce kule adindan tanim kimligi. Sunucunun Turkce yazdigi kule ozeti
 * (`insight`) adlari metnin icinde tasiyor; istemci onlari bu dizinle
 * tanimaya ceviriyor. Kurulumdan sonra katalog adi dile bakiyor, bu yuzden
 * Turkce adlar kurulumdan once yaziliyor.
 */
const turkishTowerIds = new Map<string, string>();

function indexTurkishTowerNames() {
  for (const tower of [...Object.values(towerCatalog).flat(), ...characters.flatMap((character) => character.towers)]) {
    if (!installed.has(tower) && !turkishTowerIds.has(tower.name)) turkishTowerIds.set(tower.name, tower.id);
  }
}

/** Sunucunun yazdigi Turkce kule adinin tanim kimligi; tanimazsa `undefined`. */
export function getTowerIdByTurkishName(name: string) {
  if (turkishTowerIds.size === 0) indexTurkishTowerNames();
  return turkishTowerIds.get(name);
}

/** Acilista bir kez; menu ve oyun arayuzu kurulmadan once. */
export function installCatalogLocale() {
  if (done) return;
  done = true;
  indexTurkishTowerNames();
  for (const card of cardCatalog) localizeFields(card, ["name", "description"], () => enCards[card.id]);
  for (const item of shopCatalog) localizeFields(item, ["name", "description"], () => enShopItems[item.id]);
  for (const towers of Object.values(towerCatalog)) {
    for (const tower of towers) localizeFields(tower, ["name", "role", "description"], () => enTowers[tower.id]);
  }
  for (const character of characters) {
    localizeFields(character, ["role", "theme", "summary", "passive", "ultimate"], () => enCharacters[character.id]);
    for (const tower of character.towers) localizeFields(tower, ["name", "role", "description"], () => enTowers[tower.id]);
    for (const skill of character.skills) localizeFields(skill, ["name", "description"], () => enSkills[skill.id]);
  }
  for (const tier of UCUBE_PERK_TIERS) {
    for (const perk of tier.options) localizeFields(perk, ["name", "description"], () => enUcubePerks[perk.id]);
  }
  for (const stage of stageCatalog) localizeFields(stage, ["name", "raceName", "description"], () => enStages[stage.id]);

  // Isci becerileri: katmanlar, gelisim satirlari, onlardan turetilen hucreler
  // ve uzmanlik secimleri. Yapilari farkli; kimligi ve adi olan her nesne.
  const workerOverlay = enWorkerSkills as Readonly<Record<string, TextOverlay>>;
  for (const entry of findNamedEntries([WORKER_SKILL_TIERS, WORKER_DEVELOPMENT_ROWS, WORKER_DEVELOPMENT_CELLS, WORKER_SPECIALIZATION_CHOICES])) {
    localizeFields(entry, ["name", "description"], () => workerOverlay[entry.id]);
  }
  localizeLabelMap(WORKER_ROLE_LABELS as Record<string, string>, enWorkerRoleLabels);
  localizeLabelMap(WORKER_ROLE_DESCRIPTIONS as Record<string, string>, enWorkerRoleDescriptions);

  for (const badge of BADGE_CATALOG) localizeFields(badge, ["name", "condition"], () => enBadges[badge.id]);
  for (const title of TITLE_CATALOG) localizeFields(title, ["label"], () => ({ label: englishTitle(title) }));
  for (const stamp of STAMP_CATALOG) localizeFields(stamp, ["label"], () => ({ label: (enStamps as Readonly<Record<string, string>>)[stamp.id] }));

  const labelMaps: Array<[Record<string, string>, Readonly<Record<string, string>>]> = [
    [BADGE_GROUP_LABELS as Record<string, string>, enBadgeGroupLabels],
    [ARCHIVE_RARITY_LABELS, enArchiveRarityLabels],
    [SHOP_CATEGORY_LABELS, enShopCategoryLabels],
    [ROLE_TITLE_LABELS as Record<string, string>, enRoleTitleLabels],
    [RUN_ROLE_TITLES as Record<string, string>, enRunRoleTitles],
    [KILL_STREAK_TIER_LABELS as Record<string, string>, enKillStreakTierLabels],
    [ULTIMATE_RESULT_LABELS as Record<string, string>, enUltimateResultLabels],
    [activityLabels, enActivityLabels],
    [towerAxisLabels, enTowerAxisLabels],
    [cardRarityLabels, enCardRarityLabels],
    [attackShapeLabels, enAttackShapeLabels],
    [ammoTypeLabels, enAmmoTypeLabels]
  ];
  for (const [map, english] of labelMaps) localizeLabelMap(map, english);

  const codices: Array<[Record<string, object>, Readonly<Record<string, TextOverlay>>]> = [
    [classTypeCodex, enClassTypeCodex],
    [damageTypeCodex, enDamageTypeCodex],
    [hitTypeCodex, enHitTypeCodex]
  ];
  for (const [codex, english] of codices) {
    for (const [key, entry] of Object.entries(codex)) localizeFields(entry, ["name", "text"], () => english[key]);
  }
}

type NamedEntry = { id: string; name: string };

/** Ic ice dizi ve kayitlarda kimligi ve adi olan nesneler (her biri bir kez). */
function findNamedEntries(roots: readonly unknown[]) {
  const found = new Set<NamedEntry>();
  const seen = new Set<object>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string" && typeof record.name === "string") found.add(value as NamedEntry);
    for (const child of Object.values(record)) walk(child);
  };
  roots.forEach(walk);
  return [...found];
}

/** Unvanin Ingilizcesi: nisan unvani sabit, ustalik unvani operator adindan. */
function englishTitle(title: (typeof TITLE_CATALOG)[number]) {
  const fixed = enTitles[title.id];
  if (fixed) return fixed;
  const unlock = title.unlock as { kind?: string; characterId?: string; level?: number } | undefined;
  if (unlock?.kind !== "mastery" || !unlock.characterId || unlock.level === undefined) return undefined;
  const character = characters.find((entry) => entry.id === unlock.characterId);
  return character ? enMasteryTitle(character.displayName, unlock.level) : undefined;
}

/** Kapsam testi icin: Ingilizce metni eksik katalog kayitlari. */
export function listMissingCatalogTranslations() {
  const missing: string[] = [];
  const need = (kind: string, id: string | number, overlay: TextOverlay, fields: readonly string[], source: object) => {
    for (const field of fields) {
      const text = (source as Record<string, unknown>)[field];
      if (typeof text !== "string" || text.length === 0) continue;
      const value = overlay?.[field];
      if (typeof value !== "string" || value.length === 0) missing.push(`${kind}:${id}.${field}`);
    }
  };
  for (const card of cardCatalog) need("card", card.id, enCards[card.id], ["name", "description"], card);
  for (const item of shopCatalog) need("item", item.id, enShopItems[item.id], ["name", "description"], item);
  const towers = new Map(Object.values(towerCatalog).flat().map((tower) => [tower.id, tower]));
  for (const tower of towers.values()) need("tower", tower.id, enTowers[tower.id], ["name", "role", "description"], tower);
  for (const character of characters) {
    need("character", character.id, enCharacters[character.id], ["role", "theme", "summary", "passive", "ultimate"], character);
    for (const skill of character.skills) need("skill", skill.id, enSkills[skill.id], ["name", "description"], skill);
  }
  for (const tier of UCUBE_PERK_TIERS) {
    for (const perk of tier.options) need("perk", perk.id, enUcubePerks[perk.id], ["name", "description"], perk);
  }
  for (const stage of stageCatalog) need("stage", stage.id, enStages[stage.id], ["name", "raceName", "description"], stage);
  const workerOverlay = enWorkerSkills as Readonly<Record<string, TextOverlay>>;
  for (const entry of findNamedEntries([WORKER_SKILL_TIERS, WORKER_DEVELOPMENT_ROWS, WORKER_DEVELOPMENT_CELLS, WORKER_SPECIALIZATION_CHOICES])) {
    need("worker", entry.id, workerOverlay[entry.id], ["name", "description"], entry);
  }
  for (const badge of BADGE_CATALOG) need("badge", badge.id, enBadges[badge.id], ["name", "condition"], badge);
  for (const title of TITLE_CATALOG) need("title", title.id, { label: englishTitle(title) }, ["label"], title);
  return missing;
}
