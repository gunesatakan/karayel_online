/**
 * Onay/stres ekonomisi.
 *
 * Mekanizmanin amaci bir tercih olusturmak: onay favori kuleleri buyutur, stres
 * evrim satin alir, ve onde giden taraf eridigi icin ikisinden birine yerlesmek
 * mumkun degildir. Eski surumde evrim esigi bir orandi ve onay hicbir zaman
 * azalmadigi icin iyi oynayan oyuncu 20 dalgada tek evrim goremiyor, hic seri
 * yapmayan oyuncu ise dalga 10'da ucunu birden aciyordu. Testler hem yeni
 * kurallari hem de asil hedefi -- bari yoneten oyuncunun kazanmasini -- sabitler.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MELIS_EVOLUTION_STRESS_COSTS,
  getMelisEvolutionStressCost,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function melisRoom(towerCount = 1) {
  const room = createRoom("archer");
  const player = room.state.players.get("p1");
  player.characterId = "archer";
  player.approval = 6;
  player.stress = 6;
  player.currentWaveApproval = 0;
  player.lastWaveApproval = -1;
  player.melisStance = "approval";

  const towers = [];
  for (let index = 0; index < towerCount; index += 1) {
    const definitionId = towerCatalog.archer[index % 3].id;
    const spot = findBuildableSpot(room, definitionId);
    assert.ok(spot, `${definitionId} icin yer bulunamadi`);
    room.placeTower(client, { ...spot, definitionId });
  }
  for (const tower of room.towers.values()) towers.push(tower);
  return { room, player, towers };
}

test("evrim sabit strese mal olur ve stresten dusulur", () => {
  const { room, player, towers } = melisRoom();
  player.stress = 100;
  const oncekiOnay = player.approval;

  assert.equal(room.evolveMelisTower("p1", player, towers[0].id), true, "evrim acilmadi");
  assert.equal(towers[0].melisEvolutionLevel, 1);
  assert.equal(player.stress, 100 - MELIS_EVOLUTION_STRESS_COSTS[0], "bedel stresten dusulmedi");
  assert.equal(player.approval, oncekiOnay, "evrim onaya dokunmamali");
});

test("bedeller kademe kademe artar ve ucu de odenebilir", () => {
  const { room, player, towers } = melisRoom();
  player.stress = 1000;

  for (let level = 1; level <= 3; level += 1) {
    const oncekiStres = player.stress;
    assert.equal(room.evolveMelisTower("p1", player, towers[0].id), true, `${level}. evrim acilmadi`);
    assert.equal(oncekiStres - player.stress, getMelisEvolutionStressCost(level), `${level}. evrimin bedeli yanlis`);
  }

  assert.equal(towers[0].melisEvolutionLevel, 3);
  assert.equal(room.evolveMelisTower("p1", player, towers[0].id), false, "dorduncu evrim acilmamali");
  for (let level = 1; level < 3; level += 1) {
    assert.ok(getMelisEvolutionStressCost(level + 1) > getMelisEvolutionStressCost(level), "bedeller artmiyor");
  }
});

test("stres yetmezse evrim acilmaz ve hicbir sey harcanmaz", () => {
  const { room, player, towers } = melisRoom();
  player.stress = MELIS_EVOLUTION_STRESS_COSTS[0] - 1;

  assert.equal(room.evolveMelisTower("p1", player, towers[0].id), false);
  assert.equal(towers[0].melisEvolutionLevel, 0);
  assert.equal(player.stress, MELIS_EVOLUTION_STRESS_COSTS[0] - 1);
});

test("onay baskinken de evrim alinabilir", () => {
  // Eski kural evrimi "stres > onay" sartina bagliyordu; onay hic azalmadigi
  // icin iyi oynayan oyuncu bu kapiyi hic acamiyordu.
  const { room, player, towers } = melisRoom();
  player.approval = 80;
  player.stress = MELIS_EVOLUTION_STRESS_COSTS[0];

  assert.ok(player.approval > player.stress, "kurulum onay baskin olmali");
  assert.equal(room.evolveMelisTower("p1", player, towers[0].id), true, "onay baskinken evrim reddedildi");
});

test("durus serinin hangi tarafa yazilacagini belirler", () => {
  const { room, player } = melisRoom();

  room.awardMelisSpectrum("p1", 3);
  assert.equal(player.approval, 9, "onay durusunda seri onaya yazilmadi");
  assert.equal(player.stress, 6);

  room.setMelisStance(client, { stance: "stress" });
  room.awardMelisSpectrum("p1", 4);
  assert.equal(player.stress, 10, "stres durusunda seri strese yazilmadi");
  assert.equal(player.approval, 9, "stres durusu onayi buyutmemeli");

  // Iki durusta da dalga ici hareketlilik olculur: ceza yonlendirmeye bakmaz.
  assert.equal(player.currentWaveApproval, 7);
});

test("gecersiz durus istegi yok sayilir", () => {
  const { room, player } = melisRoom();
  room.setMelisStance(client, { stance: "hepsi" });
  room.setMelisStance(client, {});
  assert.equal(player.melisStance, "approval");
});

test("onde giden taraf her dalga erir, geride kalan yukselmez", () => {
  const { room, player } = melisRoom();
  player.approval = 40;
  player.stress = 10;
  player.currentWaveApproval = 1;
  player.lastWaveApproval = 1;

  room.applyMelisWaveStress();

  assert.ok(player.approval < 40, "onde giden taraf erimedi");
  assert.ok(player.approval > player.stress, "erime lideri geride birakti");
  assert.equal(player.stress, 10, "geride kalan taraf bedavaya yukselmis");
});

test("erime uclari park yeri olmaktan cikarir", () => {
  const { room, player } = melisRoom();
  player.approval = 60;
  player.stress = 6;

  // Oyuncu hicbir sey yapmazsa lider surekli geri cekilir.
  for (let wave = 0; wave < 8; wave += 1) {
    player.currentWaveApproval = 1;
    player.lastWaveApproval = 1;
    room.applyMelisWaveStress();
  }

  assert.ok(player.approval < 40, `onay erimedi: ${player.approval}`);
});

test("bari yoneten oyuncu, uca yerlesenden ustun cikar", () => {
  // Tasarimin asil hedefi bu: 20 dalga boyunca ayni oyun gucunde uc oyuncu --
  // biri hep onayda, biri hep streste, biri ihtiyaca gore ceviren.
  const oyna = (stanceAt) => {
    const { room, player, towers } = melisRoom(1);
    const tower = towers[0];

    for (let wave = 1; wave <= 20; wave += 1) {
      const streaks = wave <= 5 ? 2 : wave <= 12 ? 4 : 6;
      room.setMelisStance(client, { stance: stanceAt(player, tower) });
      room.awardMelisSpectrum("p1", streaks);
      while (room.evolveMelisTower("p1", player, tower.id)) {
        // Karsilanabilen her evrim alinir.
      }
      room.applyMelisWaveStress();
    }

    return { evrim: tower.melisEvolutionLevel, onay: player.approval };
  };

  const hepOnay = oyna(() => "approval");
  const hepStres = oyna(() => "stress");
  const yoneten = oyna((player, tower) => {
    const cost = getMelisEvolutionStressCost(tower.melisEvolutionLevel + 1);
    return cost > 0 && player.stress < cost ? "stress" : "approval";
  });

  assert.equal(hepOnay.evrim, 0, "onaya yerlesen oyuncu evrim almamali");
  assert.ok(yoneten.evrim > hepOnay.evrim, "yoneten oyuncu evrimde onde olmali");
  assert.ok(
    yoneten.onay > hepStres.onay,
    `yoneten oyuncu onayda da onde olmali (${yoneten.onay.toFixed(1)} vs ${hepStres.onay.toFixed(1)})`
  );
  assert.ok(yoneten.evrim >= hepStres.evrim, "yoneten oyuncu evrimde geri kalmamali");
});
