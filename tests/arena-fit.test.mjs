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

/**
 * Dunya yuksekligi artik cihazdan geliyor.
 *
 * Tuval ekranin oranini aliyor -- almazsa Phaser'in FIT olcegi farki iki yanda
 * siyah bant olarak birakiyor. Yani serit her cihazda baska oranda ve hicbir
 * sabit harita orani hepsini birden dolduramaz.
 *
 * Testin tuttugu soz o yuzden "bosluk yok" degil: kademeler arasinda **fark
 * yok**. Oyuncunun sikayeti zaten buydu -- 1x tam oturup 2x'in oturmamasi.
 */
test("cihaz oranı ne olursa olsun kademeler arasında fark yok", () => {
  const chrome = { topRatio: 0.126, bottomRatio: 0.19 };
  // Sirasiyla: tasarim orani, iPhone'da Safari (kisa), genis bir tablet.
  for (const world of [{ width: 390, height: 844 }, { width: 390, height: 709 }, { width: 390, height: 560 }]) {
    const olculer = SCALES.map((scale) => {
      const map = arenaForScale(scale);
      const bounds = getMapWorldBounds(map);
      const view = getArenaCameraView(map, chrome, world);
      return { scale, genislik: bounds.width * view.fit, yukseklik: bounds.height * view.fit };
    });

    const ilk = olculer[0];
    for (const olcu of olculer) {
      assert.ok(
        Math.abs(olcu.genislik - ilk.genislik) < 1 && Math.abs(olcu.yukseklik - ilk.yukseklik) < 1,
        `dünya ${world.height}: ${olcu.scale}x ekranda ${olcu.genislik.toFixed(1)}x${olcu.yukseklik.toFixed(1)}, `
          + `1x ise ${ilk.genislik.toFixed(1)}x${ilk.yukseklik.toFixed(1)}`
      );
    }
  }
});

/**
 * Haritanin buyuklugunu dunyanin yuksekligi belirlemiyor.
 *
 * Bunu yanlis kurmustum: tuvali ekrana yaymanin haritayi da buyutecegini
 * sandim. Buyutmuyor. Dunya kisaldiginda serit dunya biriminde daralir ama
 * ayni birim ekranda o oranda **buyur**; ikisi birbirini goturur.
 *
 * Yani tuvali yaymanin kazanci siyah bantlarin gitmesi -- ust cubuk ve panel
 * artik ekranin tamamini kullaniyor. Haritanin buyumesi baska bir seye bagli:
 * kaplamanin kisalmasina.
 */
test("dünya yüksekliği haritanın ekrandaki boyunu değiştirmez", () => {
  const chrome = { topRatio: 0.126, bottomRatio: 0.19 };
  const map = arenaForScale(1);
  const bounds = getMapWorldBounds(map);
  const EKRAN_YUKSEKLIK = 714;

  /**
   * Dunya birimini ekran pikseline cevirir.
   *
   * Cevrim yatay genislikten yapilamaz: tuval eskiden ekrani doldurmuyordu
   * (330px yerine 393px) ve iki durumu ayni carpanla olcmek yanlis cikariyor --
   * bu testi ilk yazdigimda tam olarak bu hataya dustum. Dikeyde ise tuval her
   * iki durumda da ekrani kapliyor, yani dogru carpan bu.
   */
  const ekrandaPiksel = (world) => {
    const view = getArenaCameraView(map, chrome, world);
    return bounds.width * view.fit * (EKRAN_YUKSEKLIK / world.height);
  };

  const uzun = ekrandaPiksel({ width: 390, height: 844 });
  const kisa = ekrandaPiksel({ width: 390, height: 709 });
  assert.ok(
    Math.abs(uzun - kisa) < 1,
    `dünya yüksekliği ekrandaki boyu değiştirdi: ${uzun.toFixed(1)}px vs ${kisa.toFixed(1)}px`
  );
});

test("kaplama kısaldıkça harita büyür", () => {
  // Oyuncunun "harita minicik" dedigi seyin tek caresi bu: ust cubuk ve alt
  // panel ne kadar kisalirsa haritaya o kadar yer kaliyor.
  const world = { width: 390, height: 709 };
  const map = arenaForScale(1);
  const bounds = getMapWorldBounds(map);
  const genislik = (chrome) => bounds.width * getArenaCameraView(map, chrome, world).fit;

  // Ust cubuk iki satirdan tek satira indi (109px -> 90px), panel ise henuz
  // ayni. Sonraki adim paneli tek satira indirmek.
  const ikiSatirlikCubuk = genislik({ topRatio: 0.1527, bottomRatio: 0.19 });
  const tekSatirlikCubuk = genislik({ topRatio: 0.126, bottomRatio: 0.19 });
  const tekSatirlikPanel = genislik({ topRatio: 0.126, bottomRatio: 0.08 });

  assert.ok(tekSatirlikCubuk > ikiSatirlikCubuk, `çubuk kısalınca harita büyümedi: ${tekSatirlikCubuk.toFixed(1)} <= ${ikiSatirlikCubuk.toFixed(1)}`);
  assert.ok(tekSatirlikPanel > tekSatirlikCubuk, `panel kısalınca harita büyümedi: ${tekSatirlikPanel.toFixed(1)} <= ${tekSatirlikCubuk.toFixed(1)}`);
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
