import type { CardTowerProfile } from "../cards/index.js";
import { canTowerHoldTargetedCard, cardAppliesToTower, towerDealsDamage, towerHasBoundedRange } from "../cards/index.js";
import { towerAims, towerFiresAlongFacing } from "../aiming/index.js";
import { towerFiresProjectiles, towerNeverAttacks } from "../ballistics/index.js";
import { TOWER_HEAT_BY_HIT_TYPE } from "../tower-rules.js";
import { WALL_TOWER_ID } from "../characters/common/wall.js";
import { REPAIR_DEPOT_TOWER_ID } from "../characters/common/repair-depot.js";
import { warehouseTower } from "../characters/common/warehouse.js";
import { lt } from "../i18n/index.js";
import type { ShopItem } from "./index.js";

/**
 * Esya yalnizca is gordugu kuleye takilir.
 *
 * Esya geri sokulemiyor; is gormedigi kuleye takilabilmesi oyuncunun altinini
 * bir hicligin uzerine harcamasi demekti (Hafif Muhimmat lazerde, Namlu
 * Yatagi duvarda, Verim Hatti enerji binasinda). Kural iki katmanli:
 *
 * 1. Esyanin kendi kapsami (`scope`, kartlarla ortak dilbilgisi).
 * 2. Esyanin vaat ettigi seyin gerektirdigi kule yetenegi. Yetenek esyanin
 *    verisinden -- statlarindan, kilitlerinden, motor eklerinden --
 *    turetiliyor; esya esya liste yok. Yeni bir esya yeni bir stat ya da
 *    kilit kullanmiyorsa kendiliginden dogru kapsami aliyor.
 *
 * Kule yetenekleri de kule tanimindan ve motorundan turetiliyor; kule kule
 * liste yok (bkz. `getTowerItemCapabilities`).
 *
 * Kural yeni takmalar icin: kayitli ya da suren bir mactaki eski takmalara
 * dokunulmuyor.
 */

/** Kule yetenegi gerektiren ihtiyaclar; `getTowerItemCapabilities` her birine evet/hayir der. */
export type ShopItemCapabilityNeed =
  /** Dusmana bir sey yapan kule: ates eden, vuran, yavaslatan ya da isaretleyen. */
  | "attacks"
  /** Hasar veren kule (`towerDealsDamage`); saf yardimci yapilar degil. */
  | "damage"
  /** Hedef secen kule: hedefleme modu ve kilidi olan (yorunge degil). */
  | "targeting"
  /** Namlusu hedefe donen kule (`towerAims`). */
  | "aims"
  /** Atisi namlu yonunde giden nisan alan kule (`towerFiresAlongFacing`): isabetin isledigi yer. */
  | "alongFacing"
  /** Mermi hizinin bir sey degistirdigi kule (`towerFiresProjectiles`). */
  | "projectiles"
  /** Atisi delme sayisini okuyan kule: balistik yurutuculu tek hedef ya da hat saldirisi. */
  | "pierce"
  /** Ateste isinan kule. */
  | "heat"
  /** Atisini muhimmatla yapan kule. */
  | "ammo"
  /** Enerjisi bitebilen saldiri kulesi (atis ya da calisma enerjisi). */
  | "energy"
  /** Calisma enerjisi tuketen yapi. */
  | "operatingEnergy"
  /** Atis ya da etki tikinda yakit (muhimmat/enerji) harcayan yapi. */
  | "shotFuel"
  /** Cephane fabrikasi: uretim statlari yalnizca orada okunuyor. */
  | "ammoFactory";

/** Kapsamdan (`scope`) gelen ihtiyaclar; kule yetenegi degil, esyanin etiketi. */
export type ShopItemScopeNeed =
  | "economyBuilding"
  | "boundedRange"
  | "combatStructure"
  | "class";

export type ShopItemNeed = ShopItemCapabilityNeed | ShopItemScopeNeed;

export const SHOP_ITEM_NEEDS: readonly ShopItemNeed[] = [
  "attacks", "damage", "targeting", "aims", "alongFacing", "projectiles", "pierce",
  "heat", "ammo", "energy", "operatingEnergy", "shotFuel", "ammoFactory",
  "economyBuilding", "boundedRange", "combatStructure", "class"
];

export type TowerResourceKind = "energy" | "ammunition" | "repairDepot" | "warehouse";

export type TowerItemCapabilities = Record<ShopItemCapabilityNeed, boolean> & {
  /** Hava hedefini tanimdan vuruyor mu (Ucaksavar Kiti'nin iki yuzu buna bakiyor). */
  hitsAir: boolean;
  /** Isin ya da odak saldirisi (mermi degil). */
  beam: boolean;
  /** Dusmana dokunmayan, yalnizca kulelere etki eden yapi (Saray Arsivi, Abarti). */
  support: boolean;
  /** Durum etkisi (yavaslatma, isaret, yanma...) uygulayan kule. */
  appliesStatus: boolean;
  /** Kaynak binasinin turu; kaynak binasi degilse yok. */
  resource?: TowerResourceKind;
  wall: boolean;
  /** Kenara oturan yapi (duvar, Abarti). */
  edge: boolean;
};

function towerResourceKind(tower: CardTowerProfile): TowerResourceKind | undefined {
  const provider = tower.resourceProvider ?? tower.engine?.resourceProvider;
  if (provider) return provider;
  if (tower.id === REPAIR_DEPOT_TOWER_ID) return "repairDepot";
  if (tower.id === warehouseTower.id) return "warehouse";
  return undefined;
}

/**
 * Kulenin esyalar icin yetenekleri, tanimdan ve motordan.
 *
 * - Saldiri: hedefli kart tasiyabilen (vurusu olan, kaynak binasi olmayan),
 *   hic saldirmayan Sunucu disinda; hasar veriyorsa ya da dusmana bir durum
 *   (vurus yavaslatmasi, dusman aurasi, isaret) yaziyorsa. Yalnizca kulelere
 *   aura veren yapilar (Saray Arsivi, Abarti) saldirmiyor.
 * - Isi: saldiran ve atis isisi sifir olmayan kule. Pasif aura yapilarinin
 *   tik isisi tabandaki sogumanin cok altinda; onlara sogutma esyasi bosa.
 * - Delme: balistik yurutuculu (yurutucusu yazilmamis ya da `ballistic`)
 *   tek hedef ve hat saldirisi. Gosteri'nin isini hattaki herkese zaten
 *   vuruyor, delme sayisini okumuyor.
 */
export function getTowerItemCapabilities(tower: CardTowerProfile): TowerItemCapabilities {
  const engine = tower.engine;
  const holdsCombat = canTowerHoldTargetedCard(tower) && !towerNeverAttacks(tower);
  const damage = holdsCombat && towerDealsDamage(tower);
  const appliesStatus = (engine?.statusEffects?.length ?? 0) > 0
    || (engine?.auras ?? []).some((aura) => aura.affects === "enemies")
    || !!engine?.appliesMark;
  const attacks = holdsCombat && (damage || appliesStatus);
  const executor = engine?.attack.executor;
  const shape = engine?.attack.shape;
  const hitType = tower.hitType ?? "projectile";
  const heatPerShot = (TOWER_HEAT_BY_HIT_TYPE[hitType] ?? 0) * (engine?.resources.heatMultiplier ?? 1);
  const shotFuel = engine?.resources.shotFuel;
  const operatingEnergyPerSecond = engine?.resources.operatingEnergyPerSecond ?? 0;
  const resource = towerResourceKind(tower);
  return {
    attacks,
    damage,
    targeting: attacks && shape !== "orbit",
    aims: attacks && !!tower.id && towerAims(tower.id),
    alongFacing: attacks && towerFiresAlongFacing(tower),
    projectiles: attacks && towerFiresProjectiles(tower),
    pierce: attacks && (!executor || executor === "ballistic") && (shape === "single" || shape === "line"),
    heat: attacks && heatPerShot > 0,
    ammo: attacks && shotFuel === "ammo",
    energy: attacks && (shotFuel === "energy" || operatingEnergyPerSecond > 0),
    operatingEnergy: canTowerHoldTargetedCard(tower) && operatingEnergyPerSecond > 0,
    shotFuel: holdsCombat,
    ammoFactory: resource === "ammunition",
    hitsAir: !!engine?.canHitAir,
    beam: executor === "debug-laser" || executor === "showcase-beam" || shape === "beam" || hitType === "focus",
    support: holdsCombat && !attacks,
    appliesStatus,
    resource,
    wall: tower.id === WALL_TOWER_ID,
    edge: !!engine?.placement?.requiresEdge
  };
}

/**
 * Statin is gordugu kule. Yazilmayan stat kuleye bir sey sormuyor (can,
 * onarim bedeli, isci, altin carpani, komsuya soguma): kapsamiyla yetiniyor.
 *
 * Anahtar duz metin, `ModifierStat` degil: stat listesi buyurken ya da bir
 * stat yeniden adlandirilirken bu tablo derlemeyi kirmasin. Yeni bir statin
 * karari burada verilmezse esya yalnizca kapsamiyla kisitlanir.
 */
const STAT_NEEDS: Readonly<Record<string, readonly ShopItemCapabilityNeed[]>> = {
  damage: ["damage"], critChance: ["damage"], critDamage: ["damage"], markAmplification: ["damage"],
  armorBreak: ["damage"], ammoEmptyDamage: ["damage", "ammo"], airDamage: ["damage"],
  damageVsShielded: ["damage"], damageVsBrute: ["damage"], damageVsGrunt: ["damage"], damageVsRunner: ["damage"],
  damageVsShooter: ["damage"], damageVsSiege: ["damage"], resistancePierce: ["damage"], weaknessBonus: ["damage"],
  // Tecrube ve oldurme primleri oldurmeden geliyor.
  experienceGain: ["damage"], airKillGold: ["damage"], damageGold: ["damage"], multiKillGold: ["damage"],
  overkillGold: ["damage"], slowedKillGold: ["damage"], longRangeKillGold: ["damage"], hotKillGold: ["damage", "heat"],
  fireRate: ["attacks"], range: ["attacks"], performanceCost: ["attacks"],
  statusDuration: ["attacks"], statusMagnitude: ["attacks"],
  heat: ["heat"], cooling: ["heat"],
  ammoCost: ["shotFuel"], energyCost: ["shotFuel"], shotFuelCost: ["shotFuel"], deliveryGold: ["shotFuel"],
  operatingEnergyCost: ["operatingEnergy"],
  accuracy: ["alongFacing"], accuracyVsAir: ["alongFacing"],
  turnRate: ["aims"], targetLockMs: ["aims"],
  projectileSpeed: ["projectiles"], projectileSpeedIsolated: ["projectiles"],
  // Uretim carpanlari yalnizca cephane fabrikasinin uretiminde okunuyor.
  resourceProduction: ["ammoFactory"], ammoProduction: ["ammoFactory"],
  // Isi, atis hizi ve nisan, ikinci tur (`heat-mechanics`).
  leadTargeting: ["alongFacing"],
  damageVsFast: ["damage"], retargetDamage: ["damage"], critSplash: ["damage"], farCritChance: ["damage"], hitSplash: ["damage"],
  slowBleed: ["attacks"], slowVulnerability: ["attacks"],
  coolingFlat: ["heat"], brakeCooling: ["heat"], ventHeat: ["heat"], heatBleed: ["heat"], fireRateHeatRelief: ["heat"],
  killCooling: ["heat", "damage"],
  coldFireRate: ["attacks", "heat"], trackRhythm: ["attacks", "heat"], overclock: ["attacks", "heat"],
  coldSalvo: ["attacks", "heat"], restartShots: ["attacks", "heat"],
  brakeDamage: ["damage", "heat"], heatToDamage: ["damage", "heat"], heatShock: ["damage", "heat"],
  // Atis hizi, soguma ve isi, ucuncu tur. Kriyo Kovan hedefin yavasligina
  // bakiyor: hedef secmeyen (yorunge) kulede hic islemez.
  woundedFireRate: ["attacks"], crowdFireRate: ["attacks"], idleCooling: ["heat"], lockCooling: ["heat"],
  critVent: ["damage", "heat"], chilledHeatRelief: ["targeting", "heat"],
  // Efsanevi vurus etkileri dogrudan vurusla kuruluyor.
  chainChance: ["damage"], blastChance: ["damage"], freezeChance: ["damage"], executeChance: ["damage"],
  shatterChance: ["damage"], chronoChance: ["damage"], linkChance: ["damage"], gravityChance: ["damage"],
  // Menzil turu. Menzil dusmana etki eden her kulede okunuyor (aura yaricapi,
  // yorunge bicagi dahil). Kenetlenme ateslenen hedefi sayiyor, Termal Mercek
  // namlunun isisini, Atis Haritasi oldurmeyi. Gozcu Diregi komsuya isliyor:
  // Rezonans Odasi gibi kuleye bir sey sormuyor (yazilmadi).
  focusRange: ["targeting"], heatRange: ["attacks", "heat"], wallRange: ["attacks"],
  rangeFlat: ["attacks"], killRange: ["damage"]
};

/** Kilidin is gordugu kule; yazilmayan kilit (altin, nexus, enkaz, onarim) bir sey sormuyor. Anahtar duz metin (bkz. `STAT_NEEDS`). */
const UNLOCK_NEEDS: Readonly<Record<string, readonly ShopItemCapabilityNeed[]>> = {
  "targeting:weakest": ["targeting"], "targeting:closest": ["targeting"], "targeting:last": ["targeting"], "targeting:random": ["targeting"],
  "status:burn": ["damage"], "status:chill": ["damage"],
  canHitAir: ["attacks"],
  "stack:kill": ["damage"], "stack:wave": ["damage"],
  adjacencyBonus: ["damage"], isolationBonus: ["damage"],
  ammoDrop: ["damage"], bloodBank: ["damage"],
  "heat:runHot": ["heat", "damage"], "heat:coldCrit": ["heat", "damage"], "heat:killVent": ["heat", "damage"],
  "heat:thermalMass": ["heat"], "heat:overheatBurst": ["heat"], "heat:radiator": ["heat"], "heat:quickRelease": ["heat"],
  "heat:chillVent": ["heat"], "heat:exchange": ["heat"], "heat:chargedCooling": ["heat"], "heat:emptyVent": ["heat"],
  "energy:backupLine": ["energy"], "ammo:emptyBleed": ["ammo", "damage"],
  "status:coolantSlow": ["attacks", "heat"], "status:slowCrit": ["attacks"], "control:deepFreeze": ["attacks"],
  "crit:vsFrozen": ["damage"], "crit:vsMarked": ["damage"], "crit:fromAccuracy": ["damage"], "crit:isolated": ["damage"],
  "attack:doubleShot": ["attacks"], "performance:idleEdge": ["attacks"],
  "aim:killSnap": ["aims"], "aim:fastTargets": ["aims"], "aim:coldAccuracy": ["alongFacing", "heat"],
  "gold:critKill": ["damage"]
};

/** Esyanin kule yetenegi ihtiyaclari: statlarindan, kilitlerinden ve motor eklerinden. */
export function getShopItemNeeds(item: ShopItem): ShopItemCapabilityNeed[] {
  const needs = new Set<ShopItemCapabilityNeed>();
  const add = (list: readonly ShopItemCapabilityNeed[] | undefined) => list?.forEach((need) => needs.add(need));
  for (const effect of item.effects) add(STAT_NEEDS[effect.stat]);
  for (const unlock of item.unlocks ?? []) add(UNLOCK_NEEDS[unlock]);
  const grants = item.grants;
  if (grants) {
    if (grants.attack?.pierceCount) needs.add("pierce");
    if (grants.statusEffects?.length) needs.add("attacks");
    if (grants.triggers?.length) needs.add("damage");
    for (const stack of grants.stacks ?? []) {
      needs.add(stack.stat === "damage" || stack.stat === "storedDamage" ? "damage" : "attacks");
    }
    if (grants.auras?.length) needs.add("attacks");
  }
  return [...needs];
}

/**
 * Kapsamin neden tutmadigi: oyuncuya gosterilecek kisa sebep. Kapsam tutuyorsa yok.
 * Kaynak binasi yalnizca ekonomi etiketli esyayi aliyor (`shopItemAppliesToTower`).
 */
function getScopeMismatch(item: ShopItem, tower: CardTowerProfile): ShopItemNeed | undefined {
  const economyTagged = item.scope.kind === "tagged" && !!item.scope.axes?.includes("economy");
  const profile = tower.resourceProvider && economyTagged ? { ...tower, resourceProvider: undefined } : tower;
  if (cardAppliesToTower({ ...item, stackable: item.repeatable }, profile)) return undefined;
  if (profile.resourceProvider) return "combatStructure";
  if (item.scope.kind !== "tagged") return "class";
  const scope = item.scope;
  const caps = getTowerItemCapabilities(tower);
  if (scope.combat && !caps.damage) return "damage";
  if (scope.aims && !caps.aims) return "aims";
  if (scope.alongFacing && !caps.alongFacing) return "alongFacing";
  if (scope.projectiles && !caps.projectiles) return "projectiles";
  if (scope.boundedRange && !towerHasBoundedRange(tower)) return "boundedRange";
  if (economyTagged) return "economyBuilding";
  return "class";
}

/**
 * Esyanin bu kuleye neden takilamayacagi; takilabiliyorsa `undefined`.
 * Once kapsam, sonra esyanin istedigi kule yetenekleri (sirasiyla).
 */
export function getShopItemTowerMismatch(item: ShopItem, tower: CardTowerProfile): ShopItemNeed | undefined {
  const scope = getScopeMismatch(item, tower);
  if (scope) return scope;
  const needs = getShopItemNeeds(item);
  if (needs.length === 0) return undefined;
  const caps = getTowerItemCapabilities(tower);
  return needs.find((need) => !caps[need]);
}

/** Esya bu kulede is gorur mu: kapsam ve kule yetenekleri. */
export function isShopItemUsefulOnTower(item: ShopItem, tower: CardTowerProfile) {
  return getShopItemTowerMismatch(item, tower) === undefined;
}

const NEED_TEXT: Record<ShopItemNeed, [tr: string, en: string]> = {
  attacks: ["yalnızca düşmana etki eden kulelere takılır", "only fits towers that act on enemies"],
  damage: ["yalnızca hasar veren kulelere takılır", "only fits damage-dealing towers"],
  targeting: ["yalnızca hedef seçen kulelere takılır", "only fits towers that pick targets"],
  aims: ["yalnızca nişan alan kulelere takılır", "only fits aiming towers"],
  alongFacing: ["yalnızca nişan alan mermi ve çarpma kulelerine takılır", "only fits aiming projectile and impact towers"],
  projectiles: ["yalnızca mermi atan kulelere takılır", "only fits projectile towers"],
  pierce: ["yalnızca mermisi düşman delebilen kulelere takılır", "only fits towers whose shots can pierce"],
  heat: ["yalnızca ateşte ısınan kulelere takılır", "only fits towers that build heat"],
  ammo: ["yalnızca mühimmatla ateş eden kulelere takılır", "only fits ammo-fed towers"],
  energy: ["yalnızca enerji tüketen saldırı kulelerine takılır", "only fits attacking towers that use energy"],
  operatingEnergy: ["yalnızca çalışma enerjisi tüketen yapılara takılır", "only fits structures with an energy upkeep"],
  shotFuel: ["yalnızca yakıt harcayan kulelere takılır", "only fits towers that spend fuel"],
  ammoFactory: ["yalnızca cephane fabrikalarına takılır", "only fits ammo factories"],
  economyBuilding: ["yalnızca ekonomi binalarına takılır", "only fits economy buildings"],
  boundedRange: ["menzili haritayı kaplayan kulelere takılmaz", "does not fit map-wide towers"],
  combatStructure: ["kaynak binalarına takılmaz", "does not fit resource buildings"],
  class: ["bu kulenin sınıfına uymaz", "does not fit this tower's class"]
};

/** Kisa sebep secili dilde ("yalnizca nisan alan kulelere takilir"). */
export function describeShopItemNeed(need: ShopItemNeed) {
  const [tr, en] = NEED_TEXT[need] ?? NEED_TEXT.class;
  return lt(tr, en);
}

/** Sebebin Turkcesi: sunucu metni (`equip.incompatible.<ihtiyac>`) buradan. */
export function getShopItemNeedTurkish(need: ShopItemNeed) {
  return (NEED_TEXT[need] ?? NEED_TEXT.class)[0];
}
