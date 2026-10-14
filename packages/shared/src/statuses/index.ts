import { applyStatusResistance } from "../combat.js";
import type { TowerStatusEffectDefinition, TowerStatusEffectType } from "../characters/common/types.js";

export const STATUS_EFFECTS = {
  fear: { id: "fear", durationMs: 3000 }
} as const;

/**
 * Donma esigi: hiz carpani bu degere ya da altina inen dusman donar, yani
 * %60 ya da daha fazla yavaslayan.
 *
 * Kule vurus yavaslatmalari esige tek baslarina ulasamiyor: Izolasyon en
 * fazla %50 (10. seviye), duz vurus yavaslatmasi %52. Onlarda donma Buz
 * Kirigi'nin kritik yavaslatmasiyla (x1,5) geliyor: 8. seviye Izolasyon
 * %41,1 -> kritikle %61,7 (hiz 0,383) donduruyor, 7. seviye %36,7 ->
 * kritikle %55 donduramiyor; duz %52 kritikle %78.
 *
 * Esige kritiksiz ulasanlar da var: tavandaki Sogutma Kanali (%60, hiz
 * x0,4 -- ustune bindigi icin baska bir yavaslatmayla daha da asagi) ve
 * Zeynep'in en guclu yavaslatma komutu (zincirli buyuk komut, otorite ~8
 * ve ustunde tam 0,4'e kirpiliyor). Esik dahil oldugu icin ikisi de
 * tek basina donduruyor.
 *
 * Esige bakilan hiz **birlesik** hiz: farkli yavaslatmalar carpimla
 * birlesiyor (`combineSlowKinds`), yani iki orta yavaslatma da donduruyor --
 * %40 + %35 -> 0,39; uc farkli %30 -> 0,343. Bu bilerek.
 */
export const DEEP_FREEZE_SPEED_THRESHOLD = 0.4;

/** Donmanin suresi. */
export const DEEP_FREEZE_DURATION_MS = 3000;

/**
 * Ayni dusmanin yeniden donmasi icin beklemesi gereken sure.
 *
 * Olmasa donma kalici olurdu: donmus dusmanin hizi sifir, yani esigin
 * altinda; cozuldugu karede yeniden donardi ve yavaslatma kuran oyuncu
 * dusmanlari sonsuza kadar durdururdu.
 */
export const DEEP_FREEZE_COOLDOWN_MS = 5000;

/**
 * Birlesik yavaslatmanin hiz tabani: ne kadar yavaslatma ust uste binerse
 * binsin dusman en az bu hizla yurur (yavaslatma en fazla %90). Sayi Buz
 * Kirigi'nin kritik tavaniyla (`SLOW_CRIT_MAX_FRACTION`) ayni. Carpim bu
 * tabana ancak asimptotik yaklasiyor; taban yine de guvenlik icin duruyor.
 * Donma ve durdurma bu tabana tabi degil: onlar ayri bir tam kesme.
 */
export const MIN_SLOWED_SPEED_MULTIPLIER = 0.1;

/**
 * Yavaslatma birlesme modeli (sahibin karari):
 *
 * - **Farkli etkiler carpimla birlesir.** Hiz carpani = her farkli etki
 *   turu icin `(1 - yavaslatma)` carpimi. %40 + %15 -> 0,6 x 0,85 = 0,51
 *   hiz (%49 yavaslama); uc farkli %30 -> 0,343.
 * - **Ayni etki kendisiyle yiginlanmaz.** Ayni etki turunun (ayni anahtar)
 *   bircok uygulamasindan en guclusu sayilir; her uygulama kendi suresiyle
 *   tutulur, zayif bir yeniden uygulama guclu olani ne ezer ne uzatir.
 * - Sonuc `MIN_SLOWED_SPEED_MULTIPLIER` ile kirpilir.
 *
 * Bu ikisi o modelin iki adimi: `noteSlowKind` etki basina en guclu carpani
 * tutar, `combineSlowKinds` farkli etkileri carpar.
 */
export function noteSlowKind(kinds: Map<string, number>, kind: string, speedMultiplier: number) {
  if (!(speedMultiplier < 1)) return;
  const safe = Math.max(0, speedMultiplier);
  const previous = kinds.get(kind);
  if (previous === undefined || safe < previous) kinds.set(kind, safe);
}

/** Farkli etkilerin hiz carpanlarini carpar; sonuc tabanla kirpili. */
export function combineSlowKinds(speedMultipliers: Iterable<number>) {
  let product = 1;
  for (const multiplier of speedMultipliers) product *= Math.max(0, Math.min(1, multiplier));
  return product >= 1 ? 1 : Math.max(MIN_SLOWED_SPEED_MULTIPLIER, product);
}

/** `strongest` yiginlamada bir etkinin bir gucu, kendi bitisiyle. */
export type StatusEffectLevel = {
  magnitude: number;
  /** Sifir: kaldirilana kadar suren. */
  expiresAt: number;
  /** Etki anahtari (`effectKey`, yoksa durum turu): yalnizca ayni anahtarlilar yarisir. */
  kind: string;
};

export type StatusEffectRuntimeState = {
  type: TowerStatusEffectType;
  magnitude: number;
  stacks: number;
  /** Zero represents an effect that remains until explicitly removed. */
  expiresAt: number;
  sourceTowerId?: string;
  sourceOwnerId?: string;
  /**
   * Yalnizca `strongest` yiginlamada: her etkinin her gucu kendi bitisiyle.
   * Gecerli guc etki basina etkin kayitlarin en buyugu, etkiler arasi carpim
   * (`getActiveStatusMagnitude`); `magnitude` uygulama anindaki birlesik
   * deger, `expiresAt` en gec bitis.
   */
  levels?: StatusEffectLevel[];
};

export type ApplyStatusEffectOptions = {
  now: number;
  resistance?: number;
  durationMs?: number;
  magnitude?: number;
  scalingFactor?: number;
  sourceTowerId?: string;
  sourceOwnerId?: string;
};

export function applyTowerStatusEffect(
  current: StatusEffectRuntimeState | undefined,
  definition: TowerStatusEffectDefinition,
  options: ApplyStatusEffectOptions
): StatusEffectRuntimeState {
  const stacking = definition.stacking ?? "refresh";
  const currentIsActive = isStatusEffectActive(current, options.now);
  const previousStacks = currentIsActive ? current?.stacks ?? 0 : 0;
  const stacks = stacking === "add"
    ? Math.min(definition.maxStacks ?? Number.POSITIVE_INFINITY, previousStacks + 1)
    : 1;
  const scalingFactor = definition.scaling === "distance" ? Math.max(0, options.scalingFactor ?? 1) : 1;
  const baseMagnitude = Math.max(0, options.magnitude ?? definition.magnitude) * scalingFactor;
  const magnitude = stacking === "add" ? baseMagnitude * stacks : baseMagnitude;
  const baseDuration = Math.max(0, options.durationMs ?? definition.durationMs);
  const resistedDuration = applyStatusResistance(baseDuration, options.resistance);
  const nextExpiry = baseDuration === 0 ? 0 : options.now + resistedDuration;
  const expiresAt = currentIsActive && current?.expiresAt === 0
    ? 0
    : Math.max(currentIsActive ? current?.expiresAt ?? 0 : 0, nextExpiry);

  const sourceTowerId = options.sourceTowerId ?? current?.sourceTowerId;
  const sourceOwnerId = options.sourceOwnerId ?? current?.sourceOwnerId;
  if (stacking === "strongest") {
    const kind = definition.effectKey ?? definition.type;
    const levels = mergeStrongestLevels(
      currentIsActive ? current?.levels ?? (current ? [{ magnitude: current.magnitude, expiresAt: current.expiresAt, kind: current.type }] : []) : [],
      { magnitude, expiresAt: nextExpiry, kind },
      options.now
    );
    return {
      type: definition.type,
      magnitude: combineLevelMagnitudes(levels, options.now),
      stacks: 1,
      expiresAt: levels.some((level) => level.expiresAt === 0) ? 0 : Math.max(nextExpiry, ...levels.map((level) => level.expiresAt)),
      ...(sourceTowerId ? { sourceTowerId } : {}),
      ...(sourceOwnerId ? { sourceOwnerId } : {}),
      levels
    };
  }
  return {
    type: definition.type,
    magnitude,
    stacks,
    expiresAt,
    ...(sourceTowerId ? { sourceTowerId } : {}),
    ...(sourceOwnerId ? { sourceOwnerId } : {})
  };
}

const isLevelActive = (level: StatusEffectLevel, now: number) => level.expiresAt === 0 || level.expiresAt > now;

/** `a`, `b`den once bitmiyor mu (sifir: suresiz). */
const outlasts = (a: StatusEffectLevel, b: StatusEffectLevel) => a.expiresAt === 0 || (b.expiresAt !== 0 && a.expiresAt >= b.expiresAt);

/**
 * `strongest` yiginlama: etki ve guc basina bir kayit, her etkinin icinde
 * en gucluden zayifa sirali.
 *
 * Ayni etki kendisiyle yiginlanmiyor. Neden "en sonuncu" degil: yenileme
 * (refresh) son uygulamanin gucunu yaziyor ve en gec bitisi tutuyordu;
 * guclu bir yavaslatmanin ustune gelen zayif bir vurus onu eziyor, ustelik
 * guclu olanin suresini devraliyordu. Tek kayitta "en guclu, en uzun sure"
 * de yanlis olurdu: kisa ve guclu bir vurus zayif olanin uzun suresi
 * boyunca guclu kalirdi. Dogru model her gucun kendi suresi; etkinin
 * gecerli gucu etkin kayitlarinin en guclusu.
 *
 * Farkli etkilerin kayitlari birbirini golgelemiyor: onlar carpimla
 * birlesiyor (`combineLevelMagnitudes`).
 *
 * Ayni etkide ayni guc yeniden gelirse yalnizca suresi uzuyor. Ayni etkide
 * daha guclu ve en az o kadar uzun suren bir kaydin golgesinde kalan kayit
 * atiliyor; liste bu yuzden kucuk kaliyor.
 */
function mergeStrongestLevels(previous: readonly StatusEffectLevel[], next: StatusEffectLevel, now: number): StatusEffectLevel[] {
  const levels = previous.filter((level) => isLevelActive(level, now)).map((level) => ({ ...level }));
  const same = levels.find((level) => level.kind === next.kind && Math.abs(level.magnitude - next.magnitude) < 1e-9);
  if (same) {
    same.expiresAt = same.expiresAt === 0 || next.expiresAt === 0 ? 0 : Math.max(same.expiresAt, next.expiresAt);
  } else {
    levels.push({ ...next });
  }
  return levels
    .filter((level) => !levels.some((other) => other !== level && other.kind === level.kind && other.magnitude >= level.magnitude && outlasts(other, level)))
    .sort((a, b) => b.magnitude - a.magnitude);
}

/** Etki basina etkin en guclu gucler (`strongest` kayitlari). */
function strongestActiveByKind(levels: readonly StatusEffectLevel[], now: number) {
  const byKind = new Map<string, number>();
  for (const level of levels) {
    if (!isLevelActive(level, now)) continue;
    const kind = level.kind ?? "";
    const previous = byKind.get(kind);
    if (previous === undefined || level.magnitude > previous) byKind.set(kind, level.magnitude);
  }
  return byKind;
}

/** Farkli etkilerin carpimla birlesik gucu: `1 - prod(1 - guc)`, tabanla kirpili. */
function combineLevelMagnitudes(levels: readonly StatusEffectLevel[], now: number) {
  const byKind = strongestActiveByKind(levels, now);
  if (byKind.size === 0) return 0;
  return 1 - combineSlowKinds(Array.from(byKind.values(), (magnitude) => 1 - magnitude));
}

export function isStatusEffectActive(state: StatusEffectRuntimeState | undefined, now: number) {
  return Boolean(state && (state.expiresAt === 0 || state.expiresAt > now));
}

/**
 * Durumun su anki gucu. `strongest` kayitlarinda etki basina en guclu
 * etkin kayit, farkli etkiler carpimla birlesik (yavaslatma kesri olarak).
 */
export function getActiveStatusMagnitude(state: StatusEffectRuntimeState | undefined, now: number) {
  if (!state || !isStatusEffectActive(state, now)) return 0;
  if (state.levels) return combineLevelMagnitudes(state.levels, now);
  return state.magnitude ?? 0;
}

/**
 * Durumun etki basina etkin gucu: `strongest` kayitlarinda her etki kendi
 * anahtariyla, otekilerde tek kayit durum turuyle. Sunucu bunlari oteki
 * yavaslatma kanallariyla ayni etki haritasinda birlestiriyor.
 */
export function getActiveStatusKindMagnitudes(state: StatusEffectRuntimeState | undefined, now: number): Map<string, number> {
  if (!state || !isStatusEffectActive(state, now)) return new Map();
  if (state.levels) return strongestActiveByKind(state.levels, now);
  return (state.magnitude ?? 0) > 0 ? new Map([[state.type, state.magnitude]]) : new Map();
}

export function getTowerStatusOutcomes(
  states: Partial<Record<TowerStatusEffectType, StatusEffectRuntimeState>>,
  now: number
) {
  const burn = getActiveStatusMagnitude(states.burn, now);
  const bleed = getActiveStatusMagnitude(states.bleed, now);
  const chill = getActiveStatusMagnitude(states.chill, now);
  const convert = isStatusEffectActive(states.convert, now) ? states.convert : undefined;
  // Donma hiz carpanini sifira cekiyor: yavaslatmayla ayni kanaldan gecse
  // de sonucu farkli, cunku carpan degil kesme. Tabana tabi degil.
  const frozen = isStatusEffectActive(states.freeze, now);
  return {
    burnMaxHealthRatioPerSecond: burn,
    bleedMaxHealthRatioPerSecond: bleed,
    frozen,
    speedMultiplier: frozen ? 0 : combineSlowKinds([1 - chill]),
    converted: Boolean(convert),
    convertExpiresAt: convert?.expiresAt ?? 0,
    convertOwnerId: convert?.sourceOwnerId ?? ""
  };
}
