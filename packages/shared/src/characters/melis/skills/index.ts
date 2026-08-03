import { makeSkills } from "../../common/factory.js";

export const melisSkills = makeSkills("archer", [
  ["Zorba", "Seçilen alandaki bir tank düşmanı yerine sabitler ve tarafını değiştirir. Sabitlenen düşman 7 saniye boyunca çevresindeki düşmanlara saniyede kendi maksimum canının %15'i kadar hasar verir. Kalabalık dalgayı kendi tankıyla kırmak için kullanılır.", 22000],
  ["Ölümcül Stres", "Seçili Melis kulesini bir sonraki evrime taşır. Stresin onaya oranı yetmelidir: 1. evrim için 3/2, 2. evrim için 2/1, 3. evrim için 3/1. Evrim açıldıktan sonra stres onaya eşitlenir, yani her evrim biriken baskıyı sıfırlar.", 6000],
  ["Odaklan", "5 saniye boyunca tüm Melis kuleleri o an vurdukları hedefe kilitlenir ve mermi hızları 3 katına çıkar. Bu sürede son vuruşu yapan kule, Odaklan bitene kadar 5 kat atış hızı kazanır. Tek bir kalın hedefi eritmek için kullanılır.", 12000]
]);
