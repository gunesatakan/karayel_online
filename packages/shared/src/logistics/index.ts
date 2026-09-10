export const RESOURCE_EXTRACTION_DURATION_MS = 8000;
export const LOGISTICS_WORKER_CAPACITY = 12;
export const ENERGY_LOGISTICS_WORKER_CAPACITY = 12;
export const AMMO_LOGISTICS_WORKER_CAPACITY = 4;
export const AMMO_COLLECTOR_WORKER_CAPACITY = 2;
export const RESOURCE_PROVIDER_INITIAL_STOCK = 0;

/**
 * Iscinin cani.
 *
 * Isci dusmanla temas ettigi her saniye onun saldiri gucu kadar hasar alir;
 * yani bu sayi "kac saniye dayanir" demek. 60, en yaygin dusman olan grunt'in
 * (12) karsisinda bes saniye: kacirilan bir sizmayi fark edip yol degistirmeye
 * yetecek kadar, yol uzerinde durmayi bedava kilmayacak kadar.
 */
export const WORKER_MAX_HP = 60;

/**
 * Olen iscinin geri gelme suresi.
 *
 * Olum kalici degil ve bu bilincli: isciler oyuncunun tikladigi birimler
 * degil, kendi kendine yuruyen bir hat. Kalici kayip, oyuncunun
 * engelleyemedigi bir sebeple ekonomisinin durmasi olurdu -- olum bir donem
 * tam bu yuzden kaldirilmisti. Ceza sure: yirmi saniye eksik lojistik.
 *
 * Kurulum asamasinda sayaclar temizlenir, yani her dalga tam kadro baslar.
 */
export const WORKER_RESPAWN_MS = 20_000;
export const AMMO_FACTORY_INITIAL_ENERGY = 20;
/**
 * Isci alimi.
 *
 * Her oyuncu dort temel isciyle basliyor: her rolden bir tane. Rol secimi asil
 * karari burada dogurur -- ikinci bir enerji tasiyicisi mi, yoksa kristal
 * toplayiciyi ikiye mi katlamak? Bedel her alimda buyur, cunku ayni rolu ust
 * uste almak lojistigi tek eksende katlar.
 */
export const HIRABLE_WORKER_ROLES = ["crystalCollector", "energyTransport", "ammoCollector", "ammoTransport"] as const;

export type HirableWorkerRole = (typeof HIRABLE_WORKER_ROLES)[number];

export const WORKER_ROLE_LABELS: Record<HirableWorkerRole, string> = {
  crystalCollector: "Kristal Toplayıcı",
  energyTransport: "Enerji Taşıyıcı",
  ammoCollector: "Mühimmat Toplayıcı",
  ammoTransport: "Mühimmat Taşıyıcı"
};

export const WORKER_ROLE_DESCRIPTIONS: Record<HirableWorkerRole, string> = {
  crystalCollector: "Kristal düğümlerinden ham enerji toplar.",
  energyTransport: "Toplanan enerjiyi kulelere dağıtır.",
  ammoCollector: "Mühimmat düğümlerinden ham madde toplar.",
  ammoTransport: "Üretilen mühimmatı kulelere taşır."
};

export const WORKER_HIRE_BASE_COST = 100;

/**
 * Her alimin bir sonrakine ekledigi zam.
 *
 * Artis bir donem %5'ti ve pratikte hicbir sey ifade etmiyordu: sekizinci isci
 * 141 altina geliyordu, yani kadroyu buyutmenin bir bedeli yoktu ve dogru
 * oynanis her zaman "daha fazla isci" oluyordu.
 *
 * %10 cok yumusak bir egri: altinci isci 161, onuncu 236. Zam kadroyu
 * sinirlamiyor, yalnizca sonsuz bir kadroyu bedelsiz kilmiyor.
 */
export const WORKER_HIRE_COST_GROWTH = 1.1;

/**
 * Gelismis iscinin isi normalin uc kati: toplama hizi, tasima kapasitesi,
 * yurume hizi.
 *
 * Uc iscinin isini bir bedenle yapiyor. Kazanc yer kaplamada -- bir
 * gelismis isci, uc normal isciden daha az yol tikanikligi ve daha az
 * takip edilecek beden demek.
 */
export const ADVANCED_WORKER_MULTIPLIER = 3;

/**
 * Gelismis iscinin bedeli normalin dort kati: ilk gelismis isci 400 altin.
 *
 * Isten (uc kat) ayri bir sayi, cunku takas artik duz degil: gelismis isci
 * uc iscinin isini yapiyor ama dordunun parasini istiyor. Aradaki fark
 * yerin bedeli -- bir beden, bir yol, takip edilecek tek hedef. Iki sayiyi
 * tek sabitte tutmak, birini ayarlarken otekini sessizce bozmak demekti.
 */
export const ADVANCED_WORKER_COST_MULTIPLIER = 4;

/** Alinmis bir isci: rolu ve kademesi. */
export type HiredWorker = { role: HirableWorkerRole; advanced?: boolean };

/**
 * Siradaki iscinin bedeli.
 *
 * Sayac **ortak**: normal ya da gelismis, alinan her isci bir sonrakinin
 * fiyatini yukseltiyor. Iki ayri sayac tutmak, gelismis isciyi normal
 * alimlarla ucuza getirmenin yolunu acardi.
 */
export function getWorkerHireCost(hiredCount: number, advanced = false) {
  // Yuvarlama once yapiliyor, sonra carpiliyor. Tersi olsaydi cekmecede yan
  // yana duran iki sayi birbirini tutmazdi: 146 ve 585 gibi. Oyuncunun
  // gordugu bedel her zaman gordugu digerinin tam kati olmali.
  const normal = Math.round(WORKER_HIRE_BASE_COST * WORKER_HIRE_COST_GROWTH ** Math.max(0, hiredCount));
  return advanced ? normal * ADVANCED_WORKER_COST_MULTIPLIER : normal;
}

/**
 * Kartlar ve esyalar isledikten sonra siradaki iscinin bedeli.
 *
 * Iki taraf da bu fonksiyonu cagiriyor. Once sunucu kendi hesabini yapiyor,
 * arayuz de kendi formulunu yaziyordu; "Isci Pazarligi" alindiginda sunucu
 * indirimli tahsil ediyor ama cekmecede eski sayi duruyordu. Indirimi
 * gormek, indirimin kendisi kadar onemli -- gorulmeyen bir kartin alinmasi
 * icin bir sebep yok.
 */
export function getWorkerHireCostWithModifiers(
  hiredCount: number,
  advanced = false,
  costMultiplier = 1
) {
  return Math.ceil(getWorkerHireCost(hiredCount, advanced) * Math.max(0, costMultiplier));
}

export function isHirableWorkerRole(value: unknown): value is HirableWorkerRole {
  return typeof value === "string" && (HIRABLE_WORKER_ROLES as readonly string[]).includes(value);
}

export function canHireWorker(hiredCount: number, gold: number, advanced = false) {
  return gold >= getWorkerHireCost(hiredCount, advanced);
}

export function advanceResourceExtraction(
  remainingMs: number | undefined,
  deltaMs: number,
  durationMs = RESOURCE_EXTRACTION_DURATION_MS
) {
  const nextRemainingMs = Math.max(0, (remainingMs ?? durationMs) - Math.max(0, deltaMs));
  return {
    remainingMs: nextRemainingMs,
    completed: nextRemainingMs === 0
  };
}

