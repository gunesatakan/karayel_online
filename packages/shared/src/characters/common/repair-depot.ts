import type { TowerDefinition } from "./types.js";
import { attachTowerEngine } from "./engine.js";
import { NON_FIRING_INTERVAL_MS } from "../../tower-rules.js";

/**
 * Tamir Merkezi: Tamirci iscisinin ussu.
 *
 * Duvar gibi herkesin listesinde, kimsenin kiti degil. Tamirci de bir karakter
 * yetenegi degil, herkesin alabildigi bir isci rolu; ussunu yedi kez, yedi ayri
 * adla yazmanin bir karsiligi olmazdi.
 *
 * Duvardan bir farki var: bu yapi kareyi kapliyor ve kule kontenjanindan yer
 * yiyor. Bir hasar kulesinden vazgecip onarim altyapisi kurmak asil karar --
 * bedava olsaydi karar olmazdi.
 *
 * Menzil burada bir **oncelik** cemberi, bir sinir degil. Tamirci once bu
 * cemberin icindeki en kotu durumdaki yapiya kosar; cember bossa haritanin
 * geri kalanina bakar. Sinir olsaydi merkezi yanlis koseye kuran oyuncunun
 * iscisi bosa alinmis olurdu; oncelik olunca merkez "onarim nereye
 * yogunlassin" sorusunun cevabi oluyor.
 */
export const REPAIR_DEPOT_TOWER_ID = "repair-depot-1";

export const repairDepotTower: TowerDefinition = attachTowerEngine({
  id: REPAIR_DEPOT_TOWER_ID,
  characterId: "zeynep",
  name: "Tamir Merkezi",
  role: "Tamirci üssü",
  description: "Ateş etmez. Tamirci işçilerinin üssüdür: boş kaldıklarında buraya döner ve burada beklerler. Bir yapı hasar aldığında müdahale bu merkezden başlar — Tamirci önce merkezin çevresindeki en kötü durumdaki yapıyı onarır, çevrede onarılacak bir şey kalmadığında haritanın geri kalanına bakar. Yükseltmek çevre halkasını genişletir. Merkezi olmayan Tamirci de çalışır, ama nereye koşacağına oyuncu karar veremez.",
  classType: "support",
  damageType: "none",
  hitType: "none",
  axes: ["economy"],
  cost: 45,
  upgradeCost: 26,
  /** Oncelik cemberinin yaricapi; her seviye buyutur. */
  range: 150,
  damage: 0,
  fireIntervalMs: NON_FIRING_INTERVAL_MS,
  projectileSpeed: 0,
  aoeRadius: 0,
  slowMs: 0,
  color: 0xf472b6
});

export function isRepairDepotDefinition(definition: Pick<TowerDefinition, "id">) {
  return definition.id === REPAIR_DEPOT_TOWER_ID;
}
