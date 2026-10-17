import { getTowerTier, TOWER_ART_DISC_RATIO, towerCatalog } from "@karayel/shared";
import { TOWER_BODY_VISUAL_SCALE } from "./visual-scale";

/**
 * Kademe basina ayri boyanmis kuleler: seviye 1-4, 5-9 ve 10 icin uc resim
 * (`tower-<id>-levels-1-4` ...). Deger dosya uzantisi.
 *
 * Bu resimler kendi karelerini dolduruyor: disk cercevenin kendisi, genel
 * boyali sanatin cikinti payi (`TOWER_ART_DISC_RATIO`) yok. O pay uygulansaydi
 * taban komsu karelere tasardi.
 */
const TIERED_TOWER_ART: Readonly<Record<string, "png" | "webp">> = {
  "warrior-1": "png",
  "warrior-2": "webp",
  "warrior-3": "png",
  "warrior-4": "webp",
  "warrior-5": "webp",
  "warrior-6": "webp"
};

const TIER_ART_SUFFIX = { 1: "levels-1-4", 2: "levels-5-9", 3: "level-10" } as const;

const SUPPLY_TOWER_ART: Readonly<Record<string, string>> = {
  "warehouse-1": "warehouse",
  "repair-depot-1": "repair",
  "warrior-7": "ammunition",
  "warrior-8": "energy",
  "zeynep-9": "ammunition",
  "zeynep-10": "energy",
  "archer-7": "ammunition",
  "archer-8": "energy"
};

export function getSupplyTowerArtPath(definitionId: string, level = 1, characterId?: string) {
  if (definitionId === "repair-depot-1" && characterId === "warrior") return `images/towers/tower-attacklord-repair${level >= 5 ? "-level-5" : ""}.png`;
  const kind = SUPPLY_TOWER_ART[definitionId];
  return kind ? `images/towers/tower-supply-${kind}${level >= 5 ? "-level-5" : ""}.png` : undefined;
}

export function listSupplyTowerArt() {
  const common = Object.keys(SUPPLY_TOWER_ART).flatMap((id) => [1, 5].map((level) => ({
    key: getTowerTextureKey(id, level),
    path: getSupplyTowerArtPath(id, level)!
  })));
  return [...common, ...[1, 5].map(level => ({
    key: getTowerTextureKey("repair-depot-1", level, "warrior"),
    path: getSupplyTowerArtPath("repair-depot-1", level, "warrior")!
  }))];
}

function hasTieredTowerArt(definitionId: string) {
  return definitionId in TIERED_TOWER_ART;
}

/** Kulenin doku anahtari; kademe resmi olan kulede seviyenin kademesi. */
export function getTowerTextureKey(definitionId: string, level: number, characterId?: string) {
  if (definitionId === "repair-depot-1" && characterId === "warrior") return `tower-attacklord-repair${level >= 5 ? "-level-5" : ""}`;
  if (definitionId in SUPPLY_TOWER_ART && level >= 5) return `tower-${definitionId}-level-5`;
  if (!hasTieredTowerArt(definitionId)) return `tower-${definitionId}`;
  return `tower-${definitionId}-${TIER_ART_SUFFIX[getTowerTier(level)]}`;
}

/** Kademe resminin `public/` altindaki yolu; kademe resmi yoksa undefined. */
export function getTieredTowerArtPath(definitionId: string, level: number) {
  const extension = TIERED_TOWER_ART[definitionId];
  return extension ? `images/towers/${getTowerTextureKey(definitionId, level)}.${extension}` : undefined;
}

/** Yuklenecek kademe resimleri: doku anahtari ve yolu. */
export function listTieredTowerArt() {
  return Object.keys(TIERED_TOWER_ART).flatMap((definitionId) => ([1, 5, 10] as const).map((level) => ({
    key: getTowerTextureKey(definitionId, level),
    path: getTieredTowerArtPath(definitionId, level)!
  })));
}

/**
 * Kule resminin cizim boyu: disk kule izine (`discSize`) tam otursun diye.
 * Kademe resimleri kareyi dolduruyor; digerleri cikinti payi birakiyor.
 */
export const TOWER_VISUAL_SCALE = 0.9;

/** Kenara yerlesen yapilar (duvar, Abarti): cizim boyu etki dikdortgeni, kuculmuyor. */
const EDGE_PLACED_TOWER_IDS: ReadonlySet<string> = new Set(
  Object.values(towerCatalog).flat().filter((tower) => tower.engine?.placement?.requiresEdge).map((tower) => tower.id)
);

/**
 * Kule govdesinin gorunus carpani (visual-scale): kenar yapilarinda 1.
 * Izgara izi, dokunma alani ve menzil bunu okumuyor.
 */
export function getTowerBodyVisualScale(definitionId: string) {
  return EDGE_PLACED_TOWER_IDS.has(definitionId) ? 1 : TOWER_BODY_VISUAL_SCALE;
}

/** Govdenin ekrandaki capi: kule izi (`discSize`) x govde carpani. */
export function getTowerBodySize(definitionId: string, discSize: number) {
  return discSize * getTowerBodyVisualScale(definitionId);
}

export function getTowerSpriteSize(definitionId: string, discSize: number) {
  const size = hasTieredTowerArt(definitionId) || getSupplyTowerArtPath(definitionId) ? discSize : discSize / TOWER_ART_DISC_RATIO;
  return size * TOWER_VISUAL_SCALE * getTowerBodyVisualScale(definitionId);
}
