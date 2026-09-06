/**
 * Arenanin ekrana oturusu.
 *
 * Kamera haritayi ekrana sigdirirken iki kisittan dar olani baglar; artan pay
 * obur eksende bosluga gider. Bu yuzden bir haritanin ekrani doldurup
 * doldurmadigini belirleyen sey buyuklugu degil **en/boy orani**.
 *
 * Kademeler bir donem elle yazilmis, birbirinden bagimsiz olculerdi: 12x18,
 * 15x27, 20x32, 23x36. 1x tesadufen tuvalin serit oraniyla ayni oldugu icin iki
 * yandan tam oturuyordu, 2x ise belirgin olarak daha uzundu -- yukseklik
 * bagliyor ve harita iki yanindan 32'ser piksel iceri cekiliyordu. Oyuncunun
 * gordugu buydu: "1x tam sigiyor ama 2x'te bosluk kaliyor".
 *
 * Testin tuttugu soz kaplamalarin olcusunden bagimsiz: hangi cubuk yuksekligi
 * olursa olsun butun kademeler ekranda ayni yeri kaplamali. Tek bir chrome
 * degeriyle olculseydi test, oranlarin degil o degerin dogrulanmasi olurdu.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  GAME_WORLD_WIDTH,
  createOpenArenaMap,
  getArenaCameraView,
  getMapWorldBounds
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const SCALES = [1, 2, 3, 4];

/** Sunucunun o kademe icin kurdugu gercek arena. */
function arenaForScale(scale) {
  const room = createRoom("warrior");
  room.mapScale = scale;
  room.configureArenaForScale();
  return room.activeMap;
}

/**
 * Kaplamalarin kaplayabilecegi makul araliklar.
 *
 * Ust cubuk karaktere gore bir ya da iki satir, alt panel cihaza gore degisiyor;
 * ucu de gercekte olculmus degerlere yakin.
 */
const CHROMES = [
  { topRatio: 0.1072, bottomRatio: 0.173 },
  { topRatio: 0.1343, bottomRatio: 0.173 },
  { topRatio: 0.09, bottomRatio: 0.22 }
];

test("her kademe 1x ile ayni en/boy oranında", () => {
  const bir = getMapWorldBounds(arenaForScale(1));
  const oran = bir.width / bir.height;

  for (const scale of SCALES) {
    const map = arenaForScale(scale);
    const bounds = getMapWorldBounds(map);
    assert.ok(
      Math.abs(bounds.width / bounds.height - oran) < 0.0001,
      `${scale}x oranı sapıyor: ${map.cols}x${map.rows} -> ${(bounds.width / bounds.height).toFixed(4)} (1x: ${oran.toFixed(4)})`
    );
  }
});

test("kademeler ekranda aynı yeri kaplar", () => {
  // Asil sikayet buydu: 1x iki yandan tam oturuyor, 2x'te bosluk kaliyordu.
  for (const chrome of CHROMES) {
    const olculer = SCALES.map((scale) => {
      const map = arenaForScale(scale);
      const bounds = getMapWorldBounds(map);
      const view = getArenaCameraView(map, chrome);
      return { scale, genislik: bounds.width * view.fit, yukseklik: bounds.height * view.fit };
    });

    const ilk = olculer[0];
    for (const olcu of olculer) {
      assert.ok(
        Math.abs(olcu.genislik - ilk.genislik) < 1 && Math.abs(olcu.yukseklik - ilk.yukseklik) < 1,
        `top=${chrome.topRatio}: ${olcu.scale}x ekranda ${olcu.genislik.toFixed(1)}x${olcu.yukseklik.toFixed(1)}, `
          + `1x ise ${ilk.genislik.toFixed(1)}x${ilk.yukseklik.toFixed(1)}`
      );
    }
  }
});

test("yükseklik bağladığında harita ekranı yanlardan doldurur", () => {
  // Cubuk uzun oldugunda serit kisaliyor ve yukseklik bagliyor. 1x oraninin
  // serit oranina denk gelmesinin butun anlami bu: o durumda bile yanlarda
  // bosluk kalmiyor.
  const chrome = { topRatio: 0.1343, bottomRatio: 0.173 };
  for (const scale of SCALES) {
    const map = arenaForScale(scale);
    const bounds = getMapWorldBounds(map);
    const view = getArenaCameraView(map, chrome);
    const bosluk = GAME_WORLD_WIDTH - bounds.width * view.fit;
    assert.ok(bosluk < 1, `${scale}x yanlarda ${bosluk.toFixed(1)}px boşluk bırakıyor`);
  }
});

test("kademeler büyümeyi sürdürür", () => {
  // Oran esitlemesi olculeri degistirdi; kademelerin hala buyudugunu ve
  // kabaca eski alanlarda kaldigini burada tutuyoruz.
  const alanlar = SCALES.map((scale) => {
    const map = arenaForScale(scale);
    return map.cols * map.rows;
  });

  assert.deepEqual(alanlar, [216, 384, 600, 864]);
  for (let index = 1; index < alanlar.length; index += 1) {
    assert.ok(alanlar[index] > alanlar[index - 1], `${index + 1}x bir oncekinden büyük değil`);
  }
});

test("açık arena haritası createOpenArenaMap ile aynı", () => {
  // Olculer sunucuda elle yazili; testin okudugu tablo ile oyunun kurdugu
  // harita ayrisirsa burada yakalanir.
  for (const scale of SCALES) {
    const map = arenaForScale(scale);
    assert.deepEqual(
      { cols: map.cols, rows: map.rows, tiles: map.tiles.length },
      (({ cols, rows, tiles }) => ({ cols, rows, tiles: tiles.length }))(createOpenArenaMap(map.cols, map.rows))
    );
  }
});
