import { makeSkills } from "../../common/factory.js";

export const zeynepSkills = makeSkills("zeynep", [
  ["Hızlanın", "İtibar harcayan komut. Takımdaki tüm kulelere süreli atış hızı verir. Küçük, orta ve büyük olmak üzere üç kademede verilebilir; kademe yükseldikçe hem itibar bedeli hem etkisi artar. Zinciri kapatan komutsa Zincir Kalitesi kadar daha da güçlenir.", 900],
  ["Alanı Tutun", "İtibar harcayan komut. Takımdaki tüm kulelere süreli menzil verir ve savunma hattının kapsadığı alanı genişletir. Üç kademelidir; zinciri kapatan komutsa Zincir Kalitesi kadar güçlenir.", 900],
  ["Yavaşlatın", "İtibar harcayan komut. Haritadaki tüm düşmanlara süreli yavaşlatma uygular. Üç kademelidir; zinciri kapatan komutsa Zincir Kalitesi kadar güçlenir. Nexusa yaklaşan dalgaya zaman kazanmak için kullanılır.", 900]
]);

/**
 * Komut kademesinin itibar bedeli. Sunucu (`getZeynepCommandCost`) ve
 * istemci (kademe dugmeleri, harita jestinin cubugu) ayni sayiyi okumali;
 * testler sunucudaki sabitlerle esitligi kilitliyor.
 */
export const ZEYNEP_COMMAND_TIER_COST = { small: 10, medium: 40, big: 80 } as const;
