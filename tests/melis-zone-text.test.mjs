/**
 * Ruh hali satiri.
 *
 * Onay/stres kule davranisini degistiriyor ama oyun ici arayuz bunu soylemiyordu;
 * oyuncu yalnizca renkli bir cubuk goruyordu. Secili kule panelindeki satir bu
 * boslugu kapatiyor. Asil risk metnin davranistan kopmasi -- karakter ozeti tam
 * da boyle, kaldirilmis bir buff'i anlatmaya devam etmisti. Testler metni
 * sunucunun gercekten uyguladigi degerle karsilastiriyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  getMelisSpectrumZone,
  getMelisZoneAffectedTowerIds,
  getMelisZoneEffectText,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const ZONES = ["approval", "balanced", "stress"];

function melisTower(definitionId, zone) {
  const room = createRoom("archer");
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer bulunamadi`);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId });

  const player = room.state.players.get("p1");
  player.characterId = "archer";
  player.approval = zone === "approval" ? 12 : zone === "stress" ? 4 : 6;
  player.stress = zone === "stress" ? 12 : zone === "approval" ? 4 : 6;

  const tower = [...room.towers.values()].find((entry) => entry.definition.id === definitionId);
  assert.ok(tower, `${definitionId} kurulamadi`);
  assert.equal(getMelisSpectrumZone(player.approval, player.stress), zone, "kurulum yanlis bolgede");
  return { room, tower };
}

test("her ruh hali icin tek satirlik metin var", () => {
  const ids = getMelisZoneAffectedTowerIds();
  assert.ok(ids.length > 0, "ruh haline bagli kule listesi bos");

  for (const id of ids) {
    assert.ok(
      towerCatalog.archer.some((tower) => tower.id === id),
      `${id} Melis katalogunda yok`
    );
    const texts = ZONES.map((zone) => getMelisZoneEffectText(id, zone));
    for (const [index, text] of texts.entries()) {
      assert.ok(text, `${id}/${ZONES[index]}: metin yok`);
      assert.equal(text.includes("\n"), false, `${id}/${ZONES[index]}: metin tek satir olmali`);
    }
    assert.ok(new Set(texts).size > 1, `${id}: uc bolge de ayni metni veriyor, satir bir sey ayirt etmiyor`);
  }
});

test("ruh haline bagli olmayan kulede satir cikmaz", () => {
  for (const id of ["archer-4", "archer-7", "archer-8"]) {
    for (const zone of ZONES) {
      assert.equal(getMelisZoneEffectText(id, zone), undefined, `${id}: gereksiz satir`);
    }
  }
  assert.equal(getMelisZoneEffectText("warrior-1", "stress"), undefined);
});

test("lanet metnindeki sure sunucunun uyguladigi suredir", () => {
  // Tek dogrudan sayi bu; metinle davranisin ayrisip ayrismadigi buradan okunur.
  for (const zone of ZONES) {
    const { room, tower } = melisTower("archer-3", zone);
    const gercekSaniye = room.getMelisCurseDurationMs(tower) / 1000;
    const metin = getMelisZoneEffectText("archer-3", zone);
    const yazan = Number(metin.match(/(\d+(?:[.,]\d+)?)\s*sn/)?.[1]?.replace(",", "."));

    assert.ok(Number.isFinite(yazan), `${zone}: metinde sure bulunamadi (${metin})`);
    assert.equal(yazan, gercekSaniye, `${zone}: metin ${yazan} sn diyor, sunucu ${gercekSaniye} sn uyguluyor`);
  }
});

test("hedef secimi degisen kule satira sahip", () => {
  // Motorda targetingByState tasiyan her kule oyuncuya bunu soylemeli.
  for (const tower of towerCatalog.archer) {
    if (!tower.engine?.targetingByState) {
      continue;
    }
    for (const zone of ZONES) {
      assert.ok(
        getMelisZoneEffectText(tower.id, zone),
        `${tower.id}: hedefi ruh haline gore degisiyor ama ${zone} satiri yok`
      );
    }
  }
});

test("stres satirlari bedeli anlatir, kazanc vaat etmez", () => {
  // Stres tarafinda kule odulu yok; metin de odul vaat etmemeli.
  const parlama = getMelisZoneEffectText("archer-2", "stress");
  assert.match(parlama, /dost kule/i, "Parlama stres satiri dost kule bedelini anlatmiyor");

  const ayna = getMelisZoneEffectText("archer-5", "stress");
  assert.match(ayna, /rastgele/i, "Kirik Ayna stres satiri rastgele hedefi anlatmiyor");

  const lanetStres = Number(getMelisZoneEffectText("archer-3", "stress").match(/(\d+)\s*sn/)[1]);
  const lanetOnay = Number(getMelisZoneEffectText("archer-3", "approval").match(/(\d+)\s*sn/)[1]);
  assert.ok(lanetStres < lanetOnay, "stres laneti uzatiyormus gibi yaziyor");
});
