/**
 * Onur'un "Sempati" ultisi: sahadaki her kule en yakin kuleye baglanir, baga
 * degen kara dusmanlar bagi gecene kadar yavaslar ve her dusman en fazla bir
 * kez 3 saniyelik kanama alir.
 *
 * Ag kurma ve temas geometrisi shared tarafinda saf fonksiyon oldugu icin
 * dogrudan olculur; yavaslatma ve kanamanin gercekten uygulandigi ise gercek
 * MatchRoom surulerek dogrulanir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  SYMPATHY_BLEED_MAX_HEALTH_RATIO_PER_SECOND,
  SYMPATHY_LINK_HALF_WIDTH,
  SYMPATHY_SLOW_MULTIPLIER,
  buildSympathyLinks,
  getDistanceToSegment,
  isTouchingSympathyLink,
  selectSympathyContacts
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

test("her kule en yakin kuleye baglanir", () => {
  const links = buildSympathyLinks([
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 10, y: 0 },
    { id: "c", x: 100, y: 0 }
  ]);

  // a<->b karsilikli en yakin: tek hat uretir. c'nin en yakini b.
  assert.equal(links.length, 2);
  assert.ok(links.some((link) => link.fromTowerId === "a" && link.toTowerId === "b"));
  assert.ok(links.some((link) => link.fromTowerId === "b" && link.toTowerId === "c"));
});

test("karsilikli en yakin kuleler tek bag uretir", () => {
  const links = buildSympathyLinks([
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 10, y: 0 }
  ]);
  assert.equal(links.length, 1);
});

test("tek kule varken bag olusmaz", () => {
  assert.deepEqual(buildSympathyLinks([{ id: "a", x: 0, y: 0 }]), []);
  assert.deepEqual(buildSympathyLinks([]), []);
});

test("ag kule sirasindan bagimsiz olarak ayni cikar", () => {
  const towers = [
    { id: "t3", x: 40, y: 0 },
    { id: "t1", x: 0, y: 0 },
    { id: "t2", x: 12, y: 0 }
  ];
  const first = buildSympathyLinks(towers).map((link) => link.id).sort();
  const second = buildSympathyLinks([...towers].reverse()).map((link) => link.id).sort();
  assert.deepEqual(first, second);
});

test("mesafe olcumu hattin otesine tasmaz", () => {
  // Parca disindaki nokta uc noktaya olan uzakligi verir, sonsuz dogruya degil.
  assert.equal(getDistanceToSegment(-10, 0, 0, 0, 10, 0), 10);
  assert.equal(getDistanceToSegment(5, 3, 0, 0, 10, 0), 3);
  assert.equal(getDistanceToSegment(20, 0, 0, 0, 10, 0), 10);
});

test("baga degen kara dusman secilir, ucan dusman secilmez", () => {
  const link = { id: "l", fromTowerId: "a", toTowerId: "b", x1: 0, y1: 0, x2: 100, y2: 0 };
  const onLine = { id: "ground", x: 50, y: 0, movementKind: "ground" };
  const flying = { id: "air", x: 50, y: 0, movementKind: "air" };
  const far = { id: "far", x: 50, y: SYMPATHY_LINK_HALF_WIDTH + 20, movementKind: "ground" };

  assert.equal(isTouchingSympathyLink(link, onLine), true);
  assert.equal(isTouchingSympathyLink(link, flying), false);
  assert.equal(isTouchingSympathyLink(link, far), false);

  const contacts = selectSympathyContacts([link], [onLine, flying, far]);
  assert.deepEqual(contacts.map((contact) => contact.id), ["ground"]);
});

test("ayni dusman birden fazla baga degse de bir kez listelenir", () => {
  const links = [
    { id: "l1", fromTowerId: "a", toTowerId: "b", x1: 0, y1: 0, x2: 100, y2: 0 },
    { id: "l2", fromTowerId: "b", toTowerId: "c", x1: 50, y1: -50, x2: 50, y2: 50 }
  ];
  const enemy = { id: "e", x: 50, y: 0, movementKind: "ground" };
  assert.equal(selectSympathyContacts(links, [enemy]).length, 1);
});

test("Sempati baga degen dusmani yavaslatir ve bir kez kanatir", () => {
  const room = createRoom("onur");
  const player = room.state.players.get("p1");
  player.ultimateCharge = 100;

  // Iki kule kur ki aralarinda bir bag olussun.
  const first = findBuildableSpot(room, "onur-3");
  room.placeTower({ sessionId: "p1" }, { x: first.x, y: first.y, definitionId: "onur-3" });
  const second = findBuildableSpot(room, "onur-3");
  room.placeTower({ sessionId: "p1" }, { x: second.x, y: second.y, definitionId: "onur-3" });
  const towers = [...room.towers.values()];
  assert.equal(towers.length, 2, "test iki kule gerektiriyor");

  room.useUltimate({ sessionId: "p1" }, {});

  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.movementKind = "ground";
  enemy.statusResistances = {};
  // Dusmani iki kulenin tam ortasina, yani bagin uzerine koy.
  enemy.x = (towers[0].x + towers[1].x) / 2;
  enemy.y = (towers[0].y + towers[1].y) / 2;

  room.resetAuraSlows();
  room.updateSympathy();

  assert.ok(room.sympathyLinks.length > 0, "ulti sonrasi bag kurulmadi");
  assert.ok(
    Math.abs(enemy.auraSlowMultiplier - SYMPATHY_SLOW_MULTIPLIER) < 1e-9,
    `yavaslatma uygulanmadi: ${enemy.auraSlowMultiplier}`
  );
  assert.equal(enemy.statusEffects.bleed?.magnitude, SYMPATHY_BLEED_MAX_HEALTH_RATIO_PER_SECOND);

  // Ikinci tickte kanama yeniden uygulanmamali.
  const firstExpiry = enemy.statusEffects.bleed.expiresAt;
  enemy.statusEffects.bleed.expiresAt = firstExpiry - 500;
  room.resetAuraSlows();
  room.updateSympathy();
  assert.equal(enemy.statusEffects.bleed.expiresAt, firstExpiry - 500, "kanama ikinci kez uygulandi");

  // Bagdan uzaklasinca yavaslatma kendiliginden biter.
  enemy.x += 400;
  enemy.y += 400;
  room.resetAuraSlows();
  room.updateSympathy();
  assert.equal(enemy.auraSlowMultiplier, 1, "bagi gectikten sonra yavaslatma surdu");
});
