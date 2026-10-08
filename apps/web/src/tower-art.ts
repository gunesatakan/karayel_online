import { getTowerTier, TOWER_ART_DISC_RATIO } from "@karayel/shared";

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
  "warrior-4": "webp",
  "warrior-5": "webp",
  "warrior-6": "webp"
};

const TIER_ART_SUFFIX = { 1: "levels-1-4", 2: "levels-5-9", 3: "level-10" } as const;

function hasTieredTowerArt(definitionId: string) {
  return definitionId in TIERED_TOWER_ART;
}

/** Kulenin doku anahtari; kademe resmi olan kulede seviyenin kademesi. */
export function getTowerTextureKey(definitionId: string, level: number) {
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
export function getTowerSpriteSize(definitionId: string, discSize: number) {
  return hasTieredTowerArt(definitionId) ? discSize : discSize / TOWER_ART_DISC_RATIO;
}
