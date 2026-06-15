import { makeSkills } from "../../common/factory.js";

export const atakanSkills = makeSkills("warrior", [
  ["Yonlendirme", "Haritada bir alan isaretler; 1 saniye boyunca mermi vuruslu kuleler menzil sinirina takilmadan o alandaki dusmanlara saldirir.", 16000],
  ["Refactor", "Secili turret'i altin kaybi olmadan baska bir uygun kareye tasir.", 24000],
  ["Sessiz Mod", "Tum kuleler 5 saniye susar; ardindan hasar sinifli kulelerin saldiri hizi 5 saniyeligine 3 katina cikar.", 32000]
]);
