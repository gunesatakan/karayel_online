/**
 * Yerlestirme onizlemesinin menzil halkasi.
 *
 * Cekmeceden suruklenen kulenin hayaletinin cevresine, kule o kareye
 * kurulsaydi sahip olacagi menzil ciziliyor. Sayi kopyalanmiyor: taban menzil
 * `tower-stats` (`getTowerBaseLevelRange`, sunucuyla parite testi altinda),
 * yalnizlik kurali ve carpani `synergy` / `balance` uzerinden geliyor. Denge
 * gecisi AttackLord menzilini ya da yalnizlik carpanini degistirdiginde halka
 * kendiliginden dogru kaliyor.
 *
 * Sunucunun `getTowerOwnRange` sirasi korunuyor: yalnizlik carpani olceklenmis
 * menzile (seviye ve global carpan dahil) isliyor; ayak izinden baslayan
 * menzilde ayak izi yaricapi carpanin disinda kaliyor. Kart, esya, aura ve
 * isci menzil eklemeleri burada yok: onizleme yeni, seviye 1 bir kulenin
 * kendi menzilini gosteriyor.
 *
 * Saf mantik: sahne, oda ya da saat yok.
 */
import { TOWER_GRID_SIZE, getTowerGridSpan } from "../index.js";
import { ATAKAN_ISOLATION_MULTIPLIER } from "../balance/index.js";
import { countsAsTower } from "../characters/index.js";
import type { TowerDefinition } from "../characters/common/types.js";
import { getMapGridSize } from "../map.js";
import { isStructureIsolated, receivesAtakanIsolationBonus, type SynergyMap, type SynergyStructure } from "../synergy/index.js";
import { getOrbitBladeLength } from "../tower-rules.js";
import { getTowerBaseLevelRange, hasGlobalTowerRange } from "../tower-stats/index.js";

/**
 * - `attack`: kulenin vurus menzili (yorunge kulesinde bicak boyu).
 * - `aura`: saldirmayan yapinin etki ya da hizmet cemberi (Tamir Merkezi).
 * - `none`: cizilecek bir yaricap yok (kaynak binasi, duvar, Sunucu'nun
 *   butun arenayi kaplayan bagi).
 */
export type PlacementRangeKind = "attack" | "aura" | "none";

export type PlacementPreviewRange = {
  kind: PlacementRangeKind;
  /** Dunya biriminde, haritanin olcegiyle; `none`da 0. */
  radius: number;
  /** Olu bolge (Jackpot); yoksa 0. */
  minimumRadius: number;
  /** Yalnizlik odulu alabilen bir yapi mi (AttackLord kulesi, Sunucu degil). */
  isolationEligible: boolean;
  /** Bu karede yalniz kalacak mi; uygun degilse hep false. */
  isolated: boolean;
  /** Yalnizlik yokken ayni kulenin yaricapi; halka farki gostermek icin. */
  baseRadius: number;
  baseMinimumRadius: number;
};

export type PlacementPreviewRangeArgs = {
  definition: TowerDefinition;
  characterId: string;
  x: number;
  y: number;
  /** Sahadaki yapilar; yalnizlik bunlarin kareye komsulugundan. */
  structures: Iterable<Pick<SynergyStructure, "id" | "x" | "y" | "definition">>;
  map: SynergyMap;
  /** Varsayilan 1: cekmeceden kurulan kule. */
  level?: number;
};

/** Onizleme adayinin kimligi; sahadaki hicbir kimlikle karismaz. */
const PREVIEW_CANDIDATE_ID = "__range-preview__";

const NO_RANGE: PlacementPreviewRange = {
  kind: "none",
  radius: 0,
  minimumRadius: 0,
  isolationEligible: false,
  isolated: false,
  baseRadius: 0,
  baseMinimumRadius: 0
};

/**
 * Saldirmayan ama cemberi olabilen yapi: Tamir Merkezi'nin iscileri yalnizca
 * menzilindeki yapilari onariyor (sunucu `findWorstStructure`).
 */
function isNonAttackingStructure(definition: TowerDefinition) {
  return Boolean(definition.resourceProvider || definition.engine?.resourceProvider)
    || !countsAsTower(definition)
    || definition.id === "repair-depot-1";
}

/**
 * Yalnizlik carpani `multiplier` iken kulenin menzili ve olu bolgesi,
 * olceklenmemis dunya biriminde. Sunucunun `getTowerOwnRange` ve
 * `getTowerMinimumRange` sirasi.
 */
function computeRadii(definition: TowerDefinition, level: number, multiplier: number) {
  const footprint = definition.engine?.attack.rangeStartsAtFootprint
    ? TOWER_GRID_SIZE * getTowerGridSpan(definition.id) / 2
    : 0;
  // Taban menzil ayak izini iceriyor; carpan yalnizca ayak izinin disindaki kisma.
  const scaled = Math.max(0, getTowerBaseLevelRange(definition, level) - footprint) * multiplier;
  let radius = footprint + scaled;
  if (definition.engine?.attack.executor === "orbit") {
    // Yorunge kulesinin vurdugu yer bicagin ucu; sunucu bicak boyunu menzil
    // oranina gore buyutuyor (`getOrbitBladeLengthForTower`).
    const bladeLength = definition.engine.attack.bladeLength ?? definition.range;
    const rangeMultiplier = radius / Math.max(1, definition.range);
    radius = getOrbitBladeLength(bladeLength, rangeMultiplier);
  }
  const minimumMultiplier = Math.max(0, definition.engine?.attack.minimumRangeMultiplier ?? 0);
  let minimumRadius = 0;
  if (footprint > 0) {
    minimumRadius = footprint + Math.max(0, radius - footprint) * minimumMultiplier;
  } else if (minimumMultiplier > 0) {
    minimumRadius = radius * minimumMultiplier;
  }
  return { radius, minimumRadius };
}

/**
 * Kule bu kareye kurulsaydi cizilecek menzil.
 *
 * Yalnizlik, sunucunun her atista sordugu kuralla ayni: odul alabilen yapi
 * (`receivesAtakanIsolationBonus`) ve cevresindeki sekiz karede kule sayilan
 * yapi yok (`isStructureIsolated`). Haritanin olcegi sunucunun
 * `scaleWorldDistance`i gibi: kare boyu / `TOWER_GRID_SIZE`.
 */
export function getPlacementPreviewRange(args: PlacementPreviewRangeArgs): PlacementPreviewRange {
  const { definition } = args;
  const level = Math.max(1, Math.round(args.level ?? 1));
  if (hasGlobalTowerRange(definition.id)) {
    return NO_RANGE;
  }
  // Menzili sifir yapi (kaynak binasi, duvar, depo, aurasi kendi karesinde
  // kalan Zeynep yapilari) cizilecek bir cember tasimiyor.
  if (!(definition.range > 0)) {
    return NO_RANGE;
  }
  const nonAttacking = isNonAttackingStructure(definition);

  const candidate = { id: PREVIEW_CANDIDATE_ID, x: args.x, y: args.y, characterId: args.characterId, definition };
  const isolationEligible = receivesAtakanIsolationBonus(candidate);
  const isolated = isolationEligible && isStructureIsolated(candidate, args.structures, args.map);
  const worldScale = getMapGridSize(args.map) / TOWER_GRID_SIZE;
  const base = computeRadii(definition, level, 1);
  const current = isolated ? computeRadii(definition, level, ATAKAN_ISOLATION_MULTIPLIER) : base;
  return {
    kind: nonAttacking ? "aura" : "attack",
    radius: current.radius * worldScale,
    minimumRadius: current.minimumRadius * worldScale,
    isolationEligible,
    isolated,
    baseRadius: base.radius * worldScale,
    baseMinimumRadius: base.minimumRadius * worldScale
  };
}
