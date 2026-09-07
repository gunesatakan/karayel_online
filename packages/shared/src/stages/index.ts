import type { DamageType, EnemyRace } from "../combat.js";
import { enemyRaceDefinitions } from "../combat.js";
import { FINAL_WAVE } from "../balance/index.js";

/**
 * Oyun bes asamaya bolundu ve her asama tek bir dusman irkiyla geciyor.
 *
 * Onceki duzende irk dalga dalga donuyordu: bir turda meka, sonrakinde uzay
 * bocegi, sonra dorduncu boyut. Iyi niyetliydi ama okunmuyordu -- direnc
 * tablosu her dalgada degistigi icin oyuncunun kurdugu dizilim bir dalga dogru,
 * bir dalga yanlis oluyordu ve arada dizilimi degistirmenin bir yolu yoktu. Yani
 * irk sistemi kuruluydu ama karsisinda oynanamiyordu.
 *
 * Asama basina tek irk bunu bir karara ceviriyor: girmeden once neyle
 * karsilasacagini biliyorsun, kuleyi ona gore seciyorsun ve yirmi tur boyunca o
 * secimin sonucunu yasiyorsun.
 */
export type StageDefinition = {
  id: number;
  name: string;
  race: EnemyRace;
  /** Irkin Turkce adi; arayuzde asama kartinda gorunuyor. */
  raceName: string;
  description: string;
};

export const STAGE_COUNT = 5;

/** Bir asamanin kac tur surdugu. Zafer kosulu asama basina ayni. */
export const WAVES_PER_STAGE = FINAL_WAVE;

/**
 * Asama sirasi zorluga gore degil, **baslangic kulelerine** gore dizildi.
 *
 * Yedi karakterin baslangic kulelerinin cogu fiziksel hasar veriyor (Hiza Emri,
 * Takipci, Testere, Jackpot). Golem fiziksele zayif, dorduncu boyut ise direncli
 * -- bu yuzden golem acilis, dorduncu boyut kapanis. Ilk asamada oyuncu elindeki
 * kuleyle kazanabilmeli, sonuncusunda ise varsayilan hasar tipi cezalandirilmali
 * ki asamalar arasinda gercekten bir sey ogrenilsin.
 *
 * Alti irk var, bes asama: `holyGuardian` disarida kaldi. Bir asama daha
 * eklenecekse yeri hazir.
 */
export const stageCatalog: StageDefinition[] = [
  {
    id: 1,
    name: "Taş Kuşatma",
    race: "golem",
    raceName: "Golem",
    description: "Ağır ve yavaş. Fiziksel hasara açık, hücresele kapalı."
  },
  {
    id: 2,
    name: "Çelik Hat",
    race: "meka",
    raceName: "Meka",
    description: "Makine hattı. Elektriğe açık, psişiğe kapalı."
  },
  {
    id: 3,
    name: "Sürü",
    race: "spaceBug",
    raceName: "Uzay Böceği",
    description: "Kalabalık gelir. Hücresele açık, ateşe kapalı."
  },
  {
    id: 4,
    name: "Düşüş",
    race: "fallen",
    raceName: "Düşmüş",
    description: "Bozulmuş muhafızlar. Işığa açık, elektriğe kapalı."
  },
  {
    id: 5,
    name: "Katlanma",
    race: "fourthDimensional",
    raceName: "Dördüncü Boyut",
    description: "Fiziksel hasarı yutar. Yalnızca psişik gerçekten işler."
  }
];

const stageById = new Map(stageCatalog.map((stage) => [stage.id, stage]));

/** Gecersiz bir kimlik ilk asamaya duser: eksik veriyle oda kurulmasi engellenmemeli. */
export function getStage(id: number | undefined): StageDefinition {
  return stageById.get(Math.round(id ?? 1)) ?? stageCatalog[0];
}

export function getStageRace(id: number | undefined): EnemyRace {
  return getStage(id).race;
}

/**
 * Asamanin zayif ve direncli oldugu hasar tipleri.
 *
 * Arayuz bunu tablodan turetiyor, elle yazilmiyor: asama kartindaki metinle
 * sahadaki direnc birbirinden ayrilirsa oyuncuya yalan soylenmis olur.
 */
export function getStageDamageProfile(id: number | undefined) {
  const resistances = enemyRaceDefinitions[getStage(id).race].damageResistances as Partial<Record<DamageType, number>>;
  const weakTo: DamageType[] = [];
  const resistantTo: DamageType[] = [];
  for (const [damageType, value] of Object.entries(resistances) as Array<[DamageType, number]>) {
    if (value < 0) weakTo.push(damageType);
    else if (value > 0) resistantTo.push(damageType);
  }
  return { weakTo, resistantTo };
}

/**
 * Bir asamanin acik olup olmadigi.
 *
 * Ilk asama her zaman acik. Digerleri bir oncekinin **tamamlanmis** olmasini
 * istiyor -- en yuksek tamamlanani degil, cunku ilerleme listesi bozulmus ya da
 * elle kurcalanmis gelebilir ve o durumda oyuncuyu atladigi bir asamaya
 * dusurmek istemiyoruz.
 */
export function isStageUnlocked(id: number, clearedStageIds: readonly number[]): boolean {
  if (id <= 1) return true;
  if (id > STAGE_COUNT) return false;
  return clearedStageIds.includes(id - 1);
}

/** Acik olan en yuksek asama; menu acilista burayi seciyor. */
export function getHighestUnlockedStage(clearedStageIds: readonly number[]): number {
  let highest = 1;
  for (let id = 2; id <= STAGE_COUNT; id += 1) {
    if (isStageUnlocked(id, clearedStageIds)) highest = id;
  }
  return highest;
}
