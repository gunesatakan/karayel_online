/**
 * Tuvalin kac piksel cizecegi.
 *
 * Olcek bir donem `min(devicePixelRatio, 2)` sabitiydi ve "cihaz pikseli / CSS
 * pikseli" oranini "cihaz pikseli / dunya birimi" yerine koyuyordu. Telefonda
 * ikisi ayni sey oldugu icin fark edilmiyordu; masaustunde 390 birimlik dunya
 * 1440 piksellik pencereye yayilinca tuval 390 piksel kalip 1440'a geriliyor ve
 * goruntu bulaniyordu.
 *
 * Buradaki en onemli soz **dokunmatik tarafin hic degismedigi**: telefon ve
 * tabletler, hangi genislikte ve hangi yonde olursa olsun, eski hesabin
 * birebir aynisini almali. Ekrani birebir kaplamak oralarda doldurma yukunu
 * artirmak demek ve o tavan bilerek indirilmisti.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  GAME_WORLD_WIDTH,
  MAX_RENDER_CANVAS_WIDTH,
  MAX_TOUCH_RENDER_SCALE,
  getRenderScale
} from "../packages/shared/dist/index.js";

/** Degisiklikten onceki hesap; dokunmatik tarafta hala gecerli olmali. */
const eskiHesap = (dpr) => Math.min(Math.max(1, dpr), 2);

const TELEFONLAR = [
  { ad: "iPhone 14", hostWidth: 390, devicePixelRatio: 3 },
  { ad: "iPhone SE", hostWidth: 375, devicePixelRatio: 2 },
  { ad: "iPhone Pro Max", hostWidth: 430, devicePixelRatio: 3 },
  { ad: "Android orta segment", hostWidth: 412, devicePixelRatio: 2.625 },
  { ad: "Android giris segmenti", hostWidth: 360, devicePixelRatio: 1.5 },
  { ad: "telefon yatay", hostWidth: 844, devicePixelRatio: 3 },
  { ad: "tablet", hostWidth: 768, devicePixelRatio: 2 }
];

test("dokunmatik cihazlarda olcek eski hesabin birebir aynisi", () => {
  for (const cihaz of TELEFONLAR) {
    assert.equal(
      getRenderScale({ ...cihaz, finePointer: false }),
      eskiHesap(cihaz.devicePixelRatio),
      `${cihaz.ad} olcegi degisti`
    );
  }
});

test("dokunmatik tavan gecilmez, genislik ne olursa olsun", () => {
  for (const hostWidth of [320, 390, 430, 1024, 2560]) {
    const olcek = getRenderScale({ hostWidth, devicePixelRatio: 4, finePointer: false });
    assert.equal(olcek, MAX_TOUCH_RENDER_SCALE, `${hostWidth} genisliginde tavan asildi`);
  }
});

test("fare kullanan cihazda tuval ekrani birebir kaplar", () => {
  // Sikayetin olculdugu durum: 1440x900 pencere, dpr 1. Once tuval 390 piksel
  // genisligindeydi ve 1440'a geriliyordu -- 3,69 kat buyutme.
  const olcek = getRenderScale({ hostWidth: 1440, devicePixelRatio: 1, finePointer: true });
  assert.ok(Math.abs(GAME_WORLD_WIDTH * olcek - 1440) < 1e-9, "tuval pencere genisligine oturmuyor");
});

test("dar bir masaustu penceresinde eski deger korunur", () => {
  // Pencere dunya genisliginden dar oldugunda kaplama olcegi 1'in altina duser;
  // eski degerin altina inmek cozunurlugu dusurmek olurdu.
  const olcek = getRenderScale({ hostWidth: 300, devicePixelRatio: 1, finePointer: true });
  assert.equal(olcek, 1);
});

test("olcek fare tarafinda da hicbir zaman eski degerin altina inmez", () => {
  for (const hostWidth of [200, 390, 800, 1440, 3840]) {
    for (const devicePixelRatio of [1, 1.5, 2, 3]) {
      const yeni = getRenderScale({ hostWidth, devicePixelRatio, finePointer: true });
      assert.ok(yeni >= eskiHesap(devicePixelRatio) - 1e-9, `${hostWidth}@${devicePixelRatio} geriledi`);
    }
  }
});

test("cok buyuk ekranlarda tuval genisligi tavana vurur", () => {
  // 4K + retina: kaplama olcegi 19'a cikardi, tuval 33 megapiksel olurdu.
  const olcek = getRenderScale({ hostWidth: 3840, devicePixelRatio: 2, finePointer: true });
  assert.equal(GAME_WORLD_WIDTH * olcek, MAX_RENDER_CANVAS_WIDTH);
});
