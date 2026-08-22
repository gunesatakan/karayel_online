import type { TowerDefinition } from "./types.js";
import { attachTowerEngine } from "./engine.js";
import { NON_FIRING_INTERVAL_MS } from "../../tower-rules.js";

/**
 * Duvar: ateS etmeyen, ucuz, kalinlastirilabilir yapi.
 *
 * Ayri bir varlik turu degil, bir kule varyanti. Yerlestirme dogrulamasi, can,
 * hasar alma, snapshot, satis ve yukseltme hatti oldugu gibi calisiyor; duvara
 * ozel tek sey ne kadar dayandigi. Ayri bir varlik yazmak MatchRoom'daki kule
 * mantiginin buyuk kismini ikinci kez yazmak olurdu.
 *
 * Her karakterin kule listesine ekleniyor: duvar bir karakterin kiti degil,
 * herkesin kullandigi bir zemin araci.
 */
export const WALL_TOWER_ID = "wall-1";

/**
 * Duvarin cani kule tabanindan bir tik yuksek.
 *
 * Carpan WALL_COST_COEFFICIENT ile birlikte okunmali: katsayi 100 canli bir
 * yapinin yol bedelinin harita genisligini biraz asmasina gore ayarlandi, yani
 * huni tam olarak o civarda calisiyor. Cok daha yuksek bir can, bedeli harita
 * genisliginin kat kat uzerine tasir ve dusman saglam duvari **hicbir zaman**
 * kirmayi secmez; duvar o noktada oyalayici degil mutlak engel olur.
 *
 * Asil dayaniklilik kalinlastirmadan gelir: her seviye tabana ek can yazar.
 */
export const WALL_HEALTH_MULTIPLIER = 1.2;
/** Kalinlastirma: her seviye tabana bunun kadar ek can yazar. */
export const WALL_HEALTH_PER_LEVEL = 0.6;

export const wallTower: TowerDefinition = attachTowerEngine({
  id: WALL_TOWER_ID,
  characterId: "zeynep",
  name: "Duvar",
  role: "Yönlendirme",
  description: "Kare kaplamaz; iki karenin arasındaki çizgiye oturur ve o geçişi kapatır. Getirildiği kenar yataysa yatay, dikeyse dikey döner. Düşmanlar duvarı aşılmaz bir engel olarak görmez; kırmanın maliyetini hesaplayıp haritanın en zayıf noktasına akarlar. Kalınlaştırmak canını ve dolayısıyla yönlendirme gücünü artırır. Yıkılan duvar kendiliğinden geri gelmez; onarım tam yeniden inşadan ucuzdur.",
  classType: "support",
  damageType: "none",
  hitType: "none",
  axes: ["barricade"],
  cost: 10,
  upgradeCost: 8,
  range: 0,
  damage: 0,
  fireIntervalMs: NON_FIRING_INTERVAL_MS,
  projectileSpeed: 0,
  aoeRadius: 0,
  slowMs: 0,
  color: 0x94a3b8,
  structureHealthMultiplier: WALL_HEALTH_MULTIPLIER,
  structureHealthPerLevel: WALL_HEALTH_PER_LEVEL
});

/** Bir yapinin seviyesine gore can carpani. Duvar disi kuleler sabit kalir. */
export function getStructureHealthMultiplier(definition: TowerDefinition, level: number) {
  const base = definition.structureHealthMultiplier ?? 1;
  const perLevel = definition.structureHealthPerLevel ?? 0;
  return base * (1 + Math.max(0, Math.round(level) - 1) * perLevel);
}

export function isWallDefinition(definition: Pick<TowerDefinition, "id">) {
  return definition.id === WALL_TOWER_ID;
}

/** Duvar tek bir kenar cizgisi kaplar; Abarti iki cizgi uzunlugundadir. */
export const WALL_EDGE_LENGTH = 1;
