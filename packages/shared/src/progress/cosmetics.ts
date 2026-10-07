import { characters } from "../characters/index.js";
import { lt } from "../i18n/index.js";
import type { CharacterId } from "../index.js";
import { getBadgeDefinition, type BadgeBook } from "./badges.js";
import { MASTERY_MAX_LEVEL } from "./mastery.js";

/**
 * Kozmetik: unvan, onuncu seviye kulelerde tac susu ve kosu raporunun muhru.
 *
 * Kural burada, depo istemcide (apps/web/src/progress-store.ts). Hepsi
 * ustalikla ya da nisanla aciliyor ve hicbiri oyuna dokunmuyor: stat, altin,
 * kart, baslangic kulesi yok. Takim arkadasi da bunlari gormuyor -- unvan,
 * tac ve muhur yalnizca bu tarayicida. Gostermek bir tel alani isterdi;
 * sunucuya hicbir secim gitmiyor, yani dogrulanacak bir girdi de yok.
 *
 * Secim depoda kimlik olarak duruyor ve her okumada acilmis olanlarla
 * karsilastiriliyor: kurcalanmis depo kilitli bir unvani gosteremez, en kotu
 * durumda unvan yok ve muhur klasik.
 */

/** Deponun bicim surumu; anahtar da surumlu (`karayel_cosmetics_v1`). */
export const COSMETICS_VERSION = 1;

/** Unvanin acildigi ustalik seviyeleri. */
export const MASTERY_TITLE_LEVELS = { journeyman: 5, master: MASTERY_MAX_LEVEL } as const;
/** Tac susu: herhangi bir operatorde bu ustalik. */
export const CROWN_MASTERY_LEVEL = 5;

export type CosmeticUnlock =
  | { kind: "mastery"; characterId?: CharacterId; level: number }
  | { kind: "badge"; badgeId: string };

export type TitleDefinition = { id: string; label: string; unlock: CosmeticUnlock };

/** Nisandan gelen unvanlar; adlari 375 px'te afisin ikinci satirina sigacak kadar kisa. */
const BADGE_TITLES: ReadonlyArray<{ badgeId: string; label: string }> = [
  { badgeId: "hava-sahasi", label: "Hava Muhafızı" },
  { badgeId: "kesintisiz", label: "Sızdırmaz" },
  { badgeId: "sampiyon-avcisi", label: "Şampiyon Avcısı" },
  { badgeId: "dogru-silah", label: "Doğru Silah" },
  { badgeId: "her-cephede", label: "Yedi Cephe" },
  { badgeId: "son-kale", label: "Son Kale" },
  { badgeId: "arsivci", label: "Arşivci" },
  { badgeId: "kusursuz", label: "Kusursuz" }
];

function operatorName(characterId: CharacterId) {
  return characters.find((character) => character.id === characterId)?.displayName ?? lt("Operatör", "Operator");
}

/**
 * Unvan katalogu: operator basina iki ustalik unvani ("Zeynep Kalfası" 5'te,
 * "Zeynep Ustası" 10'da) ve nisan unvanlari.
 */
export const TITLE_CATALOG: readonly TitleDefinition[] = [
  ...characters.flatMap((character): TitleDefinition[] => [
    {
      id: `m-${character.id}-${MASTERY_TITLE_LEVELS.journeyman}`,
      label: `${operatorName(character.id)} Kalfası`,
      unlock: { kind: "mastery", characterId: character.id, level: MASTERY_TITLE_LEVELS.journeyman }
    },
    {
      id: `m-${character.id}-${MASTERY_TITLE_LEVELS.master}`,
      label: `${operatorName(character.id)} Ustası`,
      unlock: { kind: "mastery", characterId: character.id, level: MASTERY_TITLE_LEVELS.master }
    }
  ]),
  ...BADGE_TITLES.map((title): TitleDefinition => ({ id: `b-${title.badgeId}`, label: title.label, unlock: { kind: "badge", badgeId: title.badgeId } }))
];

export type StampStyleId = "klasik" | "bronz" | "gumus" | "altin";

export type StampDefinition = { id: StampStyleId; label: string; unlock?: CosmeticUnlock };

/** Kosu raporunun yildiz / dalga muhru. Klasik herkeste acik. */
export const STAMP_CATALOG: readonly StampDefinition[] = [
  { id: "klasik", label: "Klasik" },
  { id: "bronz", label: "Bronz mühür", unlock: { kind: "mastery", level: 3 } },
  { id: "gumus", label: "Gümüş mühür", unlock: { kind: "mastery", level: 7 } },
  { id: "altin", label: "Altın mühür", unlock: { kind: "mastery", level: MASTERY_MAX_LEVEL } }
];

export const CROWN_UNLOCK: CosmeticUnlock = { kind: "mastery", level: CROWN_MASTERY_LEVEL };

/** Acilislarin dayandigi olgular: operator basina ustalik seviyesi ve nisan defteri. */
export type CosmeticFacts = {
  masteryLevels: Partial<Record<CharacterId, number>>;
  badges: BadgeBook;
};

export function isCosmeticUnlocked(unlock: CosmeticUnlock | undefined, facts: CosmeticFacts) {
  if (!unlock) return true;
  if (unlock.kind === "badge") return Object.hasOwn(facts.badges, unlock.badgeId);
  if (unlock.characterId) return (facts.masteryLevels[unlock.characterId] ?? 1) >= unlock.level;
  return Object.values(facts.masteryLevels).some((level) => (level ?? 1) >= unlock.level);
}

/** Kilitliyken menude yazan kosul: "Zeynep ustalığı 5", "Hava Sahası nişanı". */
export function describeCosmeticUnlock(unlock: CosmeticUnlock | undefined) {
  if (!unlock) return lt("Açık", "Unlocked");
  if (unlock.kind === "badge") {
    const name = getBadgeDefinition(unlock.badgeId)?.name;
    return lt(`${name ?? "Bir"} nişanı`, name ? `${name} badge` : "A badge");
  }
  if (unlock.characterId) return lt(`${operatorName(unlock.characterId)} ustalığı ${unlock.level}`, `${operatorName(unlock.characterId)} mastery ${unlock.level}`);
  return lt(`Herhangi bir operatörde ustalık ${unlock.level}`, `Mastery ${unlock.level} on any operator`);
}

export type CosmeticSelection = {
  /** Secili unvanin kimligi; yoksa unvan gosterilmiyor. */
  title?: string;
  stamp: StampStyleId;
  /** Tac susu acik olsa bile oyuncu kapatabiliyor. */
  crown: boolean;
};

export type StoredCosmetics = { v: typeof COSMETICS_VERSION } & CosmeticSelection;

export function createDefaultCosmetics(): CosmeticSelection {
  return { stamp: "klasik", crown: true };
}

function isStampId(value: unknown): value is StampStyleId {
  return STAMP_CATALOG.some((stamp) => stamp.id === value);
}

export function getTitleDefinition(id: unknown) {
  return typeof id === "string" ? TITLE_CATALOG.find((title) => title.id === id) : undefined;
}

/** Depodan okunan secim; bilinmeyen kimlik dusuyor. Acilma burada degil `resolveCosmetics`te. */
export function sanitizeCosmetics(raw: unknown): CosmeticSelection {
  const selection = createDefaultCosmetics();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return selection;
  const stored = raw as Partial<StoredCosmetics>;
  if (stored.v !== COSMETICS_VERSION) return selection;
  if (getTitleDefinition(stored.title)) selection.title = stored.title;
  if (isStampId(stored.stamp)) selection.stamp = stored.stamp;
  if (typeof stored.crown === "boolean") selection.crown = stored.crown;
  return selection;
}

export function serializeCosmetics(selection: CosmeticSelection): StoredCosmetics {
  const stored: StoredCosmetics = { v: COSMETICS_VERSION, stamp: selection.stamp, crown: selection.crown };
  if (selection.title) stored.title = selection.title;
  return stored;
}

/** Ekranda gercekten kullanilan kozmetik: kilitli secim gosterilmiyor. */
export type ResolvedCosmetics = {
  /** Unvanin metni; secili degilse ya da kilitliyse yok. */
  title?: string;
  titleId?: string;
  stamp: StampStyleId;
  /** Tac onuncu seviye kulelerde cizilsin mi. */
  crown: boolean;
};

export function resolveCosmetics(selection: CosmeticSelection, facts: CosmeticFacts): ResolvedCosmetics {
  const title = getTitleDefinition(selection.title);
  const stamp = STAMP_CATALOG.find((entry) => entry.id === selection.stamp);
  const resolved: ResolvedCosmetics = {
    stamp: stamp && isCosmeticUnlocked(stamp.unlock, facts) ? stamp.id : "klasik",
    crown: selection.crown && isCosmeticUnlocked(CROWN_UNLOCK, facts)
  };
  if (title && isCosmeticUnlocked(title.unlock, facts)) {
    resolved.title = title.label;
    resolved.titleId = title.id;
  }
  return resolved;
}

export type CosmeticOptionView = { id: string; label: string; unlocked: boolean; selected: boolean; condition: string };

export type CosmeticsView = {
  titles: CosmeticOptionView[];
  stamps: CosmeticOptionView[];
  crown: { unlocked: boolean; on: boolean; condition: string };
};

/** Menudeki kozmetik secimi: acilanlar once, kilitliler kosuluyla. */
export function buildCosmeticsView(selection: CosmeticSelection, facts: CosmeticFacts): CosmeticsView {
  const resolved = resolveCosmetics(selection, facts);
  const titles = TITLE_CATALOG.map((title): CosmeticOptionView => ({
    id: title.id,
    label: title.label,
    unlocked: isCosmeticUnlocked(title.unlock, facts),
    selected: resolved.titleId === title.id,
    condition: describeCosmeticUnlock(title.unlock)
  }));
  return {
    titles: [...titles.filter((title) => title.unlocked), ...titles.filter((title) => !title.unlocked)],
    stamps: STAMP_CATALOG.map((stamp) => ({
      id: stamp.id,
      label: stamp.label,
      unlocked: isCosmeticUnlocked(stamp.unlock, facts),
      selected: resolved.stamp === stamp.id,
      condition: describeCosmeticUnlock(stamp.unlock)
    })),
    crown: { unlocked: isCosmeticUnlocked(CROWN_UNLOCK, facts), on: resolved.crown, condition: describeCosmeticUnlock(CROWN_UNLOCK) }
  };
}

/** Bu kosuyla acilan kozmetikler: once/sonra olgulari; rapor notu icin. */
export function findNewCosmetics(before: CosmeticFacts, after: CosmeticFacts): string[] {
  const labels: string[] = [];
  for (const title of TITLE_CATALOG) {
    if (!isCosmeticUnlocked(title.unlock, before) && isCosmeticUnlocked(title.unlock, after)) labels.push(`${lt("Unvan", "Title")}: ${title.label}`);
  }
  for (const stamp of STAMP_CATALOG) {
    if (!isCosmeticUnlocked(stamp.unlock, before) && isCosmeticUnlocked(stamp.unlock, after)) labels.push(stamp.label);
  }
  if (!isCosmeticUnlocked(CROWN_UNLOCK, before) && isCosmeticUnlocked(CROWN_UNLOCK, after)) labels.push(lt("Taç süsü", "Crown ornament"));
  return labels;
}

/** Secimi guncelle; kilitli secim reddediliyor (ayni nesne doner). */
export function selectCosmetic(
  selection: CosmeticSelection,
  facts: CosmeticFacts,
  change: { title?: string | null; stamp?: string; crown?: boolean }
): CosmeticSelection {
  const next = { ...selection };
  if (change.title === null) delete next.title;
  else if (change.title !== undefined) {
    const title = getTitleDefinition(change.title);
    if (!title || !isCosmeticUnlocked(title.unlock, facts)) return selection;
    next.title = title.id;
  }
  if (change.stamp !== undefined) {
    const stamp = STAMP_CATALOG.find((entry) => entry.id === change.stamp);
    if (!stamp || !isCosmeticUnlocked(stamp.unlock, facts)) return selection;
    next.stamp = stamp.id;
  }
  if (change.crown !== undefined) next.crown = change.crown === true;
  return next;
}

/**
 * Seri afisinin ikinci satiri: buff once (gucun kendisi), unvan sonra.
 * 375 px'te tek satira sigmazsa unvan dusuyor: afisin isi seriyi soylemek.
 */
export const BANNER_LINE_MAX_CHARS = 40;

export function formatBannerSecondLine(buff: string, title: string | undefined) {
  if (!title) return buff;
  if (!buff) return title;
  const joined = `${buff} · ${title}`;
  return joined.length <= BANNER_LINE_MAX_CHARS ? joined : buff;
}

/**
 * Kulenin can cubugunun kadrandan yuksekligi: cubuk `y - r - 8`de, 3 px
 * kalin ve 1 px cerceveli, yani kadranin 4-9 px ustu. Tac bu yuzden onun
 * ustunde duruyor; istemci cubugu da bu sabitle ciziyor.
 */
export const TOWER_HEALTH_BAR_LIFT_PX = 8;
/** Tacin tabani kadranin bu kadar ustunde: cubugun cercevesinden 2 px bosluk. */
export const TOWER_CROWN_LIFT_PX = TOWER_HEALTH_BAR_LIFT_PX + 3;

/**
 * Tac susunun koseleri: uc disli altin tac, kadranin tepesinde ortali.
 *
 * Genislik kadranla buyuyor ama 14 px'te duruyor; yukseklik genisligin
 * yarisi. Seviye etiketi (`y - r - 26`, ~10 px yazi) tacin tepesinden de
 * yukarida kaliyor.
 */
export function getTowerCrownPoints(x: number, y: number, discRadius: number): Array<{ x: number; y: number }> {
  const width = Math.min(14, Math.max(10, discRadius * 0.62));
  const height = width * 0.5;
  const baseY = y - discRadius - TOWER_CROWN_LIFT_PX;
  const left = x - width / 2;
  return [
    { x: left, y: baseY },
    { x: left, y: baseY - height * 0.7 },
    { x: left + width * 0.25, y: baseY - height * 0.35 },
    { x, y: baseY - height },
    { x: left + width * 0.75, y: baseY - height * 0.35 },
    { x: left + width, y: baseY - height * 0.7 },
    { x: left + width, y: baseY }
  ];
}
