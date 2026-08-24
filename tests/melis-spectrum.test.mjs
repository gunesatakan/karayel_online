/**
 * Melis'in onay/stres bolgesi.
 *
 * Oyun icindeki her etki iki sayinin dogrudan karsilastirmasindan cikiyor. Bunu
 * gosteren cubuk ayri bir esik kullanirsa oyuncuya yanlis bilgi verir: eskiden
 * oran 0.55'te ekranda "dengeli" yazarken butun stres etkileri calisiyordu.
 * Testler gostergenin kuralini sunucunun kuraliyla ayni yerden okudugunu ve
 * ikisinin her degerde ortustugunu sabitliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getMelisSpectrumZone, towerCatalog } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

/** Melis kulesi kurup onay/stres degerlerini istedigimiz yere getirir. */
function melisRoom(approval, stress) {
  const room = createRoom("archer");
  const definition = towerCatalog.archer.find((tower) => tower.id === "archer-3");
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot, "kule icin yer bulunamadi");
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: definition.id });

  const player = room.state.players.get("p1");
  player.characterId = "archer";
  player.approval = approval;
  player.stress = stress;
  return { room, tower: [...room.towers.values()][0] };
}

test("bolge kurali dogrudan karsilastirma", () => {
  assert.equal(getMelisSpectrumZone(10, 4), "approval");
  assert.equal(getMelisSpectrumZone(4, 10), "stress");
  assert.equal(getMelisSpectrumZone(6, 6), "balanced");
  assert.equal(getMelisSpectrumZone(0, 0), "balanced");
  // Bir birimlik fark bile bolgeyi cevirir: ara bant yok.
  assert.equal(getMelisSpectrumZone(7, 6), "approval");
  assert.equal(getMelisSpectrumZone(6, 7), "stress");
});

test("gosterge bolgesi sunucunun uyguladigi etkiyle ortusur", () => {
  for (let approval = 0; approval <= 12; approval += 1) {
    for (let stress = 0; stress <= 12; stress += 1) {
      const { room, tower } = melisRoom(approval, stress);
      const zone = getMelisSpectrumZone(approval, stress);

      assert.equal(
        room.isMelisStressDominant(tower),
        zone === "stress",
        `onay ${approval} / stres ${stress}: stres etkileri gosterge ile ortusmuyor`
      );
      assert.equal(
        room.isMelisApprovalDominant(tower),
        zone === "approval",
        `onay ${approval} / stres ${stress}: onay etkileri gosterge ile ortusmuyor`
      );
    }
  }
});

test("eski genis dengeli bant artik yanlis bilgi vermiyor", () => {
  // Eski kural stres oranini kullaniyordu ve 0.32-0.68 arasini "dengeli"
  // sayiyordu. Bu araliktaki bir degeri secip gostergenin artik gercegi
  // soyledigini dogruluyoruz.
  const approval = 9;
  const stress = 11;
  const eskiOran = stress / (approval + stress);
  assert.ok(eskiOran > 0.32 && eskiOran < 0.68, "ornek eski dengeli bandin icinde olmali");

  const { room, tower } = melisRoom(approval, stress);
  assert.equal(getMelisSpectrumZone(approval, stress), "stress");
  assert.equal(room.isMelisStressDominant(tower), true, "stres etkileri calismali");
});

test("bolge Melis disindaki karakterlerde uygulanmaz", () => {
  const room = createRoom("warrior");
  const definition = towerCatalog.warrior.find((tower) => tower.id === "warrior-1");
  const spot = findBuildableSpot(room, definition.id);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: definition.id });
  const tower = [...room.towers.values()][0];

  const player = room.state.players.get("p1");
  player.approval = 0;
  player.stress = 40;

  assert.equal(room.isMelisStressDominant(tower), false);
  assert.equal(room.isMelisApprovalDominant(tower), false);
});
