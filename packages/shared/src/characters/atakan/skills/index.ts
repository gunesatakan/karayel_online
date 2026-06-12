import { makeSkills } from "../../common/factory.js";

export const atakanSkills = makeSkills("warrior", [
  ["Yonlendirme", "Haritada bir alan isaretler; 1 saniye boyunca mermi vuruslu kuleler menzil sinirina takilmadan o alandaki dusmanlara saldirir.", 16000],
  ["Refactor", "Bir turret'i cezasiz sekilde baska yere tasima veya upgrade yolunu degistirme altyapisi.", 24000],
  ["Sessiz Mod", "Tum kuleler 5 saniye susar; ardindan hasar sinifli kulelerin saldiri hizi 5 saniyeligine 3 katina cikar.", 32000]
]);
