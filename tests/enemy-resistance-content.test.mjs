/**
 * Dusman irk dirençleri ve onlara karsi oynanabilen icerik.
 *
 * Alti irkin her birinin bir hasar tipine karsi direnci, bir digerine karsi
 * zaafi var ve irk dalgayla degisiyor. Kule dizilimi dalga arasinda
 * degistirilemedigi icin yanlis hasar tipiyle yakalanmak bir karar degil bir
 * kazaydi: sistem kuruluydu ama oyuncunun ona karsi cekebilecegi hicbir kol
 * yoktu.
 *
 * Iki kol birbirinin tersi. Delme dalgayi okumayi **gereksiz** kiliyor, zaaf
 * buyutme okumayi **daha degerli** yapiyor. Bu yuzden en kritik soz ikisinin
 * birbirine karismamasi: delme yalnizca direnci, buyutme yalnizca zaafi
 * tutmali. Tek bir sayi ikisini birden kaydirsaydi, direnc delen bir kart dogru
 * hasar tipini secmis oyuncuyu cezalandirirdi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDamageTaken,
  cardCatalog,
  enemyRaceDefinitions,
  getShopItem,
  shapeEnemyResistance
} from "../packages/shared/dist/index.js";

test("delme direnci kirpar, zaafa dokunmaz", () => {
  assert.equal(shapeEnemyResistance(0.2, { resistancePierce: 0.5 }), 0.1);
  assert.equal(shapeEnemyResistance(-0.2, { resistancePierce: 0.5 }), -0.2);
});

test("zaaf buyutme zaafi derinlestirir, direnci buyutmez", () => {
  assert.ok(Math.abs(shapeEnemyResistance(-0.2, { weaknessBonus: 0.5 }) - -0.3) < 1e-9);
  assert.equal(shapeEnemyResistance(0.2, { weaknessBonus: 0.5 }), 0.2);
});

test("delme tam degerde direnci tamamen kaldirir, otesine gecmez", () => {
  assert.equal(shapeEnemyResistance(0.2, { resistancePierce: 1 }), 0);
  // Kirpma sart: 1'in ustu direnci negatife cevirip zaafa donusturebilirdi.
  assert.equal(shapeEnemyResistance(0.2, { resistancePierce: 4 }), 0);
});

test("icerik yokken direnc hesabi hic degismez", () => {
  const hedef = { armor: 0, shield: 0, damageResistances: { fire: 0.2 }, hitTypeResistances: {} };
  const paket = { amount: 100, damageType: "fire" };
  assert.equal(
    calculateDamageTaken(paket, hedef).rawDamage,
    calculateDamageTaken(paket, hedef, {}).rawDamage
  );
});

test("direnc delince ayni atis daha cok vurur", () => {
  const hedef = { armor: 0, shield: 0, damageResistances: { fire: 0.2 }, hitTypeResistances: {} };
  const paket = { amount: 100, damageType: "fire" };
  const cip = calculateDamageTaken(paket, hedef).rawDamage;
  const delinmis = calculateDamageTaken(paket, hedef, { resistancePierce: 0.5 }).rawDamage;
  assert.equal(cip, 80);
  assert.equal(delinmis, 90);
});

test("zaaf buyutulunce dogru hasar tipi daha cok odullendirir", () => {
  const hedef = { armor: 0, shield: 0, damageResistances: { electric: -0.2 }, hitTypeResistances: {} };
  const paket = { amount: 100, damageType: "electric" };
  assert.equal(calculateDamageTaken(paket, hedef).rawDamage, 120);
  assert.ok(Math.abs(calculateDamageTaken(paket, hedef, { weaknessBonus: 0.5 }).rawDamage - 130) < 1e-9);
});

test("her irkin hem bir direnci hem bir zaafi var", () => {
  // Icerigin iki kolu da bir seye dayanmali: delinecek direnci ya da
  // buyutulecek zaafi olmayan bir irk, iki karti da o dalgada olu birakirdi.
  for (const [race, definition] of Object.entries(enemyRaceDefinitions)) {
    const degerler = Object.values(definition.damageResistances);
    assert.ok(degerler.some((value) => value > 0), `${race} irkinin direnci yok`);
    assert.ok(degerler.some((value) => value < 0), `${race} irkinin zaafi yok`);
  }
});

test("iki kolun da karti ve esyasi var", () => {
  const kartlar = cardCatalog.filter((card) => card.effects.some(({ stat }) => stat === "resistancePierce" || stat === "weaknessBonus"));
  assert.ok(kartlar.length >= 2, "direnc ekseninde yeterli kart yok");
  for (const id of ["direnc-sokucu", "zaaf-mercegi"]) {
    const item = getShopItem(id);
    assert.ok(item, `${id} katalogda yok`);
    assert.equal(item.target, "tower");
    assert.ok(item.description.includes("Takıldığı"), `${id} kuleye takildigini soylemiyor`);
  }
});
