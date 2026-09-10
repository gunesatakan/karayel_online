/**
 * Ortak cikmaz sokak hafizasi.
 *
 * Dusmanlar haritayi bilmiyor, ama birbirlerine haber veriyorlar: bir hucreyi
 * cikmaz sokak olarak goren dusman onu ortak hafizaya yaziyor ve o andan sonra
 * oraya hic gitmemis dusmanlar da girmiyor.
 *
 * Olcut icinden **gecilememek**: dort yanindan ucu kapali bir hucreye giren
 * dusman ayni yandan geri cikmak zorunda. Bu yuzden eleme hicbir gecerli yolu
 * kisaltamaz -- ve testlerin yarisi tam olarak bunu tutuyor. Bir cikmaz sokak
 * kurali yanlis kurulursa oyunu kazanilmaz yapabilir: hattin tamamini kapali
 * sanan dusman hicbir zaman nexusa varmaz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { gridToWorld, worldToGrid } from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

/** Verilen hucreye kule kurar; hucreyi kapatmanin en dogrudan yolu. */
function kuleyleKapat(room, cell) {
  const nokta = gridToWorld(cell.col, cell.row, room.activeMap);
  room.placeTower(client, { x: nokta.x, y: nokta.y, definitionId: "warrior-1" });
  const kule = [...room.towers.values()].at(-1);
  assert.ok(kule, `${cell.col}:${cell.row} kapatilamadi`);
  const kuruldu = worldToGrid(kule.x, kule.y, room.activeMap);
  assert.deepEqual({ col: kuruldu.col, row: kuruldu.row }, cell, "kule baska kareye kuruldu");
  return kule;
}

/** Ic kisimda, dort yani da acik bir hucre bulur. */
function serbestHucre(room) {
  for (let row = 2; row < room.activeMap.rows - 2; row += 1) {
    for (let col = 1; col < room.activeMap.cols - 1; col += 1) {
      const cell = { col, row };
      const komsular = room.getGridNeighbors(col, row);
      if (komsular.length === 4 && komsular.every((n) => room.isCellPassable(cell, n.col, n.row))) {
        return cell;
      }
    }
  }
  throw new Error("dort yani acik hucre bulunamadi");
}

test("üç yanı kapalı hücre çıkmaz sokak sayılır", () => {
  const room = oda();
  const hedef = serbestHucre(room);
  assert.equal(room.isDeadEnd(hedef.col, hedef.row), false, "acik hucre bastan cikmaz sayildi");

  const komsular = room.getGridNeighbors(hedef.col, hedef.row);
  for (const komsu of komsular.slice(0, 3)) kuleyleKapat(room, komsu);

  assert.equal(room.isDeadEnd(hedef.col, hedef.row), true, "uc yani kapali hucre cikmaz sayilmadi");
});

test("iki yanı kapalı hücre çıkmaz sokak değildir", () => {
  // Kontrol: olcut gercekten uc. Iki yani kapali hucre bir koridordur ve
  // icinden gecilir; elenmesi gecerli yollari kapatirdi.
  const room = oda();
  const hedef = serbestHucre(room);
  const komsular = room.getGridNeighbors(hedef.col, hedef.row);
  for (const komsu of komsular.slice(0, 2)) kuleyleKapat(room, komsu);

  assert.equal(room.isDeadEnd(hedef.col, hedef.row), false, "koridor cikmaz sokak sayildi");
});

test("görülen çıkmaz sokak bütün düşmanlara bildirilir", () => {
  const room = oda();
  const hedef = serbestHucre(room);
  const komsular = room.getGridNeighbors(hedef.col, hedef.row);
  for (const komsu of komsular.slice(0, 3)) kuleyleKapat(room, komsu);

  const anahtar = `${hedef.col}:${hedef.row}`;
  assert.equal(room.deadEndCells.has(anahtar), false, "hic gorulmeden hafizada");

  // Tek bir dusman acik yandan bakiyor: sorulan tek soru sokagi haritaliyor.
  const acikYan = komsular[3];
  assert.equal(room.isCellWalkable(acikYan, hedef.col, hedef.row), false, "gorulen sokaga girildi");
  assert.equal(room.deadEndCells.has(anahtar), true, "gorulen sokak hafizaya yazilmadi");

  // Hafiza ortak: sokagi hic gormemis bir dusman da ayni cevabi aliyor.
  assert.equal(room.isCellWalkable(acikYan, hedef.col, hedef.row), false);
});

test("çıkmaz sokak yığılır: kör sokağın tamamı düşer", () => {
  // Ucu kapaninca ondan onceki hucrenin de acik yani bire duser; sokagin
  // tamami boylece haritadan cikar ve agzina gelen dusman iceri hic girmez.
  const room = oda();
  const uc = serbestHucre(room);
  const komsular = room.getGridNeighbors(uc.col, uc.row);
  for (const komsu of komsular.slice(0, 3)) kuleyleKapat(room, komsu);
  const agiz = komsular[3];

  const agizKomsulari = room.getGridNeighbors(agiz.col, agiz.row)
    .filter((n) => !(n.col === uc.col && n.row === uc.row));
  for (const komsu of agizKomsulari.slice(0, 2)) kuleyleKapat(room, komsu);

  const disari = agizKomsulari[2];
  assert.ok(disari, "sokagin disari acilan yani yok");
  room.isCellWalkable(agiz, uc.col, uc.row);
  assert.equal(room.deadEndCells.has(`${uc.col}:${uc.row}`), true);
  assert.equal(room.isCellWalkable(disari, agiz.col, agiz.row), false, "sokagin agzi elenmedi");
});

test("çıkış satırı asla çıkmaz sokak sayılmaz", () => {
  // Kuralin en tehlikeli kosesi. Cikis satirindaki bir hucrenin alt yani
  // zaten harita disi, yani sagi ve solu kapaninca uc yani kapali olur ve
  // olcut onu cikmaz sokak ilan eder. Ama orasi hedefin kendisi: elenirse
  // dusmanlar nexusa giden tek boyunu reddeder ve oyun kazanilamaz hale
  // gelir -- kazanilmaz degil, **bitmez**.
  const room = oda();
  const cikisSatiri = room.activeMap.rows - 1;
  const boyun = { col: 4, row: cikisSatiri };
  kuleyleKapat(room, { col: boyun.col - 1, row: cikisSatiri });
  kuleyleKapat(room, { col: boyun.col + 1, row: cikisSatiri });

  // Durum gercekten kuruldu mu: tek acik yani yukarisi.
  const acik = room.getGridNeighbors(boyun.col, boyun.row)
    .filter((n) => room.isCellPassable(boyun, n.col, n.row));
  assert.equal(acik.length, 1, "tehlikeli kose kurulamadi, test hicbir sey sinamiyor");

  assert.equal(room.isDeadEnd(boyun.col, boyun.row), false, "cikis satiri elendi");
  assert.equal(
    room.isCellWalkable({ col: boyun.col, row: cikisSatiri - 1 }, boyun.col, boyun.row),
    true,
    "nexusa giden boyun kapatildi"
  );
});

test("çıkmaz sokağın içinde kalan düşman yürüyerek çıkabilir", () => {
  // Kural iceri girmeyi yasakliyor, iceride hapsetmeyi degil. Sokak
  // haritalanmadan once iceri girmis dusman duvar kirmadan cikabilmeli.
  const room = oda();
  const hedef = serbestHucre(room);
  const komsular = room.getGridNeighbors(hedef.col, hedef.row);
  for (const komsu of komsular.slice(0, 3)) kuleyleKapat(room, komsu);
  const acikYan = komsular[3];

  room.isCellWalkable(acikYan, hedef.col, hedef.row);
  assert.equal(room.deadEndCells.has(`${hedef.col}:${hedef.row}`), true);
  assert.equal(room.isCellWalkable(hedef, acikYan.col, acikYan.row), true, "iceride kalan dusman hapsoldu");
});

test("yapı yıkılınca hafıza sıfırlanır", () => {
  const room = oda();
  const hedef = serbestHucre(room);
  const komsular = room.getGridNeighbors(hedef.col, hedef.row);
  const kuleler = komsular.slice(0, 3).map((komsu) => kuleyleKapat(room, komsu));
  room.isCellWalkable(komsular[3], hedef.col, hedef.row);
  assert.equal(room.deadEndCells.has(`${hedef.col}:${hedef.row}`), true);

  room.damageTower(kuleler[0], kuleler[0].maxHp * 10);
  assert.equal(kuleler[0].hp, 0);
  assert.equal(room.deadEndCells.size, 0, "yapi yikilinca hafiza silinmedi");
  assert.equal(room.isCellWalkable(komsular[3], hedef.col, hedef.row), true, "acilan sokak hala kapali");
});

test("hasar alan ama yıkılmayan yapı hafızayı silmez", () => {
  // Gecilebilirlik cana degil, canin sifira inmesine bagli. Her vurusta
  // silmek hafizayi tumden ise yaramaz kilardi.
  const room = oda();
  const hedef = serbestHucre(room);
  const komsular = room.getGridNeighbors(hedef.col, hedef.row);
  const kuleler = komsular.slice(0, 3).map((komsu) => kuleyleKapat(room, komsu));
  room.isCellWalkable(komsular[3], hedef.col, hedef.row);
  assert.equal(room.deadEndCells.size > 0, true);

  room.damageTower(kuleler[0], 1);
  assert.ok(kuleler[0].hp > 0, "kule tek vurusla yikildi, test olcemedi");
  assert.equal(room.deadEndCells.size > 0, true, "hasar hafizayi sildi");
});

test("başka çaresi kalmayan düşman yapıya saldırır", () => {
  // Tek acik yani bir cikmaz sokak olan dusman: gidecek yeri yok, kirmali.
  const room = oda();
  const hedef = serbestHucre(room);
  const komsular = room.getGridNeighbors(hedef.col, hedef.row);
  for (const komsu of komsular.slice(0, 3)) kuleyleKapat(room, komsu);
  const agiz = komsular[3];

  for (const komsu of room.getGridNeighbors(agiz.col, agiz.row)) {
    if (komsu.col === hedef.col && komsu.row === hedef.row) continue;
    kuleyleKapat(room, komsu);
  }

  room.spawnEnemy();
  const dusman = [...room.enemies.values()].at(-1);
  const nokta = gridToWorld(agiz.col, agiz.row, room.activeMap);
  dusman.x = nokta.x;
  dusman.y = nokta.y;
  dusman.navigator = undefined;
  dusman.navigatorStep = undefined;
  dusman.structureTargetId = undefined;

  const rota = room.findEnemyRoute(dusman);
  assert.ok(rota.targetTower, "cikisi olmayan dusman saldiracak yapi bulamadi");
  assert.ok(rota.targetTower.hp > 0, "yikilmis yapiyi hedefledi");
});
