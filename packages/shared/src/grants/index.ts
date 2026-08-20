import type {
  TowerAuraDefinition,
  TowerEngineConfig,
  TowerStackDefinition,
  TowerStatusEffectDefinition,
  TowerTriggerDefinition
} from "../characters/common/types.js";

/**
 * Kartlarin ve esyalarin kule motoruna ekleyebildigi parcalar.
 *
 * Bir kartin tasiyabildigi tek sey uzun sure `Modifier` idi: otuz stattan birine
 * duz bir sayi. Bu, dilbilgisi geregi her karti "+%X su stata" cumlesine
 * hapsediyordu. Oysa motor cok daha zengin konusuyor; stack, aura, trigger ve
 * statu tanimlariyla "ayni hedefe vurdukca guclen", "asiri isinirsa patla",
 * "vuruslarina yavaslatma ekle" gibi davranislari zaten ifade edebiliyor.
 *
 * `TowerGrant` o dili karta acar. Sunucu sabit tanim yerine cozulmus motoru
 * okudugu icin, buraya yazilan bir stack tanimi hicbir yeni sunucu dali
 * gerektirmeden calisir: yeni icerik kod degil veri isi olur.
 */
export type TowerAttackGrant = {
  /** Delme sayisina eklenir. */
  pierceCount?: number;
  /** Yorunge bicak sayisina eklenir. */
  bladeCount?: number;
  radiusMultiplier?: number;
  angleMultiplier?: number;
  widthMultiplier?: number;
  lengthMultiplier?: number;
};

export type TowerGrant = {
  statusEffects?: TowerStatusEffectDefinition[];
  stacks?: TowerStackDefinition[];
  auras?: TowerAuraDefinition[];
  triggers?: TowerTriggerDefinition[];
  attack?: TowerAttackGrant;
};

const addDefined = (value: number | undefined, addition: number | undefined) =>
  addition === undefined ? value : Math.max(0, (value ?? 0) + addition);

function mergeAttack(base: TowerEngineConfig["attack"], grants: readonly TowerGrant[]): TowerEngineConfig["attack"] {
  let attack = base;
  for (const grant of grants) {
    const mutation = grant.attack;
    if (!mutation) continue;
    attack = {
      ...attack,
      pierceCount: addDefined(attack.pierceCount, mutation.pierceCount),
      bladeCount: addDefined(attack.bladeCount, mutation.bladeCount)
    };
  }
  return attack;
}

export type TowerAttackMultipliers = { radius: number; angle: number; width: number; length: number };

export const NEUTRAL_ATTACK_MULTIPLIERS: TowerAttackMultipliers = { radius: 1, angle: 1, width: 1, length: 1 };

/**
 * Geometri carpanlari motora islenmez, ayri tasinir.
 *
 * Delme ve bicak sayisi motorda duran ve motordan okunan degerler, o yuzden
 * birlestirilebilirler. Yaricap, aci ve genislik icin ayni sey dogru degil:
 * bunlarin taban degeri kimi kulede `engine.attack`'ta, kimi kulede eski
 * `aoeRadius` alaninda, koni acisinda ise sunucudaki bir sabitte duruyor.
 * Carpani motora yazmaya calismak, tabani tanimsiz olan kulelerde onu sessizce
 * dusurur; bir donem `genis-halka` karti tam olarak boyle olu icerikti.
 */
export function resolveTowerAttackMultipliers(grants: readonly TowerGrant[]): TowerAttackMultipliers {
  const multipliers = { ...NEUTRAL_ATTACK_MULTIPLIERS };
  for (const grant of grants) {
    const mutation = grant.attack;
    if (!mutation) continue;
    if (mutation.radiusMultiplier !== undefined) multipliers.radius *= Math.max(0, mutation.radiusMultiplier);
    if (mutation.angleMultiplier !== undefined) multipliers.angle *= Math.max(0, mutation.angleMultiplier);
    if (mutation.widthMultiplier !== undefined) multipliers.width *= Math.max(0, mutation.widthMultiplier);
    if (mutation.lengthMultiplier !== undefined) multipliers.length *= Math.max(0, mutation.lengthMultiplier);
  }
  return multipliers;
}

/**
 * Sabit kule tanimini kartlarin/esyalarin ekledikleriyle birlestirir.
 *
 * Stack kimlikleri benzersiz olmak zorunda: sunucu `ucube-fire-rate` gibi
 * kimliklere ada gore bakiyor. Cakisan bir grant'i sessizce uygulamak kulenin
 * imza mekanigini bozardi, o yuzden temel tanim kazanir.
 *
 * Motoru olmayan kuleye grant islemez; ortada genisletilecek bir saldiri sekli
 * yoktur ve uydurmak, kaynak binalarina saldiri davranisi takmak demek olurdu.
 */
export function resolveTowerEngine(
  base: TowerEngineConfig | undefined,
  grants: readonly TowerGrant[]
): TowerEngineConfig | undefined {
  if (!base || grants.length === 0) return base;

  const statusEffects = [...(base.statusEffects ?? [])];
  const auras = [...(base.auras ?? [])];
  const triggers = [...(base.triggers ?? [])];
  const stacks = [...(base.stacks ?? [])];
  const stackIds = new Set(stacks.map((stack) => stack.id));

  for (const grant of grants) {
    if (grant.statusEffects) statusEffects.push(...grant.statusEffects);
    if (grant.auras) auras.push(...grant.auras);
    if (grant.triggers) triggers.push(...grant.triggers);
    for (const stack of grant.stacks ?? []) {
      if (stackIds.has(stack.id)) continue;
      stackIds.add(stack.id);
      stacks.push(stack);
    }
  }

  return {
    ...base,
    attack: mergeAttack(base.attack, grants),
    statusEffects: statusEffects.length > 0 ? statusEffects : undefined,
    stacks: stacks.length > 0 ? stacks : undefined,
    auras: auras.length > 0 ? auras : undefined,
    triggers: triggers.length > 0 ? triggers : undefined
  };
}

/** Grant'in gercekten bir sey ekleyip eklemedigini soyler. */
export function isEmptyTowerGrant(grant: TowerGrant) {
  return !grant.statusEffects?.length
    && !grant.stacks?.length
    && !grant.auras?.length
    && !grant.triggers?.length
    && !grant.attack;
}
