import { makeSkills } from "../../common/factory.js";

export const melisSkills = makeSkills("archer", [
  ["Zorba", "Secilen alandaki bir tank dusmani sabitler, taraf degistirir ve yakin dusmanlara saniyede max caninin %15'i kadar hasar verir.", 22000],
  ["Olumcul Stres", "Secili Melis kulesini stres/onay orani yeterliyse siradaki evrime tasir. Evrim 1 icin 3/2, evrim 2 icin 2/1, evrim 3 icin 3/1 gerekir; basaridan sonra stres onaya esitlenir.", 6000],
  ["Odaklan", "5 saniye boyunca Melis kuleleri o anda vurduklari hedefe kilitlenir. Vurus animasyonu/mermi hizi 3 katina cikar; bu surede son vurus yapan kule Odaklan bitene kadar 5 kat saldiri hizi kazanir.", 12000]
]);
