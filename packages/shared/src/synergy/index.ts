/**
 * Yerlesim sinerjileri: Atakan'in yalnizligi ve Zeynep'in dizilimi.
 *
 * Iki kural da bir kulenin **nereye** kuruldugunu oduller ve uzun sure
 * yalnizca sunucunun icindeydi. Istemci kurulumdan once "bu kare yalnizligi
 * bozar mi, dizilim kurar mi" sorusunu cevaplayamiyordu; cevaplamak icin
 * kurali kopyalamasi gerekirdi ve kopya ilk degisiklikte ayrisirdi. Kural
 * burada tek yerde: sunucu da istemci de ayni fonksiyonu cagiriyor.
 *
 * Saf mantik: oda, sahne ya da saat yok. Yapilar disaridan veriliyor; sunucu
 * kendi kule modelini, istemci anlik goruntudeki kuleleri katalog tanimiyla
 * eslestirip veriyor.
 */
import { ATAKAN_ISOLATION_MULTIPLIER } from "../balance/index.js";
import { countsAsTower, occupiesTowerSlot } from "../characters/index.js";
import type { TowerDefinition } from "../characters/common/types.js";
import { lt, ltFixed } from "../i18n/index.js";
import { worldToGrid } from "../map.js";

/** Kurallarin bir yapidan okudugu her sey; sunucunun kule modeli zaten bu bicimde. */
export type SynergyStructure = {
  id: string;
  x: number;
  y: number;
  level: number;
  characterId: string;
  definition: Pick<TowerDefinition, "id" | "engine">;
};

/** `worldToGrid`'in kabul ettigi harita ya da olcek. */
export type SynergyMap = Parameters<typeof worldToGrid>[2];

/**
 * Zeynep dizilim carpanlari: ikili ve uclu, tam seviyede.
 *
 * Seviye orani (`getZeynepFormationLevelRatio`) bunlari 0'dan tam degere
 * dogru acar; 10. seviyedeki dizilim tam carpani alir.
 *
 * Dizilim oyundaki en zor yerlesim sarti: tam ikili ya da tam ucgen ucluk
 * kurulacak, gruba dorduncu kule girerse buff bozulacak. Karsiligi +%15 ve
 * +%32 idi, yani tek bir kule seviyesinden azdi; oyunun en derin karar agaci
 * en az odullendiren mekanikti. Ucluk artik neredeyse iki katina cikariyor.
 */
export const ZEYNEP_FORMATION_PAIR_DAMAGE_MULTIPLIER = 1.2;
export const ZEYNEP_FORMATION_TRIO_DAMAGE_MULTIPLIER = 1.45;
export const ZEYNEP_FORMATION_PAIR_FIRE_INTERVAL_MULTIPLIER = 0.88;
export const ZEYNEP_FORMATION_TRIO_FIRE_INTERVAL_MULTIPLIER = 0.76;

/* ------------------------------------------------------------------------ */
/* Atakan: yalnizlik                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Yalnizlik odulunu alabilecek yapi mi.
 *
 * Atakan'in kulesi olmali ve kule sayilmali (duvar ates etmez, odul bir
 * kule buffi). Sunucu (warrior-2) bilerek disarida: kendisi yalniz durabilir
 * ama odul almaz -- baskalarini besleyen bir yapi, yalnizlikla buyumesi
 * onu kendi rolunun tersine iterdi.
 */
export function receivesAtakanIsolationBonus(structure: Pick<SynergyStructure, "characterId" | "definition">) {
  return countsAsTower(structure.definition)
    && structure.characterId === "warrior"
    && structure.definition.id !== "warrior-2";
}

/**
 * Kulenin yalnizligini bozan komsular.
 *
 * Bir kare cevresinde (kosegenler dahil) duran, kule sayilan her yapi --
 * sahibi kim olursa olsun; reaktor ve fabrika da. Duvar sayilmaz: duvar bir
 * kule degil, bir cizgi. Sayilsaydi Izolasyon Kulesi'nin onune cekilen bir
 * duvar hatti kulenin kendi yetenegini kapatirdi.
 */
export function findIsolationBlockers<T extends Pick<SynergyStructure, "id" | "x" | "y" | "definition">>(
  structure: Pick<SynergyStructure, "id" | "x" | "y">,
  structures: Iterable<T>,
  map: SynergyMap
): T[] {
  const cell = worldToGrid(structure.x, structure.y, map);
  const blockers: T[] = [];
  for (const other of structures) {
    if (other.id === structure.id || !countsAsTower(other.definition)) {
      continue;
    }
    const otherCell = worldToGrid(other.x, other.y, map);
    if (Math.abs(otherCell.col - cell.col) <= 1 && Math.abs(otherCell.row - cell.row) <= 1) {
      blockers.push(other);
    }
  }
  return blockers;
}

/**
 * Kulenin bir kare cevresinde baska kule yok mu.
 *
 * `findIsolationBlockers` ile ayni kural, ilk komsuda donuyor: sunucu bunu
 * her atis araliginda soruyor, liste kurmaya gerek yok.
 */
export function isStructureIsolated(
  structure: Pick<SynergyStructure, "id" | "x" | "y">,
  structures: Iterable<Pick<SynergyStructure, "id" | "x" | "y" | "definition">>,
  map: SynergyMap
) {
  const cell = worldToGrid(structure.x, structure.y, map);
  for (const other of structures) {
    if (other.id === structure.id || !countsAsTower(other.definition)) {
      continue;
    }
    const otherCell = worldToGrid(other.x, other.y, map);
    if (Math.abs(otherCell.col - cell.col) <= 1 && Math.abs(otherCell.row - cell.row) <= 1) {
      return false;
    }
  }
  return true;
}

/** Yapinin su anki yalnizlik carpani: odul alabiliyor ve yalnizsa carpan, yoksa 1. */
export function getAtakanIsolationMultiplier(
  structure: SynergyStructure,
  structures: Iterable<Pick<SynergyStructure, "id" | "x" | "y" | "definition">>,
  map: SynergyMap
) {
  return receivesAtakanIsolationBonus(structure) && isStructureIsolated(structure, structures, map)
    ? ATAKAN_ISOLATION_MULTIPLIER
    : 1;
}

/**
 * Yalnizligin DPS'e toplam etkisi.
 *
 * Carpan hasari carpiyor ve atis araligini boluyor; ikisi birlikte karesi.
 * Onizleme "x1,5" yazsaydi oyuncu odulun yarisini gorurdu.
 */
export function getAtakanIsolationDpsMultiplier() {
  return ATAKAN_ISOLATION_MULTIPLIER * ATAKAN_ISOLATION_MULTIPLIER;
}

/* ------------------------------------------------------------------------ */
/* Zeynep: dizilim                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Iki yapi dizilimde komsu mu.
 *
 * Merkezler arasi fark iki eksende de bir kare (+2 px pay) icinde: yan yana
 * ve kosegen ikisi de sayiliyor. `dx + dy > 2` ayni yerdeki iki kaydi
 * (ornegin kendisiyle) disarida tutuyor.
 */
export function areZeynepFormationNeighbors(a: Pick<SynergyStructure, "x" | "y">, b: Pick<SynergyStructure, "x" | "y">, gridSize: number) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx <= gridSize + 2 && dy <= gridSize + 2 && dx + dy > 2;
}

/** Grubun her ikilisi komsu mu: uclu yalnizca ucgen olarak gecerli, cizgi degil. */
export function isCompleteZeynepFormation(group: readonly Pick<SynergyStructure, "x" | "y">[], gridSize: number) {
  for (let first = 0; first < group.length; first += 1) {
    for (let second = first + 1; second < group.length; second += 1) {
      if (!areZeynepFormationNeighbors(group[first], group[second], gridSize)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Yapi dizilime katilir mi.
 *
 * Duvar kule degil: kontenjandan yer kapmaz, hedef secmez, hasar vermez.
 * Dizilime katilmasi yalnizca anlamsiz degil, zararli -- ucluye komsu bir
 * duvar grubu dorde cikarip bonusu tumden dusuruyordu. Abarti (zeynep-8)
 * de kenara oturdugu icin ayni kuraldan dusuyor; zeynep-7 adiyla disarida.
 */
export function canJoinZeynepFormation(structure: Pick<SynergyStructure, "definition">) {
  return occupiesTowerSlot(structure.definition) && structure.definition.id !== "zeynep-7";
}

/**
 * Bagli grup gecerli bir dizilim mi.
 *
 * Herkes Zeynep yapisi olmali; ikili her zaman, uclu yalnizca tam ucgense.
 * Dorduncu bagli kule grubu gecersiz kiliyor: dizilim kalabalik degil, siki
 * bir kume oduller.
 */
export function isValidZeynepFormationGroup(group: readonly Pick<SynergyStructure, "x" | "y" | "characterId" | "definition">[], gridSize: number) {
  if (!group.every((member) => member.characterId === "zeynep" && canJoinZeynepFormation(member))) {
    return false;
  }
  return group.length === 2 || (group.length === 3 && isCompleteZeynepFormation(group, gridSize));
}

export type ZeynepFormationGroup<T> = {
  /** Bagli grubun uyeleri, arama sirasiyla. */
  members: T[];
  valid: boolean;
  /** Gecerliyse uye sayisi (2 ya da 3), degilse 0. */
  size: number;
  /** Gecerliyse en dusuk uye seviyesi, degilse 0. */
  level: number;
};

/**
 * Sahadaki butun dizilim gruplari.
 *
 * Yalnizca dizilime katilabilen Zeynep yapilari aranir -- sahibi kim olursa
 * olsun. Komsuluk zinciriyle bagli her kume bir grup; gecerliyse boyu ve en
 * dusuk seviyesi bonusu belirliyor. Arama sirasi sunucunun eski sirasiyla
 * ayni (giris sirasi, genislik oncelikli): panel metni uye adlarini bu
 * sirayla yaziyor.
 */
export function resolveZeynepFormations<T extends SynergyStructure>(structures: Iterable<T>, gridSize: number): ZeynepFormationGroup<T>[] {
  const candidates: T[] = [];
  for (const structure of structures) {
    if (structure.characterId === "zeynep" && canJoinZeynepFormation(structure)) {
      candidates.push(structure);
    }
  }

  const visited = new Set<string>();
  const groups: ZeynepFormationGroup<T>[] = [];
  for (const seed of candidates) {
    if (visited.has(seed.id)) {
      continue;
    }
    const members: T[] = [];
    const queue: T[] = [seed];
    visited.add(seed.id);
    while (queue.length > 0) {
      const current = queue.shift() as T;
      members.push(current);
      for (const candidate of candidates) {
        if (visited.has(candidate.id) || !areZeynepFormationNeighbors(current, candidate, gridSize)) {
          continue;
        }
        visited.add(candidate.id);
        queue.push(candidate);
      }
    }
    const valid = isValidZeynepFormationGroup(members, gridSize);
    groups.push({
      members,
      valid,
      size: valid ? members.length : 0,
      level: valid ? Math.min(...members.map((member) => member.level)) : 0
    });
  }
  return groups;
}

/**
 * Sentez kulesinin bagli grubu.
 *
 * Dizilimden farkli olarak burada karakter suzulmuyor: dizilime katilabilen
 * her yapi (baska karakterin kulesi de) zincire giriyor, sonra
 * `isValidZeynepFormationGroup` "herkes Zeynep mi" diye eliyor. Yani bir
 * takim arkadasinin bitisik kulesi sentezi kapatiyor ama dizilim bonusunu
 * kapatmiyor -- iki kural sunucuda boyleydi, burada da oyle.
 */
export function collectZeynepSynthesisGroup<T extends SynergyStructure>(seed: T, structures: Iterable<T>, gridSize: number): T[] {
  const all = Array.from(structures);
  const group = new Map<string, T>([[seed.id, seed]]);
  const queue: T[] = [seed];
  while (queue.length > 0) {
    const current = queue.shift() as T;
    for (const candidate of all) {
      if (group.has(candidate.id) || !canJoinZeynepFormation(candidate)) {
        continue;
      }
      if (!areZeynepFormationNeighbors(current, candidate, gridSize)) {
        continue;
      }
      group.set(candidate.id, candidate);
      queue.push(candidate);
    }
  }
  return Array.from(group.values());
}

/** Kulede tasinan dizilim durumu (sunucu modeli ve anlik goruntu ikisi de). */
export type ZeynepFormationState = { zeynepFormationSize?: number; zeynepFormationLevel?: number };

export function getZeynepFormationLevelRatio(state: ZeynepFormationState) {
  const level = state.zeynepFormationLevel ?? 0;
  if (level <= 0) {
    return 0;
  }
  return Math.min(Math.max(level, 1), 10) / 10;
}

export function getZeynepFormationDamageMultiplier(state: ZeynepFormationState) {
  const levelRatio = getZeynepFormationLevelRatio(state);
  if (state.zeynepFormationSize === 3) {
    return 1 + (ZEYNEP_FORMATION_TRIO_DAMAGE_MULTIPLIER - 1) * levelRatio;
  }
  if (state.zeynepFormationSize === 2) {
    return 1 + (ZEYNEP_FORMATION_PAIR_DAMAGE_MULTIPLIER - 1) * levelRatio;
  }
  return 1;
}

export function getZeynepFormationFireIntervalMultiplier(state: ZeynepFormationState) {
  const levelRatio = getZeynepFormationLevelRatio(state);
  if (state.zeynepFormationSize === 3) {
    return 1 - (1 - ZEYNEP_FORMATION_TRIO_FIRE_INTERVAL_MULTIPLIER) * levelRatio;
  }
  if (state.zeynepFormationSize === 2) {
    return 1 - (1 - ZEYNEP_FORMATION_PAIR_FIRE_INTERVAL_MULTIPLIER) * levelRatio;
  }
  return 1;
}

/* ------------------------------------------------------------------------ */
/* Durum, onizleme ve degisim                                               */
/* ------------------------------------------------------------------------ */

/**
 * Sahanin sinerji fotografi.
 *
 * `isolated`: odul alabilen ve su an yalniz duran yapilar. `formations`:
 * gecerli bir dizilimdeki her yapinin grubu; ayni grubun uyeleri ayni nesneyi
 * paylasiyor.
 */
export type SynergyState<T extends SynergyStructure = SynergyStructure> = {
  isolated: Set<string>;
  formations: Map<string, ZeynepFormationGroup<T>>;
};

export function computeSynergyState<T extends SynergyStructure>(structures: readonly T[], map: SynergyMap, gridSize: number): SynergyState<T> {
  const isolated = new Set<string>();
  for (const structure of structures) {
    if (receivesAtakanIsolationBonus(structure) && isStructureIsolated(structure, structures, map)) {
      isolated.add(structure.id);
    }
  }
  const formations = new Map<string, ZeynepFormationGroup<T>>();
  for (const group of resolveZeynepFormations(structures, gridSize)) {
    if (!group.valid) continue;
    for (const member of group.members) {
      formations.set(member.id, group);
    }
  }
  return { isolated, formations };
}

export type SynergyPlacementPreview<T extends SynergyStructure> = {
  /** Kurulacak yapi yalnizlik odulu alabiliyor mu; alamiyorsa yalnizlik satiri yok. */
  isolationEligible: boolean;
  /** Kurulursa yalniz kalacak mi. */
  isolated: boolean;
  /** Yalniz kalamayacaksa sebebi olan komsular. */
  isolationBlockers: T[];
  /** Bu kurulumla yalnizligini kaybedecek mevcut kuleler (herkesin). */
  breaksIsolation: T[];
  /** Kurulacak yapinin girecegi gecerli dizilim; yoksa undefined. */
  formation?: ZeynepFormationGroup<T>;
  /** Dizilimin hasar carpani (seviye oraniyla); dizilim yoksa 1. */
  formationDamageMultiplier: number;
  /** Bu kurulumla dizilimi dusecek mevcut kuleler. */
  breaksFormation: T[];
};

/**
 * Bir yapi buraya kurulsaydi ne olurdu.
 *
 * Sunucunun kurulumdan sonra hesaplayacagi seyin aynisi, kurulumdan once:
 * aday listeye eklenip ayni kurallar iki kez calisiyor ve fark okunuyor.
 * `before` verilirse yeniden hesaplanmiyor -- surukleme sirasinda saha
 * degismiyor, yalnizca aday kare degisiyor.
 */
export function previewSynergyPlacement<T extends SynergyStructure>(
  candidate: T,
  structures: readonly T[],
  map: SynergyMap,
  gridSize: number,
  before: SynergyState<T> = computeSynergyState(structures, map, gridSize)
): SynergyPlacementPreview<T> {
  const after = [...structures, candidate];
  const isolationEligible = receivesAtakanIsolationBonus(candidate);
  const isolationBlockers = isolationEligible ? findIsolationBlockers(candidate, structures, map) : [];

  const breaksIsolation: T[] = [];
  if (countsAsTower(candidate.definition)) {
    for (const structure of structures) {
      if (!before.isolated.has(structure.id)) continue;
      // Aday yalnizca kendi cevresindeki kareyi etkileyebilir: bir komsuluk
      // yeterli, butun sahayi yeniden taramaya gerek yok.
      if (findIsolationBlockers(structure, [candidate], map).length > 0) {
        breaksIsolation.push(structure);
      }
    }
  }

  let formation: ZeynepFormationGroup<T> | undefined;
  const breaksFormation: T[] = [];
  if (candidate.characterId === "zeynep" && canJoinZeynepFormation(candidate)) {
    const afterGroups = resolveZeynepFormations(after, gridSize);
    const afterById = new Map<string, ZeynepFormationGroup<T>>();
    for (const group of afterGroups) {
      for (const member of group.members) afterById.set(member.id, group);
    }
    const own = afterById.get(candidate.id);
    formation = own?.valid ? own : undefined;
    for (const [id, group] of before.formations) {
      const next = afterById.get(id);
      if (!next?.valid) {
        const member = group.members.find((entry) => entry.id === id);
        if (member) breaksFormation.push(member);
      }
    }
  }

  return {
    isolationEligible,
    isolated: isolationEligible && isolationBlockers.length === 0,
    isolationBlockers,
    breaksIsolation,
    formation,
    formationDamageMultiplier: formation
      ? getZeynepFormationDamageMultiplier({ zeynepFormationSize: formation.size, zeynepFormationLevel: formation.level })
      : 1,
    breaksFormation
  };
}

export type SynergyChange<T extends SynergyStructure> =
  | { kind: "isolationGained" | "isolationLost"; structure: T }
  | { kind: "formationFormed"; members: T[]; size: number; level: number }
  | { kind: "formationBroken"; members: T[] };

/**
 * Iki fotograf arasindaki sinerji olaylari.
 *
 * Yalnizlik kule basina: kazanilan ya da kaybedilen. Yeni kurulan ve yalniz
 * duran kule de "kazandi" sayiliyor; satilan kule hicbir sey kaybetmiyor
 * (artik yok). Dizilim grup basina: yeni ya da buyuyen gecerli grup
 * "kuruldu", dizilimi dusen hayatta kalan uyeler eski gruplarina gore
 * "bozuldu". Satisla uclunun ikiliye inmesi ya da yalnizca seviyenin degismesi
 * olay degil: dizilim hala ayakta.
 */
export function diffSynergyStates<T extends SynergyStructure>(
  before: SynergyState<T>,
  after: SynergyState<T>,
  present: ReadonlyMap<string, T>
): SynergyChange<T>[] {
  const changes: SynergyChange<T>[] = [];
  for (const id of after.isolated) {
    const structure = present.get(id);
    if (structure && !before.isolated.has(id)) {
      changes.push({ kind: "isolationGained", structure });
    }
  }
  for (const id of before.isolated) {
    const structure = present.get(id);
    if (structure && !after.isolated.has(id)) {
      changes.push({ kind: "isolationLost", structure });
    }
  }

  const seenAfter = new Set<ZeynepFormationGroup<T>>();
  for (const group of after.formations.values()) {
    if (seenAfter.has(group)) continue;
    seenAfter.add(group);
    const grew = group.members.some((member) => (before.formations.get(member.id)?.size ?? 0) < group.size);
    if (grew) {
      changes.push({ kind: "formationFormed", members: group.members, size: group.size, level: group.level });
    }
  }

  const brokenByGroup = new Map<ZeynepFormationGroup<T>, T[]>();
  for (const [id, group] of before.formations) {
    const structure = present.get(id);
    if (!structure || after.formations.has(id)) continue;
    const list = brokenByGroup.get(group) ?? [];
    list.push(structure);
    brokenByGroup.set(group, list);
  }
  for (const members of brokenByGroup.values()) {
    changes.push({ kind: "formationBroken", members });
  }
  return changes;
}

/* ------------------------------------------------------------------------ */
/* Metin                                                                    */
/* ------------------------------------------------------------------------ */

/** "×2,25": iki hane, ayirac dile gore; onizleme ve damga ayni bicimde. */
export function formatSynergyMultiplier(value: number) {
  return `×${ltFixed(value, 2)}`;
}

export type SynergyPreviewText = {
  /** Kurulacak kulenin kendi kazanci ya da kaybi; yoksa satir yok. */
  headline?: { text: string; tone: "gain" | "blocked" };
  /** Bu kurulumun bozacagi seyler; yoksa satir yok. */
  warning?: string;
};

/** Uyari satirinda adi yazilan en fazla kule; fazlasi "+N". 375 px'te tek satir kalsin. */
const PREVIEW_MAX_NAMES = 2;

/**
 * Onizlemenin iki kisa satiri.
 *
 * Kazanc DPS olarak yaziliyor (yalnizlik hasari ve atis hizini birlikte
 * carpiyor); dizilim hasar carpaniyla ve seviyesiyle, cunku seviye orani
 * carpani dogrudan belirliyor ve yeni kule seviye 1 ile giriyor. Uyari satiri
 * kimin yalnizligini bozacagini adla soyluyor; ad tekrarlarsa bir kez.
 */
export function describeSynergyPreview<T extends SynergyStructure>(
  preview: SynergyPlacementPreview<T>,
  nameOf: (structure: T) => string
): SynergyPreviewText {
  const text: SynergyPreviewText = {};
  if (preview.formation) {
    text.headline = {
      text: `${lt("DİZİLİM", "FORMATION")} ${formatSynergyMultiplier(preview.formationDamageMultiplier)} · ${lt("Sv", "Lv")} ${preview.formation.level}`,
      tone: "gain"
    };
  } else if (preview.isolationEligible) {
    text.headline = preview.isolated
      ? { text: `${lt("Yalnız", "Isolated")} ${formatSynergyMultiplier(getAtakanIsolationDpsMultiplier())} DPS`, tone: "gain" }
      : { text: lt("Yalnızlık yok", "No isolation"), tone: "blocked" };
  }

  const names: string[] = [];
  for (const structure of preview.breaksIsolation) {
    const name = nameOf(structure);
    if (!names.includes(name)) names.push(name);
  }
  const parts = names.slice(0, PREVIEW_MAX_NAMES);
  if (names.length > PREVIEW_MAX_NAMES) parts.push(`+${names.length - PREVIEW_MAX_NAMES}`);
  if (preview.breaksFormation.length > 0) parts.push(lt("Dizilim", "Formation"));
  if (parts.length > 0) text.warning = `${lt("Bozar", "Breaks")}: ${parts.join(", ")}`;
  return text;
}

/** Kurulumdan sonraki tek seferlik dunya damgasi. */
export function getSynergyStampText(kind: SynergyChange<SynergyStructure>["kind"]) {
  switch (kind) {
    case "isolationGained":
      return `${lt("Yalnız", "Isolated")} ${formatSynergyMultiplier(getAtakanIsolationDpsMultiplier())}`;
    case "isolationLost":
      return lt("Yalnızlık bozuldu", "Isolation broken");
    case "formationFormed":
      return lt("Dizilim kuruldu", "Formation set");
    case "formationBroken":
      return lt("Dizilim bozuldu", "Formation broken");
  }
}

/**
 * Takim arkadasinin kurulumu senin sinerjini bozdugunda kisa bildirim.
 * "Ali yalnizligini bozdu" Turkcede Ali'nin kendi yalnizligi gibi okunuyor;
 * "senin" kimin seyinin bozuldugunu soyluyor.
 */
export function getSynergyCulpritNotice(kind: "isolationLost" | "formationBroken", culprit: string) {
  return lt(
    `${culprit} senin ${kind === "isolationLost" ? "yalnızlığını" : "dizilimini"} bozdu`,
    `${culprit} broke your ${kind === "isolationLost" ? "isolation" : "formation"}`
  );
}

/* ------------------------------------------------------------------------ */
/* Karar payi: yerlesim kararinin dalgaya kattigi hasar (tahmin)            */
/* ------------------------------------------------------------------------ */

/**
 * Bir carpan ciftinin DPS'e toplam etkisi: hasar carpani bolu atis araligi
 * carpani. Aralik 0,76 ise kule 1/0,76 kat sik atiyor; ikisi birlikte carpiliyor.
 * Gecersiz ya da sifir aralik 1 sayiliyor: tahmin hicbir zaman sonsuza gitmesin.
 */
export function getSynergyDpsMultiplier(damageMultiplier: number, fireIntervalMultiplier = 1) {
  const damage = Number.isFinite(damageMultiplier) && damageMultiplier > 0 ? damageMultiplier : 1;
  const interval = Number.isFinite(fireIntervalMultiplier) && fireIntervalMultiplier > 0 ? fireIntervalMultiplier : 1;
  return damage / interval;
}

/**
 * Bir vurusun bonusa dusen payi: `dealt × (1 − 1/dpsCarpani)`.
 *
 * Bu bir **tahmin**, olcum degil. Oda bonussuz bir ikinci dunya calistirmiyor;
 * bunun yerine "bonus olmasaydi kule ayni surede bu hasarin 1/carpan kadarini
 * verirdi" diye varsayiyor. Varsayimin kacirdiklari bilerek kabul edildi:
 * zirh ve kalkan dogrusal degil, son vurustaki asiri oldurme zaten `dealt`
 * icinde degil (hasar sayilariyla ayni "gercekten inen" deger), yalnizligin
 * menzil ekseni hic sayilmiyor (menzil hedef bulmayi degistiriyor, vurusu
 * degil). Karnede "~" bu yuzden var.
 */
export function estimateSynergyShare(dealt: number, dpsMultiplier: number) {
  if (!(dealt > 0) || !Number.isFinite(dealt) || !(dpsMultiplier > 1) || !Number.isFinite(dpsMultiplier)) return 0;
  return dealt * (1 - 1 / dpsMultiplier);
}

/**
 * Yalnizligin bir vurustaki payi. `isolated` vurus anindaki durum: bonus o an
 * kapaliysa pay yok. Hasar ve atis hizi eksenleri birlikte sayiliyor: atis
 * hizi carpanini atlayan bir ritim artik yok (Debug Lazer'in asiri yukleme
 * kirisi de normal araligiyla vuruyor).
 */
export function getAtakanIsolationShare(dealt: number, isolated: boolean) {
  if (!isolated) return 0;
  return estimateSynergyShare(dealt, getAtakanIsolationDpsMultiplier());
}

/** Dizilimin bir vurustaki payi; seviye orani dahil, sunucunun kullandigi carpanlarla ayni. */
export function getZeynepFormationShare(dealt: number, state: ZeynepFormationState) {
  const multiplier = getSynergyDpsMultiplier(
    getZeynepFormationDamageMultiplier(state),
    getZeynepFormationFireIntervalMultiplier(state)
  );
  return estimateSynergyShare(dealt, multiplier);
}

/** Karne ve raporun okudugu iki toplam; sifir olan alan telde yok. */
export type SynergyShareTotals = { isolationShare?: number; formationShare?: number };

export type SynergyShareKind = "isolation" | "formation";

/**
 * Dalga karnesinde pay satirinin tabani.
 *
 * Mutlak taban: ilk dalgalarda "~40 hasar" bir karar degil, gurultu. Oransal
 * taban: payin oyuncunun o dalgadaki kule hasarinin en az bu kadari olmasi;
 * aksi halde pay kucuk bir yan kuleden geliyor ve karar sonucu degistirmedi.
 * Yalnizlik en fazla %55,6, uclu dizilim %47,6, ikili %26,7 payla sinirli;
 * %15 tam bir ikiliyi gecirir, rastgele bir seviye 1 ikiliyi gecirmez.
 */
export const SYNERGY_SHARE_WAVE_FLOOR = 250;
export const SYNERGY_SHARE_WAVE_RATIO_FLOOR = 0.15;
/** Kosu raporunun "en iyi an"inda pay satirinin tabani (kosu toplami). */
export const SYNERGY_SHARE_RUN_FLOOR = 3000;

/** Pay metninin sayisi: tahmin oldugu icin onluga yuvarli, "~" onde. */
export function roundSynergyShare(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value / 10) * 10 : 0;
}

export function getSynergyShareLabel(kind: SynergyShareKind) {
  return kind === "isolation" ? lt("Yalnızlık payı", "Isolation share") : lt("Dizilim payı", "Formation share");
}

/** Iki paydan buyugu; ikisi de yoksa undefined. Esitlikte yalnizlik (once yazilan). */
export function pickLargerSynergyShare(totals: SynergyShareTotals | undefined): { kind: SynergyShareKind; amount: number } | undefined {
  const isolation = Number.isFinite(totals?.isolationShare) ? Math.max(0, totals!.isolationShare!) : 0;
  const formation = Number.isFinite(totals?.formationShare) ? Math.max(0, totals!.formationShare!) : 0;
  if (isolation <= 0 && formation <= 0) return undefined;
  return formation > isolation ? { kind: "formation", amount: formation } : { kind: "isolation", amount: isolation };
}
