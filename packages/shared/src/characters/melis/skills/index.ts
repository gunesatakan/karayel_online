import { makeSkills } from "../../common/factory.js";

export const melisSkills = makeSkills("archer", [
  ["Zorba", "Seçilen alandaki bir tank düşmanı yerine sabitler ve tarafını değiştirir. Sabitlenen düşman 7 saniye boyunca çevresindeki düşmanlara saniyede kendi maksimum canının %15'i kadar hasar verir. Kalabalık dalgayı kendi tankıyla kırmak için kullanılır.", 22000],
  ["Ölümcül Stres", "Seçili Melis kulesini bir sonraki evrime taşır ve bedelini stresten öder: 1. evrim 10, 2. evrim 16, 3. evrim 24 stres. Ödenen stres barı onaya doğru geri iter, yani her evrim biriktirdiğin baskıyı harcar.", 6000],
  ["Odaklan", "5 saniye boyunca tüm Melis kuleleri o an vurdukları hedefe kilitlenir ve mermi hızları 3 katına çıkar. Bu sürede son vuruşu yapan kule, Odaklan bitene kadar 5 kat atış hızı kazanır. Tek bir kalın hedefi eritmek için kullanılır.", 12000]
]);
