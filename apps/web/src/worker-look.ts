/**
 * Lojistik iscilerin haritadaki gorunusu: rol basina doku, renk ve siluet.
 *
 * Sahibin istegi (2026-10-24): "Tamirci, Tasiyici ve Toplayicilari daha
 * kolay ayirmamiz gerek. Renklerini birbirinden belirgin farkli yap.
 * Tamircinin sekli de farkli olsun." Onizlemeden secilen (B): Toplayici mor
 * (kristal), Tasiyici kehribar (enerji), Tamirci yesil; Tamirci kalin bir
 * onarim artisi, otekiler baklava.
 *
 * Eskiden uc rol ayni camgobegi dokuyu (`drone-repair`) baska tint ile
 * carpiyordu; carpim Toplayici ile Tamirciyi ayni maviye dusuruyordu (214 ve
 * 213 derece). Simdi her rolun kendi dokusu var ve sprite tint almiyor:
 * gorunen renk tam bu. Isci listesinin satir renkleri (style.css,
 * `.worker-row--*`) ayni renkler; listedeki satirla haritadaki isciyi
 * birbirine baglayan tek sey renk.
 */
import type { DroneSnapshot } from "@karayel/shared";

export type WorkerLookRole = "gatherer" | "carrier" | "repairer";
export type WorkerShape = "diamond" | "plus";

export type WorkerLook = {
  /** Preloader'in pisirdigi doku (30 px, `createWorkerTexture`). */
  texture: string;
  /** Govde; gelismis iscinin govdesi de bu renkte. */
  color: number;
  /** Halka ve merkez: govdenin beyazla yari yariya karisimi. */
  accent: number;
  shape: WorkerShape;
};

export const WORKER_LOOKS: Readonly<Record<WorkerLookRole, WorkerLook>> = {
  gatherer: { texture: "worker-gatherer", color: 0x9b7ee0, accent: 0xcdbef0, shape: "diamond" },
  carrier: { texture: "worker-carrier", color: 0xe0a63a, accent: 0xf0d29c, shape: "diamond" },
  repairer: { texture: "worker-repairer", color: 0x4cc77a, accent: 0xa6e3bc, shape: "plus" }
};

/**
 * Tel kipinden gorunus rolu. Eski muhimmat kipleri (sunucu onlari zaten
 * toplama ve tasimaya katliyor) ayni gorunuse dusuyor; AttackLord'un ulti
 * dronlari (`attack`, nexus onaran `repair`) isci degil: `undefined`.
 */
export function getWorkerLookRole(mode: DroneSnapshot["mode"]): WorkerLookRole | undefined {
  if (mode === "crystalCollector" || mode === "ammoCollector") return "gatherer";
  if (mode === "energyTransport" || mode === "ammoTransport") return "carrier";
  if (mode === "repairer") return "repairer";
  return undefined;
}

/** Artinin kol yari kalinligi / kol boyu: 30 px dokuda 4 / 11. */
export const WORKER_PLUS_ARM_RATIO = 4 / 11;

/**
 * Onarim artisinin 12 kosesi, saat yonunde (dokuyu ve gelismis Tamircinin
 * govdesini ayni sekil ciziyor). Arti donmuyor: capraz giderken "x"e donen
 * bir arti iptal isaretine benzerdi.
 */
export function getWorkerPlusOutline(x: number, y: number, radius: number) {
  const h = radius * WORKER_PLUS_ARM_RATIO;
  const r = radius;
  return [
    { x: x - h, y: y - r }, { x: x + h, y: y - r }, { x: x + h, y: y - h }, { x: x + r, y: y - h },
    { x: x + r, y: y + h }, { x: x + h, y: y + h }, { x: x + h, y: y + r }, { x: x - h, y: y + r },
    { x: x - h, y: y + h }, { x: x - r, y: y + h }, { x: x - r, y: y - h }, { x: x - h, y: y - h }
  ];
}
